from pydantic import BaseModel


class SkillEntry(BaseModel):
    name: str
    years_of_experience: int | None = None
    proficiency: str | None = None


class ParsedJD(BaseModel):
    job_title:        str | None = None
    company:          str | None = None
    location:         str | None = None
    employment_type:  str | None = None
    work_mode:        str | None = None
    department:       str | None = None
    summary:          str | None = None
    experience_level: str | None = None
    min_experience:   int | None = None
    max_experience:   int | None = None
    salary_range:     str | None = None
    required_skills:  list[SkillEntry] = []
    preferred_skills: list[SkillEntry] = []
    tech_stack:       list[str] = []
    responsibilities: list[str] = []
    requirements:     list[str] = []
    education:        list[str] = []
    recruiter_contact: str | None = None


class JDExtractResponse(BaseModel):
    parsed:    ParsedJD
    cost_info: dict
    raw_text:  str | None = None
