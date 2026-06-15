from typing import Any
from pydantic import BaseModel


class CategoryOption(BaseModel):
    index: int
    label: str
    score: int


class Category(BaseModel):
    key: str
    label: str
    max_score: int
    escalation_base: int
    description: str
    options: list[CategoryOption]


class ScoreEntry(BaseModel):
    category_key: str
    option_index: int
    escalations: int
    net_score: int
    base_score: int
    max_score: int


class ScoreSummary(BaseModel):
    consultant_id: int
    total_score: int
    total_possible: int
    grade: str
    tone: str


class ManualScoreUpdate(BaseModel):
    scores: dict[str, dict[str, int]]
    # e.g. {"timing": {"option_index": 2, "escalations": 1}, ...}


class CommentRequest(BaseModel):
    comment: str
    consultant_name: str


class CategoryChange(BaseModel):
    category_key: str
    category_label: str
    max_score: int
    from_idx: int
    to_idx: int
    from_label: str
    to_label: str
    from_score: int
    to_score: int
    score_diff: int


class CommentAnalysisResponse(BaseModel):
    adjustments: dict[str, int]
    esc_adjustments: dict[str, int]
    changes_detail: dict[str, Any]
    explanation: str
    score_before: int
    score_after: int
    score_delta: int
    history_id: int
    created_at: str


class CommentHistoryEntry(BaseModel):
    id: int
    consultant_id: int
    comment: str
    explanation: str | None
    score_before: int | None
    score_after: int | None
    score_delta: int | None
    changes_detail: dict[str, Any] | None
    created_by: int | None
    created_at: str | None
