import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import API_BASE from './config';

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
const STOPS_PER_PACE = { relaxed:3, balanced:4, fastpaced:5 };
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

const PREFS_KEY = 'travelPrefs';
const THEME_KEY = 'travelTheme';
const HOTEL_CAPS = {
  Budget: { max: 6, label: 'Under $6/night   (₹500)' },
  Relaxed: { max: 18, label: '$6-18/night      (₹500-1,500)' },
  Luxury: { max: 35, label: '$18-35/night     (₹1,500-2,900)' },
  Ultra: { max: 9999, label: '$35+/night        (₹2,900+)' },
};
const HOTEL_INR_CAPS = {
  Budget: { min: 0, max: 500, label: 'Under ₹500/night' },
  Relaxed: { min: 500, max: 1500, label: '₹500-1,500/night' },
  Luxury: { min: 1500, max: 2900, label: '₹1,500-2,900/night' },
  Ultra: { min: 2900, max: 99999, label: '₹2,900+/night' },
};
const BUDGET_AREAS = {
  Delhi: ['Paharganj', 'Karol Bagh', 'Laxmi Nagar', 'Sadar Bazaar'],
  Mumbai: ['Dadar', 'Andheri East', 'Kurla', 'Thane'],
  Goa: ['Panaji', 'Mapusa', 'Old Goa'],
  Jaipur: ['Sindhi Camp', 'Bani Park', 'Station Road'],
  Kolkata: ['Sudder Street', 'Howrah', 'Park Circus'],
  Chennai: ['Egmore', 'T Nagar', 'Koyambedu'],
  Hyderabad: ['Abids', 'Secunderabad', 'Ameerpet'],
  Bangalore: ['Majestic', 'Shivajinagar', 'Yeshwanthpur'],
};
const FOOD_CAPS = {
  Budget: 3,
  Relaxed: 9,
  Luxury: 15,
  Ultra: 9999,
};
const TIER_DAILY_BUDGET_USD = {
  Budget: 8,
  Relaxed: 20,
  Luxury: 40,
  Ultra: 75,
};
const RADIUS_KM = {
  walkable: 5,
  city: 20,
  regional: 50,
  flexible: Infinity,
};

function resolveComfortRadiusKm(comfortRadius, comfortRadiusKm) {
  if (Number.isFinite(Number(comfortRadiusKm)) && Number(comfortRadiusKm) > 0) {
    return Number(comfortRadiusKm);
  }
  const m = String(comfortRadius || '').toLowerCase().match(/^custom_(\d+)km$/);
  if (m) return Number(m[1]);
  return RADIUS_KM[comfortRadius] || Infinity;
}
const JUNK_KEYWORDS = [
  'hotel', 'oyo', 'hostel', 'guesthouse', 'lodge',
  'motel', 'resort', 'inn', 'suites',
  'restaurant', 'dhaba', 'cafe', 'food court', 'canteen',
  'school', 'college', 'university', 'institute',
  'hospital', 'clinic', 'pharmacy',
  'mall', 'supermarket', 'grocery',
  'office', 'it park', 'tech park',
  'bus stand', 'bus depot', 'petrol pump',
  'apartment', 'colony', 'society', 'nagar',
];
const TOURIST_KEYWORDS = [
  'fort', 'temple', 'mosque', 'church', 'gurudwara',
  'museum', 'palace', 'monument', 'heritage', 'garden',
  'park', 'lake', 'waterfall', 'beach', 'market',
  'bazaar', 'masjid', 'mandir', 'charminar', 'qutb',
  'tomb', 'mausoleum', 'gateway', 'tower', 'bridge',
  'zoo', 'sanctuary', 'reserve', 'national',
  'historical', 'ancient', 'ruins', 'ghats',
  'viewpoint', 'plateau', 'valley', 'caves',
  'dargah', 'shrine', 'cathedral', 'basilica',
];
const TOURIST_CATEGORIES = ['culture', 'nature', 'adventure', 'leisure', 'heritage', 'religious', 'historical', 'scenic'];
const defaultPrefs = {
  theme: 'dark',
  currency: 'USD',
  pace: 'balanced',
  distanceUnit: 'km',
  tempUnit: 'C',
  defaultOrigin: '',
  defaultVibes: [],
  defaultGroup: '',
  notifications: { reminders: true, weather: true, features: true }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const conv = (usd, cur) => usd ? Math.round((usd||0) * EXCHANGE[cur]) : 0;
const initials = n => String(n||'T').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('') || 'T';
const formatDate = (value) => {
  if (!value) return 'Recently';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
};

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return theme;
}

function applyTheme(theme) {
  const finalTheme = resolveTheme(theme || 'dark');
  document.documentElement.setAttribute('data-theme', finalTheme);
}

function budgetTierFromAmount(amount) {
  if (!Number.isFinite(amount)) return 'Budget';
  if (amount <= 10) return 'Budget';
  if (amount <= 30) return 'Relaxed';
  if (amount <= 50) return 'Luxury';
  return 'Ultra';
}

function nearestNeighborSort(stops) {
  if (!Array.isArray(stops) || stops.length <= 2) return stops || [];
  const valid = stops.every(s => Number.isFinite(s?.lat) && Number.isFinite(s?.lng));
  if (!valid) return stops;

  const haversine = (a, b) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const remaining = [...stops];
  const sorted = [{ ...remaining.shift() }];
  while (remaining.length) {
    const last = sorted[sorted.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversine(last, s);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    });
    const nearest = remaining.splice(nearestIdx, 1)[0];
    sorted.push({ ...nearest, _distFromPrev: nearestDist.toFixed(1) });
  }
  return sorted;
}

function computeStats(trips) {
  const safeTrips = Array.isArray(trips) ? trips : [];
  const totalTrips = safeTrips.length;
  const totalStops = safeTrips.reduce((a, t) =>
    a + (t.days || []).reduce((b, d) => b + (d.stops?.length || 0), 0), 0);
  const countries = new Set(safeTrips.map(t => t.destination_country).filter(Boolean));
  const totalSpend = safeTrips.reduce((a, t) => {
    const days = t.days || [];
    return a + days.reduce((b, d) => {
      const hotels = d.hotels?.[0]?.price_usd || 0;
      const food = (d.food || []).reduce((c, f) => c + (f.cost_usd || 0), 0);
      const acts = (d.stops || []).reduce((c, s) => c + (s.cost_usd || 0), 0);
      return b + hotels + food + acts;
    }, 0);
  }, 0);

  return {
    trips: totalTrips,
    stops: totalStops,
    countries: countries.size,
    saved: Math.round(totalSpend)
  };
}

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

function isValidTouristStop(stop) {
  const nameLower = (stop?.name || '').toLowerCase();
  const descLower = (stop?.description || '').toLowerCase();
  const catLower = (stop?.category || '').toLowerCase();

  const isJunk = JUNK_KEYWORDS.some(k => nameLower.includes(k));
  if (isJunk) return false;

  const isTourist = TOURIST_KEYWORDS.some(k =>
    nameLower.includes(k) || descLower.includes(k) || catLower.includes(k)
  );
  const isTouristCategory = TOURIST_CATEGORIES.some(c => catLower.includes(c));

  return isTourist || isTouristCategory;
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
    <div style={{ gap:6, padding:'14px 18px', background:'#1E293B', borderRadius:16, borderBottomLeftRadius:4, display:'inline-flex', alignItems:'center' }}>
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

function HotelBookingDropdown({ hotel, destination }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dest = encodeURIComponent(destination || '');
  const name = encodeURIComponent(hotel.name || '');
  const slug = String(destination || '').toLowerCase().replace(/\s+/g, '-');

  const platforms = [
    {
      icon: '🔍',
      label: 'Google Hotels',
      sub: 'Compare all prices',
      color: '#4285F4',
      url: hotel.maps_url || `https://www.google.com/travel/hotels/search?q=${name}+${dest}`,
    },
    {
      icon: '🏡',
      label: 'MakeMyTrip',
      sub: 'Best Indian deals',
      color: '#E8334A',
      url: `https://www.makemytrip.com/hotels/hotel-listing/?checkin=03212026&checkout=03222026&roomcount=1&city=${dest}`,
    },
    {
      icon: '📱',
      label: 'OYO Rooms',
      sub: 'Budget stays',
      color: '#EE2E24',
      url: `https://www.oyorooms.com/search/?location=${dest}`,
    },
    {
      icon: '🎒',
      label: 'Zostel',
      sub: 'Backpacker hostels',
      color: '#10B981',
      url: `https://www.zostel.com/zostel/${slug}/`,
    },
    {
      icon: '🌐',
      label: 'Booking.com',
      sub: 'Free cancellation',
      color: '#003580',
      url: `https://www.booking.com/searchresults.html?ss=${name}+${dest}`,
    },
    {
      icon: '🏨',
      label: 'Agoda',
      sub: 'Asia specialist',
      color: '#5C2D91',
      url: `https://www.agoda.com/search?city=${dest}&textToSearch=${name}`,
    },
  ];

  return (
    <div ref={ref} style={{ position:'relative', marginTop:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        <a
          href={hotel.maps_url || `https://www.google.com/maps/search/${name}+${dest}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:4,
            padding:'9px 8px',
            background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)',
            color:'#10B981', borderRadius:9,
            fontSize:12, textDecoration:'none', fontWeight:500, transition:'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)'; }}
        >
          📍 View
        </a>

        <button
          onClick={() => setOpen(p => !p)}
          style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:4,
            padding:'9px 8px',
            background: open ? '#4F46E5' : '#6366F1', border:'none', color:'white',
            borderRadius:9, fontSize:12,
            cursor:'pointer', fontFamily:'inherit', fontWeight:500, transition:'all 0.2s',
          }}
        >
          Book {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div style={{
          position:'absolute',
          bottom:'calc(100% + 6px)',
          left:0, right:0,
          background:'#1E293B', border:'1px solid #334155', borderRadius:12,
          zIndex:200, overflow:'hidden',
          boxShadow:'0 -8px 32px rgba(0,0,0,0.5)', animation:'fadeUp 0.15s ease',
        }}>
          <div style={{
            padding:'10px 14px 8px',
            fontSize:11, color:'#64748B', borderBottom:'1px solid #334155', fontWeight:500,
          }}>
            Book "{hotel.name}" on:
          </div>

          {platforms.map(p => (
            <a
              key={p.label}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                textDecoration:'none', borderBottom:'1px solid #0F172A', transition:'background 0.15s',
                cursor:'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#273549'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize:18, flexShrink:0 }}>{p.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:p.color }}>{p.label}</div>
                <div style={{ fontSize:10, color:'#475569' }}>{p.sub}</div>
              </div>
              <span style={{ fontSize:10, color:'#334155', flexShrink:0 }}>↗</span>
            </a>
          ))}

          <div style={{
            padding:'8px 14px',
            fontSize:10, color:'#475569', lineHeight:1.5,
          }}>
            ⚠️ Verify availability before booking. Prices may vary by date.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Page & Auth ──
  const [page, setPage] = useState('auth');
  const [pageTransition, setPageTransition] = useState(false);
  const [user, setUser] = useState(null);
  const [authTab, setAuthTab] = useState('login');
  const [authForm, setAuthForm] = useState({ name:'', email:'', password:'', confirm:'' });
  const [authErr, setAuthErr] = useState('');

  // ── Chat ──
  const [chatData, setChatData] = useState({
    origin:'', destination:'', originLat:null, originLng:null,
    destLat:null, destLng:null, days:null,
    comfort_radius:'', comfort_radius_km:null, vibes:[], group_type:'', budget_level:'', budget_usd_per_day:null, special_requests:''
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
  const [customDaysInput, setCustomDaysInput] = useState('');
  const [showCustomDays, setShowCustomDays] = useState(false);
  const [customRadius, setCustomRadius] = useState('');
  const [showCustomRadius, setShowCustomRadius] = useState(false);

  // ── Itinerary ──
  const [itin, setItin] = useState(null);
  const [weather, setWeather] = useState(null);
  const [savedTrips, setSavedTrips] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [tripSaved, setTripSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDay, setActiveDay] = useState(1);
  const [activeCur, setActiveCur] = useState('USD');
  const [activePace, setActivePace] = useState('balanced');
  const [activeTab, setActiveTab] = useState('itinerary');
  const [drawer, setDrawer] = useState(null);
  const [activeStop, setActiveStop] = useState(null);
  const [checkedPack, setCheckedPack] = useState({});
  const [transportModes, setTransportModes] = useState({});
  const [completedStops, setCompletedStops] = useState({});
  const [rankBy, setRankBy] = useState('recommended');
  const [comfortFilter, setComfortFilter] = useState(false);
  const [costExpanded, setCostExpanded] = useState(false);

  // ── UI ──
  const [loading, setLoading] = useState(false);
  const [loadIdx, setLoadIdx] = useState(0);
  const [loadProg, setLoadProg] = useState(0);
  const [error, setError] = useState(null);
  const [resetModal, setResetModal] = useState(false);
  const [pendingReset, setPendingReset] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [mapLayer, setMapLayer] = useState('dark');
  const [dayTransition, setDayTransition] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current:'', next:'', confirm:'' });
  const [deleteModal, setDeleteModal] = useState('');
  const [unsavedModal, setUnsavedModal] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false);
  const [authPromptModal, setAuthPromptModal] = useState(false);

  // ── Refs ──
  const mapRef = useRef(null);
  const mapEl = useRef(null);
  const markersRef = useRef({});
  const polylinesRef = useRef([]);
  const chatEnd = useRef(null);
  const suggTimer = useRef(null);
  const dropdownRef = useRef(null);

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
    {
      icon:'🚶', label:'Walkable', sub:'Under 5 km/day', value:'walkable',
      desc:'All stops within walking distance of each other'
    },
    {
      icon:'🚗', label:'City Range', sub:'5–20 km/day', value:'city',
      desc:'Quick taxi or metro between stops'
    },
    {
      icon:'🛣️', label:'Regional', sub:'20–50 km/day', value:'regional',
      desc:'Day trips to nearby areas'
    },
    {
      icon:'✈️', label:'Flexible', sub:'No limit', value:'flexible',
      desc:'Best places regardless of distance'
    },
  ], []);

  const budgetOptions = useMemo(() => [
    {
      icon: '🎒',
      label: 'Budget',
      sub: '$0-10/day',
      value: 'Budget',
      range: '$0-10',
      usd_min: 0,
      usd_max: 10,
      inr_range: '₹0-830/day',
      examples: 'Dormitory hostels, street food, local buses',
      color: '#10B981',
      hotel_max_usd: 6
    },
    {
      icon: '🏡',
      label: 'Relaxed',
      sub: '$10-30/day',
      value: 'Relaxed',
      range: '$10-30',
      usd_min: 10,
      usd_max: 30,
      inr_range: '₹830-2,500/day',
      examples: 'Budget guesthouses, dhabas, shared autos',
      color: '#0EA5E9',
      hotel_max_usd: 18
    },
    {
      icon: '✨',
      label: 'Luxury',
      sub: '$30-50/day',
      value: 'Luxury',
      range: '$30-50',
      usd_min: 30,
      usd_max: 50,
      inr_range: '₹2,500-4,200/day',
      examples: '3-star hotels, sit-down restaurants, Ola/Uber',
      color: '#8B5CF6',
      hotel_max_usd: 35
    },
    {
      icon: '👑',
      label: 'Ultra',
      sub: '$50+/day',
      value: 'Ultra',
      range: '$50+',
      usd_min: 50,
      usd_max: null,
      inr_range: '₹4,200+/day',
      examples: '4-5 star hotels, fine dining, private cabs',
      color: '#F59E0B',
      hotel_max_usd: 9999
    },
  ], []);

  const budgetRangeMap = useMemo(() => ({
    Budget: { min: 0, max: 10 },
    Relaxed: { min: 10, max: 30 },
    Luxury: { min: 30, max: 50 },
    Ultra: { min: 50, max: null },
  }), []);

  const budgetPillMap = useMemo(() => ({
    Budget: '🎒 Budget ($0-10/day)',
    Relaxed: '🏡 Relaxed ($10-30/day)',
    Luxury: '✨ Luxury ($30-50/day)',
    Ultra: '👑 Ultra ($50+/day)',
  }), []);
  const rankOptions = useMemo(() => [
    { value:'recommended', label:'⭐ Best match', applies:['hotels','food','stops'] },
    { value:'price_low', label:'💰 Price: Low→High', applies:['hotels','food','stops'] },
    { value:'price_high', label:'💰 Price: High→Low', applies:['hotels','food','stops'] },
    { value:'rating', label:'🌟 Top rated', applies:['hotels','food','stops'] },
    { value:'distance', label:'📍 Nearest first', applies:['stops'] },
    { value:'duration', label:'⏱ Shortest first', applies:['stops'] },
    { value:'budget_fit', label:'🎯 Budget fit', applies:['hotels','food'] },
  ], []);

  const rankTarget = activeTab === 'itinerary' ? 'stops' : (activeTab === 'pack' ? 'stops' : activeTab);
  const relevantRanks = useMemo(
    () => rankOptions.filter(r => r.applies.includes(rankTarget)),
    [rankOptions, rankTarget]
  );

  const packingList = useMemo(() => buildPacking(itin, weather), [itin, weather]);

  const dayStops = useMemo(() => {
    if (!itin?.days) return [];
    const maxStops = STOPS_PER_PACE[activePace] || 4;
    const day = itin.days.find(d => d.day === activeDay);
    if (!day?.stops) return [];
    const sliced = day.stops.slice(0, maxStops);
    return computeStopTimes(sliced, activePace);
  }, [itin, activeDay, activePace]);

  const currentDayData = useMemo(() => itin?.days?.find(d=>d.day===activeDay), [itin, activeDay]);

  const applyComfortFilter = useCallback((items, type, budgetLevel, comfortRadius) => {
    if (!comfortFilter) return items;
    return (items || []).filter(item => {
      const price = item.price_usd || item.cost_usd || 0;
      const dist = parseFloat(item._distFromPrev || item.distance_from_last_stop || 0);
      const cap = type === 'hotel'
        ? (HOTEL_CAPS[budgetLevel]?.max || 9999)
        : type === 'food'
          ? (FOOD_CAPS[budgetLevel] || 9999)
          : 9999;
      const radiusCap = resolveComfortRadiusKm(comfortRadius, itin?.comfort_radius_km);
      const budgetOk = price === 0 || price <= cap;
      const radiusOk = dist === 0 || dist <= radiusCap;
      return budgetOk && radiusOk;
    });
  }, [comfortFilter, itin?.comfort_radius_km]);

  const rankedFood = useMemo(() => {
    const food = currentDayData?.food || [];
    return rankItems(food, rankBy, 'food', itin?.budget_level, itin?.comfort_radius);
  }, [currentDayData, rankBy, itin]);

  const displayedFood = useMemo(
    () => applyComfortFilter(rankedFood, 'food', itin?.budget_level, itin?.comfort_radius),
    [rankedFood, applyComfortFilter, itin]
  );

  const rankedStops = useMemo(() => {
    if (!dayStops.length) return [];
    if (rankBy === 'recommended') return dayStops;
    return rankItems(dayStops, rankBy, 'stop', itin?.budget_level, itin?.comfort_radius);
  }, [dayStops, rankBy, itin]);

  const displayedStops = useMemo(
    () => applyComfortFilter(rankedStops, 'stop', itin?.budget_level, itin?.comfort_radius),
    [rankedStops, applyComfortFilter, itin]
  );

  const rerankedStops = useMemo(() => computeStopTimes(displayedStops, activePace), [displayedStops, activePace]);

  const foodByMeal = useMemo(() => {
    const mealTypes = ['Breakfast','Lunch','Dinner','Snack','Drinks','Dessert'];
    return mealTypes.map((mealType) => {
      const mealsOfType = (itin?.days || [])
        .flatMap(d => (d.food || []).map(f => ({ ...f, _day: d.day })))
        .filter(f => f.meal_type === mealType);
      const ranked = rankItems(mealsOfType, rankBy, 'food', itin?.budget_level, itin?.comfort_radius);
      const filtered = applyComfortFilter(ranked, 'food', itin?.budget_level, itin?.comfort_radius);
      return { mealType, items: filtered };
    });
  }, [itin, rankBy, applyComfortFilter]);

  const totalCost = useMemo(() => {
    if (!itin?.days) {
      return {
        hotels: 0,
        food: 0,
        activities: 0,
        transport: 0,
        totalUSD: 0,
        dailyUSD: 0,
        days: 0,
        totalKm: 0,
        hotelPerNight: 0,
        foodPerDay: 0,
        transportPerDay: 0,
        activitiesTotal: 0,
        paidStops: [],
        freeStops: [],
        freeStopsCount: 0,
        paidStopsCount: 0,
        transportMode: 'Bus/Metro',
      };
    }

    const days = itin.duration_days || itin.days.length || 1;
    const bl = itin.budget_level || chatData.budget_level;
    const DAILY_BUDGET_USD = itin?.daily_budget_usd || chatData.budget_usd_per_day?.max || TIER_DAILY_BUDGET_USD[bl] || 8;

    let activitiesUSD = 0;
    const paidStops = [];
    const freeStops = [];

    itin.days.forEach(day => {
      (day.stops || []).forEach(stop => {
        const fee = (
          stop.cost_usd !== null
          && stop.cost_usd !== undefined
          && !Number.isNaN(Number(stop.cost_usd))
        ) ? Number(stop.cost_usd) : 0;

        if (fee > 0) {
          activitiesUSD += fee;
          paidStops.push({ name: stop.name, fee, day: day.day });
        } else {
          freeStops.push(stop.name);
        }
      });
    });

    const transportUSD = itin.total_transport_usd
      || itin.transport_summary?.total_usd
      || (() => {
        const COST_PER_KM = {
          Budget: 5 / 83.5,
          Relaxed: 15 / 83.5,
          Luxury: 25 / 83.5,
          Ultra: 40 / 83.5,
        };
        const BASE = {
          Budget: 20 / 83.5,
          Relaxed: 40 / 83.5,
          Luxury: 80 / 83.5,
          Ultra: 150 / 83.5,
        };
        let km = 0;
        itin.days.forEach(day => {
          (day.stops || []).forEach(stop => {
            const d = parseFloat(stop._distFromPrev || 0);
            if (d > 0) km += d;
          });
        });
        return (km * (COST_PER_KM[bl] || 0.008)) + ((BASE[bl] || 0.30) * days);
      })();

    const hotelUSD = itin.days.reduce((sum, day) => {
      const hotels = day.hotels || [];
      if (!hotels.length) return sum;
      const preferred = hotels.find(h => h.recommended) || hotels[0];
      const price = Number(preferred?.price_usd || 0);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);

    const foodUSD = itin.days.reduce((sum, day) => {
      const foods = day.food || [];
      if (!foods.length) return sum;

      const byMealType = new Map();
      foods.forEach((meal) => {
        const type = String(meal?.meal_type || 'Meal');
        const cost = Number(meal?.cost_usd || 0);
        if (!Number.isFinite(cost)) return;
        if (!byMealType.has(type) || cost < byMealType.get(type)) {
          byMealType.set(type, cost);
        }
      });

      let dayFood = Array.from(byMealType.values()).reduce((a, b) => a + b, 0);

      // If meal types are not provided well, assume 3 consumed meals from cheapest options.
      if (dayFood === 0) {
        const cheapest = foods
          .map(m => Number(m?.cost_usd || 0))
          .filter(v => Number.isFinite(v) && v >= 0)
          .sort((a, b) => a - b)
          .slice(0, 3);
        dayFood = cheapest.reduce((a, b) => a + b, 0);
      }

      return sum + dayFood;
    }, 0);

    const totalEstimatedUSD = hotelUSD + foodUSD + activitiesUSD + transportUSD;

    return {
      hotels: hotelUSD,
      food: foodUSD,
      activities: activitiesUSD,
      transport: transportUSD,
      totalUSD: totalEstimatedUSD,
      dailyUSD: DAILY_BUDGET_USD,
      days,
      totalKm: itin.transport_summary?.total_km || 0,
      hotelPerNight: hotelUSD / Math.max(1, days),
      foodPerDay: foodUSD / Math.max(1, days),
      transportPerDay: transportUSD / Math.max(1, days),
      activitiesTotal: activitiesUSD,
      paidStops,
      freeStops,
      freeStopsCount: freeStops.length,
      paidStopsCount: paidStops.length,
      transportMode: itin.transport_summary?.mode || 'Bus/Metro',
    };
  }, [itin, chatData]);

  const grandTotal = totalCost.totalUSD || 0;
  const profileStats = useMemo(() => computeStats(savedTrips), [savedTrips]);
  const recentTrips = useMemo(() => [...savedTrips].slice(-3).reverse(), [savedTrips]);

  const navigateTo = useCallback((newPage) => {
    setDropdownOpen(false);
    setPageTransition(true);
    setTimeout(() => {
      setPage(newPage);
      setPageTransition(false);
    }, 180);
  }, []);

  const showToast = useCallback((msg, type='success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const loadSavedTrips = useCallback(async (authUser = user) => {
    if (!authUser?.token || authUser?.isGuest) return;
    try {
      const res = await fetch(`${API_BASE}/api/trips`, {
        headers: { Authorization: `Bearer ${authUser.token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setSavedTrips(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Could not load saved trips', e);
    }
  }, [user]);

  const loadUserPreferences = useCallback(async (token) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/user/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;

      const backendPrefs = await res.json();
      const merged = {
        ...defaultPrefs,
        ...(backendPrefs || {}),
        notifications: {
          ...defaultPrefs.notifications,
          ...((backendPrefs || {}).notifications || {})
        }
      };
      setPrefs(merged);
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
      localStorage.setItem(THEME_KEY, merged.theme);
      applyTheme(merged.theme);
      if (merged.currency) setActiveCur(merged.currency);
      if (merged.pace) setActivePace(merged.pace);
    } catch {
      const local = localStorage.getItem(PREFS_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        setPrefs(parsed);
        applyTheme(parsed.theme);
      }
    }
  }, []);

  const saveTrip = useCallback(async () => {
    if (tripSaved || saving || !itin) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token || ''}`
        },
        body: JSON.stringify({
          origin: itin.origin,
          destination: itin.destination,
          duration_days: itin.duration_days,
          destination_country: itin.destination_country,
          local_currency: itin.local_currency,
          center_lat: itin.center_lat,
          center_lng: itin.center_lng,
          vibes: itin.vibes || chatData.vibes,
          group_type: itin.group_type || chatData.group_type,
          budget_level: itin.budget_level || chatData.budget_level,
          comfort_radius: itin.comfort_radius || chatData.comfort_radius,
          comfort_radius_km: itin.comfort_radius_km || chatData.comfort_radius_km || null,
          itinerary: itin
        })
      });
      if (!res.ok) throw new Error('Save failed');
      const saved = await res.json();
      setTripSaved(true);
      setSavedTrips(p => [saved, ...p]);
      showToast('✓ Trip saved to My Trips!');
    } catch {
      showToast('⚠️ Could not save trip — try again', 'error');
    } finally {
      setSaving(false);
    }
  }, [tripSaved, saving, itin, user, chatData, showToast]);

  const savePreferences = useCallback(async () => {
    setSavingPrefs(true);
    try {
      const prefsToSave = {
        defaultOrigin: prefs.defaultOrigin,
        defaultVibes: prefs.defaultVibes,
        defaultGroup: prefs.defaultGroup,
        currency: prefs.currency,
        theme: prefs.theme,
        pace: prefs.pace,
        distanceUnit: prefs.distanceUnit,
        tempUnit: prefs.tempUnit,
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefsToSave));
      localStorage.setItem(THEME_KEY, prefsToSave.theme);

      if (user?.token && !user?.isGuest) {
        const res = await fetch(`${API_BASE}/api/user/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`
          },
          body: JSON.stringify(prefsToSave)
        });
        if (!res.ok) throw new Error('Backend save failed');
      }

      setPrefsSaved(true);
      setPrefsDirty(false);
      showToast('✓ Preferences saved!');
    } catch {
      setPrefsSaved(true);
      setPrefsDirty(false);
      showToast('✓ Preferences saved locally');
    } finally {
      setSavingPrefs(false);
    }
  }, [prefs, user, showToast]);

  const saveSettings = useCallback(async () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      localStorage.setItem(THEME_KEY, prefs.theme);

      if (user?.token && !user?.isGuest) {
        await fetch(`${API_BASE}/api/user/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`
          },
          body: JSON.stringify(prefs)
        });
      }

      setSettingsDirty(false);
      setSettingsSaved(true);
      showToast('✓ Settings saved!');
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch {
      setSettingsDirty(false);
      setSettingsSaved(true);
      showToast('✓ Settings saved to this device');
    }
  }, [prefs, user, showToast]);

  const updateSetting = useCallback((key, value) => {
    setPrefs(p => ({ ...p, [key]: value }));
    setSettingsDirty(true);
    setSettingsSaved(false);
    if (key === 'theme') applyTheme(value);
  }, []);

  const saveName = useCallback(async () => {
    if (!nameInput.trim() || nameInput.trim() === user?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token || ''}`
        },
        body: JSON.stringify({ name: nameInput.trim() })
      });
      if (!res.ok) throw new Error('Update failed');

      const updatedUser = { ...user, name: nameInput.trim() };
      if (!user?.isGuest) {
        localStorage.setItem('travelUser', JSON.stringify(updatedUser));
      }
      setUser(updatedUser);
      setEditingName(false);
      showToast('✓ Name updated successfully!');
    } catch {
      const updatedUser = { ...user, name: nameInput.trim() };
      if (updatedUser?.isGuest) {
        sessionStorage.setItem('travelGuest', JSON.stringify(updatedUser));
      } else {
        localStorage.setItem('travelUser', JSON.stringify(updatedUser));
      }
      setUser(updatedUser);
      setEditingName(false);
      showToast('✓ Name updated locally');
    } finally {
      setSavingName(false);
    }
  }, [nameInput, user, showToast]);

  const handleNewTrip = () => {
    if (itin && !tripSaved) {
      setUnsavedModal(true);
    } else {
      startNew(0, true);
    }
  };

  const submitCustomRadius = () => {
    const km = parseInt(customRadius, 10);
    if (!km || km < 1 || km > 500) {
      showToast('Enter a value between 1 and 500 km', 'error');
      return;
    }
    const customValue = `custom_${km}km`;
    setChatData(p => ({
      ...p,
      comfort_radius: customValue,
      comfort_radius_km: km,
    }));
    addMsg('user', `📏 Custom: ${km} km between stops`);
    setShowCustomRadius(false);
    setCustomRadius('');
    advanceQ(4);
  };

  const submitCustomDays = () => {
    const d = parseInt(customDaysInput, 10);
    if (!d || d < 1 || d > 30) {
      showToast('Please enter a number between 1 and 30', 'error');
      return;
    }
    setChatData(p => ({ ...p, days: d }));
    addMsg('user', `${d} ${d === 1 ? 'day' : 'days'}`);
    setShowCustomDays(false);
    setCustomDaysInput('');
    advanceQ(3);
  };

  const editAnswer = (bubbleIndex) => {
    const userBubbles = history.slice(0, bubbleIndex).filter(m => m.from === 'user');
    const questionIndex = userBubbles.length;
    const newHistory = history.slice(0, Math.max(0, bubbleIndex - 1));
    setHistory(newHistory);
    setQIdx(questionIndex);
    setReadyBuild(false);
    setTextInput('');
    setSugg([]);
    if (questionIndex === 2) {
      setShowCustomDays(false);
      setCustomDaysInput('');
    }
    if (questionIndex === 3) {
      setShowCustomRadius(false);
      setCustomRadius('');
    }
    setTimeout(() => {
      addMsg('bot', QUESTIONS[questionIndex]);
    }, 100);
  };
  const openSavedTrips = useCallback(() => {
    loadSavedTrips();
    setPage('saved');
  }, [loadSavedTrips]);

  const loadSavedTrip = useCallback((trip) => {
    const loadedTrip = trip.itinerary || trip;
    const normalized = {
      ...loadedTrip,
      days:(loadedTrip.days||[]).map(day=>({ ...day, stops:nearestNeighborSort((day.stops||[]).slice(0,4)) }))
    };
    setItin(normalized);
    setActiveDay(1);
    setActivePace('balanced');
    setActiveTab('itinerary');
    setTripSaved(true);
    setMapMounted(false);
    setTimeout(() => setPage('itinerary'), 50);
  }, []);

  const deleteTrip = useCallback(async (tripId) => {
    setDeletingTripId(tripId);
    try {
      if (user?.token && !user?.isGuest) {
        const res = await fetch(`${API_BASE}/api/trips/${tripId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (!res.ok) throw new Error('Delete failed');
      }

      setSavedTrips(p => p.filter(t => t.id !== tripId));
      showToast('🗑️ Trip deleted');
    } catch (e) {
      setSavedTrips(p => p.filter(t => t.id !== tripId));
      showToast('Trip removed locally', 'error');
    } finally {
      setDeletingTripId(null);
    }
  }, [user, showToast]);

  const clearAllTrips = useCallback(async () => {
    setClearingHistory(true);
    try {
      if (user?.token && !user?.isGuest) {
        const res = await fetch(`${API_BASE}/api/trips/clear-all`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${user.token}` }
        });
        if (!res.ok) throw new Error('Clear failed');
      }

      setSavedTrips([]);
      setClearHistoryConfirm(false);
      setDeleteConfirmId(null);
      showToast('✓ Trip history cleared');
    } catch (e) {
      setSavedTrips([]);
      setClearHistoryConfirm(false);
      setDeleteConfirmId(null);
      showToast('✓ Cleared locally');
    } finally {
      setClearingHistory(false);
    }
  }, [user, showToast]);

  const buildGoogleHotelsUrl = useCallback((destination, budgetLevel, checkIn, nights) => {
    const cap = HOTEL_INR_CAPS[budgetLevel] || HOTEL_INR_CAPS.Budget;

    const today = new Date();
    const ci = checkIn ? new Date(checkIn) : new Date(today);
    if (!checkIn) ci.setDate(today.getDate() + 7);
    const co = new Date(ci);
    co.setDate(ci.getDate() + (nights || 1));

    const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

    return `https://www.google.com/travel/hotels/search?q=hotels+in+${encodeURIComponent(destination || '')}&checkin=${fmt(ci)}&checkout=${fmt(co)}&price_max=${cap.max}&price_min=${cap.min}&currency=INR`;
  }, []);

  const renderHotelSection = useCallback((day, itinData, budgetLevel) => {
    const cap = HOTEL_INR_CAPS[budgetLevel] || HOTEL_INR_CAPS.Budget;
    const dest = itinData?.destination || '';
    const nights = itinData?.duration_days || 1;
    const googleHotelsUrl = buildGoogleHotelsUrl(dest, budgetLevel, null, nights);
    const realHotels = (day?.hotels || []).filter(h => h?.verified);

    const areaEntry = Object.entries(BUDGET_AREAS).find(([city]) =>
      dest.toLowerCase().includes(city.toLowerCase())
    );
    const areas = areaEntry?.[1] || [];

    const platforms = [
      {
        name: 'Google Hotels',
        icon: '🔍',
        color: '#4285F4',
        bg: 'rgba(66,133,244,0.1)',
        border: 'rgba(66,133,244,0.25)',
        url: googleHotelsUrl,
        desc: 'Live prices, real photos, instant booking'
      },
      {
        name: 'MakeMyTrip',
        icon: '🏨',
        color: '#E8334A',
        bg: 'rgba(232,51,74,0.1)',
        border: 'rgba(232,51,74,0.25)',
        url: `https://www.makemytrip.com/hotels/hotel-listing/?checkin=03212026&checkout=03222026&roomcount=1&city=${encodeURIComponent(dest)}&country=IN&budgetMax=${cap.max}`,
        desc: 'Best deals for Indian travellers'
      },
      {
        name: 'OYO Rooms',
        icon: '🛏️',
        color: '#EE2E24',
        bg: 'rgba(238,46,36,0.1)',
        border: 'rgba(238,46,36,0.25)',
        url: `https://www.oyorooms.com/search/?location=${encodeURIComponent(dest)}&budget_max=${cap.max}`,
        desc: `Budget stays ${cap.label}`
      },
      {
        name: 'Zostel',
        icon: '🎒',
        color: '#10B981',
        bg: 'rgba(16,185,129,0.1)',
        border: 'rgba(16,185,129,0.2)',
        url: `https://www.zostel.com/zostel/${String(dest || '').toLowerCase().replace(/\s+/g,'-')}/`,
        desc: 'Backpacker hostels & social stays'
      },
      {
        name: 'Booking.com',
        icon: '🌐',
        color: '#003580',
        bg: 'rgba(0,53,128,0.1)',
        border: 'rgba(0,53,128,0.25)',
        url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}&price_max=${cap.max}&nflt=price%3D0-${cap.max}`,
        desc: 'Free cancellation options available'
      },
    ];

    return (
      <div style={{ marginTop:24 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1 }}>🏨 Where to Stay Tonight</h4>
          <span style={{ fontSize:11, color:'#64748B', background:'#1E293B', border:'1px solid #334155', padding:'3px 8px', borderRadius:20 }}>{cap.label}</span>
        </div>

        {realHotels.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <p style={{ fontSize:11, color:'#64748B', marginBottom:8 }}>✓ Verified stays nearby:</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {realHotels.slice(0, 4).map((h, i) => (
                <div
                  key={`${h.place_id || h.name || 'hotel'}-${i}`}
                  style={{
                    display:'block', background:'#1E293B', border:'1px solid #334155', borderRadius:12,
                    padding:10, color:'#F1F5F9', position:'relative', overflow:'visible'
                  }}
                >
                  {h.photo_url && (
                    <img
                      src={h.photo_url}
                      alt={h.name}
                      style={{ width:'100%', height:72, objectFit:'cover', borderRadius:8, marginBottom:8 }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div style={{ fontSize:12, fontWeight:500, marginBottom:3 }}>{h.name}</div>
                  <div style={{ fontSize:10, color:'#64748B', marginBottom:4 }}>
                    {typeof h.rating === 'number' ? `★ ${h.rating}` : 'No rating'}
                    {h.user_ratings_total ? ` (${Number(h.user_ratings_total).toLocaleString()})` : ''}
                  </div>
                  <div style={{ fontSize:12, color:'#F59E0B' }}>
                    ₹{h.price_inr || Math.round((h.price_usd || 6) * 83.5)} / night
                  </div>

                  <HotelBookingDropdown hotel={h} destination={itinData?.destination} />
                </div>
              ))}
            </div>
          </div>
        )}

        {areas.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <p style={{ fontSize:11, color:'#64748B', marginBottom:8 }}>💡 Budget-friendly areas in {dest}:</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {areas.map(area => (
                <a
                  key={area}
                  href={`https://www.google.com/travel/hotels/search?q=hotels+in+${encodeURIComponent(`${area} ${dest}`)}&price_max=${cap.max}&currency=INR`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)',
                    color:'#A5B4FC', fontSize:11, padding:'4px 10px', borderRadius:20,
                    textDecoration:'none', transition:'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                >
                  📍 {area} ↗
                </a>
              ))}
            </div>
          </div>
        )}

        <a
          href={googleHotelsUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
            background:'rgba(66,133,244,0.08)', border:'1.5px solid rgba(66,133,244,0.3)',
            borderRadius:14, textDecoration:'none', marginBottom:12, transition:'all 0.2s', cursor:'pointer'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(66,133,244,0.14)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(66,133,244,0.08)'}
        >
          <div style={{ width:42, height:42, borderRadius:10, background:'rgba(66,133,244,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🔍</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:500, fontSize:14, color:'#F1F5F9', marginBottom:2 }}>Search Real Hotels in {dest}</div>
            <div style={{ fontSize:12, color:'#64748B' }}>Live prices · Real photos · {cap.label}</div>
          </div>
          <div style={{ fontSize:12, color:'#60A5FA', fontWeight:500, flexShrink:0 }}>Open ↗</div>
        </a>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {platforms.slice(1).map(p => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display:'flex', alignItems:'center', gap:10, padding:'11px 12px',
                background:p.bg, border:`1px solid ${p.border}`, borderRadius:12,
                textDecoration:'none', transition:'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
            >
              <span style={{ fontSize:20 }}>{p.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:p.color, marginBottom:1 }}>{p.name}</div>
                <div style={{ fontSize:10, color:'#64748B' }}>{p.desc}</div>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:10, fontSize:11, color:'#64748B', lineHeight:1.6 }}>
          💡 We link to live hotel search so you always see real availability and current prices — not outdated suggestions.
        </div>
      </div>
    );
  }, [buildGoogleHotelsUrl]);

  const renderFoodCard = useCallback((food, index) => {
    const googleMapsUrl = food.maps_url || (
      food.lat && food.lng
        ? `https://www.google.com/maps/search/?api=1&query=${food.lat},${food.lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${food.restaurant || food.name || 'restaurant'} ${itin?.destination || ''}`.trim())}`
    );

    const googleSearchUrl = food.google_search_url || `https://www.google.com/search?q=${encodeURIComponent(`${food.restaurant || food.name || 'restaurant'} ${itin?.destination || ''} restaurant`.trim())}`;

    return (
      <div
        key={index}
        className="food-card"
        style={{ position:'relative', cursor:'pointer' }}
        onClick={() => window.open(googleMapsUrl, '_blank')}
      >
        {food.photo_url ? (
          <img
            src={food.photo_url}
            alt={food.name}
            style={{ width:'100%', height:100, objectFit:'cover', borderRadius:8, marginBottom:10 }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ fontSize:32, marginBottom:8, textAlign:'center' }}>{food.emoji}</div>
        )}

        {food.verified && (
          <div style={{
            position:'absolute', top:8, left:8,
            background:'rgba(16,185,129,0.9)', color:'white',
            fontSize:9, padding:'2px 6px', borderRadius:20, fontWeight:600
          }}>
            ✓ REAL
          </div>
        )}

        <div style={{
          position:'absolute', top:8, right:8,
          background:'rgba(15,23,42,0.85)',
          color:'#64748B', fontSize:10,
          padding:'2px 6px', borderRadius:20
        }}>#{index+1}</div>

        <div style={{ fontWeight:500, fontSize:14, marginBottom:2 }}>{food.name}</div>
        <div style={{ color:'#64748B', fontSize:11, marginBottom:4 }}>
          {food.address ? String(food.address).split(',').slice(0,2).join(',') : food.restaurant}
        </div>

        {food.rating && (
          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:8 }}>
            <span style={{ color:'#F59E0B', fontSize:12 }}>★</span>
            <span style={{ fontSize:12, fontWeight:500 }}>{food.rating}</span>
            {food.user_ratings_total > 0 && (
              <span style={{ fontSize:11, color:'#64748B' }}>
                ({Number(food.user_ratings_total).toLocaleString()} reviews)
              </span>
            )}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ color:'#F59E0B', fontWeight:500 }}>₹{food.cost_inr || Math.round((food.cost_usd || 2) * 83.5)}</span>
          <span style={{
            background:'rgba(16,185,129,0.1)', color:'#10B981',
            fontSize:10, padding:'2px 8px', borderRadius:20
          }}>
            {food.meal_type}
          </span>
        </div>

        {food.is_open_now !== undefined && (
          <div style={{ fontSize:10, marginBottom:8, color: food.is_open_now ? '#10B981' : '#F87171' }}>
            {food.is_open_now ? '🟢 Open now' : '🔴 Currently closed'}
          </div>
        )}

        <div style={{ display:'flex', gap:6 }}>
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flex:1, textAlign:'center',
              padding:'7px 8px',
              background:'rgba(16,185,129,0.1)',
              border:'1px solid rgba(16,185,129,0.2)',
              color:'#10B981', borderRadius:8,
              fontSize:11, textDecoration:'none', fontWeight:500
            }}
          >
            📍 Maps
          </a>
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flex:1, textAlign:'center',
              padding:'7px 8px',
              background:'rgba(99,102,241,0.1)',
              border:'1px solid rgba(99,102,241,0.2)',
              color:'#A5B4FC', borderRadius:8,
              fontSize:11, textDecoration:'none', fontWeight:500
            }}
          >
            🔍 Search
          </a>
        </div>
      </div>
    );
  }, [itin]);

  // ── Effects ──
  useEffect(() => {
    const su = localStorage.getItem('travelUser');
    const gu = sessionStorage.getItem('travelGuest');
    if (su) {
      const u = JSON.parse(su);
      setUser(u);
      setNameInput(u?.name || '');
      setPage('dashboard');
      if (!u.isGuest) loadUserPreferences(u.token);
    } else if (gu) {
      const u = JSON.parse(gu);
      setUser(u);
      setNameInput(u?.name || '');
      setPage('dashboard');
    }

    const savedPrefsRaw = localStorage.getItem(PREFS_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    let resolved = defaultPrefs;
    if (savedPrefsRaw) {
      try {
        resolved = {
          ...defaultPrefs,
          ...JSON.parse(savedPrefsRaw),
          notifications: {
            ...defaultPrefs.notifications,
            ...(JSON.parse(savedPrefsRaw).notifications || {})
          }
        };
      } catch {
        resolved = defaultPrefs;
      }
    }
    if (savedTheme) resolved.theme = savedTheme;
    setPrefs(resolved);
    applyTheme(resolved.theme);
    setActiveCur(resolved.currency || 'USD');
    setActivePace(resolved.pace || 'balanced');

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

    fetch(`${API_BASE}/health`)
      .then(r => r.json())
      .then(d => console.log('Backend status:', d.status))
      .catch(() => console.log('Backend waking up...'));
  }, [loadUserPreferences]);

  useEffect(() => {
    applyTheme(prefs.theme);
  }, [prefs]);

  useEffect(() => {
    if (user && !user.isGuest) {
      loadSavedTrips(user);
      setNameInput(user?.name || '');
    }
  }, [user, loadSavedTrips]);

  useEffect(() => {
    setRankBy('recommended');
  }, [activeTab]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (drawer) { setDrawer(null); setActiveStop(null); }
        if (resetModal) setResetModal(false);
        if (unsavedModal) setUnsavedModal(false);
        if (dropdownOpen) setDropdownOpen(false);
        if (deleteModal) setDeleteModal('');
      }
      if (e.key === 'ArrowRight' && page==='itinerary') {
        const next = Math.min(activeDay + 1, itin?.days?.length || 1);
        switchDay(next);
      }
      if (e.key === 'ArrowLeft' && page==='itinerary') {
        switchDay(Math.max(activeDay - 1, 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawer, resetModal, unsavedModal, activeDay, page, itin, dropdownOpen, deleteModal]);

  useEffect(() => {
    if (page === 'saved') {
      if (user && !user.isGuest) {
        loadSavedTrips(user);
      }
      setSavedLoading(true);
      const t = setTimeout(() => setSavedLoading(false), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [page, user, loadSavedTrips]);

  useEffect(() => {
    if (page === 'chat' && history.length === 0) {
      setTimeout(() => setHistory([{ from:'bot', text: QUESTIONS[0] }]), 400);
    }
  }, [page, QUESTIONS, history.length]);

  useEffect(() => {
    if (page === 'chat' && qIdx === 0 && chatData.origin && !textInput) {
      setTextInput(chatData.origin);
    }
  }, [page, qIdx, chatData.origin, textInput]);

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

  // Map init for itinerary render/load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (page !== 'itinerary') return;
    if (!mapReady || !itin || !mapMounted) return;
    if (!mapEl.current) return;

    if (mapRef.current) {
      try { mapRef.current.remove(); } catch (e) {}
      mapRef.current = null;
      markersRef.current = {};
      polylinesRef.current = [];
    }

    const timer = setTimeout(() => {
      try {
        const L = window.L;
        if (!L || !mapEl.current) return;

        const centerLat = itin.center_lat || itin.days?.[0]?.stops?.[0]?.lat || 20;
        const centerLng = itin.center_lng || itin.days?.[0]?.stops?.[0]?.lng || 0;

        mapRef.current = L.map(mapEl.current, { zoomControl: false }).setView([centerLat, centerLng], 12);
        updateMapLayer(L);
        L.control.zoom({ position:'bottomright' }).addTo(mapRef.current);

        setTimeout(() => {
          mapRef.current?.invalidateSize();
          renderDayOnMap(L);
        }, 100);
      } catch (e) {
        console.error('Map init error:', e);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [page, mapReady, itin, mapMounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mapRef.current || !itin || !mapReady) return;
    const L = window.L;
    if (!L) return;
    try {
      mapRef.current.invalidateSize();
      renderDayOnMap(L);
    } catch(e) {}
  }, [activeDay, mapLayer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page !== 'itinerary') {
      setMapMounted(false);
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (e) {}
        mapRef.current = null;
      }
      markersRef.current = {};
      polylinesRef.current = [];
    }
  }, [page]);

  const updateMapLayer = useCallback((L) => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer(l => { if (l._url) mapRef.current.removeLayer(l); });
    const tiles = {
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    };
    L.tileLayer(tiles[mapLayer] || tiles.dark, { attribution:'© Map', maxZoom:19 }).addTo(mapRef.current);
  }, [mapLayer]);

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
  }, [itin, activeDay, activeStop, transportModes, updateMapLayer]);

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
      const res = await fetch(`${API_BASE}${ep}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
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
      const sess = { userId:d.user_id||d.userId, token:d.access_token||d.token, name:d.name, email:authForm.email, isGuest:false };
      localStorage.setItem('travelUser', JSON.stringify(sess));
      setUser(sess);
      setNameInput(sess.name || '');
      await loadUserPreferences(sess.token);
      await loadSavedTrips(sess);

      const pending = sessionStorage.getItem('pendingTrip');
      if (pending) {
        try {
          const savedChat = JSON.parse(pending);
          sessionStorage.removeItem('pendingTrip');
          setChatData(savedChat);
          setReadyBuild(true);
          setHistory([{
            from: 'bot',
            text: `Welcome back! Ready to plan your trip from ${savedChat.origin} to ${savedChat.destination}?`
          }]);
          navigateTo('chat');
          showToast('✓ Signed in! Your trip details were saved.');
        } catch {
          navigateTo('dashboard');
        }
      } else {
        navigateTo('dashboard');
      }

      showToast(`✓ Welcome, ${d.name}!`);
    } catch(e) {
      const msg = String(e?.message || 'Authentication failed');
      if (msg.toLowerCase().includes('failed to fetch')) {
        setAuthErr(`Cannot reach backend at ${API_BASE}. Make sure FastAPI is running.`);
      } else {
        setAuthErr(msg);
      }
    }
  };

  const guestLogin = () => {
    const sess = { userId:`gst_${Date.now()}`, token:'', name:'Explorer', isGuest:true };
    sessionStorage.setItem('travelGuest', JSON.stringify(sess));
    setUser(sess);
    setNameInput(sess.name || 'Explorer');
    navigateTo('dashboard');
  };

  const logout = () => {
    localStorage.removeItem('travelUser'); sessionStorage.removeItem('travelGuest');
    setUser(null);
    setDropdownOpen(false);
    navigateTo('auth');
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

    if (!user || !user.token || user.isGuest) {
      setLoading(false);
      setAuthPromptModal(true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/plan`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${user.token}` },
        body: JSON.stringify({
          origin:chatData.origin, destination:chatData.destination,
          origin_lat:chatData.originLat, origin_lng:chatData.originLng,
          dest_lat:chatData.destLat, dest_lng:chatData.destLng,
          days:chatData.days, comfort_radius:chatData.comfort_radius, vibes:chatData.vibes,
          comfort_radius_km: chatData.comfort_radius_km || null,
          group_type:chatData.group_type, budget_level:chatData.budget_level,
          special_requests:chatData.special_requests,
          pace: activePace,
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errDetail = typeof errData?.detail === 'string'
          ? errData.detail
          : Array.isArray(errData?.detail)
            ? errData.detail.map(x => x?.msg || String(x)).join(', ')
            : errData?.detail
              ? String(errData.detail)
              : '';

        if (res.status === 401 || res.status === 403) {
          setLoading(false);
          localStorage.removeItem('travelUser');
          sessionStorage.removeItem('travelGuest');
          setUser(null);
          setAuthPromptModal(true);
          return;
        }

        if (res.status === 422) {
          setLoading(false);
          setError({
            title: 'Invalid request',
            msg: errDetail || 'Please check your destination and try again.',
            action: null,
            type: 'validation'
          });
          return;
        }

        if (res.status === 500) {
          setLoading(false);
          setError({
            title: 'Server error',
            msg: 'Our AI agents hit an issue. Please try again.',
            action: buildIt,
            type: 'server'
          });
          return;
        }

        throw new Error(`${res.status}: ${errDetail || 'Unknown error'}`);
      }

      const data = await res.json();
      setLoadProg(100);
      setTimeout(() => setLoading(false), 300);
      const trip = data.trip;
      trip.budget_level = chatData.budget_level;
      trip.daily_budget_usd = (() => {
        if (chatData.budget_usd_per_day?.max) return chatData.budget_usd_per_day.max;
        return TIER_DAILY_BUDGET_USD[chatData.budget_level] || 8;
      })();
      trip.vibes = chatData.vibes;
      trip.group_type = chatData.group_type;
      trip.comfort_radius = chatData.comfort_radius;
      trip.comfort_radius_km = chatData.comfort_radius_km;
      trip.pace = activePace;
      const maxStops = STOPS_PER_PACE[activePace] || 4;
      const sanitizedTrip = {
        ...trip,
        days: (trip.days || []).map(day => ({
          ...day,
          stops: (day.stops || []).filter(isValidTouristStop).slice(0, maxStops)
        }))
      };

      sanitizedTrip.days.forEach(day => {
        if (!day.stops || day.stops.length === 0) {
          day.stops = [{
            name: `Explore ${trip.destination}`,
            description: 'Free exploration day - discover local gems',
            category: 'Leisure',
            cost_usd: 0,
            duration_minutes: 480,
            lat: trip.center_lat,
            lng: trip.center_lng,
            pro_tip: 'Ask locals for hidden gems not on tourist maps',
          }];
        }
      });

      const optimizedTrip = {
        ...sanitizedTrip,
        days: (sanitizedTrip.days || []).map(day => ({
          ...day,
          stops: nearestNeighborSort((day.stops || []).slice(0, 4))
        }))
      };
      setItin(optimizedTrip);
      setTripSaved(false);
      setActiveDay(1);
      setActiveCur(trip.local_currency in EXCHANGE ? trip.local_currency : 'INR');
      setActivePace(prefs.pace || 'balanced');
      setCompletedStops({});
      setPage('itinerary');
      const lat = trip.center_lat || chatData.destLat;
      const lng = trip.center_lng || chatData.destLng;
      if (lat && lng) fetchWeather(lat, lng).then(setWeather).catch(()=>{});
    } catch(e) {
      setLoading(false);

      const msg = String(e?.message || '');
      const isNetwork = !e?.status
        || msg.toLowerCase().includes('fetch')
        || msg.toLowerCase().includes('network')
        || msg.toLowerCase().includes('failed to fetch');

      if (isNetwork) {
        setError({
          title: 'Cannot reach server',
          msg: 'The server may be starting up. Please wait 30 seconds and try again.',
          action: buildIt,
          type: 'network',
          showWakeUp: true,
        });
        return;
      }

      setError({
        title: "Couldn't build your itinerary",
        msg: e?.message || 'Something went wrong.',
        action: buildIt,
        type: 'unknown'
      });
    }
  };

  const fetchWeather = async (lat, lng) => {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current_weather=true&timezone=auto&forecast_days=7`);
    return r.json();
  };

  // ── Reset ──
  const startNew = (q=0, force=false) => {
    if (itin && !force) { setPendingReset(q); setResetModal(true); return; }
    setChatData({
      origin: prefs.defaultOrigin || '',
      destination:'',
      originLat:null,
      originLng:null,
      destLat:null,
      destLng:null,
      days:null,
      comfort_radius:'',
      comfort_radius_km:null,
      vibes:[...(prefs.defaultVibes || [])],
      group_type:prefs.defaultGroup || '',
      budget_level:'',
      budget_usd_per_day:null,
      special_requests:''
    });
    setHistory([]); setQIdx(0); setItin(null); setWeather(null);
    setSugg([]); setError(null); setTextInput(''); setReadyBuild(false);
    setCustomBudget(''); setShowCustomBudget(false);
    setCustomRadius(''); setShowCustomRadius(false);
    setActiveDay(1); setCompletedStops({}); setDrawer(null); setActiveStop(null);
    setTripSaved(false); setSaving(false); setUnsavedModal(false);
    showToast('↺ Trip reset');
    navigateTo('chat');
  };

  const switchDay = (d) => {
    setDayTransition(true);
    setTimeout(() => { setActiveDay(d); setDayTransition(false); }, 200);
  };

  const toggleStopComplete = (key) => {
    setCompletedStops(p => ({ ...p, [key]: !p[key] }));
    showToast('✓ Stop marked as visited');
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
    showToast('📋 Packing list copied!');
  };

  const submitCustomBudget = () => {
    const amount = Number(customBudget);
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) return;
    const mappedTier = budgetTierFromAmount(amount);
    setChatData(p => ({
      ...p,
      budget_level: mappedTier,
      budget_usd_per_day: { min: amount, max: amount }
    }));
    addMsg('user', `💵 Custom budget: $${amount}/day`);
    setShowCustomBudget(false);
    setCustomBudget('');
    advanceQ(7);
  };

  const exportMyData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user: { name: user?.name, id: user?.userId, isGuest: !!user?.isGuest },
      savedTrips
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'travelmind-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-primary)', color:'var(--text-primary)', fontFamily:'system-ui,-apple-system,sans-serif' }}>
      <style>{`
        :root {
          --bg-primary: #0F172A;
          --bg-surface: #1E293B;
          --bg-elevated: #273549;
          --text-primary: #F1F5F9;
          --text-secondary: #94A3B8;
          --text-muted: #64748B;
          --border: #334155;
          --border-subtle: #1E293B;
          --accent: #6366F1;
          --accent-cyan: #0EA5E9;
          --accent-emerald: #10B981;
          --accent-amber: #F59E0B;
        }
        [data-theme="light"] {
          --bg-primary: #F8FAFC;
          --bg-surface: #FFFFFF;
          --bg-elevated: #F1F5F9;
          --text-primary: #0F172A;
          --text-secondary: #475569;
          --text-muted: #94A3B8;
          --border: #E2E8F0;
          --border-subtle: #F1F5F9;
        }
        *{box-sizing:border-box;margin:0;padding:0;}
        body{margin:0;}
        @keyframes ripple{from{transform:scale(0);opacity:0.4;}to{transform:scale(4);opacity:0;}}
        @keyframes bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(24px);}to{opacity:1;transform:translateX(0);}}
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

        .btn-secondary{background:transparent;border:1px solid var(--border);color:var(--text-secondary);padding:10px 20px;border-radius:10px;cursor:pointer;transition:all 0.2s;font-size:14px;}
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

        input,textarea{background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:12px 14px;font-size:14px;font-family:inherit;width:100%;transition:all 0.2s;outline:none;}
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

      <div style={{ opacity: pageTransition ? 0 : 1, transition: 'opacity 0.18s ease' }}>

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
          <div className="navbar" style={{ position:'sticky', top:0, zIndex:1000, isolation:'isolate', background:'rgba(15,23,42,0.95)', backdropFilter:'blur(14px)', borderBottom:'1px solid #1E293B', padding:'0 20px', display:'flex', justifyContent:'space-between', alignItems:'center', height:56, marginBottom:48 }}>
            <span style={{ fontSize:20, fontWeight:500 }}>✈️ TravelMind</span>
            <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative' }} ref={dropdownRef}>
              <button className="btn-secondary" style={{ fontSize:13 }} onClick={openSavedTrips}>My Trips</button>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, cursor:'pointer' }} onClick={()=>setDropdownOpen(p=>!p)}>
                {initials(user.name)}
              </div>
              {dropdownOpen && (
                <div className="dropdown" style={{ position:'fixed', top:56, right:16, zIndex:9999, background:'#1E293B', border:'1px solid #334155', borderRadius:14, padding:8, minWidth:220, boxShadow:'0 16px 48px rgba(0,0,0,0.6)', animation:'fadeUp 0.2s ease' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 10px 10px' }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', background:'linear-gradient(135deg,#6366F1,#0EA5E9)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600 }}>{initials(user?.name)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:14 }}>{user?.name || 'Traveler'}</div>
                      <div style={{ fontSize:12, color:'#94A3B8', display:'flex', justifyContent:'space-between' }}>
                        <span>{user?.email || 'user@email.com'}</span><span>{user?.isGuest ? 'Guest' : 'User'}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ borderTop:'1px solid #334155', margin:'4px 0' }} />
                  {[
                    ['👤 My Profile', () => navigateTo('profile')],
                    ['🗺️ My Trips', openSavedTrips],
                    ['⚙️ Settings', () => navigateTo('settings')],
                  ].map(([label, action]) => (
                    <div key={label} onClick={action} style={{ padding:'10px 12px', cursor:'pointer', fontSize:14, borderRadius:8 }} onMouseEnter={(e)=>{e.currentTarget.style.background='#273549';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
                      {label}
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid #334155', margin:'4px 0' }} />
                  <div onClick={logout} style={{ padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#F87171', borderRadius:8 }} onMouseEnter={(e)=>{e.currentTarget.style.background='#273549';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
                    🚪 Sign Out
                  </div>
                </div>
              )}
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
            <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:28, cursor:'pointer' }} onClick={openSavedTrips}>
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
            <button className="btn-secondary" style={{ padding:'8px 14px', fontSize:13 }} onClick={()=>navigateTo('dashboard')}>← Back</button>
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
                alignItems:'flex-end',
                gap:6,
              }}>
                {m.from==='bot' && <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>✈️</div>}
                <div style={{
                  maxWidth:'78%', padding:'12px 16px', borderRadius:m.from==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',
                  background:m.from==='user'?'linear-gradient(135deg,#4F46E5,#6366F1)':'#1E293B',
                  border:'1px solid',
                  borderColor:m.from==='user'?'transparent':'#334155',
                  fontSize:14, lineHeight:1.6,
                }}>
                  {m.text}
                </div>
                {m.from==='user' && !readyBuild && (
                  <button
                    onClick={() => editAnswer(i)}
                    style={{
                      background:'none',
                      border:'1px solid #334155',
                      color:'#475569', borderRadius:8,
                      width:26, height:26, cursor:'pointer',
                      fontSize:11, display:'flex',
                      alignItems:'center', justifyContent:'center',
                      flexShrink:0, transition:'all 0.2s',
                    }}
                    title="Edit this answer"
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor='#6366F1';
                      e.currentTarget.style.color='#A5B4FC';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor='#334155';
                      e.currentTarget.style.color='#475569';
                    }}
                  >
                    ✏️
                  </button>
                )}
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
                  {suggLoad && (
                    <div style={{ marginTop:8, fontSize:11, color:'#64748B' }}>Searching places...</div>
                  )}
                </div>
                <RippleBtn className="btn-primary" onClick={submitText} style={{ width:'100%', marginTop:12 }}>
                  {qIdx===7 ? 'Build My Itinerary →' : 'Continue →'}
                </RippleBtn>
              </div>
            )}

            {/* Q2 days */}
            {qIdx===2 && !readyBuild && (
              <div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                  {[1,2,3,5,7,10,14].map(d => (
                    <RippleBtn
                      key={d}
                      className={`chip${chatData.days===d?' on':''}`}
                      onClick={() => {
                        setChatData(p => ({...p, days:d}));
                        addMsg('user', `${d} ${d===1?'day':'days'}`);
                        advanceQ(3);
                      }}
                    >
                      {d} {d===1?'day':'days'}
                    </RippleBtn>
                  ))}
                </div>

                {!showCustomDays ? (
                  <button
                    onClick={() => setShowCustomDays(true)}
                    style={{
                      background:'none', border:'1px dashed #334155',
                      color:'#64748B', borderRadius:10, padding:'8px 16px',
                      cursor:'pointer', fontSize:13, fontFamily:'inherit',
                      width:'100%', transition:'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor='#6366F1';
                      e.currentTarget.style.color='#A5B4FC';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor='#334155';
                      e.currentTarget.style.color='#64748B';
                    }}
                  >
                    ✏️ Enter custom number of days
                  </button>
                ) : (
                  <div style={{ display:'flex', gap:8, marginTop:4 }}>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      placeholder="How many days? (1-30)"
                      value={customDaysInput}
                      onChange={e => setCustomDaysInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') submitCustomDays();
                      }}
                      autoFocus
                      style={{
                        flex:1, background:'#1E293B',
                        border:'1px solid #6366F1',
                        borderRadius:10, padding:'10px 14px',
                        color:'#F1F5F9', fontSize:14,
                        fontFamily:'inherit',
                      }}
                    />
                    <RippleBtn
                      className="btn-primary"
                      onClick={submitCustomDays}
                      style={{ padding:'10px 18px', flexShrink:0 }}
                    >
                      Set
                    </RippleBtn>
                    <button
                      onClick={() => {
                        setShowCustomDays(false);
                        setCustomDaysInput('');
                      }}
                      className="btn-secondary"
                      style={{ padding:'10px 14px', flexShrink:0 }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Q3 comfort radius */}
            {qIdx===3 && !readyBuild && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {radiusOptions.map(opt => {
                    const selected = chatData.comfort_radius === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => {
                          setChatData(p => ({ ...p, comfort_radius:opt.value, comfort_radius_km:null }));
                          addMsg('user', `${opt.icon} ${opt.label} (${opt.sub})`);
                          advanceQ(4);
                        }}
                        style={{
                          background: selected ? 'rgba(99,102,241,0.12)' : '#1E293B',
                          border: `2px solid ${selected ? '#6366F1' : '#334155'}`,
                          borderRadius:14, padding:'16px 12px',
                          textAlign:'center', cursor:'pointer',
                          transition:'all 0.2s',
                        }}
                        onMouseEnter={e => {
                          if (!selected) {
                            e.currentTarget.style.borderColor='#6366F1';
                            e.currentTarget.style.background='rgba(99,102,241,0.06)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!selected) {
                            e.currentTarget.style.borderColor='#334155';
                            e.currentTarget.style.background='#1E293B';
                          }
                        }}
                      >
                        <div style={{ fontSize:28, marginBottom:6 }}>{opt.icon}</div>
                        <div style={{ fontWeight:500, fontSize:14 }}>{opt.label}</div>
                        <div style={{ color:'#6366F1', fontSize:12, fontWeight:500, marginTop:2 }}>
                          {opt.sub}
                        </div>
                        <div style={{ color:'#475569', fontSize:10, marginTop:4, lineHeight:1.4 }}>
                          {opt.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop:10 }}>
                  {!showCustomRadius ? (
                    <button
                      onClick={() => setShowCustomRadius(true)}
                      style={{
                        background:'none',
                        border:'1px dashed #334155',
                        color:'#64748B', borderRadius:10,
                        padding:'8px 16px', cursor:'pointer',
                        fontSize:13, fontFamily:'inherit',
                        width:'100%', transition:'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor='#6366F1';
                        e.currentTarget.style.color='#A5B4FC';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor='#334155';
                        e.currentTarget.style.color='#64748B';
                      }}
                    >
                      📏 Enter custom km radius
                    </button>
                  ) : (
                    <div style={{ display:'flex', gap:8 }}>
                      <div style={{ position:'relative', flex:1 }}>
                        <input
                          type="number"
                          min={1}
                          max={500}
                          placeholder="Max km between stops (e.g. 15)"
                          value={customRadius}
                          onChange={e => setCustomRadius(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') submitCustomRadius();
                          }}
                          autoFocus
                        />
                        <span style={{
                          position:'absolute', right:12, top:'50%',
                          transform:'translateY(-50%)',
                          color:'#64748B', fontSize:12,
                          pointerEvents:'none',
                        }}>km</span>
                      </div>
                      <RippleBtn
                        className="btn-primary"
                        onClick={submitCustomRadius}
                        style={{ padding:'10px 16px', flexShrink:0 }}
                      >
                        Set
                      </RippleBtn>
                      <button
                        onClick={() => {
                          setShowCustomRadius(false);
                          setCustomRadius('');
                        }}
                        className="btn-secondary"
                        style={{ padding:'10px 12px', flexShrink:0 }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
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
                  <RippleBtn key={g} className={`chip${chatData.group_type===g?' on':''}`} onClick={()=>{
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
                        setChatData(p => ({
                          ...p,
                          budget_level: opt.value,
                          budget_usd_per_day: budgetRangeMap[opt.value] || null,
                        }));
                        addMsg('user', `${opt.icon} ${opt.label} — ${opt.range}/day (${opt.inr_range})`);
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
                      <div style={{ color: opt.color, fontSize:14, fontWeight:500 }}>{opt.range}/day</div>
                      <div style={{ color:'#64748B', fontSize:11, marginBottom:6 }}>≈ {opt.inr_range}</div>
                      <div style={{ color:'#475569', fontSize:11, lineHeight:1.5 }}>{opt.examples}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:10, fontSize:12, color:'#94A3B8' }}>
                  💡 All hotel, food and activity costs in your itinerary will be filtered to stay within this daily budget
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
                      placeholder="Daily budget in USD (e.g. 15)"
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
                {showCustomBudget && (
                  <p style={{ fontSize:11, color:'#64748B', marginTop:4 }}>
                    ≈ ₹{Math.round((customBudget || 0) * 83.5).toLocaleString('en-IN')}/day at current rates
                  </p>
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
            <div style={{
              background: error.type === 'network'
                ? 'rgba(245,158,11,0.08)'
                : 'rgba(239,68,68,0.08)',
              border: `1px solid ${error.type === 'network'
                ? 'rgba(245,158,11,0.25)'
                : 'rgba(239,68,68,0.25)'}`,
              borderRadius: 14,
              padding: 20,
              marginTop: 16,
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>
                {error.type === 'network' ? '🌐'
                  : error.type === 'validation' ? '⚠️'
                  : error.type === 'server' ? '🔧'
                  : '❌'}
              </div>

              <p style={{
                color: error.type === 'network' ? '#FCD34D' : '#FCA5A5',
                fontWeight: 500,
                marginBottom: 6,
                fontSize: 15,
              }}>
                {error.title}
              </p>

              <p style={{
                color: '#94A3B8',
                fontSize: 13,
                marginBottom: 16,
                lineHeight: 1.6,
              }}>
                {error.msg}
              </p>

              {error.showWakeUp && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 12,
                  color: '#FCD34D',
                  marginBottom: 16,
                  lineHeight: 1.6,
                }}>
                  💡 On Render free tier, the server sleeps after inactivity and takes around 30 seconds to wake up. Click "Try Again" after waiting a moment.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {error.action && (
                  <RippleBtn
                    className="btn-primary"
                    onClick={error.action}
                    style={{ flex: 1 }}
                  >
                    🔄 Try Again
                  </RippleBtn>
                )}
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setError(null);
                    setReadyBuild(false);
                    setQIdx(0);
                    setHistory([]);
                    setPage('chat');
                  }}
                  style={{ flex: 1 }}
                >
                  Start Over
                </button>
              </div>
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
          <div className="navbar" style={{ position:'sticky', top:0, zIndex:1000, isolation:'isolate', background:'rgba(15,23,42,0.95)', backdropFilter:'blur(14px)', borderBottom:'1px solid #1E293B', padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56 }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <button className="btn-secondary" style={{ padding:'6px 12px', fontSize:13 }} onClick={handleNewTrip}>← New Trip</button>
              <span style={{ color:'#64748B', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
                ✈️ <strong style={{ color:'#F1F5F9' }}>{itin.origin}</strong>
                <span style={{ color:'#334155' }}>→</span>
                <strong style={{ color:'#F1F5F9' }}>{itin.destination}</strong>
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }} ref={dropdownRef}>
              {weather?.current_weather && (
                <span style={{ background:'#1E293B', padding:'4px 10px', borderRadius:20, fontSize:12, color:'#94A3B8' }}>
                  {wxFor(weather.current_weather.weathercode)?.e} {Math.round(weather.current_weather.temperature)}°C
                </span>
              )}
              <button className="btn-secondary" style={{ fontSize:13, padding:'6px 12px' }} onClick={openSavedTrips}>My Trips</button>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, cursor:'pointer' }} onClick={()=>setDropdownOpen(p=>!p)}>
                {initials(user?.name)}
              </div>
              {dropdownOpen && (
                <div className="dropdown" style={{ position:'fixed', top:56, right:16, zIndex:9999, background:'#1E293B', border:'1px solid #334155', borderRadius:14, padding:8, minWidth:220, boxShadow:'0 16px 48px rgba(0,0,0,0.6)', animation:'fadeUp 0.2s ease' }}>
                  {[
                    ['👤 My Profile', () => navigateTo('profile')],
                    ['🗺️ My Trips', openSavedTrips],
                    ['⚙️ Settings', () => navigateTo('settings')],
                  ].map(([label, action]) => (
                    <div key={label} onClick={action} style={{ padding:'10px 12px', cursor:'pointer', fontSize:14, borderRadius:8 }} onMouseEnter={(e)=>{e.currentTarget.style.background='#273549';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
                      {label}
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid #334155', margin:'4px 0' }} />
                  <div onClick={logout} style={{ padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#F87171', borderRadius:8 }} onMouseEnter={(e)=>{e.currentTarget.style.background='#273549';}} onMouseLeave={(e)=>{e.currentTarget.style.background='transparent';}}>
                    🚪 Sign Out
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="split" style={{ display:'grid', gridTemplateColumns:'42% 58%', height:'calc(100vh - 56px)' }}>

            {/* ── LEFT PANEL ── */}
            <div style={{ overflowY:'auto', borderRight:'1px solid #1E293B', display:'flex', flexDirection:'column' }}>

              {/* Trip header */}
              <div style={{ padding:'20px 20px 0', background:'linear-gradient(180deg,#1E293B 0%,transparent 100%)', borderBottom:'1px solid #1E293B', paddingBottom:16 }}>

                {/* Mood board pills */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  {[`✈️ ${itin.duration_days} Days`, `💰 Budget: ${SYM[activeCur]}${conv((itin?.daily_budget_usd || 8) * (itin?.duration_days || 1),activeCur).toLocaleString()}`, `📍 ${itin.days?.reduce((a,d)=>a+(d.stops?.length||0),0)} stops`, ...(itin.vibes||[]).map(v=>`${CAT_EMOJI[v]||'🎯'} ${v}`), itin.comfort_radius ? ({ walkable:'🚶 Walkable', city:'🚗 City range', regional:'🛣️ Regional', flexible:'✈️ Flexible range' }[itin.comfort_radius] || (Number.isFinite(Number(itin?.comfort_radius_km)) ? `📏 ${Number(itin.comfort_radius_km)} km radius` : null)) : null, budgetPillMap[itin.budget_level], `${itin.group_type==='Solo'?'🧍':itin.group_type==='Couple'?'💑':itin.group_type==='Family'?'👨‍👩‍👧':'👫'} ${itin.group_type}`].filter(Boolean).map((pill,i) => (
                    <span key={i} style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.2)', color:'#A5B4FC', fontSize:11, padding:'4px 10px', borderRadius:20 }}>{pill}</span>
                  ))}
                </div>

                {/* Pace selector */}
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                  {[
                    { key:'relaxed', e:'🐢', label:'Relaxed', stops:3 },
                    { key:'balanced', e:'⚡', label:'Balanced', stops:4 },
                    { key:'fastpaced', e:'🚀', label:'Fast-paced', stops:5 },
                  ].map(p => (
                    <RippleBtn key={p.key} className={`chip${activePace===p.key?' on':''}`} onClick={()=>setActivePace(p.key)} style={{ fontSize:12, padding:'6px 14px' }}>
                      {p.e} {p.label}
                      <span style={{
                        fontSize:10,
                        color: activePace===p.key ? 'rgba(255,255,255,0.7)' : '#475569',
                        marginLeft:4,
                      }}>
                        {p.stops}/day
                      </span>
                    </RippleBtn>
                  ))}
                  <div style={{ flex:1 }}/>
                  {!tripSaved && (
                    <RippleBtn
                      onClick={saveTrip}
                      style={{
                        background: tripSaved
                          ? 'rgba(16,185,129,0.15)'
                          : 'linear-gradient(135deg,#10B981,#059669)',
                        border: tripSaved ? '1px solid #10B981' : 'none',
                        color: 'white',
                        borderRadius: 10,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: tripSaved ? 'default' : 'pointer',
                        transition: 'all 0.3s'
                      }}
                      disabled={tripSaved || saving}
                    >
                      {saving ? '⏳ Saving...' : tripSaved ? '✓ Saved' : '💾 Save Trip'}
                    </RippleBtn>
                  )}
                  <RippleBtn className="btn-secondary" style={{ fontSize:12, padding:'6px 12px' }} onClick={handleNewTrip}>↺ Replan</RippleBtn>
                </div>

                {/* Currency */}
                <div style={{ marginBottom:12, maxWidth:220 }}>
                  <CustomDropdown
                    label="Currency"
                    value={activeCur}
                    onChange={(c) => { setActiveCur(c); setPrefs(p => ({ ...p, currency:c })); }}
                    options={Object.keys(EXCHANGE).map(c => ({ value:c, label:`${SYM[c]} ${c}` }))}
                  />
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

                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'8px 12px', background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.15)', borderRadius:10 }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:500 }}>🎯 Comfort zone filter</span>
                    <span style={{ fontSize:11, color:'#64748B', marginLeft:8 }}>
                      {comfortFilter ? 'Showing only items within your budget & radius' : 'Showing all items'}
                    </span>
                  </div>
                  <div onClick={() => setComfortFilter(p => !p)} style={{ width:44, height:24, borderRadius:12, cursor:'pointer', background: comfortFilter ? '#6366F1' : '#334155', position:'relative', transition:'background 0.3s', flexShrink:0 }}>
                    <div style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute', top:3, left: comfortFilter ? 23 : 3, transition:'left 0.25s ease', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
                  </div>
                </div>

                <div style={{ marginBottom:14, padding:'10px 12px', background:'#1E293B', border:'1px solid #334155', borderRadius:12 }}>
                  <div style={{ fontSize:12, color:'#94A3B8', marginBottom:8 }}>Sort by:</div>
                  <div style={{ display:'flex', gap:8, overflowX:'auto', whiteSpace:'nowrap' }}>
                    {relevantRanks.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRankBy(r.value)}
                        style={{
                          padding:'6px 14px',
                          fontSize:12,
                          borderRadius:20,
                          border:`1px solid ${rankBy===r.value ? '#6366F1' : '#334155'}`,
                          background: rankBy===r.value ? '#6366F1' : 'transparent',
                          color: rankBy===r.value ? '#FFFFFF' : '#64748B',
                          cursor:'pointer',
                          fontFamily:'inherit',
                          flexShrink:0,
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                        {rerankedStops.length} stops • ~{rerankedStops.reduce((a,s)=>a+s._dur,0)} min
                        {' • '}{Object.keys(completedStops).filter(k=>k.startsWith(`${activeDay}-`)&&completedStops[k]).length} of {rerankedStops.length} visited
                      </p>
                      {weatherDay(activeDay-1)?.rain > 70 && (
                        <div style={{ marginTop:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#FCD34D' }}>
                          🌧️ Rain likely today — indoor stops highlighted with 🏛️
                        </div>
                      )}
                    </div>

                    {/* Route summary */}
                    <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:12, padding:'14px 16px', marginBottom:16, fontSize:13 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <div style={{ fontSize:11, color:'#64748B', textTransform:'uppercase', letterSpacing:0.8 }}>
                          📍 Today's Route
                        </div>
                        <span style={{
                          fontSize:11,
                          background: activePace==='fastpaced'
                            ? 'rgba(243,68,68,0.1)'
                            : activePace==='relaxed'
                              ? 'rgba(16,185,129,0.1)'
                              : 'rgba(99,102,241,0.1)',
                          color: activePace==='fastpaced'
                            ? '#F87171'
                            : activePace==='relaxed'
                              ? '#10B981'
                              : '#A5B4FC',
                          padding:'3px 8px', borderRadius:20,
                        }}>
                          {activePace==='fastpaced' ? '🚀 5 stops'
                            : activePace==='relaxed' ? '🐢 3 stops'
                            : '⚡ 4 stops'}
                        </span>
                      </div>
                      {rerankedStops.map((s,i)=>(
                        <div key={i}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
                            <div style={{ width:22, height:22, borderRadius:'50%', background:DAY_COLORS[(activeDay-1)%DAY_COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color:'white', flexShrink:0 }}>{i+1}</div>
                            <span style={{ color:'#F1F5F9', flex:1 }}>{s.name}</span>
                            <span style={{ color:'#64748B', fontSize:11 }}>{s._arrival}</span>
                          </div>
                          {i<rerankedStops.length-1 && <div style={{ padding:'4px 0 4px 11px', borderLeft:'2px dashed #334155', marginLeft:10, fontSize:11, color:'#64748B' }}>
                            {s.travel_to_next || '15 min'}
                          </div>}
                        </div>
                      ))}
                      <a href={`https://www.google.com/maps/dir/${rerankedStops.filter(s=>s.lat&&s.lng).map(s=>`${s.lat},${s.lng}`).join('/')}`}
                        target="_blank" rel="noreferrer"
                        style={{ display:'block', textAlign:'center', marginTop:12, padding:'8px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:8, color:'#A5B4FC', fontSize:12, textDecoration:'none' }}>
                        🗺️ Navigate Full Route in Google Maps ↗
                      </a>
                    </div>

                    {/* Stop cards */}
                    {rerankedStops.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'24px 16px', background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12 }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>🎯</div>
                        <p style={{ fontSize:14, color:'#94A3B8', marginBottom:12 }}>No items match your comfort zone</p>
                        <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => setComfortFilter(false)}>Show all options</button>
                      </div>
                    ) : (
                    <div style={{ position:'relative' }}>
                      <div style={{ position:'absolute', left:20, top:0, bottom:0, width:2, background:`linear-gradient(180deg,${DAY_COLORS[(activeDay-1)%DAY_COLORS.length]},transparent)`, opacity:0.4 }}/>
                      {rerankedStops.map((stop, i) => {
                        const key = `${activeDay}-${i}`;
                        const done = completedStops[key];
                        const isActive = activeStop===key;
                        const wx = weatherDay(activeDay-1);
                        const isIndoor = stop.indoor || /(museum|temple|church|fort|mall|gallery|culture|mosque|palace)/i.test(`${stop.name} ${stop.category}`);
                        return (
                          <div key={i}>
                            <div className={`stop-card${isActive?' active':''}`}
                              style={{ position:'relative', marginLeft:8, borderLeft:`4px solid ${done?'#10B981':isActive?'#6366F1':DAY_COLORS[(activeDay-1)%DAY_COLORS.length]}`, opacity:done?0.65:1 }}
                              onClick={()=>{ setActiveStop(key); setDrawer(stop); if(mapRef.current&&stop.lat&&stop.lng) mapRef.current.flyTo([stop.lat,stop.lng],15); }}>

                              {stop.tourist_score && (
                                <div style={{
                                  position:'absolute', top:8, left:8,
                                  background: stop.tourist_score >= 80
                                    ? 'rgba(245,158,11,0.9)'
                                    : stop.tourist_score >= 60
                                      ? 'rgba(16,185,129,0.9)'
                                      : 'rgba(99,102,241,0.9)',
                                  color:'white', fontSize:9,
                                  padding:'2px 7px', borderRadius:20,
                                  fontWeight:700,
                                }}>
                                  {stop.tourist_score >= 80 ? '⭐ ICONIC'
                                    : stop.tourist_score >= 60 ? '✓ TOP PICK'
                                    : '📍 GOOD'}
                                </div>
                              )}

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
                                <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
                                  <QualityBadge rating={stop.rating}/>
                                  {(() => {
                                    const rankReason = {
                                      price_low: `💰 ${SYM[activeCur]}${conv(stop.cost_usd, activeCur)}`,
                                      price_high: `💰 ${SYM[activeCur]}${conv(stop.cost_usd, activeCur)}`,
                                      rating: stop.rating ? `🌟 ${stop.rating}` : null,
                                      distance: stop._distFromPrev ? `📍 ${stop._distFromPrev}km` : null,
                                      duration: `⏱ ${stop._dur}min`,
                                      budget_fit: stop._withinBudget ? '✓ Fits budget' : '⚠️ Over budget',
                                    };
                                    return rankBy !== 'recommended' && rankReason[rankBy] ? (
                                      <span style={{ background:'rgba(99,102,241,0.1)', color:'#A5B4FC', fontSize:10, padding:'2px 8px', borderRadius:20 }}>
                                        {rankReason[rankBy]}
                                      </span>
                                    ) : null;
                                  })()}
                                </div>
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
                            {i<rerankedStops.length-1 && (
                              <div className="nav-connector" style={{ marginLeft:8 }}>
                                <span style={{ paddingLeft:24 }}>
                                  {['🚗','🚶','🚇'][[['drive','walk','transit'].indexOf(transportModes[`${activeDay}-${i}`]||'drive')]]} {stop.travel_to_next||'~15 min'}
                                  {stop._distFromPrev && (
                                    <span style={{ color:'#64748B', fontSize:11, marginLeft:8 }}>
                                      📏 {stop._distFromPrev} km from previous stop
                                    </span>
                                  )}
                                  {' '}
                                  {['drive','walk','transit'].map(m=>(
                                    <button key={m} onClick={()=>setTransportModes(p=>({...p,[`${activeDay}-${i}`]:m}))} style={{ background:'none', border:`1px solid ${(transportModes[`${activeDay}-${i}`]||'drive')===m?'#6366F1':'#334155'}`, color:(transportModes[`${activeDay}-${i}`]||'drive')===m?'#6366F1':'#64748B', borderRadius:20, padding:'2px 8px', fontSize:10, cursor:'pointer', fontFamily:'inherit', marginLeft:4, transition:'all 0.2s' }}>
                                      {m==='drive'?'🚗':m==='walk'?'🚶':'🚇'} {m}
                                    </button>
                                  ))}
                                  {(() => {
                                    const maxKm = resolveComfortRadiusKm(itin?.comfort_radius || 'flexible', itin?.comfort_radius_km);
                                    const isOverRadius = Number(stop?._distFromPrev) > maxKm;
                                    return isOverRadius ? (
                                      <span style={{ display:'inline-block', marginLeft:8, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.45)', color:'#FCD34D', borderRadius:8, padding:'2px 8px', fontSize:10 }}>
                                        ⚠️ Further than your comfort range ({maxKm}km)
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
                    )}

                    {/* Food section */}
                    {(rankedFood.length > 0 || (currentDayData?.food?.length || 0) > 0) && (
                      <div style={{ marginTop:24 }}>
                        <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>🍜 What to Eat Today</h4>
                        <div style={{ fontSize:12, color:'#64748B', marginBottom:10 }}>
                          🍜 Budget cap per meal: {SYM[activeCur]}{conv(FOOD_CAPS[itin?.budget_level || 'Relaxed'], activeCur)} · Sorted by: {rankOptions.find(r=>r.value===rankBy)?.label}
                        </div>
                        {displayedFood.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'24px 16px', background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12 }}>
                            <div style={{ fontSize:32, marginBottom:8 }}>🎯</div>
                            <p style={{ fontSize:14, color:'#94A3B8', marginBottom:12 }}>No items match your comfort zone</p>
                            <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => setComfortFilter(false)}>Show all options</button>
                          </div>
                        ) : (
                          <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8 }}>
                            {displayedFood.map((f,i)=>renderFoodCard(f, i))}
                          </div>
                        )}
                      </div>
                    )}

                    {renderHotelSection(currentDayData, itin, itin?.budget_level || 'Budget')}
                  </div>
                )}

                {/* ── HOTELS TAB ── */}
                {activeTab==='hotels' && renderHotelSection(currentDayData, itin, itin?.budget_level || 'Budget')}

                {/* ── FOOD TAB ── */}
                {activeTab==='food' && (
                  <div>
                    <div style={{ fontSize:12, color:'#64748B', marginBottom:10 }}>
                      🍜 Budget cap per meal: {SYM[activeCur]}{conv(FOOD_CAPS[itin?.budget_level || 'Relaxed'], activeCur)} · Sorted by: {rankOptions.find(r=>r.value===rankBy)?.label}
                    </div>
                    {foodByMeal.map(({ mealType, items }) => {
                      if (!items.length) return null;
                      return (
                        <div key={mealType} style={{ marginBottom:20 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                            <h4 style={{ color:'#64748B', fontSize:11, textTransform:'uppercase', letterSpacing:1 }}>{mealType}</h4>
                            <span style={{ fontSize:11, color:'#64748B' }}>{items.length} options</span>
                          </div>
                          <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:6 }}>
                            {items.map((f, i) => (
                              <div key={`${mealType}-${f.name}-${i}`} style={{ minWidth:210 }}>
                                <div style={{ fontSize:10, color:'#64748B', marginBottom:6 }}>Day {f._day}</div>
                                {renderFoodCard(f, i)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {foodByMeal.every(({ items }) => items.length === 0) && (
                      <div style={{ textAlign:'center', padding:'24px 16px', background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12 }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>🎯</div>
                        <p style={{ fontSize:14, color:'#94A3B8', marginBottom:12 }}>No items match your comfort zone</p>
                        <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => setComfortFilter(false)}>Show all options</button>
                      </div>
                    )}
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

              {/* COMPACT COST BAR — replaces full footer */}
              <div style={{
                borderTop:'1px solid #1E293B',
                padding:'10px 20px',
                background:'rgba(15,23,42,0.95)',
                backdropFilter:'blur(10px)',
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                gap:8,
                flexWrap:'nowrap',
              }}>
                <div style={{
                  display:'flex',
                  alignItems:'center',
                  gap:12,
                  fontSize:11,
                  color:'#64748B',
                  flex:1,
                  overflow:'hidden',
                }}>
                  <span title="Hotels">
                    🏨 {SYM[activeCur]}{conv(totalCost.hotels,activeCur).toLocaleString()}
                  </span>
                  <span style={{ color:'#334155' }}>·</span>
                  <span title="Food">
                    🍜 {SYM[activeCur]}{conv(totalCost.food,activeCur).toLocaleString()}
                  </span>
                  <span style={{ color:'#334155' }}>·</span>
                  <span title="Activities">
                    🎯 {totalCost.activities === 0
                      ? 'Free'
                      : `${SYM[activeCur]}${conv(totalCost.activities,activeCur).toLocaleString()}`
                    }
                  </span>
                  <span style={{ color:'#334155' }}>·</span>
                  <span title="Transport">
                    🚗 {SYM[activeCur]}{conv(totalCost.transport,activeCur).toLocaleString()}
                  </span>
                </div>

                <div style={{
                  display:'flex',
                  alignItems:'center',
                  gap:8,
                  flexShrink:0,
                }}>
                  <span style={{ fontSize:11, color:'#64748B' }}>Total</span>
                  <span style={{
                    fontSize:15,
                    fontWeight:600,
                    color:'#F1F5F9',
                  }}>
                    {SYM[activeCur]}{conv(grandTotal,activeCur).toLocaleString()}
                  </span>
                  <button
                    onClick={() => setCostExpanded(p => !p)}
                    style={{
                      background:'none',
                      border:'1px solid #334155',
                      color:'#64748B',
                      borderRadius:6,
                      padding:'2px 8px',
                      cursor:'pointer',
                      fontSize:11,
                      fontFamily:'inherit',
                      transition:'all 0.2s',
                    }}
                    title="View full breakdown"
                  >
                    {costExpanded ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* EXPANDABLE FULL BREAKDOWN — hidden by default */}
              {costExpanded && (
                <div style={{
                  borderTop:'1px solid #334155',
                  padding:'12px 20px',
                  background:'#1E293B',
                  animation:'fadeUp 0.2s ease',
                }}>
                  {[
                    {
                      e:'🏨', label:'Hotels',
                      val: totalCost.hotels,
                      detail: `${SYM[activeCur]}${conv(totalCost.hotelPerNight || 4,activeCur)}/night`,
                      color:'#6366F1'
                    },
                    {
                      e:'🍜', label:'Food',
                      val: totalCost.food,
                      detail: `${SYM[activeCur]}${conv(totalCost.foodPerDay || 2,activeCur)}/day · 3 meals`,
                      color:'#F59E0B'
                    },
                    {
                      e:'🎯', label:'Activities',
                      val: totalCost.activities,
                      detail: totalCost.activities === 0
                        ? `${totalCost.freeStopsCount || 0} free stops · no entry fees`
                        : `${totalCost.paidStopsCount || 0} paid · ${totalCost.freeStopsCount || 0} free`,
                      color:'#10B981'
                    },
                    {
                      e:'🚗', label:'Transport',
                      val: totalCost.transport,
                      detail: `${totalCost.totalKm || 0}km · ${totalCost.transportMode || 'Bus/Metro'}`,
                      color:'#0EA5E9'
                    },
                  ].map(row => (
                    <div key={row.label} style={{
                      display:'flex', alignItems:'center',
                      justifyContent:'space-between',
                      padding:'6px 0',
                      borderBottom:'1px solid #0F172A',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:15 }}>{row.e}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:500 }}>
                            {row.label}
                          </div>
                          <div style={{ fontSize:10, color:'#475569' }}>
                            {row.detail}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize:13, fontWeight:500, color:row.color }}>
                        {row.val === 0
                          ? <span style={{ color:'#10B981' }}>FREE</span>
                          : `${SYM[activeCur]}${conv(row.val,activeCur).toLocaleString()}`
                        }
                      </span>
                    </div>
                  ))}

                  <div style={{
                    marginTop:10, padding:'6px 10px',
                    background:'rgba(16,185,129,0.08)',
                    border:'1px solid rgba(16,185,129,0.2)',
                    borderRadius:8, fontSize:11,
                    color:'#10B981', textAlign:'center'
                  }}>
                    ✓ {Math.round((1 - (grandTotal / (totalCost.dailyUSD * totalCost.days))) * 100)}% within your {SYM[activeCur]}
                    {conv(totalCost.dailyUSD * totalCost.days, activeCur).toLocaleString()} budget
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT MAP PANEL ── */}
            <div className="map-panel" style={{ position:'relative', height:'calc(100vh - 56px)', overflow:'hidden' }}>
              <div
                ref={el => {
                  mapEl.current = el;
                  if (el && !mapMounted) setMapMounted(true);
                }}
                onClick={() => setDropdownOpen(false)}
                style={{ width:'100%', height:'100%' }}
              />

              {/* Map controls overlay */}
              <div style={{
                position:'absolute',
                top:12,
                left:12,
                zIndex:1000,
                display:'flex',
                gap:4,
                background:'#1E293B',
                border:'1px solid #334155',
                borderRadius:10,
                padding:'5px 6px',
                boxShadow:'0 4px 16px rgba(0,0,0,0.5)'
              }}>
                  {[['🌙','dark'],['🗺️','street'],['🛰️','satellite']].map(([e,l])=>(
                    <button key={l} onClick={()=>setMapLayer(l)} style={{
                      background: mapLayer === l ? '#6366F1' : 'transparent',
                      border:'none',
                      color: mapLayer === l ? 'white' : '#94A3B8',
                      padding:'6px 12px',
                      borderRadius:8,
                      cursor:'pointer',
                      fontSize:12,
                      fontFamily:'inherit',
                      fontWeight: mapLayer === l ? 500 : 400,
                      transition:'all 0.2s',
                      whiteSpace:'nowrap'
                    }}>
                      {e}
                    </button>
                  ))}
              </div>

              {/* Day selector on map */}
              <div style={{
                position:'absolute',
                top:12,
                left:'50%',
                transform:'translateX(-50%)',
                zIndex:1000,
                display:'flex',
                gap:4,
                background:'#1E293B',
                border:'1px solid #334155',
                borderRadius:10,
                padding:'5px 6px',
                boxShadow:'0 4px 16px rgba(0,0,0,0.5)'
              }}>
                  {itin.days?.map(d=>(
                    <button key={d.day} onClick={()=>switchDay(d.day)} style={{
                      background: activeDay === d.day ? DAY_COLORS[(d.day-1) % DAY_COLORS.length] : 'transparent',
                      border:'none',
                      color: activeDay === d.day ? 'white' : '#94A3B8',
                      padding:'6px 12px',
                      borderRadius:8,
                      cursor:'pointer',
                      fontSize:12,
                      fontFamily:'inherit',
                      fontWeight: activeDay === d.day ? 600 : 400,
                      transition:'all 0.2s',
                      minWidth:36,
                      textAlign:'center'
                    }}>
                      D{d.day}
                    </button>
                  ))}
              </div>

              {/* Weather overlay */}
              {weather?.current_weather && (
                <div style={{
                  position:'absolute',
                  top:12,
                  right:52,
                  zIndex:1000,
                  background:'#1E293B',
                  border:'1px solid #334155',
                  borderRadius:20,
                  padding:'6px 12px',
                  fontSize:12,
                  color:'#94A3B8',
                  boxShadow:'0 4px 16px rgba(0,0,0,0.5)',
                  display:'flex',
                  alignItems:'center',
                  gap:6,
                  whiteSpace:'nowrap'
                }}>
                  <span>{wxFor(weather.current_weather.weathercode)?.e}</span>
                  <span>{Math.round(weather.current_weather.temperature)}°C</span>
                  <span style={{ color:'#334155' }}>•</span>
                  <span>💨 {Math.round(weather.current_weather.windspeed)} km/h</span>
                </div>
              )}

              {/* Day summary pill */}
              <div style={{
                position:'absolute',
                bottom:24,
                left:'50%',
                transform:'translateX(-50%)',
                zIndex:1000,
                background:'#1E293B',
                border:'1px solid #334155',
                borderRadius:20,
                padding:'8px 16px',
                fontSize:12,
                color:'#94A3B8',
                boxShadow:'0 4px 16px rgba(0,0,0,0.5)',
                display:'flex',
                gap:8,
                alignItems:'center',
                whiteSpace:'nowrap'
              }}>
                <span style={{ color:DAY_COLORS[(activeDay-1)%DAY_COLORS.length] }}>●</span>
                <span>Day {activeDay}</span>
                <span style={{ color:'#334155' }}>•</span>
                <span>{rerankedStops.length} stops</span>
                <span style={{ color:'#334155' }}>•</span>
                <span>~{Math.round(rerankedStops.reduce((a,s)=>a+s._dur,0)/60*10)/10}h</span>
              </div>

              <div style={{
                position:'absolute',
                bottom:24,
                left:12,
                zIndex:1000,
                background:'#1E293B',
                border:'1px solid #334155',
                borderRadius:8,
                padding:'6px 10px',
                fontSize:10,
                color:'#475569',
                boxShadow:'0 2px 8px rgba(0,0,0,0.4)'
              }}>
                ← → Arrow keys • Esc
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

      {/* ── PROFILE PAGE ── */}
      {page==='profile' && user && (
        <div className="fade-up" style={{ maxWidth:760, margin:'0 auto', padding:'40px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h1 style={{ fontSize:28, fontWeight:500 }}>My Profile</h1>
            <button className="btn-secondary" onClick={()=>navigateTo('dashboard')}>← Back</button>
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:18, padding:22, marginBottom:16 }}>
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:'linear-gradient(135deg,#6366F1,#0EA5E9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:600 }}>
                {initials(user?.name)}
              </div>
              <div style={{ flex:1 }}>
                {editingName ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveName()}
                      style={{
                        background: '#273549',
                        border: '1px solid #6366F1',
                        borderRadius: 8,
                        padding: '8px 12px',
                        color: '#F1F5F9',
                        fontSize: 16,
                        fontWeight: 500,
                        width: 200
                      }}
                      autoFocus
                    />
                    <RippleBtn
                      onClick={saveName}
                      className="btn-primary"
                      style={{ padding: '8px 16px', fontSize: 13 }}
                    >
                      {savingName ? '...' : 'Save'}
                    </RippleBtn>
                    <button
                      onClick={() => { setEditingName(false); setNameInput(user?.name || ''); }}
                      className="btn-secondary"
                      style={{ padding: '8px 12px', fontSize: 13 }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <h2 style={{ fontWeight:500, fontSize:20 }}>{user?.name}</h2>
                    <button
                      onClick={() => { setEditingName(true); setNameInput(user?.name || ''); }}
                      style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, padding:4 }}
                      title="Edit name"
                    >
                      ✏️
                    </button>
                  </div>
                )}
                <p style={{ color:'var(--text-secondary)', fontSize:14 }}>{user?.email || 'user@email.com'}</p>
                <p style={{ color:'var(--text-muted)', fontSize:12, marginTop:4 }}>Member since {formatDate(user?.created_at || Date.now())}</p>
              </div>
              {user?.isGuest && <span style={{ background:'rgba(245,158,11,0.1)', color:'#FCD34D', border:'1px solid rgba(245,158,11,0.4)', borderRadius:20, padding:'4px 10px', fontSize:12 }}>Guest</span>}
            </div>
          </div>

          {user?.isGuest && (
            <div style={{ background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <span style={{ color:'#A5B4FC', fontSize:13 }}>Create a free account to save trips and unlock all features</span>
              <button className="btn-primary" style={{ padding:'8px 12px', fontSize:13 }} onClick={()=>navigateTo('auth')}>Register Now →</button>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, marginBottom:16 }}>
            {[
              ['✈️ Trips Made', profileStats.trips],
              ['📍 Stops Visited', profileStats.stops],
              ['🌍 Countries Explored', profileStats.countries],
              ['💰 Saved Amount', `$${profileStats.saved}`],
            ].map(([label, val]) => (
              <div key={label} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12, padding:12 }}>
                <div style={{ color:'var(--text-muted)', fontSize:11, marginBottom:6 }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:600 }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <h3 style={{ fontSize:16, fontWeight:500 }}>Recent Trips</h3>
              <button className="btn-secondary" style={{ fontSize:12, padding:'6px 10px' }} onClick={openSavedTrips}>View All</button>
            </div>
            <div style={{ display:'flex', gap:10, overflowX:'auto' }}>
              {recentTrips.length ? recentTrips.map((trip) => (
                <div key={trip.id} style={{ minWidth:220, background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:12, padding:12 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{trip.origin} → {trip.destination}</div>
                  <div style={{ color:'var(--text-muted)', fontSize:12, marginTop:4 }}>{trip.duration_days} days</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                    {(trip.vibes || []).slice(0, 3).map(v => <span key={v} style={{ fontSize:10, color:'#A5B4FC', background:'rgba(99,102,241,0.1)', borderRadius:20, padding:'2px 8px' }}>{v}</span>)}
                  </div>
                </div>
              )) : (
                <div style={{ color:'var(--text-muted)', fontSize:13 }}>No trips yet</div>
              )}
            </div>
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, padding:16, marginBottom:16 }}>
            <h3 style={{ fontSize:16, fontWeight:500, marginBottom:10 }}>Your travel preferences</h3>
            <div style={{ display:'grid', gap:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'170px 1fr', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text-secondary)', fontSize:13 }}>Default origin city</span>
                <input
                  value={prefs.defaultOrigin}
                  onChange={(e)=>{
                    setPrefs(p=>({ ...p, defaultOrigin:e.target.value }));
                    setPrefsDirty(true);
                    setPrefsSaved(false);
                  }}
                  placeholder="Enter city"
                />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'170px 1fr', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text-secondary)', fontSize:13 }}>Preferred vibes</span>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {['Culture','Nature','Food','Nightlife','Wellness','Shopping'].map(v => {
                    const on = prefs.defaultVibes.includes(v);
                    return (
                      <button
                        key={v}
                        className={`chip${on ? ' on' : ''}`}
                        onClick={() => {
                          setPrefs(p => ({ ...p, defaultVibes: on ? p.defaultVibes.filter(x => x !== v) : [...p.defaultVibes, v] }));
                          setPrefsDirty(true);
                          setPrefsSaved(false);
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'170px 1fr', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text-secondary)', fontSize:13 }}>Usual group type</span>
                <CustomDropdown
                  label="Group"
                  value={prefs.defaultGroup}
                  onChange={(v)=>{
                    setPrefs(p=>({ ...p, defaultGroup:v }));
                    setPrefsDirty(true);
                    setPrefsSaved(false);
                  }}
                  options={[{ value:'Solo', label:'Solo' }, { value:'Couple', label:'Couple' }, { value:'Family', label:'Family' }, { value:'Friends', label:'Friends' }]}
                />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'170px 1fr', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--text-secondary)', fontSize:13 }}>Currency display</span>
                <CustomDropdown
                  label="Currency"
                  value={prefs.currency}
                  onChange={(v)=>{
                    setPrefs(p=>({ ...p, currency:v }));
                    setPrefsDirty(true);
                    setPrefsSaved(false);
                  }}
                  options={Object.keys(EXCHANGE).map(c => ({ value:c, label:c }))}
                />
              </div>
            </div>
            {prefsDirty && (
              <RippleBtn
                onClick={savePreferences}
                className="btn-primary"
                style={{ marginTop: 20, padding: '12px 28px' }}
              >
                {savingPrefs ? '⏳ Saving...' : prefsSaved ? '✓ Preferences Saved' : '💾 Save Preferences'}
              </RippleBtn>
            )}
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, padding:16 }}>
            <h3 style={{ fontSize:16, fontWeight:500, marginBottom:10 }}>Account</h3>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button className="btn-secondary" onClick={()=>setShowPwdForm(p=>!p)}>Change Password</button>
              <button className="btn-secondary" style={{ color:'#F87171', borderColor:'rgba(248,113,113,0.4)' }} onClick={()=>setDeleteModal('deleteAccount')}>Delete Account</button>
              {user?.isGuest && <button className="btn-primary" onClick={()=>navigateTo('auth')}>Convert to full account</button>}
            </div>
            {showPwdForm && (
              <div style={{ marginTop:12, display:'grid', gap:8 }}>
                <input type="password" placeholder="Current password" value={pwdForm.current} onChange={(e)=>setPwdForm(p=>({ ...p, current:e.target.value }))} />
                <input type="password" placeholder="New password" value={pwdForm.next} onChange={(e)=>setPwdForm(p=>({ ...p, next:e.target.value }))} />
                <input type="password" placeholder="Confirm new password" value={pwdForm.confirm} onChange={(e)=>setPwdForm(p=>({ ...p, confirm:e.target.value }))} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SETTINGS PAGE ── */}
      {page==='settings' && (
        <div className="fade-up" style={{ maxWidth:640, margin:'0 auto', padding:'40px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h1 style={{ fontSize:28, fontWeight:500 }}>Settings</h1>
            <button className="btn-secondary" onClick={()=>navigateTo('dashboard')}>← Back</button>
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:14, marginBottom:12 }}>
            <div style={{ fontWeight:500, marginBottom:10 }}>Theme</div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                ['🌙 Dark', 'dark'],
                ['☀️ Light', 'light'],
                ['💻 System', 'system']
              ].map(([label, value]) => (
                <button key={value} className={`chip${prefs.theme===value ? ' on' : ''}`} onClick={()=>updateSetting('theme', value)}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:14, marginBottom:12 }}>
            <div style={{ fontWeight:500, marginBottom:10 }}>Display Preferences</div>
            <div style={{ display:'grid', gap:10 }}>
              <CustomDropdown label="Default currency" value={prefs.currency} onChange={(v)=>updateSetting('currency', v)} options={['USD','INR','EUR','AED','GBP','SGD','JPY','THB'].map(c=>({ value:c, label:c }))} />
              <CustomDropdown label="Default pace" value={prefs.pace} onChange={(v)=>updateSetting('pace', v)} options={[{ value:'relaxed', label:'Relaxed' }, { value:'balanced', label:'Balanced' }, { value:'fastpaced', label:'Fast-paced' }]} />
              <CustomDropdown label="Distance unit" value={prefs.distanceUnit} onChange={(v)=>updateSetting('distanceUnit', v)} options={[{ value:'km', label:'km' }, { value:'miles', label:'miles' }]} />
              <CustomDropdown label="Temperature unit" value={prefs.tempUnit} onChange={(v)=>updateSetting('tempUnit', v)} options={[{ value:'C', label:'°C' }, { value:'F', label:'°F' }]} />
            </div>
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:14, marginBottom:12 }}>
            <div style={{ fontWeight:500, marginBottom:10 }}>Notifications</div>
            {[['Trip reminders', 'reminders'], ['Weather alerts', 'weather'], ['New features', 'features']].map(([label, key]) => (
              <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0' }}>
                <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                <ToggleSwitch
                  enabled={prefs.notifications[key]}
                  onToggle={() => {
                    setPrefs(p => ({ ...p, notifications:{ ...p.notifications, [key]:!p.notifications[key] } }));
                    setSettingsDirty(true);
                    setSettingsSaved(false);
                  }}
                />
              </div>
            ))}
          </div>

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:14, padding:14 }}>
            <div style={{ fontWeight:500, marginBottom:10 }}>Data & Privacy</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn-secondary" onClick={exportMyData}>Export my data</button>
              {!clearHistoryConfirm ? (
                <button
                  onClick={() => setClearHistoryConfirm(true)}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: '#94A3B8', borderRadius: 10,
                    cursor: 'pointer', fontSize: 13,
                    fontFamily: 'inherit', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#F87171';
                    e.currentTarget.style.color = '#F87171';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#334155';
                    e.currentTarget.style.color = '#94A3B8';
                  }}
                >
                  🗑️ Clear trip history
                </button>
              ) : (
                <div style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 12, padding: '14px 16px',
                  marginTop: 8, width:'100%'
                }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#FCA5A5', marginBottom: 4 }}>
                    Clear all {savedTrips.length} saved trips?
                  </p>
                  <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                    This cannot be undone. All your trip data will be deleted.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={clearAllTrips}
                      disabled={clearingHistory}
                      style={{
                        flex: 1, padding: '9px 0',
                        background: '#EF4444', border: 'none',
                        color: 'white', borderRadius: 8,
                        cursor: clearingHistory ? 'not-allowed' : 'pointer',
                        fontSize: 13, fontFamily: 'inherit',
                        fontWeight: 500,
                        opacity: clearingHistory ? 0.6 : 1
                      }}
                    >
                      {clearingHistory ? '⏳ Clearing...' : '🗑️ Yes, clear all'}
                    </button>
                    <button
                      onClick={() => setClearHistoryConfirm(false)}
                      style={{
                        flex: 1, padding: '9px 0',
                        background: 'transparent',
                        border: '1px solid #334155',
                        color: '#94A3B8', borderRadius: 8,
                        cursor: 'pointer', fontSize: 13,
                        fontFamily: 'inherit'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <button className="btn-secondary" style={{ color:'#F87171', borderColor:'rgba(248,113,113,0.4)' }} onClick={()=>setDeleteModal('deleteAccount')}>Delete account</button>
            </div>
          </div>

          <div style={{
            position: 'sticky',
            bottom: 0,
            background: 'rgba(15,23,42,0.95)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid #1E293B',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 24
          }}>
            {settingsDirty && !settingsSaved && (
              <span style={{ fontSize:13, color:'#F59E0B' }}>
                ⚠️ You have unsaved changes
              </span>
            )}
            {settingsSaved && (
              <span style={{ fontSize:13, color:'#10B981' }}>
                ✓ All settings saved
              </span>
            )}
            {!settingsDirty && !settingsSaved && (
              <span style={{ fontSize:13, color:'#64748B' }}>
                Settings auto-save to your device
              </span>
            )}
            <RippleBtn
              onClick={saveSettings}
              className="btn-primary"
              disabled={!settingsDirty}
              style={{
                opacity: settingsDirty ? 1 : 0.5,
                cursor: settingsDirty ? 'pointer' : 'default',
                padding: '10px 24px'
              }}
            >
              {settingsSaved ? '✓ Saved' : '💾 Save Settings'}
            </RippleBtn>
          </div>
        </div>
      )}

      {/* ── SAVED TRIPS ── */}
      {page==='saved' && (
        <div className="fade-up" style={{ maxWidth:1100, margin:'0 auto', padding:32 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32 }}>
            <h1 style={{ fontWeight:400, fontSize:28 }}>My Saved Trips</h1>
            <button className="btn-secondary" onClick={()=>navigateTo('dashboard')}>← Back</button>
          </div>
          {savedLoading ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:16, padding:20 }}>
                  <Skeleton h={20} w="70%" />
                  <div style={{ height:10 }} />
                  <Skeleton h={14} w="55%" />
                  <div style={{ height:12 }} />
                  <Skeleton h={12} w="90%" />
                </div>
              ))}
            </div>
          ) : savedTrips.length===0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748B' }}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'float 3s ease-in-out infinite' }}>🗺️</div>
              <p style={{ fontSize: 16, marginBottom: 8 }}>No trips yet</p>
              <p style={{ fontSize: 13, marginBottom: 24 }}>Your adventures start here</p>
              <RippleBtn className="btn-primary" onClick={() => startNew(0, true)}>Plan a Trip →</RippleBtn>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {savedTrips.map(trip=>(
                <div key={trip.id} style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:16, padding:20, transition:'all 0.2s', position:'relative' }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteConfirmId(trip.id);
                    }}
                    style={{
                      position: 'absolute', top: 12, right: 12,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: '#F87171',
                      borderRadius: 8, width: 32, height: 32,
                      cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', fontFamily: 'inherit'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.2)';
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
                    }}
                    title="Delete trip"
                  >
                    🗑️
                  </button>

                  {deleteConfirmId === trip.id ? (
                    <div style={{ padding:'8px 0' }}>
                      <p style={{ fontSize:14, marginBottom:4, fontWeight:500 }}>Delete this trip?</p>
                      <p style={{ fontSize:12, color:'#64748B', marginBottom:16 }}>
                        {trip.origin} → {trip.destination} · {trip.duration_days} days
                      </p>
                      <div style={{ display:'flex', gap:8 }}>
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            await deleteTrip(trip.id);
                            setDeleteConfirmId(null);
                          }}
                          disabled={deletingTripId === trip.id}
                          style={{
                            flex:1, padding:'9px 0',
                            background:'#EF4444', border:'none',
                            color:'white', borderRadius:8,
                            cursor:'pointer', fontSize:13,
                            fontFamily:'inherit', fontWeight:500,
                            opacity: deletingTripId === trip.id ? 0.6 : 1
                          }}
                        >
                          {deletingTripId === trip.id ? '⏳ Deleting...' : '🗑️ Yes, Delete'}
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          style={{
                            flex:1, padding:'9px 0',
                            background:'transparent',
                            border:'1px solid #334155',
                            color:'#94A3B8', borderRadius:8,
                            cursor:'pointer', fontSize:13,
                            fontFamily:'inherit'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => loadSavedTrip(trip)} style={{ cursor:'pointer' }}>
                      <h3 style={{ fontWeight:500, marginBottom:6, paddingRight:40 }}>
                        {trip.origin} → {trip.destination}
                      </h3>
                      <p style={{ color:'#64748B', fontSize:13, marginBottom:12 }}>
                        {trip.duration_days} days
                        {trip.budget_level && ` · ${trip.budget_level}`}
                        {trip.created_at && ` · ${new Date(trip.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}`}
                      </p>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
                        {(trip.vibes||[]).map(v=>(
                          <span key={v} style={{
                            background:'rgba(99,102,241,0.1)',
                            border:'1px solid rgba(99,102,241,0.2)',
                            color:'#A5B4FC', fontSize:11,
                            padding:'3px 8px', borderRadius:20
                          }}>
                            {CAT_EMOJI[v] || '🎯'} {v}
                          </span>
                        ))}
                      </div>
                      <button
                        style={{
                          width:'100%', padding:'10px 0',
                          background:'rgba(99,102,241,0.1)',
                          border:'1px solid rgba(99,102,241,0.2)',
                          color:'#A5B4FC', borderRadius:10,
                          cursor:'pointer', fontSize:13,
                          fontFamily:'inherit', fontWeight:500,
                          transition:'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(99,102,241,0.2)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
                        }}
                      >
                        View Itinerary →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {unsavedModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'grid', placeItems:'center', zIndex:600, backdropFilter:'blur(6px)' }}>
          <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:32, maxWidth:380, width:'90%' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>💾</div>
            <h2 style={{ fontWeight:500, marginBottom:8 }}>
              Save before leaving?
            </h2>
            <p style={{ color:'#64748B', fontSize:14, marginBottom:24 }}>
              Your {itin?.destination} trip hasn't been saved.
              It will be lost if you start a new trip.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <RippleBtn
                className="btn-primary"
                onClick={async () => {
                  await saveTrip();
                  setUnsavedModal(false);
                  startNew(0, true);
                }}
                style={{ width:'100%' }}
              >
                💾 Save Trip Then Start New
              </RippleBtn>
              <button
                className="btn-secondary"
                onClick={() => { setUnsavedModal(false); startNew(0, true); }}
                style={{ width:'100%', color:'#F87171', borderColor:'rgba(248,113,113,0.3)' }}
              >
                Discard & Start New
              </button>
              <button
                className="btn-secondary"
                onClick={() => setUnsavedModal(false)}
                style={{ width:'100%' }}
              >
                Keep Editing
              </button>
            </div>
          </div>
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

      {deleteModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'grid', placeItems:'center', zIndex:650, backdropFilter:'blur(6px)' }} onClick={()=>setDeleteModal('')}>
          <div style={{ background:'#1E293B', border:'1px solid #334155', borderRadius:20, padding:28, maxWidth:400, width:'90%' }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ marginBottom:8 }}>Delete account?</h3>
            <p style={{ color:'#94A3B8', fontSize:13, marginBottom:16 }}>This will sign you out from this session.</p>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={()=>setDeleteModal('')}>Cancel</button>
              <button className="btn-primary" style={{ flex:1, background:'linear-gradient(135deg,#EF4444,#DC2626)' }} onClick={logout}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {authPromptModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 9000,
          backdropFilter: 'blur(8px)',
        }}
          onClick={() => setAuthPromptModal(false)}
        >
          <div
            style={{
              background: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 24,
              padding: 36,
              maxWidth: 400,
              width: '90%',
              textAlign: 'center',
              animation: 'slideUp 0.3s ease',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 52, marginBottom: 16 }}>✈️</div>

            <h2 style={{
              fontWeight: 500,
              fontSize: 22,
              marginBottom: 8,
              color: '#F1F5F9',
            }}>
              Sign in to plan your trip
            </h2>

            <p style={{
              color: '#64748B',
              fontSize: 14,
              marginBottom: 28,
              lineHeight: 1.6,
            }}>
              Create a free account to generate your personalized itinerary, save trips, and access them anytime.
            </p>

            <div style={{
              background: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 24,
              textAlign: 'left',
            }}>
              {[
                '🗺️ AI-powered itinerary generation',
                '💾 Save and revisit your trips',
                '🏨 Real hotel & restaurant suggestions',
                '🌤️ Live weather for your destination',
                '📍 Interactive map with navigation',
              ].map(item => (
                <div key={item} style={{
                  fontSize: 13,
                  color: '#94A3B8',
                  padding: '4px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  {item}
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <RippleBtn
                className="btn-primary shimmer-btn"
                onClick={() => {
                  setAuthPromptModal(false);
                  setAuthTab('register');
                  sessionStorage.setItem('pendingTrip', JSON.stringify(chatData));
                  setPage('auth');
                }}
                style={{ width: '100%', padding: '13px 0', fontSize: 15 }}
              >
                Create Free Account →
              </RippleBtn>

              <button
                className="btn-secondary"
                onClick={() => {
                  setAuthPromptModal(false);
                  setAuthTab('login');
                  sessionStorage.setItem('pendingTrip', JSON.stringify(chatData));
                  setPage('auth');
                }}
                style={{ width: '100%', padding: '12px 0' }}
              >
                Sign In to Existing Account
              </button>

              <button
                onClick={() => setAuthPromptModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: '6px 0',
                }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOASTS ── */}
      <div style={{ position:'fixed', bottom:24, right:24, zIndex:999, display:'flex', flexDirection:'column', gap:8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background:t.type==='success'?'#1E293B':'rgba(239,68,68,0.1)', border:`1px solid ${t.type==='success'?'#334155':'rgba(239,68,68,0.3)'}`, borderRadius:12, padding:'12px 16px', fontSize:14, color:t.type==='error'?'#F87171':'#F1F5F9', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', animation:'slideInRight 0.3s ease', maxWidth:300, backdropFilter:'blur(8px)' }}>
            {t.msg}
          </div>
        ))}
      </div>

      </div>
    </div>
  );
}

function Skeleton({ w='100%', h=16, r=8 }) {
  return (
    <div style={{ width:w, height:h, borderRadius:r, background:'linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-elevated) 50%,var(--bg-surface) 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s infinite' }}/>
  );
}

function ToggleSwitch({ enabled, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{ width:44, height:24, borderRadius:12, background:enabled?'#6366F1':'var(--border)', position:'relative', cursor:'pointer', transition:'all 0.3s' }}
    >
      <div
        style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute', top:3, left:enabled?'23px':'3px', transition:'left 0.25s ease', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}
      />
    </div>
  );
}

function CustomDropdown({ options, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(opt => opt.value === value);
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:14, userSelect:'none', transition:'all 0.2s', color:'var(--text-primary)' }}
      >
        <span>{selected?.label || value || label}</span>
        <span style={{ color:'var(--text-muted)', transition:'transform 0.2s', transform:open?'rotate(180deg)':'none' }}>▾</span>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, right:0, background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12, zIndex:200, overflow:'hidden', boxShadow:'0 16px 48px rgba(0,0,0,0.4)', animation:'fadeUp 0.15s ease' }}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ padding:'11px 14px', cursor:'pointer', fontSize:14, background:value===opt.value?'rgba(99,102,241,0.1)':'transparent', color:value===opt.value?'#A5B4FC':'var(--text-primary)', transition:'background 0.15s', display:'flex', alignItems:'center', justifyContent:'space-between' }}
            >
              {opt.label}
              {value===opt.value && <span style={{color:'#6366F1'}}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function rankItems(items, rankBy, type, userBudgetLevel, userComfortRadius) {
  const budgetCap = HOTEL_CAPS[userBudgetLevel]?.max || 9999;
  const radiusKm = RADIUS_KM[userComfortRadius] || Infinity;

  const scored = (items || []).map((item) => {
    let withinBudget = true;
    let withinRadius = true;
    let budgetFitScore = 0;

    const price = item.price_usd || item.cost_usd || 0;
    const rating = item.rating || 0;
    const dist = parseFloat(item._distFromPrev || item.distance_from_last_stop || 0);

    if (type === 'hotel') {
      withinBudget = price <= budgetCap;
      budgetFitScore = withinBudget ? (budgetCap - price) / budgetCap : -1;
    }
    if (type === 'food') {
      const foodCap = budgetCap * 0.3;
      withinBudget = price <= foodCap;
      budgetFitScore = withinBudget ? (foodCap - price) / foodCap : -1;
    }

    if (dist > 0) {
      withinRadius = dist <= radiusKm;
    }

    return {
      ...item,
      _withinBudget: withinBudget,
      _withinRadius: withinRadius,
      _budgetFitScore: budgetFitScore,
      _price: price,
      _rating: rating,
      _dist: dist,
    };
  });

  return [...scored].sort((a, b) => {
    switch (rankBy) {
      case 'price_low':
        if (a._withinBudget && !b._withinBudget) return -1;
        if (!a._withinBudget && b._withinBudget) return 1;
        return a._price - b._price;
      case 'price_high':
        return b._price - a._price;
      case 'rating':
        if (!a._rating && b._rating) return 1;
        if (a._rating && !b._rating) return -1;
        return b._rating - a._rating;
      case 'distance':
        if (!a._dist && b._dist) return 1;
        if (a._dist && !b._dist) return -1;
        return a._dist - b._dist;
      case 'duration':
        return (a.duration_minutes || 60) - (b.duration_minutes || 60);
      case 'budget_fit':
        if (a._withinBudget && !b._withinBudget) return -1;
        if (!a._withinBudget && b._withinBudget) return 1;
        return b._budgetFitScore - a._budgetFitScore;
      case 'recommended':
      default: {
        const scoreA = (a._withinBudget ? 3 : 0) + (a._withinRadius ? 2 : 0) + (a._rating || 0) + (a.recommended ? 5 : 0);
        const scoreB = (b._withinBudget ? 3 : 0) + (b._withinRadius ? 2 : 0) + (b._rating || 0) + (b.recommended ? 5 : 0);
        return scoreB - scoreA;
      }
    }
  });
}

