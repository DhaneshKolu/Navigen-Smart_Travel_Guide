import httpx
from app.services.geoapify_service import GeoapifyService
import logging


logger = logging.getLogger(__name__)

class GeoService:
    NOMINATIM_URL = "https://nominatim.openstreetmap.org"
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    async def geocode(self, city: str):
        geoapify = GeoapifyService()
        try:
            geoapify_coords = await geoapify.geocode(city)
            if geoapify_coords:
                return geoapify_coords
        except Exception as e:
            logger.warning("Geoapify geocode failed for %s: %s", city, e)

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self.NOMINATIM_URL}/search",
                    params={"q": city, "format": "json", "limit": 1},
                    headers={"User-Agent": "smart-travel-guide"}
                )
                response.raise_for_status()
        except httpx.TimeoutException:
            logger.warning("Nominatim geocode timeout for %s", city)
            return None
        except httpx.RequestError as e:
            logger.warning("Nominatim geocode request error for %s: %s", city, e)
            return None

        data = response.json()
        if not data:
            return None

        return float(data[0]["lat"]), float(data[0]["lon"])

    async def search_nearby(self, lat: float, lon: float, radius_m: int = 5000):
        query = f"""
        [out:json];
        (
        node["tourism"](around:{radius_m},{lat},{lon});
        node["historic"](around:{radius_m},{lat},{lon});
        node["leisure"="park"](around:{radius_m},{lat},{lon});
        node["amenity"="restaurant"](around:{radius_m},{lat},{lon});
        node["amenity"="cafe"](around:{radius_m},{lat},{lon});
        );
        out;
        """

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.OVERPASS_URL,
                    data={"data": query}
                )
                response.raise_for_status()
        except httpx.TimeoutException:
            logger.warning("Overpass search timeout for lat=%s lon=%s", lat, lon)
            return []
        except httpx.RequestError as e:
            logger.warning("Overpass request error for lat=%s lon=%s: %s", lat, lon, e)
            return []

        return response.json().get("elements", [])