import httpx
from typing import List, Dict, Any, Optional
from app.core.settings import settings
from app.services.geo_service import GeoService
import math
import asyncio

class CuisineService:
    """Service for fetching restaurant and cuisine data from multiple sources"""
    
    def __init__(self):
        self.geo_service = GeoService()
        self.google_places_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        self.overpass_urls = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://lz4.overpass-api.de/api/interpreter",
        ]
    
    # Cuisine type mappings for different cuisines
    CUISINE_KEYWORDS = {
        "italian": ["Italian", "Pasta", "Pizza"],
        "chinese": ["Chinese", "Asian"],
        "indian": ["Indian", "Curry"],
        "mexican": ["Mexican", "Tacos"],
        "japanese": ["Japanese", "Sushi", "Ramen"],
        "thai": ["Thai"],
        "french": ["French"],
        "mediterranean": ["Mediterranean", "Greek"],
        "vegetarian": ["Vegetarian", "Vegan"],
        "seafood": ["Seafood"],
        "fast_food": ["Fast Food", "Burger"],
        "local": ["Local", "Traditional"]
    }
    
    # Famous and popular cuisines by city/region
    FAMOUS_CUISINES_BY_LOCATION = {
        # European cities
        "paris": {"french": 1.0, "mediterranean": 0.8, "italian": 0.7, "local": 0.9},
        "rome": {"italian": 1.0, "mediterranean": 0.9, "seafood": 0.8, "local": 0.9},
        "barcelona": {"spanish": 0.9, "mediterranean": 1.0, "seafood": 0.9, "local": 0.9},
        "london": {"british": 0.8, "indian": 0.9, "chinese": 0.8, "local": 0.7},
        
        # Asian cities
        "bangkok": {"thai": 1.0, "seafood": 0.9, "local": 1.0, "vegetarian": 0.8},
        "tokyo": {"japanese": 1.0, "local": 1.0, "seafood": 0.95, "vegetarian": 0.7},
        "hong kong": {"chinese": 1.0, "seafood": 0.95, "local": 1.0, "dim_sum": 0.9},
        "dubai": {"middle_eastern": 1.0, "indian": 0.85, "seafood": 0.8, "local": 0.9},
        "mumbai": {"indian": 1.0, "seafood": 0.8, "local": 0.95, "vegetarian": 0.9},
        "delhi": {"indian": 1.0, "local": 0.95, "vegetarian": 0.85, "street_food": 0.9},
        "bangkok": {"thai": 1.0, "seafood": 0.9, "local": 1.0, "street_food": 0.95},
        "singapore": {"chinese": 0.9, "indian": 0.85, "local": 1.0, "seafood": 0.8},
        
        # American cities
        "new york": {"american": 0.9, "chinese": 0.85, "italian": 0.8, "mexican": 0.8},
        "los angeles": {"mexican": 0.9, "asian": 0.85, "american": 0.8, "local": 0.8},
        "miami": {"cuban": 0.95, "seafood": 0.9, "latin": 0.85, "local": 0.85},
        
        # Middle Eastern
        "istanbul": {"turkish": 1.0, "mediterranean": 0.9, "seafood": 0.85, "local": 0.95},
        "cairo": {"egyptian": 1.0, "middle_eastern": 0.95, "local": 0.95, "street_food": 0.9},
        
        # Caribbean
        "havana": {"cuban": 1.0, "caribbean": 0.95, "seafood": 0.85, "local": 0.95},
        
        # Default fallback
        "default": {"local": 1.0, "seafood": 0.7, "vegetarian": 0.7, "italian": 0.6}
    }
    
    # Fallback famous restaurants by city when APIs fail
    FALLBACK_RESTAURANTS_BY_CITY = {
        "paris": {
            "french": [
                {"name": "Le Jules Verne", "address": "Eiffel Tower, 5 Ave Anatole France, 75007 Paris", "rating": 4.7, "phone": "+33 1 45 55 61 44", "cuisine": "french"},
                {"name": "L'Astrance", "address": "4 Rue Beethoven, 75016 Paris", "rating": 4.8, "phone": "+33 1 40 50 84 40", "cuisine": "french"},
                {"name": "Le Comptoir Général", "address": "80 Quai de Jemmapes, 75010 Paris", "rating": 4.6, "phone": "+33 1 40 37 05 47", "cuisine": "french"},
                {"name": "Septime", "address": "80 Rue de Charonne, 75011 Paris", "rating": 4.7, "phone": "+33 1 43 67 38 29", "cuisine": "french"},
                {"name": "Frenchie", "address": "5 Rue de Nil, 75002 Paris", "rating": 4.6, "phone": "+33 1 40 39 96 19", "cuisine": "french"},
            ]
        },
        "tokyo": {
            "japanese": [
                {"name": "Sukiyabashi Jiro", "address": "4-2-15 Ginza, Chuo, Tokyo", "rating": 4.9, "phone": "+81 3-3535-3600", "cuisine": "japanese"},
                {"name": "Mizutani", "address": "1-16-27 Ginza, Chuo, Tokyo", "rating": 4.8, "phone": "+81 3-3561-0090", "cuisine": "japanese"},
                {"name": "Sushi Yoshitake", "address": "2-24-10 Kitashinagawa, Shinagawa, Tokyo", "rating": 4.8, "phone": "+81 3-3440-0088", "cuisine": "japanese"},
                {"name": "Nabezo", "address": "3-4-3 Roppongi, Minato, Tokyo", "rating": 4.5, "phone": "+81 3-3586-0129", "cuisine": "japanese"},
                {"name": "Gonpachi Nishi-Azabu", "address": "1-13-5 Nishi-Azabu, Minato, Tokyo", "rating": 4.6, "phone": "+81 3-5485-3500", "cuisine": "japanese"},
            ]
        },
        "bangkok": {
            "thai": [
                {"name": "Gaggan", "address": "68/1 Soi Langsuan, Ploenchit, Bangkok", "rating": 4.8, "phone": "+66 2-652-1745", "cuisine": "thai"},
                {"name": "Nahm", "address": "27 S. Sathorn Rd, Bangkok", "rating": 4.7, "phone": "+66 2-6369000", "cuisine": "thai"},
                {"name": "Blue Elephant", "address": "96 Soi 39 Sukhumvit Rd, Bangkok", "rating": 4.5, "phone": "+66 2-381-3010", "cuisine": "thai"},
                {"name": "Chote Chinatown", "address": "149-151 Maha Chai Rd, Bangkok", "rating": 4.6, "phone": "+66 2-225-4332", "cuisine": "thai"},
                {"name": "Somtam Der", "address": "98/100 Sukhumvit 33, Bangkok", "rating": 4.5, "phone": "+66 2-259-4498", "cuisine": "thai"},
            ]
        },
        "mumbai": {
            "indian": [
                {"name": "Indigo", "address": "4 Mandlik Rd, Mumbai", "rating": 4.6, "phone": "+91 22-6367-6000", "cuisine": "indian"},
                {"name": "Mahesh Lunch Home", "address": "8-B, Cordial House, Mumbai", "rating": 4.5, "phone": "+91 22-2284-3467", "cuisine": "indian"},
                {"name": "Indian Accent", "address": "95 Konstructs, 230-B Palimpsest Rd, Mumbai", "rating": 4.7, "phone": "+91 22-6718-1555", "cuisine": "indian"},
                {"name": "Dum Pukht", "address": "ITC Hotels, Maratha, Mumbai", "rating": 4.6, "phone": "+91 22-6630-3030", "cuisine": "indian"},
                {"name": "Masala Library", "address": "9, Ashok Estate, Mumbai", "rating": 4.6, "phone": "+91 22-4033-7000", "cuisine": "indian"},
            ]
        },
        "default": {
            "local": [
                {"name": "Local Fine Dining", "address": "City Centre", "rating": 4.5, "phone": "+1-800-DINING", "cuisine": "local"},
                {"name": "Heritage Restaurant", "address": "Historic District", "rating": 4.4, "phone": "+1-800-TASTE", "cuisine": "local"},
                {"name": "Market Café", "address": "Central Market, Downtown", "rating": 4.3, "phone": "+1-800-FRESH", "cuisine": "local"},
                {"name": "Traditional House", "address": "Old Quarter", "rating": 4.4, "phone": "+1-800-HOME", "cuisine": "local"},
                {"name": "Chef's Table", "address": "Restaurant District", "rating": 4.6, "phone": "+1-800-CHEF", "cuisine": "local"},
            ]
        }
    }
    
    async def search_restaurants(
        self,
        city: str,
        cuisine_types: Optional[List[str]] = None,
        limit: int = 15,
        center_lat: Optional[float] = None,
        center_lon: Optional[float] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Search for restaurants in a city, optionally filtered by cuisine type.
        
        Args:
            city: City name
            cuisine_types: List of cuisine types to search for (e.g., ["italian", "japanese"])
            limit: Maximum number of restaurants per cuisine
        
        Returns:
            Dictionary mapping cuisine types to list of restaurants
        """
        try:
            if not cuisine_types:
                cuisine_types = list(self.CUISINE_KEYWORDS.keys())

            lat, lon = center_lat, center_lon
            if lat is None or lon is None:
                coords = await self.geo_service.geocode(city)
                if not coords:
                    return {c: [] for c in cuisine_types}
                lat, lon = coords
            
            results = {}
            
            # Search using OSM first
            osm_restaurants = await self._search_osm_restaurants(lat, lon, limit)
            for cuisine in cuisine_types:
                results[cuisine] = self._filter_by_cuisine(osm_restaurants, cuisine, limit)
            
            # Supplement with Google Places if available
            if hasattr(settings, 'GOOGLE_PLACES_API_KEY') and settings.GOOGLE_PLACES_API_KEY:
                for cuisine in cuisine_types:
                    if len(results.get(cuisine, [])) < limit:
                        google_restaurants = await self._search_google_restaurants(
                            lat, lon, cuisine, limit - len(results.get(cuisine, []))
                        )
                        results[cuisine].extend(google_restaurants)
            
            # Use fallback if OSM results are too sparse
            if not any(results.values()):
                return {c: [] for c in cuisine_types}
            
            return results
        
        except Exception as e:
            print(f"Error searching restaurants for {city}: {e}")
            return {c: [] for c in (cuisine_types or [])}
    
    async def _search_osm_restaurants(
        self, 
        lat: float, 
        lon: float, 
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Search for restaurants using OpenStreetMap Overpass API"""
        query = f"""
        [out:json];
        (
        node["amenity"="restaurant"](around:5000,{lat},{lon});
        node["amenity"="cafe"](around:5000,{lat},{lon});
        node["amenity"="fast_food"](around:5000,{lat},{lon});
        node["amenity"="bar"](around:5000,{lat},{lon});
        node["amenity"="ice_cream"](around:5000,{lat},{lon});
        node["amenity"="pub"](around:5000,{lat},{lon});
        );
        out;
        """
        
        try:
            elements = await self._query_overpass_with_failover(query)
            restaurants = []
            
            for el in elements:
                tags = el.get("tags", {})
                name = tags.get("name")
                if not name:
                    continue
                
                restaurant = {
                    "name": name,
                    "type": tags.get("amenity", "restaurant"),
                    "cuisine": tags.get("cuisine", ""),
                    "latitude": el.get("lat"),
                    "longitude": el.get("lon"),
                    "address": tags.get("addr:full", ""),
                    "phone": tags.get("phone", ""),
                    "website": tags.get("website", ""),
                    "opening_hours": tags.get("opening_hours", ""),
                    "dietary": self._extract_dietary_info(tags),
                    "source": "openstreetmap",
                    "external_id": f"osm_{el.get('id')}"
                }
                restaurants.append(restaurant)
        
        except Exception as e:
            print(f"OSM restaurant search error: {e}")
            restaurants = []
        
        return restaurants[:limit]

    async def _query_overpass_with_failover(self, query: str) -> List[Dict[str, Any]]:
        last_error = None
        async with httpx.AsyncClient(timeout=12.0) as client:
            for url in self.overpass_urls:
                for attempt in range(2):
                    try:
                        response = await client.post(url, data={"data": query})
                        if response.status_code == 429:
                            # Gentle retry with small backoff; then switch endpoint.
                            await asyncio.sleep(1.2 * (attempt + 1))
                            continue
                        response.raise_for_status()
                        return response.json().get("elements", [])
                    except Exception as e:
                        last_error = e
                        await asyncio.sleep(0.4)
                        continue
        raise RuntimeError(f"All Overpass endpoints failed: {last_error}")
    
    async def _search_google_restaurants(
        self,
        lat: float,
        lon: float,
        cuisine_type: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for restaurants using Google Places API"""
        if not hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return []
        
        try:
            # Map cuisine type to search keywords
            keywords = self.CUISINE_KEYWORDS.get(cuisine_type, [cuisine_type])
            
            restaurants = []
            for keyword in keywords[:2]:  # Search for top 2 keywords per cuisine
                params = {
                    "location": f"{lat},{lon}",
                    "radius": 5000,
                    "type": "restaurant",
                    "keyword": keyword,
                    "key": settings.GOOGLE_PLACES_API_KEY
                }
                
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(self.google_places_url, params=params)
                    response.raise_for_status()
                
                data = response.json()
                
                for place in data.get("results", [])[:limit]:
                    restaurant = {
                        "name": place.get("name", ""),
                        "type": "restaurant",
                        "cuisine": cuisine_type,
                        "latitude": place["geometry"]["location"]["lat"],
                        "longitude": place["geometry"]["location"]["lng"],
                        "address": place.get("vicinity", ""),
                        "rating": place.get("rating", ""),
                        "user_ratings": place.get("user_ratings_total", 0),
                        "open_now": place.get("opening_hours", {}).get("open_now", None),
                        "price_level": place.get("price_level", ""),
                        "source": "google_places",
                        "external_id": place.get("place_id")
                    }
                    restaurants.append(restaurant)
            
            return restaurants[:limit]
        
        except Exception as e:
            print(f"Google Places restaurant search error: {e}")
            return []
    
    def _get_fallback_restaurants(
        self,
        city: str,
        cuisine_types: Optional[List[str]] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get fallback restaurants when APIs are unavailable"""
        city_lower = city.lower()
        
        # Get fallback data for the city
        if city_lower in self.FALLBACK_RESTAURANTS_BY_CITY:
            city_fallbacks = self.FALLBACK_RESTAURANTS_BY_CITY[city_lower]
        else:
            city_fallbacks = self.FALLBACK_RESTAURANTS_BY_CITY["default"]
        
        results = {}
        
        if not cuisine_types:
            cuisine_types = list(city_fallbacks.keys())
        
        for cuisine in cuisine_types:
            if cuisine in city_fallbacks:
                results[cuisine] = city_fallbacks[cuisine]
            elif cuisine in self.FALLBACK_RESTAURANTS_BY_CITY["default"]:
                results[cuisine] = self.FALLBACK_RESTAURANTS_BY_CITY["default"][cuisine]
            else:
                # Fallback to generic local restaurants
                results[cuisine] = self.FALLBACK_RESTAURANTS_BY_CITY["default"]["local"]
        
        print(f"Using fallback restaurant data for {city}")
        return results
    
    def _filter_by_cuisine(
        self,
        restaurants: List[Dict[str, Any]],
        cuisine_type: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Filter restaurants by cuisine type"""
        keywords = self.CUISINE_KEYWORDS.get(cuisine_type, [])
        filtered = []
        
        for restaurant in restaurants:
            cuisine = restaurant.get("cuisine", "").lower()
            name = restaurant.get("name", "").lower()
            rest_type = restaurant.get("type", "").lower()
            
            # Check if any keyword matches
            for keyword in keywords:
                if keyword.lower() in cuisine or keyword.lower() in name:
                    filtered.append(restaurant)
                    break
        
        return filtered[:limit]
    
    def _extract_dietary_info(self, tags: Dict[str, str]) -> List[str]:
        """Extract dietary information from tags"""
        dietary = []
        
        if tags.get("diet:vegetarian") == "yes":
            dietary.append("vegetarian")
        if tags.get("diet:vegan") == "yes":
            dietary.append("vegan")
        if tags.get("diet:kosher") == "yes":
            dietary.append("kosher")
        if tags.get("diet:halal") == "yes":
            dietary.append("halal")
        
        return dietary
    
    async def get_restaurant_reviews(
        self,
        restaurant_id: str,
        source: str = "google_places"
    ) -> List[Dict[str, Any]]:
        """Get reviews for a specific restaurant"""
        if source == "google_places" and hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return await self._get_google_reviews(restaurant_id)
        
        return []
    
    async def _get_google_reviews(self, place_id: str) -> List[Dict[str, Any]]:
        """Get reviews from Google Places API"""
        if not hasattr(settings, 'GOOGLE_PLACES_API_KEY'):
            return []
        
        try:
            url = "https://maps.googleapis.com/maps/api/place/details/json"
            params = {
                "place_id": place_id,
                "fields": "name,rating,reviews",
                "key": settings.GOOGLE_PLACES_API_KEY
            }
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
            
            data = response.json().get("result", {})
            reviews = []
            
            for review in data.get("reviews", []):
                reviews.append({
                    "author": review.get("author_name", ""),
                    "rating": review.get("rating", 0),
                    "text": review.get("text", ""),
                    "time": review.get("relative_time_description", ""),
                    "language": review.get("language", "")
                })
            
            return reviews
        
        except Exception as e:
            print(f"Error fetching restaurant reviews: {e}")
            return []
    
    async def get_daily_cuisine_recommendations(
        self,
        city: str,
        days: int,
        interests: Optional[List[str]] = None,
        user_lat: Optional[float] = None,
        user_lon: Optional[float] = None,
        day_landmarks: Optional[Dict[str, Dict[str, Any]]] = None,
        radius_km: float = 5,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get cuisine recommendations for each day of the trip with location awareness.
        Prioritizes cuisines famous in that location.
        Returns actual restaurant names and details.
        """
        # Get cuisines famous in this destination
        famous_cuisines = await self._get_cuisines_for_location(city)
        
        # Merge with user interests if provided
        preferred_cuisines = self._rank_cuisines(famous_cuisines, interests)
        
        # Get coordinates for location-based filtering
        dest_coords = await self.geo_service.geocode(city)
        
        recommendations = {}
        cuisine_index = 0
        
        for day in range(1, days + 1):
            day_key = f"day_{day}"
            landmark = (day_landmarks or {}).get(day_key, {})

            center_lat = landmark.get("latitude") if isinstance(landmark, dict) else None
            center_lon = landmark.get("longitude") if isinstance(landmark, dict) else None

            if center_lat is None or center_lon is None:
                if user_lat is not None and user_lon is not None:
                    center_lat, center_lon = user_lat, user_lon
                elif dest_coords:
                    center_lat, center_lon = dest_coords

            # Rotate through cuisines for variety
            cuisine = list(preferred_cuisines.keys())[cuisine_index % len(preferred_cuisines)]
            restaurants_by_cuisine = await self.search_restaurants(
                city,
                cuisine_types=list(preferred_cuisines.keys())[:8],
                limit=15,
                center_lat=center_lat,
                center_lon=center_lon,
            )
            restaurants = restaurants_by_cuisine.get(cuisine, [])
            
            # Filter by user location if provided
            if user_lat and user_lon:
                filtered = self._filter_by_proximity(
                    restaurants, 
                    user_lat, 
                    user_lon, 
                    radius_km=radius_km
                )
                # If strict proximity yields nothing (common with fallback data),
                # keep original list so users still get recommendations.
                if filtered:
                    restaurants = filtered
            
            # Sort by rating if available
            restaurants = sorted(
                restaurants,
                key=lambda r: float(r.get("rating", 0)),
                reverse=True
            )
            
            top_restaurants = restaurants[:5]
            
            recommendations[f"day_{day}"] = {
                "cuisine_type": cuisine,
                "popularity_score": preferred_cuisines.get(cuisine, 0.5),
                "near_landmark": landmark.get("name") if isinstance(landmark, dict) else None,
                "restaurants": [
                    {
                        "name": r.get("name"),
                        "type": r.get("type"),
                        "cuisine": r.get("cuisine", cuisine),
                        "address": r.get("address"),
                        "latitude": r.get("latitude"),
                        "longitude": r.get("longitude"),
                        "rating": r.get("rating", "Not rated"),
                        "user_ratings_total": r.get("user_ratings_total", 0),
                        "phone": r.get("phone", ""),
                        "website": r.get("website", ""),
                        "opening_hours": r.get("opening_hours", ""),
                        "distance_km": self._calculate_distance(
                            center_lat,
                            center_lon,
                            r.get("latitude"), r.get("longitude")
                        ) if center_lat is not None and center_lon is not None else None,
                        "source": r.get("source", "openstreetmap")
                    }
                    for r in top_restaurants
                ],
                "suggestion": f"Experience {cuisine.title()} cuisine - {len(restaurants)} {cuisine.title()} restaurants found"
            }
            
            cuisine_index += 1
        
        return recommendations
    
    async def _get_cuisines_for_location(self, city: str) -> Dict[str, float]:
        """
        Get the famous/popular cuisines for a given city.
        Returns a dict with cuisine names and popularity scores (0-1).
        """
        city_lower = city.lower()
        
        # Check exact match first
        if city_lower in self.FAMOUS_CUISINES_BY_LOCATION:
            return self.FAMOUS_CUISINES_BY_LOCATION[city_lower]
        
        # Check partial match (first word of city names)
        city_first_word = city_lower.split()[0]
        if city_first_word in self.FAMOUS_CUISINES_BY_LOCATION:
            return self.FAMOUS_CUISINES_BY_LOCATION[city_first_word]
        
        # If no match found, use default
        return self.FAMOUS_CUISINES_BY_LOCATION["default"]
    
    def _rank_cuisines(
        self, 
        famous_cuisines: Dict[str, float], 
        interests: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Rank cuisines by combining famous cuisines score with user interests.
        """
        ranked = dict(famous_cuisines)
        
        # Boost cuisines matching user interests
        if interests:
            interests_lower = [i.lower() for i in interests]
            for cuisine in list(ranked.keys()):
                for interest in interests_lower:
                    if interest in cuisine or cuisine in interest:
                        # Boost the score but keep it at max 1.0
                        ranked[cuisine] = min(1.0, ranked[cuisine] + 0.2)
        
        # Sort by score (highest first)
        return dict(sorted(ranked.items(), key=lambda x: x[1], reverse=True))
    
    def _filter_by_proximity(
        self,
        restaurants: List[Dict[str, Any]],
        user_lat: float,
        user_lon: float,
        radius_km: float = 5
    ) -> List[Dict[str, Any]]:
        """Filter restaurants within a certain radius of user location"""
        nearby = []
        unknown_coords = []
        
        for restaurant in restaurants:
            lat = restaurant.get("latitude")
            lon = restaurant.get("longitude")

            if lat is None or lon is None:
                unknown_coords.append(restaurant)
                continue

            distance = self._calculate_distance(
                user_lat,
                user_lon,
                lat,
                lon
            )
            
            if distance and distance <= radius_km:
                nearby.append(restaurant)

        if nearby:
            return nearby
        # Preserve recommendations even without location-coordinates in source data.
        if unknown_coords:
            return unknown_coords[:5]
        return nearby
    
    def _calculate_distance(
        self,
        lat1: Optional[float],
        lon1: Optional[float],
        lat2: Optional[float],
        lon2: Optional[float]
    ) -> Optional[float]:
        """Calculate distance in km using Haversine formula"""
        if not all([lat1, lon1, lat2, lon2]):
            return None
        
        try:
            R = 6371  # Earth's radius in km
            
            lat1_rad = math.radians(lat1)
            lat2_rad = math.radians(lat2)
            delta_lat = math.radians(lat2 - lat1)
            delta_lon = math.radians(lon2 - lon1)
            
            a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
            c = 2 * math.asin(math.sqrt(a))
            
            return round(R * c, 2)
        except Exception:
            return None
