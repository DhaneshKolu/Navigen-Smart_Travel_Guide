import httpx
from app.core.settings import settings

ORS_API_KEY = settings.ORS_API_KEY

route_cache = {}

class RoutingService:

    BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car"

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)

    async def get_route(self, start_lat, start_lon, end_lat, end_lon):

        key = f"{start_lat},{start_lon}-{end_lat},{end_lon}"

        if key in route_cache:
            return route_cache[key]

        headers = {
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json"
        }

        body = {
            "coordinates": [
                [start_lon, start_lat],
                [end_lon, end_lat]
            ]
        }

        try:
            response = await self.client.post(
                self.BASE_URL,
                headers=headers,
                json=body
            )

        except (httpx.ConnectTimeout, httpx.ReadTimeout):
            print("Routing API timeout")
            return None

        data = response.json()

        if "routes" not in data:
            print("ORS error:", data)
            return None

        summary = data["routes"][0]["summary"]
        route_obj = data["routes"][0]

        steps = []
        for seg in route_obj.get("segments", []):
            for step in seg.get("steps", []):
                steps.append({
                    "instruction": step.get("instruction", "Continue"),
                    "distance_km": round((step.get("distance", 0) or 0) / 1000, 2),
                    "duration_min": round((step.get("duration", 0) or 0) / 60, 2),
                    "name": step.get("name", ""),
                    "type": step.get("type"),
                })

        result = {
            "distance_km": summary["distance"] / 1000,
            "duration_min": summary["duration"] / 60,
            "geometry": route_obj["geometry"],
            "steps": steps,
        }

        route_cache[key] = result

        return result