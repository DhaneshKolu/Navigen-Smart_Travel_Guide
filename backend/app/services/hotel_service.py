import httpx
from typing import List, Dict, Any, Optional
from app.core.settings import settings
from app.services.geo_service import GeoService
from app.services.geoapify_service import GeoapifyService
import asyncio


CITY_CURRENCY_MAP = {
    "mumbai": ("INR", "Rs"),
    "delhi": ("INR", "Rs"),
    "new delhi": ("INR", "Rs"),
    "bengaluru": ("INR", "Rs"),
    "bangalore": ("INR", "Rs"),
    "hyderabad": ("INR", "Rs"),
    "chennai": ("INR", "Rs"),
    "kolkata": ("INR", "Rs"),
    "pune": ("INR", "Rs"),
    "india": ("INR", "Rs"),
}

FX_USD_TO_LOCAL = {
    "USD": 1.0,
    "INR": 83.0,
}

class HotelService:
    """Service for fetching hotel data from multiple sources"""
    
    def __init__(self):
        self.geo_service = GeoService()
        self.geoapify_service = GeoapifyService()
        self.google_places_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        self.overpass_urls = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://lz4.overpass-api.de/api/interpreter",
        ]
    
    # Fallback hotels by budget and city
    FALLBACK_HOTELS_BY_BUDGET = {
        "budget": [
            {"name": "Budget Inn", "type": "budget_hotel", "price_per_night": 30, "address": "Downtown Area", "stars": "2", "rooms": 50, "phone": "+1-800-BUDGET", "website": "https://budgetinn.com"},
            {"name": "Economy Lodge", "type": "budget_hotel", "price_per_night": 35, "address": "City Center", "stars": "2", "rooms": 60, "phone": "+1-800-ECONOMY", "website": "https://economylodge.com"},
            {"name": "Value Hotel", "type": "budget_hotel", "price_per_night": 40, "address": "Main Street", "stars": "2", "rooms": 40, "phone": "+1-800-VALUE", "website": "https://valuehotel.com"},
            {"name": "Smart Stay", "type": "budget_hotel", "price_per_night": 45, "address": "Airport Area", "stars": "3", "rooms": 80, "phone": "+1-800-SMART", "website": "https://smartstay.com"},
            {"name": "Express Hotel", "type": "budget_hotel", "price_per_night": 50, "address": "Transit Hub", "stars": "3", "rooms": 100, "phone": "+1-800-EXPRESS", "website": "https://expresshotel.com"},
        ],
        "moderate": [
            {"name": "Park Plaza Hotel", "type": "hotel", "price_per_night": 80, "address": "City Center", "stars": "3", "rooms": 120, "phone": "+1-800-PARK", "website": "https://parkplaza.com"},
            {"name": "Riverside Inn", "type": "hotel", "price_per_night": 90, "address": "Waterfront", "stars": "3", "rooms": 100, "phone": "+1-800-RIVER", "website": "https://riversideinn.com"},
            {"name": "Grand Hotel", "type": "hotel", "price_per_night": 100, "address": "Historic District", "stars": "4", "rooms": 150, "phone": "+1-800-GRAND", "website": "https://grandhotel.com"},
            {"name": "Comfort Resort", "type": "hotel", "price_per_night": 110, "address": "Leisure Area", "stars": "4", "rooms": 200, "phone": "+1-800-COMFORT", "website": "https://comfortresort.com"},
            {"name": "Metropolitan Hotel", "type": "hotel", "price_per_night": 120, "address": "Business District", "stars": "4", "rooms": 180, "phone": "+1-800-METRO", "website": "https://metrohotel.com"},
        ],
        "luxury": [
            {"name": "The Ritz Hotel", "type": "luxury_hotel", "price_per_night": 250, "address": "Premium Location", "stars": "5", "rooms": 80, "phone": "+1-800-RITZ", "website": "https://ritzhotel.com"},
            {"name": "Shangri-La Palace", "type": "luxury_hotel", "price_per_night": 280, "address": "Prestige District", "stars": "5", "rooms": 100, "phone": "+1-800-SHANGRI", "website": "https://shangrila.com"},
            {"name": "The Crown Jewel", "type": "luxury_hotel", "price_per_night": 300, "address": "Elite Zone", "stars": "5", "rooms": 60, "phone": "+1-800-CROWN", "website": "https://crownjewel.com"},
            {"name": "Opulence Resort", "type": "luxury_hotel", "price_per_night": 320, "address": "Exclusive Enclave", "stars": "5", "rooms": 120, "phone": "+1-800-OPULENT", "website": "https://opulenceresort.com"},
            {"name": "Imperial Palace", "type": "luxury_hotel", "price_per_night": 350, "address": "Royal District", "stars": "5", "rooms": 90, "phone": "+1-800-IMPERIAL", "website": "https://imperialpalace.com"},
        ]
    }
    
    async def search_hotels(
        self, 
        city: str, 
        budget_per_night: Optional[float] = None,
        limit: int = 10,
        center_lat: Optional[float] = None,
        center_lon: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for hotels in a city with optional budget filtering.
        Tries Geoapify first, then OpenStreetMap, then Google Places (if configured).
        """
        try:
            lat, lon = center_lat, center_lon
            if lat is None or lon is None:
                coords = await self.geo_service.geocode(city)
                if not coords:
                    # Return no synthetic hotels when geocoding fails.
                    return []
                lat, lon = coords
            
            # Primary: Geoapify real-time places API.
            hotels = await self._search_geoapify_hotels(lat, lon, limit)

            # Secondary: OSM failover when Geoapify is sparse or unavailable.
            if len(hotels) < max(3, limit // 2):
                osm_hotels = await self._search_osm_hotels(lat, lon, limit - len(hotels))
                hotels.extend(osm_hotels)
            
            # Tertiary: Try Google Places if API key available and still need more
            if len(hotels) < limit // 2:
                if hasattr(settings, 'GOOGLE_PLACES_API_KEY') and settings.GOOGLE_PLACES_API_KEY:
                    google_hotels = await self._search_google_hotels(
                        lat, lon, budget_per_night, limit - len(hotels)
                    )
                    hotels.extend(google_hotels)

            hotels = self._deduplicate_hotels(hotels)
            
            # FALLBACK 2: API returned no results
            if not hotels:
                return []
            
            # Apply budget filtering if budget_per_night provided
            if budget_per_night:
                hotels = self._filter_by_budget(hotels, budget_per_night)
            
            return hotels[:limit]
        
        except Exception as e:
            print(f"Error searching hotels for {city}: {e}")
            return []

    async def _search_geoapify_hotels(
        self,
        lat: float,
        lon: float,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        categories = [
            "accommodation.hotel",
            "accommodation.hostel",
            "accommodation.guest_house",
            "accommodation.motel",
            "accommodation.apartment",
        ]

        try:
            features = await self.geoapify_service.search_places(
                lat=lat,
                lon=lon,
                categories=categories,
                limit=limit,
            )
            hotels = []
            for feature in features:
                properties = feature.get("properties", {})
                geometry = feature.get("geometry", {})
                coords = geometry.get("coordinates", [])

                place_id = properties.get("place_id")
                if not place_id or len(coords) != 2:
                    continue

                hotel_type = self._extract_geoapify_hotel_type(properties.get("categories") or [])
                name = properties.get("name") or properties.get("formatted")
                if not name:
                    continue

                lon_v, lat_v = coords
                hotel = {
                    "name": name,
                    "type": hotel_type,
                    "latitude": float(lat_v),
                    "longitude": float(lon_v),
                    "address": properties.get("formatted", ""),
                    "phone": properties.get("phone", ""),
                    "website": properties.get("website", ""),
                    "stars": properties.get("stars", ""),
                    "source": "geoapify",
                    "external_id": f"geoapify_{place_id}",
                }
                hotels.append(hotel)
            return hotels[:limit]
        except Exception as e:
            print(f"Geoapify hotel search error: {e}")
            return []
    
    async def _search_osm_hotels(self, lat: float, lon: float, limit: int = 10) -> List[Dict[str, Any]]:
        """Search for hotels using OpenStreetMap Overpass API"""
        query = f"""
        [out:json];
        (
        node["tourism"="hotel"](around:5000,{lat},{lon});
        node["tourism"="guest_house"](around:5000,{lat},{lon});
        node["tourism"="hostel"](around:5000,{lat},{lon});
        node["tourism"="apartment"](around:5000,{lat},{lon});
        node["tourism"="hotel_complex"](around:5000,{lat},{lon});
        );
        out;
        """
        
        try:
            elements = await self._query_overpass_with_failover(query)
            hotels = []
            
            for el in elements:
                tags = el.get("tags", {})
                name = tags.get("name")
                if not name:
                    continue
                
                hotel = {
                    "name": name,
                    "type": tags.get("tourism", "hotel"),
                    "latitude": el.get("lat"),
                    "longitude": el.get("lon"),
                    "address": tags.get("addr:full", ""),
                    "phone": tags.get("phone", ""),
                    "website": tags.get("website", ""),
                    "stars": tags.get("stars", ""),
                    "rooms": tags.get("rooms", ""),
                    "source": "openstreetmap",
                    "external_id": f"osm_{el.get('id')}"
                }
                hotels.append(hotel)
        
        except Exception as e:
            print(f"OSM hotel search error: {e}")
            hotels = []
        
        return hotels[:limit]

    async def _query_overpass_with_failover(self, query: str) -> List[Dict[str, Any]]:
        last_error = None
        async with httpx.AsyncClient(timeout=12.0) as client:
            for url in self.overpass_urls:
                for attempt in range(2):
                    try:
                        response = await client.post(url, data={"data": query})
                        if response.status_code == 429:
                            await asyncio.sleep(1.2 * (attempt + 1))
                            continue
                        response.raise_for_status()
                        return response.json().get("elements", [])
                    except Exception as e:
                        last_error = e
                        await asyncio.sleep(0.4)
                        continue
        raise RuntimeError(f"All Overpass endpoints failed: {last_error}")
    
    async def _search_google_hotels(
        self, 
        lat: float, 
        lon: float, 
        budget: Optional[float] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for hotels using Google Places API"""
        if not hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return []
        
        try:
            params = {
                "location": f"{lat},{lon}",
                "radius": 5000,
                "type": "lodging",
                "key": settings.GOOGLE_PLACES_API_KEY
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.google_places_url, params=params)
                response.raise_for_status()
            
            data = response.json()
            hotels = []
            
            for place in data.get("results", [])[:limit]:
                hotel = {
                    "name": place.get("name", ""),
                    "type": "hotel",
                    "latitude": place["geometry"]["location"]["lat"],
                    "longitude": place["geometry"]["location"]["lng"],
                    "address": place.get("vicinity", ""),
                    "rating": place.get("rating", ""),
                    "user_ratings": place.get("user_ratings_total", 0),
                    "open_now": place.get("opening_hours", {}).get("open_now", None),
                    "source": "google_places",
                    "external_id": place.get("place_id")
                }
                hotels.append(hotel)
        
        except Exception as e:
            print(f"Google Places hotel search error: {e}")
            hotels = []
        
        return hotels
    
    async def get_hotel_details(
        self,
        hotel_id: str,
        source: str = "openstreetmap"
    ) -> Optional[Dict[str, Any]]:
        """Get detailed information about a specific hotel"""
        if source == "google_places" and hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return await self._get_google_hotel_details(hotel_id)
        
        return None
    
    async def _get_google_hotel_details(self, place_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed info from Google Places API"""
        if not hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return None
        
        try:
            url = "https://maps.googleapis.com/maps/api/place/details/json"
            params = {
                "place_id": place_id,
                "fields": "name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,reviews,prices",
                "key": settings.GOOGLE_PLACES_API_KEY
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
            
            return response.json().get("result")
        
        except Exception as e:
            print(f"Error fetching hotel details: {e}")
            return None
    
    async def estimate_budget(
        self,
        hotels: List[Dict[str, Any]],
        num_nights: int,
        budget_limit: Optional[float] = None
    ) -> Dict[str, Any]:
        """Estimate total hotel budget based on selected hotels"""
        if not hotels:
            return {"estimated_cost": 0, "recommended_hotels": []}
        
        # Filter by budget if provided
        recommended = hotels
        if budget_limit:
            avg_price_per_hotel = budget_limit / num_nights
            # In real implementation, you'd have price data from API
            # For now, we'll return all hotels
        
        return {
            "estimated_cost": budget_limit or (num_nights * 100),  # Default estimate
            "num_hotels": len(recommended),
            "recommended_hotels": recommended[:3],
            "num_nights": num_nights
        }
    
    def _get_fallback_hotels(
        self,
        budget_per_night: Optional[float] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Return fallback hotels when APIs are unavailable, optionally filtered by budget"""
        
        # Determine budget tier
        if budget_per_night is None:
            # No budget specified, return mix of all tiers
            all_hotels = []
            for tier_hotels in self.FALLBACK_HOTELS_BY_BUDGET.values():
                all_hotels.extend(tier_hotels)
            return all_hotels[:limit]
        
        # Select tier based on budget_per_night
        if budget_per_night < 60:
            selected_hotels = self.FALLBACK_HOTELS_BY_BUDGET["budget"]
        elif budget_per_night < 150:
            # Mix of budget and moderate
            selected_hotels = self.FALLBACK_HOTELS_BY_BUDGET["budget"] + self.FALLBACK_HOTELS_BY_BUDGET["moderate"]
        else:
            # Mix of moderate and luxury
            selected_hotels = self.FALLBACK_HOTELS_BY_BUDGET["moderate"] + self.FALLBACK_HOTELS_BY_BUDGET["luxury"]
        
        # Sort by price to match budget preference better
        selected_hotels = sorted(
            selected_hotels,
            key=lambda x: abs(x.get("price_per_night", 100) - budget_per_night)
        )
        
        return selected_hotels[:limit]
    
    def _filter_by_budget(
        self,
        hotels: List[Dict[str, Any]],
        budget_per_night: float,
        tolerance: float = 1.3
    ) -> List[Dict[str, Any]]:
        """Filter hotels by budget with tolerance (30% over budget allowed)"""
        filtered = []
        max_price = budget_per_night * tolerance
        
        for hotel in hotels:
            # Try to get price from different sources
            price = None
            if "price_per_night" in hotel:
                price = hotel.get("price_per_night")
            elif "price_level" in hotel:
                # Google Places price level (1-4)
                price = 50 * hotel.get("price_level", 2)
            else:
                # If no price info, include hotel
                filtered.append(hotel)
                continue
            
            if price and price <= max_price:
                filtered.append(hotel)
        
        # If filtering removed too many, return top options by rating
        if len(filtered) < 3 and hotels:
            return sorted(hotels, key=lambda x: x.get("rating", 0), reverse=True)[:len(hotels)]
        
        return filtered

    def detect_currency_for_city(self, city: str) -> Dict[str, str]:
        city_lower = (city or "").lower()
        for key, value in CITY_CURRENCY_MAP.items():
            if key in city_lower:
                code, symbol = value
                return {"code": code, "symbol": symbol}
        return {"code": "USD", "symbol": "$"}

    def localize_hotel_prices(
        self,
        hotels: List[Dict[str, Any]],
        currency_code: str,
    ) -> List[Dict[str, Any]]:
        fx = FX_USD_TO_LOCAL.get(currency_code, 1.0)
        localized = []

        for hotel in hotels:
            copy_hotel = dict(hotel)
            price = copy_hotel.get("price_per_night")
            if isinstance(price, (int, float)):
                copy_hotel["price_per_night"] = round(price * fx)
                copy_hotel["price_currency"] = currency_code
            localized.append(copy_hotel)

        return localized

    def _extract_geoapify_hotel_type(self, categories: List[str]) -> str:
        lowered = [c.lower() for c in categories]
        for category in lowered:
            if "accommodation.hotel" in category:
                return "hotel"
            if "accommodation.hostel" in category:
                return "hostel"
            if "accommodation.guest_house" in category:
                return "guest_house"
            if "accommodation.motel" in category:
                return "motel"
            if "accommodation.apartment" in category:
                return "apartment"
        return "hotel"

    def _deduplicate_hotels(self, hotels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        unique: List[Dict[str, Any]] = []
        seen = set()
        for hotel in hotels:
            external_id = hotel.get("external_id")
            if external_id and external_id in seen:
                continue

            key = external_id or (
                (hotel.get("name") or "").strip().lower(),
                round(float(hotel.get("latitude") or 0), 5),
                round(float(hotel.get("longitude") or 0), 5),
            )
            if key in seen:
                continue

            seen.add(key)
            unique.append(hotel)
        return unique
