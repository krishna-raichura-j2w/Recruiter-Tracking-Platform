import base64
import io
import json
import os
from datetime import date

from openai import AzureOpenAI
from pypdf import PdfReader

from .schema import EDUCATION_OPTIONS, EXPERIENCE_OPTIONS, ConsultantProfile

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("AZURE_API_VERSION"),
)

DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15  / 1_000_000, "output": 0.60  / 1_000_000},
    "gpt-4o":      {"input": 2.50  / 1_000_000, "output": 10.00 / 1_000_000},
    "gpt-4":       {"input": 30.00 / 1_000_000, "output": 60.00 / 1_000_000},
}


def calc_cost(model: str, input_tokens: int, output_tokens: int) -> tuple[float, float, float]:
    rates = _MODEL_RATES.get(model, _MODEL_RATES["gpt-4o-mini"])
    inp   = round(input_tokens  * rates["input"],  8)
    out   = round(output_tokens * rates["output"], 8)
    return inp, out, round(inp + out, 8)


SYSTEM_PROMPT = f"""You are an expert HR data extractor. Extract consultant profile information from the provided content.

Return a JSON object with ONLY these fields:
- sourcing_date: date profile was sourced (YYYY-MM-DD format; use today's date {date.today()} if not present)
- pool_verified: "Yes" or "No"
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


def _call_azure(content: list) -> tuple[ConsultantProfile, dict]:
    response = client.chat.completions.create(
        model=DEPLOYMENT,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": content},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    raw     = json.loads(response.choices[0].message.content)
    profile = ConsultantProfile(**raw)
    usage   = response.usage
    inp, out, total = calc_cost(DEPLOYMENT, usage.prompt_tokens, usage.completion_tokens)
    cost_info = {
        "model":           DEPLOYMENT,
        "input_tokens":    usage.prompt_tokens,
        "output_tokens":   usage.completion_tokens,
        "total_tokens":    usage.total_tokens,
        "input_cost_usd":  inp,
        "output_cost_usd": out,
        "total_cost_usd":  total,
    }
    return profile, cost_info


def _image_block(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _pdf_to_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def extract_from_text(text: str) -> tuple[ConsultantProfile, dict]:
    content = [{"type": "text", "text": text}]
    return _call_azure(content)


def extract_from_pdf(pdf_bytes: bytes) -> tuple[ConsultantProfile, dict]:
    text = _pdf_to_text(pdf_bytes)
    if not text:
        raise ValueError("Could not extract text from PDF")
    content = [{"type": "text", "text": text}]
    return _call_azure(content)


def extract_from_image(img_bytes: bytes, mime: str) -> tuple[ConsultantProfile, dict]:
    content = [_image_block(img_bytes, mime)]
    return _call_azure(content)
