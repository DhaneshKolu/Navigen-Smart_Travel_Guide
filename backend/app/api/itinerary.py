from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.db.models.itinerary import Itinerary
from app.db.models.generated_plan import GeneratedPlan
from pydantic import BaseModel

router = APIRouter(prefix="/itineraries", tags=["Itineraries"])


class CreateItineraryRequest(BaseModel):
    user_id: int
    destination: str
    days: int
    comfort_radius: float = 5.0
    budget: int = 0
    travel_budget: int = 0
    hotel_budget: int = 0
    food_budget: int = 0
    pace: str = "moderate"
    trip_start_date: date | None = None


class ItineraryResponse(BaseModel):
    id: int
    user_id: int
    destination: str
    days: int
    comfort_radius: float
    budget: float
    travel_budget: int = 0
    hotel_budget: int = 0
    food_budget: int = 0
    pace: str
    trip_start_date: date | None
    has_saved_plan: bool = False

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ItineraryResponse])
def get_itineraries(user_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Itinerary)
    if user_id is not None:
        query = query.filter(Itinerary.user_id == user_id)

    itineraries = query.order_by(Itinerary.id.desc()).all()
    if not itineraries:
        return []

    itinerary_ids = [it.id for it in itineraries]
    saved_rows = (
        db.query(GeneratedPlan.itinerary_id)
        .filter(GeneratedPlan.itinerary_id.in_(itinerary_ids))
        .distinct()
        .all()
    )
    saved_ids = {row[0] for row in saved_rows}

    return [
        ItineraryResponse(
            id=it.id,
            user_id=it.user_id,
            destination=it.destination or "",
            days=it.days or 1,
            comfort_radius=it.comfort_radius or 5.0,
            budget=it.budget or 0.0,
            travel_budget=it.travel_budget or 0,
            hotel_budget=it.hotel_budget or 0,
            food_budget=it.food_budget or 0,
            pace=it.pace or "moderate",
            trip_start_date=it.trip_start_date,
            has_saved_plan=it.id in saved_ids,
        )
        for it in itineraries
    ]


@router.get("/{itinerary_id}", response_model=ItineraryResponse)
def get_itinerary(itinerary_id: int, db: Session = Depends(get_db)):
    itinerary = db.query(Itinerary).filter(Itinerary.id == itinerary_id).first()
    if not itinerary:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    has_saved = (
        db.query(GeneratedPlan)
        .filter(GeneratedPlan.itinerary_id == itinerary.id)
        .first()
        is not None
    )
    return ItineraryResponse(
        id=itinerary.id,
        user_id=itinerary.user_id,
        destination=itinerary.destination or "",
        days=itinerary.days or 1,
        comfort_radius=itinerary.comfort_radius or 5.0,
        budget=itinerary.budget or 0.0,
        travel_budget=itinerary.travel_budget or 0,
        hotel_budget=itinerary.hotel_budget or 0,
        food_budget=itinerary.food_budget or 0,
        pace=itinerary.pace or "moderate",
        trip_start_date=itinerary.trip_start_date,
        has_saved_plan=has_saved,
    )


@router.post("/", response_model=ItineraryResponse)
def create_itinerary(request: CreateItineraryRequest, db: Session = Depends(get_db)):

    itinerary = Itinerary(
        user_id=request.user_id,
        destination=request.destination,
        days=request.days,
        comfort_radius=request.comfort_radius,
        budget=request.budget,
        travel_budget=request.travel_budget,
        hotel_budget=request.hotel_budget,
        food_budget=request.food_budget,
        pace=request.pace,
        trip_start_date=request.trip_start_date,
    )

    db.add(itinerary)
    db.commit()
    db.refresh(itinerary)

    return ItineraryResponse(
        id=itinerary.id,
        user_id=itinerary.user_id,
        destination=itinerary.destination or "",
        days=itinerary.days or 1,
        comfort_radius=itinerary.comfort_radius or 5.0,
        budget=itinerary.budget or 0.0,
        travel_budget=itinerary.travel_budget or 0,
        hotel_budget=itinerary.hotel_budget or 0,
        food_budget=itinerary.food_budget or 0,
        pace=itinerary.pace or "moderate",
        trip_start_date=itinerary.trip_start_date,
        has_saved_plan=False,
    )