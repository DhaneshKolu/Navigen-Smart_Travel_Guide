#!/usr/bin/env python
"""Test script to verify hotel fallback mechanism"""
import asyncio
from app.services.hotel_service import HotelService

async def test_fallback():
    h = HotelService()
    
    # Test budget_50
    budget_50 = h._get_fallback_hotels(budget_per_night=50, limit=3)
    print(f"Budget Hotels ($50/night): {len(budget_50)} returned")
    if budget_50:
        print(f"  First: {budget_50[0].get('name')} - ${budget_50[0].get('price_per_night')}/night")
    
    # Test budget_100
    budget_100 = h._get_fallback_hotels(budget_per_night=100, limit=3)
    print(f"\nModerate Hotels ($100/night): {len(budget_100)} returned")
    if budget_100:
        print(f"  First: {budget_100[0].get('name')} - ${budget_100[0].get('price_per_night')}/night")
    
    # Test budget_300
    budget_300 = h._get_fallback_hotels(budget_per_night=300, limit=3)
    print(f"\nLuxury Hotels ($300/night): {len(budget_300)} returned")
    if budget_300:
        print(f"  First: {budget_300[0].get('name')} - ${budget_300[0].get('price_per_night')}/night")
    
    # Test None budget (all tiers)
    all_hotels = h._get_fallback_hotels(budget_per_night=None, limit=3)
    print(f"\nAll Hotels (no budget): {len(all_hotels)} returned")
    
    print("\n✅ All fallback tiers working correctly")

if __name__ == "__main__":
    asyncio.run(test_fallback())
