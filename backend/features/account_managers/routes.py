from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from infra.models import BusinessHead

router = APIRouter(prefix="/business-heads", tags=["business-heads"])


class BHCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None


class BHUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None


def _out(bh: BusinessHead) -> dict:
    return {col.name: getattr(bh, col.name) for col in bh.__table__.columns}


@router.get("")
def list_bhs(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_out(bh) for bh in db.query(BusinessHead).order_by(BusinessHead.name).all()]


@router.post("")
def create_bh(body: BHCreate, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    bh = BusinessHead(**body.model_dump())
    db.add(bh); db.commit(); db.refresh(bh)
    return _out(bh)


@router.patch("/{bh_id}")
def update_bh(bh_id: int, body: BHUpdate, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    bh = db.query(BusinessHead).filter(BusinessHead.id == bh_id).first()
    if not bh:
        raise HTTPException(status_code=404, detail="Business head not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(bh, k, v)
    db.commit(); db.refresh(bh)
    return _out(bh)


@router.delete("/{bh_id}")
def delete_bh(bh_id: int, db: Session = Depends(get_db), _=Depends(require_roles("admin"))):
    from infra.models import Job
    bh = db.query(BusinessHead).filter(BusinessHead.id == bh_id).first()
    if not bh:
        raise HTTPException(status_code=404, detail="Business head not found")
    # Nullify FK on linked jobs before deleting
    db.query(Job).filter(Job.account_manager_id == bh_id).update(
        {"account_manager_id": None}, synchronize_session=False
    )
    db.delete(bh); db.commit()
    return {"message": "Deleted"}
