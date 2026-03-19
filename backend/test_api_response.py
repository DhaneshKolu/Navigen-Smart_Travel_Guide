#!/usr/bin/env python
"""Test to check actual API response"""
import asyncio
import json
import httpx

async def test_api():
    async with httpx.AsyncClient() as client:
        # Try to make a plan generation request
        payload = {
            "pace": "moderate",
            "user_lat": None,
            "user_lon": None,
            "radius_km": 5.0
        }
        
        try:
            response = await client.post(
                "http://localhost:8000/travel/1/generate_plan",
                json=payload,
                timeout=30
            )
            
            print(f"Status Code: {response.status_code}")
            data = response.json()
            
            print("\n=== API RESPONSE ===")
            print(f"Has 'plan': {'plan' in data}")
            print(f"Has 'cuisines': {'cuisines' in data}")
            print(f"Has 'hotels': {'hotels' in data}")
            
            if 'cuisines' in data:
                print(f"\nCuisines data type: {type(data['cuisines'])}")
                print(f"Cuisines keys: {list(data['cuisines'].keys()) if isinstance(data['cuisines'], dict) else 'Not a dict'}")
                
                if isinstance(data['cuisines'], dict) and len(data['cuisines']) > 0:
                    first_day = list(data['cuisines'].keys())[0]
                    print(f"\nFirst day cuisine data:")
                    print(json.dumps(data['cuisines'][first_day], indent=2)[:500])
            
            if 'hotels' in data:
                print(f"\nHotels data type: {type(data['hotels'])}")
                if isinstance(data['hotels'], dict):
                    print(f"Hotels keys: {list(data['hotels'].keys())}")
                    print(f"Hotels status: {data['hotels'].get('status')}")
                    print(f"Hotels count: {data['hotels'].get('num_hotels_found')}")
            
        except Exception as e:
            print(f"Error: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(test_api())
