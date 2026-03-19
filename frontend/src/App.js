import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const DAY_COLORS = ['#6366F1','#0EA5E9','#10B981','#F59E0B','#F43F5E','#8B5CF6','#EC4899'];
const EXCHANGE = { USD:1, INR:83.5, EUR:0.92, GBP:0.79, AED:3.67, SGD:1.34, JPY:149.5, THB:35.2 };
const SYM = { USD:'$', INR:'₹', EUR:'€', GBP:'£', AED:'د.إ', SGD:'S$', JPY:'¥', THB:'฿' };
const CAT_GRAD = {
  Nature:'linear-gradient(135deg,#10B981,#059669)',
  Culture:'linear-gradient(135deg,#6366F1,#4F46E5)',
  Food:'linear-gradient(135deg,#F59E0B,#D97706)',
  Shopping:'linear-gradient(135deg,#EC4899,#DB2777)',
  Nightlife:'linear-gradient(135deg,#8B5CF6,#7C3AED)',
  Adventure:'linear-gradient(135deg,#0EA5E9,#0284C7)',
  Leisure:'linear-gradient(135deg,#F43F5E,#E11D48)',
};
const CAT_EMOJI = { Nature:'🌿', Culture:'🏛️', Food:'🍜', Shopping:'🛍️', Nightlife:'🎉', Adventure:'⛰️', Leisure:'🏖️' };
const WX_MAP = {
  0:{e:'☀️',b:'Perfect today',c:'#10B981'}, 1:{e:'☀️',b:'Perfect today',c:'#10B981'},
  2:{e:'⛅',b:'Good to go',c:'#94A3B8'}, 3:{e:'⛅',b:'Good to go',c:'#94A3B8'},
  45:{e:'🌫️',b:'Foggy',c:'#94A3B8'}, 51:{e:'🌧️',b:'Carry umbrella',c:'#F59E0B'},
  61:{e:'🌧️',b:'Carry umbrella',c:'#F59E0B'}, 63:{e:'🌧️',b:'Heavy rain',c:'#F43F5E'},
  71:{e:'❄️',b:'Dress warm',c:'#0EA5E9'}, 77:{e:'❄️',b:'Snowy',c:'#0EA5E9'},
  80:{e:'⛈️',b:'Check before going',c:'#EF4444'}, 95:{e:'⛈️',b:'Storm warning',c:'#EF4444'},
};
const PACE = { relaxed:1.5, balanced:1.0, fastpaced:0.7 };
const LOADING_MSGS = [
  'Talking to your AI travel agents…',
  'Scouting the best spots in {dest}…',
  'Checking local weather and conditions…',
  'Finding restaurants matching your vibe…',
  'Comparing hotels within your budget…',
  'Optimizing your route for minimal travel time…',
  'Almost ready — finalizing your perfect itinerary…'
];
const PACKING = {
  always:['Passport','Travel insurance','Phone charger','Earphones','Emergency cash','Offline maps'],
  hot:['Sunscreen SPF 50+','Sunglasses','Light cotton clothes','Reusable water bottle'],
  cold:['Warm jacket','Thermal innerwear','Waterproof boots'],
  rain:['Compact umbrella','Waterproof bag cover','Quick-dry clothes'],
  snow:['Heavy jacket','Thermal layers','Waterproof gloves','Snow boots'],
  Nature:['Trekking shoes','Insect repellent','First aid kit','Power bank'],
  Culture:['Modest clothing','Walking shoes','Camera','Notebook'],
  Food:['Antacids','Food diary app','Loose pants 😄'],
  Nightlife:['Smart casual outfit','ID proof','Portable charger'],
  Wellness:['Yoga mat','Meditation app','Essential oils'],
  Shopping:['Extra luggage bag','Budget tracker app'],
  Family:['Kids snacks','Wet wipes','Baby essentials'],
  Solo:['Hostel padlock','Whistle','VPN app'],
  Couple:['Romantic outfit','Shared itinerary app'],
  Friends:['Group playlist','Portable speaker'],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const conv = (usd, cur) => usd ? Math.round((usd||0) * EXCHANGE[cur]) : 0;
const initials = n => String(n||'T').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('') || 'T';
const wxFor = code => {
  const c = Number(code);
  if (c <= 1) return WX_MAP[0];
  if (c <= 3) return WX_MAP[2];
  if (c === 45) return WX_MAP[45];
  if (c <= 55) return WX_MAP[51];
  if (c <= 65) return WX_MAP[61];
  if (c <= 67) return WX_MAP[63];
  if (c <= 77) return WX_MAP[71];
  if (c <= 82) return WX_MAP[80];
  return WX_MAP[95];
};

const getWeekday = (i) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7];

function buildPacking(itin, wx) {
  const set = new Set(PACKING.always);
  if (!itin) return [...set];
  const maxT = Math.max(...(wx?.daily?.temperature_2m_max||[24]));
  const minT = Math.min(...(wx?.daily?.temperature_2m_min||[18]));
  const rain = Math.max(...(wx?.daily?.precipitation_probability_max||[0]));
  if (maxT > 30) PACKING.hot.forEach(i=>set.add(i));
  if (minT < 10) PACKING.cold.forEach(i=>set.add(i));
  if (rain > 60) PACKING.rain.forEach(i=>set.add(i));
  (itin.vibes||[]).forEach(v => (PACKING[v]||[]).forEach(i=>set.add(i)));
  (PACKING[itin.group_type]||[]).forEach(i=>set.add(i));
  if ((itin.duration_days||0)>5) { set.add('Laundry bag'); set.add('Extra memory card'); }
  return [...set];
}

function computeStopTimes(stops, pace) {
  let cur = 9 * 60; // 9:00 AM in minutes
  return stops.map(s => {
    const dur = Math.round((s.duration_minutes||60) * PACE[pace]);
    const arrival = cur;
    cur += dur + 20; // 20 min travel buffer
    const h = Math.floor(arrival/60) % 12 || 12;
    const m = String(arrival%60).padStart(2,'0');
    const ap = arrival >= 12*60 ? 'PM' : 'AM';
    return { ...s, _arrival: `${h}:${m} ${ap}`, _dur: dur };
  });
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Ripple({ x, y, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 600); return () => clearTimeout(t); }, [onDone]);
  return (
    <span style={{
      position:'absolute', left:x-50, top:y-50,
      width:100, height:100, borderRadius:'50%',
      background:'rgba(255,255,255,0.25)',
      animation:'ripple 0.6s ease-out forwards',
      pointerEvents:'none',
    }}/>
  );
}

function RippleBtn({ onClick, children, style, className }) {
  const [ripples, setRipples] = useState([]);
  const ref = useRef(null);
  const handleClick = e => {
    const rect = ref.current.getBoundingClientRect();
    const id = Date.now();
    setRipples(r => [...r, { id, x: e.clientX-rect.left, y: e.clientY-rect.top }]);
    onClick && onClick(e);
  };
  return (
    <button ref={ref} onClick={handleClick} className={className}
      style={{ position:'relative', overflow:'hidden', ...style }}>
      {children}
      {ripples.map(r => <Ripple key={r.id} x={r.x} y={r.y} onDone={()=>setRipples(p=>p.filter(x=>x.id!==r.id))}/>)}
    </button>
  );
}

function TypingDots() {
  return (
    <div style={{ display:'flex', gap:6, padding:'14px 18px', background:'#1E293B', borderRadius:16, borderBottomLeftRadius:4, display:'inline-flex', alignItems:'center' }}>
      {[0,1,2].map(i=>(
        <span key={i} style={{ width:8, height:8, borderRadius:'50%', background:'#6366F1', display:'block', animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>
      ))}
    </div>
  );
}

function QualityBadge({ rating }) {
  if (!rating) return null;
  if (rating >= 4.8) return <span style={{ background:'rgba(245,158,11,0.15)', color:'#F59E0B', fontSize:11, padding:'3px 8px', borderRadius:20, fontWeight:500, whiteSpace:'nowrap' }}>⭐ Must Visit</span>;
  if (rating >= 4.5) return <span style={{ background:'rgba(16,185,129,0.15)', color:'#10B981', fontSize:11, padding:'3px 8px', borderRadius:20, fontWeight:500, whiteSpace:'nowrap' }}>👍 Highly Rated</span>;
  return <span style={{ background:'rgba(148,163,184,0.15)', color:'#94A3B8', fontSize:11, padding:'3px 8px', borderRadius:20, fontWeight:500, whiteSpace:'nowrap' }}>✓ Recommended</span>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Page & Auth ──
  const [page, setPage] = useState('auth');
  const [user, setUser] = useState(null);
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ name:'', email:'', password:'', confirm:'' });
  const [authErr, setAuthErr] = useState('');

  // ── Chat ──
  const [chatData, setChatData] = useState({
    origin:'', destination:'', originLat:null, originLng:null,
    destLat:null, destLng:null, days:null,
    comfort_radius:'', vibes:[], group_type:'', budget_level:'', special_requests:''
  });
  const [history, setHistory] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [sugg, setSugg] = useState([]);
  const [suggLoad, setSuggLoad] = useState(false);
  const [hovSugg, setHovSugg] = useState(-1);
  const [selSugg, setSelSugg] = useState(-1);
  const [inputFlash, setInputFlash] = useState(false);
  const [readyBuild, setReadyBuild] = useState(false);
  const [customBudget, setCustomBudget] = useState('');
  const [showCustomBudget, setShowCustomBudget] = useState(false);

  // ── Itinerary ──
  const [itin, setItin] = useState(null);
  const [weather, setWeather] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);
  const [activeDay, setActiveDay] = useState(1);
  const [activeCur, setActiveCur] = useState('USD');
  const [activePace, setActivePace] = useState('balanced');
  const [activeTab, setActiveTab] = useState('itinerary');
  const [drawer, setDrawer] = useState(null);
  const [activeStop, setActiveStop] = useState(null);
  const [checkedPack, setCheckedPack] = useState({});
  const [transportModes, setTransportModes] = useState({});
  const [expandedDays, setExpandedDays] = useState({});
  const [completedStops, setCompletedStops] = useState({});

  // ── UI ──
  const [loading, setLoading] = useState(false);
  const [loadIdx, setLoadIdx] = useState(0);
  const [loadProg, setLoadProg] = useState(0);
  const [error, setError] = useState(null);
  const [resetModal, setResetModal] = useState(false);
  const [pendingReset, setPendingReset] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapLayer, setMapLayer] = useState('dark');
  const [dayTransition, setDayTransition] = useState(false);
  const [showComparisons, setShowComparisons] = useState(false);

  // ── Refs ──
  const mapRef = useRef(null);
  const mapEl = useRef(null);
  const markersRef = useRef({});
  const polylinesRef = useRef([]);
  const chatEnd = useRef(null);
  const suggTimer = useRef(null);

  const QUESTIONS = useMemo(() => [
    `Hey${user?.name ? ' ' + user.name.split(' ')[0] : ''}! Where are you starting your journey from?`,
    "Amazing! And where's the dream destination?",
    "How many days are you thinking?",
    "How far are you comfortable traveling each day?",
    "What's your travel vibe? Pick all that apply!",
    "Who's joining you on this trip?",
    "What's your daily budget per person?",
    "Any special requests or things to avoid? (optional)"
  ], [user]);

  const TOTAL_QUESTIONS = 8;
  const progPct = Math.round((qIdx / TOTAL_QUESTIONS) * 100);

  const radiusOptions = useMemo(() => [
    { icon:'🚶', label:'Walkable', sub:'Under 5 km/day', value:'walkable' },
    { icon:'🚗', label:'City Range', sub:'5–20 km/day', value:'city' },
    { icon:'🛣️', label:'Regional', sub:'20–50 km/day', value:'regional' },
    { icon:'✈️', label:'Flexible', sub:'No limit', value:'flexible' },
  ], []);

  const budgetOptions = useMemo(() => [
    {
      icon: '🎒',
      label: 'Budget',
      sub: 'Under $25/day',
      value: 'Budget',
      range: '$0–25',
      examples: 'Hostels, street food, public transport',
      color: '#10B981'
    },
    {
      icon: '🏨',
      label: 'Mid-range',
      sub: '$25–75/day',
      value: 'Mid-range',
      range: '$25–75',
      examples: '3-star hotels, local restaurants, taxis',
      color: '#0EA5E9'
    },
    {
      icon: '✨',
      label: 'Comfort',
      sub: '$75–150/day',
      value: 'Comfort',
      range: '$75–150',
      examples: '4-star hotels, fine dining, private tours',
      color: '#8B5CF6'
    },
    {
      icon: '👑',
      label: 'Luxury',
      sub: '$150+/day',
      value: 'Luxury',
      range: '$150+',
      examples: '5-star resorts, Michelin dining, VIP access',
      color: '#F59E0B'
    },
  ], []);

  const budgetRangeMap = useMemo(() => ({
    Budget: { min: 0, max: 25 },
    'Mid-range': { min: 25, max: 75 },
    Comfort: { min: 75, max: 150 },
    Luxury: { min: 150, max: null },
  }), []);
  const packingList = useMemo(() => buildPacking(itin, weather), [itin, weather]);

  const dayStops = useMemo(() => {
    if (!itin?.days) return [];
    const day = itin.days.find(d => d.day === activeDay);
    if (!day?.stops) return [];
    return computeStopTimes(day.stops.slice(0, 4), activePace);
  }, [itin, activeDay, activePace]);

  const currentDayData = useMemo(() => itin?.days?.find(d=>d.day===activeDay), [itin, activeDay]);

  const totalCost = useMemo(() => {
    if (!itin?.days) return { hotels:0, food:0, activities:0, transport:0 };
    let hotels=0, food=0, activities=0, transport=0;
    itin.days.forEach(day => {
      const h = day.hotels?.[0]?.price_usd || 0;
      hotels += h;
      food += (day.food||[]).reduce((a,f)=>a+(f.cost_usd||0),0) * 2;
      activities += (day.stops||[]).reduce((a,s)=>a+(s.cost_usd||0),0);
      transport += 15;
    });
    return { hotels, food, activities, transport };
  }, [itin]);

  const grandTotal = totalCost.hotels + totalCost.food + totalCost.activities + totalCost.transport;

  // ── Effects ──
  useEffect(() => {
    const su = localStorage.getItem('travelUser');
    const gu = sessionStorage.getItem('travelGuest');
    if (su) { const u = JSON.parse(su); setUser(u); setPage('dashboard'); }
    else if (gu) { const u = JSON.parse(gu); setUser(u); setPage('dashboard'); }

    // Inject Leaflet
    const lc = document.createElement('link');
    lc.rel = 'stylesheet';
    lc.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(lc);
    const ls = document.createElement('script');
    ls.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    ls.async = true;
    ls.onload = () => setMapReady(true);
    document.head.appendChild(ls);
  }, []);

  useEffect(() => {
    if (page === 'chat' && history.length === 0) {
      setTimeout(() => setHistory([{ from:'bot', text: QUESTIONS[0] }]), 400);
    }
  }, [page]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [history, typing]);

  useEffect(() => {
    if (!loading) return;
    const si = setInterval(() => setLoadIdx(p => (p+1) % LOADING_MSGS.length), 1500);
    const pi = setInterval(() => setLoadProg(p => Math.min(95, p+1)), 80);
    return () => { clearInterval(si); clearInterval(pi); };
  }, [loading]);

  useEffect(() => {
    if (page !== 'chat' || (qIdx !== 0 && qIdx !== 1) || textInput.trim().length < 3) {
      setSugg([]); setSelSugg(-1); return;
    }
    clearTimeout(suggTimer.current);
    suggTimer.current = setTimeout(async () => {
      setSuggLoad(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(textInput)}&format=json&limit=5&addressdetails=1`, { headers:{'Accept-Language':'en'} });
        const d = await r.json();
        setSugg(d.map(p => ({
          label: p.display_name.split(',').slice(0,3).join(','),
          lat: Number(p.lat), lng: Number(p.lon),
          city: p.address?.city || p.address?.town || p.address?.village || textInput,
          country: p.address?.country
        })));
      } catch { setSugg([]); } finally { setSuggLoad(false); }
    }, 350);
  }, [textInput, page, qIdx]);

  // Map init / update on activeDay change
  useEffect(() => {
    if (page !== 'itinerary' || !mapReady || !mapEl.current || !itin) return;
    const L = window.L;
    if (!L) return;

    const initMap = () => {
      if (!mapRef.current) {
        mapRef.current = L.map(mapEl.current, { zoomControl: false }).setView([itin.center_lat||20, itin.center_lng||0], 12);
        updateMapLayer(L);
        L.control.zoom({ position:'bottomright' }).addTo(mapRef.current);
      }
      renderDayOnMap(L);
    };

    try { initMap(); } catch(e) { console.error(e); }
  }, [page, mapReady, itin]);

  useEffect(() => {
    if (!mapRef.current || !itin || !mapReady) return;
    const L = window.L;
    if (!L) return;
    try { renderDayOnMap(L); } catch(e) {}
  }, [activeDay, mapLayer]);

  const updateMapLayer = (L) => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer(l => { if (l._url) mapRef.current.removeLayer(l); });
    const tiles = {
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    };
    L.tileLayer(tiles[mapLayer] || tiles.dark, { attribution:'© Map', maxZoom:19 }).addTo(mapRef.current);
  };

  const renderDayOnMap = useCallback((L) => {
    if (!mapRef.current || !itin) return;
    // Clear existing
    Object.values(markersRef.current).forEach(m => { try { mapRef.current.removeLayer(m); } catch{} });
    polylinesRef.current.forEach(p => { try { mapRef.current.removeLayer(p); } catch{} });
    markersRef.current = {};
    polylinesRef.current = [];

    updateMapLayer(L);

    const day = itin.days?.find(d => d.day === activeDay);
    if (!day?.stops?.length) return;
    const stops = day.stops.slice(0,4);
    const color = DAY_COLORS[(activeDay-1) % DAY_COLORS.length];
    const bounds = [];

    stops.forEach((stop, i) => {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
      const isActive = activeStop === `${activeDay}-${i}`;
      const html = `<div style="width:${isActive?38:32}px;height:${isActive?38:32}px;border-radius:50%;background:${color};border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.5);cursor:pointer;transition:all 0.2s;">${i+1}</div>`;
      const icon = L.divIcon({ html, className:'', iconSize:[38,38], iconAnchor:[19,19] });
      const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(mapRef.current);
      const popHtml = `<div style="font-family:system-ui;min-width:180px;"><strong style="font-size:14px;">${stop.name}</strong><br/><span style="color:#64748b;font-size:12px;">${stop.category||''} • ⏱ ${stop.duration_minutes||60}min</span><br/><a href="https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}" target="_blank" style="color:#6366F1;font-size:12px;text-decoration:none;display:block;margin-top:6px;">📍 Navigate here ↗</a></div>`;
      marker.bindPopup(popHtml, { maxWidth:220 });
      marker.on('click', () => {
        setActiveStop(`${activeDay}-${i}`);
        setDrawer(stop);
      });
      markersRef.current[`${activeDay}-${i}`] = marker;
      bounds.push([stop.lat, stop.lng]);

      // Travel connector line
      if (i < stops.length - 1) {
        const next = stops[i+1];
        if (Number.isFinite(next.lat) && Number.isFinite(next.lng)) {
          const mode = transportModes[`${activeDay}-${i}`] || 'drive';
          const dashArr = mode==='walk' ? '8,8' : mode==='transit' ? '4,4' : null;
          const pl = L.polyline([[stop.lat,stop.lng],[next.lat,next.lng]], {
            color, weight:3, opacity:0.75, ...(dashArr ? { dashArray:dashArr } : {})
          }).addTo(mapRef.current);
          polylinesRef.current.push(pl);
        }
      }
    });

    if (bounds.length > 1) mapRef.current.fitBounds(bounds, { padding:[60,60] });
    else if (bounds.length === 1) mapRef.current.setView(bounds[0], 14);
  }, [itin, activeDay, activeStop, transportModes, mapLayer]);

  // ── Auth ──
  const handleAuth = async () => {
    setAuthErr('');
    if (!authForm.email || !authForm.password) {
      setAuthErr('Email and password are required.');
      return;
    }
    if (authTab==='register' && !authForm.name) {
      setAuthErr('Full name is required for registration.');
      return;
    }
    if (authTab==='register' && authForm.password !== authForm.confirm) {
      setAuthErr("Passwords don't match");
      return;
    }
    try {
      const ep = authTab==='login' ? '/api/auth/login' : '/api/auth/register';
      const body = authTab==='login' ? { email:authForm.email, password:authForm.password }
        : { name:authForm.name, email:authForm.email, password:authForm.password };
      const res = await fetch(`http://localhost:8000${ep}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (!res.ok) {
        let msg = 'Authentication failed';
        try {
          const d = await res.json();
          if (typeof d?.detail === 'string') {
            msg = d.detail;
          } else if (Array.isArray(d?.detail)) {
            msg = d.detail.map(x => x?.msg || JSON.stringify(x)).join(', ');
          } else if (d?.detail && typeof d.detail === 'object') {
            msg = Object.values(d.detail).join(', ');
          }
        } catch {}
        throw new Error(msg);
      }
      const d = await res.json();
      const sess = { userId:d.user_id||d.userId, token:d.access_token||d.token, name:d.name, isGuest:false };
      localStorage.setItem('travelUser', JSON.stringify(sess));
      setUser(sess); setPage('dashboard');
    } catch(e) {
      const msg = String(e?.message || 'Authentication failed');
      if (msg.toLowerCase().includes('failed to fetch')) {
        setAuthErr('Cannot reach backend at http://localhost:8000. Make sure FastAPI is running.');
      } else {
        setAuthErr(msg);
      }
    }
  };

  const guestLogin = () => {
    const sess = { userId:`gst_${Date.now()}`, token:'', name:'Explorer', isGuest:true };
    sessionStorage.setItem('travelGuest', JSON.stringify(sess));
    setUser(sess); setPage('dashboard');
  };

  const logout = () => {
    localStorage.removeItem('travelUser'); sessionStorage.removeItem('travelGuest');
    setUser(null); setPage('auth');
  };

  // ── Chat helpers ──
  const addMsg = (from, text) => setHistory(p => [...p, { from, text }]);

  const advanceQ = (next) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      if (next >= QUESTIONS.length) {
        addMsg('bot', 'Perfect! Let me craft your ideal itinerary ✈️');
        setReadyBuild(true);
      } else {
        setQIdx(next);
        addMsg('bot', QUESTIONS[next]);
        setTextInput('');
        setSugg([]);
      }
    }, 500);
  };

  const selectPlace = (place) => {
    setTextInput(place.city);
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 400);
    if (qIdx===0) setChatData(p => ({...p, origin:place.city, originLat:place.lat, originLng:place.lng}));
    else if (qIdx===1) setChatData(p => ({...p, destination:place.city, destLat:place.lat, destLng:place.lng}));
    setSugg([]); setSelSugg(-1);
  };

  const useGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=10&addressdetails=1`, { headers:{'Accept-Language':'en'} });
        const p = await r.json();
        selectPlace({ city: p.address?.city||p.address?.town||'Current location', lat:pos.coords.latitude, lng:pos.coords.longitude });
      } catch { selectPlace({ city:'Current location', lat:pos.coords.latitude, lng:pos.coords.longitude }); }
    });
  };

  const submitText = () => {
    if (!textInput.trim() && qIdx !== 7) return;
    const val = textInput.trim();
    addMsg('user', val || 'No special requests');
    if (qIdx===0) { setChatData(p=>({...p, origin:val})); advanceQ(1); }
    else if (qIdx===1) { setChatData(p=>({...p, destination:val})); advanceQ(2); }
    else if (qIdx===7) { setChatData(p=>({...p, special_requests:val})); advanceQ(QUESTIONS.length); }
  };

  // ── Build itinerary ──
  const buildIt = async () => {
    setError(null); setLoading(true); setLoadIdx(0); setLoadProg(0);
    try {
      const res = await fetch('http://localhost:8000/api/plan', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${user?.token||''}` },
        body: JSON.stringify({
          origin:chatData.origin, destination:chatData.destination,
          origin_lat:chatData.originLat, origin_lng:chatData.originLng,
          dest_lat:chatData.destLat, dest_lng:chatData.destLng,
          days:chatData.days, comfort_radius:chatData.comfort_radius, vibes:chatData.vibes,
          group_type:chatData.group_type, budget_level:chatData.budget_level,
          budget_usd_per_day: budgetRangeMap[chatData.budget_level] || null,
          special_requests:chatData.special_requests
        })
      });
      if (!res.ok) { const e=new Error(`${res.status}`); e.status=res.status; throw e; }
      const data = await res.json();
      setLoadProg(100);
      setTimeout(() => setLoading(false), 300);
      const trip = data.trip;
      setItin(trip);
      setActiveDay(1);
      setActiveCur(trip.local_currency in EXCHANGE ? trip.local_currency : 'USD');
      setExpandedDays({ 1:true });
      setCompletedStops({});
      setPage('itinerary');
      const lat = trip.center_lat || chatData.destLat;
      const lng = trip.center_lng || chatData.destLng;
      if (lat && lng) fetchWeather(lat, lng).then(setWeather).catch(()=>{});
    } catch(e) {
      setLoading(false);
      const s = e?.status;
      const msg = s===401 ? 'Session expired — please log in again.'
        : s===422 ? 'Couldn\'t understand the destination — be more specific.'
        : s===500 ? 'Travel agents are busy — try again in a moment.'
        : 'Something went wrong. Please try again.';
      setError({ title:"Couldn't build your itinerary", msg, action: s===401 ? ()=>setPage('auth') : buildIt });
    }
  };

  const fetchWeather = async (lat, lng) => {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current_weather=true&timezone=auto&forecast_days=7`);
    return r.json();
  };

  // ── Reset ──
  const startNew = (q=0, force=false) => {
    if (itin && !force) { setPendingReset(q); setResetModal(true); return; }
    setChatData({ origin:'', destination:'', originLat:null, originLng:null, destLat:null, destLng:null, days:null, comfort_radius:'', vibes:[], group_type:'', budget_level:'', special_requests:'' });
    setHistory([]); setQIdx(0); setItin(null); setWeather(null);
    setSugg([]); setError(null); setTextInput(''); setReadyBuild(false);
    setCustomBudget(''); setShowCustomBudget(false);
    setActiveDay(1); setCompletedStops({}); setDrawer(null); setActiveStop(null);
    setPage('chat');
  };

  const switchDay = (d) => {
    setDayTransition(true);
    setTimeout(() => { setActiveDay(d); setDayTransition(false); }, 200);
  };

  const toggleStopComplete = (key) => {
    setCompletedStops(p => ({ ...p, [key]: !p[key] }));
  };

  const allDayComplete = (dayNum) => {
    const day = itin?.days?.find(d=>d.day===dayNum);
    if (!day?.stops?.length) return false;
    return day.stops.slice(0,4).every((_,i) => completedStops[`${dayNum}-${i}`]);
  };

  const weatherDay = (dayIdx) => {
    if (!weather?.daily) return null;
    const code = weather.daily.weathercode?.[dayIdx];
    const maxT = weather.daily.temperature_2m_max?.[dayIdx];
    const rain = weather.daily.precipitation_probability_max?.[dayIdx];
    return { ...wxFor(code), maxT, rain, code };
  };

  const copyPackingList = () => {
    const unchecked = packingList.filter(i => !checkedPack[i]);
    navigator.clipboard?.writeText(unchecked.join('\n'));
  };

  const submitCustomBudget = () => {
    const amount = Number(customBudget);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) return;
    setChatData(p => ({ ...p, budget_level: `Custom: $${amount}/day` }));
    addMsg('user', `💵 Custom budget: $${amount}/day`);
    setShowCustomBudget(false);
    setCustomBudget('');
    advanceQ(7);
  };

  const parseTravelDistanceKm = (travelText) => {
    if (!travelText) return null;
    const match = String(travelText).toLowerCase().match(/(\d+(?:\.\d+)?)\s*km/);
    if (!match) return null;
    const km = Number(match[1]);
    return Number.isFinite(km) ? km : null;
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#0F172A', color:'#F1F5F9', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{margin:0;}
        @keyframes ripple{from{transform:scale(0);opacity:0.4;}to{transform:scale(4);opacity:0;}}
        @keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}
        @keyframes shimmer{0%{background-position:-200% center;}100%{background-position:200% center;}}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes dropIn{from{opacity:0;transform:scale(0.5) translateY(-10px);}to{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes confetti{0%{transform:translateY(0) rotate(0);opacity:1;}100%{transform:translateY(-80px) rotate(720deg);opacity:0;}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(99,102,241,0.3);}50%{box-shadow:0 0 40px rgba(99,102,241,0.7);}}

        .fade-up{animation:fadeUp 0.35s ease;}
        .slide-in{animation:slideIn 0.3s ease;}
        .slide-up{animation:slideUp 0.4s ease;}

        .btn-primary{background:linear-gradient(135deg,#6366F1,#4F46E5);color:white;border:none;border-radius:12px;padding:14px 28px;font-size:15px;font-weight:500;cursor:pointer;position:relative;overflow:hidden;transition:all 0.2s;}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,0.45);}
        .btn-primary:active{transform:scale(0.97);}
        .btn-primary.shimmer-btn{background-size:200% auto;background-image:linear-gradient(135deg,#6366F1 0%,#818CF8 40%,#6366F1 60%,#4F46E5 100%);animation:shimmer 3s linear infinite;}

        .btn-secondary{background:transparent;border:1px solid #334155;color:#94A3B8;padding:10px 20px;border-radius:10px;cursor:pointer;transition:all 0.2s;font-size:14px;}
        .btn-secondary:hover{border-color:#6366F1;color:#6366F1;background:rgba(99,102,241,0.06);}
        .btn-secondary:active{transform:scale(0.97);}

        .chip{border:1px solid #334155;background:transparent;color:#64748B;border-radius:999px;padding:8px 18px;cursor:pointer;font-size:14px;transition:all 0.2s;font-family:inherit;}
        .chip:hover{border-color:#6366F1;color:#94A3B8;}
        .chip.on{background:#6366F1;border-color:#6366F1;color:white;box-shadow:0 0 0 3px rgba(99,102,241,0.2);}

        .stop-card{background:#1E293B;border-radius:14px;padding:16px 18px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;border:1.5px solid transparent;}
        .stop-card:hover{background:#273549;transform:translateY(-2px);border-color:#334155;}
        .stop-card.active{border-color:#6366F1;background:rgba(99,102,241,0.08);}

        .food-card{background:#1E293B;border-radius:12px;padding:14px;min-width:175px;flex-shrink:0;transition:all 0.2s;border:1px solid #1E293B;}
        .food-card:hover{border-color:#334155;transform:translateY(-2px);}

        .hotel-card{background:#1E293B;border-radius:12px;padding:16px;min-width:210px;flex-shrink:0;border:1px solid #334155;transition:all 0.2s;position:relative;}
        .hotel-card:hover{transform:translateY(-2px);border-color:#6366F1;}
        .hotel-card.recommended{border-color:#6366F1;border-width:2px;}

        .drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;backdrop-filter:blur(4px);}
        .drawer{position:fixed;right:0;top:0;bottom:0;width:400px;background:#1E293B;z-index:401;overflow-y:auto;border-left:1px solid #334155;animation:slideIn 0.3s cubic-bezier(0.32,0.72,0,1);}
        @media(max-width:768px){.drawer{width:100%;right:0;top:auto;height:85vh;border-radius:20px 20px 0 0;border-left:none;border-top:1px solid #334155;animation:slideUp 0.3s cubic-bezier(0.32,0.72,0,1);} .map-panel{height:50vh!important;} .split{grid-template-columns:1fr!important;}}

        input,textarea{background:#1E293B;border:1px solid #334155;color:#F1F5F9;border-radius:10px;padding:12px 14px;font-size:14px;font-family:inherit;width:100%;transition:all 0.2s;outline:none;}
        input:focus,textarea:focus{border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,0.15);}

        ::-webkit-scrollbar{width:6px;height:6px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
        ::-webkit-scrollbar-thumb:hover{background:#475569;}

        .nav-connector{display:flex;align-items:center;gap:10px;padding:8px 12px;margin:4px 0;font-size:12px;color:#64748B;position:relative;}
        .nav-connector::before{content:'';position:absolute;left:22px;top:0;bottom:0;width:2px;background:repeating-linear-gradient(to bottom,#334155 0,#334155 4px,transparent 4px,transparent 8px);}

        .day-header{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;border-radius:12px;transition:all 0.2s;margin-bottom:4px;}
        .day-header:hover{background:#273549;}

        .weather-strip{display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none;}
        .weather-strip::-webkit-scrollbar{display:none;}

        .map-control{background:rgba(15,23,42,0.85);border:0.5px solid rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:10px;padding:6px;}

        .tab-indicator{height:2px;background:#6366F1;border-radius:1px;transition:all 0.25s ease;}

        .leaflet-popup-content-wrapper{background:#1E293B!important;border:1px solid #334155!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)!important;}
        .leaflet-popup-content{color:#F1F5F9!important;margin:12px 16px!important;}
        .leaflet-popup-tip{background:#1E293B!important;}
        .leaflet-popup-close-button{color:#94A3B8!important;}
      `}</style>

      {/* ── AUTH PAGE ── */}
      {page==='auth' && (
        <div className="fade-up" style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'radial-gradient(ellipse at top right,#1E1B4B 0%,#0F172A 60%)' }}>
          <div style={{ width:'100%', maxWidth:440 }}>
            <div style={{ textAlign:'center', marginBottom:32 }}>
              <div style={{ fontSize:52, marginBottom:12 }}>✈️</div>
              <h1 style={{ fontWeight:400, fontSize:32, letterSpacing:'-0.5px', marginBottom:8 }}>TravelMind</h1>
              <p style={{ color:'#64748B', fontSize:14 }}>Your AI-powered travel concierge</p>
            </div>

            <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:28 }}>
              {/* Tab switcher */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:24, background:'#0F172A', borderRadius:12, padding:4 }}>
                {['login','register'].map(t => (
                  <button key={t} onClick={()=>setAuthTab(t)} style={{ padding:'10px 0', borderRadius:10, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:500, fontSize:14, transition:'all 0.2s', background:authTab===t?'#334155':'transparent', color:authTab===t?'#F1F5F9':'#64748B' }}>
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>

              <p style={{ color:'#64748B', fontSize:13, marginBottom:20, textAlign:'center' }}>
                {authTab==='login' ? "Welcome back! Let's plan your next adventure" : "Your journey starts here"}
              </p>

              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {authTab==='register' && <input placeholder="Full name" value={authForm.name} onChange={e=>setAuthForm(p=>({...p,name:e.target.value}))} />}
                <input type="email" placeholder="Email address" value={authForm.email} onChange={e=>setAuthForm(p=>({...p,email:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} />
                <input type="password" placeholder="Password" value={authForm.password} onChange={e=>setAuthForm(p=>({...p,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} />
                {authTab==='register' && <input type="password" placeholder="Confirm password" value={authForm.confirm} onChange={e=>setAuthForm(p=>({...p,confirm:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&handleAuth()} />}
              </div>

              {authErr && <p style={{ color:'#F87171', fontSize:12, marginTop:10 }}>⚠️ {authErr}</p>}

              <RippleBtn className="btn-primary shimmer-btn" onClick={handleAuth} style={{ width:'100%', marginTop:20, padding:'14px 0' }}>
                {authTab==='login' ? 'Sign In →' : 'Create Account →'}
              </RippleBtn>

              <div style={{ display:'flex', alignItems:'center', gap:12, margin:'20px 0' }}>
                <div style={{ flex:1, height:1, background:'#334155' }}/>
                <span style={{ color:'#475569', fontSize:12 }}>or</span>
                <div style={{ flex:1, height:1, background:'#334155' }}/>
              </div>

              <button className="btn-secondary" style={{ width:'100%' }} onClick={guestLogin}>
                Continue as Guest
              </button>

              <p style={{ textAlign:'center', color:'#475569', fontSize:11, marginTop:16 }}>
                Guest sessions are not saved between visits
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {page==='dashboard' && user && (
        <div className="fade-up" style={{ maxWidth:900, margin:'0 auto', padding:40 }}>
          {/* Navbar */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:48 }}>
            <span style={{ fontSize:20, fontWeight:500 }}>✈️ TravelMind</span>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <button className="btn-secondary" style={{ fontSize:13 }} onClick={()=>setPage('saved')}>My Trips</button>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, cursor:'pointer' }} onClick={logout}>
                {initials(user.name)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom:48 }}>
            <h1 style={{ fontSize:36, fontWeight:400, letterSpacing:'-1px', marginBottom:8 }}>
              Hey {user.name?.split(' ')[0]} 👋
            </h1>
            <p style={{ color:'#64748B', fontSize:16 }}>Ready to plan your next adventure?</p>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:32 }}>
            <div style={{ background:'linear-gradient(135deg,#6366F1,#4F46E5)', borderRadius:20, padding:28, cursor:'pointer' }} onClick={()=>startNew(0,true)}>
              <div style={{ fontSize:32, marginBottom:12 }}>🗺️</div>
              <h3 style={{ fontWeight:500, marginBottom:6 }}>Plan a new trip</h3>
              <p style={{ color:'rgba(255,255,255,0.7)', fontSize:13 }}>Chat with our AI to build your perfect itinerary</p>
            </div>
            <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:28, cursor:'pointer' }} onClick={()=>setPage('saved')}>
              <div style={{ fontSize:32, marginBottom:12 }}>📚</div>
              <h3 style={{ fontWeight:500, marginBottom:6 }}>My saved trips</h3>
              <p style={{ color:'#64748B', fontSize:13 }}>View and revisit your past itineraries</p>
            </div>
          </div>

          {user.isGuest && (
            <div style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:12, padding:'12px 16px', fontSize:13, color:'#A5B4FC' }}>
              💡 Create a free account to save your trips and access them anytime
            </div>
          )}
        </div>
      )}

      {/* ── CHAT PAGE ── */}
      {page==='chat' && (
        <div className="fade-up" style={{ maxWidth:680, margin:'0 auto', padding:'32px 20px', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
            <button className="btn-secondary" style={{ padding:'8px 14px', fontSize:13 }} onClick={()=>setPage('dashboard')}>← Back</button>
            <span style={{ color:'#64748B', fontSize:13 }}>{progPct}% complete</span>
          </div>

          <h1 style={{ textAlign:'center', fontWeight:300, fontSize:28, marginBottom:20, color:'#F1F5F9' }}>
            Where do you want to go?
          </h1>

          {/* Progress bar */}
          <div style={{ height:3, borderRadius:999, background:'#1E293B', overflow:'hidden', marginBottom:28 }}>
            <div style={{ height:'100%', width:`${progPct}%`, background:'linear-gradient(90deg,#6366F1,#818CF8)', transition:'width 0.4s ease' }}/>
          </div>

          {/* Chat bubbles */}
          <div style={{ flex:1, overflowY:'auto', marginBottom:16, paddingRight:4 }}>
            {history.map((m, i) => (
              <div key={i} className="fade-up" style={{
                display:'flex', justifyContent:m.from==='user'?'flex-end':'flex-start',
                marginBottom:12,
              }}>
                {m.from==='bot' && <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, marginRight:8, flexShrink:0, alignSelf:'flex-end' }}>✈️</div>}
                <div style={{
                  maxWidth:'78%', padding:'12px 16px', borderRadius:m.from==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',
                  background:m.from==='user'?'linear-gradient(135deg,#4F46E5,#6366F1)':'#1E293B',
                  border:'1px solid',
                  borderColor:m.from==='user'?'transparent':'#334155',
                  fontSize:14, lineHeight:1.6,
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>✈️</div>
                <TypingDots/>
              </div>
            )}
            <div ref={chatEnd}/>
          </div>

          {/* Input area */}
          <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:16, padding:16 }}>

            {/* Text input Q0, Q1, Q6 */}
            {(qIdx===0||qIdx===1||qIdx===7) && !readyBuild && (
              <div>
                <div style={{ position:'relative' }}>
                  <input
                    value={textInput}
                    onChange={e=>setTextInput(e.target.value)}
                    onKeyDown={e=>{
                      if(e.key==='ArrowDown'&&sugg.length){e.preventDefault();setSelSugg(p=>(p+1)%sugg.length);}
                      else if(e.key==='ArrowUp'&&sugg.length){e.preventDefault();setSelSugg(p=>p<=0?sugg.length-1:p-1);}
                      else if(e.key==='Enter'){if(selSugg>=0&&sugg[selSugg]){e.preventDefault();selectPlace(sugg[selSugg]);}else submitText();}
                    }}
                    placeholder={qIdx===7?'e.g. no spicy food, wheelchair accessible, hidden gems...':'Type a city or destination…'}
                    style={{ border:`1.5px solid ${inputFlash?'#10B981':selSugg>=0?'#6366F1':'#334155'}`, boxShadow:inputFlash?'0 0 0 3px rgba(16,185,129,0.2)':'none' }}
                  />
                  {(qIdx===0||qIdx===1) && (
                    <button onClick={useGPS} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#64748B', cursor:'pointer', fontSize:18, padding:4 }} title="Use current location">
                      📍
                    </button>
                  )}
                  {sugg.length>0 && (
                    <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'#0F172A', border:'1px solid #334155', borderRadius:12, zIndex:100, overflow:'hidden', boxShadow:'0 16px 40px rgba(0,0,0,0.6)' }}>
                      {sugg.map((s,i) => (
                        <div key={i} onClick={()=>selectPlace(s)} onMouseEnter={()=>{setHovSugg(i);setSelSugg(i);}} onMouseLeave={()=>setHovSugg(-1)}
                          style={{ padding:'11px 14px', cursor:'pointer', background:hovSugg===i||selSugg===i?'#1E293B':'transparent', borderBottom:'1px solid #1E293B', display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:16, flexShrink:0 }}>📍</span>
                          <div>
                            <div style={{ fontWeight:500, fontSize:14, color:'#F1F5F9' }}>{s.city}</div>
                            <div style={{ fontSize:11, color:'#64748B' }}>{s.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <RippleBtn className="btn-primary" onClick={submitText} style={{ width:'100%', marginTop:12 }}>
                  {qIdx===7 ? 'Build My Itinerary →' : 'Continue →'}
                </RippleBtn>
              </div>
            )}

            {/* Q2 days */}
            {qIdx===2 && !readyBuild && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[3,5,7,10].map(d=>(
                  <RippleBtn key={d} className={`chip${chatData.days===d?' on':''}`} onClick={()=>{
                    setChatData(p=>({...p,days:d}));
                    addMsg('user',`${d} days`);
                    advanceQ(3);
                  }}>{d} days</RippleBtn>
                ))}
              </div>
            )}

            {/* Q3 comfort radius */}
            {qIdx===3 && !readyBuild && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {radiusOptions.map((opt) => {
                  const selected = chatData.comfort_radius === opt.value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => {
                        setChatData(p => ({ ...p, comfort_radius: opt.value }));
                        addMsg('user', `${opt.icon} ${opt.label} — ${opt.sub}`);
                        advanceQ(4);
                      }}
                      style={{
                        background: selected ? 'rgba(99,102,241,0.12)' : '#1E293B',
                        border: `2px solid ${selected ? '#6366F1' : '#334155'}`,
                        borderRadius: 14,
                        padding: '16px 12px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        transform: selected ? 'translateY(-1px)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) {
                          e.currentTarget.style.borderColor = '#6366F1';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) {
                          e.currentTarget.style.borderColor = '#334155';
                          e.currentTarget.style.transform = 'none';
                        }
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{opt.icon}</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                      <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>{opt.sub}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Q4 vibes */}
            {qIdx===4 && !readyBuild && (
              <div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                  {[['🏛️','Culture'],['🌿','Nature'],['🍜','Food'],['🎉','Nightlife'],['🧘','Wellness'],['🛍️','Shopping']].map(([e,v])=>(
                    <RippleBtn key={v} className={`chip${chatData.vibes.includes(v)?' on':''}`}
                      onClick={()=>setChatData(p=>({...p,vibes:p.vibes.includes(v)?p.vibes.filter(x=>x!==v):[...p.vibes,v]}))}>
                      {e} {v}
                    </RippleBtn>
                  ))}
                </div>
                <RippleBtn className="btn-primary" onClick={()=>{ addMsg('user',chatData.vibes.join(', ')||'Open to anything'); advanceQ(5); }} style={{ width:'100%' }}>
                  Continue →
                </RippleBtn>
              </div>
            )}

            {/* Q5 group */}
            {qIdx===5 && !readyBuild && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[['🧍','Solo'],['💑','Couple'],['👨‍👩‍👧','Family'],['👫','Friends']].map(([e,g])=>(
                  <RippleBtn key={g} className="chip" onClick={()=>{
                    setChatData(p=>({...p,group_type:g}));
                    addMsg('user',`${e} ${g}`);
                    advanceQ(6);
                  }}>{e} {g}</RippleBtn>
                ))}
              </div>
            )}

            {/* Q6 budget */}
            {qIdx===6 && !readyBuild && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {budgetOptions.map((opt) => (
                    <div
                      key={opt.value}
                      onClick={() => {
                        setChatData(p => ({...p, budget_level: opt.value}));
                        addMsg('user', `${opt.icon} ${opt.label} (${opt.range}/day)`);
                        advanceQ(7);
                      }}
                      style={{
                        background: '#1E293B',
                        border: '2px solid #334155',
                        borderRadius: 14,
                        padding: '16px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366F1';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#334155';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: `${opt.color}20`,
                        border: `1px solid ${opt.color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        marginBottom: 10,
                      }}>{opt.icon}</div>
                      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ color: opt.color, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{opt.range}/day</div>
                      <div style={{ color: '#64748B', fontSize: 11, lineHeight: 1.5 }}>{opt.examples}</div>
                    </div>
                  ))}
                </div>

                <button
                  className="btn-secondary"
                  onClick={() => setShowCustomBudget((p) => !p)}
                  style={{ width:'100%', marginTop:10, textAlign:'left' }}
                >
                  Or enter a custom amount →
                </button>

                {showCustomBudget && (
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <input
                      type="number"
                      placeholder="Daily budget in USD"
                      value={customBudget}
                      onChange={e => setCustomBudget(e.target.value)}
                      min={1}
                      max={10000}
                      onKeyDown={e => e.key === 'Enter' && submitCustomBudget()}
                    />
                    <button className="btn-primary" onClick={submitCustomBudget} style={{ padding:'10px 18px' }}>
                      Set
                    </button>
                  </div>
                )}
              </div>
            )}

            {readyBuild && (
              <RippleBtn className="btn-primary shimmer-btn" onClick={buildIt} style={{ width:'100%', fontSize:16, animation:'glow 2s ease-in-out infinite' }}>
                ✈️ Build My Itinerary →
              </RippleBtn>
            )}
          </div>

          {error && (
            <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, padding:16, marginTop:12 }}>
              <p style={{ color:'#FCA5A5', fontWeight:500, marginBottom:6 }}>{error.title}</p>
              <p style={{ color:'#94A3B8', fontSize:13, marginBottom:12 }}>{error.msg}</p>
              <RippleBtn className="btn-primary" onClick={error.action}>Try Again</RippleBtn>
            </div>
          )}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,0.97)', display:'grid', placeItems:'center', zIndex:999 }}>
          <div style={{ textAlign:'center', maxWidth:400, padding:32 }}>
            <div style={{ fontSize:56, marginBottom:24, animation:'bounce 2s ease-in-out infinite' }}>✈️</div>
            <h2 style={{ fontWeight:400, fontSize:22, marginBottom:8 }}>Crafting your itinerary</h2>
            <p style={{ color:'#64748B', fontSize:15, marginBottom:32, minHeight:24 }}>
              {LOADING_MSGS[loadIdx].replace('{dest}', chatData.destination)}
            </p>
            <div style={{ width:240, height:4, borderRadius:999, background:'#1E293B', margin:'0 auto', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${loadProg}%`, background:'linear-gradient(90deg,#6366F1,#818CF8)', transition:'width 0.12s linear', borderRadius:999 }}/>
            </div>
            <p style={{ color:'#334155', fontSize:12, marginTop:12 }}>{loadProg}%</p>
          </div>
        </div>
      )}

      {/* ── ITINERARY PAGE ── */}
      {page==='itinerary' && itin && (
        <div>
          {/* Navbar */}
          <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(15,23,42,0.95)', backdropFilter:'blur(12px)', borderBottom:'1px solid #1E293B', padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <button className="btn-secondary" style={{ padding:'6px 12px', fontSize:13 }} onClick={()=>startNew(0)}>← New Trip</button>
              <span style={{ color:'#64748B', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                ✈️ <strong style={{ color:'#F1F5F9' }}>{itin.origin}</strong>
                <span style={{ color:'#334155' }}>→</span>
                <strong style={{ color:'#F1F5F9' }}>{itin.destination}</strong>
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {weather?.current_weather && (
                <span style={{ background:'#1E293B', padding:'4px 10px', borderRadius:20, fontSize:12, color:'#94A3B8' }}>
                  {wxFor(weather.current_weather.weathercode)?.e} {Math.round(weather.current_weather.temperature)}°C
                </span>
              )}
              <button className="btn-secondary" style={{ fontSize:13, padding:'6px 12px' }} onClick={()=>setPage('saved')}>My Trips</button>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, cursor:'pointer' }} onClick={logout}>
                {initials(user?.name)}
              </div>
            </div>
          </div>

          <div className="split" style={{ display:'grid', gridTemplateColumns:'42% 58%', height:'calc(100vh - 56px)' }}>

            {/* ── LEFT PANEL ── */}
            <div style={{ overflowY:'auto', borderRight:'1px solid #1E293B', display:'flex', flexDirection:'column' }}>

              {/* Trip header */}
              <div style={{ padding:'20px 20px 0', background:'linear-gradient(180deg,#1E293B 0%,transparent 100%)', borderBottom:'1px solid #1E293B', paddingBottom:16 }}>

                {/* Mood board pills */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  {[`✈️ ${itin.duration_days} Days`, `💰 ${SYM[activeCur]}${conv(grandTotal,activeCur).toLocaleString()}`, `📍 ${itin.days?.reduce((a,d)=>a+(d.stops?.length||0),0)} stops`, ...(itin.vibes||[]).map(v=>`${CAT_EMOJI[v]||'🎯'} ${v}`), itin.comfort_radius ? ({ walkable:'🚶 Walkable', city:'🚗 City range', regional:'🛣️ Regional', flexible:'✈️ Flexible range' }[itin.comfort_radius] || null) : null, `${itin.group_type==='Solo'?'🧍':itin.group_type==='Couple'?'💑':itin.group_type==='Family'?'👨‍👩‍👧':'👫'} ${itin.group_type}`].filter(Boolean).map((pill,i) => (
                    <span key={i} style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', color:'#A5B4FC', fontSize:11, padding:'4px 10px', borderRadius:20 }}>{pill}</span>
                  ))}
                </div>

                {/* Pace selector */}
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                  {[['🐢','relaxed'],['⚡','balanced'],['🚀','fastpaced']].map(([e,p])=>(
                    <RippleBtn key={p} className={`chip${activePace===p?' on':''}`} onClick={()=>setActivePace(p)} style={{ fontSize:12, padding:'6px 14px' }}>
                      {e} {p}
                    </RippleBtn>
                  ))}
                  <div style={{ flex:1 }}/>
                  <RippleBtn className="btn-secondary" style={{ fontSize:12, padding:'6px 12px' }} onClick={()=>startNew(0)}>↺ Replan</RippleBtn>
                </div>

                {/* Currency */}
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
                  {Object.keys(EXCHANGE).map(c=>(
                    <RippleBtn key={c} className={`chip${activeCur===c?' on':''}`} onClick={()=>setActiveCur(c)} style={{ fontSize:11, padding:'5px 12px' }}>
                      {SYM[c]} {c}
                    </RippleBtn>
                  ))}
                </div>

                {/* Tabs */}
                <div style={{ display:'flex', gap:2, borderBottom:'1px solid #1E293B', position:'relative' }}>
                  {[['📅','itinerary'],['🏨','hotels'],['🍜','food'],['🎒','pack']].map(([e,t])=>(
                    <button key={t} onClick={()=>setActiveTab(t)} style={{ padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:activeTab===t?'#6366F1':'#64748B', fontFamily:'inherit', fontWeight:activeTab===t?500:400, position:'relative', transition:'color 0.2s' }}>
                      {e} {t}
                      {activeTab===t && <div style={{ position:'absolute', bottom:-1, left:0, right:0, height:2, background:'#6366F1', borderRadius:1 }}/>}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px 100px' }}>

                {/* Weather strip */}
                {weather?.daily && (
                  <div className="weather-strip" style={{ marginBottom:16 }}>
                    {(weather.daily.weathercode||[]).slice(0,7).map((code,i)=>{
                      const wx = wxFor(code);
                      const t = weather.daily.temperature_2m_max?.[i];
                      return (
                        <div key={i} style={{ background:'#1E293B', borderRadius:10, padding:'8px 12px', textAlign:'center', minWidth:64, border:`1px solid ${i===activeDay-1?'#6366F1':'#334155'}`, cursor:'pointer' }} onClick={()=>switchDay(i+1)}>
                          <div style={{ fontSize:11, color:'#64748B', marginBottom:4 }}>{getWeekday(i)}</div>
                          <div style={{ fontSize:16 }}>{wx?.e}</div>
                          <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{t?`${Math.round(t)}°`:''}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Day tabs */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                  {itin.days?.map(day=>(
                    <RippleBtn key={day.day} className={`chip${activeDay===day.day?' on':''}`}
                      onClick={()=>switchDay(day.day)} style={{ fontSize:13, position:'relative' }}>
                      Day {day.day}
                      {allDayComplete(day.day) && <span style={{ position:'absolute', top:-4, right:-4, fontSize:10 }}>✅</span>}
                    </RippleBtn>
                  ))}
                </div>

                {/* ── ITINERARY TAB ── */}
                {activeTab==='itinerary' && (
                  <div style={{ opacity:dayTransition?0:1, transition:'opacity 0.2s' }}>
                    {/* Day header */}
                    <div style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:DAY_COLORS[(activeDay-1)%DAY_COLORS.length] }}/>
                        <span style={{ fontSize:11, color:'#64748B', textTransform:'uppercase', letterSpacing:1 }}>Day {activeDay}</span>
                        <div style={{ flex:1 }}/>
                        {weatherDay(activeDay-1) && (
                          <span style={{ fontSize:13 }}>{weatherDay(activeDay-1).e} {weatherDay(activeDay-1).maxT?`${Math.round(weatherDay(activeDay-1).maxT)}°C`:''}</span>
                        )}
                      </div>
                      <p style={{ fontWeight:500, fontSize:16, marginBottom:4 }}>{currentDayData?.title}</p>
                      <p style={{ color:'#64748B', fontSize:12 }}>
                        {dayStops.length} stops • ~{dayStops.reduce((a,s)=>a+s._dur,0)} min
                        {' • '}{Object.keys(completedStops).filter(k=>k.startsWith(`${activeDay}-`)&&completedStops[k]).length} of {dayStops.length} visited
                      </p>
                      {weatherDay(activeDay-1)?.rain > 70 && (
                        <div style={{ marginTop:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#FCD34D' }}>
                          🌧️ Rain likely today — indoor stops highlighted with 🏛️
                        </div>
                      )}
                    </div>

                    {/* Route summary */}
                    <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:12, padding:'14px 16px', marginBottom:16, fontSize:13 }}>
                      <div style={{ fontWeight:500, marginBottom:10, color:'#94A3B8', fontSize:11, textTransform:'uppercase', letterSpacing:0.8 }}>📍 Today's Route</div>
                      {dayStops.map((s,i)=>(
                        <div key={i}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                            <div style={{ width:22, height:22, borderRadius:'50%', background:DAY_COLORS[(activeDay-1)%DAY_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'white', flexShrink:0 }}>{i+1}</div>
                            <span style={{ color:'#F1F5F9', flex:1 }}>{s.name}</span>
                            <span style={{ color:'#64748B', fontSize:11 }}>{s._arrival}</span>
                          </div>
                          {i<dayStops.length-1 && <div style={{ padding:'4px 0 4px 11px', borderLeft:'2px dashed #334155', marginLeft:10, fontSize:11, color:'#64748B' }}>
                            {s.travel_to_next || '15 min'}
                          </div>}
                        </div>
                      ))}
                      <a href={`https://www.google.com/maps/dir/${dayStops.filter(s=>s.lat&&s.lng).map(s=>`${s.lat},${s.lng}`).join('/')}`}
                        target="_blank" rel="noreferrer"
                        style={{ display:'block', textAlign:'center', marginTop:12, padding:'8px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:8, color:'#A5B4FC', fontSize:12, textDecoration:'none' }}>
                        🗺️ Navigate Full Route in Google Maps ↗
                      </a>
                    </div>

                    {/* Stop cards */}
                    <div style={{ position:'relative' }}>
                      <div style={{ position:'absolute', left:20, top:0, bottom:0, width:2, background:`linear-gradient(180deg,${DAY_COLORS[(activeDay-1)%DAY_COLORS.length]},transparent)`, opacity:0.4 }}/>
                      {dayStops.map((stop, i) => {
                        const key = `${activeDay}-${i}`;
                        const done = completedStops[key];
                        const isActive = activeStop===key;
                        const wx = weatherDay(activeDay-1);
                        const isIndoor = stop.indoor || /(museum|temple|church|fort|mall|gallery|culture|mosque|palace)/i.test(`${stop.name} ${stop.category}`);
                        return (
                          <div key={i}>
                            <div className={`stop-card${isActive?' active':''}`}
                              style={{ marginLeft:8, borderLeft:`4px solid ${done?'#10B981':isActive?'#6366F1':DAY_COLORS[(activeDay-1)%DAY_COLORS.length]}`, opacity:done?0.65:1 }}
                              onClick={()=>{ setActiveStop(key); setDrawer(stop); if(mapRef.current&&stop.lat&&stop.lng) mapRef.current.flyTo([stop.lat,stop.lng],15); }}>

                              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6, gap:8 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <div style={{ width:26, height:26, borderRadius:'50%', background:done?'#10B981':DAY_COLORS[(activeDay-1)%DAY_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white', flexShrink:0, animation:done?'none':'dropIn 0.3s ease' }}>
                                    {done?'✓':i+1}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight:500, fontSize:15, color:done?'#64748B':'#F1F5F9' }}>{stop.name}</div>
                                    <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{stop._arrival} • {stop._dur} min</div>
                                  </div>
                                </div>
                                <QualityBadge rating={stop.rating}/>
                              </div>

                              <p style={{ color:'#94A3B8', fontSize:13, marginBottom:8, lineHeight:1.5 }}>{stop.description}</p>

                              {/* Badges */}
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                                <span style={{ background:'rgba(148,163,184,0.1)', color:'#94A3B8', fontSize:11, padding:'3px 8px', borderRadius:20 }}>{CAT_EMOJI[stop.category]||'📍'} {stop.category}</span>
                                <span style={{ background:'rgba(148,163,184,0.1)', color:'#94A3B8', fontSize:11, padding:'3px 8px', borderRadius:20 }}>⏱ {stop._dur}min</span>
                                <span style={{ background:'rgba(148,163,184,0.1)', color:'#94A3B8', fontSize:11, padding:'3px 8px', borderRadius:20 }}>💰 {SYM[activeCur]}{conv(stop.cost_usd,activeCur)}</span>
                                {wx && <span style={{ background:`rgba(0,0,0,0.15)`, color:wx.c, fontSize:11, padding:'3px 8px', borderRadius:20 }}>{wx.e} {wx.b}</span>}
                                {isIndoor && wx?.rain>70 && <span style={{ background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontSize:11, padding:'3px 8px', borderRadius:20 }}>🏛️ Indoor</span>}
                              </div>

                              {/* Why here */}
                              {stop.why_here && (
                                <div style={{ background:'rgba(99,102,241,0.06)', borderLeft:'2px solid #6366F1', borderRadius:'0 6px 6px 0', padding:'7px 10px', fontSize:12, color:'#A5B4FC', fontStyle:'italic', marginBottom:8 }}>
                                  💡 {stop.why_here}
                                </div>
                              )}

                              {/* Pro tip */}
                              {stop.pro_tip && (
                                <div style={{ fontSize:12, color:'#64748B', fontStyle:'italic' }}>
                                  🎯 {stop.pro_tip}
                                </div>
                              )}

                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
                                {stop.travel_to_next && <span style={{ fontSize:11, color:'#64748B' }}>🚗 {stop.travel_to_next}</span>}
                                <button onClick={e=>{e.stopPropagation();toggleStopComplete(key);}} style={{ background:done?'rgba(16,185,129,0.1)':'rgba(99,102,241,0.1)', border:'none', color:done?'#10B981':'#6366F1', fontSize:11, padding:'4px 10px', borderRadius:20, cursor:'pointer', fontFamily:'inherit', marginLeft:'auto' }}>
                                  {done?'✓ Visited':'Mark visited'}
                                </button>
                              </div>
                            </div>

                            {/* Navigation connector */}
                            {i<dayStops.length-1 && (
                              <div className="nav-connector" style={{ marginLeft:8 }}>
                                <span style={{ paddingLeft:24 }}>
                                  {['🚗','🚶','🚇'][[['drive','walk','transit'].indexOf(transportModes[`${activeDay}-${i}`]||'drive')]]} {stop.travel_to_next||'~15 min'}
                                  {' '}
                                  {['drive','walk','transit'].map(m=>(
                                    <button key={m} onClick={()=>setTransportModes(p=>({...p,[`${activeDay}-${i}`]:m}))} style={{ background:'none', border:`1px solid ${(transportModes[`${activeDay}-${i}`]||'drive')===m?'#6366F1':'#334155'}`, color:(transportModes[`${activeDay}-${i}`]||'drive')===m?'#6366F1':'#64748B', borderRadius:20, padding:'2px 8px', fontSize:10, cursor:'pointer', fontFamily:'inherit', marginLeft:4, transition:'all 0.2s' }}>
                                      {m==='drive'?'🚗':m==='walk'?'🚶':'🚇'} {m}
                                    </button>
                                  ))}
                                  {itin.comfort_radius === 'walkable' && (() => {
                                    const km = parseTravelDistanceKm(stop.travel_to_next);
                                    return km && km > 5 ? (
                                      <span style={{ display:'inline-block', marginLeft:8, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.45)', color:'#FCD34D', borderRadius:8, padding:'2px 8px', fontSize:10 }}>
                                        ⚠️ Further than your comfort range
                                      </span>
                                    ) : null;
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Food section */}
                    {currentDayData?.food?.length > 0 && (
                      <div style={{ marginTop:24 }}>
                        <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>🍜 What to Eat Today</h4>
                        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                          {currentDayData.food.map((f,i)=>(
                            <div key={i} className="food-card">
                              <div style={{ fontSize:28, marginBottom:8 }}>{f.emoji}</div>
                              <div style={{ fontWeight:500, fontSize:14, marginBottom:4 }}>{f.name}</div>
                              <div style={{ color:'#64748B', fontSize:11, marginBottom:8 }}>{f.restaurant}</div>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ color:'#F59E0B', fontWeight:500 }}>{SYM[activeCur]}{conv(f.cost_usd,activeCur)}</span>
                                <span style={{ background:'rgba(16,185,129,0.1)', color:'#10B981', fontSize:10, padding:'2px 8px', borderRadius:20 }}>{f.meal_type}</span>
                              </div>
                              {f.rating && <div style={{ fontSize:11, color:'#64748B', marginTop:6 }}>{'★'.repeat(Math.round(f.rating))} {f.rating}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hotels */}
                    {currentDayData?.hotels?.length > 0 && (
                      <div style={{ marginTop:24 }}>
                        <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>🏨 Where to Stay Tonight</h4>
                        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                          {currentDayData.hotels.map((h,i)=>(
                            <div key={i} className={`hotel-card${h.recommended?' recommended':''}`}>
                              {h.recommended && (
                                <div style={{ position:'absolute', top:-10, left:12, background:'#6366F1', color:'white', fontSize:10, padding:'3px 10px', borderRadius:20, fontWeight:500 }}>Best Value</div>
                              )}
                              <div style={{ fontWeight:500, marginBottom:4 }}>{h.name}</div>
                              <div style={{ color:'#F59E0B', fontSize:14, marginBottom:8 }}>{'★'.repeat(h.stars||3)}</div>
                              <div style={{ fontSize:22, fontWeight:500, marginBottom:6 }}>{SYM[activeCur]}{conv(h.price_usd,activeCur)}<span style={{ fontSize:12, color:'#64748B', fontWeight:400 }}>/night</span></div>
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                                {(h.amenities||[]).slice(0,3).map((a,ai)=>(
                                  <span key={ai} style={{ background:'#273549', color:'#94A3B8', fontSize:10, padding:'3px 8px', borderRadius:8 }}>{a}</span>
                                ))}
                              </div>
                              {h.distance_from_last_stop && <div style={{ fontSize:11, color:'#64748B', marginBottom:10 }}>📍 {h.distance_from_last_stop}</div>}
                              <a href={h.booking_url||`https://www.google.com/search?q=${encodeURIComponent(h.name)}`} target="_blank" rel="noreferrer"
                                style={{ display:'block', textAlign:'center', padding:'8px', background:'#6366F1', color:'white', borderRadius:8, fontSize:12, textDecoration:'none', fontWeight:500 }}>
                                Book Now ↗
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── HOTELS TAB ── */}
                {activeTab==='hotels' && (
                  <div>
                    {itin.days?.map(day=>(
                      <div key={day.day} style={{ marginBottom:24 }}>
                        <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Day {day.day} — {day.title}</h4>
                        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                          {(day.hotels||[]).map((h,i)=>(
                            <div key={i} className={`hotel-card${h.recommended?' recommended':''}`} style={{ minWidth:210 }}>
                              {h.recommended && <div style={{ position:'absolute', top:-10, left:12, background:'#6366F1', color:'white', fontSize:10, padding:'3px 10px', borderRadius:20, fontWeight:500 }}>Best Value</div>}
                              <div style={{ fontWeight:500, marginBottom:4 }}>{h.name}</div>
                              <div style={{ color:'#F59E0B', fontSize:13, marginBottom:6 }}>{'★'.repeat(h.stars||3)}</div>
                              <div style={{ fontSize:20, fontWeight:500, marginBottom:8 }}>{SYM[activeCur]}{conv(h.price_usd,activeCur)}<span style={{ fontSize:11, color:'#64748B' }}>/night</span></div>
                              <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
                                {(h.amenities||[]).map((a,ai)=><span key={ai} style={{ background:'#273549', color:'#94A3B8', fontSize:10, padding:'2px 7px', borderRadius:6 }}>{a}</span>)}
                              </div>
                              <a href={h.booking_url||'#'} target="_blank" rel="noreferrer" style={{ display:'block', textAlign:'center', padding:'8px', background:'#6366F1', color:'white', borderRadius:8, fontSize:12, textDecoration:'none' }}>Book Now ↗</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── FOOD TAB ── */}
                {activeTab==='food' && (
                  <div>
                    {itin.days?.map(day=>(
                      <div key={day.day} style={{ marginBottom:24 }}>
                        <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Day {day.day} — {day.title}</h4>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          {(day.food||[]).map((f,i)=>(
                            <div key={i} className="food-card" style={{ minWidth:'unset' }}>
                              <div style={{ fontSize:24, marginBottom:6 }}>{f.emoji}</div>
                              <div style={{ fontWeight:500, fontSize:13, marginBottom:2 }}>{f.name}</div>
                              <div style={{ color:'#64748B', fontSize:11, marginBottom:6 }}>{f.restaurant}</div>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                <span style={{ color:'#F59E0B', fontWeight:500, fontSize:13 }}>{SYM[activeCur]}{conv(f.cost_usd,activeCur)}</span>
                                <span style={{ background:'rgba(16,185,129,0.1)', color:'#10B981', fontSize:10, padding:'2px 7px', borderRadius:20 }}>{f.meal_type}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── PACK TAB ── */}
                {activeTab==='pack' && (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <p style={{ color:'#64748B', fontSize:13 }}>
                        {Object.values(checkedPack).filter(Boolean).length} of {packingList.length} packed
                      </p>
                      <button className="btn-secondary" style={{ fontSize:12, padding:'6px 12px' }} onClick={copyPackingList}>📋 Copy list</button>
                    </div>
                    {packingList.map(item=>(
                      <label key={item} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:checkedPack[item]?'rgba(16,185,129,0.05)':'#1E293B', borderRadius:10, marginBottom:8, cursor:'pointer', transition:'all 0.2s', border:`1px solid ${checkedPack[item]?'rgba(16,185,129,0.2)':'#334155'}` }}>
                        <input type="checkbox" checked={checkedPack[item]||false} onChange={e=>setCheckedPack(p=>({...p,[item]:e.target.checked}))} style={{ width:16, height:16, accentColor:'#10B981', cursor:'pointer' }}/>
                        <span style={{ fontSize:14, textDecoration:checkedPack[item]?'line-through':'none', color:checkedPack[item]?'#64748B':'#F1F5F9', flex:1 }}>{item}</span>
                        {checkedPack[item] && <span style={{ color:'#10B981', fontSize:16 }}>✓</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost summary — sticky footer */}
              <div style={{ borderTop:'1px solid #1E293B', padding:'14px 20px', background:'rgba(15,23,42,0.9)', backdropFilter:'blur(8px)' }}>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  {[['🏨','Hotels',totalCost.hotels],['🍜','Food',totalCost.food],['🎯','Activities',totalCost.activities],['🚗','Transport',totalCost.transport]].map(([e,l,v])=>(
                    <div key={l} style={{ flex:1, textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'#64748B', marginBottom:2 }}>{e} {l}</div>
                      <div style={{ fontSize:13, fontWeight:500 }}>{SYM[activeCur]}{conv(v,activeCur).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #334155', paddingTop:10 }}>
                  <span style={{ color:'#64748B', fontSize:13 }}>Total per person</span>
                  <span style={{ fontWeight:500, fontSize:16 }}>{SYM[activeCur]}{conv(grandTotal,activeCur).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* ── RIGHT MAP PANEL ── */}
            <div className="map-panel" style={{ position:'relative', height:'calc(100vh - 56px)' }}>
              <div ref={mapEl} style={{ width:'100%', height:'100%' }}/>

              {/* Map controls overlay */}
              <div style={{ position:'absolute', top:12, left:12, zIndex:10, display:'flex', gap:6 }}>
                <div className="map-control" style={{ display:'flex', gap:4 }}>
                  {[['🌙','dark'],['🗺️','street'],['🛰️','satellite']].map(([e,l])=>(
                    <button key={l} onClick={()=>setMapLayer(l)} style={{ background:mapLayer===l?'rgba(99,102,241,0.3)':'transparent', border:'none', color:mapLayer===l?'#A5B4FC':'#64748B', padding:'6px 10px', borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit', transition:'all 0.2s' }}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day selector on map */}
              <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:10 }}>
                <div className="map-control" style={{ display:'flex', gap:4 }}>
                  {itin.days?.map(d=>(
                    <button key={d.day} onClick={()=>switchDay(d.day)} style={{ background:activeDay===d.day?DAY_COLORS[(d.day-1)%DAY_COLORS.length]:'transparent', border:'none', color:activeDay===d.day?'white':'#94A3B8', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:activeDay===d.day?600:400, transition:'all 0.2s' }}>
                      D{d.day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weather overlay */}
              {weather?.current_weather && (
                <div style={{ position:'absolute', top:12, right:12, zIndex:10 }}>
                  <div className="map-control" style={{ fontSize:12, color:'#94A3B8', display:'flex', alignItems:'center', gap:6 }}>
                    <span>{wxFor(weather.current_weather.weathercode)?.e}</span>
                    <span>{Math.round(weather.current_weather.temperature)}°C</span>
                    <span style={{ color:'#334155' }}>•</span>
                    <span>💨 {Math.round(weather.current_weather.windspeed)} km/h</span>
                  </div>
                </div>
              )}

              {/* Day summary pill */}
              <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', zIndex:10 }}>
                <div className="map-control" style={{ fontSize:12, color:'#94A3B8', padding:'8px 14px', whiteSpace:'nowrap', display:'flex', gap:8 }}>
                  <span style={{ color:DAY_COLORS[(activeDay-1)%DAY_COLORS.length] }}>●</span>
                  <span>Day {activeDay}</span>
                  <span style={{ color:'#334155' }}>•</span>
                  <span>{dayStops.length} stops</span>
                  <span style={{ color:'#334155' }}>•</span>
                  <span>~{Math.round(dayStops.reduce((a,s)=>a+s._dur,0)/60*10)/10}h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STOP DETAIL DRAWER ── */}
      {drawer && (
        <>
          <div className="drawer-overlay" onClick={()=>{ setDrawer(null); setActiveStop(null); }}/>
          <div className="drawer">
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <button className="btn-secondary" style={{ fontSize:13, padding:'6px 12px' }} onClick={()=>{ setDrawer(null); setActiveStop(null); }}>← Back</button>
              <button onClick={()=>{ setDrawer(null); setActiveStop(null); }} style={{ background:'none', border:'none', color:'#64748B', cursor:'pointer', fontSize:20, padding:4 }}>✕</button>
            </div>

            {/* Photo placeholder */}
            <div style={{ width:'100%', height:160, background:CAT_GRAD[drawer.category]||CAT_GRAD.Culture, display:'flex', alignItems:'center', justifyContent:'center', fontSize:64 }}>
              {CAT_EMOJI[drawer.category]||'📍'}
            </div>

            <div style={{ padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <h2 style={{ fontWeight:500, fontSize:20, flex:1 }}>{drawer.name}</h2>
                <QualityBadge rating={drawer.rating}/>
              </div>
              <p style={{ color:'#64748B', fontSize:13, marginBottom:16 }}>{drawer.category} • {itin?.destination}</p>

              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                <span style={{ background:'rgba(148,163,184,0.1)', color:'#94A3B8', fontSize:12, padding:'5px 10px', borderRadius:20 }}>⏱ {drawer.duration_minutes||60} min</span>
                <span style={{ background:'rgba(148,163,184,0.1)', color:'#94A3B8', fontSize:12, padding:'5px 10px', borderRadius:20 }}>💰 {SYM[activeCur]}{conv(drawer.cost_usd,activeCur)}</span>
                {weatherDay(activeDay-1) && (
                  <span style={{ background:'rgba(0,0,0,0.15)', color:weatherDay(activeDay-1).c, fontSize:12, padding:'5px 10px', borderRadius:20 }}>{weatherDay(activeDay-1).e} {weatherDay(activeDay-1).b}</span>
                )}
              </div>

              {drawer.why_here && (
                <div style={{ background:'rgba(99,102,241,0.08)', borderLeft:'3px solid #6366F1', borderRadius:'0 10px 10px 0', padding:'10px 14px', marginBottom:16 }}>
                  <p style={{ fontSize:12, color:'#A5B4FC', fontStyle:'italic', fontWeight:500, marginBottom:4 }}>💡 Why this stop?</p>
                  <p style={{ fontSize:13, color:'#94A3B8' }}>{drawer.why_here}</p>
                </div>
              )}

              {drawer.description && (
                <div style={{ marginBottom:16 }}>
                  <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>About</h4>
                  <p style={{ fontSize:14, lineHeight:1.7, color:'#CBD5E1' }}>{drawer.description}</p>
                </div>
              )}

              <div style={{ background:'#273549', borderRadius:12, padding:14, marginBottom:16 }}>
                {drawer.best_time && <div style={{ display:'flex', gap:8, marginBottom:8, fontSize:13 }}><span>🕐</span><span><strong>Best time:</strong> <span style={{ color:'#94A3B8' }}>{drawer.best_time}</span></span></div>}
                {drawer.pro_tip && <div style={{ display:'flex', gap:8, marginBottom:8, fontSize:13 }}><span>🎯</span><span><strong>Tip:</strong> <span style={{ color:'#94A3B8' }}>{drawer.pro_tip}</span></span></div>}
                {drawer.booking_required !== undefined && <div style={{ display:'flex', gap:8, marginBottom:8, fontSize:13 }}><span>🎟️</span><span><strong>Booking:</strong> <span style={{ color:'#94A3B8' }}>{drawer.booking_required?'Required — book ahead':'Walk-in welcome'}</span></span></div>}
                {drawer.dress_code && <div style={{ display:'flex', gap:8, marginBottom:8, fontSize:13 }}><span>👗</span><span><strong>Dress code:</strong> <span style={{ color:'#94A3B8' }}>{drawer.dress_code}</span></span></div>}
                {drawer.accessible !== undefined && <div style={{ display:'flex', gap:8, fontSize:13 }}><span>♿</span><span><strong>Accessible:</strong> <span style={{ color:'#94A3B8' }}>{drawer.accessible?'Yes':'Check ahead'}</span></span></div>}
              </div>

              {/* Nearest food */}
              {currentDayData?.food?.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>🍽️ Nearest Food</h4>
                  <div style={{ display:'flex', gap:8, overflowX:'auto' }}>
                    {currentDayData.food.slice(0,2).map((f,i)=>(
                      <div key={i} style={{ background:'#273549', borderRadius:10, padding:'10px 12px', minWidth:150, flexShrink:0 }}>
                        <div style={{ fontSize:20, marginBottom:4 }}>{f.emoji}</div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{f.name}</div>
                        <div style={{ fontSize:11, color:'#64748B' }}>{f.restaurant}</div>
                        <div style={{ fontSize:12, color:'#F59E0B', marginTop:4 }}>{SYM[activeCur]}{conv(f.cost_usd,activeCur)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${drawer.lat},${drawer.lng}`} target="_blank" rel="noreferrer"
                  style={{ display:'block', textAlign:'center', padding:'12px', background:'#10B981', color:'white', borderRadius:10, fontSize:13, textDecoration:'none', fontWeight:500 }}>
                  📍 Navigate ↗
                </a>
                <a href={`https://maps.apple.com/?daddr=${drawer.lat},${drawer.lng}&dirflg=d`} target="_blank" rel="noreferrer"
                  style={{ display:'block', textAlign:'center', padding:'12px', background:'#1E293B', border:'1px solid #334155', color:'#94A3B8', borderRadius:10, fontSize:13, textDecoration:'none' }}>
                  🍎 Apple Maps
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SAVED TRIPS ── */}
      {page==='saved' && (
        <div className="fade-up" style={{ maxWidth:1100, margin:'0 auto', padding:32 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32 }}>
            <h1 style={{ fontWeight:400, fontSize:28 }}>My Saved Trips</h1>
            <button className="btn-secondary" onClick={()=>setPage('dashboard')}>← Back</button>
          </div>
          {savedTrips.length===0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#64748B' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🗺️</div>
              <p style={{ fontSize:16 }}>No saved trips yet</p>
              <p style={{ fontSize:13, marginTop:8 }}>Create your first trip to see it here</p>
              <RippleBtn className="btn-primary" onClick={()=>startNew(0,true)} style={{ marginTop:20 }}>Plan a Trip →</RippleBtn>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {savedTrips.map(trip=>(
                <div key={trip.id} style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:16, padding:20, cursor:'pointer', transition:'all 0.2s' }} onClick={()=>{ setItin(trip); setPage('itinerary'); }}>
                  <h3 style={{ fontWeight:500, marginBottom:6 }}>{trip.origin} → {trip.destination}</h3>
                  <p style={{ color:'#64748B', fontSize:13, marginBottom:12 }}>{trip.duration_days} days • {(trip.vibes||[]).join(', ')||'Mixed'}</p>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {(trip.vibes||[]).map(v=><span key={v} style={{ background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontSize:11, padding:'3px 8px', borderRadius:20 }}>{CAT_EMOJI[v]||'🎯'} {v}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESET MODAL ── */}
      {resetModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'grid', placeItems:'center', zIndex:600, backdropFilter:'blur(6px)' }} onClick={()=>setResetModal(false)}>
          <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:32, maxWidth:380, width:'90%' }} onClick={e=>e.stopPropagation()}>
            <h2 style={{ fontWeight:500, marginBottom:10 }}>Start a new trip?</h2>
            <p style={{ color:'#64748B', marginBottom:24, fontSize:14 }}>Your current plan will be cleared. This can't be undone.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={()=>setResetModal(false)}>Cancel</button>
              <RippleBtn className="btn-primary" style={{ flex:1 }} onClick={()=>{ setResetModal(false); startNew(pendingReset,true); }}>Yes, start fresh</RippleBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}