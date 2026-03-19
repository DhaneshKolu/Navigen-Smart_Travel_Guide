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


class PlanRequest(BaseModel):
    origin: str
    destination: str
    days: int
    vibes: list[str] = []
    group_type: str
    budget_level: str
    comfort_radius: str = ""
    budget_usd_per_day: dict | None = None
    special_requests: str = ""


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

    value = (level or "").lower()
    if "budget" in value:
        return 0, 50
    if "mid" in value:
        return 45, 110
    if "comfort" in value:
        return 90, 220
    if "lux" in value:
        return 180, 10000
    return 40, 150


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


async def _build_dynamic_plan(payload: PlanRequest) -> dict:
    geo = GeoService()
    hotel_service = HotelService()

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
            "cost_usd": 0 if category != "Food" else 8,
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
                    "cost_usd": 8,
                    "rating": 4.3,
                    "distance_from_last_stop": "1.0 km",
                }
            )
        else:
            stops.append(item)

    if not stops:
        raise HTTPException(status_code=500, detail="No itinerary stops found for destination")

    hotels_raw = await hotel_service.search_hotels(
        city=payload.destination,
        limit=12,
        center_lat=lat,
        center_lon=lng,
    )
    min_price, max_price = _budget_band(payload.budget_level, payload.budget_usd_per_day)

    hotels = []
    for i, h in enumerate(hotels_raw):
        price = float(h.get("price_per_night") or 95)
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
                "booking_url": f"https://google.com/search?q={(h.get('name') or payload.destination).replace(' ', '+')}+{payload.destination.replace(' ', '+')}",
            }
        )

    if not hotels:
        hotels = [
            {
                "name": f"{payload.destination} Central Hotel",
                "stars": 3,
                "price_usd": 95,
                "amenities": ["WiFi", "Breakfast", "Pool"],
                "distance_from_last_stop": "2.0 km",
                "recommended": True,
                "booking_url": f"https://google.com/search?q={payload.destination.replace(' ', '+')}+hotel",
            }
        ]

    total_days = max(1, payload.days)
    stops_per_day = max(1, ceil(len(stops) / total_days))

    if not food:
        food = [
            {
                "name": f"Local {payload.destination} Cuisine",
                "emoji": "🍽️",
                "restaurant": f"{payload.destination} Food Street",
                "meal_type": "Lunch",
                "cost_usd": 9,
                "rating": 4.2,
                "distance_from_last_stop": "1.0 km",
            }
        ]

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
    result = await _build_dynamic_plan(request)

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
        },
        trip_graph=result["trip"],
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    result["trip"]["id"] = trip.id
    return result


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
