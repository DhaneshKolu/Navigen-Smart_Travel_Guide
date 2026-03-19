from fastapi import APIRouter,Depends
from app.core.security import get_current_user
from app.schemas.user import UserResponse
from app.db.models.user import User

router = APIRouter(prefix = "/users",tags = ["Users"])

@router.get("/me",response_model=UserResponse)
def read_current_user(current_user:User =Depends(get_current_user)):
    return current_user