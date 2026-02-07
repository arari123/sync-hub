import axios from 'axios';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8001').replace(/\/$/, '');
export const POLLING_INTERVAL_MS = 2500;
export const HEALTH_POLLING_INTERVAL_MS = 7000;

export const api = axios.create({
    baseURL: API_BASE_URL,
});

export function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.detail || fallbackMessage;
}
