import axios from "axios";

const rawUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

const baseURL = rawUrl
  ? (rawUrl.endsWith('/api') ? rawUrl : `${rawUrl}/api`)
  : (import.meta.env.DEV ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'Accept': 'application/json'
  }
});

// Non-destructive response interceptor for network error diagnostics
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
      console.warn(`[API Network Error] Request to ${error.config?.baseURL || ''}${error.config?.url || ''} failed. Check if server is running on port 5000 and CORS allows origin: ${currentOrigin}`);
    }
    return Promise.reject(error);
  }
);

export default api;