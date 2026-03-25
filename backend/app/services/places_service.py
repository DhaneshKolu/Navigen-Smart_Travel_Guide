import logging
import asyncio
from typing import Any
from typing import Iterable, List, Optional, Union

import httpx

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models.place import Place
from app.core.settings import settings
from app.services.geo_service import GeoService
from app.services.geoapify_service import GeoapifyService


logger = logging.getLogger(__name__)

GOOGLE_PLACES_KEY = settings.GOOGLE_PLACES_API_KEY or ""
PLACES_TEXT_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"
PLACES_NEW_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"

FOOD_BUDGET_KEYWORDS = {
    "Budget": ["street food stalls", "dhaba thali", "udupi restaurant", "cheap local restaurant", "government canteen"],
    "Relaxed": ["local restaurant", "affordable cafe", "food court", "family restaurant"],
    "Luxury": ["mid range restaurant", "rooftop cafe", "multi cuisine restaurant"],
    "Ultra": ["fine dining restaurant", "luxury restaurant", "5 star restaurant"],
}

PRICE_LEVEL_MAP = {
    "Budget": [0, 1],
    "Relaxed": [1, 2],
    "Luxury": [2, 3],
    "Ultra": [3, 4],
}

HOTEL_BUDGET_KEYWORDS = {
    "Budget": ["hostel dormitory", "oyo budget", "guest house cheap", "lodge cheap"],
    "Relaxed": ["budget hotel", "guesthouse", "2 star hotel affordable"],
    "Luxury": ["3 star hotel", "boutique hotel", "business hotel"],
    "Ultra": ["5 star hotel luxury", "luxury resort", "heritage hotel"],
}

HOTEL_PRICE_LEVELS = {
    "Budget": [0, 1],
    "Relaxed": [1, 2],
    "Luxury": [2, 3],
    "Ultra": [3, 4],
}

class PlacesService:

    def __init__(self, db: Session):
        self.db = db
        self.geo_service = GeoService()
        self.geoapify_service = GeoapifyService()

    async def get_or_fetch_places(
        self,
        city: str,
        categories: Optional[Union[str, Iterable[str]]] = None,
        limit: int = 80,
        refresh: bool = True,
    ):
        normalized_categories = self._normalize_categories(categories)
        cached_places = self._get_cached_places(city, normalized_categories)

        if cached_places and not refresh:
            return cached_places

        try:
            coords = await self.geo_service.geocode(city)
            if not coords:
                return cached_places

            lat, lon = coords
            api_categories = self._to_geoapify_categories(normalized_categories)
            features = await self.geoapify_service.search_places(
                lat=lat,
                lon=lon,
                categories=api_categories,
                limit=limit,
            )

            if not features:
                return cached_places

            self._upsert_places_from_geoapify(city, features)
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            logger.exception("Database error while upserting places for %s", city)
            return cached_places
        except Exception:
            logger.exception("Geoapify places fetch failed for %s", city)
            return cached_places

        return self._get_cached_places(city, normalized_categories)

    def _get_cached_places(self, city: str, categories: List[str]):
        query = self.db.query(Place).filter(Place.city == city)
        if categories:
            query = query.filter(Place.category.in_(categories))
        return query.all()

    def _normalize_categories(self, categories: Optional[Union[str, Iterable[str]]]) -> List[str]:
        if categories is None:
            return []
        if isinstance(categories, str):
            return [categories]
        return [c for c in categories if c]

    def _to_geoapify_categories(self, categories: List[str]) -> List[str]:
        if not categories:
            return [
                "tourism.sights",
                "catering.restaurant",
                "catering.cafe",
                "catering.fast_food",
                "accommodation.hotel",
                "accommodation.hostel",
                "accommodation.guest_house",
            ]

        mapped = []
        for category in categories:
            raw = category.lower().strip()
            if raw in {"restaurant", "cafe", "fast_food", "bar", "pub"}:
                mapped.append(f"catering.{raw}")
            elif raw in {"hotel", "hostel", "guest_house", "motel", "apartment"}:
                mapped.append(f"accommodation.{raw}")
            else:
                mapped.append(raw)
        return mapped

    def _upsert_places_from_geoapify(self, city: str, features: list[dict]):
        external_ids = []
        payloads = []

        for feature in features:
            place_payload = self._parse_geoapify_feature(city, feature)
            if not place_payload:
                continue

            external_id = place_payload["external_id"]
            external_ids.append(external_id)
            payloads.append(place_payload)

        if not payloads:
            return

        existing_by_external_id = {
            place.external_id: place
            for place in self.db.query(Place)
            .filter(Place.external_id.in_(external_ids))
            .all()
        }

        for payload in payloads:
            existing = existing_by_external_id.get(payload["external_id"])
            if existing:
                existing.name = payload["name"]
                existing.category = payload["category"]
                existing.latitude = payload["latitude"]
                existing.longitude = payload["longitude"]
                existing.address = payload["address"]
                existing.source = payload["source"]
                continue

            self.db.add(Place(**payload))

    def _parse_geoapify_feature(self, city: str, feature: dict):
        properties = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates", [])
        categories = properties.get("categories") or []

        place_id = properties.get("place_id")
        name = properties.get("name") or properties.get("formatted")

        if not place_id or not name or len(coords) != 2:
            return None

        lon, lat = coords
        return {
            "name": name,
            "city": city,
            "category": self._classify_category(categories),
            "latitude": float(lat),
            "longitude": float(lon),
            "address": properties.get("formatted"),
            "external_id": f"geoapify_{place_id}",
            "source": "geoapify",
        }

    def _classify_category(self, categories: list[str]) -> str:
        if not categories:
            return "other"

        lowered = [c.lower() for c in categories]
        for category in lowered:
            if "catering.restaurant" in category:
                return "restaurant"
            if "catering.cafe" in category:
                return "cafe"
            if "accommodation.hotel" in category:
                return "hotel"
            if "accommodation.hostel" in category:
                return "hostel"
            if "accommodation.guest_house" in category:
                return "guest_house"

        primary = lowered[0].split(".")
        return primary[-1] if primary else "other"


def _meal_emoji(meal_type: str) -> str:
    return {
        "Breakfast": "🍳",
        "Lunch": "🍱",
        "Dinner": "🍽️",
        "Snack": "🥪",
        "Drinks": "🥤",
        "Local Special": "🌟",
    }.get(meal_type, "🍜")


def _guess_amenities(place: dict[str, Any]) -> list[str]:
    amenities = ["WiFi"]
    types = place.get("types", [])
    name = str(place.get("name", "")).lower()
    if "lodging" in types:
        amenities.append("AC")
    if any(w in name for w in ["pool", "resort", "luxury"]):
        amenities.append("Pool")
    if any(w in name for w in ["breakfast", "inn", "b&b", "guest"]):
        amenities.append("Breakfast")
    if any(w in name for w in ["spa", "wellness"]):
        amenities.append("Spa")
    return amenities[:4]


def _map_new_price_level(value: Any) -> int:
    if isinstance(value, int):
        return value
    mapping = {
        "PRICE_LEVEL_FREE": 0,
        "PRICE_LEVEL_INEXPENSIVE": 1,
        "PRICE_LEVEL_MODERATE": 2,
        "PRICE_LEVEL_EXPENSIVE": 3,
        "PRICE_LEVEL_VERY_EXPENSIVE": 4,
    }
    return mapping.get(str(value or ""), 1)


def _new_photo_url(photo_name: str | None) -> str | None:
    if not photo_name:
        return None
    return f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=400&key={GOOGLE_PLACES_KEY}"


def _normalize_new_place(place: dict[str, Any]) -> dict[str, Any]:
    display_name = place.get("displayName") or {}
    location = place.get("location") or {}
    photo_name = None
    photos = place.get("photos") or []
    if photos:
        photo_name = photos[0].get("name")

    return {
        "place_id": place.get("id"),
        "name": display_name.get("text") or "",
        "formatted_address": place.get("formattedAddress") or "",
        "geometry": {"location": {"lat": location.get("latitude"), "lng": location.get("longitude")}},
        "rating": place.get("rating"),
        "user_ratings_total": place.get("userRatingCount", 0),
        "price_level": _map_new_price_level(place.get("priceLevel")),
        "opening_hours": {"open_now": (place.get("currentOpeningHours") or {}).get("openNow")},
        "types": place.get("types") or [],
        "photo_url": _new_photo_url(photo_name),
    }


async def _google_places_text_search(
    client: httpx.AsyncClient,
    query: str,
    included_type: str,
    lat: float | None,
    lng: float | None,
    radius_m: int,
) -> list[dict[str, Any]]:
    if not GOOGLE_PLACES_KEY:
        return []

    headers = {
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.photos.name,places.types,places.currentOpeningHours.openNow",
    }
    body: dict[str, Any] = {
        "textQuery": query,
        "maxResultCount": 10,
        "languageCode": "en",
        "includedType": included_type,
    }
    if lat is not None and lng is not None:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(radius_m),
            }
        }

    try:
        res = await client.post(PLACES_NEW_TEXT_URL, headers=headers, json=body)
        data = res.json()
        if res.status_code == 200 and data.get("places"):
            return [_normalize_new_place(p) for p in data.get("places", [])]
    except Exception:
        logger.exception("Places API (New) search failed")

    return []


async def _search_places(
    client: httpx.AsyncClient,
    query: str,
    meal_type: str,
    price_levels: list[int],
    destination: str,
    lat: float | None,
    lng: float | None,
) -> list[dict[str, Any]]:
    if not GOOGLE_PLACES_KEY:
        return []

    new_places = await _google_places_text_search(client, query, "restaurant", lat, lng, 5000)
    if new_places:
        restaurants = []
        for place in new_places[:4]:
            price = int(place.get("price_level", 1) or 1)
            if price_levels and price > max(price_levels):
                continue
            place_id = place.get("place_id")
            if not place_id:
                continue
            maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            cost_inr = {0: 50, 1: 150, 2: 400, 3: 800, 4: 1500}.get(price, 150)
            cost_usd = {0: 0.5, 1: 2, 2: 5, 3: 10, 4: 18}.get(price, 2)
            restaurants.append(
                {
                    "name": place.get("name", "Restaurant"),
                    "place_id": place_id,
                    "restaurant": place.get("name", "Restaurant"),
                    "address": place.get("formatted_address", ""),
                    "meal_type": meal_type,
                    "rating": place.get("rating", 4.0),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "price_level": price,
                    "cost_usd": cost_usd,
                    "cost_inr": cost_inr,
                    "lat": place.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": place.get("geometry", {}).get("location", {}).get("lng"),
                    "photo_url": place.get("photo_url"),
                    "maps_url": maps_url,
                    "google_search_url": f"https://www.google.com/search?q={str(place.get('name', 'restaurant')).replace(' ', '+')}+{destination.replace(' ', '+')}+restaurant",
                    "is_open_now": place.get("opening_hours", {}).get("open_now"),
                    "verified": True,
                    "emoji": _meal_emoji(meal_type),
                    "distance_from_last_stop": "Nearby",
                }
            )
        if restaurants:
            return restaurants

    params = {"query": query, "type": "restaurant", "key": GOOGLE_PLACES_KEY}
    if lat is not None and lng is not None:
        params["location"] = f"{lat},{lng}"
        params["radius"] = 5000

    try:
        res = await client.get(PLACES_TEXT_URL, params=params)
        data = res.json()
        if data.get("status") != "OK":
            return []

        restaurants = []
        for place in data.get("results", [])[:4]:
            price = int(place.get("price_level", 1) or 1)
            if price_levels and price > max(price_levels):
                continue

            photo_url = None
            if place.get("photos"):
                photo_ref = place["photos"][0].get("photo_reference")
                if photo_ref:
                    photo_url = f"{PLACES_PHOTO_URL}?maxwidth=400&photo_reference={photo_ref}&key={GOOGLE_PLACES_KEY}"

            place_id = place.get("place_id")
            if not place_id:
                continue

            maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            cost_inr = {0: 50, 1: 150, 2: 400, 3: 800, 4: 1500}.get(price, 150)
            cost_usd = {0: 0.5, 1: 2, 2: 5, 3: 10, 4: 18}.get(price, 2)

            restaurants.append(
                {
                    "name": place.get("name", "Restaurant"),
                    "place_id": place_id,
                    "restaurant": place.get("name", "Restaurant"),
                    "address": place.get("formatted_address", ""),
                    "meal_type": meal_type,
                    "rating": place.get("rating", 4.0),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "price_level": price,
                    "cost_usd": cost_usd,
                    "cost_inr": cost_inr,
                    "lat": place.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": place.get("geometry", {}).get("location", {}).get("lng"),
                    "photo_url": photo_url,
                    "maps_url": maps_url,
                    "google_search_url": f"https://www.google.com/search?q={str(place.get('name', 'restaurant')).replace(' ', '+')}+{destination.replace(' ', '+')}+restaurant",
                    "is_open_now": place.get("opening_hours", {}).get("open_now"),
                    "verified": True,
                    "emoji": _meal_emoji(meal_type),
                    "distance_from_last_stop": "Nearby",
                }
            )
        return restaurants
    except Exception:
        logger.exception("Places API restaurant search failed")
        return []


async def fetch_real_restaurants(
    destination: str,
    budget_level: str,
    vibes: list[str],
    lat: float | None = None,
    lng: float | None = None,
) -> list[dict[str, Any]]:
    if not GOOGLE_PLACES_KEY:
        return []
    async with httpx.AsyncClient(timeout=10.0) as client:
        all_restaurants: list[dict[str, Any]] = []
        price_levels = PRICE_LEVEL_MAP.get(budget_level, [0, 1])
        keywords = FOOD_BUDGET_KEYWORDS.get(budget_level, ["restaurant"])

        meal_searches = [
            ("Breakfast", f"breakfast {keywords[0]} in {destination}"),
            ("Lunch", f"lunch {keywords[0]} in {destination}"),
            ("Dinner", f"dinner {keywords[-1]} in {destination}"),
            ("Snack", f"street food snacks in {destination}"),
        ]
        if "Food" in (vibes or []):
            meal_searches.append(("Local Special", f"famous local food specialty in {destination}"))

        tasks = [
            _search_places(client, query, meal_type, price_levels, destination, lat, lng)
            for meal_type, query in meal_searches
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_restaurants.extend(result)

        seen = set()
        unique = []
        for r in all_restaurants:
            place_id = r.get("place_id")
            if not place_id or place_id in seen:
                continue
            seen.add(place_id)
            unique.append(r)

        unique.sort(key=lambda x: (-(x.get("rating") or 0), -(x.get("user_ratings_total") or 0)))
        return unique[:12]


async def _search_hotels(
    client: httpx.AsyncClient,
    query: str,
    price_levels: list[int],
    budget_level: str,
    lat: float | None,
    lng: float | None,
) -> list[dict[str, Any]]:
    if not GOOGLE_PLACES_KEY:
        return []

    new_places = await _google_places_text_search(client, query, "lodging", lat, lng, 3000)
    if new_places:
        cap_usd = {"Budget": 6, "Relaxed": 18, "Luxury": 35, "Ultra": 9999}
        hotels = []
        for place in new_places[:4]:
            price = int(place.get("price_level", 1) or 1)
            if price_levels and price > max(price_levels):
                continue
            place_id = place.get("place_id")
            if not place_id:
                continue

            maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            price_usd = {0: 3, 1: 6, 2: 20, 3: 40, 4: 120}.get(price, 6)
            price_inr = {0: 250, 1: 500, 2: 1500, 3: 3000, 4: 10000}.get(price, 500)
            over = price_usd > cap_usd.get(budget_level, 6)

            hotels.append(
                {
                    "name": place.get("name", "Hotel"),
                    "place_id": place_id,
                    "address": place.get("formatted_address", ""),
                    "stars": min(4, max(1, price + 1)),
                    "price_usd": price_usd,
                    "price_inr": price_inr,
                    "rating": place.get("rating", 3.5),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "price_level": price,
                    "amenities": _guess_amenities({"types": place.get("types", []), "name": place.get("name", "")}),
                    "photo_url": place.get("photo_url"),
                    "maps_url": maps_url,
                    "booking_url": maps_url,
                    "lat": place.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": place.get("geometry", {}).get("location", {}).get("lng"),
                    "recommended": (not over) and ((place.get("rating") or 0) >= 3.8),
                    "overBudget": over,
                    "verified": True,
                }
            )
        if hotels:
            return hotels

    params = {"query": query, "type": "lodging", "key": GOOGLE_PLACES_KEY}
    if lat is not None and lng is not None:
        params["location"] = f"{lat},{lng}"
        params["radius"] = 3000

    try:
        res = await client.get(PLACES_TEXT_URL, params=params)
        data = res.json()
        if data.get("status") != "OK":
            return []

        cap_usd = {"Budget": 6, "Relaxed": 18, "Luxury": 35, "Ultra": 9999}
        hotels = []
        for place in data.get("results", [])[:4]:
            price = int(place.get("price_level", 1) or 1)
            if price_levels and price > max(price_levels):
                continue

            place_id = place.get("place_id")
            if not place_id:
                continue

            maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            photo_url = None
            if place.get("photos"):
                ref = place["photos"][0].get("photo_reference")
                if ref:
                    photo_url = f"{PLACES_PHOTO_URL}?maxwidth=400&photo_reference={ref}&key={GOOGLE_PLACES_KEY}"

            price_usd = {0: 3, 1: 6, 2: 20, 3: 40, 4: 120}.get(price, 6)
            price_inr = {0: 250, 1: 500, 2: 1500, 3: 3000, 4: 10000}.get(price, 500)
            over = price_usd > cap_usd.get(budget_level, 6)

            hotels.append(
                {
                    "name": place.get("name", "Hotel"),
                    "place_id": place_id,
                    "address": place.get("formatted_address", ""),
                    "stars": min(4, max(1, price + 1)),
                    "price_usd": price_usd,
                    "price_inr": price_inr,
                    "rating": place.get("rating", 3.5),
                    "user_ratings_total": place.get("user_ratings_total", 0),
                    "price_level": price,
                    "amenities": _guess_amenities(place),
                    "photo_url": photo_url,
                    "maps_url": maps_url,
                    "booking_url": maps_url,
                    "lat": place.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": place.get("geometry", {}).get("location", {}).get("lng"),
                    "recommended": (not over) and (place.get("rating", 0) >= 3.8),
                    "overBudget": over,
                    "verified": True,
                }
            )
        return hotels
    except Exception:
        logger.exception("Places API hotel search failed")
        return []


async def fetch_real_hotels(
    destination: str,
    budget_level: str,
    lat: float | None = None,
    lng: float | None = None,
) -> list[dict[str, Any]]:
    if not GOOGLE_PLACES_KEY:
        return []
    async with httpx.AsyncClient(timeout=10.0) as client:
        price_levels = HOTEL_PRICE_LEVELS.get(budget_level, [0, 1])
        keywords = HOTEL_BUDGET_KEYWORDS.get(budget_level, ["hotel"])

        tasks = [
            _search_hotels(client, f"{kw} in {destination}", price_levels, budget_level, lat, lng)
            for kw in keywords[:2]
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_hotels: list[dict[str, Any]] = []
        for result in results:
            if isinstance(result, list):
                all_hotels.extend(result)

        seen = set()
        unique = []
        for h in all_hotels:
            place_id = h.get("place_id")
            if not place_id or place_id in seen:
                continue
            seen.add(place_id)
            unique.append(h)

        unique.sort(key=lambda x: (x.get("overBudget", False), -(x.get("rating") or 0)))
        return unique[:4]


async def fetch_real_restaurants_with_fallback(
    destination: str,
    budget_level: str,
    vibes: list[str],
    lat: float | None,
    lng: float | None,
) -> list[dict[str, Any]]:
    try:
        results = await fetch_real_restaurants(destination, budget_level, vibes, lat, lng)
        if results:
            return results
    except Exception:
        logger.exception("Real restaurant fetch failed")

    query_dest = destination.replace(" ", "+")
    return [
        {
            "name": f"Local restaurants in {destination}",
            "restaurant": "Search on Google",
            "meal_type": "All meals",
            "cost_usd": 2,
            "cost_inr": 150,
            "rating": None,
            "verified": False,
            "emoji": "🍜",
            "maps_url": f"https://www.google.com/maps/search/restaurants+in+{query_dest}",
            "google_search_url": f"https://www.google.com/search?q=best+budget+restaurants+in+{query_dest}",
            "photo_url": None,
            "is_fallback": True,
            "user_ratings_total": 0,
        }
    ]


async def fetch_real_hotels_with_fallback(
    destination: str,
    budget_level: str,
    lat: float | None,
    lng: float | None,
) -> list[dict[str, Any]]:
    try:
        results = await fetch_real_hotels(destination, budget_level, lat, lng)
        if results:
            return results
    except Exception:
        logger.exception("Real hotel fetch failed")

    query_dest = destination.replace(" ", "+")
    return [
        {
            "name": f"Hotels in {destination}",
            "address": destination,
            "stars": 2,
            "price_usd": 6,
            "price_inr": 500,
            "rating": None,
            "user_ratings_total": 0,
            "amenities": ["WiFi"],
            "photo_url": None,
            "maps_url": f"https://www.google.com/maps/search/hotels+in+{query_dest}",
            "booking_url": f"https://www.google.com/travel/hotels/search?q=hotels+in+{query_dest}&currency=INR",
            "verified": False,
            "is_fallback": True,
            "recommended": True,
            "overBudget": False,
        }
    ]