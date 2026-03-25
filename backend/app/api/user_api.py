from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models.user import User
from app.db.session import get_db


router = APIRouter(prefix="/api/user", tags=["User API"])


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PreferencesPayload(BaseModel):
    defaultOrigin: str = ""
    defaultVibes: list[str] = []
    defaultGroup: str = ""
    currency: str = "USD"
    theme: str = "dark"
    pace: str = "balanced"
    distanceUnit: str = "km"
    tempUnit: str = "C"
    notifications: dict = Field(default_factory=dict)


@router.put("/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    next_name = payload.name.strip()
    if not next_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    current_user.name = next_name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return {
        "userId": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
    }


@router.get("/preferences")
def get_preferences(
    current_user: User = Depends(get_current_user),
):
    return current_user.preferences or {}


@router.put("/preferences")
def save_preferences(
    payload: PreferencesPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.preferences = payload.model_dump()
    db.add(current_user)
    db.commit()
    return {"saved": True}
