import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import "../styles/TravelForm.css";

function TravelForm({ userId }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(3);
  const [budget, setBudget] = useState(30000);
  const [travelBudget, setTravelBudget] = useState(8000);
  const [hotelBudget, setHotelBudget] = useState(14000);
  const [foodBudget, setFoodBudget] = useState(6000);
  const [startDate, setStartDate] = useState(todayIso);
  const [comfortRadius, setComfortRadius] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [createdItineraryId, setCreatedItineraryId] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!destination.trim()) {
      setError("Destination is required");
      return;
    }

    if (days < 1 || days > 30) {
      setError("Days must be between 1 and 30");
      return;
    }

    if (!Number.isInteger(Number(budget)) || Number(budget) <= 0) {
      setError("Total budget must be a positive integer");
      return;
    }

    if ([travelBudget, hotelBudget, foodBudget].some((x) => !Number.isInteger(Number(x)) || Number(x) < 0)) {
      setError("Travel, hotel, and food budgets must be non-negative integers");
      return;
    }

    const splitSum = Number(travelBudget) + Number(hotelBudget) + Number(foodBudget);
    if (splitSum > Number(budget)) {
      setError("Split budgets cannot exceed total budget");
      return;
    }

    const userId = localStorage.getItem("userId");
    console.log("Retrieved userId from localStorage:", userId, "Type:", typeof userId);
    
    if (!userId) {
      setError("User ID not found. Please login again.");
      return;
    }

    const userIdNum = parseInt(userId);
    console.log("Parsed userId:", userIdNum, "Is valid:", !isNaN(userIdNum));
    
    if (isNaN(userIdNum)) {
      setError("Invalid user ID. Please login again.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess(false);

      const payload = {
        user_id: userIdNum,
        destination: destination.trim(),
        days: parseInt(days),
        budget: parseInt(budget),
        travel_budget: parseInt(travelBudget),
        hotel_budget: parseInt(hotelBudget),
        food_budget: parseInt(foodBudget),
        pace: "moderate",
        trip_start_date: startDate || null,
        comfort_radius: parseFloat(comfortRadius),
      };
      
      console.log("Sending payload:", JSON.stringify(payload, null, 2));
      console.log("Payload types:", {
        user_id: typeof payload.user_id,
        destination: typeof payload.destination,
        days: typeof payload.days,
      });

      // Create itinerary
      const res = await api.post("/itineraries/", payload);
      
      console.log("Success response:", res.data);

      setCreatedItineraryId(res.data.id);
      setSuccess(true);

      // Reset form
      setDestination("");
      setDays(3);
      setBudget(30000);
      setTravelBudget(8000);
      setHotelBudget(14000);
      setFoodBudget(6000);
      setStartDate(todayIso);
      setComfortRadius(5);

      // Navigate to plan after 2 seconds
      setTimeout(() => {
        navigate(`/plan/${res.data.id}`);
      }, 2000);
    } catch (err) {
      console.error("Full error response:", err.response);
      console.error("Error status:", err.response?.status);
      console.error("Error data:", err.response?.data);
      
      // Log detailed error info
      if (err.response?.data) {
        console.log("Full error object:", JSON.stringify(err.response.data, null, 2));
      }
      
      let errorMsg = "Failed to create trip. Please try again.";
      
      if (err.response?.data?.detail) {
        // Handle both string and array of validation errors
        const detail = err.response.data.detail;
        console.log("Detail type:", typeof detail, "Is array:", Array.isArray(detail));
        
        if (Array.isArray(detail)) {
          console.log("Validation errors:", detail);
          errorMsg = detail.map(e => {
            if (typeof e === "object" && e.msg) {
              return `${e.loc?.join(".")} - ${e.msg}`;
            }
            return e.msg || JSON.stringify(e);
          }).join(", ");
        } else if (typeof detail === "string") {
          errorMsg = detail;
        } else {
          errorMsg = JSON.stringify(detail);
        }
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="travel-form-container">
      <header className="form-header">
        <Link to="/dashboard" className="btn-back">
          ← Back
        </Link>
        <h1>Plan Your Trip</h1>
        <div style={{ width: "60px" }}></div>
      </header>

      <main className="form-main">
        <div className="form-card">
          {success ? (
            <div className="success-message">
              <h2>Trip Created Successfully! 🎉</h2>
              <p>Trip ID: {createdItineraryId}</p>
              <p>Generating your personalized itinerary...</p>
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <>
              <h2>Tell Us About Your Trip</h2>
              <p className="form-subtitle">
                We'll use this information to generate a personalized itinerary
                just for you
              </p>

              {error && <div className="error-message">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Destination *</label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g., Paris, Tokyo, New York"
                    disabled={loading}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Number of Days *</label>
                    <input
                      type="number"
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      min="1"
                      max="30"
                      disabled={loading}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Total Budget (Integer) *</label>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      min="1"
                      step="1"
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Travel Budget</label>
                    <input type="number" min="0" step="1" value={travelBudget} onChange={(e) => setTravelBudget(e.target.value)} disabled={loading} />
                  </div>
                  <div className="form-group">
                    <label>Hotel Budget</label>
                    <input type="number" min="0" step="1" value={hotelBudget} onChange={(e) => setHotelBudget(e.target.value)} disabled={loading} />
                  </div>
                  <div className="form-group">
                    <label>Food Budget</label>
                    <input type="number" min="0" step="1" value={foodBudget} onChange={(e) => setFoodBudget(e.target.value)} disabled={loading} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Trip Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={todayIso}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label>Comfort Radius (km)</label>
                  <input
                    type="number"
                    value={comfortRadius}
                    onChange={(e) => setComfortRadius(e.target.value)}
                    min="1"
                    max="50"
                    step="0.5"
                    disabled={loading}
                    placeholder="Maximum distance from city center (default: 5km)"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary btn-large"
                  disabled={loading}
                >
                  {loading ? "Creating Trip..." : "Create Trip & Generate Plan"}
                </button>
              </form>

              <div className="form-info">
                <p>
                  <strong>💡 Tip:</strong> Our AI agents will analyze weather,
                  local cuisine, hotels, and create the perfect day-by-day
                  itinerary for you!
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default TravelForm;
