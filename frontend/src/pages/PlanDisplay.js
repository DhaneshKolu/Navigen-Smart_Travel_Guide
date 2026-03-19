import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import RouteMap from "../components/RouteMap";

function PlanDisplay() {
  const { itineraryId } = useParams();
  const [itinerary, setItinerary] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [pace, setPace] = useState("moderate");
  const [userLocation, setUserLocation] = useState({ lat: null, lon: null });
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [originCity, setOriginCity] = useState("");

  const normalizePlanResponse = useCallback((data) => {
    // data.plan may be the daily_plan (object) or missing
    const daily = data.plan && typeof data.plan === "object" ? data.plan : {};
    // Normalize hotels shape into a consistent object while preserving metadata.
    let hotelsNormalized = {
      hotels: [],
      recommended_hotels: [],
      budget_estimate: null,
      num_hotels_found: null,
      status: null,
      search_location: null,
      currency_code: null,
      currency_symbol: "$",
    };
    if (data.hotels) {
      if (Array.isArray(data.hotels)) {
        hotelsNormalized.hotels = data.hotels;
      } else if (data.hotels.recommended_hotels || data.hotels.hotels) {
        hotelsNormalized = {
          hotels: data.hotels.hotels || [],
          recommended_hotels: data.hotels.recommended_hotels || [],
          budget_estimate: data.hotels.budget_estimate ?? null,
          num_hotels_found: data.hotels.num_hotels_found ?? null,
          status: data.hotels.status ?? null,
          search_location: data.hotels.search_location ?? null,
          currency_code: data.hotels.currency_code ?? null,
          currency_symbol: data.hotels.currency_symbol || "$",
        };
      } else if (typeof data.hotels === "object") {
        // convert object map to array
        hotelsNormalized.hotels = Object.values(data.hotels || {});
      }
    }

    const cuisinesData = data.cuisines || data.cuisine_recommendations || {};

    return {
      // Keep canonical fields for UI sections.
      plan: daily,
      // normalized helpers
      weather: data.weather || data.weather_info || {},
      cuisines: Object.keys(cuisinesData).length > 0 ? cuisinesData : {},
      hotels: hotelsNormalized,
      pace: data.pace || data._pace || "moderate",
      routes: data.routes || {},
      map: data.map || null,
      decisions: Array.isArray(data.decisions) ? data.decisions : [],
      commute_options: data.commute_options || {},
      cost_breakdown: data.cost_breakdown || {},
    };
  }, []);

  const fetchItinerary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/itineraries/${itineraryId}`);
      setItinerary(res.data);
      try {
        const planRes = await api.get(`/travel/${itineraryId}/saved_plan`);
        if (planRes.data) {
          const normalized = normalizePlanResponse(planRes.data);
          const hasEnrichedData =
            (normalized.cuisines && Object.keys(normalized.cuisines).length > 0) ||
            (normalized.hotels &&
              ((normalized.hotels.hotels && normalized.hotels.hotels.length > 0) ||
                (normalized.hotels.recommended_hotels && normalized.hotels.recommended_hotels.length > 0))) ||
            (normalized.weather && Object.keys(normalized.weather).length > 0) ||
            (normalized.decisions && normalized.decisions.length > 0);

          if (hasEnrichedData) {
            setPlan(normalized);
            setPace(normalized.pace || "moderate");
          } else {
            // Legacy saved plans may only contain plain daily text.
            // Show generation screen so users can regenerate enriched output.
            setPlan(null);
          }
        }
      } catch (err) {
        console.log("No saved plan yet");
      }
    } catch (err) {
      setError("Failed to load itinerary");
    } finally {
      setLoading(false);
    }
  }, [itineraryId, normalizePlanResponse]);

  useEffect(() => {
    fetchItinerary();
    requestUserLocation();
  }, [fetchItinerary]);

  const requestUserLocation = async () => {
    setLocationLoading(true);
    setLocationError("");
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude });
          setLocationLoading(false);
        },
        (error) => {
          setLocationError("Location access denied. Using destination-based recommendations.");
          setLocationLoading(false);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocationError("Geolocation not supported");
      setLocationLoading(false);
    }
  };

  const generatePlan = async () => {
    try {
      setGenerating(true);
      setError("");
      const res = await api.post(`/travel/${itineraryId}/generate_plan`, {
        pace,
        user_lat: userLocation.lat,
        user_lon: userLocation.lon,
        radius_km: itinerary?.comfort_radius ?? 5.0,
        origin_city: originCity || null,
      });
      const normalized = normalizePlanResponse(res.data);
      setPlan(normalized);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = (type, item, day = null) => {
    const title = item?.name || (type === "hotel" ? "Hotel" : "Restaurant");
    const imageSeed = encodeURIComponent(`${title}-${type}`);
    const imageUrl = `https://picsum.photos/seed/${imageSeed}/900/500`;
    setSelectedDetail({ type, day, item, title, imageUrl });
  };

  if (loading) {
    return (
      <div className="plan-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading itinerary...</p>
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="plan-container">
        <div className="error-state">
          <p>Itinerary not found</p>
          <Link to="/dashboard" className="btn-back-home">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-container">
      <header className="plan-header">
        <Link to="/dashboard" className="btn-back">
          ← Back to Dashboard
        </Link>
        <h1>Trip to {itinerary.destination}</h1>
      </header>

      <main className="plan-main">
        {!plan ? (
          <section className="generate-section">
            <div className="generate-card">
              <h2>Generate Your Personalized Itinerary</h2>
              <p className="subtitle">
                Our AI agents will analyze weather, local cuisine, hotels, and
                attractions to create the perfect {itinerary.days}-day itinerary.
                Your plans are automatically saved and can be viewed anytime!
              </p>

              {error && <div className="error-message">{error}</div>}

              <div className="location-status">
                {locationLoading && (
                  <p style={{ color: "#0066cc", fontWeight: "500" }}>
                    📍 Requesting your location...
                  </p>
                )}
                {locationError && (
                  <p style={{ color: "#ff6600", fontWeight: "500" }}>
                    ⚠️ {locationError}
                  </p>
                )}
                {userLocation.lat && userLocation.lon && !locationLoading && (
                  <p style={{ color: "#00aa00", fontWeight: "500" }}>
                    ✅ Location detected ({userLocation.lat.toFixed(2)}°, {userLocation.lon.toFixed(2)}°) - Restaurants will be filtered by proximity!
                  </p>
                )}
              </div>

              <div className="pace-selection">
                <label>Select Travel Pace:</label>
                <div className="pace-options">
                  <button
                    className={`pace-btn ${pace === "relaxed" ? "active" : ""}`}
                    onClick={() => setPace("relaxed")}
                    disabled={generating}
                  >
                    🚶 Relaxed
                  </button>
                  <button
                    className={`pace-btn ${pace === "moderate" ? "active" : ""}`}
                    onClick={() => setPace("moderate")}
                    disabled={generating}
                  >
                    🚴 Moderate
                  </button>
                  <button
                    className={`pace-btn ${pace === "fast" ? "active" : ""}`}
                    onClick={() => setPace("fast")}
                    disabled={generating}
                  >
                    🏃 Fast
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "12px" }}>
                <label>Starting City (for intercity travel plan)</label>
                <input
                  type="text"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  placeholder="e.g., Hyderabad"
                  disabled={generating}
                />
              </div>

              <button
                className="btn-generate-plan btn-large"
                onClick={generatePlan}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <span className="loading-spinner-inline"></span>
                    Generating Plan... This may take a minute
                  </>
                ) : (
                  "Generate Itinerary"
                )}
              </button>

              <div className="agents-info">
                <h3>What Our AI Agents Do:</h3>
                <ul>
                  <li>🌦️ Weather Agent - Checks climate and forecasts</li>
                  <li>🍽️ Cuisine Agent - Finds local restaurants with real-time data</li>
                  <li>🏨 Hotel Agent - Recommends accommodations with live availability</li>
                  <li>🗺️ Route Agent - Plans optimal routes</li>
                  <li>📅 Day Planner - Creates daily schedules</li>
                  <li>⭐ Evaluator - Ensures quality recommendations</li>
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <section className="plan-display-section">
            <div className="plan-summary">
              <div className="summary-card">
                <h2>{itinerary.destination}</h2>
                <div className="summary-details">
                  <span className="detail">📅 {itinerary.days} Days</span>
                  <span className="detail">🚴 {plan.pace || pace} Pace</span>
                </div>
                {plan && !generating && (
                  <p style={{ fontSize: "0.9rem", color: "#666", marginTop: "10px" }}>
                    ✅ Plan saved and can be viewed anytime from your dashboard
                  </p>
                )}
              </div>
            </div>

            {plan.commute_options && plan.commute_options.origin_city && (
              <div className="plan-section">
                <h3>🚆 Reach Your Destination First</h3>
                <p>
                  {plan.commute_options.origin_city} → {plan.commute_options.destination_city}
                  {plan.commute_options.distance_km ? ` (${plan.commute_options.distance_km} km)` : ""}
                </p>
                {Array.isArray(plan.commute_options.options) && plan.commute_options.options.length > 0 && (
                  <div className="daily-plan">
                    {plan.commute_options.options.map((opt, idx) => (
                      <div key={`commute-${idx}`} className="day-card">
                        <h4 style={{ textTransform: "capitalize" }}>{opt.mode}</h4>
                        <p>Estimated time: {opt.duration_hr} hours</p>
                        <p>Estimated cost: {Math.round(opt.estimated_cost).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {plan.cost_breakdown && Object.keys(plan.cost_breakdown).length > 0 && (
              <div className="plan-section">
                <h3>💸 Total Expense Planning</h3>
                <div className="daily-plan">
                  {[
                    ["Total Budget", plan.cost_breakdown.total_budget],
                    ["Travel to Destination", plan.cost_breakdown.travel_to_destination],
                    ["Stay", plan.cost_breakdown.stay],
                    ["Food", plan.cost_breakdown.food],
                    ["Local Transport", plan.cost_breakdown.local_transport],
                    ["Activities", plan.cost_breakdown.activities],
                    ["Remaining", plan.cost_breakdown.remaining],
                  ].map(([label, value]) => (
                    <div key={label} className="day-card">
                      <h4>{label}</h4>
                      <p>{Number(value || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <p style={{ marginTop: "10px", fontWeight: 600, color: plan.cost_breakdown.within_budget ? "#15803d" : "#b91c1c" }}>
                  {plan.cost_breakdown.within_budget ? "Plan is within budget" : "Plan may exceed your budget"}
                </p>
              </div>
            )}

            {(
              <div className="plan-section cuisine-section">
                <h3>🍽️ Restaurant & Cuisine Recommendations</h3>
                <p className="cuisine-intro">Enjoy local cuisines and highly-rated restaurants throughout your trip</p>
                {plan.cuisines && Object.keys(plan.cuisines).length > 0 ? (
                  <div className="daily-cuisines">
                    {Object.entries(plan.cuisines).map(([day, cuisineData]) => (
                    <div key={day} className="cuisine-day-section">
                      <div className="cuisine-day-header">
                        <h4>{day.replace(/_/g, " ").toUpperCase()}</h4>
                        {cuisineData.cuisine_type && (
                          <span className="cuisine-badge">{cuisineData.cuisine_type.toUpperCase()}</span>
                        )}
                      </div>

                      {typeof cuisineData.popularity_score === "number" && (
                        <p className="cuisine-suggestion">
                          Popularity: {(cuisineData.popularity_score * 100).toFixed(0)}%
                        </p>
                      )}

                      {cuisineData.near_landmark && (
                        <p className="cuisine-suggestion">
                          Suggested around: {cuisineData.near_landmark}
                        </p>
                      )}
                      
                      {cuisineData.suggestion && (
                        <p className="cuisine-suggestion">💡 {cuisineData.suggestion}</p>
                      )}
                      
                      {cuisineData.restaurants && Array.isArray(cuisineData.restaurants) && cuisineData.restaurants.length > 0 ? (
                        <div className="restaurants-grid">
                          {cuisineData.restaurants.map((restaurant, idx) => (
                            <div
                              key={`${day}-${idx}`}
                              className="restaurant-card clickable-card"
                              onClick={() => openDetail("restaurant", restaurant, day)}
                            >
                              <div className="restaurant-header">
                                <h5>{restaurant.name || "Local Restaurant"}</h5>
                                {restaurant.rating && (
                                  <span className="rating-badge">⭐ {Number(restaurant.rating).toFixed(1)}</span>
                                )}
                              </div>
                              {(restaurant.user_ratings_total || restaurant.user_ratings) && (
                                <p className="restaurant-detail">
                                  Reviews: {restaurant.user_ratings_total || restaurant.user_ratings}
                                </p>
                              )}
                              {restaurant.address && (
                                <p className="restaurant-detail">📍 {restaurant.address}</p>
                              )}
                              {restaurant.distance_km !== null && !isNaN(restaurant.distance_km) && (
                                <p className="restaurant-detail distance">🚗 {restaurant.distance_km.toFixed(1)} km away</p>
                              )}
                              {restaurant.opening_hours && (
                                <p className="restaurant-detail">🕒 {restaurant.opening_hours}</p>
                              )}
                              {restaurant.phone && (
                                <p className="restaurant-detail">☎️ {restaurant.phone}</p>
                              )}
                              {restaurant.website && (
                                <p className="restaurant-detail website">
                                  <a href={restaurant.website} target="_blank" rel="noopener noreferrer">Visit Website →</a>
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-restaurants">No restaurant data available for this day</p>
                      )}
                    </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-restaurants">No external restaurant data found within your comfort radius. Try increasing radius in your trip settings.</p>
                )}
              </div>
            )}

            {(
              <div className="plan-section hotels-section">
                <h3>🏨 Hotel Recommendations</h3>
                <div className="hotels-info">
                  {(typeof plan.hotels.budget_estimate === "number" || typeof plan.hotels.num_hotels_found === "number") && (
                    <div className="hotel-metadata">
                      {typeof plan.hotels.num_hotels_found === "number" && (
                        <p>Total found: {plan.hotels.num_hotels_found}</p>
                      )}
                      {plan.hotels.near_landmark && (
                        <p>Optimized around: {plan.hotels.near_landmark}</p>
                      )}
                      {typeof plan.hotels.budget_estimate === "number" && (
                        <p>
                          Estimated accommodation budget: {plan.hotels.currency_symbol || "$"}
                          {plan.hotels.budget_estimate.toFixed(0)}
                        </p>
                      )}
                    </div>
                  )}

                  {plan.hotels.recommended_hotels && plan.hotels.recommended_hotels.length > 0 && (
                    <div className="recommended-hotels">
                      <h4>⭐ Top Recommended Hotels:</h4>
                      <div className="hotels-grid">
                        {plan.hotels.recommended_hotels.map((hotel, idx) => (
                          <div
                            key={idx}
                            className="hotel-card clickable-card"
                            onClick={() => openDetail("hotel", hotel)}
                          >
                            <h5>{hotel.name}</h5>
                            {hotel.stars && <p className="hotel-stars">⭐ {hotel.stars} stars</p>}
                            {hotel.type && <p className="hotel-type">Type: {hotel.type}</p>}
                            {hotel.price_per_night && (
                              <p className="hotel-price">
                                💰 {(plan.hotels.currency_symbol || "$") + hotel.price_per_night}/night
                              </p>
                            )}
                            {hotel.address && <p className="hotel-address">📍 {hotel.address}</p>}
                            {hotel.phone && <p className="hotel-phone">☎️ {hotel.phone}</p>}
                            {hotel.website && (
                              <p className="hotel-website">
                                🌐 <a href={hotel.website} target="_blank" rel="noopener noreferrer">View Website</a>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {plan.hotels.hotels && plan.hotels.hotels.length > 0 && (
                    <div className="all-hotels">
                      <h4>Other Available Hotels:</h4>
                      <div className="hotels-grid">
                        {plan.hotels.hotels.slice(0, 6).map((hotel, idx) => (
                          <div
                            key={`other-${idx}`}
                            className="hotel-card clickable-card"
                            onClick={() => openDetail("hotel", hotel)}
                          >
                            <h5>{hotel.name}</h5>
                            {hotel.stars && <p className="hotel-stars">⭐ {hotel.stars} stars</p>}
                            {hotel.type && <p className="hotel-type">Type: {hotel.type}</p>}
                            {hotel.price_per_night && (
                              <p className="hotel-price">
                                💰 {(plan.hotels.currency_symbol || "$") + hotel.price_per_night}/night
                              </p>
                            )}
                            {hotel.address && <p className="hotel-address">📍 {hotel.address}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!plan.hotels.recommended_hotels || plan.hotels.recommended_hotels.length === 0) &&
                    (!plan.hotels.hotels || plan.hotels.hotels.length === 0) && (
                    <p className="no-restaurants">No external hotel data found within your comfort radius. Try increasing radius in your trip settings.</p>
                  )}
                </div>
              </div>
            )}

            {plan.plan && (
              <div className="plan-section">
                <h3>📅 Daily Itinerary</h3>
                <div className="daily-plan">
                  {Object.entries(plan.plan).map(([day, activities]) => (
                    <div key={day} className="day-card">
                      <h4>{day}</h4>
                      <div className="activities">
                        {Array.isArray(activities) ? (
                          activities.map((activity, idx) => (
                            <div key={idx} className="activity-item">
                              <p>{activity}</p>
                            </div>
                          ))
                        ) : typeof activities === "object" ? (
                          <pre>{JSON.stringify(activities, null, 2)}</pre>
                        ) : (
                          <p>{activities}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.decisions && plan.decisions.length > 0 && (
              <div className="plan-section decisions-section">
                <h3>🤖 AI Agent Decisions</h3>
                <div className="decisions-list">
                  {plan.decisions.map((decision, idx) => (
                    <div key={idx} className="decision-item">
                      <div className="decision-header">
                        <h4>{decision.agent}</h4>
                        <span className="confidence">
                          {(decision.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                      <p className="decision-explanation">
                        {decision.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.routes && Object.keys(plan.routes).length > 0 && (
              <div className="plan-section">
                <h3>🗺️ Routes & Navigation</h3>
                <div className="section-content route-section-content">
                  <RouteMap routes={plan.routes} />
                </div>
              </div>
            )}

            {selectedDetail && (
              <div className="detail-modal-backdrop" onClick={() => setSelectedDetail(null)}>
                <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
                  <button className="detail-close" onClick={() => setSelectedDetail(null)}>Close</button>
                  <img
                    src={selectedDetail.imageUrl}
                    alt={selectedDetail.title}
                    className="detail-image"
                  />
                  <h3>{selectedDetail.title}</h3>
                  {selectedDetail.day && <p>Day: {selectedDetail.day.replace("_", " ")}</p>}
                  {selectedDetail.item.address && <p>Address: {selectedDetail.item.address}</p>}
                  {selectedDetail.item.rating && <p>Rating: {selectedDetail.item.rating}</p>}
                  {selectedDetail.item.phone && <p>Phone: {selectedDetail.item.phone}</p>}
                  {selectedDetail.item.opening_hours && <p>Opening hours: {selectedDetail.item.opening_hours}</p>}
                  {selectedDetail.item.website && (
                    <p>
                      <a href={selectedDetail.item.website} target="_blank" rel="noopener noreferrer">
                        Open official website
                      </a>
                    </p>
                  )}
                  {selectedDetail.item.latitude && selectedDetail.item.longitude && (
                    <p>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedDetail.item.latitude},${selectedDetail.item.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Google Maps
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="plan-actions">
              <Link to={`/optimized-plan/${itineraryId}`} className="btn-back-home" style={{ marginRight: "10px" }}>
                Open Optimized Output
              </Link>
              <button
                className="btn-regenerate"
                onClick={() => {
                  setPlan(null);
                  setError("");
                }}
              >
                Regenerate Plan
              </button>
              <Link to="/dashboard" className="btn-back-home">
                Back to My Trips
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default PlanDisplay;
