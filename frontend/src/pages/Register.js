import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import "../styles/Auth.css";

function Register({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Register user  
      const registerRes = await api.post("/auth/register", {
        name: email.split("@")[0], // Use email prefix as name
        email,
        password,
      });

      // Auto login after registration
      const loginRes = await api.post("/auth/login", {
        email: email,
        password: password,
      });

      const userId = registerRes.data?.userId || registerRes.data?.id || "1";
      console.log("Registration successful. Storing userId:", userId);
      
      localStorage.setItem("travelUser", JSON.stringify({
        id: userId,
        token: loginRes.data.token,
        email: email,
      }));
      
      onLoginSuccess(loginRes.data.token, userId.toString());
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      let errorMsg = "Registration failed. Please try again.";
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMsg = detail.map(e => e.msg || JSON.stringify(e)).join(", ");
        } else if (typeof detail === "string") {
          errorMsg = detail;
        } else {
          errorMsg = typeof detail === 'object' ? JSON.stringify(detail) : String(detail);
        }
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Create Account</h1>
        <p className="auth-subtitle">Join Smart Travel Guide</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating Account..." : "Register"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
