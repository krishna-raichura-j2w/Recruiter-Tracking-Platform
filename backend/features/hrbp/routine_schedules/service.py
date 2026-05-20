from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from infra.hrbp_models import HRBPRoutineSchedule
from features.hrbp.routine_schedules.schema import RoutineScheduleCreate, RoutineScheduleUpdate
from core.pagination import paginate, PageResult


def create(db: Session, payload: RoutineScheduleCreate) -> HRBPRoutineSchedule:
    record = HRBPRoutineSchedule(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_paginated(
    db: Session,
    page_no: int,
    per_page: int,
    consultant_id: UUID | None = None,
    assigned_to: UUID | None = None,
    task_type: str | None = None,
    status: str | None = None,
) -> PageResult:
    q = db.query(HRBPRoutineSchedule)
    if consultant_id is not None:
        q = q.filter(HRBPRoutineSchedule.consultant_id == consultant_id)
    if assigned_to is not None:
        q = q.filter(HRBPRoutineSchedule.assigned_to == assigned_to)
    if task_type is not None:
        q = q.filter(HRBPRoutineSchedule.task_type == task_type)
    if status is not None:
        q = q.filter(HRBPRoutineSchedule.status == status)
    q = q.order_by(HRBPRoutineSchedule.due_at)
    return paginate(q, page_no, per_page)


def get_by_id(db: Session, id: UUID) -> HRBPRoutineSchedule:
    record = db.query(HRBPRoutineSchedule).filter_by(id=id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Routine schedule not found")
    return record


def update(db: Session, id: UUID, payload: RoutineScheduleUpdate) -> HRBPRoutineSchedule:
    record = get_by_id(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


def delete(db: Session, id: UUID) -> None:
    record = get_by_id(db, id)
    db.delete(record)
    db.commit()
