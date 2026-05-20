from pydantic import BaseModel


class PipelineStat(BaseModel):
    stage: str
    count: int


class DashboardData(BaseModel):
    pipeline: list[PipelineStat]
    total_candidates: int
    total_jobs: int
    submitted_this_month: int
    joined_this_month: int
