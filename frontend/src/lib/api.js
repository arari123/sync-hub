import axios from 'axios';
import { clearSession, getAccessToken } from './session';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8001').replace(/\/$/, '');
export const POLLING_INTERVAL_MS = 2500;
export const HEALTH_POLLING_INTERVAL_MS = 7000;

export const api = axios.create({
    baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401 && getAccessToken()) {
            clearSession();
        }
        return Promise.reject(error);
    }
);

export function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.detail || fallbackMessage;
}
