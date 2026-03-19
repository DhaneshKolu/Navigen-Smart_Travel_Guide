import math
from typing import Any, Dict, Optional


def _get_attr(place: Any, field: str, default: Any = None) -> Any:
	if hasattr(place, field):
		return getattr(place, field)
	if isinstance(place, dict):
		return place.get(field, default)
	return default


def haversine_km(
	lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]
) -> float:
	if None in (lat1, lon1, lat2, lon2):
		return 0.0

	r = 6371.0
	phi1 = math.radians(lat1)
	phi2 = math.radians(lat2)
	d_phi = math.radians(lat2 - lat1)
	d_lambda = math.radians(lon2 - lon1)

	a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
	return r * c


def category_weight(category: Optional[str]) -> float:
	cat = (category or "other").lower()
	weights = {
		"attraction": 1.0,
		"museum": 1.0,
		"monument": 0.9,
		"historic": 0.9,
		"viewpoint": 0.8,
		"zoo": 0.8,
		"garden": 0.7,
		"park": 0.6,
		"restaurant": 0.5,
		"cafe": 0.4,
		"other": 0.3,
	}
	return weights.get(cat, 0.3)


def weather_bias(weather_description: Optional[str], temperature: Optional[float], category: Optional[str]) -> float:
	desc = (weather_description or "").lower()
	cat = (category or "other").lower()

	bad_weather = any(token in desc for token in ["rain", "storm", "snow", "thunder"])
	hot_weather = temperature is not None and temperature >= 36

	indoor_categories = {"museum", "cafe", "library", "theatre", "mall"}
	outdoor_categories = {"park", "beach", "viewpoint", "garden", "zoo", "monument", "historic"}

	if bad_weather or hot_weather:
		if cat in indoor_categories:
			return 0.2
		if cat in outdoor_categories:
			return -0.2
	return 0.0


def build_place_features(
	place: Any,
	user_lat: Optional[float],
	user_lon: Optional[float],
	weather_description: Optional[str],
	temperature: Optional[float],
) -> Dict[str, float]:
	place_lat = _get_attr(place, "latitude")
	place_lon = _get_attr(place, "longitude")
	category = _get_attr(place, "category", "other")
	rating = _get_attr(place, "rating", None)

	distance_km = haversine_km(user_lat, user_lon, place_lat, place_lon)
	distance_score = 1 / (1 + distance_km)
	cat_score = category_weight(category)
	rating_score = 0.5
	if isinstance(rating, (int, float)):
		rating_score = max(0.0, min(float(rating) / 5.0, 1.0))
	wx_bias = weather_bias(weather_description, temperature, category)

	score = (cat_score * 0.35) + (distance_score * 0.30) + (rating_score * 0.35) + wx_bias

	return {
		"distance_km": distance_km,
		"category_score": cat_score,
		"rating_score": rating_score,
		"distance_score": distance_score,
		"weather_bias": wx_bias,
		"score": score,
	}
