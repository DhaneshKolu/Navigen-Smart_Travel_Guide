import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../AppWithRouter";
import RouteMap from "../components/RouteMap";
import "../styles/PlanDisplay.css";
import "../styles/OptimizedOutput.css";

export default function OptimizedOutput() {
  const { itineraryId } = useParams();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/travel/${itineraryId}/saved_plan`);
        setPlan(res.data);
      } catch (_e) {
        setError("No saved optimized output found yet. Generate a plan first.");
      }
    };
    load();
  }, [itineraryId]);

  const topHotels = useMemo(() => {
    const hotels = plan?.hotels || {};
    return (hotels.recommended_hotels || hotels.hotels || []).slice(0, 4);
  }, [plan]);

  if (error) {
    return <div className="optimized-page"><main className="optimized-main"><p>{error}</p><Link to={`/plan/${itineraryId}`}>Go to Plan Page</Link></main></div>;
  }

  if (!plan) {
    return <div className="optimized-page"><main className="optimized-main"><p>Loading optimized output...</p></main></div>;
  }

  return (
    <div className="optimized-page">
      <header className="optimized-hero">
        <Link to="/dashboard" className="btn-back">← Back to Dashboard</Link>
        <h1>Optimized Output</h1>
        <p>Final, execution-ready version of your trip with transport and cost optimization.</p>
      </header>

      <main className="optimized-main">
        <div className="optimized-grid">
        {plan.commute_options && (
          <section className="optimized-card">
            <h3>🚍 Real-Time Intercity Commute</h3>
            <p>
              {plan.commute_options.origin_city || "Origin"} → {plan.commute_options.destination_city || "Destination"}
            </p>
            <p>
              <span className="optimized-pill">Source: {plan.commute_options.data_source || "estimated_fallback"}</span>
              <span className="optimized-pill">Modes: {(plan.commute_options.options || []).length}</span>
            </p>
            <div className="daily-plan">
              {(plan.commute_options.options || []).map((o, idx) => (
                <div key={idx} className="day-card">
                  <h4 style={{ textTransform: "capitalize" }}>{o.mode}</h4>
                  <p>{o.duration_text || `${o.duration_hr} hr`}</p>
                  <p>Cost: {o.estimated_cost}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {plan.cost_breakdown && (
          <section className="optimized-card">
            <h3>💰 Budget Optimization</h3>
            <p>Mode: {plan.cost_breakdown.pricing_mode || "live_when_available"}</p>
            <p>Commute source: {plan.cost_breakdown.commute_data_source || "n/a"}</p>
            <div className="optimized-row">
              {Object.entries(plan.cost_breakdown)
                .filter(([k]) => ["total_budget", "travel_to_destination", "stay", "food", "local_transport", "activities", "remaining"].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="optimized-metric">
                    <h4>{k.replace(/_/g, " ")}</h4>
                    <p>{Number(v || 0).toLocaleString()}</p>
                  </div>
                ))}
            </div>
          </section>
        )}
        </div>

        {plan.routes && Object.keys(plan.routes).length > 0 && (
          <section className="optimized-card" style={{ marginTop: "16px" }}>
            <h3>🗺️ Navigation Execution</h3>
            <RouteMap routes={plan.routes} />
          </section>
        )}

        {topHotels.length > 0 && (
          <section className="optimized-card" style={{ marginTop: "16px" }}>
            <h3>🏨 Top Stay Picks</h3>
            <div className="hotels-grid">
              {topHotels.map((h, idx) => (
                <div key={idx} className="hotel-card">
                  <h5>{h.name}</h5>
                  {h.address && <p>{h.address}</p>}
                  {h.rating && <p>Rating: {h.rating}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
