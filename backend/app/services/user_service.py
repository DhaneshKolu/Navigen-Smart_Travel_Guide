from sqlalchemy.orm import Session
from app.db.models import User
from app.core.security import hash_password,verify_password

def create_user(db:Session,email:str,password:str,name:str | None = None):
    user = User(
        email = email,
        hashed_password = hash_password(password),
        name = (name or "").strip() or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def authenticate_user(db:Session,email:str,password:str):
    user = db.query(User).filter(User.email == email).first()

    if not user:
        return None
    if not verify_password(password,user.hashed_password):
        return None
    return user
