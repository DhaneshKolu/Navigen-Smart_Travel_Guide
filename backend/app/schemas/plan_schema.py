from typing import Dict, List,Optional,Any
from pydantic import BaseModel


class PlanGenerateRequest(BaseModel):
    pace: str = "moderate"
    user_lat: Optional[float] = None
    user_lon: Optional[float] = None
    radius_km: Optional[float] = None
    origin_city: Optional[str] = None


class AgentDecisionResponse(BaseModel):
    agent: str
    explanation: str
    confidence: float


class PlanGenerateResponse(BaseModel):

    plan: Dict[str, Any]

    routes: Dict[str, Any]

    map: Optional[Dict[str, Any]] = None

    decisions: List[AgentDecisionResponse]

    weather: Dict[str, Any]
    
    pace: Optional[str] = "moderate"
    
    hotels: Optional[Dict[str, Any]] = None
    
    cuisines: Optional[Dict[str, Any]] = None

    commute_options: Optional[Dict[str, Any]] = None

    cost_breakdown: Optional[Dict[str, Any]] = None