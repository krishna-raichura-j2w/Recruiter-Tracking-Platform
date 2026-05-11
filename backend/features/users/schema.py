from pydantic import BaseModel, EmailStr
from infra.models import UserRole


DEFAULT_PASSWORD = "joules@123"

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = DEFAULT_PASSWORD
    role: UserRole
    pod_lead_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    pod_lead_id: int | None = None


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    pod_lead_id: int | None = None

    model_config = {"from_attributes": True}
