import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

const STATUS_MESSAGES = [
  "Talking to your AI travel agents...",
  "Scouting the best spots in your destination...",
  "Checking local weather and conditions...",
  "Finding restaurants matching your vibe...",
  "Comparing hotels within your budget...",
  "Optimizing your route for minimal travel time...",
  "Almost ready — finalizing your perfect itinerary...",
];

const weatherCodeMap = {
  0: { label: "Clear sky", emoji: "☀️", type: "clear", badge: "Perfect today" },
  1: { label: "Mainly clear", emoji: "🌤️", type: "clear", badge: "Perfect today" },
  2: { label: "Partly cloudy", emoji: "⛅", type: "cloudy", badge: "Good to go" },
  3: { label: "Overcast", emoji: "⛅", type: "cloudy", badge: "Good to go" },
  45: { label: "Foggy", emoji: "🌫️", type: "cloudy", badge: "Good to go" },
  51: { label: "Light drizzle", emoji: "🌧️", type: "rain", badge: "Carry umbrella" },
  61: { label: "Slight rain", emoji: "🌧️", type: "rain", badge: "Carry umbrella" },
  63: { label: "Moderate rain", emoji: "🌧️", type: "rain", badge: "Carry umbrella" },
  67: { label: "Heavy rain", emoji: "🌧️", type: "rain", badge: "Carry umbrella" },
  71: { label: "Slight snow", emoji: "❄️", type: "snow", badge: "Dress warm" },
  77: { label: "Snow grains", emoji: "❄️", type: "snow", badge: "Dress warm" },
  80: { label: "Rain showers", emoji: "⛈️", type: "storm", badge: "Check before going" },
  95: { label: "Thunderstorm", emoji: "⛈️", type: "storm", badge: "Check before going" },
};

const packingRules = {
  always: ["Passport", "Travel insurance docs", "Phone charger", "Earphones", "Emergency cash", "Offline maps"],
  weather_hot: ["Sunscreen SPF 50+", "Sunglasses", "Light cotton clothes", "Reusable water bottle"],
  weather_cold: ["Warm jacket", "Thermal innerwear", "Waterproof boots"],
  weather_rain: ["Compact umbrella", "Waterproof bag cover", "Quick-dry clothes"],
  vibe_Nature: ["Trekking shoes", "Insect repellent", "First aid kit", "Power bank"],
  vibe_Culture: ["Modest clothing", "Comfortable walking shoes", "Camera", "Notebook"],
  vibe_Food: ["Antacids", "Food diary app", "Loose pants"],
  vibe_Nightlife: ["Smart casual outfit", "ID proof", "Portable charger"],
  vibe_Wellness: ["Yoga mat", "Meditation app", "Essential oils"],
  vibe_Shopping: ["Extra luggage bag", "Measurements noted", "Budget tracker app"],
  group_Family: ["Kids snacks", "Wet wipes", "Baby essentials"],
  group_Solo: ["Padlock for hostel", "Whistle", "VPN app"],
  group_Couple: ["Romantic outfit", "Shared itinerary app"],
  days_long: ["Laundry bag", "Extra memory card", "Portable WiFi device"],
};

const paceMultiplier = { relaxed: 1.5, balanced: 1.0, fastpaced: 0.7 };
const dayColors = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6", "#EC4899"];

const exchangeRates = {
  USD: 1,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SGD: 1.34,
  JPY: 149.5,
  THB: 35.2,
};

const currencySymbols = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SGD: "S$",
  JPY: "¥",
  THB: "฿",
};

function apiUrl(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function initials(name) {
  return String(name || "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "T";
}

function convertPrice(usd, currency) {
  return Math.round(usd * (exchangeRates[currency] || 1));
}

function parseTime(t) {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function toClock(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

function weatherInfoFromCode(code) {
  return weatherCodeMap[code] || { label: "Unknown", emoji: "🌡️", type: "unknown", badge: "Check conditions" };
}

function bestTimeHint(dayCode, maxTemp, rainProb) {
  if (rainProb > 60) return "Consider visiting this in the afternoon.";
  if (maxTemp > 35) return "Early morning visit recommended.";
  if ([0, 1, 2].includes(dayCode)) return "Perfect evening — stay for sunset.";
  return "Check local conditions before departure.";
}

function isIndoorStop(stop) {
  const text = `${stop?.name || ""} ${stop?.category || ""}`.toLowerCase();
  if (stop?.indoor === true) return true;
  return /(museum|temple|church|fort|mall|gallery|indoor|culture|mosque|palace)/.test(text);
}

function derivePackingList(itinerary, weatherData) {
  const set = new Set(packingRules.always);
  if (!itinerary) return Array.from(set);

  const maxTemp = Math.max(...(weatherData?.daily?.temperature_2m_max || [24]));
  const minTemp = Math.min(...(weatherData?.daily?.temperature_2m_min || [18]));
  const rain = Math.max(...(weatherData?.daily?.precipitation_probability_max || [0]));

  if (maxTemp > 30) packingRules.weather_hot.forEach((i) => set.add(i));
  if (minTemp < 10) packingRules.weather_cold.forEach((i) => set.add(i));
  if (rain > 60) packingRules.weather_rain.forEach((i) => set.add(i));

  (itinerary.vibes || []).forEach((v) => {
    const key = `vibe_${v}`;
    (packingRules[key] || []).forEach((i) => set.add(i));
  });
  (packingRules[`group_${itinerary.group_type}`] || []).forEach((i) => set.add(i));

  if ((itinerary.duration_days || 1) > 5) {
    set.add("Laundry bag");
    set.add("Extra power bank");
  }

  return Array.from(set);
}

async function searchPlaces(query) {
  if (query.length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    return data.map((p) => ({
      label: p.display_name.split(",").slice(0, 3).join(","),
      lat: Number(p.lat),
      lng: Number(p.lon),
      city: p.address?.city || p.address?.town || p.address?.village || query,
      country: p.address?.country,
    }));
  } catch {
    return [];
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error("Reverse geocode failed");
    const p = await res.json();
    return {
      label: p.display_name?.split(",").slice(0, 3).join(",") || "Current location",
      lat,
      lng,
      city: p.address?.city || p.address?.town || p.address?.village || "Current location",
      country: p.address?.country,
    };
  } catch {
    return { label: "Current location", lat, lng, city: "Current location", country: "" };
  }
}

async function fetchWeather(lat, lng) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current_weather=true&timezone=auto&forecast_days=7`
    );
    if (!res.ok) throw new Error("Weather unavailable");
    return res.json();
  } catch {
    return null;
  }
}

async function fetchItinerary(chatData, userToken) {
  const response = await fetch(apiUrl("/api/plan"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      origin: chatData.origin,
      destination: chatData.destination,
      days: chatData.days,
      vibes: chatData.vibes,
      group_type: chatData.group_type,
      budget_level: chatData.budget_level,
      special_requests: chatData.special_requests,
    }),
  });
  if (!response.ok) {
    const error = new Error(`API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function mapErrorToMessage(err) {
  const status = err?.status;
  if (status === 401) return "Session expired — please log in again.";
  if (status === 422) return "We couldn't understand the destination — try being more specific.";
  if (status === 500) return "Our travel agents are busy — try again in a moment.";
  if (String(err?.message || "").toLowerCase().includes("network")) return "No internet connection detected.";
  return "Something went wrong while building your itinerary.";
}

export default function TravelGuide() {
  const [currentPage, setCurrentPage] = useState("auth");
  const [user, setUser] = useState(null);

  const [chatData, setChatData] = useState({
    origin: "",
    destination: "",
    days: null,
    vibes: [],
    group_type: "",
    budget_level: "",
    special_requests: "",
  });

  const [itinerary, setItinerary] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);
  const [weather, setWeather] = useState(null);
  const [errorState, setErrorState] = useState(null);

  const [authTab, setAuthTab] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [authError, setAuthError] = useState("");

  const [chatHistory, setChatHistory] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [typing, setTyping] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [readyToBuild, setReadyToBuild] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [hoveredSuggestion, setHoveredSuggestion] = useState(-1);
  const [inputFlash, setInputFlash] = useState(false);

  const [loadingState, setLoadingState] = useState(false);
  const [loadingStatusIndex, setLoadingStatusIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [activePace, setActivePace] = useState("balanced");
  const [activeTab, setActiveTab] = useState("itinerary");
  const [expandedDays, setExpandedDays] = useState({ 1: true });
  const [activeStopKey, setActiveStopKey] = useState("");
  const [checkedPacking, setCheckedPacking] = useState({});
  const [activeCurrency, setActiveCurrency] = useState("USD");

  const [resetModalOpen, setResetModalOpen] = useState(false);

  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef({});
  const chatEndRef = useRef(null);
  const suggestionTimeoutRef = useRef(null);

  const questions = useMemo(
    () => [
      "Hey! Where are you starting your journey from?",
      "Amazing! And where's the dream destination?",
      "How many days are you thinking?",
      "What's your travel vibe?",
      "Who's joining you?",
      "What's your daily budget per person?",
      "Any special requests or things to avoid?",
    ],
    []
  );

  const progressPct = Math.round((currentQuestion / questions.length) * 100);
  const itineraryDays = useMemo(() => itinerary?.days || [], [itinerary]);
  const isRainBanner = Math.max(...(weather?.daily?.precipitation_probability_max || [0])) > 70;

  const allStops = useMemo(() => {
    const out = [];
    itineraryDays.forEach((d, dayIdx) => {
      const baseStops = d.stops || [];
      let displayStops = baseStops;
      if (activePace === "relaxed") {
        displayStops = baseStops.slice(0, Math.max(1, Math.ceil(baseStops.length * 0.7)));
      }
      if (activePace === "fastpaced") {
        displayStops = baseStops.filter((s) => String(s.category || "").toLowerCase() !== "food");
      }

      let runningTime = parseTime(displayStops[0]?.arrival_time) ?? 9 * 60;
      displayStops.forEach((s, stopIdx) => {
        const lat = Number(s?.lat);
        const lng = Number(s?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const adjDuration = Math.max(20, Math.round((s.duration_minutes || 60) * paceMultiplier[activePace]));
        const key = `d${d.day}-s${stopIdx}`;
        const dayCode = weather?.daily?.weathercode?.[Math.max(0, (d.day || 1) - 1)];
        const maxTemp = weather?.daily?.temperature_2m_max?.[Math.max(0, (d.day || 1) - 1)] ?? 25;
        const rainProb = weather?.daily?.precipitation_probability_max?.[Math.max(0, (d.day || 1) - 1)] ?? 0;
        out.push({
          ...s,
          lat,
          lng,
          key,
          day: d.day,
          dayTitle: d.title,
          dayColor: dayColors[dayIdx % dayColors.length],
          globalOrder: out.length + 1,
          displayArrival: toClock(runningTime),
          displayDuration: adjDuration,
          weatherCode: dayCode,
          weatherInfo: weatherInfoFromCode(dayCode),
          weatherHint: bestTimeHint(dayCode, maxTemp, rainProb),
          indoorTag: isRainBanner && isIndoorStop(s),
        });
        runningTime += adjDuration;
      });
    });
    return out;
  }, [itineraryDays, activePace, weather, isRainBanner]);

  const weatherStrip = useMemo(() => {
    if (!weather?.daily?.time) return [];
    return weather.daily.time.map((dateStr, i) => {
      const code = weather.daily.weathercode?.[i];
      const w = weatherInfoFromCode(code);
      return {
        key: dateStr,
        label: i === 0 ? "Today" : new Date(dateStr).toLocaleDateString(undefined, { weekday: "short" }),
        emoji: w.emoji,
        temp: Math.round(weather.daily.temperature_2m_max?.[i] ?? 0),
      };
    });
  }, [weather]);

  const packingList = useMemo(() => derivePackingList(itinerary, weather), [itinerary, weather]);

  // Load Leaflet on mount
  useEffect(() => {
    document.body.style.margin = "0";
    const loadScript = (src) =>
      new Promise((resolve) => {
        if (document.querySelector(`script[src='${src}']`)) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = resolve;
        document.body.appendChild(s);
      });

    const loadStyle = (href) => {
      if (document.querySelector(`link[href='${href}']`)) return;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    };

    loadStyle("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css");
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js").then(() => {
      setMapReady(Boolean(window.L));
    });

    const savedUser = localStorage.getItem("travelUser");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
        setCurrentPage("chat");
      } catch {
        localStorage.removeItem("travelUser");
      }
    }
  }, []);

  // Initialize chat on page change
  useEffect(() => {
    if (currentPage !== "chat") return;
    if (chatHistory.length > 0) return;
    setChatHistory([{ sender: "bot", text: questions[currentQuestion] || questions[0] }]);
  }, [currentPage, chatHistory.length, questions, currentQuestion]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatHistory, typing]);

  // Loading animation
  useEffect(() => {
    if (!loadingState) return;
    const statusTimer = window.setInterval(() => {
      setLoadingStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 1500);
    const progressTimer = window.setInterval(() => {
      setLoadingProgress((prev) => Math.min(95, prev + 1));
    }, 85);
    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(progressTimer);
    };
  }, [loadingState]);

  // Suggestion search with debounce
  useEffect(() => {
    const shouldSuggest = currentPage === "chat" && (currentQuestion === 0 || currentQuestion === 1) && textInput.trim().length >= 3;
    if (!shouldSuggest) {
      setSuggestions([]);
      return;
    }

    if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    suggestionTimeoutRef.current = window.setTimeout(async () => {
      try {
        const rows = await searchPlaces(textInput.trim());
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
      }
    }, 350);

    return () => {
      if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    };
  }, [textInput, currentPage, currentQuestion]);

  // Initialize map
  useEffect(() => {
    if (currentPage !== "itinerary" || !mapReady || !mapContainerRef.current || allStops.length === 0) return;

    const initMap = () => {
      try {
        if (mapRef.current) {
          try {
            mapRef.current.remove();
          } catch {}
          mapRef.current = null;
        }
        markersRef.current = {};

        const L = window.L;
        if (!L) return;

        const map = L.map(mapContainerRef.current, { zoomControl: true });
        mapRef.current = map;

        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO",
        }).addTo(map);

        const bounds = [];
        const layer = L.layerGroup();

        allStops.forEach((s) => {
          if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
          const markerHtml = `<div style="width:32px;height:32px;border-radius:50%;background:${s.dayColor};border:2px solid white;display:flex;align-items:center;justify-content:center;font-weight:600;color:white;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${s.globalOrder}</div>`;
          const icon = L.divIcon({ className: "custom-marker-icon", html: markerHtml, iconSize: [32, 32], iconAnchor: [16, 16] });
          const marker = L.marker([s.lat, s.lng], { icon });

          const badge = s.weatherInfo;
          const popup = `
            <div style="min-width:230px;padding:8px;color:#1e293b">
              <div style="font-weight:700;margin-bottom:6px">${s.name || "Stop"}</div>
              <div style="font-size:12px;color:#64748b;margin-bottom:8px">${s.description || ""}</div>
              <div style="font-size:12px;margin-bottom:4px">⏱ ${s.displayDuration || 0} min • 💰 $${s.cost_usd ?? 0}</div>
              <div style="font-size:12px;margin-bottom:4px">🏷 ${s.category || "General"} • ${badge.emoji} ${badge.badge}</div>
              <div style="font-size:11px;font-style:italic;margin-bottom:8px;color:#64748b">${s.pro_tip || ""}</div>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" rel="noreferrer" style="display:inline-block;padding:6px 8px;background:#6366F1;color:white;border-radius:6px;text-decoration:none;font-size:12px;border:none;cursor:pointer">📍 Get Directions</a>
            </div>
          `;
          marker.bindPopup(popup);
          marker.on("click", () => setActiveStopKey(s.key));

          markersRef.current[s.key] = marker;
          layer.addLayer(marker);
          bounds.push([s.lat, s.lng]);
        });

        layer.addTo(map);
        if (bounds.length) map.fitBounds(bounds, { padding: [42, 42] });
      } catch (e) {
        console.error("Map init error:", e);
      }
    };

    const timer = window.setTimeout(initMap, 100);
    return () => clearTimeout(timer);
  }, [currentPage, mapReady, allStops]);

  const startNewTrip = (force = false) => {
    if (itinerary && !force) {
      setResetModalOpen(true);
      return;
    }
    setChatData({
      origin: "",
      destination: "",
      days: null,
      vibes: [],
      group_type: "",
      budget_level: "",
      special_requests: "",
    });
    setChatHistory([]);
    setCurrentQuestion(0);
    setItinerary(null);
    setWeather(null);
    setSuggestions([]);
    setActivePace("balanced");
    setActiveTab("itinerary");
    setErrorState(null);
    setTyping(false);
    setReadyToBuild(false);
    setTextInput("");
    setCurrentPage("chat");
  };

  const submitAnswerText = () => {
    if ((currentQuestion === 0 || currentQuestion === 1) && !textInput.trim()) return;

    if (currentQuestion === 0) {
      setChatData((p) => ({ ...p, origin: textInput.trim() }));
      setChatHistory((prev) => [...prev, { sender: "user", text: textInput.trim() }]);
      goNextQuestion(1);
      return;
    }
    if (currentQuestion === 1) {
      setChatData((p) => ({ ...p, destination: textInput.trim() }));
      setChatHistory((prev) => [...prev, { sender: "user", text: textInput.trim() }]);
      goNextQuestion(2);
      return;
    }
    if (currentQuestion === 6) {
      setChatData((p) => ({ ...p, special_requests: textInput.trim() }));
      setChatHistory((prev) => [...prev, { sender: "user", text: textInput.trim() || "No special requests" }]);
      goNextQuestion(7);
    }
  };

  const selectPlace = (s) => {
    setTextInput(s.city);
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 350);
    if (currentQuestion === 0) {
      setChatData((p) => ({ ...p, origin: s.city }));
    }
    if (currentQuestion === 1) {
      setChatData((p) => ({ ...p, destination: s.city }));
    }
    setSuggestions([]);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          selectPlace(place);
        } catch {
          const fallback = { city: "Current location", label: "Detected from device GPS", lat: pos.coords.latitude, lng: pos.coords.longitude, country: "" };
          selectPlace(fallback);
        }
      },
      () => {}
    );
  };

  const goNextQuestion = (q) => {
    if (q >= questions.length) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setChatHistory((prev) => [...prev, { sender: "bot", text: "Perfect! Let me craft your ideal itinerary ✈️" }]);
        setReadyToBuild(true);
      }, 400);
      return;
    }
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setCurrentQuestion(q);
      setChatHistory((prev) => [...prev, { sender: "bot", text: questions[q] }]);
      setTextInput("");
      setSuggestions([]);
    }, 400);
  };

  const handleBuildTrip = async () => {
    setErrorState(null);
    setLoadingState(true);
    setLoadingStatusIndex(0);
    setLoadingProgress(0);

    try {
      const result = await fetchItinerary(chatData, user?.token || "");
      setLoadingProgress(100);
      setTimeout(() => setLoadingState(false), 250);

      setItinerary(result.trip);
      setCurrentPage("itinerary");

      const wxLat = result.trip?.center_lat;
      const wxLng = result.trip?.center_lng;
      if (wxLat != null && wxLng != null) {
        const w = await fetchWeather(wxLat, wxLng);
        setWeather(w);
      }
    } catch (err) {
      setLoadingState(false);
      setErrorState({
        title: "We couldn't build your itinerary",
        message: mapErrorToMessage(err),
        status: err?.status || null,
      });
    }
  };

  const handleAuth = async () => {
    setAuthError("");
    if (authTab === "register" && authForm.password !== authForm.confirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }

    try {
      const endpoint = authTab === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = authTab === "login"
        ? { email: authForm.email, password: authForm.password }
        : { name: authForm.name, email: authForm.email, password: authForm.password };

      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Authentication failed");
      const data = await res.json();
      const session = { userId: data.userId, token: data.token, name: data.name || "Traveler", isGuest: false };
      localStorage.setItem("travelUser", JSON.stringify(session));
      setUser(session);
      setCurrentPage("chat");
      setAuthForm({ name: "", email: "", password: "", confirmPassword: "" });
    } catch {
      setAuthError("Could not authenticate. Please try again.");
    }
  };

  const logout = () => {
    localStorage.removeItem("travelUser");
    setUser(null);
    setCurrentPage("auth");
    setItinerary(null);
    setWeather(null);
  };

  const copyPacking = async () => {
    const text = packingList.map((i) => `${checkedPacking[i] ? "[x]" : "[ ]"} ${i}`).join("\n");
    await navigator.clipboard.writeText(text);
    alert("Packing list copied!");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        .btn { background:#6366F1;color:#fff;border:none;border-radius:8px;padding:10px 12px;cursor:pointer;font-weight:500;transition:all 0.1s; }
        .btn:active { transform:scale(0.97); }
        .btn.outline { background:transparent;border:1px solid #6366F1;color:#c7d2fe; }
        .chip { border:1px solid #334155;background:transparent;color:#cbd5e1;border-radius:999px;padding:7px 11px;cursor:pointer;transition:all 0.2s;font-size:14px; }
        .chip:hover { background:rgba(99,102,241,.1);border-color:#6366F1; }
        .chip.active { border-color:#818cf8;background:rgba(99,102,241,.25);color:#e0e7ff; }
        .card { background:#1E293B;border:1px solid #334155;border-radius:12px; }
        @keyframes spin3 { 0%,100%{opacity:0.4;} 50%{opacity:1;} }
        .dot { display:inline-block;width:7px;height:7px;border-radius:999px;background:#94A3B8;margin:0 2px;animation:spin3 1.2s infinite; }
        .dot:nth-child(2) { animation-delay:0.2s; }
        .dot:nth-child(3) { animation-delay:0.4s; }
        @keyframes fadeInUp { from { opacity:0;transform:translateY(10px); } to { opacity:1;transform:translateY(0); } }
        @keyframes slideInLeft { from { opacity:0;transform:translateX(-20px); } to { opacity:1;transform:translateX(0); } }
        @keyframes slideInRight { from { opacity:0;transform:translateX(20px); } to { opacity:1;transform:translateX(0); } }
        .page-enter { animation:fadeInUp 0.3s ease; }
        .bubble-left { animation:slideInLeft 0.3s ease; }
        .bubble-right { animation:slideInRight 0.3s ease; }
        @keyframes pulse-ring { 0% { box-shadow:0 0 0 0 rgba(99,102,241,.4); } 70% { box-shadow:0 0 0 8px rgba(99,102,241,0); } 100% { box-shadow:0 0 0 0 rgba(99,102,241,0); } }
        .pulse { animation:pulse-ring 1.5s ease-out infinite; }
        @keyframes slideUnderline { from { width:0; } to { width:100%; } }
        .tab-underline { animation:slideUnderline 0.3s ease; }
      `}</style>

      {currentPage !== "auth" && user && (
        <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(2,6,23,.92)", borderBottom: "1px solid #334155", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="btn outline" onClick={() => startNewTrip()} style={{ border: 0 }}>✈️ TravelMind</button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {currentPage === "itinerary" && <button className="btn outline" onClick={() => startNewTrip()}>← New Trip</button>}
            <button className="btn outline" onClick={() => startNewTrip()}>New Trip</button>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: "#312e81", border: "1px solid #6366F1", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>{initials(user.name)}</div>
            <button className="btn outline" onClick={logout}>Logout</button>
          </div>
        </div>
      )}

      {currentPage === "auth" && (
        <div className="page-enter" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 420, padding: 18 }}>
            <div style={{ textAlign: "center", fontSize: 28, marginBottom: 6 }}>✈️</div>
            <h2 style={{ textAlign: "center", margin: "0 0 14px", fontWeight: 500 }}>TravelMind</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <button className={`chip ${authTab === "login" ? "active" : ""}`} onClick={() => setAuthTab("login")}>Login</button>
              <button className={`chip ${authTab === "register" ? "active" : ""}`} onClick={() => setAuthTab("register")}>Register</button>
            </div>
            {authTab === "register" && (
              <input placeholder="Full name" value={authForm.name} onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))} style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }} />
            )}
            <input placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }} />
            <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }} />
            {authTab === "register" && (
              <input type="password" placeholder="Confirm password" value={authForm.confirmPassword} onChange={(e) => setAuthForm((p) => ({ ...p, confirmPassword: e.target.value }))} style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }} />
            )}
            <button className="btn" style={{ width: "100%", marginBottom: 12 }} onClick={handleAuth}>{authTab === "login" ? "Login" : "Register"}</button>
            {authError && <p style={{ color: "#fca5a5", fontSize: 12, margin: 0 }}>{authError}</p>}
          </div>
        </div>
      )}

      {currentPage === "chat" && (
        <div className="page-enter" style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
          <h1 style={{ fontWeight: 300, textAlign: "center", margin: "8px 0 10px", fontSize: 28 }}>Where do you want to go?</h1>
          <div style={{ height: 4, borderRadius: 999, background: "#1E293B", overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg,#6366F1,#818CF8)", transition: "width 0.3s ease" }} />
          </div>
          <div className="card" style={{ padding: 12, maxHeight: "50vh", overflowY: "auto" }}>
            {chatHistory.map((m, i) => (
              <div
                key={i}
                className={m.sender === "user" ? "bubble-right" : "bubble-left"}
                style={{
                  maxWidth: "84%",
                  margin: "8px 0",
                  marginLeft: m.sender === "user" ? "auto" : 0,
                  background: m.sender === "user" ? "linear-gradient(135deg,#4F46E5,#6366F1)" : "#111827",
                  border: "1px solid #334155",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {m.text}
              </div>
            ))}
            {typing && (
              <div style={{ background: "#111827", border: "1px solid #334155", borderRadius: 12, display: "inline-block", padding: "8px 10px" }}>
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            {[0, 1, 6].includes(currentQuestion) && (
              <div style={{ position: "relative" }}>
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (suggestions.length > 0) {
                        selectPlace(suggestions[0]);
                        return;
                      }
                      submitAnswerText();
                    }
                  }}
                  placeholder={currentQuestion === 6 ? "e.g. no spicy food, wheelchair accessible..." : "Type your answer..."}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${inputFlash ? "#22c55e" : "#334155"}`,
                    boxShadow: inputFlash ? "0 0 0 2px rgba(34,197,94,.25)" : "none",
                    background: "#0b1220",
                    color: "#e2e8f0",
                    fontSize: 14,
                    transition: "all 0.2s",
                  }}
                />
                {(currentQuestion === 0 || currentQuestion === 1) && (
                  <button className="btn outline" onClick={useCurrentLocation} style={{ marginTop: 8, width: "100%", fontSize: 14 }}>
                    📍 Use current location
                  </button>
                )}
                {suggestions.length > 0 && (currentQuestion === 0 || currentQuestion === 1) && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1E293B", border: "0.5px solid #334155", borderRadius: 10, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.4)", marginTop: 4 }}>
                    {suggestions.map((s, i) => (
                      <div
                        key={`${s.label}-${i}`}
                        onClick={() => selectPlace(s)}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          background: i === 0 ? "#334155" : "transparent",
                          color: "#F1F5F9",
                          borderBottom: "0.5px solid #1E293B",
                          display: "flex",
                          gap: 10,
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span>📍</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{s.city}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#64748B" }}>{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn" style={{ marginTop: 10, width: "100%", fontSize: 14 }} onClick={submitAnswerText}>
                  Continue
                </button>
              </div>
            )}

            {currentQuestion === 2 && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {[3, 5, 7, 10].map((d) => (
                    <button
                      key={d}
                      className="chip"
                      onClick={() => {
                        setChatData((p) => ({ ...p, days: d }));
                        setChatHistory((prev) => [...prev, { sender: "user", text: `${d} days` }]);
                        goNextQuestion(3);
                      }}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
                <div style={{ position: "relative" }}>
                  <label style={{ display: "block", fontSize: 12, color: "#94A3B8", marginBottom: 8 }}>Or enter custom days</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={textInput || ""}
                    onChange={(e) => setTextInput(e.target.value)}
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "#0b1220", color: "#e2e8f0" }}
                  />
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "100%", fontSize: 14 }}
                    onClick={() => {
                      if (textInput && Number(textInput) > 0) {
                        setChatData((p) => ({ ...p, days: Number(textInput) }));
                        setChatHistory((prev) => [...prev, { sender: "user", text: `${textInput} days` }]);
                        goNextQuestion(3);
                      }
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {currentQuestion === 3 && (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {["Culture", "Nature", "Food", "Nightlife", "Wellness", "Shopping"].map((v) => (
                    <button
                      key={v}
                      className={`chip ${chatData.vibes.includes(v) ? "active" : ""}`}
                      onClick={() => setChatData((p) => ({ ...p, vibes: p.vibes.includes(v) ? p.vibes.filter((x) => x !== v) : [...p.vibes, v] }))}
                    >
                      {v === "Culture" && "🏛️"} {v === "Nature" && "🌿"} {v === "Food" && "🍜"} {v === "Nightlife" && "🎉"} {v === "Wellness" && "🧘"} {v === "Shopping" && "🛍️"} {v}
                    </button>
                  ))}
                </div>
                <button
                  className="btn"
                  style={{ width: "100%", fontSize: 14 }}
                  onClick={() => {
                    setChatHistory((prev) => [...prev, { sender: "user", text: chatData.vibes.join(", ") || "No preference" }]);
                    goNextQuestion(4);
                  }}
                >
                  Continue
                </button>
              </div>
            )}

            {currentQuestion === 4 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Solo", "Couple", "Family", "Friends"].map((g) => (
                  <button
                    key={g}
                    className="chip"
                    onClick={() => {
                      setChatData((p) => ({ ...p, group_type: g }));
                      setChatHistory((prev) => [...prev, { sender: "user", text: g }]);
                      goNextQuestion(5);
                    }}
                  >
                    {g === "Solo" && "🧑"} {g === "Couple" && "👫"} {g === "Family" && "👨‍👩‍👧‍👦"} {g === "Friends" && "👫👫"} {g}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion === 5 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Budget", "Mid-range", "Comfort", "Luxury"].map((b) => (
                  <button
                    key={b}
                    className="chip"
                    onClick={() => {
                      setChatData((p) => ({ ...p, budget_level: b }));
                      setChatHistory((prev) => [...prev, { sender: "user", text: b }]);
                      goNextQuestion(6);
                    }}
                  >
                    {b === "Budget" && "$"} {b === "Mid-range" && "$$"} {b === "Comfort" && "$$$"} {b === "Luxury" && "$$$$"} {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          {readyToBuild && (
            <button className="btn" style={{ width: "100%", marginTop: 12, fontSize: 16, fontWeight: 600, padding: "12px 16px" }} onClick={handleBuildTrip}>
              Build My Itinerary →
            </button>
          )}

          {errorState && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{errorState.title}</h3>
              <p style={{ margin: "0 0 10px", color: "#94A3B8", fontSize: 14 }}>{errorState.message}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ fontSize: 13 }} onClick={handleBuildTrip}>
                  Try Again
                </button>
                <button className="btn outline" style={{ fontSize: 13 }} onClick={() => startNewTrip(true)}>
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentPage === "itinerary" && itinerary && (
        <div className="page-enter" style={{ maxWidth: 1400, margin: "0 auto", padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "42% 58%", gap: 12, minHeight: "calc(100vh - 100px)" }}>
            <div className="card" style={{ maxHeight: "calc(100vh - 100px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              <div style={{ background: "#111827", borderBottom: "1px solid #334155", padding: 12, flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>✈️ {itinerary.origin} → {itinerary.destination}</div>
                <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 10 }}>{itinerary.duration_days} days • {(itinerary.vibes || []).join(", ") || "Mixed vibes"} • {itinerary.group_type}</div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {["relaxed", "balanced", "fastpaced"].map((pace) => (
                    <button
                      key={pace}
                      className={`chip ${activePace === pace ? "active" : ""}`}
                      onClick={() => setActivePace(pace)}
                      style={{ fontSize: 13 }}
                    >
                      {pace === "relaxed" && "🐢"} {pace === "balanced" && "⚡"} {pace === "fastpaced" && "🚀"} {pace.charAt(0).toUpperCase() + pace.slice(1)}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {["itinerary", "hotels", "food", "pack"].map((tab) => (
                    <button
                      key={tab}
                      className={`chip ${activeTab === tab ? "active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                      style={{ fontSize: 13 }}
                    >
                      {tab === "itinerary" && "📅"} {tab === "hotels" && "🏨"} {tab === "food" && "🍜"} {tab === "pack" && "🎒"} {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["USD", "INR", "EUR", "AED", "GBP"].map((curr) => (
                    <button
                      key={curr}
                      className={`chip ${activeCurrency === curr ? "active" : ""}`}
                      onClick={() => setActiveCurrency(curr)}
                      style={{ fontSize: 12 }}
                    >
                      {curr} {currencySymbols[curr]}
                    </button>
                  ))}
                </div>

                {weather?.current_weather && (
                  <div style={{ marginTop: 10, display: "inline-flex", gap: 6, alignItems: "center", padding: "6px 10px", borderRadius: 999, background: "rgba(99,102,241,.18)", border: "1px solid #6366F1", fontSize: 12 }}>
                    <span>{weatherInfoFromCode(weather.current_weather.weathercode).emoji} {Math.round(weather.current_weather.temperature)}°C</span>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                {activeTab === "itinerary" &&
                  itineraryDays.map((d, idx) => {
                    const dayStops = allStops.filter((s) => s.day === d.day);
                    return (
                      <div key={d.day} className="card" style={{ marginBottom: 10, borderLeft: `4px solid ${dayColors[idx % dayColors.length]}` }}>
                        <button
                          onClick={() => setExpandedDays((p) => ({ ...p, [d.day]: !p[d.day] }))}
                          style={{
                            width: "100%",
                            background: "transparent",
                            color: "#F1F5F9",
                            border: 0,
                            textAlign: "left",
                            padding: 10,
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 14,
                            fontWeight: 500,
                          }}
                        >
                          <span>Day {d.day} • {d.title}</span>
                          <span>{expandedDays[d.day] ? "▾" : "▸"}</span>
                        </button>
                        {expandedDays[d.day] && (
                          <div style={{ padding: "0 10px 10px" }}>
                            {dayStops.map((s, i) => {
                              const w = weatherInfoFromCode(weather?.daily?.weathercode?.[(s.day || 1) - 1]);
                              return (
                                <div
                                  key={s.key}
                                  onClick={() => {
                                    setActiveStopKey(s.key);
                                    if (mapRef.current) mapRef.current.flyTo([s.lat, s.lng], 13);
                                  }}
                                  style={{
                                    marginTop: 8,
                                    borderRadius: 10,
                                    borderLeft: activeStopKey === s.key ? "3px solid #6366F1" : "3px solid #334155",
                                    background: "#0b1220",
                                    padding: 10,
                                    cursor: "pointer",
                                    transform: activeStopKey === s.key ? "translateY(-2px)" : "none",
                                    transition: "all 0.2s",
                                    fontSize: 13,
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                    <div style={{ fontWeight: 500 }}> {i + 1}. {s.name}</div>
                                    <div style={{ fontSize: 11, color: "#fff", background: w.type === "clear" ? "#10B981" : w.type === "rain" ? "#F59E0B" : "#94A3B8", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                                      {w.emoji} {w.badge}
                                    </div>
                                  </div>
                                  <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4 }}>{s.description}</div>
                                  <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 3 }}>⏱ {s.displayArrival} • {s.displayDuration}m • 💰 {currencySymbols[activeCurrency]}{convertPrice(s.cost_usd ?? 0, activeCurrency)}</div>
                                  {s.pro_tip && <div style={{ fontSize: 12, color: "#c4b5fd", fontStyle: "italic", marginBottom: 3 }}>💡 {s.pro_tip}</div>}
                                  <div style={{ fontSize: 12, color: "#a5b4fc", fontStyle: "italic" }}>{s.weatherHint}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                {activeTab === "hotels" &&
                  itineraryDays.map((d) => (
                    <div key={`h-${d.day}`} className="card" style={{ marginBottom: 10, padding: 10 }}>
                      <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>Day {d.day} Hotels</div>
                      {(d.hotels || []).map((h, i) => (
                        <div key={`h-${d.day}-${i}`} style={{ padding: 8, borderRadius: 8, background: "#0b1220", marginBottom: 8, fontSize: 13 }}>
                          <div style={{ fontWeight: 500 }}>{h.name}</div>
                          <div style={{ color: "#F59E0B" }}>{"★".repeat(h.stars || 3)}</div>
                          <div>{currencySymbols[activeCurrency]}{convertPrice(h.price_usd ?? 0, activeCurrency)}/night</div>
                          <a href={h.booking_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, padding: "4px 8px", background: "#6366F1", color: "#fff", borderRadius: 6, textDecoration: "none", fontSize: 11 }}>
                            Book Now →
                          </a>
                        </div>
                      ))}
                    </div>
                  ))}

                {activeTab === "food" &&
                  (() => {
                    const allFood = itineraryDays.flatMap((d) => d.food || []);
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {allFood.map((f, i) => (
                          <div key={i} className="card" style={{ padding: 8 }}>
                            <div style={{ fontSize: 24, marginBottom: 4 }}>{f.emoji}</div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</div>
                            <div style={{ color: "#94A3B8", fontSize: 11 }}>{f.restaurant}</div>
                            <div style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>{currencySymbols[activeCurrency]}{convertPrice(f.cost_usd ?? 0, activeCurrency)}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                {activeTab === "pack" && (
                  <div className="card" style={{ padding: 10 }}>
                    <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 14 }}>Packing Checklist</div>
                    <div style={{ marginBottom: 10 }}>
                      {packingList.map((item) => (
                        <label
                          key={item}
                          style={{
                            display: "block",
                            marginBottom: 6,
                            textDecoration: checkedPacking[item] ? "line-through" : "none",
                            opacity: checkedPacking[item] ? 0.6 : 1,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(checkedPacking[item])}
                            onChange={() => setCheckedPacking((p) => ({ ...p, [item]: !p[item] }))}
                            style={{ marginRight: 8, cursor: "pointer" }}
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                    <button className="btn outline" onClick={copyPacking} style={{ fontSize: 13, width: "100%" }}>
                      Copy List
                    </button>
                  </div>
                )}
              </div>

              {activeTab === "itinerary" && (
                <div style={{ borderTop: "1px solid #334155", padding: 12, flexShrink: 0, background: "#111827" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Trip Cost Estimate</div>
                  {itineraryDays.map((d) => {
                    const hotelsCost = (d.hotels || []).reduce((s, h) => s + (h.price_usd || 0), 0);
                    const foodCost = (d.food || []).reduce((s, f) => s + (f.cost_usd || 0), 0);
                    const stopsCost = (d.stops || []).reduce((s, st) => s + (st.cost_usd || 0), 0);
                    return (
                      <div key={d.day} style={{ fontSize: 12, marginBottom: 6 }}>
                        <div>🏨 Day {d.day} hotels: {currencySymbols[activeCurrency]}{convertPrice(hotelsCost, activeCurrency)}</div>
                        <div>🍜 Day {d.day} food: {currencySymbols[activeCurrency]}{convertPrice(foodCost, activeCurrency)}</div>
                        <div>🎯 Day {d.day} activities: {currencySymbols[activeCurrency]}{convertPrice(stopsCost, activeCurrency)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card" style={{ position: "relative", minHeight: 680 }}>
              <div ref={mapContainerRef} style={{ width: "100%", height: "100%", minHeight: 680 }} />
              <div style={{ position: "absolute", top: 10, right: 10, zIndex: 5, padding: "6px 10px", borderRadius: 999, background: "rgba(15,23,42,.9)", border: "1px solid #334155", fontSize: 12 }}>
                📍 {itinerary.destination} {weather?.current_weather ? `${weatherInfoFromCode(weather.current_weather.weathercode).emoji} ${Math.round(weather.current_weather.temperature)}°C` : ""}
              </div>
              <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, display: "flex", overflowX: "auto", gap: 8, zIndex: 4 }}>
                {weatherStrip.map((w) => (
                  <div key={w.key} style={{ minWidth: 80, padding: "6px 8px", borderRadius: 8, background: "rgba(15,23,42,.86)", border: "1px solid #334155", fontSize: 12, whiteSpace: "nowrap" }}>
                    {w.label} {w.emoji} {w.temp}°
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loadingState && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(2,6,23,.95)", display: "grid", placeItems: "center" }}>
          <div className="card" style={{ width: "min(560px, 92vw)", padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✈️</div>
            <div style={{ height: 4, borderRadius: 999, background: "#1E293B", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ height: "100%", width: `${loadingProgress}%`, background: "#6366F1", transition: "width 0.1s" }} />
            </div>
            <div style={{ fontSize: 16, marginBottom: 10, minHeight: 20, color: "#cbd5e1" }}>{STATUS_MESSAGES[loadingStatusIndex]}</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>{Math.min(100, loadingProgress)}% ready</div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}>
          <div className="card" style={{ padding: 16, maxWidth: 400 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Start a new trip?</h3>
            <p style={{ margin: "0 0 16px", color: "#94A3B8", fontSize: 14 }}>Your current plan will be cleared.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn outline" style={{ flex: 1, fontSize: 13 }} onClick={() => setResetModalOpen(false)}>
                Cancel
              </button>
              <button className="btn" style={{ flex: 1, fontSize: 13 }} onClick={() => { setResetModalOpen(false); startNewTrip(true); }}>
                Yes, start fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
