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

_SYSTEM = (
    "You are a senior technical interviewer with 15+ years of experience "
    "hiring engineers across startups and enterprise companies. "
    "Generate precise, role-specific interview questions that reveal true depth of knowledge. "
    "Each question must be unambiguous, practical, and probe real-world understanding — "
    "not textbook definitions."
)

_PROMPT = """Generate exactly 5 interview questions for a {role_title} position at {client_name}.
These questions must test the candidate's depth of knowledge in: {skill}

Context about the role:
- Role Title: {role_title}
- Client / Company: {client_name}
- Skill Under Test: {skill}
- Full Tech Stack: {skill_stack}
{summary_section}

Difficulty breakdown (return exactly this count):
- 2 EASY: Core concepts, how-it-works, fundamental syntax or patterns. A good fresher should answer these.
- 2 MEDIUM: Real-world application — debugging, implementation choices, performance considerations, comparing approaches.
- 1 HARD: Expert-level — system design, deep internals, advanced optimization, trade-off analysis, or complex architecture specific to {skill}.

Rules:
1. Every question must directly relate to {skill}, not to the other skills in the stack.
2. Questions must reflect the expected seniority for a {role_title}.
3. Avoid vague questions like "Tell me about {skill}." — be specific.
4. The HARD question must require genuine expertise and cannot be answered by someone who only knows the basics.

Return ONLY valid JSON in this exact format — no markdown fences, no explanation, no trailing text:
{{
  "easy": ["<concrete question 1>", "<concrete question 2>"],
  "medium": ["<concrete question 1>", "<concrete question 2>"],
  "hard": ["<concrete question 1>"]
}}"""


def _parse_skills(skill_stack: str) -> list[str]:
    raw = re.split(r"[,;\n|/]", skill_stack or "")
    return [s.strip() for s in raw if s.strip()]


def _generate_for_skill(skill: str, job) -> dict:
    summary_section = (
        f"- Job Summary: {job.jd_summary}" if getattr(job, "jd_summary", None) else ""
    )
    prompt = _PROMPT.format(
        role_title=job.role_title,
        client_name=job.client_name,
        skill=skill,
        skill_stack=job.skill_stack or skill,
        summary_section=summary_section,
    )
    raw = call_ai(prompt, system_prompt=_SYSTEM)
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(raw)


def _generate_questions(job) -> dict:
    """Returns {skill: {easy: [...], medium: [...], hard: [...]}}."""
    skills = _parse_skills(job.skill_stack or "")
    if not skills:
        skills = [job.role_title]

    result = {}
    for skill in skills:
        try:
            result[skill] = _generate_for_skill(skill, job)
            log.info("Generated questions for skill: %s", skill)
        except Exception:
            log.exception("Failed to generate questions for skill: %s", skill)
    return result


# ──────────────────────────────────────────────────────────────────────────────
# PDF builder
# ──────────────────────────────────────────────────────────────────────────────

_BRAND_BLUE  = (30,  64,  175)   # header/accent
_BADGE_EASY  = (22,  163, 74)    # green-600
_BADGE_MED   = (202, 138, 4)     # yellow-600
_BADGE_HARD  = (220, 38,  38)    # red-600
_BG_EASY     = (240, 253, 244)
_BG_MED      = (254, 252, 232)
_BG_HARD     = (254, 242, 242)
_SLATE_800   = (30,  41,  59)
_SLATE_500   = (71,  85,  105)
_SLATE_400   = (148, 163, 184)
_DIVIDER     = (203, 213, 225)


class _PDF(FPDF):
    """FPDF subclass that stamps the J2W logo as a faint watermark on every page."""

    def header(self):
        if LOGO_PATH.exists():
            with self.local_context(fill_opacity=0.07, stroke_opacity=0.07):
                # Centre logo on page: A4 = 210 mm wide; logo width = 130 mm
                self.image(str(LOGO_PATH), x=40, y=85, w=130)

    def footer(self):
        self.set_y(-14)
        self.set_draw_color(*_DIVIDER)
        self.line(10, self.get_y(), 200, self.get_y())
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*_SLATE_400)
        self.set_x(10)
        self.cell(95, 8, "J2W Recruiter Tracking - Confidential", align="L")
        self.set_x(105)
        self.cell(95, 8, f"Page {self.page_no()}", align="R")


def _cover_page(pdf: _PDF, job, skill_count: int, total_q: int) -> None:
    pdf.add_page()

    # Brand bar
    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, 210, 52, style="F")

    # Logo on cover — top-right corner, fully opaque
    if LOGO_PATH.exists():
        pdf.image(str(LOGO_PATH), x=130, y=6, w=70)

    # Title
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_xy(10, 10)
    pdf.cell(115, 12, "Interview Questionnaire", align="L")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(10, 26)
    pdf.cell(115, 8, f"{job.role_title}  |  {job.client_name}", align="L")
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_xy(10, 37)
    pdf.set_text_color(186, 206, 255)
    pdf.cell(115, 7, "AI-Generated Skill Assessment", align="L")

    # Meta block
    pdf.set_text_color(*_SLATE_500)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(10, 62)

    skills_display = (job.skill_stack or "").strip()
    pdf.multi_cell(190, 6, f"Skills Assessed: {skills_display}", align="L")
    pdf.set_x(10)
    pdf.cell(
        190, 6,
        f"Generated: {datetime.now(timezone.utc).strftime('%d %B %Y')}",
        align="L",
    )
    pdf.ln(3)
    pdf.set_x(10)
    pdf.cell(190, 6, f"Total Sections: {skill_count}   |   Total Questions: {total_q}", align="L")
    pdf.ln(5)

    # Summary if available
    if getattr(job, "jd_summary", None):
        pdf.set_x(10)
        pdf.set_draw_color(*_DIVIDER)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*_SLATE_800)
        pdf.set_x(10)
        pdf.cell(190, 6, "Role Summary", align="L")
        pdf.ln(6)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*_SLATE_500)
        pdf.set_x(10)
        pdf.multi_cell(190, 5, job.jd_summary[:600], align="L")

    # Difficulty legend
    pdf.ln(6)
    pdf.set_x(10)
    pdf.set_draw_color(*_DIVIDER)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_SLATE_800)
    pdf.set_x(10)
    pdf.cell(190, 6, "Question Distribution  (per skill)", align="L")
    pdf.ln(8)

    legend = [
        ("EASY",   "2 questions", _BADGE_EASY),
        ("MEDIUM", "2 questions", _BADGE_MED),
        ("HARD",   "1 question",  _BADGE_HARD),
    ]
    for label, desc, color in legend:
        pdf.set_fill_color(*color)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_x(10)
        pdf.cell(22, 6, f"  {label}", fill=True)
        pdf.set_text_color(*_SLATE_500)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(60, 6, f"  {desc}")
        pdf.ln(9)

    pdf.ln(4)
    pdf.set_x(10)
    pdf.set_draw_color(*_DIVIDER)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*_SLATE_400)
    pdf.set_x(10)
    pdf.multi_cell(
        190, 5,
        "This questionnaire is AI-generated based on the job description and skill stack. "
        "Interviewers should adapt questions based on candidate responses.",
        align="L",
    )


def _skill_section(pdf: _PDF, skill: str, questions: dict, start_q: int) -> int:
    """Render one skill's questions. Returns the next question number."""
    pdf.add_page()

    # Skill heading strip
    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, 210, 18, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_xy(10, 4)
    pdf.cell(190, 10, f"Skill: {skill}", align="L")

    pdf.ln(6)

    sections = [
        ("EASY",   questions.get("easy",   []), _BADGE_EASY,  _BG_EASY),
        ("MEDIUM", questions.get("medium", []), _BADGE_MED,   _BG_MED),
        ("HARD",   questions.get("hard",   []), _BADGE_HARD,  _BG_HARD),
    ]

    q_num = start_q
    for level, qs, badge_rgb, bg_rgb in sections:
        if not qs:
            continue

        # Difficulty badge
        pdf.set_fill_color(*badge_rgb)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_x(10)
        pdf.cell(28, 6, f"  {level}", fill=True)
        pdf.ln(10)

        pdf.set_fill_color(*bg_rgb)
        for q in qs:
            # Question number
            pdf.set_text_color(*_SLATE_800)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_x(10)
            pdf.cell(10, 8, f"Q{q_num}.", border=0)

            # Question text
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(51, 65, 85)
            pdf.set_x(22)
            pdf.multi_cell(176, 6, q, border=0, fill=False)

            # Answer lines
            pdf.set_text_color(*_SLATE_400)
            pdf.set_font("Helvetica", "I", 8)
            for _ in range(4):
                pdf.set_x(22)
                pdf.set_draw_color(226, 232, 240)
                pdf.cell(176, 7, "", border="B")
                pdf.ln(7)

            pdf.ln(3)
            q_num += 1

        pdf.ln(4)

    return q_num


def _build_pdf(job, all_questions: dict) -> bytes:
    total_q = sum(
        len(v.get("easy", [])) + len(v.get("medium", [])) + len(v.get("hard", []))
        for v in all_questions.values()
    )

    pdf = _PDF()
    pdf.set_auto_page_break(auto=True, margin=18)

    _cover_page(pdf, job, skill_count=len(all_questions), total_q=total_q)

    q_num = 1
    for skill, questions in all_questions.items():
        q_num = _skill_section(pdf, skill, questions, q_num)

    buf = BytesIO()
    pdf.output(buf)
    return buf.getvalue()


# ──────────────────────────────────────────────────────────────────────────────

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
