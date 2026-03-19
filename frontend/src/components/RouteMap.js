import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import polyline from "@mapbox/polyline";
import "leaflet/dist/leaflet.css";

function collectRouteSegments(routes) {
  if (!routes || typeof routes !== "object") {
    return [];
  }

  const segments = [];
  Object.entries(routes).forEach(([dayKey, dayRoutes]) => {
    if (!Array.isArray(dayRoutes)) {
      return;
    }

    dayRoutes.forEach((route, idx) => {
      let coordinates = [];
      if (Array.isArray(route.geometry)) {
        // ORS GeoJSON uses [lon, lat]
        coordinates = route.geometry.map((point) => [point[1], point[0]]);
      } else if (typeof route.geometry === "string") {
        try {
          coordinates = polyline.decode(route.geometry);
        } catch (_err) {
          coordinates = [];
        }
      }

      segments.push({
        id: `${dayKey}-${idx}-${route.from}-${route.to}`,
        dayKey,
        dayLabel: dayKey.replace("_", " ").toUpperCase(),
        ...route,
        steps: Array.isArray(route.steps) ? route.steps : [],
        coordinates,
      });
    });
  });

  return segments.filter((segment) => segment.coordinates.length > 1);
}

export default function RouteMap({ routes, fallbackCenter = [17.385, 78.4867] }) {
  const segments = useMemo(() => collectRouteSegments(routes), [routes]);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);

  const activeId = activeSegmentId || (segments[0] ? segments[0].id : null);

  const segmentsByDay = useMemo(() => {
    const grouped = {};
    segments.forEach((seg) => {
      if (!grouped[seg.dayKey]) {
        grouped[seg.dayKey] = [];
      }
      grouped[seg.dayKey].push(seg);
    });
    return grouped;
  }, [segments]);

  // Initialize selectedDay to the first day
  useEffect(() => {
    const dayKeys = Object.keys(segmentsByDay);
    if (dayKeys.length > 0 && !selectedDay) {
      setSelectedDay(dayKeys[0]);
    }
  }, [segmentsByDay, selectedDay]);

  // Filter segments for the selected day only
  const daySegments = useMemo(() => {
    if (!selectedDay || !segmentsByDay[selectedDay]) {
      return [];
    }
    return segmentsByDay[selectedDay];
  }, [selectedDay, segmentsByDay]);

  const dayKeys = Object.keys(segmentsByDay);

  // Calculate center based on selected day segments
  const center = useMemo(() => {
    if (daySegments.length > 0 && daySegments[0].coordinates.length > 0) {
      return daySegments[0].coordinates[0];
    }
    return fallbackCenter;
  }, [daySegments, fallbackCenter]);

  if (!segments.length) {
    return <p className="map-empty">No route lines available yet for this itinerary.</p>;
  }

  const totals = daySegments.reduce(
    (acc, seg) => {
      acc.distance += Number(seg.distance_km || 0);
      acc.duration += Number(seg.duration_min || 0);
      return acc;
    },
    { distance: 0, duration: 0 }
  );

  const toggleDay = (dayKey) => {
    setCollapsedDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }));
  };

  const formatArrival = (dayOffset, cumulativeMinutes) => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setMinutes(d.getMinutes() + Math.round(cumulativeMinutes));
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const navUrl = (seg) => {
    if (
      seg.from_lat == null ||
      seg.from_lon == null ||
      seg.to_lat == null ||
      seg.to_lon == null
    ) {
      return null;
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${seg.from_lat},${seg.from_lon}&destination=${seg.to_lat},${seg.to_lon}&travelmode=driving`;
  };

  return (
    <div className="route-map-shell">
      <div className="route-directions-layout">
        <div className="day-navigation">
          <button 
            onClick={() => {
              const currentIndex = dayKeys.indexOf(selectedDay);
              if (currentIndex > 0) {
                setSelectedDay(dayKeys[currentIndex - 1]);
              }
            }}
            disabled={dayKeys.indexOf(selectedDay) === 0}
            className="day-nav-btn"
          >
            ← Previous Day
          </button>
          <div className="day-indicator">
            Day {dayKeys.indexOf(selectedDay) + 1} of {dayKeys.length}: <strong>{selectedDay?.replace("_", " ").toUpperCase()}</strong>
          </div>
          <button 
            onClick={() => {
              const currentIndex = dayKeys.indexOf(selectedDay);
              if (currentIndex < dayKeys.length - 1) {
                setSelectedDay(dayKeys[currentIndex + 1]);
              }
            }}
            disabled={dayKeys.indexOf(selectedDay) === dayKeys.length - 1}
            className="day-nav-btn"
          >
            Next Day →
          </button>
        </div>

        <MapContainer center={center} zoom={12} className="route-map" scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {daySegments.map((segment, idx) => {
            const isActive = segment.id === activeId;
            return (
              <React.Fragment key={segment.id}>
                <Polyline
                  positions={segment.coordinates}
                  pathOptions={{
                    color: isActive ? "#2563eb" : idx % 2 === 0 ? "#1f6feb" : "#f97316",
                    weight: isActive ? 7 : 5,
                    opacity: isActive ? 0.95 : 0.75,
                  }}
                />
                <Marker position={segment.coordinates[0]}>
                  <Popup>
                    <strong>{segment.from}</strong>
                  </Popup>
                </Marker>
                <Marker position={segment.coordinates[segment.coordinates.length - 1]}>
                  <Popup>
                    <strong>{segment.to}</strong>
                    <br />
                    {segment.distance_km} km, {segment.duration_min} min
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        <aside className="directions-panel">
          <div className="directions-summary">
            <h4>Optimized Navigation</h4>
            <p>{totals.distance.toFixed(1)} km total</p>
            <p>{Math.round(totals.duration)} min total</p>
          </div>

          <section className="direction-day-group">
            <div className="day-header">
              <span>{selectedDay?.replace("_", " ").toUpperCase()}</span>
              <span className="direction-metrics">{totals.distance.toFixed(1)} km • {Math.round(totals.duration)} min</span>
            </div>

            {daySegments.map((segment) => {
              const dayIdx = dayKeys.indexOf(selectedDay);
              let cumulative = 0;
              
              daySegments.forEach((s, i) => {
                if (i < daySegments.indexOf(segment)) {
                  cumulative += Number(s.duration_min || 0);
                }
              });
              cumulative += Number(segment.duration_min || 0);

              const arrival = formatArrival(dayIdx, cumulative);
              const gmaps = navUrl(segment);

              return (
                <div
                  key={`block-${segment.id}`}
                  className={`direction-block ${segment.id === activeId ? "active" : ""}`}
                  onClick={() => setActiveSegmentId(segment.id)}
                >
                  <div className="direction-header-row">
                    <span className="direction-day">Segment</span>
                    <span className="direction-metrics">
                      {segment.distance_km} km • {segment.duration_min} min
                    </span>
                  </div>
                  <p className="direction-title">
                    {segment.from} → {segment.to}
                  </p>
                  <p className="direction-eta">Arrive by {arrival}</p>

                  {segment.steps.length > 0 ? (
                    <ol className="direction-steps">
                      {segment.steps.slice(0, 6).map((step, idx) => (
                        <li key={`${segment.id}-step-${idx}`}>
                          <span className="step-text">{step.instruction}</span>
                          <span className="step-meta">
                            {step.distance_km} km • {step.duration_min} min
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="direction-fallback">Follow this segment on the map for turn guidance.</p>
                  )}

                  {gmaps && (
                    <a
                      className="start-nav-btn"
                      href={gmaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Start navigation
                    </a>
                  )}
                </div>
              );
            })}
          </section>
        </aside>
      </div>
    </div>
  );
}
