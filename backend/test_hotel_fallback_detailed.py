#!/usr/bin/env python
"""Test script to verify hotel fallback mechanism with invalid city"""
import asyncio
import json
from app.agents.hotel_agent import HotelAgent
from app.agents.state import PlanningState

async def test_hotel_agent_fallback_invalid():
    """Test hotel agent fallback with invalid city"""
    
    # Create a test state with invalid city to force fallback
    state = PlanningState(
        itinerary_id=1,
        city="xyzinvalidcityx",  # Invalid city to trigger fallback
        days=3,
        budget=300,
        interests=["food", "culture"]
    )
    
    # Run hotel agent
    agent = HotelAgent()
    result = await agent.run(state)
    
    print("Hotel Agent Fallback Test (Invalid City):")
    hotels = result.hotel_options.get("hotels", [])
    print(f"Hotels returned: {len(hotels)}")
    
    if len(hotels) > 0:
        first_hotel = hotels[0]
        print(f"First hotel: {first_hotel.get('name')} - ${first_hotel.get('price_per_night', 'N/A')}/night")
        print(f"Hotel source: {first_hotel.get('source', 'unknown')}")
        if first_hotel.get('source') != 'openstreetmap':
            print("✅ Fallback hotel was returned!")
        return True
    else:
        print("❌ No hotels returned!")
        return False

async def test_hotel_agent_budget_filtering():
    """Test hotel agent with different budgets"""
    
    budgets = [40, 100, 250, None]
    
    for budget in budgets:
        state = PlanningState(
            itinerary_id=1,
            city="xyzinvalidcity",
            days=3,
            budget=budget if budget else 200,
            interests=["food", "culture"]
        )
        
        agent = HotelAgent()
        result = await agent.run(state)
        hotels = result.hotel_options.get("hotels", [])
        
        if len(hotels) > 0:
            first_hotel = hotels[0]
            price = first_hotel.get('price_per_night', 'N/A')
            budget_label = f"${budget}/night" if budget else "No budget specified"
            print(f"\nBudget {budget_label}: Got {len(hotels)} hotels")
            print(f"  First: {first_hotel.get('name')} - ${price}/night")

if __name__ == "__main__":
    print("=" * 60)
    print("TEST 1: Fallback with Invalid City")
    print("=" * 60)
    success1 = asyncio.run(test_hotel_agent_fallback_invalid())
    
    print("\n" + "=" * 60)
    print("TEST 2: Budget Filtering")
    print("=" * 60)
    asyncio.run(test_hotel_agent_budget_filtering())
    
    print("\n✅ All tests completed!")
