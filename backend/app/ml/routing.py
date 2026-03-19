from typing import Any, List, Optional

from app.ml.features import haversine_km


def _coords(place: Any) -> tuple[Optional[float], Optional[float]]:
	if hasattr(place, "latitude") and hasattr(place, "longitude"):
		return getattr(place, "latitude"), getattr(place, "longitude")
	if isinstance(place, dict):
		return place.get("latitude"), place.get("longitude")
	return None, None


def order_places_by_distance(
	places: List[Any], user_lat: Optional[float], user_lon: Optional[float]
) -> List[Any]:
	if not places:
		return []

	remaining = places[:]
	ordered = []

	current_lat, current_lon = user_lat, user_lon

	if current_lat is None or current_lon is None:
		return remaining

	while remaining:
		next_idx = 0
		next_distance = float("inf")

		for idx, place in enumerate(remaining):
			p_lat, p_lon = _coords(place)
			dist = haversine_km(current_lat, current_lon, p_lat, p_lon)
			if dist < next_distance:
				next_distance = dist
				next_idx = idx

		nxt = remaining.pop(next_idx)
		ordered.append(nxt)

		n_lat, n_lon = _coords(nxt)
		if n_lat is not None and n_lon is not None:
			current_lat, current_lon = n_lat, n_lon

	return ordered


def split_ordered_places_by_day(places: List[Any], days: int) -> List[List[Any]]:
	if days <= 0:
		return []
	if not places:
		return [[] for _ in range(days)]

	buckets = [[] for _ in range(days)]
	for idx, place in enumerate(places):
		buckets[idx % days].append(place)
	return buckets
