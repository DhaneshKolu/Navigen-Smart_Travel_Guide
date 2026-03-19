import httpx
from datetime import date, timedelta
from collections import defaultdict


GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


WEATHER_CODE_MAP = {
    0: "clear sky",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "depositing rime fog",
    51: "light drizzle",
    53: "moderate drizzle",
    55: "dense drizzle",
    61: "slight rain",
    63: "moderate rain",
    65: "heavy rain",
    71: "slight snow",
    73: "moderate snow",
    75: "heavy snow",
    80: "rain showers",
    81: "heavy rain showers",
    82: "violent rain showers",
    95: "thunderstorm",
}


async def get_forecast(city: str, trip_start_date: date | None = None, days: int = 3):
    """Get date-aligned daily forecast for a city using Open-Meteo.

    Returns a payload that summarize_forecast can consume.
    """
    target_start = trip_start_date or date.today()
    target_end = target_start + timedelta(days=max(days - 1, 0))

    async with httpx.AsyncClient(timeout=15.0) as client:
        geo_response = await client.get(
            GEOCODING_URL,
            params={"name": city, "count": 1, "language": "en", "format": "json"},
        )
        if geo_response.status_code != 200:
            return None

        geo_data = geo_response.json()
        results = geo_data.get("results") or []
        if not results:
            return None

        lat = results[0].get("latitude")
        lon = results[0].get("longitude")
        if lat is None or lon is None:
            return None

        forecast_response = await client.get(
            FORECAST_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "weathercode,temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
                "start_date": target_start.isoformat(),
                "end_date": target_end.isoformat(),
            },
        )
        if forecast_response.status_code != 200:
            return None

    return forecast_response.json()


def summarize_forecast(forecast_data, days: int):
    # Open-Meteo daily response path
    if isinstance(forecast_data, dict) and "daily" in forecast_data:
        daily = forecast_data.get("daily", {})
        dates = daily.get("time", [])
        weather_codes = daily.get("weathercode", [])
        max_t = daily.get("temperature_2m_max", [])
        min_t = daily.get("temperature_2m_min", [])

        result = {}
        for i in range(min(days, len(dates))):
            avg_temp = None
            if i < len(max_t) and i < len(min_t):
                avg_temp = round(((max_t[i] or 0) + (min_t[i] or 0)) / 2, 1)

            code = weather_codes[i] if i < len(weather_codes) else None
            result[f"day_{i + 1}"] = {
                "date": dates[i],
                "description": WEATHER_CODE_MAP.get(code, "moderate weather"),
                "avg_temperature": avg_temp,
            }
        return result

    # Backward-compatible OpenWeather list path
    daily_weather = defaultdict(list)

    for entry in forecast_data.get("list", []):
        entry_date = entry["dt_txt"].split(" ")[0]
        description = entry["weather"][0]["description"]
        temp = entry["main"]["temp"]

        daily_weather[entry_date].append({
            "description": description,
            "temperature": temp
        })

    result = {}
    sorted_dates = sorted(daily_weather.keys())[:days]

    for i, entry_date in enumerate(sorted_dates):
        entries = daily_weather[entry_date]
        descriptions = [e["description"] for e in entries]
        dominant = max(set(descriptions), key=descriptions.count)
        avg_temp = sum(e["temperature"] for e in entries) / len(entries)

        result[f"day_{i+1}"] = {
            "date": entry_date,
            "description": dominant,
            "avg_temperature": round(avg_temp, 1)
        }

    return result


