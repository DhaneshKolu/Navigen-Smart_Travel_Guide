import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import "../styles/Dashboard.css";

function Dashboard({ userId, onLogout }) {
  const [itineraries, setItineraries] = useState([]);
  const [filteredTrips, setFilteredTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [destinationFilter, setDestinationFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const navigate = useNavigate();

  const fetchItineraries = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/itineraries", {
        params: { user_id: userId },
      });
      let trips = res.data || [];
      // Fallback for environments where query param filtering does not behave
      // as expected due stale backend reloads.
      if (!trips.length) {
        const allRes = await api.get("/itineraries");
        const me = String(userId || "");
        trips = (allRes.data || []).filter((t) => String(t.user_id) === me);
      }
      setItineraries(trips);
      setFilteredTrips(trips);
    } catch (err) {
      console.error("Error fetching itineraries:", err);
      setError("Could not load your trips. Please try again later.");
      setItineraries([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchItineraries();
  }, [fetchItineraries]);

  useEffect(() => {
    let next = [...itineraries];

    if (destinationFilter.trim()) {
      const q = destinationFilter.trim().toLowerCase();
      next = next.filter((t) => (t.destination || "").toLowerCase().includes(q));
    }

    if (daysFilter !== "all") {
      if (daysFilter === "short") {
        next = next.filter((t) => Number(t.days) <= 3);
      } else if (daysFilter === "medium") {
        next = next.filter((t) => Number(t.days) >= 4 && Number(t.days) <= 7);
      } else if (daysFilter === "long") {
        next = next.filter((t) => Number(t.days) >= 8);
      }
    }

    if (budgetFilter !== "all") {
      if (budgetFilter === "budget") {
        next = next.filter((t) => Number(t.budget || 0) <= 20000);
      } else if (budgetFilter === "moderate") {
        next = next.filter((t) => Number(t.budget || 0) > 20000 && Number(t.budget || 0) <= 50000);
      } else if (budgetFilter === "luxury") {
        next = next.filter((t) => Number(t.budget || 0) > 50000);
      }
    }

    setFilteredTrips(next);
  }, [itineraries, destinationFilter, daysFilter, budgetFilter]);

  const handleLogout = () => {
    onLogout();
    navigate("/login");
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Smart Travel Guide</h1>
          <div className="header-actions">
            <Link to="/settings" className="btn-settings">
              Settings
            </Link>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="welcome-section">
          <h2>Welcome to Smart Travel Guide!</h2>
          <p>
            Plan your perfect trip with AI-powered recommendations for hotels,
            restaurants, and activities.
          </p>
        </section>

        <section className="action-section">
          <Link to="/travel-form" className="btn-create-trip">
            Create New Trip
          </Link>
        </section>

        <section className="itineraries-section">
          <h2>Your Trips</h2>

          <div className="trip-filters" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            <input
              type="text"
              placeholder="Filter by destination"
              value={destinationFilter}
              onChange={(e) => setDestinationFilter(e.target.value)}
            />
            <select value={daysFilter} onChange={(e) => setDaysFilter(e.target.value)}>
              <option value="all">All durations</option>
              <option value="short">Short (1-3 days)</option>
              <option value="medium">Medium (4-7 days)</option>
              <option value="long">Long (8+ days)</option>
            </select>
            <select value={budgetFilter} onChange={(e) => setBudgetFilter(e.target.value)}>
              <option value="all">All budgets</option>
              <option value="budget">Budget</option>
              <option value="moderate">Moderate</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <p className="loading-text">Loading trips...</p>
          ) : filteredTrips.length === 0 ? (
            <div className="empty-state">
              <p>No trips yet. Create your first trip to get started!</p>
            </div>
          ) : (
            <div className="itineraries-grid">
              {filteredTrips.map((itinerary) => (
                <div key={itinerary.id} className="itinerary-card">
                  <div className="card-header">
                    <h3>{itinerary.destination}</h3>
                    <span className="badge">{itinerary.days} Days</span>
                  </div>
                  <div className="card-body">
                    <p>Trip ID: {itinerary.id}</p>
                    <p>Budget: {Number(itinerary.budget || 0).toLocaleString()}</p>
                    <p>Comfort radius: {itinerary.comfort_radius || 5} km</p>
                    {itinerary.has_saved_plan ? (
                      <p style={{ color: "#15803d", fontWeight: 600 }}>Saved plan available</p>
                    ) : (
                      <p style={{ color: "#b45309", fontWeight: 600 }}>No saved plan yet</p>
                    )}
                  </div>
                  <div className="card-footer">
                    {itinerary.has_saved_plan ? (
                      <Link to={`/optimized-plan/${itinerary.id}`} className="btn-generate-plan">
                        View Saved Optimized Output
                      </Link>
                    ) : (
                      <Link to={`/plan/${itinerary.id}`} className="btn-generate-plan">
                        Generate Plan
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredTrips.some((t) => t.has_saved_plan) && (
            <div style={{ marginTop: "20px" }}>
              <h3>Saved Trips</h3>
              <div className="itineraries-grid">
                {filteredTrips.filter((t) => t.has_saved_plan).map((t) => (
                  <div key={`saved-${t.id}`} className="itinerary-card">
                    <div className="card-header">
                      <h3>{t.destination}</h3>
                      <span className="badge">Saved</span>
                    </div>
                    <div className="card-body">
                      <p>{t.days} days</p>
                    </div>
                    <div className="card-footer">
                      <Link to={`/optimized-plan/${t.id}`} className="btn-generate-plan">Open</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
