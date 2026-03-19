import logging
from typing import Iterable, List, Optional, Union

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models.place import Place
from app.services.geo_service import GeoService
from app.services.geoapify_service import GeoapifyService


logger = logging.getLogger(__name__)

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