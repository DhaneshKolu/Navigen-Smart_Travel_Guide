from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
from app.services.cuisine_service import CuisineService
from app.ml.ranking import rank_places_for_day
from app.ml.routing import order_places_by_distance, split_ordered_places_by_day
import math

class CuisineAgent(BaseAgent):

    name = "CuisineAgent"
    requires_fields = ["city", "interests"]
    produces_fields = ["cuisine_recommendations"]

    def __init__(self):
        self.cuisine_service = CuisineService()

    def can_run(self, state: PlanningState) -> bool:
        return True

    async def run(self, state: PlanningState) -> PlanningState:
        print(f"{self.name} started")
        
        try:
            day_landmarks = {}
            if state.places:
                ranked_places = rank_places_for_day(
                    state.places,
                    state.user_lat,
                    state.user_lon,
                    weather_description=None,
                    temperature=None,
                    limit=max(state.days * 3, state.days),
                )
                ordered = order_places_by_distance(ranked_places, state.user_lat, state.user_lon)
                buckets = split_ordered_places_by_day(ordered, state.days)

                for idx, bucket in enumerate(buckets):
                    if not bucket:
                        continue
                    first = bucket[0]
                    day_landmarks[f"day_{idx + 1}"] = {
                        "name": getattr(first, "name", None),
                        "latitude": getattr(first, "latitude", None),
                        "longitude": getattr(first, "longitude", None),
                    }

            # Get daily cuisine recommendations based on location and interests
            # Uses real-time user location for proximity filtering
            recommendations = await self.cuisine_service.get_daily_cuisine_recommendations(
                city=state.city,
                days=state.days,
                interests=state.interests,
                user_lat=state.user_lat,
                user_lon=state.user_lon,
                day_landmarks=day_landmarks,
                radius_km=state.radius_km or 5,
            )

            # If external search is sparse, backfill from cached OSM places
            # already fetched for this city (real place names, not synthetic).
            recommendations = self._backfill_from_places(recommendations, state)
            
            if not recommendations or not any(recommendations.values()):
                print(f"No cuisine recommendations found for {state.city}, using fallback")
                recommendations = {
                    f"day_{i+1}": {
                        "cuisine_type": "local",
                        "popularity_score": 1.0,
                        "restaurants": [],
                        "suggestion": "Explore local dining options"
                    }
                    for i in range(state.days)
                }
            
            # Store the recommendations directly for DayPlanningAgent compatibility
            state.cuisine_recommendations = recommendations
            print(f"Generated cuisine recommendations for {state.days} days in {state.city}")
            print(f"User location: {state.user_lat}, {state.user_lon if state.user_lon else 'Not provided'}")
        
        except Exception as e:
            print(f"Error in CuisineAgent: {e}")
            recommendations = {
                f"day_{i+1}": {
                    "cuisine_type": "local",
                    "popularity_score": 1.0,
                    "restaurants": [],
                    "suggestion": "Explore local dining options"
                }
                for i in range(state.days)
            }
            state.cuisine_recommendations = recommendations
        
        print(f"{self.name} finished")
        return state

    def confidence(self, state: PlanningState) -> float:
        if state.cuisine_recommendations:
            # Count total restaurants across all days
            total_restaurants = sum(
                len(rec.get("restaurants", []))
                for rec in state.cuisine_recommendations.values()
                if isinstance(rec, dict)
            )
            if total_restaurants > 5:
                return 0.95
            elif total_restaurants > 0:
                return 0.85
        return 0.65

    def explain(self, state: PlanningState) -> str:
        if state.cuisine_recommendations:
            total_restaurants = sum(
                len(rec.get("restaurants", []))
                for rec in state.cuisine_recommendations.values()
                if isinstance(rec, dict)
            )
            if total_restaurants > 0:
                return f"Curated {total_restaurants} restaurant options across {state.days} days based on your interests."
        return "Cuisine recommendations generated based on destination dining options."

    def _backfill_from_places(self, recommendations: dict, state: PlanningState) -> dict:
        if not isinstance(recommendations, dict):
            recommendations = {}

        categories = {
            "restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "ice_cream"
        }

        candidates = [
            p for p in (state.places or [])
            if (getattr(p, "category", "") or "").lower() in categories
        ]

        if state.user_lat is not None and state.user_lon is not None:
            radius = state.radius_km or 5
            candidates = [
                p for p in candidates
                if self._distance_km(state.user_lat, state.user_lon, getattr(p, "latitude", None), getattr(p, "longitude", None)) <= radius
            ]

        for i in range(state.days):
            day_key = f"day_{i + 1}"
            day_rec = recommendations.get(day_key, {}) if isinstance(recommendations.get(day_key), dict) else {}
            restaurants = day_rec.get("restaurants", []) if isinstance(day_rec.get("restaurants", []), list) else []

            if restaurants:
                continue

            sample = candidates[i * 3:(i + 1) * 3] if candidates else []
            if not sample and candidates:
                sample = candidates[:3]

            if sample:
                day_rec["restaurants"] = [
                    {
                        "name": getattr(p, "name", ""),
                        "type": "restaurant",
                        "cuisine": day_rec.get("cuisine_type", "local"),
                        "address": getattr(p, "address", "") or "",
                        "latitude": getattr(p, "latitude", None),
                        "longitude": getattr(p, "longitude", None),
                        "rating": getattr(p, "rating", None),
                        "source": getattr(p, "source", "osm") or "osm",
                    }
                    for p in sample
                ]
                day_rec["suggestion"] = day_rec.get("suggestion") or "Nearby real places matched from destination data"
                recommendations[day_key] = day_rec

        return recommendations

    def _distance_km(self, lat1, lon1, lat2, lon2):
        if None in (lat1, lon1, lat2, lon2):
            return float("inf")
        r = 6371
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(d_lat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(d_lon / 2) ** 2
        )
        return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))
