from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import get_current_user
from core.response_format import error_response, success_response
from features.hrbp.projects import service
from features.hrbp.projects.schema import (
    MemberAdd,
    MemberUpdate,
    ProjectCreate,
    ProjectKpisSet,
    ProjectUpdate,
    TeamCommentRequest,
)
from infra.models import User

router = APIRouter(prefix="/projects", tags=["hrbp-projects"])


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.list_projects(db)
        return success_response(data=data, message="Projects fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("")
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.create_project(
            db,
            name=payload.name,
            description=payload.description,
            client_id=payload.client_id,
            created_by=current_user.id,
        )
        db.commit()
        return success_response(data=data, message="Project created")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.get("/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_project(db, project_id)
        return success_response(data=data, message="Project fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.put("/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update_project(db, project_id, payload.model_dump(exclude_none=True))
        db.commit()
        return success_response(data=data, message="Project updated")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.delete_project(db, project_id)
        db.commit()
        return success_response(data={}, message="Project deleted")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


# ── Members ───────────────────────────────────────────────────────────────────

@router.get("/{project_id}/members")
def list_members(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.list_members(db, project_id)
        db.commit()
        return success_response(data=data, message="Members fetched")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    payload: MemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.add_member(
            db,
            project_id=project_id,
            consultant_id=payload.consultant_id,
            cohort=payload.cohort,
            perf_tier=payload.perf_tier,
            role_in_project=payload.role_in_project,
            added_by=current_user.id,
        )
        db.commit()
        return success_response(data=data, message="Member added")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.put("/{project_id}/members/{consultant_id}")
def update_member(
    project_id: int,
    consultant_id: int,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.update_member(db, project_id, consultant_id, payload.model_dump(exclude_none=True))
        db.commit()
        return success_response(data=data, message="Member updated")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.delete("/{project_id}/members/{consultant_id}")
def remove_member(
    project_id: int,
    consultant_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        service.remove_member(db, project_id, consultant_id)
        db.commit()
        return success_response(data={}, message="Member removed")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


# ── Team Comment ──────────────────────────────────────────────────────────────

@router.post("/{project_id}/analyze-comment")
def analyze_team_comment(
    project_id: int,
    payload: TeamCommentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = service.analyze_team_comment(
            db,
            project_id=project_id,
            comment=payload.comment,
            created_by=current_user.id,
        )
        db.commit()
        return success_response(data=data, message="Team comment analysed")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.get("/{project_id}/kpis")
def get_project_kpis(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_project_kpis(db, project_id)
        return success_response(data=data, message="KPIs fetched")
    except Exception as exc:
        return error_response(message=str(exc))


@router.post("/{project_id}/kpis")
def set_project_kpis(
    project_id: int,
    payload: ProjectKpisSet,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.set_project_kpis(db, project_id, [k.model_dump() for k in payload.kpis])
        db.commit()
        return success_response(data=data, message="KPIs updated")
    except Exception as exc:
        db.rollback()
        return error_response(message=str(exc))


@router.get("/{project_id}/comment-history")
def get_comment_history(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        data = service.get_comment_history(db, project_id)
        return success_response(data=data, message="Comment history fetched")
    except Exception as exc:
        return error_response(message=str(exc))
