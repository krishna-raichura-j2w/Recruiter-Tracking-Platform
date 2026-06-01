import base64
import io
import json
import os

from docx import Document
from pypdf import PdfReader

from core.config import settings
from .schema import ParsedJD

JD_SYSTEM_PROMPT = """You are a Job Description parsing assistant.

INPUT: Raw text extracted from a job description document.
OUTPUT: Return ONLY JSON that conforms to the schema below. No markdown, no code fences.

EXTRACTION SCOPE:
- job_title: the role/position title
- company: company name
- employment_type: Full-time, Part-time, Contract, etc.
- work_mode: Remote / Onsite / Hybrid / Flexible
- location: city or cities where the role is based
- department: team or department name
- summary: 3-5 sentence overview covering role purpose, key responsibilities, primary and good-to-have skills, experience required, salary if known, location, company context, and 2-3 specific things to look for in candidates when sourcing for this role
- experience_level: Junior / Mid / Senior / Lead / Manager
- min_experience: minimum years of experience required (integer, null if not specified)
- max_experience: maximum years of experience (integer, null if not specified)
- salary_range: salary or CTC range as a string (null if not present)
- required_skills: list of objects {name, years_of_experience (int or null), proficiency (Beginner/Intermediate/Advanced/Expert or null)}
- preferred_skills: same structure as required_skills but for nice-to-have skills
- tech_stack: flat list of technology/tool names mentioned
- responsibilities: list of responsibility strings
- requirements: list of requirement strings
- education: list of education qualification strings
- recruiter_contact: recruiter name/email/phone if present

ANTI-HALLUCINATION RULES — CRITICAL:
- Extract ONLY information explicitly present in the text
- Do NOT generate placeholder, example, or fake data
- If information is missing, use null or []
- Return ONLY valid JSON with no explanation
"""


def _use_claude() -> bool:
    return (settings.model_to_use or "AZURE").upper() == "CLAUDE"


def _image_block_azure(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _image_block_claude(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}


def _call_llm(content: list) -> tuple[ParsedJD, dict]:
    if _use_claude():
        return _call_claude(content)
    return _call_azure(content)


def _call_claude(content: list) -> tuple[ParsedJD, dict]:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.claude_api_key or "")
    response = client.messages.create(
        model=settings.claude_model_name,
        max_tokens=1500,
        system=JD_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    raw_text = response.content[0].text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw = json.loads(raw_text)
    parsed = ParsedJD(**raw)
    cost_info = {
        "model": settings.claude_model_name,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
        "input_cost_usd": 0,
        "output_cost_usd": 0,
        "total_cost_usd": 0,
    }
    return parsed, cost_info


def _call_azure(content: list) -> tuple[ParsedJD, dict]:
    from openai import AzureOpenAI
    client = AzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
        api_version=os.getenv("AZURE_API_VERSION"),
    )
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    _rates = {
        "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
        "gpt-4o":      {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    }
    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": JD_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    raw = json.loads(response.choices[0].message.content)
    parsed = ParsedJD(**raw)
    usage = response.usage
    rates = _rates.get(deployment, _rates["gpt-4o-mini"])
    inp = round(usage.prompt_tokens * rates["input"], 8)
    out = round(usage.completion_tokens * rates["output"], 8)
    cost_info = {
        "model": deployment,
        "input_tokens": usage.prompt_tokens,
        "output_tokens": usage.completion_tokens,
        "total_tokens": usage.total_tokens,
        "input_cost_usd": inp,
        "output_cost_usd": out,
        "total_cost_usd": round(inp + out, 8),
    }
    return parsed, cost_info


def _pdf_to_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def _docx_to_text(docx_bytes: bytes) -> str:
    doc = Document(io.BytesIO(docx_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


def extract_from_text(text: str) -> tuple[ParsedJD, dict, str]:
    parsed, cost = _call_llm([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_pdf(pdf_bytes: bytes) -> tuple[ParsedJD, dict, str]:
    text = _pdf_to_text(pdf_bytes)
    if not text:
        raise ValueError("Could not extract text from PDF")
    parsed, cost = _call_llm([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_docx(docx_bytes: bytes) -> tuple[ParsedJD, dict, str]:
    text = _docx_to_text(docx_bytes)
    if not text:
        raise ValueError("Could not extract text from Word document")
    parsed, cost = _call_llm([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_image(img_bytes: bytes, mime: str) -> tuple[ParsedJD, dict, None]:
    block = _image_block_claude(img_bytes, mime) if _use_claude() else _image_block_azure(img_bytes, mime)
    parsed, cost = _call_llm([block])
    return parsed, cost, None
