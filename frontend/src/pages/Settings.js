import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../AppWithRouter";
import "../styles/Settings.css";

export default function Settings() {
  const [darkMode, setDarkMode] = useState(localStorage.getItem("theme") === "dark");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await api.get("/users/me");
        setProfile(res.data);
      } catch (_err) {
        setError("Could not load profile data.");
      }
    };
    fetchMe();
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("themeChanged"));
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <Link to="/dashboard" className="settings-back">← Back</Link>
        <h1>Profile & Settings</h1>
      </header>

      <section className="settings-grid">
        <article className="settings-card">
          <h2>Profile</h2>
          {error && <p className="settings-error">{error}</p>}
          {profile ? (
            <div>
              <p><strong>Email:</strong> {profile.email}</p>
              <p><strong>User ID:</strong> {profile.id}</p>
            </div>
          ) : (
            <p>Loading profile...</p>
          )}
        </article>

        <article className="settings-card">
          <h2>Appearance</h2>
          <p>Switch between light and dark mode.</p>
          <button className="theme-toggle" onClick={toggleTheme}>
            {darkMode ? "Disable dark mode" : "Enable dark mode"}
          </button>
        </article>
      </section>
    </div>
  );
}
