#!/usr/bin/env python
"""Direct test of agent execution"""
import asyncio
import json
from app.agents.orchestrator_agent import TravelOrchestrator
from app.agents.state import PlanningState
from app.agents.weather_agent import WeatherAgent
from app.agents.cuisine_agent import CuisineAgent
from app.agents.hotel_agent import HotelAgent
from app.agents.day_planning_agent import DayPlanningAgent
from app.agents.route_agent import RouteAgent
from app.agents.evaluation_agent import EvaluationAgent

async def test_agents():
    """Test agent execution"""
    
    state = PlanningState(
        itinerary_id=1,
        city="Goa",
        days=3,
        budget=1500,
        interests=["food", "beach", "culture"]
    )
    
    agents = [
        WeatherAgent(),
        CuisineAgent(),
        HotelAgent(),
        DayPlanningAgent(),
        RouteAgent(),
        EvaluationAgent(),
    ]
    
    orchestrator = TravelOrchestrator(agents)
    
    print("=" * 60)
    print("Running agents...")
    print("=" * 60)
    
    state = await orchestrator.execute_full(state)
    
    print("\n" + "=" * 60)
    print("AGENT RESULTS:")
    print("=" * 60)
    
    print(f"\n✓ Weather: {type(state.weather_info).__name__} with {len(state.weather_info if isinstance(state.weather_info, dict) else {}) if state.weather_info else 0} keys")
    
    print(f"✓ Cuisines: {type(state.cuisine_recommendations).__name__}")
    if isinstance(state.cuisine_recommendations, dict):
        print(f"  - Days: {list(state.cuisine_recommendations.keys())}")
        for day, data in state.cuisine_recommendations.items():
            restaurants = data.get('restaurants', [])
            print(f"  - {day}: {len(restaurants)} restaurants")
    
    print(f"✓ Hotels: {type(state.hotel_options).__name__}")
    if isinstance(state.hotel_options, dict):
        print(f"  - Keys: {list(state.hotel_options.keys())}")
        print(f"  - Status: {state.hotel_options.get('status')}")
        print(f"  - Hotels found: {state.hotel_options.get('num_hotels_found')}")
        hotels = state.hotel_options.get('hotels', [])
        print(f"  - Hotels list length: {len(hotels)}")
        if hotels:
            print(f"  - First hotel: {hotels[0].get('name')}")
    else:
        print(f"  ERROR: hotel_options is not a dict! Type: {type(state.hotel_options)}")
    
    print(f"✓ Daily Plan: {type(state.daily_plan).__name__}")
    if isinstance(state.daily_plan, dict):
        print(f"  - Keys: {list(state.daily_plan.keys())}")

if __name__ == "__main__":
    asyncio.run(test_agents())
