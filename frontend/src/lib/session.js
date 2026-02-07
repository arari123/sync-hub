const ACCESS_TOKEN_KEY = 'sync_hub_access_token';
const USER_INFO_KEY = 'sync_hub_user_info';

export function getAccessToken() {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function isAuthenticated() {
    return Boolean(getAccessToken());
}

export function getCurrentUser() {
    const raw = window.localStorage.getItem(USER_INFO_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

export function setSession(accessToken, user) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken || '');
    if (user) {
        window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    }
}

export function clearSession() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(USER_INFO_KEY);
}
