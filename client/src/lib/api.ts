import axios from 'axios';
import { getAdminToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || 'https://api-seltpos.soudev.site';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
