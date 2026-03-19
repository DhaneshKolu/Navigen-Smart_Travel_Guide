import math
from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
from app.ml.ranking import rank_places_for_day
from app.ml.routing import order_places_by_distance, split_ordered_places_by_day


class DayPlanningAgent(BaseAgent):

    name = "DayPlanningAgent"

    requires_fields = [
        "weather_info",
        "cuisine_recommendations",
    ]

    produces_fields = ["daily_plan"]

    def can_run(self, state: PlanningState) -> bool:
        # Only require weather and cuisines - places are optional
        return (
            state.weather_info
            and state.cuisine_recommendations
        )

    async def run(self, state: PlanningState) -> PlanningState:

        daily_plan = {}

        # Check if we have places data
        has_places = state.places and len(state.places) > 0

        optimized_day_places = {}
        if has_places:
            # Build an optimized place sequence once, then split across days.
            ranked_places = rank_places_for_day(
                state.places,
                state.user_lat,
                state.user_lon,
                weather_description=None,
                temperature=None,
                limit=max(state.days * 5, 8),
            )
            ordered_places = order_places_by_distance(ranked_places, state.user_lat, state.user_lon)
            day_buckets = split_ordered_places_by_day(ordered_places, state.days)
            optimized_day_places = {
                f"day_{idx + 1}": bucket for idx, bucket in enumerate(day_buckets)
            }

        for i in range(state.days):
            day = f"day_{i+1}"

            # Get weather and cuisine info
            weather_data = state.weather_info.get(day, {})
            description = weather_data.get("description", "pleasant weather")
            temperature = weather_data.get("avg_temperature", 25)

            cuisine_data = state.cuisine_recommendations.get(day, {})
            cuisine_type = cuisine_data.get("cuisine_type", "local")
            restaurants = cuisine_data.get("restaurants", []) if isinstance(cuisine_data, dict) else []
            restaurant_names = [
                r.get("name") for r in restaurants
                if isinstance(r, dict) and r.get("name")
            ][:3]

            hotel_names = []
            if isinstance(state.hotel_options, dict):
                for key in ("recommended_hotels", "hotels"):
                    for h in (state.hotel_options.get(key, []) or []):
                        if isinstance(h, dict) and h.get("name"):
                            hotel_names.append(h["name"])
                    if hotel_names:
                        break
            hotel_names = hotel_names[:2]
            
            # Create basic activities list
            activities = [
                f"🌅 Morning: Explore {state.city}'s local attractions",
                f"🍽️  Lunch: Try {cuisine_type.title()} cuisine at {', '.join(restaurant_names) if restaurant_names else 'top local restaurants'}",
                f"☀️ Afternoon: Visit cultural sites and local markets (Weather: {description}, {temperature}°C)",
                f"🌆 Evening: Relax and enjoy {cuisine_type.title()} dinner at {restaurant_names[-1] if restaurant_names else 'a recommended venue'}",
                f"🏨 Stay: {', '.join(hotel_names) if hotel_names else 'recommended hotel options for your budget'}",
                f"🌙 Night: Stroll through the city and explore nightlife",
            ]

            # If we have places, enhance the activities
            if has_places:
                activities = self._generate_activities_with_places(
                    optimized_day_places.get(day, []),
                    cuisine_type,
                    description,
                    temperature,
                    restaurant_names,
                    hotel_names,
                )
            
            daily_plan[day] = activities

        state.daily_plan = daily_plan
        print(f"DayPlanningAgent created itinerary for {state.days} days")
        return state

    def _generate_activities_with_places(
        self,
        day_places,
        cuisine_type,
        weather_desc,
        temperature,
        restaurant_names,
        hotel_names,
    ):
        """Generate activities from ML-ranked and route-ordered places."""

        activities = [
            f"Optimized start: Begin near your closest high-value attraction.",
            f"🌅 Morning: Start your day with breakfast at {restaurant_names[0] if restaurant_names else f'one of the recommended {cuisine_type.title()} restaurants'}",
        ]

        for place in day_places:
            activities.append(
                f"📍 Visit {place.name} (Rating: {place.rating}/5)" if hasattr(place, 'rating') else f"📍 Visit {place.name}"
            )

        activities.extend([
            f"🍽️  Lunch: Enjoy {cuisine_type.title()} cuisine at {restaurant_names[1] if len(restaurant_names) > 1 else (restaurant_names[0] if restaurant_names else 'recommended restaurants')}",
            f"☀️ Afternoon activities: Explore more local attractions (Weather: {weather_desc}, {temperature}°C)",
            f"🌆 Evening: {cuisine_type.title()} dinner at {restaurant_names[2] if len(restaurant_names) > 2 else (restaurant_names[-1] if restaurant_names else 'a popular spot')}",
            f"🏨 Stay: {', '.join(hotel_names) if hotel_names else 'recommended hotel options'}",
            f"🌙 Night: Relax and enjoy local nightlife"
        ])

        return activities


    def score_weather(self, description, temperature):
        score = 0

        if description:
            desc = description.lower()
            if "storm" in desc:
                score -= 2
            elif "rain" in desc:
                score -= 1
            elif "clear" in desc:
                score += 2

        if temperature:
            if temperature > 38:
                score -= 1
            elif 20 <= temperature <= 32:
                score += 1

        return score

    def activity_from_score(self, score):
        if score <= -2:
            return "strict indoor"
        if score == -1:
            return "indoor"
        if score >= 2:
            return "outdoor"
        return "mixed"



    def filter_places_by_activity(self, places, activity_type):
        if not places:
            return []

        if activity_type in ["indoor", "strict indoor"]:
            return [
                p for p in places
                if p.category in [
                    "museum",
                    "mall",
                    "art_gallery",
                    "cafe",
                    "library",
                    "theatre"
                ]
            ]

        if activity_type == "outdoor":
            return [
                p for p in places
                if p.category in [
                    "park",
                    "beach",
                    "attraction",
                    "viewpoint",
                    "zoo",
                    "garden",
                    "memorial",
                    "monument",
                    "historic"
                ]
            ]

        return places


    def is_within_radius(self, place, user_lat, user_lon, radius_km):
        if user_lat is None or user_lon is None:
            return True

        return self.distance_from_user(place, user_lat, user_lon) <= radius_km

    def distance_from_user(self, place, user_lat, user_lon):
        if user_lat is None or user_lon is None:
            return 0

        R = 6371  # Earth radius in km

        lat1 = math.radians(user_lat)
        lon1 = math.radians(user_lon)
        lat2 = math.radians(place.latitude)
        lon2 = math.radians(place.longitude)

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

 

    def category_weight(self, category):
        weights = {
            "attraction": 6,
            "museum": 6,
            "monument": 5,
            "historic": 5,
            "viewpoint": 4,
            "zoo": 4,
            "garden": 3,
            "park": 2,
            "restaurant": 2,
            "cafe": 1,
            "guest_house": 1,
        }
        return weights.get(category, 1)

    def combined_score(self, place, user_lat, user_lon):
        distance = self.distance_from_user(place, user_lat, user_lon)
        category_score = self.category_weight(place.category)

        distance_score = 1 / (distance + 0.1)

        return (category_score * 4) + distance_score
    
    def angle_from_user(self, place, user_lat, user_lon):
        if user_lat is None or user_lon is None:
            return 0

        dx = place.longitude - user_lon
        dy = place.latitude - user_lat

        return math.atan2(dy, dx)
    
    def cluster_places_by_day(self, places, days, user_lat, user_lon):
        if not places:
            return [[] for _ in range(days)]

        places_sorted = sorted(
            places,
            key=lambda p: self.angle_from_user(p, user_lat, user_lon)
        )

        clusters = [[] for _ in range(days)]

        for idx, place in enumerate(places_sorted):
            cluster_index = idx % days
            clusters[cluster_index].append(place)

        return clusters

 

    def confidence(self, state: PlanningState) -> float:
        return 0.9

    def explain(self, state: PlanningState) -> str:
        return "Daily itinerary assembled using weather, radius filtering, and weighted geo ranking."
    