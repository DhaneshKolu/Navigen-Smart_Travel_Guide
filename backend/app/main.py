from fastapi import FastAPI
from app.api.health import router as health_router
from app.db.engine import engine
from app.db.base import Base
from app.api.user import router as user_router
from app.api.travel import router as travel_router
from app.api.itinerary import router as itinerary_router
from fastapi.middleware.cors import CORSMiddleware
from app.core.settings import settings
from app.api.weather import router as weather_router
from app.api.auth_api import router as auth_api_router
from app.api.plan_api import router as plan_api_router




Base.metadata.create_all(bind=engine)



app = FastAPI(title="NAVIGEN - Smart Travel Guide")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_api_router)
app.include_router(user_router)
app.include_router(travel_router)
app.include_router(weather_router)
app.include_router(itinerary_router)
app.include_router(plan_api_router)
@app.options("/{rest_of_path:path}")
async def preflight_handler():
    return {}




