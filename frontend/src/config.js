function trimSlash(url) {
	return String(url || '').replace(/\/+$/, '');
}

const envApi = trimSlash(process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE || '');

let fallbackApi = 'http://localhost:8000';
if (typeof window !== 'undefined') {
	const host = window.location.hostname;
	const isLocal = host === 'localhost' || host === '127.0.0.1';
	// In hosted environments, default to same-origin API if env var is not set.
	fallbackApi = isLocal ? 'http://localhost:8000' : trimSlash(window.location.origin);
}

const API_BASE = envApi || fallbackApi;

export default API_BASE;
