from fastapi import APIRouter, HTTPException
from app.services.weather_service import get_forecast

router = APIRouter(prefix="/weather", tags=["Weather"])

@router.get("/{city}")
async def fetch_weather(city: str):

    weather = await get_forecast(city)

    if not weather:
        raise HTTPException(status_code=404, detail="Weather not found")

    return weather
