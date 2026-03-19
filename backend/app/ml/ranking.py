from typing import Any, List, Optional

from app.ml.features import build_place_features


def rank_places_for_day(
	places: List[Any],
	user_lat: Optional[float],
	user_lon: Optional[float],
	weather_description: Optional[str],
	temperature: Optional[float],
	limit: Optional[int] = None,
) -> List[Any]:
	if not places:
		return []

	scored = []
	for p in places:
		features = build_place_features(p, user_lat, user_lon, weather_description, temperature)
		scored.append((features["score"], p))

	scored.sort(key=lambda item: item[0], reverse=True)
	ranked = [item[1] for item in scored]

	if limit is not None:
		return ranked[:limit]
	return ranked
