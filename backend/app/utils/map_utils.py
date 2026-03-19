def _point_feature(name, day, category, lat, lon):
    if lat is None or lon is None:
        return None
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat],
        },
        "properties": {
            "name": name,
            "category": category,
            "day": day,
        },
    }


def build_geojson(state):
    """Build a tolerant GeoJSON payload from route/hotel/cuisine outputs.

    Previous implementation assumed daily_plan[day]["activities"] shape and
    crashed when daily plans were plain lists of strings.
    """
    features = []

    route_plan = getattr(state, "route_plan", {}) or {}
    if isinstance(route_plan, dict):
        for day, routes in route_plan.items():
            if not isinstance(routes, list):
                continue

            for route in routes:
                if not isinstance(route, dict):
                    continue

                from_lat = route.get("from_lat")
                from_lon = route.get("from_lon")
                to_lat = route.get("to_lat")
                to_lon = route.get("to_lon")

                start = _point_feature(route.get("from", "Start"), day, "route_start", from_lat, from_lon)
                if start:
                    features.append(start)

                end = _point_feature(route.get("to", "End"), day, "route_end", to_lat, to_lon)
                if end:
                    features.append(end)

                geometry = route.get("geometry")
                if isinstance(geometry, list) and len(geometry) >= 2:
                    # Accept both [lon, lat] and [lat, lon] style tuples by
                    # trusting ORS/open map ordering as already used elsewhere.
                    features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": geometry,
                        },
                        "properties": {
                            "from": route.get("from"),
                            "to": route.get("to"),
                            "day": day,
                        },
                    })

    cuisines = getattr(state, "cuisine_recommendations", {}) or {}
    if isinstance(cuisines, dict):
        for day, info in cuisines.items():
            restaurants = info.get("restaurants", []) if isinstance(info, dict) else []
            for item in restaurants[:5]:
                if not isinstance(item, dict):
                    continue
                marker = _point_feature(
                    item.get("name", "Restaurant"),
                    day,
                    "restaurant",
                    item.get("latitude"),
                    item.get("longitude"),
                )
                if marker:
                    features.append(marker)

    hotels_data = getattr(state, "hotel_options", {}) or {}
    hotel_lists = []
    if isinstance(hotels_data, dict):
        hotel_lists.extend(hotels_data.get("recommended_hotels", []) or [])
        hotel_lists.extend(hotels_data.get("hotels", []) or [])

    for hotel in hotel_lists[:8]:
        if not isinstance(hotel, dict):
            continue
        marker = _point_feature(
            hotel.get("name", "Hotel"),
            "trip",
            "hotel",
            hotel.get("latitude"),
            hotel.get("longitude"),
        )
        if marker:
            features.append(marker)

    return {
        "type": "FeatureCollection",
        "features": features,
    }