import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { clearSession, getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';

function resolveUserBadge(user) {
    const fallback = 'U';
    const source = user?.full_name || user?.email || fallback;
    return String(source).slice(0, 1).toUpperCase();
}

function resolveDisplayName(user) {
    return String(user?.full_name || user?.name || '').trim() || '사용자';
}

function resolveDisplayEmail(user) {
    return String(user?.email || '').trim() || '';
}

export default function UserMenu({ user: userProp, className }) {
    const navigate = useNavigate();
    const location = useLocation();
    const buttonId = useId();
    const panelId = useMemo(() => `${buttonId}-panel`, [buttonId]);

    const user = userProp ?? getCurrentUser() ?? {};
    const userBadge = useMemo(() => resolveUserBadge(user), [user]);
    const displayName = useMemo(() => resolveDisplayName(user), [user]);
    const displayEmail = useMemo(() => resolveDisplayEmail(user), [user]);

    const rootRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event) => {
            if (!rootRef.current) return;
            if (rootRef.current.contains(event.target)) return;
            setIsOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        // Close on navigation to prevent stale popovers across pages.
        setIsOpen(false);
    }, [location.pathname, location.search, location.hash]);

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await api.post('/auth/logout');
        } catch (error) {
            // Ignore network/server errors; always clear local session.
        } finally {
            clearSession();
            setIsLoggingOut(false);
            setIsOpen(false);
            navigate('/login', { replace: true });
        }
    };

    return (
        <div className={cn('relative z-[70]', className)} ref={rootRef}>
            <button
                id={buttonId}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label="사용자 메뉴"
            >
                <span>{userBadge}</span>
            </button>

            {isOpen && (
                <div
                    id={panelId}
                    role="menu"
                    aria-labelledby={buttonId}
                    className="app-surface-soft absolute right-0 top-11 z-[90] w-72 overflow-hidden p-0"
                >
                    <div className="border-b border-border/70 bg-gradient-to-b from-card/95 to-card/75 px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground shadow-sm">
                                <span>{userBadge}</span>
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
                                {displayEmail ? (
                                    <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">이메일 정보 없음</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-2">
                        <button
                            type="button"
                            onClick={handleLogout}
                            disabled={isLoggingOut}
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isLoggingOut ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                                <LogOut className="h-4 w-4 text-muted-foreground" />
                            )}
                            로그아웃
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
