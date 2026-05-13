import base64
import io
import json
import os

from docx import Document
from openai import AzureOpenAI
from pypdf import PdfReader

from .schema import ParsedJD

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("AZURE_API_VERSION"),
)

DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

_MODEL_RATES: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15  / 1_000_000, "output": 0.60  / 1_000_000},
    "gpt-4o":      {"input": 2.50  / 1_000_000, "output": 10.00 / 1_000_000},
}


def _calc_cost(model: str, inp_tok: int, out_tok: int) -> tuple[float, float, float]:
    rates = _MODEL_RATES.get(model, _MODEL_RATES["gpt-4o-mini"])
    inp = round(inp_tok * rates["input"],  8)
    out = round(out_tok * rates["output"], 8)
    return inp, out, round(inp + out, 8)


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


def _call_azure(content: list) -> tuple[ParsedJD, dict]:
    response = client.chat.completions.create(
        model=DEPLOYMENT,
        messages=[
            {"role": "system", "content": JD_SYSTEM_PROMPT},
            {"role": "user",   "content": content},
        ],
        temperature=0,
        response_format={"type": "json_object"},
    )
    raw    = json.loads(response.choices[0].message.content)
    parsed = ParsedJD(**raw)
    usage  = response.usage
    inp, out, total = _calc_cost(DEPLOYMENT, usage.prompt_tokens, usage.completion_tokens)
    cost_info = {
        "model":           DEPLOYMENT,
        "input_tokens":    usage.prompt_tokens,
        "output_tokens":   usage.completion_tokens,
        "total_tokens":    usage.total_tokens,
        "input_cost_usd":  inp,
        "output_cost_usd": out,
        "total_cost_usd":  total,
    }
    return parsed, cost_info


def _image_block(img_bytes: bytes, mime: str) -> dict:
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _pdf_to_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def _docx_to_text(docx_bytes: bytes) -> str:
    doc = Document(io.BytesIO(docx_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


def extract_from_text(text: str) -> tuple[ParsedJD, dict, str]:
    parsed, cost = _call_azure([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_pdf(pdf_bytes: bytes) -> tuple[ParsedJD, dict, str]:
    text = _pdf_to_text(pdf_bytes)
    if not text:
        raise ValueError("Could not extract text from PDF")
    parsed, cost = _call_azure([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_docx(docx_bytes: bytes) -> tuple[ParsedJD, dict, str]:
    text = _docx_to_text(docx_bytes)
    if not text:
        raise ValueError("Could not extract text from Word document")
    parsed, cost = _call_azure([{"type": "text", "text": text}])
    return parsed, cost, text


def extract_from_image(img_bytes: bytes, mime: str) -> tuple[ParsedJD, dict, None]:
    parsed, cost = _call_azure([_image_block(img_bytes, mime)])
    return parsed, cost, None
