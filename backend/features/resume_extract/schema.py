from pydantic import BaseModel

EDUCATION_OPTIONS = [
    "B.Tech/BE", "M.Tech/ME", "BCA", "MCA", "B.Sc", "M.Sc",
    "B.Com", "MBA", "Diploma", "PhD", "Other",
]

EXPERIENCE_OPTIONS = [
    "0-1 yr", "1-3 yrs", "3-5 yrs", "5-8 yrs",
    "8-12 yrs", "12-15 yrs", "15+ yrs",
]


class ConsultantProfile(BaseModel):
    sourcing_date:         str | None = None
    pool_verified:         str | None = None
    name:                  str | None = None
    mobile_number:         str | None = None
    email:                 str | None = None
    linkedin_url:          str | None = None
    education:             str | None = None
    current_location:      str | None = None
    profile_active_naukri: str | None = None
    experience_range:      str | None = None
    current_company:       str | None = None
    relevant_skills:       str | None = None
    immediate_joinee:      str | None = None


class ExtractResponse(BaseModel):
    profile:   ConsultantProfile
    cost_info: dict
