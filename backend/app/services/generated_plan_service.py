import asyncio
from app.agents.orchestrator_agent import OrchestratorAgent
from app.agents.state import PlanningState
from app.services.places_service import PlacesService
from app.db.session import SessionLocal

def generate_travel_plan(
        user_id:int,
        destination:str,
        days:int,
        pace: str = "moderate"
)->dict:
    print("GENERATE PLAN ENDPOINT CALLED")
    db = SessionLocal()
    places_service = PlacesService(db)

    state = PlanningState(
        user_id=user_id,
        destination=destination,
        days=days,
        pace=pace
    )

    # Fetch restaurants as example category
    places = asyncio.run(
        places_service.get_or_fetch_places(destination, "restaurant")
    )

    state.places = places

    orchestrator = OrchestratorAgent()
    final_state = orchestrator.run(state)

    return final_state.final_plan