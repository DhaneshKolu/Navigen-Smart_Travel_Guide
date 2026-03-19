import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.core.settings import settings


logger = logging.getLogger(__name__)


RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class GeoapifyService:
    GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
    PLACES_URL = "https://api.geoapify.com/v2/places"

    def __init__(self):
        self.api_key = settings.GEOAPIFY_API_KEY
        self.timeout = settings.GEOAPIFY_TIMEOUT_SECONDS

    async def geocode(self, query: str) -> Optional[Tuple[float, float]]:
        if not self.api_key:
            logger.warning("Geoapify API key is not configured; geocoding with Geoapify is disabled")
            return None

        payload = await self._request_with_retry(
            "GET",
            self.GEOCODE_URL,
            params={"text": query, "limit": 1, "apiKey": self.api_key},
        )

        features = payload.get("features", [])
        if not features:
            return None

        coords = ((features[0].get("geometry") or {}).get("coordinates") or [])
        if len(coords) != 2:
            return None

        lon, lat = coords
        return float(lat), float(lon)

    async def search_places(
        self,
        *,
        lat: float,
        lon: float,
        categories: List[str],
        radius_meters: Optional[int] = None,
        limit: int = 25,
    ) -> List[Dict[str, Any]]:
        if not self.api_key:
            logger.warning("Geoapify API key is not configured; places search with Geoapify is disabled")
            return []

        radius = radius_meters or settings.GEOAPIFY_DEFAULT_RADIUS_METERS
        params = {
            "categories": ",".join(categories),
            "filter": f"circle:{lon},{lat},{radius}",
            "bias": f"proximity:{lon},{lat}",
            "limit": max(1, min(limit, 200)),
            "apiKey": self.api_key,
        }

        payload = await self._request_with_retry("GET", self.PLACES_URL, params=params)
        return payload.get("features", [])

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        max_attempts: int = 3,
    ) -> Dict[str, Any]:
        last_error: Optional[Exception] = None

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(1, max_attempts + 1):
                try:
                    response = await client.request(method, url, params=params)

                    if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts:
                        await asyncio.sleep(0.5 * attempt)
                        continue

                    response.raise_for_status()
                    return response.json()
                except (httpx.RequestError, httpx.HTTPStatusError) as exc:
                    last_error = exc
                    if attempt >= max_attempts:
                        break
                    await asyncio.sleep(0.5 * attempt)

        raise RuntimeError(f"Geoapify request failed after retries: {last_error}")
