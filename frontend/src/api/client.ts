import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8000/api' });

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
    if (err.response?.status === 401) {
      localStorage.removeItem('j2w_auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
