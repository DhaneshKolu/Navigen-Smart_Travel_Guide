import asyncio
from datetime import datetime, timedelta, timezone
from math import ceil
from math import asin, cos, radians, sin, sqrt
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models.trip import Trip
from app.db.models.user import User
from app.db.session import get_db
from app.ml.ranking import rank_places_for_day
from app.services.geo_service import GeoService
from app.services.hotel_service import HotelService
from app.services.places_service import fetch_real_hotels_with_fallback, fetch_real_restaurants_with_fallback
from app.services.transport_service import calculate_transport_cost


router = APIRouter(prefix="/api", tags=["Plan API"])


HOTEL_CAPS = {
    "Budget": {
        "max_usd": 6,
        "max_inr": 500,
        "types": [
            "hostel", "dormitory", "oyo", "guesthouse", "paying guest",
            "dharamshala", "lodge", "budget inn", "railway retiring room",
        ],
        "keywords": "cheapest budget hostel dormitory OYO",
    },
    "Relaxed": {
        "max_usd": 18,
        "max_inr": 1500,
        "types": ["budget hotel", "oyo premium", "airbnb room", "guesthouse", "homestay", "2-star hotel"],
        "keywords": "budget hotel guesthouse 2-star affordable",
    },
    "Luxury": {
        "max_usd": 35,
        "max_inr": 2900,
        "types": ["3-star hotel", "business hotel", "boutique hotel", "airbnb apartment"],
        "keywords": "3-star business hotel mid-range",
    },
    "Ultra": {
        "max_usd": 9999,
        "max_inr": 999999,
        "types": ["5-star", "luxury resort", "heritage hotel", "palace hotel", "oberoi", "taj", "leela"],
        "keywords": "luxury 5-star resort premium",
    },
}

HOTEL_FLOOR_USD = {
    "Budget": 3,
    "Relaxed": 10,
    "Luxury": 18,
    "Ultra": 35,
}

FOOD_CAPS = {
    "Budget": {
        "max_usd": 2,
        "max_inr": 166,
        "types": [
            "street food", "dhaba", "thali", "chai stall", "pani puri", "vada pav",
            "local canteen", "government canteen", "udupi restaurant",
        ],
        "keywords": "cheapest street food dhaba thali canteen",
    },
    "Relaxed": {
        "max_usd": 6,
        "max_inr": 500,
        "types": ["local restaurant", "dhaba", "fast food", "food court", "udupi", "darshini", "meals"],
        "keywords": "local restaurant affordable meals",
    },
    "Luxury": {
        "max_usd": 15,
        "max_inr": 1250,
        "types": ["mid-range restaurant", "cafe", "bistro", "multi-cuisine restaurant"],
        "keywords": "mid-range restaurant cafe dining",
    },
    "Ultra": {
        "max_usd": 9999,
        "max_inr": 999999,
        "types": ["fine dining", "rooftop restaurant", "michelin", "celebrity chef", "5-star restaurant"],
        "keywords": "fine dining luxury restaurant premium",
    },
}

STOP_CAPS = {
    "Budget": {"max_usd": 5, "prefer": ["free", "public park", "government museum", "temple", "beach", "market"]},
    "Relaxed": {"max_usd": 15, "prefer": ["low-cost attraction", "local experience", "guided walk"]},
    "Luxury": {"max_usd": 40, "prefer": ["paid attraction", "tour", "experience", "show"]},
    "Ultra": {"max_usd": 9999, "prefer": ["exclusive", "private tour", "VIP access", "helicopter", "luxury experience"]},
}

PACE_STOP_RULES = {
        "relaxed": {
                "stops_per_day": 3,
                "duration_multiplier": 1.5,
                "style": """
                RELAXED PACE — 3 stops per day maximum
                - Spend more time at each place
                - Include rest time between stops
                - Add a leisurely lunch break as a stop gap
                - Avoid rushing — quality over quantity
                - Each stop duration should be longer
                - Include sit-down experiences
            """,
        },
        "balanced": {
                "stops_per_day": 4,
                "duration_multiplier": 1.0,
                "style": """
                BALANCED PACE — exactly 4 stops per day
                - Mix of major and minor attractions
                - Reasonable travel time between stops
                - Standard duration at each place
            """,
        },
        "fastpaced": {
                "stops_per_day": 5,
                "duration_multiplier": 0.7,
                "style": """
                FAST PACED — exactly 5 stops per day
                - Cover maximum attractions
                - Shorter time at each stop
                - Prioritize iconic photo spots
                - Efficient routing — minimize travel time
                - Include early morning starts (8AM)
                - Group nearby stops together
                - Quick meals — street food preferred
            """,
        },
}


CITY_FAMOUS_STOPS = {
    "hyderabad": [
        {"name": "Charminar", "lat": 17.3616, "lng": 78.4747, "category": "Culture", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 5:00 PM", "rating": 4.5},
        {"name": "Golconda Fort", "lat": 17.3833, "lng": 78.4011, "category": "Culture", "cost_usd": 0.2, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 5:00 PM", "rating": 4.6},
        {"name": "Salar Jung Museum", "lat": 17.3714, "lng": 78.4804, "category": "Culture", "cost_usd": 0.25, "tier": 1, "booking_required": False, "indoor": True, "best_time": "10:00 AM - 4:30 PM", "rating": 4.5},
        {"name": "Chowmahalla Palace", "lat": 17.3592, "lng": 78.4720, "category": "Culture", "cost_usd": 0.95, "tier": 1, "booking_required": False, "indoor": True, "best_time": "10:00 AM - 5:00 PM", "rating": 4.4},
        {"name": "Qutb Shahi Tombs", "lat": 17.3939, "lng": 78.4012, "category": "Culture", "cost_usd": 0.2, "tier": 2, "booking_required": False, "indoor": False, "best_time": "9:30 AM - 5:30 PM", "rating": 4.4},
        {"name": "Hussain Sagar Lake", "lat": 17.4239, "lng": 78.4738, "category": "Leisure", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "5:00 PM - 8:00 PM", "rating": 4.3},
        {"name": "Birla Mandir", "lat": 17.4062, "lng": 78.4691, "category": "Religious", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "7:00 AM - 11:00 AM", "rating": 4.6},
        {"name": "Mecca Masjid", "lat": 17.3604, "lng": 78.4737, "category": "Religious", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "8:00 AM - 11:00 AM", "rating": 4.6},
        {"name": "Nehru Zoological Park", "lat": 17.3496, "lng": 78.4511, "category": "Leisure", "cost_usd": 0.95, "tier": 3, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 1:00 PM", "rating": 4.3},
        {"name": "Ramoji Film City", "lat": 17.2543, "lng": 78.6808, "category": "Leisure", "cost_usd": 13.8, "tier": 3, "booking_required": True, "indoor": False, "best_time": "9:00 AM - 6:00 PM", "rating": 4.5},
        {"name": "Shilparamam", "lat": 17.4539, "lng": 78.3823, "category": "Culture", "cost_usd": 0.6, "tier": 3, "booking_required": False, "indoor": False, "best_time": "4:00 PM - 8:00 PM", "rating": 4.2},
        {"name": "Laad Bazaar", "lat": 17.3609, "lng": 78.4731, "category": "Culture", "cost_usd": 0.0, "tier": 3, "booking_required": False, "indoor": False, "best_time": "5:00 PM - 9:00 PM", "rating": 4.2},
    ],
    "delhi": [
        {"name": "Red Fort", "lat": 28.6562, "lng": 77.2410, "category": "Culture", "cost_usd": 0.42, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:30 AM - 4:30 PM", "rating": 4.5},
        {"name": "Qutub Minar", "lat": 28.5244, "lng": 77.1855, "category": "Culture", "cost_usd": 0.42, "tier": 1, "booking_required": False, "indoor": False, "best_time": "8:00 AM - 5:00 PM", "rating": 4.5},
        {"name": "India Gate", "lat": 28.6129, "lng": 77.2295, "category": "Culture", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "6:00 PM - 9:00 PM", "rating": 4.6},
        {"name": "Humayun's Tomb", "lat": 28.5933, "lng": 77.2507, "category": "Culture", "cost_usd": 0.42, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 5:00 PM", "rating": 4.5},
        {"name": "Lotus Temple", "lat": 28.5535, "lng": 77.2588, "category": "Religious", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": True, "best_time": "9:00 AM - 11:00 AM", "rating": 4.5},
        {"name": "Akshardham Temple", "lat": 28.6127, "lng": 77.2773, "category": "Religious", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "10:00 AM - 1:00 PM", "rating": 4.7},
        {"name": "Jama Masjid", "lat": 28.6507, "lng": 77.2334, "category": "Religious", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "8:00 AM - 11:00 AM", "rating": 4.4},
        {"name": "Chandni Chowk", "lat": 28.6506, "lng": 77.2303, "category": "Culture", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "4:00 PM - 8:00 PM", "rating": 4.3},
    ],
    "mumbai": [
        {"name": "Gateway of India", "lat": 18.9220, "lng": 72.8347, "category": "Culture", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "7:00 AM - 10:00 AM", "rating": 4.6},
        {"name": "Elephanta Caves", "lat": 18.9633, "lng": 72.9315, "category": "Culture", "cost_usd": 0.48, "tier": 1, "booking_required": True, "indoor": False, "best_time": "9:00 AM - 4:00 PM", "rating": 4.4},
        {"name": "Chhatrapati Shivaji Maharaj Terminus", "lat": 18.9400, "lng": 72.8347, "category": "Culture", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "6:00 PM - 8:00 PM", "rating": 4.5},
        {"name": "Marine Drive", "lat": 18.9438, "lng": 72.8231, "category": "Leisure", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "6:00 PM - 9:00 PM", "rating": 4.7},
        {"name": "Juhu Beach", "lat": 19.0990, "lng": 72.8263, "category": "Nature", "cost_usd": 0.0, "tier": 2, "booking_required": False, "indoor": False, "best_time": "5:00 PM - 8:00 PM", "rating": 4.3},
    ],
    "goa": [
        {"name": "Basilica of Bom Jesus", "lat": 15.5009, "lng": 73.9116, "category": "Religious", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": True, "best_time": "9:00 AM - 12:00 PM", "rating": 4.5},
        {"name": "Fort Aguada", "lat": 15.4943, "lng": 73.7730, "category": "Culture", "cost_usd": 0.3, "tier": 1, "booking_required": False, "indoor": False, "best_time": "4:00 PM - 6:30 PM", "rating": 4.4},
        {"name": "Dudhsagar Falls", "lat": 15.3144, "lng": 74.3144, "category": "Nature", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 2:00 PM", "rating": 4.5},
        {"name": "Calangute Beach", "lat": 15.5439, "lng": 73.7553, "category": "Nature", "cost_usd": 0.0, "tier": 1, "booking_required": False, "indoor": False, "best_time": "5:00 PM - 8:00 PM", "rating": 4.4},
    ],
    "jaipur": [
        {"name": "Amber Fort", "lat": 26.9855, "lng": 75.8513, "category": "Culture", "cost_usd": 1.2, "tier": 1, "booking_required": False, "indoor": False, "best_time": "8:00 AM - 11:00 AM", "rating": 4.6},
        {"name": "City Palace", "lat": 26.9258, "lng": 75.8237, "category": "Culture", "cost_usd": 2.4, "tier": 1, "booking_required": False, "indoor": True, "best_time": "10:00 AM - 1:00 PM", "rating": 4.5},
        {"name": "Hawa Mahal", "lat": 26.9239, "lng": 75.8267, "category": "Culture", "cost_usd": 0.6, "tier": 1, "booking_required": False, "indoor": False, "best_time": "9:00 AM - 11:00 AM", "rating": 4.5},
        {"name": "Jantar Mantar", "lat": 26.9247, "lng": 75.8237, "category": "Culture", "cost_usd": 0.6, "tier": 1, "booking_required": False, "indoor": False, "best_time": "10:00 AM - 3:00 PM", "rating": 4.4},
    ],
}


def _normalize_budget_level(budget_level: str | None) -> str:
    level = (budget_level or "Budget").strip()
    return level if level in HOTEL_CAPS else "Budget"


def build_master_prompt(request) -> str:
    level = _normalize_budget_level(getattr(request, "budget_level", "Budget"))
    destination = getattr(request, "destination", "the destination")
    comfort_radius = getattr(request, "comfort_radius", "flexible")
    vibes = getattr(request, "vibes", []) or []
    days = int(getattr(request, "days", 1) or 1)
    group_type = getattr(request, "group_type", "Solo")
    pace = getattr(request, "pace", "balanced")
    pace_config = PACE_STOP_RULES.get(pace, PACE_STOP_RULES["balanced"])

    hotel = HOTEL_CAPS[level]
    food = FOOD_CAPS[level]
    stop = STOP_CAPS[level]

    city_places = """For this destination, prioritize UNESCO sites, iconic landmarks, famous religious sites, major museums, and top natural attractions."""
    city_key = _match_city_key(destination)
    if city_key and city_key in CITY_FAMOUS_STOPS:
        tier_1 = [s["name"] for s in CITY_FAMOUS_STOPS[city_key] if s.get("tier") == 1]
        tier_2 = [s["name"] for s in CITY_FAMOUS_STOPS[city_key] if s.get("tier") == 2]
        tier_3 = [s["name"] for s in CITY_FAMOUS_STOPS[city_key] if s.get("tier") == 3]
        city_places = (
            f"TIER 1 MUST INCLUDE: {', '.join(tier_1)}\n"
            f"TIER 2 HIGHLY RECOMMENDED: {', '.join(tier_2)}\n"
            f"TIER 3 USE ONLY IF DAYS > 4: {', '.join(tier_3)}"
        )

    return f"""
You are an expert travel planner creating a {days}-day itinerary for {destination}.

TRAVELER PROFILE:
- Group type: {group_type}
- Budget: {level}
- Vibes: {', '.join(vibes)}
- Comfort radius: {comfort_radius}

STRICT BUDGET RULES — THESE ARE HARD LIMITS, NOT SUGGESTIONS:

=== HOTELS ===
Budget level: {level}
Maximum hotel price: ${hotel['max_usd']}/night (₹{hotel['max_inr']}/night)
Allowed hotel types: {', '.join(hotel['types'])}

YOU MUST suggest hotels that cost LESS THAN ${hotel['max_usd']}/night.
DO NOT suggest any hotel above this price under any circumstance.
If the destination has no hotels under this price, suggest the
absolute cheapest available AND set overBudget: true.

=== FOOD ===
Maximum per meal: ${food['max_usd']}/meal (₹{food['max_inr']}/meal)
Allowed food types: {', '.join(food['types'])}

=== ACTIVITIES / STOPS ===
Maximum entry fee: ${stop['max_usd']} per attraction
Preferred stop types: {', '.join(stop['prefer'])}

ACTIVITY ENTRY FEE RULES:
- Return cost_usd as EXACT entry fee or 0.
- NEVER return null or omit this field.
- NEVER average or estimate.

Known Indian attraction entry fees (2024):
FREE (cost_usd: 0):
- India Gate, Lotus Temple, Jama Masjid, beaches,
  markets, Akshardham main temple, Gurudwaras,
  most temples, public parks, Lodi Garden,
  Humayun's Tomb gardens (outer)

PAID (exact fees):
- Red Fort: Indians ₹35 ($0.42)
- Qutub Minar: Indians ₹35 ($0.42)
- Humayun's Tomb: Indians ₹35 ($0.42)
- Agra Fort: Indians ₹50 ($0.60)
- Taj Mahal: Indians ₹50 ($0.60)
- National Museum: ₹20 ($0.24)
- Amber Fort Jaipur: ₹100 ($1.20)
- City Palace Jaipur: ₹200 ($2.40)
- Mysore Palace: ₹100 ($1.20)
- Gateway of India: FREE ($0)
- Marine Drive: FREE ($0)
- Burj Khalifa Dubai: $35
- Dubai Mall: FREE ($0)
- Desert Safari Dubai: $55

If exact fee is unknown, use 0.
DO NOT use average or placeholder values.
DO NOT return 2.5 or 5 as default activity cost.

For each stop/attraction, return REAL entry fee guidance:
- Government museums: ₹20-50 ($0.25-$0.60)
- ASI monuments (Red Fort, Qutub, etc): Indians ₹35, Foreigners ₹550-600
- National parks: ₹100-500
- Temples/Mosques/Gurudwaras: FREE (₹0)
- Beaches: FREE (₹0)
- Markets: FREE (₹0)
- Public parks: ₹5-20
- Private attractions: typically ₹200-2000
- Bollywood studios: often ₹1000+

Return cost_usd as ACTUAL entry fee in USD.
Use 0 for free attractions.
Do not invent random fees.

=== DESTINATION FAMOUS PLACES ===
{city_places}

=== STOP SELECTION RANKING ALGORITHM ===
Score each stop out of 100:
1) Tourist Fame Score (0-40)
2) Vibe Match Score (0-25)
3) Group Suitability Score (0-20)
4) Budget Compatibility Score (0-15)

Only include stops with score >= 50. Sort by score descending.
Max 4 stops per day.

STRICT TOURIST ATTRACTION RULES:
- Suggest only places tourists intentionally travel to visit.
- Allowed examples: monuments, forts, temples/mosques/churches/gurudwaras,
  museums, heritage sites, viewpoints, lakes, waterfalls, famous markets,
  beaches, zoos, theme parks, iconic architecture.
- Forbidden: hotels, hostels, restaurants/cafes, schools, colleges,
  hospitals, malls, offices, residential areas, transport hubs, fuel stations.

COMFORT RADIUS ENFORCEMENT:
- User comfort radius: {comfort_radius}
- walkable: max 5km between consecutive stops
- city: max 20km between consecutive stops
- regional: max 50km between consecutive stops
- flexible: no hard distance limit

OUTPUT FIELDS PER STOP:
- name, description, why_here, lat, lng, cost_usd, duration_minutes, category
- pro_tip, indoor, rating, best_time, tourist_score, booking_required

===============================================================
PACE RULES — STRICTLY FOLLOW:

Selected pace: {pace}
{pace_config['style']}

STOP COUNT PER DAY: EXACTLY {pace_config['stops_per_day']}

YOU MUST return EXACTLY {pace_config['stops_per_day']} stops
per day — not more, not less.

If pace is relaxed:   return 3 stops per day
If pace is balanced:  return 4 stops per day
If pace is fastpaced: return 5 stops per day

Duration multiplier: {pace_config['duration_multiplier']}
Multiply each stop's base duration by this value.
"""


def get_system_prompt(budget_level: str, destination: str, comfort_radius: str = "flexible") -> str:
    class _PromptReq:
        pass

    req = _PromptReq()
    req.budget_level = budget_level
    req.destination = destination
    req.comfort_radius = comfort_radius
    req.vibes = []
    req.days = 1
    req.group_type = "Solo"
    req.pace = "balanced"
    return build_master_prompt(req)


def build_hotel_query(destination: str, budget_level: str) -> str:
    level = _normalize_budget_level(budget_level)
    hotel = HOTEL_CAPS[level]
    return f"""
Find {hotel['keywords']} in {destination}.

Requirements:
- Price MUST be under ${hotel['max_usd']} per night
- Price in INR MUST be under ₹{hotel['max_inr']} per night
- Hotel type must be one of: {', '.join(hotel['types'])}
- Must be a real, bookable property
- Include: name, exact price in USD, exact price in INR,
  star rating, amenities, booking link

Return exactly 3 hotels sorted by price (cheapest first).
If you cannot find hotels under ${hotel['max_usd']}/night,
return the 2 cheapest available with overBudget: true.

DO NOT return: {', '.join(HOTEL_CAPS.get('Ultra', {}).get('types', []))}
"""


def build_food_query(destination: str, budget_level: str, stop_name: str) -> str:
    level = _normalize_budget_level(budget_level)
    food = FOOD_CAPS[level]
    return f"""
Find {food['keywords']} near {stop_name} in {destination}.

Requirements:
- Price per meal MUST be under ${food['max_usd']} per person
- Price in INR MUST be under ₹{food['max_inr']} per person
- Restaurant type: {', '.join(food['types'])}
- Must be within 1km of {stop_name}

Return 3-4 food options with:
- name, restaurant, exact price USD, exact price INR,
  meal type (breakfast/lunch/dinner/snack), rating
"""


def build_stops_query(destination: str, budget_level: str, vibes: list[str], days: int, comfort_radius: str = "flexible") -> str:
    level = _normalize_budget_level(budget_level)
    stop = STOP_CAPS[level]
    return f"""
Find top attractions in {destination} for a {level}
budget traveler interested in: {', '.join(vibes)}.

Requirements:
- Entry fee MUST be under ${stop['max_usd']} per person
- Prefer: {', '.join(stop['prefer'])}
- Include free attractions (temples, parks, beaches, markets)
- Maximum 4 stops per day for {days} days
- User comfort radius: {comfort_radius}

For each stop/attraction, return the REAL entry fee:
- Government museums: ₹20-50 ($0.25-$0.60)
- ASI monuments (Red Fort, Qutub etc): Indians ₹35, Foreigners ₹550-600
- National Parks: ₹100-500
- Temples/Mosques/Gurudwaras: FREE (₹0)
- Beaches: FREE (₹0)
- Markets: FREE (₹0)
- Public parks: ₹5-20
- Private attractions: varies ₹200-2000
- Bollywood studios: ₹1000+

Return cost_usd as the ACTUAL entry fee in USD.
Use 0 for free attractions.
NEVER return null or omit this field.
DO NOT estimate random prices.
DO NOT return 2.5 or 5 as default activity cost.

STRICT TOURIST FILTER:
- Allowed: major attractions with heritage, scenic, cultural, religious,
  or entertainment significance.
- Forbidden: hotels, hostels, restaurants, schools, hospitals, malls,
  offices, transport terminals, petrol pumps, generic localities.

Distance limits between consecutive stops:
- walkable: <=5km
- city: <=20km
- regional: <=50km
- flexible: no limit

Example:
- Red Fort Delhi: cost_usd 0.42 (₹35 Indian price)
- Qutub Minar: cost_usd 0.42 (₹35)
- India Gate: cost_usd 0 (free)
- Lotus Temple: cost_usd 0 (free)
- Jama Masjid: cost_usd 0 (free; optional camera fee separate)
- National Museum Delhi: cost_usd 0.60 (₹50)
- Akshardham: cost_usd 0 (free entry; shows paid)
"""


def validate_and_fix_budget(trip_data: dict, budget_level: str) -> dict:
    level = _normalize_budget_level(budget_level)
    hotel_cap = HOTEL_CAPS[level]["max_usd"]
    food_cap = FOOD_CAPS[level]["max_usd"]
    stop_cap = STOP_CAPS[level]["max_usd"]

    for day in trip_data.get("days", []):
        for hotel in day.get("hotels", []):
            price = float(hotel.get("price_usd", 0) or 0)
            hotel["overBudget"] = price > hotel_cap
            hotel["budgetFitPct"] = round(max(0, (1 - price / hotel_cap) * 100)) if hotel_cap < 9999 and hotel_cap > 0 else 100
            if price > hotel_cap * 3:
                print(f"⚠️  BUDGET VIOLATION: {hotel.get('name', 'Hotel')} ${price}/night (cap: ${hotel_cap})")

        day["hotels"] = sorted(
            day.get("hotels", []),
            key=lambda h: (h.get("overBudget", False), float(h.get("price_usd", 0) or 0)),
        )

        for food in day.get("food", []):
            price = float(food.get("cost_usd", 0) or 0)
            food["overBudget"] = price > food_cap

        day["food"] = sorted(
            day.get("food", []),
            key=lambda f: (f.get("overBudget", False), float(f.get("cost_usd", 0) or 0)),
        )

        for stop in day.get("stops", []):
            price = float(stop.get("cost_usd", 0) or 0)
            stop["overBudget"] = price > stop_cap

    return trip_data


class PlanRequest(BaseModel):
    origin: str
    destination: str
    origin_lat: float | None = None
    origin_lng: float | None = None
    dest_lat: float | None = None
    dest_lng: float | None = None
    days: int
    vibes: list[str] = []
    group_type: str = "Solo"
    budget_level: str = "Budget"
    pace: str = "balanced"
    comfort_radius: str = "flexible"
    comfort_radius_km: float | None = None
    budget_usd_per_day: dict | None = None
    special_requests: str = ""
    hotel_max_usd: float | None = None
    food_max_usd: float | None = None
    stop_max_usd: float | None = None

    def model_post_init(self, __context) -> None:
        level = _normalize_budget_level(self.budget_level)
        self.budget_level = level
        if self.pace not in PACE_STOP_RULES:
            self.pace = "balanced"
        self.hotel_max_usd = HOTEL_CAPS[level]["max_usd"]
        self.food_max_usd = FOOD_CAPS[level]["max_usd"]
        self.stop_max_usd = STOP_CAPS[level]["max_usd"]
        if self.comfort_radius_km is None:
            m = re.match(r"^custom_(\d+)km$", (self.comfort_radius or "").strip().lower())
            if m:
                self.comfort_radius_km = float(m.group(1))


class TripSaveRequest(BaseModel):
    origin: str
    destination: str
    duration_days: int
    destination_country: str | None = None
    local_currency: str | None = None
    center_lat: float | None = None
    center_lng: float | None = None
    vibes: list[str] = []
    group_type: str = ""
    budget_level: str = ""
    pace: str = "balanced"
    comfort_radius: str = ""
    comfort_radius_km: float | None = None
    itinerary: dict


def _infer_geo_from_destination(destination: str) -> tuple[str, str]:
    value = destination.lower()
    if any(x in value for x in ["delhi", "goa", "mumbai", "hyderabad", "india"]):
        return "IN", "INR"
    if any(x in value for x in ["dubai", "abu dhabi", "uae"]):
        return "AE", "AED"
    if "paris" in value or "france" in value:
        return "FR", "EUR"
    if "tokyo" in value or "japan" in value:
        return "JP", "JPY"
    if "singapore" in value:
        return "SG", "SGD"
    if "bangkok" in value or "thailand" in value:
        return "TH", "THB"
    return "US", "USD"


def _map_category(tags: dict) -> str:
    amenity = (tags.get("amenity") or "").lower()
    tourism = (tags.get("tourism") or "").lower()
    historic = (tags.get("historic") or "").lower()
    leisure = (tags.get("leisure") or "").lower()

    if amenity in {"restaurant", "cafe", "fast_food"}:
        return "Food"
    if tourism or historic:
        return "Culture"
    if leisure in {"park", "beach_resort", "nature_reserve"}:
        return "Nature"
    return "Leisure"


_JUNK_STOP_KEYWORDS = {
    "hotel", "oyo", "hostel", "guesthouse", "lodge", "motel", "resort", "inn",
    "restaurant", "dhaba", "cafe", "canteen", "school", "college", "university",
    "hospital", "clinic", "mall", "supermarket", "office", "it park", "tech park",
    "bus stand", "bus depot", "airport", "petrol pump", "apartment", "colony", "society",
}

_TOURIST_STOP_KEYWORDS = {
    "fort", "temple", "mosque", "church", "gurudwara", "museum", "palace", "monument",
    "heritage", "garden", "park", "lake", "waterfall", "beach", "market", "bazaar",
    "tomb", "mausoleum", "bridge", "zoo", "sanctuary", "ghat", "viewpoint", "caves",
}


def _is_valid_tourist_stop(name: str, tags: dict, category: str) -> bool:
    lower_name = (name or "").lower()
    if any(k in lower_name for k in _JUNK_STOP_KEYWORDS):
        return False
    if category == "Food":
        return False

    tourism = str(tags.get("tourism") or "").lower()
    historic = str(tags.get("historic") or "").lower()
    natural = str(tags.get("natural") or "").lower()
    leisure = str(tags.get("leisure") or "").lower()

    if tourism or historic:
        return True
    if natural in {"waterfall", "beach", "peak", "viewpoint", "wood", "cave_entrance"}:
        return True
    if leisure in {"park", "nature_reserve", "garden", "theme_park", "water_park"}:
        return True
    return any(k in lower_name for k in _TOURIST_STOP_KEYWORDS)


def _match_city_key(destination: str) -> str | None:
    d = (destination or "").lower()
    if not d:
        return None
    for city in CITY_FAMOUS_STOPS.keys():
        if city in d or d in city:
            return city
    return None


def _tourist_fame_points(name: str, tier: int | None = None, tags: dict | None = None) -> int:
    if tier == 1:
        return 40
    if tier == 2:
        return 35
    if tier == 3:
        return 25

    hay = (name or "").lower()
    tags = tags or {}
    tourism = str(tags.get("tourism") or "").lower()
    historic = str(tags.get("historic") or "").lower()
    if tourism == "museum" or historic:
        return 25
    if any(k in hay for k in ["fort", "palace", "charminar", "gateway", "unesco", "world heritage"]):
        return 35
    if any(k in hay for k in ["temple", "masjid", "mosque", "church", "cathedral", "dargah"]):
        return 20
    if any(k in hay for k in ["lake", "beach", "garden", "market", "bazaar", "zoo"]):
        return 15
    return 5


def _vibe_match_points(vibes: list[str], name: str, category: str) -> int:
    if not vibes:
        return 12

    category_l = (category or "").lower()
    hay = f"{name or ''} {category or ''}".lower()
    vibe_map = {
        "Culture": ["culture", "heritage", "museum", "fort", "palace", "monument", "religious"],
        "Nature": ["nature", "park", "lake", "beach", "waterfall", "viewpoint", "garden"],
        "Food": ["food", "market", "bazaar", "street"],
        "Nightlife": ["night", "lake", "road", "bazaar", "show"],
        "Adventure": ["adventure", "fort", "trek", "caves", "waterfall"],
        "Leisure": ["leisure", "lake", "garden", "road", "park", "scenic"],
        "Wellness": ["temple", "garden", "lake", "peace", "spiritual"],
        "Shopping": ["market", "bazaar", "shopping"],
    }

    best = 0
    for vibe in vibes:
        keys = vibe_map.get(vibe, [vibe.lower()])
        if any(k in hay for k in keys) or any(k in category_l for k in keys):
            best = max(best, 25)
        elif any(k[:4] in hay for k in keys if len(k) >= 4):
            best = max(best, 12)
    return best


def _group_suitability_points(group_type: str, stop_name: str, category: str) -> int:
    g = (group_type or "Solo").lower()
    hay = f"{stop_name or ''} {category or ''}".lower()
    if g == "family":
        if any(k in hay for k in ["zoo", "park", "planetarium", "film city", "garden"]):
            return 20
        if any(k in hay for k in ["fort", "museum", "lake"]):
            return 15
        return 10
    if g == "couple":
        if any(k in hay for k in ["lake", "garden", "sunset", "palace", "fort", "road"]):
            return 20
        return 12
    if g == "friends":
        if any(k in hay for k in ["bazaar", "market", "lake", "show", "beach", "fort"]):
            return 20
        return 12
    if any(k in hay for k in ["museum", "fort", "market", "viewpoint", "temple", "lake"]):
        return 18
    return 12


def _budget_compat_points(cost_usd: float, budget_level: str) -> int:
    cap = float(STOP_CAPS[_normalize_budget_level(budget_level)]["max_usd"])
    if cost_usd <= 0:
        return 15
    if cost_usd <= cap:
        return 10
    if cost_usd <= (cap * 1.2):
        return 5
    return 0


def _tourist_score(stop_name: str, category: str, cost_usd: float, vibes: list[str], group_type: str, budget_level: str, tier: int | None = None, tags: dict | None = None) -> int:
    fame = _tourist_fame_points(stop_name, tier=tier, tags=tags)
    vibe = _vibe_match_points(vibes, stop_name, category)
    group = _group_suitability_points(group_type, stop_name, category)
    budget = _budget_compat_points(cost_usd, budget_level)
    return int(max(0, min(100, fame + vibe + group + budget)))


def _curated_tier_for_name(city_key: str | None, name: str) -> int | None:
    if not city_key:
        return None
    items = CITY_FAMOUS_STOPS.get(city_key, [])
    lname = (name or "").strip().lower()
    for item in items:
        if str(item.get("name") or "").strip().lower() == lname:
            return int(item.get("tier", 3) or 3)
    return None


def _global_rank_score(stop: dict, city_key: str | None) -> float:
    ml_score = float(stop.get("_ml_rank_score", 0) or 0)
    tourist_score = float(stop.get("tourist_score", 0) or 0)
    rating_bonus = max(0.0, min(5.0, float(stop.get("rating", 0) or 0))) * 2.0
    tier = _curated_tier_for_name(city_key, stop.get("name", ""))
    curated_boost = 12.0 if tier == 1 else 6.0 if tier == 2 else 2.0 if tier == 3 else 0.0
    return tourist_score + rating_bonus + ml_score + curated_boost


def _radius_limit_km(comfort_radius: str, comfort_radius_km: float | None = None) -> float:
    if comfort_radius_km and comfort_radius_km > 0:
        return float(comfort_radius_km)
    m = re.match(r"^custom_(\d+)km$", (comfort_radius or "").strip().lower())
    if m:
        return float(m.group(1))
    if comfort_radius == "walkable":
        return 5.0
    if comfort_radius == "city":
        return 20.0
    if comfort_radius == "regional":
        return 50.0
    return float("inf")


def _arrival_time(index: int, start_hour: int = 9) -> str:
    base_hour = start_hour + index * 2
    suffix = "AM" if base_hour < 12 else "PM"
    h = base_hour if base_hour <= 12 else base_hour - 12
    return f"{h}:00 {suffix}"


def _duration_for_category(category: str) -> int:
    if category == "Food":
        return 75
    if category == "Nature":
        return 120
    if category == "Culture":
        return 90
    return 80


def _budget_band(level: str, budget_range: dict | None = None) -> tuple[float, float]:
    if isinstance(budget_range, dict):
        min_price = float(budget_range.get("min") or 0)
        max_raw = budget_range.get("max")
        max_price = float(max_raw) if max_raw is not None else 10000
        return min_price, max_price

    norm = _normalize_budget_level(level)
    if norm == "Budget":
        return 3, 6
    if norm == "Relaxed":
        return 10, 18
    if norm == "Luxury":
        return 18, 35
    if norm == "Ultra":
        return 35, 10000
    return 3, 6


def _build_google_hotels_url(destination: str, budget_level: str, nights: int = 1) -> str:
    level = _normalize_budget_level(budget_level)
    cap = HOTEL_CAPS[level]
    today = datetime.now(timezone.utc)
    checkin = today.replace(hour=0, minute=0, second=0, microsecond=0)
    checkout = checkin + timedelta(days=max(1, nights))

    ci = checkin.strftime("%m/%d/%Y")
    co = checkout.strftime("%m/%d/%Y")
    return (
        "https://www.google.com/travel/hotels/search"
        f"?q=hotels+in+{destination.replace(' ', '+')}"
        f"&checkin={ci}&checkout={co}"
        f"&price_max={int(cap['max_inr'])}&price_min=0&currency=INR"
    )


def _recommended_budget_areas(destination: str) -> list[str]:
    areas = {
        "delhi": ["Paharganj", "Karol Bagh", "Laxmi Nagar", "Sadar Bazaar"],
        "mumbai": ["Dadar", "Andheri East", "Kurla", "Thane"],
        "goa": ["Panaji", "Mapusa", "Old Goa"],
        "jaipur": ["Sindhi Camp", "Bani Park", "Station Road"],
        "kolkata": ["Sudder Street", "Howrah", "Park Circus"],
        "chennai": ["Egmore", "T Nagar", "Koyambedu"],
        "hyderabad": ["Abids", "Secunderabad", "Ameerpet"],
        "bangalore": ["Majestic", "Shivajinagar", "Yeshwanthpur"],
        "bengaluru": ["Majestic", "Shivajinagar", "Yeshwanthpur"],
    }
    dest_l = (destination or "").lower()
    for city, vals in areas.items():
        if city in dest_l:
            return vals
    return []


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _estimate_hotel_price_usd(raw_hotel: dict, budget_level: str) -> float:
    stated = raw_hotel.get("price_per_night") if isinstance(raw_hotel, dict) else None
    if isinstance(stated, (int, float)) and stated > 0:
        return float(stated)

    level = _normalize_budget_level(budget_level)
    hotel_type = str(raw_hotel.get("type") or "").lower() if isinstance(raw_hotel, dict) else ""
    if level == "Budget":
        if any(k in hotel_type for k in ["hostel", "guest", "dorm", "lodge"]):
            return 4.0
        return 6.0
    if level == "Relaxed":
        return 14.0
    if level == "Luxury":
        return 29.0
    return 95.0


def _hotel_matches_budget_type(raw_hotel: dict, budget_level: str) -> bool:
    level = _normalize_budget_level(budget_level)
    allowed = [t.lower() for t in HOTEL_CAPS[level]["types"]]
    hay = " ".join(
        [
            str(raw_hotel.get("name") or "").lower(),
            str(raw_hotel.get("type") or "").lower(),
            str(raw_hotel.get("address") or "").lower(),
        ]
    )
    lodging_tokens = ["hotel", "hostel", "guest", "guesthouse", "lodge", "resort", "inn", "homestay", "apartment", "motel"]
    non_lodging_tokens = ["restaurant", "cafe", "dhaba", "tiffin", "tiffens", "bakery", "kitchen", "bar", "eatery", "mess"]

    name_only = str(raw_hotel.get("name") or "").lower()
    has_lodging_hint = any(t in hay for t in lodging_tokens)
    has_food_hint = any(t in hay for t in non_lodging_tokens)
    name_has_lodging = any(t in name_only for t in ["hotel", "hostel", "inn", "resort", "lodge", "guest house", "guesthouse", "homestay"])
    if has_food_hint and not has_lodging_hint:
        return False
    if has_food_hint and not name_has_lodging:
        return False
    if not has_lodging_hint:
        return False

    disallowed_brands = ["hyatt", "marriott", "hilton", "taj", "oberoi", "itc", "leela"]
    if level != "Ultra" and any(b in hay for b in disallowed_brands):
        return False
    return any(token in hay for token in allowed) or level in {"Relaxed", "Luxury", "Ultra"}


def _meal_cost_usd_for_level(budget_level: str) -> float:
    level = _normalize_budget_level(budget_level)
    cap = FOOD_CAPS[level]["max_usd"]
    if cap >= 9999:
        return 22.0
    return max(0.5, round(cap * 0.75, 2))


def _ensure_daily_meals(food_options: list[dict], budget_level: str, food_cap: float, day_index: int) -> list[dict]:
    meal_order = ["Breakfast", "Lunch", "Dinner"]
    if not food_options:
        base = _meal_cost_usd_for_level(budget_level)
        return [
            {
                "name": f"Local {meal} in city center",
                "restaurant": "Top-rated local option",
                "meal_type": meal,
                "cost_usd": base,
                "cost_inr": int(round(base * 83.0)),
                "rating": 4.1,
                "distance_from_last_stop": "Nearby",
                "emoji": "🍽️",
                "is_fallback": True,
            }
            for meal in meal_order
        ]

    valid = [
        {
            **f,
            "meal_type": str(f.get("meal_type") or "Lunch").title(),
            "cost_usd": float(f.get("cost_usd", _meal_cost_usd_for_level(budget_level)) or _meal_cost_usd_for_level(budget_level)),
        }
        for f in food_options
        if float(f.get("cost_usd", _meal_cost_usd_for_level(budget_level)) or _meal_cost_usd_for_level(budget_level)) <= food_cap
    ]
    if not valid:
        return _ensure_daily_meals([], budget_level, food_cap, day_index)

    by_type: dict[str, list[dict]] = {}
    for item in valid:
        meal_t = item.get("meal_type", "Lunch")
        by_type.setdefault(meal_t, []).append(item)

    for meal_t, items in by_type.items():
        items.sort(key=lambda x: (-(float(x.get("rating", 0) or 0)), float(x.get("cost_usd", 0) or 0)))

    day_food: list[dict] = []
    for meal in meal_order:
        candidates = by_type.get(meal, [])
        if candidates:
            chosen = candidates[day_index % len(candidates)]
            chosen["cost_inr"] = int(round(float(chosen.get("cost_usd", 0) or 0) * 83.0))
            day_food.append(chosen)
            continue

        base = _meal_cost_usd_for_level(budget_level)
        day_food.append(
            {
                "name": f"Local {meal} option in city",
                "restaurant": "Curated local pick",
                "meal_type": meal,
                "cost_usd": base,
                "cost_inr": int(round(base * 83.0)),
                "rating": 4.0,
                "distance_from_last_stop": "Nearby",
                "emoji": "🍽️",
                "is_fallback": True,
            }
        )

    return day_food


def _stop_cost_usd_for_level(budget_level: str, category: str) -> float:
    # Only return explicit known-free defaults for generic categories.
    # Unknown/paid entries should be set by upstream source data when available.
    if category in {"Nature", "Leisure"}:
        return 0.0
    return 0.0


async def _build_dynamic_plan(payload: PlanRequest) -> dict:
    geo = GeoService()
    hotel_service = HotelService()
    level = _normalize_budget_level(payload.budget_level)
    pace_config = PACE_STOP_RULES.get(payload.pace, PACE_STOP_RULES["balanced"])
    stops_per_day = int(pace_config["stops_per_day"])
    duration_multiplier = float(pace_config["duration_multiplier"])
    start_hour = 8 if payload.pace == "fastpaced" else 9
    payload.budget_level = level
    hotel_cap = float(payload.hotel_max_usd or HOTEL_CAPS[level]["max_usd"])
    hotel_floor = float(HOTEL_FLOOR_USD.get(level, 3))
    food_cap = float(payload.food_max_usd or FOOD_CAPS[level]["max_usd"])
    stop_cap = float(payload.stop_max_usd or STOP_CAPS[level]["max_usd"])

    center = await geo.geocode(payload.destination)
    if not center:
        raise HTTPException(status_code=422, detail="Destination could not be geocoded")

    lat, lng = center
    total_days = max(1, payload.days)
    elements = await geo.search_nearby(lat, lng)

    stops = []
    food = []
    seen_names = set()

    city_key = _match_city_key(payload.destination)
    curated = CITY_FAMOUS_STOPS.get(city_key or "", [])

    def _ingest_elements(elements_batch: list[dict]) -> None:
        for el in elements_batch:
            tags = el.get("tags") or {}
            name = tags.get("name")
            if not name:
                continue
            key = name.strip().lower()
            if key in seen_names:
                continue
            seen_names.add(key)

            category = _map_category(tags)
            if not _is_valid_tourist_stop(name, tags, category):
                continue

            cost_usd = _stop_cost_usd_for_level(level, category)
            tier_hint = _curated_tier_for_name(city_key, name)
            score = _tourist_score(
                name,
                category,
                cost_usd,
                payload.vibes or [],
                payload.group_type,
                level,
                tier=tier_hint,
                tags=tags,
            )
            if score < 50:
                continue

            item = {
                "name": name,
                "description": tags.get("description") or f"Popular {category.lower()} spot in {payload.destination}",
                "why_here": f"Recommended for {payload.group_type} travelers.",
                "lat": el.get("lat", lat),
                "lng": el.get("lon", lng),
                "cost_usd": cost_usd,
                "category": category,
                "pro_tip": "Check local opening hours before your visit",
                "indoor": category in {"Culture", "Religious"},
                "rating": 4.2,
                "best_time": "10:00 AM - 1:00 PM",
                "booking_required": False,
                "tourist_score": score,
                "tier": tier_hint or 3,
            }

            if category == "Food":
                food.append(
                    {
                        "name": name,
                        "emoji": "🍽️",
                        "restaurant": name,
                        "meal_type": "Lunch",
                        "cost_usd": _meal_cost_usd_for_level(level),
                        "rating": 4.3,
                        "distance_from_last_stop": "1.0 km",
                    }
                )
            elif item["cost_usd"] <= stop_cap:
                stops.append(item)

    # 1) Global discovery from nearby POIs.
    _ingest_elements(elements)

    # Expand radius for long trips so we keep valid named attractions longer.
    needed_stops = total_days * stops_per_day
    if len(stops) < needed_stops:
        for radius in (10000, 15000, 25000):
            extra = await geo.search_nearby(lat, lng, radius_m=radius)
            _ingest_elements(extra)
            if len(stops) >= needed_stops:
                break

    # 2) Optional curated seed/boost (not hardcoded-only source).
    allowed_tiers = {1, 2} if payload.days <= 4 else {1, 2, 3}
    for stop in curated:
        if stop.get("tier") not in allowed_tiers:
            continue
        key = str(stop.get("name") or "").strip().lower()
        if not key or key in seen_names:
            continue
        seen_names.add(key)

        score = _tourist_score(
            stop.get("name", ""),
            stop.get("category", "Culture"),
            float(stop.get("cost_usd", 0) or 0),
            payload.vibes or [],
            payload.group_type,
            level,
            tier=int(stop.get("tier", 2) or 2),
            tags={},
        )
        if score < 50:
            continue

        stops.append(
            {
                "name": stop["name"],
                "description": f"Famous attraction in {payload.destination} with high tourist relevance.",
                "why_here": f"High match for {payload.group_type} travelers interested in {', '.join(payload.vibes or ['local highlights'])}.",
                "lat": stop["lat"],
                "lng": stop["lng"],
                "cost_usd": float(stop.get("cost_usd", 0) or 0),
                "category": stop.get("category", "Culture"),
                "pro_tip": "Arrive early to avoid crowds and confirm closing times.",
                "indoor": bool(stop.get("indoor", False)),
                "rating": float(stop.get("rating", 4.4) or 4.4),
                "best_time": stop.get("best_time", "9:00 AM - 12:00 PM"),
                "booking_required": bool(stop.get("booking_required", False)),
                "tourist_score": score,
                "tier": stop.get("tier", 2),
            }
        )

    # 3) ML ranking over all candidates for global ordering.
    ml_ranked_stops = rank_places_for_day(stops, lat, lng, None, None, limit=None)
    max_rank = max(1, len(ml_ranked_stops))
    ml_score_map = {
        str(s.get("name") or "").strip().lower(): (max_rank - idx) * 2.0
        for idx, s in enumerate(ml_ranked_stops)
    }
    for stop in stops:
        stop["_ml_rank_score"] = ml_score_map.get(str(stop.get("name") or "").strip().lower(), 0.0)

    stops = sorted(
        stops,
        key=lambda s: (
            -_global_rank_score(s, city_key),
            -(int(s.get("tourist_score", 0))),
            s.get("tier", 3),
        ),
    )

    if not stops:
        raise HTTPException(status_code=500, detail="No itinerary stops found for destination")

    hotels_raw = await hotel_service.search_hotels(
        city=payload.destination,
        budget_per_night=hotel_cap,
        limit=12,
        center_lat=lat,
        center_lon=lng,
    )
    min_price, max_price = _budget_band(payload.budget_level, payload.budget_usd_per_day)

    hotels = []
    for i, h in enumerate(hotels_raw):
        if not _hotel_matches_budget_type(h, level):
            continue
        price = _estimate_hotel_price_usd(h, level)
        effective_min = max(min_price, hotel_floor)
        effective_max = min(max_price, hotel_cap)
        if price < effective_min or price > effective_max:
            continue
        stars_raw = str(h.get("stars") or "3").strip()
        stars = int(stars_raw[0]) if stars_raw and stars_raw[0].isdigit() else 3
        hotels.append(
            {
                "name": h.get("name") or "Hotel",
                "stars": max(2, min(5, stars)),
                "price_usd": round(price),
                "amenities": ["WiFi", "Breakfast", "Pool"],
                "distance_from_last_stop": "2.0 km",
                "recommended": i == 0,
                "price_inr": int(round(price * 83.0)),
                "booking_url": f"https://google.com/search?q={(h.get('name') or payload.destination).replace(' ', '+')}+{payload.destination.replace(' ', '+')}",
                "search_url": _build_google_hotels_url(payload.destination, level, payload.days),
                "verified": bool(h.get("name")),
            }
        )

    hotels = sorted(hotels, key=lambda h: float(h.get("price_usd") or 0))
    under_cap = [
        h for h in hotels
        if hotel_floor <= float(h.get("price_usd") or 0) <= hotel_cap
    ]
    if under_cap:
        hotels = under_cap

    if not hotels:
        hotels = [
            {
                "type": "search_link",
                "platform": "google_hotels",
                "name": "Live hotel search",
                "destination": payload.destination,
                "budget_level": level,
                "price_max_inr": int(HOTEL_CAPS[level]["max_inr"]),
                "search_query": f"budget hotels in {payload.destination} under ₹{int(HOTEL_CAPS[level]['max_inr'])}",
                "recommended_areas": _recommended_budget_areas(payload.destination),
                "price_usd": 0,
                "price_inr": 0,
                "recommended": True,
                "verified": False,
                "search_url": _build_google_hotels_url(payload.destination, level, payload.days),
                "booking_url": _build_google_hotels_url(payload.destination, level, payload.days),
            }
        ]

    if not food:
        base_food_price = _meal_cost_usd_for_level(level)
        food = [
            {
                "name": f"Local {payload.destination} Cuisine",
                "emoji": "🍽️",
                "restaurant": f"{payload.destination} Food Street",
                "meal_type": "Lunch",
                "cost_usd": base_food_price,
                "cost_inr": int(round(base_food_price * 83.0)),
                "rating": 4.2,
                "distance_from_last_stop": "1.0 km",
            }
        ]

    food = [
        {
            **f,
            "cost_usd": float(f.get("cost_usd", _meal_cost_usd_for_level(level)) or _meal_cost_usd_for_level(level)),
            "cost_inr": int(round(float(f.get("cost_usd", _meal_cost_usd_for_level(level)) or _meal_cost_usd_for_level(level)) * 83.0)),
        }
        for f in food
        if float(f.get("cost_usd", _meal_cost_usd_for_level(level)) or _meal_cost_usd_for_level(level)) <= food_cap
    ]
    if not food:
        cheap_meal = _meal_cost_usd_for_level(level)
        food = [{
            "name": f"{payload.destination} Street Meal",
            "emoji": "🍜",
            "restaurant": f"{payload.destination} Local Stall",
            "meal_type": "Lunch",
            "cost_usd": cheap_meal,
            "cost_inr": int(round(cheap_meal * 83.0)),
            "rating": 4.1,
            "distance_from_last_stop": "1.0 km",
        }]

    days = []
    max_leg_km = _radius_limit_km(payload.comfort_radius, payload.comfort_radius_km)
    fallback_stop = {
        "name": f"Explore {payload.destination}",
        "description": "Free exploration day - discover local gems",
        "why_here": "Flexible buffer to explore famous neighborhoods nearby.",
        "lat": lat,
        "lng": lng,
        "cost_usd": 0,
        "category": "Leisure",
        "pro_tip": "Ask locals for hidden gems not on tourist maps",
        "indoor": False,
        "rating": 4.0,
        "best_time": "Evening",
        "tourist_score": 55,
        "booking_required": False,
    }

    ranked_stops = []
    seen_ranked = set()
    for s in (stops if stops else [fallback_stop]):
        key = str(s.get("name") or "").strip().lower()
        if not key or key in seen_ranked:
            continue
        seen_ranked.add(key)
        ranked_stops.append(s)

    stop_cursor = 0
    for d in range(total_days):
        seg = []
        day_seen = set()
        while len(seg) < stops_per_day and stop_cursor < len(ranked_stops):
            candidate = ranked_stops[stop_cursor]
            stop_cursor += 1
            c_key = str(candidate.get("name") or "").strip().lower()
            if c_key in day_seen:
                continue
            day_seen.add(c_key)
            seg.append(candidate)
        if not seg:
            seg = [fallback_stop]
        day_stops = []
        for i, s in enumerate(seg):
            if len(day_stops) >= stops_per_day:
                break
            if day_stops and max_leg_km != float("inf"):
                prev = day_stops[-1]
                leg_km = _haversine_km(float(prev["lat"]), float(prev["lng"]), float(s["lat"]), float(s["lng"]))
                if leg_km > max_leg_km:
                    continue

            base_duration = _duration_for_category(s["category"])
            duration = max(35, int(round(base_duration * duration_multiplier)))
            next_stop = seg[i + 1] if i < len(seg) - 1 else None
            travel_to_next = None
            if next_stop:
                dist_km = _haversine_km(float(s["lat"]), float(s["lng"]), float(next_stop["lat"]), float(next_stop["lng"]))
                drive_min = max(8, int(round(dist_km * 4.5)))
                travel_to_next = f"{dist_km:.1f} km • {drive_min} min drive"

            day_stops.append(
                {
                    "name": s["name"],
                    "description": s["description"],
                    "lat": s["lat"],
                    "lng": s["lng"],
                    "arrival_time": _arrival_time(i, start_hour=start_hour),
                    "duration_minutes": duration,
                    "travel_to_next": travel_to_next,
                    "cost_usd": s["cost_usd"],
                    "category": s["category"],
                    "pro_tip": s["pro_tip"],
                    "why_here": s.get("why_here", f"Good fit for {payload.group_type} travelers"),
                    "indoor": bool(s.get("indoor", False)),
                    "rating": float(s.get("rating", 4.2) or 4.2),
                    "best_time": s.get("best_time", "10:00 AM - 1:00 PM"),
                    "tourist_score": int(s.get("tourist_score", 55) or 55),
                    "booking_required": bool(s.get("booking_required", False)),
                }
            )

        while len(day_stops) < stops_per_day:
            filler_i = len(day_stops)
            if ranked_stops:
                revisit = ranked_stops[(d + filler_i) % len(ranked_stops)]
                revisit_name = f"Revisit: {revisit.get('name', payload.destination)}"
                day_stops.append(
                    {
                        "name": revisit_name,
                        "description": f"A second pass at {revisit.get('name', 'a top attraction')} with relaxed family time.",
                        "lat": revisit.get("lat", lat),
                        "lng": revisit.get("lng", lng),
                        "arrival_time": _arrival_time(filler_i, start_hour=start_hour),
                        "duration_minutes": max(35, int(round(float(revisit.get("duration_minutes", 120)) * duration_multiplier))),
                        "travel_to_next": None,
                        "cost_usd": float(revisit.get("cost_usd", 0) or 0),
                        "category": revisit.get("category", "Leisure"),
                        "pro_tip": "Great for photos and slower exploration.",
                        "why_here": "Added to keep your plan filled with real attractions instead of generic placeholders.",
                        "indoor": bool(revisit.get("indoor", False)),
                        "rating": float(revisit.get("rating", 4.0) or 4.0),
                        "best_time": revisit.get("best_time", "Evening"),
                        "tourist_score": int(revisit.get("tourist_score", 60) or 60),
                        "booking_required": bool(revisit.get("booking_required", False)),
                    }
                )
                continue
            day_stops.append(
                {
                    "name": f"Explore {payload.destination} (Free Time {d + 1}.{filler_i + 1})",
                    "description": fallback_stop["description"],
                    "lat": fallback_stop["lat"],
                    "lng": fallback_stop["lng"],
                    "arrival_time": _arrival_time(filler_i, start_hour=start_hour),
                    "duration_minutes": max(35, int(round(240 * duration_multiplier))),
                    "travel_to_next": None,
                    "cost_usd": 0,
                    "category": "Leisure",
                    "pro_tip": fallback_stop["pro_tip"],
                    "why_here": fallback_stop["why_here"],
                    "indoor": False,
                    "rating": 4.0,
                    "best_time": fallback_stop["best_time"],
                    "tourist_score": 55,
                    "booking_required": False,
                }
            )

        days.append(
            {
                "day": d + 1,
                "title": "Arrival & First Impressions" if d == 0 else ("Last Day & Departure" if d == total_days - 1 else f"Day {d + 1} Exploration"),
                "stops": day_stops,
                "food": _ensure_daily_meals(food, level, food_cap, d),
                "hotels": hotels[:3],
            }
        )

    # Fetch real food/hotels once per trip center to avoid repeated slow external calls per day.
    real_food, real_hotels = await asyncio.gather(
        fetch_real_restaurants_with_fallback(
            payload.destination,
            level,
            payload.vibes or [],
            lat,
            lng,
        ),
        fetch_real_hotels_with_fallback(
            payload.destination,
            level,
            lat,
            lng,
        ),
    )

    for day in days:
        if real_food:
            day["food"] = _ensure_daily_meals(real_food, level, food_cap, int(day.get("day", 1)) - 1)
        if real_hotels:
            capped_hotels = [
                h for h in real_hotels
                if hotel_floor <= float(h.get("price_usd", 0) or 0) <= hotel_cap
            ]
            if capped_hotels:
                capped_hotels.sort(key=lambda h: (float(h.get("price_usd", 0) or 0), -(float(h.get("rating", 0) or 0))))
                merged = capped_hotels[:]
                existing = day.get("hotels") or []
                seen_names = {str(h.get("name") or "").strip().lower() for h in merged}
                for h in existing:
                    h_name = str(h.get("name") or "").strip().lower()
                    h_price = float(h.get("price_usd", 0) or 0)
                    if not h_name or h_name in seen_names:
                        continue
                    if hotel_floor <= h_price <= hotel_cap:
                        merged.append(h)
                        seen_names.add(h_name)
                    if len(merged) >= 6:
                        break

                for idx, h in enumerate(merged[:6]):
                    h["recommended"] = idx == 0
                day["hotels"] = merged[:6]
            else:
                # Keep already filtered planner hotels instead of downgrading to too-cheap or over-budget real results.
                day["hotels"] = day.get("hotels") or hotels[:3]

    transport_data = await calculate_transport_cost(days, level)

    country, currency = _infer_geo_from_destination(payload.destination)

    return {
        "trip": {
            "origin": payload.origin,
            "destination": payload.destination,
            "destination_country": country,
            "local_currency": currency,
            "center_lat": lat,
            "center_lng": lng,
            "duration_days": total_days,
            "vibes": payload.vibes,
            "group_type": payload.group_type,
            "budget_level": payload.budget_level,
            "pace": payload.pace,
            "comfort_radius": payload.comfort_radius,
            "comfort_radius_km": payload.comfort_radius_km,
            "hotel_max_usd": hotel_cap,
            "food_max_usd": food_cap,
            "stop_max_usd": stop_cap,
            "transport_summary": transport_data,
            "total_transport_usd": transport_data.get("total_usd", 0),
            "created_at": datetime.utcnow().isoformat(),
            "days": days,
        }
    }


@router.post("/plan")
async def create_plan(
    request: PlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    level = _normalize_budget_level(request.budget_level)
    request.budget_level = level
    request.hotel_max_usd = HOTEL_CAPS[level]["max_usd"]
    request.food_max_usd = FOOD_CAPS[level]["max_usd"]
    request.stop_max_usd = STOP_CAPS[level]["max_usd"]

    result = await _build_dynamic_plan(request)
    result["trip"] = validate_and_fix_budget(result.get("trip", {}), request.budget_level)

    trip = Trip(
        user_id=current_user.id,
        region=request.destination,
        base_city=request.origin,
        constraints={
            "days": request.days,
            "vibes": request.vibes,
            "group_type": request.group_type,
            "budget_level": request.budget_level,
            "pace": request.pace,
            "comfort_radius": request.comfort_radius,
            "comfort_radius_km": request.comfort_radius_km,
            "budget_usd_per_day": request.budget_usd_per_day,
            "special_requests": request.special_requests,
            "hotel_max_usd": request.hotel_max_usd,
            "food_max_usd": request.food_max_usd,
            "stop_max_usd": request.stop_max_usd,
        },
        trip_graph=result["trip"],
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    result["trip"]["id"] = trip.id
    return result


@router.post("/debug/budget-check")
async def budget_check(request: PlanRequest):
    level = _normalize_budget_level(request.budget_level)
    request.budget_level = level
    request.hotel_max_usd = HOTEL_CAPS[level]["max_usd"]
    request.food_max_usd = FOOD_CAPS[level]["max_usd"]
    request.stop_max_usd = STOP_CAPS[level]["max_usd"]

    result = await _build_dynamic_plan(request)
    trip = validate_and_fix_budget(result.get("trip", {}), level)

    hotel_cap = HOTEL_CAPS[level]["max_usd"]
    food_cap = FOOD_CAPS[level]["max_usd"]

    violations = []
    for day in trip.get("days", []):
        day_num = day.get("day", 0)
        for h in day.get("hotels", []):
            price = float(h.get("price_usd", 0) or 0)
            if price > hotel_cap:
                violations.append({
                    "type": "hotel",
                    "day": day_num,
                    "name": h.get("name", "Hotel"),
                    "price": price,
                    "cap": hotel_cap,
                    "overage": round(price - hotel_cap, 2),
                })
        for f in day.get("food", []):
            price = float(f.get("cost_usd", 0) or 0)
            if price > food_cap:
                violations.append({
                    "type": "food",
                    "day": day_num,
                    "name": f.get("name", "Food"),
                    "price": price,
                    "cap": food_cap,
                })

    return {
        "budget_level": level,
        "hotel_cap": hotel_cap,
        "food_cap": food_cap,
        "total_violations": len(violations),
        "violations": violations,
        "compliance_rate": f"{round((1 - len(violations) / max(1, len(violations) + 5)) * 100)}%",
        "prompt_preview": build_master_prompt(request).strip()[:500],
        "queries": {
            "hotel": build_hotel_query(request.destination, level).strip(),
            "food": build_food_query(request.destination, level, request.destination).strip(),
            "stops": build_stops_query(request.destination, level, request.vibes, request.days, request.comfort_radius).strip(),
        },
    }


@router.get("/trips")
async def get_trips(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Trip)
        .filter(Trip.user_id == current_user.id)
        .order_by(Trip.id.desc())
        .all()
    )

    trips = []
    for row in rows:
        constraints = row.constraints or {}
        graph = dict(row.trip_graph or {})
        trips.append({
            **graph,
            "id": row.id,
            "origin": row.base_city,
            "destination": row.region,
            "duration_days": constraints.get("days", graph.get("duration_days", 1)),
            "vibes": constraints.get("vibes", graph.get("vibes", [])),
            "group_type": constraints.get("group_type", graph.get("group_type", "")),
            "budget_level": constraints.get("budget_level", graph.get("budget_level", "")),
            "pace": constraints.get("pace", graph.get("pace", "balanced")),
            "comfort_radius": constraints.get("comfort_radius", graph.get("comfort_radius", "")),
            "comfort_radius_km": constraints.get("comfort_radius_km", graph.get("comfort_radius_km")),
            "created_at": graph.get("created_at"),
            "itinerary": graph,
        })
    return trips


@router.post("/trips")
async def save_trip(
    payload: TripSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    created_at = datetime.now(timezone.utc).isoformat()
    trip_graph = {
        **payload.itinerary,
        "origin": payload.origin,
        "destination": payload.destination,
        "duration_days": payload.duration_days,
        "destination_country": payload.destination_country,
        "local_currency": payload.local_currency,
        "center_lat": payload.center_lat,
        "center_lng": payload.center_lng,
        "vibes": payload.vibes,
        "group_type": payload.group_type,
        "budget_level": payload.budget_level,
        "pace": payload.pace,
        "comfort_radius": payload.comfort_radius,
        "comfort_radius_km": payload.comfort_radius_km,
        "created_at": created_at,
    }
    trip = Trip(
        user_id=current_user.id,
        region=payload.destination,
        base_city=payload.origin,
        constraints={
            "days": payload.duration_days,
            "vibes": payload.vibes,
            "group_type": payload.group_type,
            "budget_level": payload.budget_level,
            "pace": payload.pace,
            "comfort_radius": payload.comfort_radius,
            "comfort_radius_km": payload.comfort_radius_km,
        },
        trip_graph=trip_graph,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    return {
        **trip_graph,
        "id": trip.id,
        "itinerary": trip_graph,
    }


@router.delete("/trips/clear-all")
async def clear_all_trips(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deleted_count = (
        db.query(Trip)
        .filter(Trip.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": True, "count": deleted_count, "userId": current_user.id}


@router.get("/trips/{trip_id}")
async def get_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = (
        db.query(Trip)
        .filter(Trip.id == trip_id, Trip.user_id == current_user.id)
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    graph = trip.trip_graph or {}
    graph["id"] = trip.id
    return {"trip": graph}


@router.delete("/trips/{trip_id}")
async def delete_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = (
        db.query(Trip)
        .filter(Trip.id == trip_id, Trip.user_id == current_user.id)
        .first()
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    db.delete(trip)
    db.commit()
    return {"deleted": True, "id": trip_id}
