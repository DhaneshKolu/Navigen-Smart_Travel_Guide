import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import RouteMap from "../components/RouteMap";

const GRADIENT_THEMES = {
  Nature: "linear-gradient(135deg, #10B981, #059669)",
  Culture: "linear-gradient(135deg, #6366F1, #4F46E5)",
  Food: "linear-gradient(135deg, #F59E0B, #D97706)",
  Shopping: "linear-gradient(135deg, #EC4899, #DB2777)",
  Nightlife: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
  Adventure: "linear-gradient(135deg, #0EA5E9, #0284C7)",
  Wellness: "linear-gradient(135deg, #14B8A6, #0D9488)",
};

const DAY_COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6"];

const getQualityBadge = (rating) => {
  if (!rating) return null;
  if (rating >= 4.8) return { emoji: "⭐", text: "Must Visit", color: "#FFB800" };
  if (rating >= 4.5) return { emoji: "👍", text: "Highly Rated", color: "#10B981" };
  if (rating >= 4.0) return { emoji: "✓", text: "Recommended", color: "#94A3B8" };
  return null;
};

function PlanDisplay() {
  const { itineraryId } = useParams();
  const [itinerary, setItinerary] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [pace, setPace] = useState("moderate");
  const [activeDay, setActiveDay] = useState(1);
  const [activeStop, setActiveStop] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [userLocation, setUserLocation] = useState({ lat: null, lon: null });
  const [originCity, setOriginCity] = useState("");
  const [activeTab, setActiveTab] = useState("itinerary"); // itinerary | hotels | restaurants | weather | budget

  const normalizePlanResponse = useCallback((data) => {
    const daily = data.plan && typeof data.plan === "object" ? data.plan : {};
    
    const curatedDaily = {};
    Object.entries(daily).forEach(([dayKey, dayContent]) => {
      if (dayContent.stops && Array.isArray(dayContent.stops)) {
        curatedDaily[dayKey] = {
          ...dayContent,
          stops: dayContent.stops.slice(0, 4).map(stop => ({
            ...stop,
            why_here: stop.why_here || `Recommended attraction matching your travel preferences`,
          })),
        };
      } else {
        curatedDaily[dayKey] = dayContent;
      }
    });

    let hotelsNormalized = { hotels: [], recommended_hotels: [], budget_estimate: null, currency_symbol: "$" };
    if (data.hotels) {
      if (Array.isArray(data.hotels)) {
        hotelsNormalized.hotels = data.hotels;
      } else if (data.hotels.recommended_hotels || data.hotels.hotels) {
        hotelsNormalized = { ...data.hotels, hotels: data.hotels.hotels || [], recommended_hotels: data.hotels.recommended_hotels || [], currency_symbol: data.hotels.currency_symbol || "$" };
      }
    }

    const cuisinesData = data.cuisines || {};

    return {
      plan: curatedDaily,
      weather: data.weather || {},
      cuisines: cuisinesData,
      hotels: hotelsNormalized,
      pace: data.pace || "moderate",
      routes: data.routes || {},
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
          setPlan(normalized);
          setPace(normalized.pace || "moderate");
          setActiveDay(1);
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
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        },
        () => {}
      );
    }
  }, [fetchItinerary]);

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
      setActiveDay(1);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate plan");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: "#0F172A", color: "#F1F5F9", minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✈️</div>
          <p>Loading itinerary...</p>
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div style={{ background: "#0F172A", color: "#F1F5F9", minHeight: "100vh", padding: 32, textAlign: "center" }}>
        <p>Itinerary not found</p>
        <Link to="/dashboard" style={{ color: "#6366F1" }}>Back to Dashboard</Link>
      </div>
    );
  }

  const dayKeys = plan ? Object.keys(plan.plan).filter(k => plan.plan[k]).sort() : [];
  const currentDayKey = dayKeys[activeDay - 1];
  const currentDayData = plan && currentDayKey ? plan.plan[currentDayKey] : null;
  const dayColor = DAY_COLORS[(activeDay - 1) % DAY_COLORS.length];

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0F172A; }
        
        .plan-container { background: #0F172A; color: #F1F5F9; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; position: relative; }
        .plan-container::before { content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(ellipse 80% 60% at 50% 20%, rgba(99,102,241,0.08), transparent); animation: gradientShift 20s ease-in-out infinite; pointer-events: none; z-index: -1; }
        @keyframes gradientShift { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.5; } }

        .plan-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; display: flex; align-items: center; gap: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.3); position: relative; z-index: 10; }
        .plan-header h1 { font-size: 2rem; font-weight: 700; margin: 0; }
        .btn-back { padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.2); border: 2px solid white; color: white; border-radius: 8px; cursor: pointer; text-decoration: none; font-weight: 600; transition: all 0.3s ease; display: inline-block; }
        .btn-back:hover { background: white; color: #667eea; transform: translateX(-4px); }

        .plan-main { max-width: 1600px; margin: 0 auto; position: relative; z-index: 5; }
        
        .generate-section { padding: 3rem 2rem; max-width: 800px; margin: 0 auto; }
        .generate-card { background: linear-gradient(135deg, #1E293B 0%, #273549 100%); border: 1px solid #334155; border-radius: 16px; padding: 3rem; backdrop-filter: blur(10px); }
        .generate-card h2 { font-size: 2rem; margin-bottom: 1rem; background: linear-gradient(135deg, #6366F1, #8B5CF6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .generate-card .subtitle { font-size: 1rem; color: #94A3B8; margin-bottom: 2rem; line-height: 1.6; }

        .pace-selection { margin: 2rem 0; }
        .pace-selection label { display: block; font-weight: 600; margin-bottom: 1rem; color: #E2E8F0; }
        .pace-options { display: flex; gap: 1rem; flex-wrap: wrap; }
        .pace-btn { flex: 1; min-width: 120px; padding: 12px 20px; border: 1.5px solid #334155; border-radius: 10px; background: transparent; color: #94A3B8; cursor: pointer; font-weight: 500; transition: all 0.3s ease; font-size: 14px; }
        .pace-btn:hover:not(:disabled) { border-color: #6366F1; color: #F1F5F9; background: rgba(99,102,241,0.1); }
        .pace-btn.active { background: #6366F1; border-color: #6366F1; color: white; box-shadow: 0 0 0 3px rgba(99,102,241,0.2); }

        .btn-generate-plan { width: 100%; padding: 16px; background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; margin-top: 1.5rem; position: relative; overflow: hidden; }
        .btn-generate-plan:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.4); }
        .btn-generate-plan:disabled { opacity: 0.6; cursor: not-allowed; }

        .plan-display-section { padding: 2rem; display: grid; grid-template-columns: 1fr 3fr; gap: 2rem; min-height: calc(100vh - 200px); }

        .left-panel { background: linear-gradient(135deg, #1E293B 0%, #273549 100%); border-radius: 16px; padding: 2rem; height: fit-content; position: sticky; top: 20px; max-height: calc(100vh - 120px); overflow-y: auto; border: 1px solid #334155; }

        .trip-mood-board { margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #334155; }
        .mood-pills { display: grid; grid-template-columns: 1fr; gap: 0.75rem; }
        .mood-pill { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 999px; padding: 0.75rem 1.25rem; font-size: 13px; color: #E2E8F0; text-align: center; font-weight: 500; }

        .day-tabs { display: flex; gap: 0.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .day-tab { padding: 8px 16px; border-radius: 999px; border: 1.5px solid #334155; background: transparent; color: #94A3B8; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s ease; }
        .day-tab:hover { border-color: #6366F1; color: #F1F5F9; }
        .day-tab.active { background: #6366F1; border-color: #6366F1; color: white; box-shadow: 0 0 0 3px rgba(99,102,241,0.2); }

        .day-section { animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .day-header { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 2rem; }
        .day-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
        .day-info { flex: 1; }
        .day-label { font-size: 11px; text-transform: uppercase; color: #64748B; letter-spacing: 0.05em; margin-bottom: 4px; font-weight: 600; }
        .day-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #F1F5F9; }
        .day-meta { font-size: 12px; color: #94A3B8; display: flex; gap: 1rem; }

        .route-summary-card { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.3); border-left: 4px solid; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; font-size: 13px; }
        .route-summary-card p { margin: 0.5rem 0; color: #E2E8F0; display: flex; align-items: center; gap: 0.5rem; }
        .route-summary-card .total { color: #6366F1; font-weight: 600; margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed rgba(99,102,241,0.3); }

        .stop-card { background: #1E293B; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin-bottom: 1.25rem; cursor: pointer; transition: all 0.2s ease; border-left: 4px solid; position: relative; }
        .stop-card:hover { background: #273549; border-color: #475569; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99,102,241,0.2); }
        .stop-card.active { border-color: #6366F1; background: rgba(99,102,241,0.1); }

        .stop-number { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: currentColor; color: white; border-radius: 50%; font-weight: 700; font-size: 14px; margin-bottom: 0.5rem; }
        .stop-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
        .stop-time { font-size: 12px; color: #94A3B8; font-weight: 500; }
        .quality-badge { font-size: 12px; font-weight: 600; color: white; background: rgba(99,102,241,0.2); border: 0.5px solid rgba(99,102,241,0.4); padding: 4px 10px; border-radius: 6px; }

        .stop-name { font-size: 15px; font-weight: 700; margin-bottom: 0.75rem; color: #F1F5F9; }
        .stop-description { font-size: 13px; color: #CBD5E1; margin-bottom: 0.75rem; line-height: 1.4; }
        .stop-tags { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
        .tag { font-size: 12px; background: rgba(99,102,241,0.15); color: #A5F3FC; padding: 4px 10px; border-radius: 6px; display: inline-block; }
        .why-here { background: rgba(99,102,241,0.08); border-left: 3px solid #6366F1; padding: 8px 12px; margin: 0.75rem 0; border-radius: 6px; font-size: 12px; color: #CBD5E1; font-style: italic; }

        .right-panel { display: flex; flex-direction: column; gap: 1.5rem; }
        .map-wrapper { background: linear-gradient(135deg, #1E293B 0%, #273549 100%); border-radius: 16px; overflow: hidden; border: 1px solid #334155; position: relative; height: 500px; }
        .day-summary-pill { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: rgba(15,23,42,0.9); border: 1px solid #334155; color: #E2E8F0; padding: 0.75rem 1.5rem; border-radius: 999px; font-size: 13px; font-weight: 600; z-index: 100; }

        .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2000; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .drawer { position: fixed; right: 0; top: 0; height: 100%; width: 380px; background: linear-gradient(135deg, #1E293B 0%, #273549 100%); border-left: 1px solid #334155; z-index: 2001; display: flex; flex-direction: column;animation: slideUp 0.3s cubic-bezier(0.32,0.72,0,1); box-shadow: -8px 0 32px rgba(0,0,0,0.5); }
        @keyframes slideUp { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .drawer-header { padding: 1.5rem; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
        .drawer-close { width: 32px; height: 32px; background: transparent; border: none; color: #94A3B8; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; }
        .drawer-close:hover { color: #F1F5F9; }
        .drawer-content { flex: 1; overflow-y: auto; padding: 1.5rem; }
        .drawer-photo { width: 100%; height: 200px; border-radius: 12px; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: center; font-size: 64px; }
        .drawer-title { font-size: 24px; font-weight: 700; margin-bottom: 0.5rem; }
        .drawer-location { font-size: 14px; color: #94A3B8; margin-bottom: 1.5rem; }
        .drawer-section { margin-bottom: 1.5rem; }
        .drawer-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #6366F1; margin-bottom: 0.75rem; letter-spacing: 0.05em; }
        .drawer-section-content { font-size: 13px; color: #CBD5E1; line-height: 1.6; }

        .drawer-buttons { display: flex; gap: 0.75rem; padding: 1.5rem; border-top: 1px solid #334155; }
        .btn-primary { flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #6366F1, #4F46E5); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
        .btn-secondary { flex: 1; padding: 12px 20px; background: transparent; color: #94A3B8; border: 1px solid #334155; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease; }
        .btn-secondary:hover { border-color: #6366F1; color: #F1F5F9; background: rgba(99,102,241,0.05); }

        .tabs-navigation { display: flex; gap: 0.5rem; border-bottom: 1px solid #334155; padding: 1rem 2rem 0; flex-wrap: wrap; background: #0F172A; position: sticky; top: 80px; z-index: 20; }
        .tab-btn { padding: 12px 20px; border: none; background: transparent; color: #94A3B8; cursor: pointer; font-weight: 600; font-size: 14px; border-bottom: 2px solid transparent; transition: all 0.2s ease; }
        .tab-btn:hover { color: #F1F5F9; border-bottom-color: rgba(99,102,241,0.3); }
        .tab-btn.active { color: #6366F1; border-bottom-color: #6366F1; }

        .tab-content { padding: 2rem; animation: fadeIn 0.3s ease; }
        .hotels-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
        .hotel-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; transition: all 0.2s ease; }
        .hotel-card:hover { border-color: #6366F1; transform: translateY(-4px); box-shadow: 0 8px 24px rgba(99,102,241,0.15); }
        .hotel-name { font-size: 16px; font-weight: 700; margin-bottom: 0.5rem; color: #F1F5F9; }
        .hotel-meta { font-size: 13px; color: #94A3B8; margin-bottom: 0.75rem; display: flex; gap: 1rem; flex-wrap: wrap; }
        .hotel-rating { color: #FFB800; font-weight: 600; }
        .hotel-address { font-size: 13px; color: #CBD5E1; margin: 0.75rem 0; }
        .hotel-price { font-size: 16px; font-weight: 700; color: #6366F1; margin-top: 1rem; }

        .restaurants-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
        .restaurant-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; cursor: pointer; transition: all 0.2s ease; }
        .restaurant-card:hover { border-color: #6366F1; transform: translateY(-4px); box-shadow: 0 8px 24px rgba(99,102,241,0.15); }
        .restaurant-name { font-size: 15px; font-weight: 700; color: #F1F5F9; margin-bottom: 0.5rem; }
        .restaurant-info { font-size: 12px; color: #94A3B8; margin: 0.4rem 0; }
        .restaurant-info.cuisine { color: #10B981; font-weight: 500; }

        .weather-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
        .weather-card { background: linear-gradient(135deg, #1E293B, #273549); border: 1px solid #334155; border-radius: 12px; padding: 1.25rem; text-align: center; }
        .weather-date { font-size: 12px; color: #94A3B8; margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; }
        .weather-emoji { font-size: 40px; margin: 0.75rem 0; }
        .weather-temp { font-size: 18px; font-weight: 700; color: #F1F5F9; margin-bottom: 0.5rem; }
        .weather-condition { font-size: 12px; color: #CBD5E1; }
        .weather-badge { display: inline-block; background: rgba(99,102,241,0.2); color: #A5F3FC; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-top: 0.5rem; }

        .budget-section { background: linear-gradient(135deg, #1E293B, #273549); border: 1px solid #334155; border-radius: 14px; padding: 2rem; margin-top: 1.5rem; }
        .budget-row { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #334155; }
        .budget-row:last-child { border-bottom: none; }
        .budget-label { color: #CBD5E1; font-size: 14px; }
        .budget-value { color: #F1F5F9; font-weight: 600; font-size: 14px; }
        .budget-total { padding: 1rem 0; color: #6366F1; font-size: 18px; font-weight: 700; }
        .budget-status { padding: 1rem; border-radius: 10px; text-align: center; font-weight: 600; margin-top: 1rem; }
        .budget-status.within { background: rgba(16,179,145,0.1); color: #10B981; }
        .budget-status.exceed { background: rgba(239,68,68,0.1); color: #EF4444; }

        @media (max-width: 1200px) {
          .plan-display-section { grid-template-columns: 1fr; }
          .left-panel { position: relative; top: auto; max-height: none; }
          .drawer { width: 100%; }
          .tabs-navigation { padding: 1rem 1.5rem 0; }
          .hotels-grid, .restaurants-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
        }
      `}</style>

      <div className="plan-container">
        <header className="plan-header">
          <Link to="/dashboard" className="btn-back">← Back</Link>
          <h1>Trip to {itinerary.destination}</h1>
        </header>

        <main className="plan-main">
          {!plan ? (
            <section className="generate-section">
              <div className="generate-card">
                <h2>Generate Your Personalized Itinerary</h2>
                <p className="subtitle">Our AI agents will create a curated {itinerary.days}-day itinerary with the top attractions, restaurants, and experiences.</p>

                {error && <div style={{ color: "#ef4444", marginBottom: 16 }}>{error}</div>}

                <div className="pace-selection">
                  <label>Travel Pace:</label>
                  <div className="pace-options">
                    <button className={`pace-btn ${pace === "relaxed" ? "active" : ""}`} onClick={() => setPace("relaxed")} disabled={generating}>🚶 Relaxed</button>
                    <button className={`pace-btn ${pace === "moderate" ? "active" : ""}`} onClick={() => setPace("moderate")} disabled={generating}>🚴 Moderate</button>
                    <button className={`pace-btn ${pace === "fast" ? "active" : ""}`} onClick={() => setPace("fast")} disabled={generating}>🏃 Fast</button>
                  </div>
                </div>

                <button className="btn-generate-plan" onClick={generatePlan} disabled={generating}>
                  {generating ? "Generating..." : "Generate Itinerary"}
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="tabs-navigation">
                <button className={`tab-btn ${activeTab === "itinerary" ? "active" : ""}`} onClick={() => setActiveTab("itinerary")}>📅 Itinerary</button>
                <button className={`tab-btn ${activeTab === "restaurants" ? "active" : ""}`} onClick={() => setActiveTab("restaurants")}>🍽️ Restaurants</button>
                <button className={`tab-btn ${activeTab === "hotels" ? "active" : ""}`} onClick={() => setActiveTab("hotels")}>🏨 Hotels</button>
                <button className={`tab-btn ${activeTab === "weather" ? "active" : ""}`} onClick={() => setActiveTab("weather")}>🌦️ Weather</button>
                <button className={`tab-btn ${activeTab === "budget" ? "active" : ""}`} onClick={() => setActiveTab("budget")}>💰 Budget</button>
              </div>

              {activeTab === "itinerary" && (
                <section className="plan-display-section">
                  <div className="left-panel">
                    <div className="trip-mood-board">
                      <div className="mood-pills">
                        <div className="mood-pill">✈️ {itinerary.days} days in {itinerary.destination}</div>
                        <div className="mood-pill">📍 {dayKeys.length * 4} curated stops</div>
                        <div className="mood-pill">🎉 Hand-picked attractions</div>
                      </div>
                    </div>

                    <div className="day-tabs">
                      {dayKeys.map((_, idx) => (
                        <button
                          key={idx + 1}
                          className={`day-tab ${activeDay === idx + 1 ? "active" : ""}`}
                          onClick={() => {
                            setActiveDay(idx + 1);
                            setActiveStop(null);
                          }}
                          style={{
                            borderColor: activeDay === idx + 1 ? undefined : "#334155",
                            background: activeDay === idx + 1 ? dayColor : "transparent",
                            color: activeDay === idx + 1 ? "white" : "#94A3B8",
                          }}
                        >
                          Day {idx + 1}
                        </button>
                      ))}
                    </div>

                    {currentDayData && currentDayData.stops && (
                      <div className="day-section">
                        <div className="day-header">
                          <div className="day-dot" style={{ background: dayColor }}></div>
                          <div className="day-info">
                            <div className="day-label">Day {activeDay}</div>
                            <div className="day-title">{currentDayData.title || `Day ${activeDay}`}</div>
                            <div className="day-meta">
                              <span>{currentDayData.stops.length} stops</span>
                              <span>~{(currentDayData.stops.length * 2).toFixed(1)} hours</span>
                            </div>
                          </div>
                        </div>

                        <div className="route-summary-card" style={{ borderLeftColor: dayColor }}>
                          <p><strong>Start:</strong> {currentDayData.stops[0]?.name}</p>
                          {currentDayData.stops.length > 1 && <p><strong>End:</strong> {currentDayData.stops[currentDayData.stops.length - 1]?.name}</p>}
                          <p className="total">Total: ~{(currentDayData.stops.length * 2).toFixed(1)} hours</p>
                        </div>

                        {currentDayData.stops.map((stop, idx) => {
                          const badge = getQualityBadge(stop.rating);
                          return (
                            <React.Fragment key={idx}>
                              <div
                                className={`stop-card ${activeStop === idx ? "active" : ""}`}
                                style={{ color: dayColor, borderLeftColor: dayColor }}
                                onClick={() => {
                                  setActiveStop(idx);
                                  setDrawer(stop);
                                }}
                              >
                                <div className="stop-number">{idx + 1}</div>
                                <div className="stop-card-header">
                                  <span className="stop-time">{stop.arrival_time || `${9 + idx * 2}:00 AM`}</span>
                                  {badge && <span className="quality-badge">{badge.emoji} {badge.text}</span>}
                                </div>
                                <div className="stop-name">{stop.name}</div>
                                <div className="stop-description">{stop.description || "Popular attraction"}</div>
                                <div className="stop-tags">
                                  {stop.category && <span className="tag">{stop.category}</span>}
                                  {stop.duration && <span className="tag">⏱ {stop.duration}</span>}
                                  {stop.price && <span className="tag">💰 {stop.price}</span>}
                                </div>
                                <div className="why-here">💡 {stop.why_here}</div>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="right-panel">
                    <div className="map-wrapper">
                      <div className="day-summary-pill">
                        📅 Day {activeDay} • {currentDayData?.stops?.length || 0} stops • ~{(currentDayData?.stops?.length || 0) * 2} hours
                      </div>
                      {plan.routes && <RouteMap routes={plan.routes} />}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "restaurants" && (
                <div className="tab-content">
                  <h2>🍽️ Restaurant & Cuisine Recommendations</h2>
                  <p style={{ color: "#94A3B8", marginTop: "0.5rem" }}>Enjoy local cuisines and highly-rated restaurants throughout your trip</p>
                  
                  {plan.cuisines && Object.keys(plan.cuisines).length > 0 ? (
                    <div>
                      {Object.entries(plan.cuisines).map(([day, cuisineData]) => (
                        <div key={day} style={{ marginBottom: "2.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                            <h3 style={{ margin: 0, color: "#F1F5F9", fontSize: 18 }}>{day.replace(/_/g, " ").toUpperCase()}</h3>
                            {cuisineData.cuisine_type && <span style={{ background: "rgba(99,102,241,0.2)", color: "#A5F3FC", padding: "4px 12px", borderRadius: "6px", fontSize: 12, fontWeight: 600 }}>{cuisineData.cuisine_type.toUpperCase()}</span>}
                          </div>

                          {cuisineData.suggestion && <p style={{ color: "#CBD5E1", marginBottom: "1rem", fontStyle: "italic" }}>💡 {cuisineData.suggestion}</p>}

                          {cuisineData.restaurants && Array.isArray(cuisineData.restaurants) && cuisineData.restaurants.length > 0 ? (
                            <div className="restaurants-grid">
                              {cuisineData.restaurants.map((restaurant, idx) => (
                                <div key={`${day}-${idx}`} className="restaurant-card">
                                  <div className="restaurant-name">{restaurant.name || "Local Restaurant"}</div>
                                  <div className="restaurant-info">
                                    {restaurant.rating && <div style={{ marginBottom: "0.25rem" }}>⭐ {Number(restaurant.rating).toFixed(1)} {restaurant.user_ratings_total && `(${restaurant.user_ratings_total} reviews)`}</div>}
                                    {restaurant.address && <div>📍 {restaurant.address}</div>}
                                    {restaurant.distance_km && <div>🚗 {restaurant.distance_km.toFixed(1)} km away</div>}
                                    {restaurant.opening_hours && <div>🕒 {restaurant.opening_hours}</div>}
                                  </div>
                                  {restaurant.website && (
                                    <a href={restaurant.website} target="_blank" rel="noreferrer" style={{ color: "#6366F1", textDecoration: "none", fontSize: 12, marginTop: "0.75rem", display: "inline-block" }}>
                                      Visit Website →
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ color: "#64748B", fontSize: 13, fontStyle: "italic" }}>No restaurant data available for this day</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748B" }}>
                      <p>No restaurant recommendations available yet</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "hotels" && (
                <div className="tab-content">
                  <h2>🏨 Hotel Recommendations</h2>
                  <p style={{ color: "#94A3B8", marginTop: "0.5rem" }}>Curated accommodations matching your budget and preferences</p>
                  
                  {plan.hotels && plan.hotels.hotels && plan.hotels.hotels.length > 0 ? (
                    <div className="hotels-grid">
                      {plan.hotels.hotels.map((hotel, idx) => (
                        <div key={idx} className="hotel-card">
                          <div className="hotel-name">{hotel.name || "Hotel"}</div>
                          <div className="hotel-meta">
                            {hotel.rating && <span className="hotel-rating">⭐ {Number(hotel.rating).toFixed(1)}</span>}
                            {hotel.star_rating && <span style={{ color: "#F59E0B" }}>{'⭐'.repeat(hotel.star_rating)}</span>}
                          </div>
                          <div className="hotel-address">📍 {hotel.address || hotel.location || "Address not available"}</div>
                          {hotel.price_per_night && <div className="hotel-price">${hotel.price_per_night} / night</div>}
                          {hotel.per_room_cost && <div className="hotel-price">${hotel.per_room_cost} / room</div>}
                          {hotel.total_cost && <div className="hotel-price">${hotel.total_cost} total</div>}
                          {hotel.distance_km && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: "0.5rem" }}>🚗 {hotel.distance_km.toFixed(1)} km away</div>}
                          {hotel.website && (
                            <a href={hotel.website} target="_blank" rel="noreferrer" style={{ color: "#6366F1", textDecoration: "none", fontSize: 12, marginTop: "1rem", display: "inline-block", fontWeight: 600 }}>
                              View Hotel →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : plan.hotels && plan.hotels.recommended_hotels && plan.hotels.recommended_hotels.length > 0 ? (
                    <div className="hotels-grid">
                      {plan.hotels.recommended_hotels.map((hotel, idx) => (
                        <div key={idx} className="hotel-card">
                          <div className="hotel-name">{hotel.name || "Hotel"}</div>
                          <div className="hotel-meta">
                            {hotel.rating && <span className="hotel-rating">⭐ {Number(hotel.rating).toFixed(1)}</span>}
                          </div>
                          <div className="hotel-address">📍 {hotel.address || hotel.location || "Address"}</div>
                          {hotel.price_per_night && <div className="hotel-price">${hotel.price_per_night} / night</div>}
                          {hotel.cost && <div className="hotel-price">${hotel.cost}</div>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748B" }}>
                      <p>Hotel data coming soon</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "weather" && (
                <div className="tab-content">
                  <h2>🌦️ Weather Forecast</h2>
                  <p style={{ color: "#94A3B8", marginTop: "0.5rem" }}>Daily weather conditions for your trip</p>
                  
                  {plan.weather && plan.weather.daily && plan.weather.daily.time ? (
                    <div className="weather-grid">
                      {plan.weather.daily.time.slice(0, itinerary.days).map((dateStr, idx) => {
                        const code = plan.weather.daily.weathercode?.[idx];
                        const temp = Math.round(plan.weather.daily.temperature_2m_max?.[idx] ?? 0);
                        const rainProb = plan.weather.daily.precipitation_probability_max?.[idx] ?? 0;
                        const weatherMap = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "⛅", 45: "🌫️", 51: "🌧️", 61: "🌧️", 63: "🌧️", 67: "🌧️", 71: "❄️", 77: "❄️", 80: "⛈️", 95: "⛈️" };
                        const emoji = weatherMap[code] || "🌡️";
                        return (
                          <div key={dateStr} className="weather-card">
                            <div className="weather-date">Day {idx + 1} • {new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                            <div className="weather-emoji">{emoji}</div>
                            <div className="weather-temp">{temp}°C</div>
                            {rainProb > 0 && <div className="weather-badge">☔ {rainProb}% rain</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748B" }}>
                      <p>Weather data not available</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "budget" && (
                <div className="tab-content">
                  <h2>💰 Budget Breakdown</h2>
                  <p style={{ color: "#94A3B8", marginTop: "0.5rem" }}>Estimated costs for your entire trip</p>
                  
                  {plan.cost_breakdown ? (
                    <div className="budget-section">
                      {plan.cost_breakdown.attractions_cost && <div className="budget-row"><span className="budget-label">🎫 Attractions & Activities</span><span className="budget-value">${plan.cost_breakdown.attractions_cost}</span></div>}
                      {plan.cost_breakdown.food_cost && <div className="budget-row"><span className="budget-label">🍽️ Food & Dining</span><span className="budget-value">${plan.cost_breakdown.food_cost}</span></div>}
                      {plan.cost_breakdown.hotels_cost && <div className="budget-row"><span className="budget-label">🏨 Hotels</span><span className="budget-value">${plan.cost_breakdown.hotels_cost}</span></div>}
                      {plan.cost_breakdown.transport_cost && <div className="budget-row"><span className="budget-label">🚗 Transport & Travel</span><span className="budget-value">${plan.cost_breakdown.transport_cost}</span></div>}
                      {plan.cost_breakdown.total_estimated_cost && (
                        <div className="budget-row" style={{ paddingTop: "1rem", borderTopWidth: "2px", fontWeight: 700 }}>
                          <span className="budget-label" style={{ fontSize: 15, color: "#F1F5F9" }}>Total Estimated Cost</span>
                          <span className="budget-value" style={{ fontSize: 18, color: "#6366F1" }}>${plan.cost_breakdown.total_estimated_cost}</span>
                        </div>
                      )}
                      {plan.cost_breakdown.within_budget !== undefined && (
                        <div className={`budget-status ${plan.cost_breakdown.within_budget ? "within" : "exceed"}`}>
                          {plan.cost_breakdown.within_budget ? "✅ Plan is within your budget" : "⚠️ Plan may exceed your budget"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748B" }}>
                      <p>Budget information will be available after plan generation</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {drawer && (
          <>
            <div className="drawer-overlay" onClick={() => setDrawer(null)}></div>
            <div className="drawer">
              <div className="drawer-header">
                <div></div>
                <button className="drawer-close" onClick={() => setDrawer(null)}>✕</button>
              </div>
              <div className="drawer-content">
                <div className="drawer-photo" style={{ background: GRADIENT_THEMES[drawer.category] || GRADIENT_THEMES.Culture }}>
                  {drawer.icon || "📍"}
                </div>
                <div className="drawer-title">
                  {drawer.name}
                  {getQualityBadge(drawer.rating) && <span className="quality-badge" style={{ marginLeft: 8, fontSize: 12 }}>{getQualityBadge(drawer.rating).emoji}</span>}
                </div>
                <div className="drawer-location">{drawer.location || drawer.address}</div>

                {drawer.why_here && (
                  <div className="drawer-section">
                    <div className="drawer-section-title">💡 Why this stop?</div>
                    <div className="drawer-section-content">{drawer.why_here}</div>
                  </div>
                )}

                {drawer.description && (
                  <div className="drawer-section">
                    <div className="drawer-section-title">About</div>
                    <div className="drawer-section-content">{drawer.description}</div>
                  </div>
                )}
              </div>
              <div className="drawer-buttons">
                <button className="btn-primary">📍 Navigate</button>
                <button className="btn-secondary">❤️ Save</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default PlanDisplay;
