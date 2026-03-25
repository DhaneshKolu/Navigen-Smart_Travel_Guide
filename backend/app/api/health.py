from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "TravelMind API"}

@router.get("/health/db")
def db_health():
    return {"db": "connected"}
