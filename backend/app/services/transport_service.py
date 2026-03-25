import math

import httpx

from app.core.settings import settings


DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"
GOOGLE_MAPS_KEY = settings.GOOGLE_PLACES_API_KEY or ""

TRANSPORT_MODES = {
    "Budget": {
        "mode": "transit",
        "cost_per_km": 0.008,
        "base_per_day": 0.30,
        "label": "Bus/Metro",
    },
    "Relaxed": {
        "mode": "driving",
        "cost_per_km": 0.025,
        "base_per_day": 0.60,
        "label": "Auto/Metro",
    },
    "Luxury": {
        "mode": "driving",
        "cost_per_km": 0.07,
        "base_per_day": 1.20,
        "label": "Uber/Ola",
    },
    "Ultra": {
        "mode": "driving",
        "cost_per_km": 0.14,
        "base_per_day": 3.00,
        "label": "Private Cab",
    },
}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    d_lat = (lat2 - lat1) * math.pi / 180
    d_lng = (lng2 - lng1) * math.pi / 180
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * math.pi / 180)
        * math.cos(lat2 * math.pi / 180)
        * math.sin(d_lng / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def get_real_distances(stops: list, budget_level: str) -> dict:
    if not GOOGLE_MAPS_KEY or len(stops) < 2:
        return {"segments": [], "total_km": 0, "total_mins": 0}

    mode_config = TRANSPORT_MODES.get(budget_level, TRANSPORT_MODES["Budget"])
    travel_mode = mode_config["mode"]
    segments = []

    for i in range(len(stops) - 1):
        s1 = stops[i]
        s2 = stops[i + 1]

        s1_lat = s1.get("lat")
        s1_lng = s1.get("lng")
        s2_lat = s2.get("lat")
        s2_lng = s2.get("lng")

        if (
            s1_lat is None
            or s1_lng is None
            or s2_lat is None
            or s2_lng is None
        ):
            segments.append(
                {
                    "from": s1.get("name", ""),
                    "to": s2.get("name", ""),
                    "km": 0,
                    "mins": 0,
                    "text": "Distance unavailable",
                }
            )
            continue

        fallback_km = round(_haversine_km(float(s1_lat), float(s1_lng), float(s2_lat), float(s2_lng)) * 1.3, 1)
        fallback_segment = {
            "from": s1.get("name", ""),
            "to": s2.get("name", ""),
            "km": fallback_km,
            "mins": round(fallback_km * 3),
            "text": f"~{fallback_km} km",
            "estimated": True,
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(
                    DISTANCE_MATRIX_URL,
                    params={
                        "origins": f"{s1_lat},{s1_lng}",
                        "destinations": f"{s2_lat},{s2_lng}",
                        "mode": travel_mode,
                        "key": GOOGLE_MAPS_KEY,
                        "language": "en",
                        "units": "metric",
                    },
                )

            data = res.json() if res.content else {}
            rows = data.get("rows") or []
            first_row = rows[0] if rows else {}
            elements = (first_row or {}).get("elements") or []
            element = elements[0] if elements else {}

            if element.get("status") == "OK" and element.get("distance") and element.get("duration"):
                dist_m = element["distance"].get("value")
                dur_s = element["duration"].get("value")
                if isinstance(dist_m, (int, float)) and isinstance(dur_s, (int, float)):
                    dist_km = round(dist_m / 1000, 1)
                    dur_min = round(dur_s / 60)
                    segments.append(
                        {
                            "from": s1.get("name", ""),
                            "to": s2.get("name", ""),
                            "km": dist_km,
                            "mins": dur_min,
                            "text": f"{dist_km} km · {dur_min} min {mode_config['label']}",
                        }
                    )
                    continue

            segments.append(fallback_segment)

        except Exception:
            segments.append(fallback_segment)

    total_km = sum(s["km"] for s in segments)
    total_mins = sum(s["mins"] for s in segments)

    return {
        "segments": segments,
        "total_km": round(total_km, 1),
        "total_mins": total_mins,
        "mode": mode_config["label"],
    }


async def calculate_transport_cost(trip_days: list, budget_level: str) -> dict:
    mode_config = TRANSPORT_MODES.get(budget_level, TRANSPORT_MODES["Budget"])
    cost_per_km = mode_config["cost_per_km"]
    base_per_day = mode_config["base_per_day"]
    num_days = len(trip_days)

    all_segments = []
    total_km = 0
    total_cost = 0

    for day in trip_days:
        stops = day.get("stops", [])
        if len(stops) < 2:
            total_cost += base_per_day
            continue

        distances = await get_real_distances(stops, budget_level)
        day_km = distances["total_km"]
        day_cost = (day_km * cost_per_km) + base_per_day

        total_km += day_km
        total_cost += day_cost
        all_segments.extend(distances["segments"])

        for i, seg in enumerate(distances["segments"]):
            if i + 1 < len(stops):
                stops[i + 1]["_distFromPrev"] = seg["km"]
                stops[i + 1]["_travelTime"] = seg["mins"]
                stops[i + 1]["_travelText"] = seg["text"]
                stops[i + 1]["travel_to_next"] = seg["text"]
                stops[i]["travel_to_next"] = seg["text"]

    return {
        "total_usd": round(total_cost, 2),
        "total_km": round(total_km, 1),
        "cost_per_km": cost_per_km,
        "mode": mode_config["label"],
        "segments": all_segments,
        "base_daily": base_per_day,
        "num_days": num_days,
    }
