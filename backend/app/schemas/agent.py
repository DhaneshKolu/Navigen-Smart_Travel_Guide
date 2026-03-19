from pydantic import BaseModel
from typing import Optional

class GeneratePlanRequest(BaseModel):
    pace: Optional[str] = "moderate"

from typing import Dict, Any

class GeneratePlanResponse(BaseModel):
    destination: str
    days: int
    pace: str
    day_wise_plan: Dict[int, list]
    weather: Dict[int, dict]
    hotels: list
    food: list
    routes: dict
    evaluation: dict
