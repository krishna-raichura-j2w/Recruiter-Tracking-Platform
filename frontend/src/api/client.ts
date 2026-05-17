import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api',
});

api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('j2w_auth');
  if (stored) {
    const auth = JSON.parse(stored);
    config.headers.Authorization = `Bearer ${auth.access_token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('j2w_auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
