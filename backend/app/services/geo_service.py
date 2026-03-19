import httpx
from app.services.geoapify_service import GeoapifyService

class GeoService:
    NOMINATIM_URL = "https://nominatim.openstreetmap.org"
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    async def geocode(self, city: str):
        geoapify = GeoapifyService()
        geoapify_coords = await geoapify.geocode(city)
        if geoapify_coords:
            return geoapify_coords

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{self.NOMINATIM_URL}/search",
                params={"q": city, "format": "json", "limit": 1},
                headers={"User-Agent": "smart-travel-guide"}
            )
            response.raise_for_status()

        data = response.json()
        if not data:
            return None

        return float(data[0]["lat"]), float(data[0]["lon"])

    async def search_nearby(self, lat: float, lon: float):
        query = f"""
        [out:json];
        (
        node["tourism"](around:5000,{lat},{lon});
        node["historic"](around:5000,{lat},{lon});
        node["leisure"="park"](around:5000,{lat},{lon});
        node["amenity"="restaurant"](around:5000,{lat},{lon});
        node["amenity"="cafe"](around:5000,{lat},{lon});
        );
        out;
        """

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.OVERPASS_URL,
                data={"data": query}
            )
            response.raise_for_status()

        return response.json().get("elements", [])