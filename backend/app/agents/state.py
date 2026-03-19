from pydantic import BaseModel, Field, computed_field
from typing import Dict, List, Any,Optional
from datetime import date



class AgentDecision(BaseModel):
    agent: str
    explanation: str
    confidence: float


class PlanningState(BaseModel):

    itinerary_id: int
    city: str
    days: int
    interests: List[str]
    budget: float
    pace: str = "moderate"

    weather_info: Dict[str, Any] = Field(default_factory=dict)
    cuisine_recommendations: Dict[str, Any] = Field(default_factory=dict)
    route_plan: Dict[str, Any] = Field(default_factory=dict)
    hotel_options: Dict[str, Any] = Field(default_factory=dict)
    daily_plan: Dict[str, Any] = Field(default_factory=dict)
    places: List[Any] = Field(default_factory=list)
    agent_decisions: List[AgentDecision] = Field(default_factory=list)
    execution_log: List[str] = Field(default_factory=list)
    user_lat: Optional[float] = None
    user_lon: Optional[float] = None
    radius_km: Optional[float] = 5.0
    trip_start_date: Optional[date] = None

    @computed_field
    @property
    def weather(self) -> Dict[str, Any]:
        """Computed field that returns weather_info when accessed"""
        print(f"[PlanningState] Executing weather getter for {self.city}")
        return self.weather_info
