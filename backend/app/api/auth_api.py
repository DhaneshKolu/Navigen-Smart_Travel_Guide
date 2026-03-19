from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.user import User
from app.services.user_service import create_user, authenticate_user
from app.core.security import create_access_token


router = APIRouter(prefix="/api/auth", tags=["Auth API"])


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def _name_from_user(user: User, fallback: str = "Traveler") -> str:
    if user.email and "@" in user.email:
        return user.email.split("@")[0].replace(".", " ").title()
    return fallback


@router.post("/register")
def register_api(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = create_user(db, payload.email, payload.password)
    token = create_access_token({"sub": str(user.id)})

    return {
        "userId": str(user.id),
        "token": token,
        "name": payload.name or _name_from_user(user),
    }


@router.post("/login")
def login_api(payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return {
        "userId": str(user.id),
        "token": token,
        "name": _name_from_user(user),
    }
