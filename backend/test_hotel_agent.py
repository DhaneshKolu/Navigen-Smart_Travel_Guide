#!/usr/bin/env python
"""Test script to verify complete hotel fallback flow"""
import asyncio
import json
import httpx
from app.agents.hotel_agent import HotelAgent
from app.agents.state import PlanningState

async def test_hotel_agent_fallback():
    """Test hotel agent with fallback"""
    
    # Create a test state
    state = PlanningState(
        itinerary_id=1,
        city="test_city",  # Non-existent city to trigger fallback
        days=3,
        budget=300,
        interests=["food", "culture"]
    )
    
    # Run hotel agent
    agent = HotelAgent()
    result = await agent.run(state)
    
    print("Hotel Agent Test Results:")
    print(json.dumps(result.hotel_options, indent=2, default=str))
    
    # Verify we got hotels
    hotels = result.hotel_options.get("hotels", [])
    print(f"\n✅ Hotel Agent returned {len(hotels)} hotels")
    
    if len(hotels) > 0:
        first_hotel = hotels[0]
        print(f"✅ First hotel: {first_hotel.get('name')} - ${first_hotel.get('price_per_night')}/night")
        print("✅ Fallback hotel system working correctly!")
    else:
        print("❌ No hotels returned!")
        return False
    
    return True

if __name__ == "__main__":
    success = asyncio.run(test_hotel_agent_fallback())
    exit(0 if success else 1)
