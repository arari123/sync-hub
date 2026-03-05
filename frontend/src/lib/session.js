const ACCESS_TOKEN_KEY = 'sync_hub_access_token';
const USER_INFO_KEY = 'sync_hub_user_info';

export function getAccessToken() {
    const raw = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    return String(raw || '').trim();
}

export function isAuthenticated() {
    const user = getCurrentUser();
    return Boolean(user && (user.id || user.email));
}

export function getCurrentUser() {
    const raw = window.localStorage.getItem(USER_INFO_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setSession(accessToken, user) {
    const token = String(accessToken || '').trim();
    if (token) {
        window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (user) {
        window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    } else {
        window.localStorage.removeItem(USER_INFO_KEY);
    }
}

export function clearSession() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(USER_INFO_KEY);
}
