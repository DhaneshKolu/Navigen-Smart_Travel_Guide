from app.agents.state import PlanningState


def itinerary_to_state(itinerary):

    return PlanningState(
        itinerary_id=itinerary.id,
        city=itinerary.destination,
        days=itinerary.days,
        interests=["general"],
        budget=getattr(itinerary, "budget", 0) or 0,
        pace=getattr(itinerary, "pace", "moderate") or "moderate",
        trip_start_date=getattr(itinerary, "trip_start_date", None),
    )
