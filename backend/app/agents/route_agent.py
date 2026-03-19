from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
from app.services.routing_service import RoutingService
import asyncio
from types import SimpleNamespace
from app.ml.ranking import rank_places_for_day
from app.ml.routing import order_places_by_distance, split_ordered_places_by_day


class RouteAgent(BaseAgent):

    name = "RouteAgent"
    requires_fields = ["city", "days"]
    produces_fields = ["route_plan"]

    def __init__(self):
        self.routing_service = RoutingService()

    def can_run(self, state: PlanningState) -> bool:
        return bool(state.city and state.days)

    async def run(self, state: PlanningState) -> PlanningState:

        print("RouteAgent started")

        routes = {}

        if not state.daily_plan:
            print("No daily plan found, skipping routing")
            state.route_plan = {}
            return state

        candidate_places = state.places or []
        if len(candidate_places) < 2:
            candidate_places = self._collect_waypoints_from_plan(state)

        ranked_places = rank_places_for_day(
            candidate_places,
            state.user_lat,
            state.user_lon,
            weather_description=None,
            temperature=None,
            limit=max(state.days * 5, 8),
        )
        ordered_places = order_places_by_distance(ranked_places, state.user_lat, state.user_lon)

        if len(ordered_places) < 2:
            ordered_places = [
                p for p in (state.places or [])
                if getattr(p, "latitude", None) is not None and getattr(p, "longitude", None) is not None
            ][: max(state.days * 4, 4)]

        if len(ordered_places) < 2 and state.user_lat is not None and state.user_lon is not None:
            alt_points = self._collect_waypoints_from_plan(state)
            if alt_points:
                ordered_places = [
                    SimpleNamespace(name="Your Location", latitude=state.user_lat, longitude=state.user_lon, rating=None, category="origin"),
                    alt_points[0],
                ]

        day_buckets = split_ordered_places_by_day(ordered_places, state.days)

        if not any(len(bucket) >= 2 for bucket in day_buckets) and len(ordered_places) >= 2:
            day_buckets = [ordered_places] + [[] for _ in range(max(state.days - 1, 0))]

        for idx, day_places in enumerate(day_buckets):
            day_key = f"day_{idx + 1}"
            day_routes = []

            if len(day_places) < 2:
                routes[day_key] = []
                continue

            for i in range(len(day_places) - 1):
                a = day_places[i]
                b = day_places[i + 1]

                a_lat = getattr(a, "latitude", None)
                a_lon = getattr(a, "longitude", None)
                b_lat = getattr(b, "latitude", None)
                b_lon = getattr(b, "longitude", None)

                if None in (a_lat, a_lon, b_lat, b_lon):
                    continue

                route = await self.routing_service.get_route(
                    a_lat,
                    a_lon,
                    b_lat,
                    b_lon,
                )

                if route:
                    day_routes.append({
                        "from": getattr(a, "name", "Stop A"),
                        "to": getattr(b, "name", "Stop B"),
                        "from_lat": a_lat,
                        "from_lon": a_lon,
                        "to_lat": b_lat,
                        "to_lon": b_lon,
                        "distance_km": round(route["distance_km"], 2),
                        "duration_min": round(route["duration_min"], 2),
                        "geometry": route["geometry"],
                        "steps": route.get("steps", []),
                    })
                else:
                    # Fallback segment so UI can still render optimized sequence
                    # when external routing API is unavailable.
                    day_routes.append({
                        "from": getattr(a, "name", "Stop A"),
                        "to": getattr(b, "name", "Stop B"),
                        "from_lat": a_lat,
                        "from_lon": a_lon,
                        "to_lat": b_lat,
                        "to_lon": b_lon,
                        "distance_km": 0,
                        "duration_min": 0,
                        "geometry": [[a_lon, a_lat], [b_lon, b_lat]],
                        "steps": [
                            {
                                "instruction": "Proceed from start to destination point",
                                "distance_km": 0,
                                "duration_min": 0,
                            }
                        ],
                    })

            routes[day_key] = day_routes

        state.route_plan = routes

        print("RouteAgent finished")

        return state

    def _collect_waypoints_from_plan(self, state: PlanningState):
        points = []

        for day in (state.cuisine_recommendations or {}).values():
            if not isinstance(day, dict):
                continue
            for r in (day.get("restaurants") or []):
                if not isinstance(r, dict):
                    continue
                lat = r.get("latitude")
                lon = r.get("longitude")
                name = r.get("name")
                if lat is None or lon is None or not name:
                    continue
                points.append(SimpleNamespace(name=name, latitude=lat, longitude=lon, rating=r.get("rating"), category="restaurant"))

        hotels_blob = state.hotel_options or {}
        for key in ("recommended_hotels", "hotels"):
            for h in hotels_blob.get(key, []) if isinstance(hotels_blob, dict) else []:
                if not isinstance(h, dict):
                    continue
                lat = h.get("latitude")
                lon = h.get("longitude")
                name = h.get("name")
                if lat is None or lon is None or not name:
                    continue
                points.append(SimpleNamespace(name=name, latitude=lat, longitude=lon, rating=h.get("rating"), category="hotel"))

        dedup = {}
        for p in points:
            key = (round(float(p.latitude), 5), round(float(p.longitude), 5), p.name)
            dedup[key] = p

        return list(dedup.values())