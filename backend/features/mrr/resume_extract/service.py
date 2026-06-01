import base64
import io
import json
import os
from datetime import date

from docx import Document
from pypdf import PdfReader

from core.config import settings
from .schema import EDUCATION_OPTIONS, EXPERIENCE_OPTIONS, ConsultantProfile

SYSTEM_PROMPT = f"""You are an expert HR data extractor. Extract consultant profile information from the provided content.

Return a JSON object with ONLY these fields:
- sourcing_date: date profile was sourced (YYYY-MM-DD format; use today's date {date.today()} if not present)
- name: full name of the consultant
- mobile_number: the CANDIDATE'S personal mobile number only (digits only, no spaces/dashes/dots/brackets; include + country code only if explicitly written)
- email: email address
- linkedin_url: LinkedIn profile URL (use "N/A" if absent)
- education: must be one of {EDUCATION_OPTIONS} — pick closest match
- current_location: current city/location
- profile_active_naukri: "Yes" or "No"
- experience_range: must be one of {EXPERIENCE_OPTIONS} — pick closest match
- current_company: current employer. If payrolled through another company include it in brackets e.g. "TCS (ABC Payroll)"
- relevant_skills: comma-separated list of skills
- immediate_joinee: "Yes" or "No" or "" if not found

Rules:
- If information is not found, use null
- profile_active_naukri defaults to "Yes"
- Return ONLY valid JSON with no markdown, code fences, or explanation
"""


def _use_claude() -> bool:
    return (settings.model_to_use or "AZURE").upper() == "CLAUDE"


def _image_block_azure(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _image_block_claude(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}


def _call_llm(content: list) -> tuple[ConsultantProfile, dict]:
    if _use_claude():
        return _call_claude(content)
    return _call_azure(content)


def _call_claude(content: list) -> tuple[ConsultantProfile, dict]:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.claude_api_key or "")
    response = client.messages.create(
        model=settings.claude_model_name,
        max_tokens=8192,  # resume JSON can exceed 1200 tokens; truncation → invalid JSON
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    raw_text = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw = json.loads(raw_text)
    profile = ConsultantProfile(**raw)
    cost_info = {
        "model": settings.claude_model_name,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
        "input_cost_usd": 0,
        "output_cost_usd": 0,
        "total_cost_usd": 0,
    }
    return profile, cost_info


def _call_azure(content: list) -> tuple[ConsultantProfile, dict]:
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
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    raw = json.loads(response.choices[0].message.content)
    profile = ConsultantProfile(**raw)
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
    return profile, cost_info


def _pdf_to_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def _docx_to_text(docx_bytes: bytes) -> str:
    doc = Document(io.BytesIO(docx_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


def extract_from_text(text: str) -> tuple[ConsultantProfile, dict]:
    return _call_llm([{"type": "text", "text": text}])


def extract_from_pdf(pdf_bytes: bytes) -> tuple[ConsultantProfile, dict]:
    text = _pdf_to_text(pdf_bytes)
    if not text:
        raise ValueError("Could not extract text from PDF")
    return _call_llm([{"type": "text", "text": text}])


def extract_from_docx(docx_bytes: bytes) -> tuple[ConsultantProfile, dict]:
    text = _docx_to_text(docx_bytes)
    if not text:
        raise ValueError("Could not extract text from Word document")
    return _call_llm([{"type": "text", "text": text}])


def extract_from_image(img_bytes: bytes, mime: str) -> tuple[ConsultantProfile, dict]:
    block = _image_block_claude(img_bytes, mime) if _use_claude() else _image_block_azure(img_bytes, mime)
    return _call_llm([block])
