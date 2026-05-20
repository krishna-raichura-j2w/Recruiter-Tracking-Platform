import re

from core.pagination import PageResult, paginate
from fastapi import HTTPException
from infra.hrbp_models import HRBPEmailTemplate
from sqlalchemy.orm import Session

from features.hrbp.email_templates.schema import (
    EmailTemplateCreate,
    EmailTemplateUpdate,
    RenderResponse,
)


def create(db: Session, payload: EmailTemplateCreate) -> HRBPEmailTemplate:
    if db.query(HRBPEmailTemplate).filter_by(id=payload.id).first():
        raise HTTPException(
            status_code=409, detail=f"Template id '{payload.id}' already exists",
        )
    record = HRBPEmailTemplate(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_all(db: Session) -> list[HRBPEmailTemplate]:
    return db.query(HRBPEmailTemplate).order_by(HRBPEmailTemplate.id).all()


def list_paginated(db: Session, page_no: int, per_page: int) -> PageResult:
    q = db.query(HRBPEmailTemplate).order_by(HRBPEmailTemplate.id)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: str) -> HRBPEmailTemplate:
    record = db.query(HRBPEmailTemplate).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Template '{id}' not found")
    return record


def list_by_group(db: Session, group_name: str) -> list[HRBPEmailTemplate]:
    return (
        db.query(HRBPEmailTemplate)
        .filter_by(group_name=group_name)
        .order_by(HRBPEmailTemplate.id)
        .all()
    )


def update(db: Session, id: str, payload: EmailTemplateUpdate) -> HRBPEmailTemplate:
    record = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: str) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()


def render(db: Session, id: str, consultant_id: str) -> RenderResponse:
    template = get_by_id(db, id)

    # Attempt to fetch consultant — table may not exist yet, so gracefully degrade.
    consultant: dict = {}
    try:
        from sqlalchemy import text

        row = (
            db.execute(
                text("SELECT * FROM hrbp_consultants WHERE id = :cid LIMIT 1"),
                {"cid": consultant_id},
            )
            .mappings()
            .first()
        )
        if row:
            consultant = dict(row)
    except Exception:
        pass  # hrbp_consultants not yet created — return unfilled template

    def _fill(text_tpl: str | None) -> str | None:
        if not text_tpl:
            return text_tpl

        def replacer(match: re.Match) -> str:
            key = match.group(1).strip()
            return str(consultant.get(key, match.group(0)))  # keep {{var}} if not found

        return re.sub(r"\{\{(.+?)\}\}", replacer, text_tpl)

    rendered_subject = _fill(template.subject_tpl)
    rendered_body = _fill(template.body_tpl)

    # Forbidden word check
    forbidden = template.forbidden_words or []
    if forbidden and rendered_body:
        body_lower = rendered_body.lower()
        found = [w for w in forbidden if w.lower() in body_lower]
        if found:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Forbidden words detected in rendered body",
                    "words": found,
                },
            )

    return RenderResponse(
        subject=rendered_subject,
        body=rendered_body or "",
        to=consultant.get("email"),
        cc=[],
        locked_cc=template.locked_cc or [],
    )
