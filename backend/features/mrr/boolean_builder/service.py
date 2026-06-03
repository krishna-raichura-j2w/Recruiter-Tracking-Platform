"""
Boolean-string builder for Naukri sourcing.

Reuses the platform's existing Azure OpenAI client (configured via the same
env vars as features/jd_extract). The system prompt + strictness instructions
are adapted from the standalone Naukri Boolean Builder tool.
"""

import io
import json
import os
import re
from typing import Any

from core.ai_service import chat_ai
from docx import Document
from pypdf import PdfReader


SYSTEM_PROMPT = """You are a senior technical recruiter with 10+ years sourcing candidates on Naukri.com India.

CORE TRUTH: Candidates write resumes in their own words, not the JD's words. Your boolean
string must match how Indian candidates actually describe themselves on Naukri.

═══════════════════════════════════════
STEP 1 — EXTRACT SKILLS
═══════════════════════════════════════
Extract skills/technologies from the JD. Classify each (skip spoken languages unless explicitly required):
- "must": Clearly required (mandatory section, repeated, listed prominently)
- "good": Preferred / nice-to-have ("familiarity", "exposure", "plus", "bonus", "good to have")

═══════════════════════════════════════
STEP 2 — ASSESS RESUME COVERAGE FOR EACH MUST-HAVE SKILL
═══════════════════════════════════════
For every must-have skill, ask two questions:
  Q1. Would Indian candidates write this exact term on their Naukri resume? (YES / PARTIAL / NO)
  Q2. How many candidates in India realistically have this on their profile? (HIGH / MEDIUM / LOW)

COVERAGE HIGH + candidates write it directly → use the term as-is with standard abbreviations.
COVERAGE MEDIUM / niche → keep the primary term AND add 2-3 alternate phrasings candidates use.
COVERAGE LOW → keep the exact term AND add its parent category as a wide-net fallback.

BANNED — never use these in the boolean string:
✗ Full sentences from the JD
✗ Threshold/criteria phrases ("Typing speed", "2+ years experience")
✗ Vague capability phrases ("strong troubleshooting", "hardware knowledge")
✗ Generic soft skills ("problem-solving", "team player")
✗ Long brand+product strings ("Lenovo Legion gaming laptop")
✗ Composite job titles ("gaming support", "gaming technical support")
✗ Generic language phrases ("regional language", "local language") — use actual names only
✗ Any phrase containing the word "experience" — it is always JD language, never resume language

ALLOWED resume-language terms:
✓ Short tech/skill names: GPU, CPU, BIOS, Steam, "Windows 11", "graphic card"
✓ Domain terms: gaming, gamer, "gaming PC", FPS
✓ Job function terms: "technical support", "customer support", "L1 support"
✓ Languages as single words: Hindi, English, Telugu, Tamil

═══════════════════════════════════════
STEP 3 — BUILD THE BOOLEAN STRING
═══════════════════════════════════════
TIER 1 — CORE MUST-HAVES (3-5 blocks joined with AND):
  Each block: (primary_term OR fallback1 OR fallback2)
  Every block in its own parentheses.

BLOCK ORDER: most domain-specific first, generic job-function last.

PARENTHESES:
  CORRECT: (A OR B) AND (C OR D) AND (E OR F)
  WRONG:   A OR B AND C OR D

OTHER RULES:
- Multi-word phrases MUST be in double quotes; single words don't need quotes.
- Final string MUST be ≤ 500 characters.
- Do NOT use NOT, wildcards, or field operators.

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return ONLY a JSON object — no preamble, no markdown fences:
{
  "job_title": "<short job title inferred from JD, '' if unknown>",
  "experience_required": "<e.g. '3-5 years', '2+ years', 'Fresher', '' if unknown>",
  "skills": [
    {
      "name": "<short resume-language skill name>",
      "type": "must|good",
      "rarity": "common|niche|rare",
      "coverage": "high|medium|low",
      "synonyms": ["<resume-language fallback terms>"],
      "evidence": "<short direct quote from JD, max 12 words>"
    }
  ],
  "boolean_string": "<properly parenthesised boolean query, ≤500 chars>",
  "boolean_char_count": <integer>,
  "reasoning": "<2-3 sentences on coverage assessment and how niche terms were expanded>"
}"""


STRICTNESS_INSTRUCTIONS: dict[int, str] = {
    1: """
=== STRICTNESS LEVEL 1 (VERY BROAD) ===
STRUCTURE: 2-3 AND blocks, 5-7 synonyms per block. Include top 2 good-to-haves.
VOCABULARY: Use broad CATEGORY words ("support" not "technical support"; "Windows" not "Windows 11"; "hardware" not "GPU").
""",
    2: """
=== STRICTNESS LEVEL 2 (BROAD) ===
STRUCTURE: 3 AND blocks, 4-5 synonyms per block. Include top 1 good-to-have.
VOCABULARY: Slightly more specific than level 1 but still favour breadth. Avoid version-specific terms.
""",
    3: """
=== STRICTNESS LEVEL 3 (BALANCED, DEFAULT) ===
STRUCTURE: 4-5 AND blocks, 2-3 synonyms per block. Exclude good-to-haves unless under 3 must-have blocks.
VOCABULARY: Natural resume-language terms a mid-level Indian candidate would write.
""",
    4: """
=== STRICTNESS LEVEL 4 (STRICT) ===
STRUCTURE: 5-6 AND blocks. 1-2 synonyms max. EXCLUDE good-to-haves.
VOCABULARY: Simplest, most direct form. Prefer single words. No padding.
""",
    5: """
=== STRICTNESS LEVEL 5 (VERY STRICT) ===
STRUCTURE: 6-7 AND blocks. ZERO synonyms for common terms; ONE only for rare/niche.
VOCABULARY: Single word per skill wherever possible. Minimal checklist style.
""",
}


# ── helpers ───────────────────────────────────────────────────────────────────
EXPERIENCE_PATTERNS = [
    r"\b\d+\s*(?:\+|plus)?\s*(?:to|-|–)\s*\d+\s*(?:years?|yrs?)\b",
    r"\b(?:minimum|min)\s+\d+\s*(?:\+|plus)?\s*(?:years?|yrs?)\b",
    r"\b\d+\s*(?:\+|plus)\s*(?:years?|yrs?)\b",
    r"\b\d+\s*(?:years?|yrs?)\b",
    r"\bfresher[s]?\b",
]


def _enforce_500_char_limit(s: str) -> str:
    if len(s) <= 500:
        return s
    blocks = s.split(" AND ")
    while len(blocks) > 1:
        blocks.pop()
        candidate = " AND ".join(blocks)
        if len(candidate) <= 500:
            return candidate
    return blocks[0][:500]


def _extract_first_json(text: str) -> dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("Model did not return valid JSON.")
    return json.loads(match.group(0))


def _normalize_skills(raw: list) -> list[dict[str, Any]]:
    out, seen = [], set()
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        st = str(item.get("type", "good")).strip().lower()
        if st not in ("must", "good"):
            st = "good"
        rar = str(item.get("rarity", "common")).strip().lower()
        if rar not in ("common", "niche", "rare"):
            rar = "common"
        cov = str(item.get("coverage", "high")).strip().lower()
        if cov not in ("high", "medium", "low"):
            cov = "high"
        syns = item.get("synonyms", []) or []
        if not isinstance(syns, list):
            syns = []
        syns = [str(x).strip() for x in syns if str(x).strip()]
        out.append(
            {
                "name": name,
                "type": st,
                "rarity": rar,
                "coverage": cov,
                "synonyms": syns,
                "evidence": str(item.get("evidence", "")).strip(),
            },
        )
    out.sort(key=lambda s: (0 if s["type"] == "must" else 1, s["name"].lower()))
    return out


def _find_experience(text: str) -> str:
    text = text.replace("\n", " ")
    for pattern in EXPERIENCE_PATTERNS:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            return re.sub(r"\s+", " ", m.group(0)).strip()
    return ""


def _clean_title(title: str) -> str:
    v = re.sub(r"\s+", " ", title).strip(" -|:,;")
    if not v:
        return ""
    # strip embedded experience
    while True:
        match = None
        for pattern in EXPERIENCE_PATTERNS:
            m = re.search(pattern, v, flags=re.IGNORECASE)
            if m:
                match = m
                break
        if not match:
            break
        v = (v[: match.start()] + " " + v[match.end() :]).strip()
        v = re.sub(r"\s+", " ", v)
    v = re.sub(r"\b(?:experience|exp)\b\s*[:\-]?", "", v, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", v).strip(" -|:,;")


def _title_fallback(jd_text: str) -> str:
    lines = [ln.strip() for ln in jd_text.splitlines() if ln.strip()]
    if not lines:
        return ""
    pat = re.compile(
        r"^(?:job\s*title|position|role)\s*[:\-]\s*(.+)$",
        flags=re.IGNORECASE,
    )
    for line in lines[:12]:
        m = pat.match(line)
        if m:
            return _clean_title(m.group(1).strip())[:80]
    for line in lines[:8]:
        low = line.lower()
        if (
            len(line) <= 80
            and not line.endswith(":")
            and "experience" not in low
            and "years" not in low
        ):
            return _clean_title(line)
    return _clean_title(lines[0])[:80]


# ── file parsers (reused pattern from jd_extract) ─────────────────────────────
def extract_text_from_pdf(data: bytes) -> str:
    pages = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages]
    return "\n".join(pages).strip()


def extract_text_from_docx(data: bytes) -> str:
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


# ── main entry ────────────────────────────────────────────────────────────────
def build_boolean(jd_text: str, strictness: int = 3) -> dict[str, Any]:
    strictness = max(1, min(5, strictness))
    system = SYSTEM_PROMPT + STRICTNESS_INSTRUCTIONS.get(strictness, "")

    raw = chat_ai(
        messages=[{"role": "user", "content": f"Job Description:\n\n{jd_text}"}],
        system_prompt=system,
        max_tokens=2048,
        json_mode=True,
    )
    payload = _extract_first_json(raw)

    skills = _normalize_skills(payload.get("skills", []))
    job_title = str(payload.get("job_title", "")).strip() or _title_fallback(jd_text)
    experience_required = str(
        payload.get("experience_required", ""),
    ).strip() or _find_experience(jd_text)
    boolean_string = _enforce_500_char_limit(
        str(payload.get("boolean_string", "")).strip(),
    )
    job_title = _clean_title(job_title)

    return {
        "job_title": job_title,
        "experience_required": experience_required,
        "skills": skills,
        "boolean_string": boolean_string,
        "boolean_char_count": len(boolean_string),
        "reasoning": str(payload.get("reasoning", "")).strip(),
        "strictness": strictness,
    }
