import { useCallback, useEffect, useState } from 'react';

export const THEME_LIGHT = 'light';
export const THEME_DARK = 'dark';
export const THEME_STORAGE_KEY = 'sync_hub_theme';
const THEME_CHANGE_EVENT = 'sync-hub-theme-change';

function hasBrowserEnv() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function normalizeTheme(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === THEME_DARK) return THEME_DARK;
    if (text === THEME_LIGHT) return THEME_LIGHT;
    return '';
}

function dispatchThemeChanged(theme) {
    if (!hasBrowserEnv()) return;
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }));
}

export function getStoredTheme() {
    if (!hasBrowserEnv()) return '';
    try {
        return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
        return '';
    }
}

export function getSystemTheme() {
    if (!hasBrowserEnv() || typeof window.matchMedia !== 'function') {
        return THEME_LIGHT;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? THEME_DARK : THEME_LIGHT;
}

export function resolvePreferredTheme() {
    return getStoredTheme() || getSystemTheme();
}

export function applyTheme(theme) {
    if (!hasBrowserEnv()) return THEME_LIGHT;
    const resolvedTheme = normalizeTheme(theme) || THEME_LIGHT;
    const root = document.documentElement;
    root.classList.toggle(THEME_DARK, resolvedTheme === THEME_DARK);
    root.dataset.theme = resolvedTheme;
    return resolvedTheme;
}

export function initializeTheme() {
    return applyTheme(resolvePreferredTheme());
}

export function getCurrentTheme() {
    if (!hasBrowserEnv()) return THEME_LIGHT;
    const rootTheme = normalizeTheme(document.documentElement.dataset.theme);
    if (rootTheme) return rootTheme;
    return document.documentElement.classList.contains(THEME_DARK)
        ? THEME_DARK
        : resolvePreferredTheme();
}

export function setTheme(nextTheme) {
    if (!hasBrowserEnv()) return THEME_LIGHT;
    const theme = applyTheme(nextTheme);
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Ignore storage quota/unavailable errors.
    }
    dispatchThemeChanged(theme);
    return theme;
}

export function toggleTheme() {
    const nextTheme = getCurrentTheme() === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    return setTheme(nextTheme);
}

export function useTheme() {
    const [theme, setThemeState] = useState(() => getCurrentTheme());

    useEffect(() => {
        if (!hasBrowserEnv()) return undefined;
        initializeTheme();

        const handleThemeChange = (event) => {
            const changed = normalizeTheme(event?.detail?.theme) || getCurrentTheme();
            setThemeState(changed);
        };
        const handleStorage = (event) => {
            if (event.key && event.key !== THEME_STORAGE_KEY) return;
            setThemeState(initializeTheme());
        };
        const mediaQuery = typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-color-scheme: dark)')
            : null;
        const handleSystemThemeChange = () => {
            if (getStoredTheme()) return;
            setThemeState(initializeTheme());
        };

        window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
        window.addEventListener('storage', handleStorage);
        mediaQuery?.addEventListener?.('change', handleSystemThemeChange);

        return () => {
            window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
            window.removeEventListener('storage', handleStorage);
            mediaQuery?.removeEventListener?.('change', handleSystemThemeChange);
        };
    }, []);

    const applyThemeByUser = useCallback((nextTheme) => {
        const changed = setTheme(nextTheme);
        setThemeState(changed);
    }, []);
    const toggleThemeByUser = useCallback(() => {
        const changed = toggleTheme();
        setThemeState(changed);
        return changed;
    }, []);

    return {
        theme,
        isDark: theme === THEME_DARK,
        setTheme: applyThemeByUser,
        toggleTheme: toggleThemeByUser,
    };
}
