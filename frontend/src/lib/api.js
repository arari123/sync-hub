import axios from 'axios';
import { clearSession, getAccessToken, isAuthenticated } from './session';

const configuredApiBaseUrl = (import.meta.env.VITE_API_URL ?? '').trim();

function resolveDefaultApiBaseUrl() {
    if (typeof window === 'undefined') {
        return 'http://localhost:8001';
    }
    return window.location.origin;
}

export const API_BASE_URL = (configuredApiBaseUrl || resolveDefaultApiBaseUrl()).replace(/\/$/, '');
export const POLLING_INTERVAL_MS = 2500;
export const HEALTH_POLLING_INTERVAL_MS = 7000;

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
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
        if (error?.response?.status === 401 && isAuthenticated()) {
            clearSession();
        }
        return Promise.reject(error);
    }
);

export function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.detail || fallbackMessage;
}

export function resolveApiAssetUrl(assetUrl) {
    const raw = String(assetUrl || '').trim();
    if (!raw) return '';
    if (/^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;

    const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
    try {
        return new URL(normalizedPath, `${API_BASE_URL}/`).toString();
    } catch {
        return normalizedPath;
    }
}
