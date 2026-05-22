"""Generate a skill-based interview questionnaire PDF for a job."""
import json
import logging
import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from core.ai_service import call_ai
from fpdf import FPDF

log = logging.getLogger(__name__)

LOGO_PATH = Path(__file__).parent.parent.parent.parent / "static" / "logo.jpg"

# ── LLM prompt ────────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a principal-level technical interviewer with 15+ years of experience "
    "hiring senior engineers. Generate precise, role-specific interview questions "
    "with substantive model answers that reveal genuine depth of knowledge. "
    "Never produce generic or vague questions."
)

_PROMPT = """Generate exactly 5 interview questions with 2-sentence model answers for a {role_title} role at {client_name}.
Focus specifically on: {skill}

Role context:
- Role: {role_title} at {client_name}
- Skill under test: {skill}
- Full tech stack: {skill_stack}
{summary_section}{notes_section}
Difficulty (return exactly this many):
- 2 EASY   - fundamental concepts, syntax, how-it-works; a capable junior should answer these
- 2 MEDIUM - practical judgment: debugging, design choices, trade-offs, real-world scenarios
- 1 HARD   - expert-level: system design, performance internals, architectural trade-offs specific to {skill}

Answer format (2 sentences each):
- Sentence 1: The core technical point the candidate must articulate clearly.
- Sentence 2: A specific detail, edge case, or nuance that separates an expert from an average candidate.

Rules:
1. Every question must be directly about {skill} — not generic engineering questions.
2. Questions must fit the seniority level of {role_title}.
3. No vague questions ("Explain X" or "Tell me about Y"). Be specific and scenario-based.
4. HARD question must genuinely require deep expertise — a developer who only knows basics cannot answer it.

Return ONLY valid JSON, no markdown fences, no explanation:
{{
  "easy": [
    {{"q": "<specific question 1>", "a": "<sentence 1>. <sentence 2>."}},
    {{"q": "<specific question 2>", "a": "<sentence 1>. <sentence 2>."}}
  ],
  "medium": [
    {{"q": "<specific question 1>", "a": "<sentence 1>. <sentence 2>."}},
    {{"q": "<specific question 2>", "a": "<sentence 1>. <sentence 2>."}}
  ],
  "hard": [
    {{"q": "<specific question 1>", "a": "<sentence 1>. <sentence 2>."}}
  ]
}}"""


def _parse_skills(skill_stack: str) -> list[str]:
    raw = re.split(r"[,;\n|/]", skill_stack or "")
    return [s.strip() for s in raw if s.strip()]


def _generate_for_skill(skill: str, job, notes: str | None = None) -> dict:
    summary_section = (
        f"- Job Summary: {job.jd_summary}\n" if getattr(job, "jd_summary", None) else ""
    )
    notes_section = (
        f"- Interviewer Focus Points: {notes}\n" if notes else ""
    )
    prompt = _PROMPT.format(
        role_title=job.role_title,
        client_name=job.client_name,
        skill=skill,
        skill_stack=job.skill_stack or skill,
        summary_section=summary_section,
        notes_section=notes_section,
    )
    raw = call_ai(prompt, system_prompt=_SYSTEM)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(raw)


def _generate_questions(job) -> dict:
    """Returns {skill: {easy: [{q,a},...], medium: [...], hard: [...]}}."""
    skills = _parse_skills(job.skill_stack or "")
    if not skills:
        skills = [job.role_title]

    notes = getattr(job, "questionnaire_notes", None)
    result = {}
    for skill in skills:
        try:
            result[skill] = _generate_for_skill(skill, job, notes)
            log.info("Generated questions for skill: %s", skill)
        except Exception:
            log.exception("Failed to generate questions for skill: %s", skill)
    return result


# ── Colour palette ─────────────────────────────────────────────────────────────

_INK          = (15,  23,  42)    # #0F172A  — near-black, main text
_INK_LIGHT    = (51,  65,  85)    # #334155  — slate-700, secondary text
_MUTED        = (100, 116, 139)   # #64748B  — slate-500, captions
_MUTED_LIGHT  = (148, 163, 184)   # #94A3B8  — slate-400, footer
_BORDER       = (226, 232, 240)   # #E2E8F0  — slate-200, dividers
_CANVAS       = (248, 250, 252)   # #F8FAFC  — slate-50, skill header bg

_ACCENT       = (79,  70,  229)   # #4F46E5  — indigo-600, skill heading accent bar

# Difficulty pill colours (text + bg) — soft, not garish
_EASY_TEXT    = (6,   95,  70)    # #065F46  emerald-800
_EASY_BG      = (209, 250, 229)   # #D1FAE5  emerald-100
_MED_TEXT     = (120, 53,  15)    # #78350F  amber-900
_MED_BG       = (254, 243, 199)   # #FEF3C7  amber-100
_HARD_TEXT    = (136, 19,  55)    # #881337  rose-900
_HARD_BG      = (255, 228, 230)   # #FFE4E6  rose-100

_ANS_TEXT     = (13,  148, 136)   # #0D9488  teal-600
_ANS_BG       = (240, 253, 250)   # #F0FDFA  teal-50
_ANS_BORDER   = (153, 246, 228)   # #99F6E4  teal-200


# ── Unicode → Latin-1 safety ───────────────────────────────────────────────────

_LATIN1_TRANSLATIONS = str.maketrans({
    "‘": "'",  "’": "'",   # curly single quotes
    "“": '"',  "”": '"',   # curly double quotes
    "–": "-",  "—": "-",   # en-dash / em-dash
    "−": "-",                   # minus sign
    "…": "...",                 # ellipsis
    "•": "*",  "·": "*",   # bullet / middle dot
    " ": " ",                   # non-breaking space
    "​": "",   "‌": "",    # zero-width chars
    "‍": "",   "﻿": "",
    " ": " ",  " ": " ",   # thin / en space
    "«": '"',  "»": '"',   # guillemets
    "′": "'",  "″": '"',   # primes
    "©": "(c)", "®": "(R)", "™": "(TM)",
    "€": "EUR", "£": "GBP", "¥": "JPY",
    "→": "->", "←": "<-",  "↔": "<->",
})


def _safe(text) -> str:
    if text is None:
        return ""
    s = str(text).translate(_LATIN1_TRANSLATIONS)
    return s.encode("latin-1", errors="replace").decode("latin-1")


# ── PDF class ──────────────────────────────────────────────────────────────────

class _PDF(FPDF):
    """Auto-sanitises all text writes; adds faint watermark + footer."""

    def cell(self, *args, **kwargs):  # type: ignore[override]
        for k in ("text", "txt"):
            if k in kwargs:
                kwargs[k] = _safe(kwargs[k])
        if len(args) >= 3 and isinstance(args[2], str):
            args = (args[0], args[1], _safe(args[2]), *args[3:])
        return super().cell(*args, **kwargs)

    def multi_cell(self, *args, **kwargs):  # type: ignore[override]
        for k in ("text", "txt"):
            if k in kwargs:
                kwargs[k] = _safe(kwargs[k])
        if len(args) >= 3 and isinstance(args[2], str):
            args = (args[0], args[1], _safe(args[2]), *args[3:])
        return super().multi_cell(*args, **kwargs)

    def header(self):
        # Faint watermark on every page
        if LOGO_PATH.exists():
            with self.local_context(fill_opacity=0.05, stroke_opacity=0.05):
                self.image(str(LOGO_PATH), x=45, y=90, w=120)

    def footer(self):
        self.set_y(-13)
        self.set_draw_color(*_BORDER)
        self.line(12, self.get_y(), 198, self.get_y())
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*_MUTED_LIGHT)
        self.set_x(12)
        self.cell(93, 8, "J2W Recruiter Tracking  |  Confidential", align="L")
        self.set_x(105)
        self.cell(93, 8, f"Page {self.page_no()}", align="R")


# ── Cover page ─────────────────────────────────────────────────────────────────

def _cover_page(pdf: _PDF, job, skill_count: int, total_q: int) -> None:
    pdf.add_page()

    # ── Top strip: white with logo ──────────────────────────────────────────
    if LOGO_PATH.exists():
        pdf.image(str(LOGO_PATH), x=12, y=10, w=62)

    # Thin charcoal accent bar at top
    pdf.set_fill_color(*_INK)
    pdf.rect(0, 0, 4, 297, style="F")

    # Title block
    pdf.set_xy(16, 40)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*_INK)
    pdf.cell(180, 12, "Interview Questionnaire", align="L")

    pdf.set_xy(16, 56)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(*_INK_LIGHT)
    pdf.cell(180, 8, f"{job.role_title}  |  {job.client_name}", align="L")

    pdf.set_xy(16, 66)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*_MUTED)
    pdf.cell(180, 6, "AI-Generated Skill Assessment with Model Answers", align="L")

    # Thin divider
    pdf.set_draw_color(*_BORDER)
    pdf.line(16, 76, 198, 76)

    # Meta info
    pdf.set_xy(16, 80)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_MUTED)
    skills_display = (job.skill_stack or "").strip()
    pdf.multi_cell(180, 5, f"Skills: {skills_display}", align="L")
    pdf.set_x(16)
    pdf.cell(88, 5, f"Generated: {datetime.now(timezone.utc).strftime('%d %B %Y')}", align="L")
    pdf.cell(92, 5, f"Sections: {skill_count}   |   Questions: {total_q}", align="L")
    pdf.ln(2)

    # Role summary if present
    if getattr(job, "jd_summary", None):
        pdf.ln(5)
        pdf.set_draw_color(*_BORDER)
        pdf.line(16, pdf.get_y(), 198, pdf.get_y())
        pdf.ln(4)
        pdf.set_x(16)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_INK)
        pdf.cell(180, 5, "Role Summary", align="L")
        pdf.ln(6)
        pdf.set_x(16)
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*_INK_LIGHT)
        pdf.multi_cell(180, 5, (job.jd_summary or "")[:700], align="L")

    # Focus points (if any)
    notes = getattr(job, "questionnaire_notes", None)
    if notes:
        pdf.ln(4)
        pdf.set_draw_color(*_BORDER)
        pdf.line(16, pdf.get_y(), 198, pdf.get_y())
        pdf.ln(4)
        pdf.set_x(16)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_INK)
        pdf.cell(180, 5, "Interviewer Focus Points", align="L")
        pdf.ln(6)
        pdf.set_x(16)
        pdf.set_font("Helvetica", "I", 8.5)
        pdf.set_text_color(*_MUTED)
        pdf.multi_cell(180, 5, notes, align="L")

    # Legend
    pdf.ln(6)
    pdf.set_draw_color(*_BORDER)
    pdf.line(16, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(5)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*_INK)
    pdf.cell(180, 5, "Question Distribution  (5 per skill)", align="L")
    pdf.ln(7)

    for label, desc, txt_c, bg_c in [
        ("EASY",   "2 questions  |  Concepts & fundamentals", _EASY_TEXT, _EASY_BG),
        ("MEDIUM", "2 questions  |  Practical application",   _MED_TEXT,  _MED_BG),
        ("HARD",   "1 question   |  Expert-level design",     _HARD_TEXT, _HARD_BG),
    ]:
        pdf.set_fill_color(*bg_c)
        pdf.set_text_color(*txt_c)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_x(16)
        pdf.cell(22, 6, f"  {label}", fill=True)
        pdf.set_text_color(*_MUTED)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(100, 6, f"   {desc}")
        pdf.ln(9)

    pdf.ln(3)
    pdf.set_draw_color(*_BORDER)
    pdf.line(16, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(5)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(*_MUTED_LIGHT)
    pdf.multi_cell(
        180, 5,
        "Questions and model answers are AI-generated from the job description and skill stack. "
        "Interviewers should probe deeper based on candidate responses.",
        align="L",
    )


# ── Skill section (inline — no forced page break) ──────────────────────────────

_DIFF_META = {
    "easy":   ("EASY",   _EASY_TEXT,  _EASY_BG),
    "medium": ("MEDIUM", _MED_TEXT,   _MED_BG),
    "hard":   ("HARD",   _HARD_TEXT,  _HARD_BG),
}


def _skill_block_v2(pdf: _PDF, skill: str, questions: dict, start_q: int) -> int:
    """Render one skill inline (no forced page break). Returns next question number."""

    pdf.ln(4)

    # ── Skill heading ─────────────────────────────────────────────────────
    y = pdf.get_y()
    pdf.set_fill_color(*_CANVAS)
    pdf.rect(12, y, 186, 11, style="F")
    pdf.set_fill_color(*_ACCENT)
    pdf.rect(12, y, 4, 11, style="F")
    pdf.set_xy(20, y + 2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*_INK)
    pdf.cell(176, 8, skill, align="L")
    pdf.ln(14)

    q_num = start_q

    for diff_key in ("easy", "medium", "hard"):
        items = questions.get(diff_key, [])
        if not items:
            continue

        label, txt_c, bg_c = _DIFF_META[diff_key]

        # Difficulty pill badge
        pdf.set_fill_color(*bg_c)
        pdf.set_text_color(*txt_c)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_x(14)
        pdf.cell(20, 5.5, f"  {label}", fill=True)
        pdf.ln(9)

        for item in items:
            if isinstance(item, dict):
                q_text = item.get("q", "")
                a_text = item.get("a", "")
            else:
                q_text = item
                a_text = ""

            # ── Question ──────────────────────────────────────────────────
            pdf.set_x(14)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*_INK)
            pdf.cell(12, 6, f"Q{q_num}.")
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*_INK_LIGHT)
            pdf.set_x(27)
            pdf.multi_cell(169, 5.5, q_text, align="L")
            pdf.ln(2)

            # ── Answer block ──────────────────────────────────────────────
            if a_text:
                ans_y = pdf.get_y()

                # "Ans:" label
                pdf.set_x(30)
                pdf.set_font("Helvetica", "B", 8)
                pdf.set_text_color(*_ANS_TEXT)
                pdf.cell(12, 5, "Ans:")

                # Answer text (2 sentences, wraps naturally)
                pdf.set_font("Helvetica", "I", 8.5)
                pdf.set_text_color(*_ANS_TEXT)
                pdf.set_x(42)
                pdf.multi_cell(152, 5, a_text, align="L")
                ans_end_y = pdf.get_y()

                # Draw teal left accent bar (4px wide) alongside the answer
                pdf.set_fill_color(*_ANS_BORDER)
                pdf.rect(27, ans_y - 0.5, 2.5, ans_end_y - ans_y + 2, style="F")

            pdf.ln(6)
            pdf.set_draw_color(*_BORDER)
            pdf.line(14, pdf.get_y() - 2, 196, pdf.get_y() - 2)
            pdf.ln(2)
            q_num += 1

        pdf.ln(3)

    return q_num


# ── Master build ───────────────────────────────────────────────────────────────

def _build_pdf(job, all_questions: dict) -> bytes:
    total_q = sum(
        len(v.get("easy", [])) + len(v.get("medium", [])) + len(v.get("hard", []))
        for v in all_questions.values()
    )

    pdf = _PDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(0, 0, 0)

    _cover_page(pdf, job, skill_count=len(all_questions), total_q=total_q)

    # All skills on continuous pages — auto-break handles pagination
    pdf.add_page()
    q_num = 1
    for skill, questions in all_questions.items():
        q_num = _skill_block_v2(pdf, skill, questions, q_num)

    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()


# ── Public entry point ─────────────────────────────────────────────────────────

def get_or_generate(db, job) -> bytes:
    """Return cached PDF if available, else generate, persist, and return."""
    if job.questionnaire_data:
        return bytes(job.questionnaire_data)

    all_questions = _generate_questions(job)
    pdf_bytes = _build_pdf(job, all_questions)

    job.questionnaire_data = pdf_bytes
    job.questionnaire_generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)

    return pdf_bytes
