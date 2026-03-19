import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './pages/Dashboard';
import TravelForm from './pages/TravelForm';
import PlanDisplayNew from './pages/PlanDisplayNew';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Register from './pages/Register';

const RAW_API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.endsWith('/api') ? RAW_API_BASE : `${RAW_API_BASE}/api`;

// Create axios instance for API calls
export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add authorization header with token if available
api.interceptors.request.use((config) => {
  const user = localStorage.getItem('travelUser');
  if (user) {
    try {
      const { token } = JSON.parse(user);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

function AppWithRouter() {
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const savedUser = localStorage.getItem('travelUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('travelUser');
      }
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div style={{ background: '#0F172A', color: '#F1F5F9', minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<Login onLoginSuccess={(token, userId) => { 
              const userData = { id: userId, token };
              setUser(userData);
            }} />} />
            <Route path="/register" element={<Register onLoginSuccess={(token, userId) => { 
              const userData = { id: userId, token };
              setUser(userData);
            }} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/dashboard" element={<Dashboard userId={user.id} onLogout={() => { localStorage.removeItem('travelUser'); setUser(null); }} />} />
            <Route path="/travel-form" element={<TravelForm userId={user.id} />} />
            <Route path="/plan/:itineraryId" element={<PlanDisplayNew />} />
            <Route path="/settings" element={<Settings userId={user.id} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default AppWithRouter;
