from datetime import datetime
from math import ceil
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.models.trip import Trip
from app.db.models.user import User
from app.db.session import get_db
from app.services.geo_service import GeoService
from app.services.hotel_service import HotelService


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


def _normalize_budget_level(budget_level: str | None) -> str:
    level = (budget_level or "Budget").strip()
    return level if level in HOTEL_CAPS else "Budget"


def get_system_prompt(budget_level: str, destination: str) -> str:
    level = _normalize_budget_level(budget_level)
    hotel = HOTEL_CAPS[level]
    food = FOOD_CAPS[level]
    stop = STOP_CAPS[level]
    return f"""
You are a budget-aware travel planning expert for {destination}.

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

=== IMPORTANT ===
All prices must be realistic for {destination}.
Hotel + Food + Activities must fit within this daily budget.
"""


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


def build_stops_query(destination: str, budget_level: str, vibes: list[str], days: int) -> str:
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
    comfort_radius: str = "flexible"
    budget_usd_per_day: dict | None = None
    special_requests: str = ""
    hotel_max_usd: float | None = None
    food_max_usd: float | None = None
    stop_max_usd: float | None = None

    def model_post_init(self, __context) -> None:
        level = _normalize_budget_level(self.budget_level)
        self.budget_level = level
        self.hotel_max_usd = HOTEL_CAPS[level]["max_usd"]
        self.food_max_usd = FOOD_CAPS[level]["max_usd"]
        self.stop_max_usd = STOP_CAPS[level]["max_usd"]


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


def _arrival_time(index: int) -> str:
    base_hour = 9 + index * 2
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
        return 0, 10
    if norm == "Relaxed":
        return 10, 30
    if norm == "Luxury":
        return 30, 50
    if norm == "Ultra":
        return 50, 10000
    return 0, 10


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
    if level == "Ultra":
        return True

    allowed = [t.lower() for t in HOTEL_CAPS[level]["types"]]
    hay = " ".join(
        [
            str(raw_hotel.get("name") or "").lower(),
            str(raw_hotel.get("type") or "").lower(),
            str(raw_hotel.get("address") or "").lower(),
        ]
    )
    disallowed_brands = ["hyatt", "marriott", "hilton", "taj", "oberoi", "itc", "leela"]
    if any(b in hay for b in disallowed_brands):
        return False
    return any(token in hay for token in allowed) or level in {"Relaxed", "Luxury"}


def _meal_cost_usd_for_level(budget_level: str) -> float:
    level = _normalize_budget_level(budget_level)
    cap = FOOD_CAPS[level]["max_usd"]
    if cap >= 9999:
        return 22.0
    return max(0.5, round(cap * 0.75, 2))


def _stop_cost_usd_for_level(budget_level: str, category: str) -> float:
    level = _normalize_budget_level(budget_level)
    cap = STOP_CAPS[level]["max_usd"]
    if category in {"Nature", "Leisure"}:
        return 0.0
    if cap >= 9999:
        return 25.0
    return min(cap, round(max(0.0, cap * 0.5), 2))


async def _build_dynamic_plan(payload: PlanRequest) -> dict:
    geo = GeoService()
    hotel_service = HotelService()
    level = _normalize_budget_level(payload.budget_level)
    payload.budget_level = level
    hotel_cap = float(payload.hotel_max_usd or HOTEL_CAPS[level]["max_usd"])
    food_cap = float(payload.food_max_usd or FOOD_CAPS[level]["max_usd"])
    stop_cap = float(payload.stop_max_usd or STOP_CAPS[level]["max_usd"])

    center = await geo.geocode(payload.destination)
    if not center:
        raise HTTPException(status_code=422, detail="Destination could not be geocoded")

    lat, lng = center
    elements = await geo.search_nearby(lat, lng)

    stops = []
    food = []
    seen_names = set()

    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        key = name.strip().lower()
        if key in seen_names:
            continue
        seen_names.add(key)

        category = _map_category(tags)
        item = {
            "name": name,
            "description": tags.get("description") or f"Popular {category.lower()} spot in {payload.destination}",
            "lat": el.get("lat", lat),
            "lng": el.get("lon", lng),
            "cost_usd": _stop_cost_usd_for_level(level, category),
            "category": category,
            "pro_tip": "Check local opening hours before your visit",
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
        else:
            if item["cost_usd"] <= stop_cap:
                stops.append(item)

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
        if price < min_price or price > max_price:
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
            }
        )

    hotels = sorted(hotels, key=lambda h: float(h.get("price_usd") or 0))
    under_cap = [h for h in hotels if float(h.get("price_usd") or 0) <= hotel_cap]
    if under_cap:
        hotels = under_cap

    if not hotels:
        fallback_price = round(min(hotel_cap, 5.0 if level == "Budget" else 12.0 if level == "Relaxed" else 28.0))
        hotels = [
            {
                "name": f"{payload.destination} Central Hotel",
                "stars": 2 if level in {"Budget", "Relaxed"} else 3,
                "price_usd": fallback_price,
                "amenities": ["WiFi", "Breakfast", "Pool"],
                "distance_from_last_stop": "2.0 km",
                "recommended": True,
                "price_inr": int(round(fallback_price * 83.0)),
                "overBudget": fallback_price > hotel_cap,
                "booking_url": f"https://google.com/search?q={payload.destination.replace(' ', '+')}+hotel",
            }
        ]

    total_days = max(1, payload.days)
    stops_per_day = max(1, ceil(len(stops) / total_days))

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
    for d in range(total_days):
        seg = stops[d * stops_per_day : (d + 1) * stops_per_day]
        if not seg:
            seg = stops[-1:]
        day_stops = []
        for i, s in enumerate(seg):
            duration = _duration_for_category(s["category"])
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
                    "arrival_time": _arrival_time(i),
                    "duration_minutes": duration,
                    "travel_to_next": travel_to_next,
                    "cost_usd": s["cost_usd"],
                    "category": s["category"],
                    "pro_tip": s["pro_tip"],
                }
            )

        days.append(
            {
                "day": d + 1,
                "title": "Arrival & First Impressions" if d == 0 else ("Last Day & Departure" if d == total_days - 1 else f"Day {d + 1} Exploration"),
                "stops": day_stops,
                "food": food[d % len(food) : d % len(food) + 3] or food[:1],
                "hotels": hotels[:3],
            }
        )

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
            "comfort_radius": payload.comfort_radius,
            "hotel_max_usd": hotel_cap,
            "food_max_usd": food_cap,
            "stop_max_usd": stop_cap,
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
            "comfort_radius": request.comfort_radius,
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
        "prompt_preview": get_system_prompt(level, request.destination).strip()[:500],
        "queries": {
            "hotel": build_hotel_query(request.destination, level).strip(),
            "food": build_food_query(request.destination, level, request.destination).strip(),
            "stops": build_stops_query(request.destination, level, request.vibes, request.days).strip(),
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

    return [
        {
            "id": row.id,
            "origin": row.base_city,
            "destination": row.region,
            "duration_days": (row.constraints or {}).get("days", 1),
            "vibes": (row.constraints or {}).get("vibes", []),
            "group_type": (row.constraints or {}).get("group_type", ""),
            "budget_level": (row.constraints or {}).get("budget_level", ""),
            "created_at": (row.trip_graph or {}).get("created_at"),
        }
        for row in rows
    ]


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
    return {"ok": True}
