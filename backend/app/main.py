from dotenv import load_dotenv
import os
from fastapi import FastAPI
from fastapi import Response
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
from app.api.user_api import router as user_api_router


load_dotenv()



Base.metadata.create_all(bind=engine)



app = FastAPI(title="NAVIGEN - Smart Travel Guide")

# Parse CORS origins from settings plus FRONTEND_URL and required Render domains.
_origins_from_settings = [
    origin.strip()
    for origin in settings.ALLOWED_ORIGINS.split(",")
    if origin.strip()
]

_frontend_url = os.getenv("FRONTEND_URL", "").strip()

ALLOWED_ORIGINS = list(
    dict.fromkeys(
        [
            *_origins_from_settings,
            "https://navigen-smart-travel-guide.onrender.com",
            "https://navigen-smart-travel-guide-1.onrender.com",
            *([_frontend_url] if _frontend_url else []),
        ]
    )
)

print(f"✓ CORS Enabled for origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
app.include_router(user_api_router)


@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    return Response(status_code=204)




