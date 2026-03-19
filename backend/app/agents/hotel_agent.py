from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
from app.services.hotel_service import HotelService
from app.ml.ranking import rank_places_for_day
import math

class HotelAgent(BaseAgent):

    name = "HotelAgent"
    requires_fields = ["city", "budget"]
    produces_fields = ["hotel_options"]

    def __init__(self):
        self.hotel_service = HotelService()

    def can_run(self, state: PlanningState) -> bool:
        return bool(state.city)

    async def run(self, state: PlanningState) -> PlanningState:
        print(f"{self.name} started")
        
        try:
            # Calculate budget per night for filtering
            budget_per_night = state.budget / max(state.days, 1) if state.budget > 0 else None
            currency_info = self.hotel_service.detect_currency_for_city(state.city)

            center_lat = None
            center_lon = None
            near_landmark = None

            if state.places:
                ranked_places = rank_places_for_day(
                    state.places,
                    state.user_lat,
                    state.user_lon,
                    weather_description=None,
                    temperature=None,
                    limit=1,
                )
                if ranked_places:
                    top_place = ranked_places[0]
                    center_lat = getattr(top_place, "latitude", None)
                    center_lon = getattr(top_place, "longitude", None)
                    near_landmark = getattr(top_place, "name", None)
            
            # Search for hotels in the destination city
            hotels = await self.hotel_service.search_hotels(
                city=state.city,
                budget_per_night=budget_per_night,
                limit=10,
                center_lat=center_lat,
                center_lon=center_lon,
            )

            hotels = self._filter_hotels_by_radius(
                hotels,
                state.user_lat,
                state.user_lon,
                state.radius_km or 5,
            )

            if not hotels:
                hotels = self._hotels_from_places(state)

            hotels = self.hotel_service.localize_hotel_prices(hotels, currency_info["code"])
            
            if not hotels:
                print(f"No hotels found for {state.city}, using fallback")
                state.hotel_options = {
                    "status": "unavailable",
                    "message": f"Could not find hotels for {state.city}",
                    "recommended_hotel": None,
                    "budget_estimate": state.budget * 0.4,
                    "hotels": [],
                    "currency_code": currency_info["code"],
                    "currency_symbol": currency_info["symbol"],
                }
            else:
                # Get budget estimate
                budget_info = await self.hotel_service.estimate_budget(
                    hotels, 
                    state.days, 
                    state.budget
                )

                budget_estimate = budget_info.get("estimated_cost", state.budget * 0.4)
                if isinstance(budget_estimate, (int, float)):
                    # Keep estimate in user itinerary currency. The incoming
                    # budget is already user-specified local currency.
                    budget_estimate = round(budget_estimate)
                
                state.hotel_options = {
                    "status": "found",
                    "hotels": hotels,
                    "recommended_hotels": budget_info.get("recommended_hotels", []),
                    "budget_estimate": budget_estimate,
                    "num_hotels_found": len(hotels),
                    "search_location": state.city,
                    "near_landmark": near_landmark,
                    "currency_code": currency_info["code"],
                    "currency_symbol": currency_info["symbol"],
                }
                
                print(f"Found {len(hotels)} hotels in {state.city}")
        
        except Exception as e:
            print(f"Error in HotelAgent: {e}")
            currency_info = self.hotel_service.detect_currency_for_city(state.city)
            state.hotel_options = {
                "status": "error",
                "message": str(e),
                "budget_estimate": state.budget * 0.4,
                "hotels": [],
                "currency_code": currency_info["code"],
                "currency_symbol": currency_info["symbol"],
            }
        
        print(f"{self.name} finished")
        return state

    def confidence(self, state: PlanningState) -> float:
        if state.hotel_options and state.hotel_options.get("status") == "found":
            return 0.9
        return 0.6

    def explain(self, state: PlanningState) -> str:
        if state.hotel_options and state.hotel_options.get("status") == "found":
            num_hotels = state.hotel_options.get("num_hotels_found", 0)
            return f"Found {num_hotels} hotels in {state.city} matching your budget constraints."
        return "Hotel search completed with available options."

    def _filter_hotels_by_radius(self, hotels, user_lat, user_lon, radius_km):
        if user_lat is None or user_lon is None:
            return hotels
        filtered = []
        for h in hotels or []:
            lat = h.get("latitude") if isinstance(h, dict) else None
            lon = h.get("longitude") if isinstance(h, dict) else None
            if lat is None or lon is None:
                continue
            if self._distance_km(user_lat, user_lon, lat, lon) <= radius_km:
                filtered.append(h)
        return filtered

    def _hotels_from_places(self, state: PlanningState):
        categories = {"hotel", "guest_house", "hostel", "apartment", "motel"}
        hotels = [
            p for p in (state.places or [])
            if (getattr(p, "category", "") or "").lower() in categories
        ]
        if state.user_lat is not None and state.user_lon is not None:
            radius = state.radius_km or 5
            hotels = [
                p for p in hotels
                if self._distance_km(state.user_lat, state.user_lon, getattr(p, "latitude", None), getattr(p, "longitude", None)) <= radius
            ]

        return [
            {
                "name": getattr(p, "name", ""),
                "type": "hotel",
                "latitude": getattr(p, "latitude", None),
                "longitude": getattr(p, "longitude", None),
                "address": getattr(p, "address", "") or "",
                "source": getattr(p, "source", "osm") or "osm",
                "stars": "",
            }
            for p in hotels[:10]
            if getattr(p, "name", None)
        ]

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
