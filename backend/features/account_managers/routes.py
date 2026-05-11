from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from infra.models import AccountManager

router = APIRouter(prefix="/account-managers", tags=["account-managers"])


class AMCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None


class AMUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


def _out(am: AccountManager) -> dict:
    return {col.name: getattr(am, col.name) for col in am.__table__.columns}


@router.get("")
def list_ams(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_out(am) for am in db.query(AccountManager).order_by(AccountManager.name).all()]


@router.post("")
def create_am(body: AMCreate, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    am = AccountManager(**body.model_dump())
    db.add(am); db.commit(); db.refresh(am)
    return _out(am)


@router.patch("/{am_id}")
def update_am(am_id: int, body: AMUpdate, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    am = db.query(AccountManager).filter(AccountManager.id == am_id).first()
    if not am:
        raise HTTPException(status_code=404, detail="Account manager not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(am, k, v)
    db.commit(); db.refresh(am)
    return _out(am)


@router.delete("/{am_id}")
def delete_am(am_id: int, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    am = db.query(AccountManager).filter(AccountManager.id == am_id).first()
    if not am:
        raise HTTPException(status_code=404, detail="Account manager not found")
    db.delete(am); db.commit()
    return {"message": "Deleted"}
