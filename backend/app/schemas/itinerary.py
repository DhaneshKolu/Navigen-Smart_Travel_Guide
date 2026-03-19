from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date

class TravelRequest(BaseModel):
    destination: str
    days: int
    budget: Optional[float] = None
    pace: Optional[str] = None
    trip_start_date: Optional[date] = None

class ItineraryResponse(BaseModel):
    id: int
    destination: str
    days: int
    budget: Optional[float] = 0.0
    pace: Optional[str] = "moderate"
    trip_start_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)