from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx
from app.core.settings import settings

from app.db.session import get_db
from app.db.models.itinerary import Itinerary
from app.db.models.generated_plan import GeneratedPlan

from app.schemas.plan_schema import (
    PlanGenerateRequest,
    PlanGenerateResponse,
    AgentDecisionResponse,
)

from app.agents.orchestrator_agent import TravelOrchestrator

import json
import asyncio

from app.utils.mappers import itinerary_to_state


router = APIRouter(prefix="/travel", tags=["Travel"])

from app.agents.weather_agent import WeatherAgent
from app.agents.cuisine_agent import CuisineAgent
from app.agents.route_agent import RouteAgent
from app.agents.hotel_agent import HotelAgent
from app.agents.day_planning_agent import DayPlanningAgent
from app.agents.evaluation_agent import EvaluationAgent
from app.services.places_service import PlacesService
from app.services.hotel_service import HotelService
from app.utils.map_utils import build_geojson
from app.services.geo_service import GeoService
from app.ml.features import haversine_km
from app.schemas.travel import NearbyPlacesRequest, NearbyHotelsRequest

agents = [
    WeatherAgent(),
    CuisineAgent(),
    HotelAgent(),
    DayPlanningAgent(),
    RouteAgent(),
    EvaluationAgent(),
]

orchestrator = TravelOrchestrator(agents)


async def _estimate_commute_options(origin_city: str | None, destination_city: str):
    if not origin_city:
        return {
            "origin_city": None,
            "destination_city": destination_city,
            "distance_km": None,
            "options": [],
            "selected": None,
        }

    geo = GeoService()
    try:
        origin = await geo.geocode(origin_city)
        dest = await geo.geocode(destination_city)
    except Exception:
        origin = None
        dest = None

    if not origin or not dest:
        return {
            "origin_city": origin_city,
            "destination_city": destination_city,
            "distance_km": None,
            "options": [],
            "selected": None,
        }

    distance_km = round(haversine_km(origin[0], origin[1], dest[0], dest[1]), 1)

    live_options = await _fetch_live_commute_options(origin_city, destination_city)
    if live_options:
        live_options.sort(key=lambda x: x.get("estimated_cost", float("inf")))
        return {
            "origin_city": origin_city,
            "destination_city": destination_city,
            "distance_km": distance_km,
            "options": live_options,
            "selected": live_options[0],
            "data_source": "google_directions_live",
        }

    options = [
        {
            "mode": "flight",
            "duration_hr": max(1.5, round(distance_km / 650 + 1.0, 1)),
            "estimated_cost": int(distance_km * 6.5 + 1800),
        },
        {
            "mode": "train",
            "duration_hr": max(4.0, round(distance_km / 58, 1)),
            "estimated_cost": int(distance_km * 1.6 + 250),
        },
        {
            "mode": "bus",
            "duration_hr": max(5.0, round(distance_km / 45, 1)),
            "estimated_cost": int(distance_km * 1.1 + 150),
        },
        {
            "mode": "car",
            "duration_hr": max(5.0, round(distance_km / 52, 1)),
            "estimated_cost": int(distance_km * 2.8),
        },
    ]

    options.sort(key=lambda x: x["estimated_cost"])
    return {
        "origin_city": origin_city,
        "destination_city": destination_city,
        "distance_km": distance_km,
        "options": options,
        "selected": options[0] if options else None,
        "data_source": "estimated_fallback",
    }


async def _fetch_live_commute_options(origin_city: str, destination_city: str):
    api_key = getattr(settings, "GOOGLE_PLACES_API_KEY", "")
    if not api_key:
        return []

    url = "https://maps.googleapis.com/maps/api/directions/json"
    departure_time = "now"

    queries = [
        {"mode": "transit", "transit_mode": "bus", "label": "bus"},
        {"mode": "transit", "transit_mode": "rail", "label": "train/metro"},
        {"mode": "driving", "label": "car"},
    ]

    options = []
    async with httpx.AsyncClient(timeout=12.0) as client:
        for q in queries:
            params = {
                "origin": origin_city,
                "destination": destination_city,
                "mode": q["mode"],
                "departure_time": departure_time,
                "key": api_key,
            }
            if q.get("transit_mode"):
                params["transit_mode"] = q["transit_mode"]

            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                payload = resp.json()
                if payload.get("status") != "OK":
                    continue

                route = (payload.get("routes") or [])[0]
                leg = ((route.get("legs") or [])[0]) if route else None
                if not leg:
                    continue

                seconds = (leg.get("duration", {}) or {}).get("value", 0)
                duration_hr = round(seconds / 3600, 2) if seconds else None

                fare_obj = payload.get("fare") or {}
                fare_val = fare_obj.get("value")
                if fare_val is None:
                    # Conservative fallback only when fare missing from live response.
                    distance_txt = (leg.get("distance", {}) or {}).get("value", 0)
                    km = (distance_txt or 0) / 1000
                    fare_val = int(km * (2.0 if q["mode"] == "transit" else 3.0))

                options.append({
                    "mode": q["label"],
                    "duration_hr": duration_hr,
                    "estimated_cost": int(fare_val or 0),
                    "distance_text": (leg.get("distance", {}) or {}).get("text"),
                    "duration_text": (leg.get("duration", {}) or {}).get("text"),
                    "provider": "google_directions",
                })
            except Exception:
                continue

    return options


def _build_cost_breakdown(total_budget: float, days: int, hotels: dict, commute: dict, itinerary):
    total_budget = float(total_budget or 0)
    if total_budget <= 0:
        return {
            "total_budget": 0,
            "travel_to_destination": 0,
            "stay": 0,
            "food": 0,
            "local_transport": 0,
            "activities": 0,
            "remaining": 0,
            "within_budget": True,
        }

    travel_cost = 0
    if isinstance(commute, dict):
        selected = commute.get("selected") or {}
        travel_cost = float(selected.get("estimated_cost") or 0)

    configured_hotel = float(getattr(itinerary, "hotel_budget", 0) or 0)
    configured_food = float(getattr(itinerary, "food_budget", 0) or 0)
    configured_travel = float(getattr(itinerary, "travel_budget", 0) or 0)

    if configured_travel > 0:
        travel_cost = configured_travel

    stay_cost = configured_hotel if configured_hotel > 0 else float((hotels or {}).get("budget_estimate") or (total_budget * 0.4))
    food_cost = configured_food if configured_food > 0 else max(days, 1) * (1200 if total_budget > 40000 else 700)
    local_transport = max(days, 1) * 350

    used = travel_cost + stay_cost + food_cost + local_transport
    activities = max(total_budget - used, 0)
    used += activities

    return {
        "pricing_mode": "live_when_available",
        "commute_data_source": (commute or {}).get("data_source") if isinstance(commute, dict) else None,
        "total_budget": round(total_budget, 2),
        "travel_to_destination": round(travel_cost, 2),
        "stay": round(stay_cost, 2),
        "food": round(food_cost, 2),
        "local_transport": round(local_transport, 2),
        "activities": round(activities, 2),
        "remaining": round(total_budget - used, 2),
        "within_budget": used <= total_budget,
    }


@router.post("/places/search")
async def search_places_live(
    request: NearbyPlacesRequest,
    db: Session = Depends(get_db),
):
    places_service = PlacesService(db)
    places = await places_service.get_or_fetch_places(
        city=request.city,
        categories=request.categories,
        limit=request.limit,
        refresh=request.refresh,
    )

    return {
        "city": request.city,
        "categories": request.categories,
        "count": len(places),
        "places": [
            {
                "name": place.name,
                "category": place.category,
                "latitude": place.latitude,
                "longitude": place.longitude,
                "address": place.address,
                "source": place.source,
                "external_id": place.external_id,
            }
            for place in places
        ],
    }


@router.post("/hotels/search")
async def search_hotels_live(request: NearbyHotelsRequest):
    hotel_service = HotelService()
    hotels = await hotel_service.search_hotels(
        city=request.city,
        budget_per_night=request.budget_per_night,
        limit=request.limit,
        center_lat=request.center_lat,
        center_lon=request.center_lon,
    )
    return {
        "city": request.city,
        "count": len(hotels),
        "hotels": hotels,
    }



@router.post("/{itinerary_id}/generate_plan", response_model=PlanGenerateResponse)
async def generate_plan(
    itinerary_id: int,
    request: PlanGenerateRequest,
    db: Session = Depends(get_db),
):

    itinerary = (
        db.query(Itinerary)
        .filter(Itinerary.id == itinerary_id)
        .first()
    )

    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    state = itinerary_to_state(itinerary)
    state.pace = request.pace
    state.user_lat = request.user_lat
    state.user_lon = request.user_lon
    state.radius_km = (
        request.radius_km
        if request.radius_km is not None
        else (itinerary.comfort_radius or 5.0)
    )
    
    places_service = PlacesService(db)
    
    try:
        state.places = await places_service.get_or_fetch_places(
            itinerary.destination
        )
    except Exception as e:
        print(f"Places service error: {e}")
        state.places = []

    # Now run agents
    print("Before orchestrator")
    try:
        state = await orchestrator.execute_full(state)
    except Exception as e:
        print(f"Orchestrator error: {e}")
        raise HTTPException(status_code=500, detail=f"Plan generation failed: {str(e)}")
    
    print("After orchestrator")

    try:
        map_data = build_geojson(state)
    except Exception as e:
        print(f"Map generation error: {e}")
        map_data = None

    decisions = [
        AgentDecisionResponse(
            agent=d.agent,
            explanation=d.explanation,
            confidence=d.confidence,
        )
        for d in state.agent_decisions
    ]

    response_payload = {
        "plan": state.daily_plan or {},
        "routes": state.route_plan or {},
        "map": map_data,
        "decisions": [d.model_dump() for d in decisions],
        "weather": state.weather_info or {},
        "pace": state.pace,
        "hotels": state.hotel_options or {},
        "cuisines": state.cuisine_recommendations or {},
        "commute_options": await _estimate_commute_options(request.origin_city, itinerary.destination),
    }
    response_payload["cost_breakdown"] = _build_cost_breakdown(
        itinerary.budget,
        itinerary.days,
        response_payload["hotels"],
        response_payload["commute_options"],
        itinerary,
    )

    # Persist the full generated payload so reloading saved plans keeps
    # cuisines/hotels/weather/decisions available in UI.
    try:
        generated_plan = GeneratedPlan(
            itinerary_id=itinerary.id,
            plan_data=json.loads(json.dumps(response_payload))
        )
        db.add(generated_plan)
        db.commit()
    except Exception as e:
        print(f"Database save error: {e}")

    return PlanGenerateResponse(
        plan=response_payload["plan"],
        routes=response_payload["routes"],
        map=response_payload["map"],
        decisions=decisions,
        weather=response_payload["weather"],
        pace=response_payload["pace"],
        hotels=response_payload["hotels"],
        cuisines=response_payload["cuisines"],
        commute_options=response_payload["commute_options"],
        cost_breakdown=response_payload["cost_breakdown"],
    )


@router.get("/{itinerary_id}/saved_plan", response_model=PlanGenerateResponse)
async def get_saved_plan(
    itinerary_id: int,
    db: Session = Depends(get_db),
):
    """Fetch the latest saved plan for an itinerary"""
    
    itinerary = (
        db.query(Itinerary)
        .filter(Itinerary.id == itinerary_id)
        .first()
    )

    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")

    # Get the latest generated plan
    generated_plan = (
        db.query(GeneratedPlan)
        .filter(GeneratedPlan.itinerary_id == itinerary_id)
        .order_by(GeneratedPlan.id.desc())
        .first()
    )

    if not generated_plan:
        raise HTTPException(status_code=404, detail="No saved plan found for this itinerary")

    stored = generated_plan.plan_data or {}

    # New format stores the full payload. Legacy format stored only the plan map.
    if isinstance(stored, dict) and "plan" in stored:
        return PlanGenerateResponse(
            plan=stored.get("plan", {}),
            routes=stored.get("routes", {}),
            map=stored.get("map"),
            decisions=stored.get("decisions", []),
            weather=stored.get("weather", {}),
            pace=stored.get("pace", "moderate"),
            hotels=stored.get("hotels", {}),
            cuisines=stored.get("cuisines", {}),
            commute_options=stored.get("commute_options", {}),
            cost_breakdown=stored.get("cost_breakdown", {}),
        )

    return PlanGenerateResponse(
        plan=stored if isinstance(stored, dict) else {},
        routes={},
        map=None,
        decisions=[],
        weather={},
        pace="moderate",
        hotels={},
        cuisines={},
        commute_options={},
        cost_breakdown={},
    )


from app.schemas.replan_schema import ReplanRequest
from app.services.plan_service import get_latest_plan
import json


@router.post("/{itinerary_id}/replan")
async def replan_trip(
    itinerary_id: int,
    request: ReplanRequest,
    db: Session = Depends(get_db),
):

    itinerary = (
        db.query(Itinerary)
        .filter(Itinerary.id == itinerary_id)
        .first()
    )

    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")


    latest_plan = get_latest_plan(db, itinerary_id)

    if not latest_plan:
        raise HTTPException(status_code=404, detail="No existing plan found")


    from app.utils.mappers import itinerary_to_state

    state = itinerary_to_state(itinerary)

    state.daily_plan = latest_plan.plan_data

   
    if request.new_budget is not None:
        state.budget = request.new_budget

    if request.new_interests is not None:
        state.interests = request.new_interests

   
    changed_fields = []

    if request.new_budget is not None:
        state.budget = request.new_budget
        changed_fields.append("budget")

    if request.new_interests is not None:
        state.interests = request.new_interests
        changed_fields.append("interests")

    state = await orchestrator.execute_partial(state, changed_fields)


   
    new_version = (latest_plan.version or 1) + 1

    new_plan = GeneratedPlan(
        itinerary_id=itinerary_id,
        plan_data=json.loads(json.dumps(state.daily_plan)),
        version=new_version
    )

    db.add(new_plan)
    db.commit()

    
    return {
        "plan": state.daily_plan,
        "version": new_version,
        "decisions": [
            {
                "agent": d.agent,
                "explanation": d.explanation,
                "confidence": d.confidence,
            }
            for d in state.agent_decisions
        ],
    }

    