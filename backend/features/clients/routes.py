from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from core.database import get_db
from core.deps import get_current_user, require_roles
from infra.models import Client
from infra.s3 import to_viewable_url

router = APIRouter(prefix="/clients", tags=["clients"])

MANAGE_ROLES = ("admin", "kam", "delivery_lead")


class ClientCreate(BaseModel):
    name: str
    short_name: str | None = None
    website_url: str | None = None
    logo_data: str | None = None
    description: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    website_url: str | None = None
    logo_data: str | None = None
    description: str | None = None


def _out(c: Client) -> dict:
    d = {col.name: getattr(c, col.name) for col in c.__table__.columns}
    d["logo_data"] = to_viewable_url(d.get("logo_data"))
    return d


@router.get("")
def list_clients(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return [_out(c) for c in db.query(Client).order_by(Client.name).all()]


@router.post("")
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*MANAGE_ROLES)),
):
    client = Client(**body.model_dump(), last_updated_by=current_user.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return _out(client)


@router.patch("/{client_id}")
def update_client(
    client_id: int,
    body: ClientUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*MANAGE_ROLES)),
):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    c.last_updated_by = current_user.name
    db.commit()
    db.refresh(c)
    return _out(c)


@router.delete("/{client_id}")
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(c)
    db.commit()
    return {"message": "Deleted"}
