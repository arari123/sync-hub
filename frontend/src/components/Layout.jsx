import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Database, Grid2x2, Plus, Search } from 'lucide-react';
import { getCurrentUser, isAuthenticated } from '../lib/session';

const SEARCH_PLACEHOLDER = '프로젝트, 안건, 사양, PDF, EXCEL 데이터를 자연어로 검색';

function buildHomeSearchPath(query) {
    const text = String(query || '').trim();
    if (!text) return '/home';
    const params = new URLSearchParams();
    params.set('q', text);
    return `/home?${params.toString()}`;
}

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const pathname = location.pathname;

    const authed = isAuthenticated();
    const user = getCurrentUser();
    const userBadge = (user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase();

    const [inputQuery, setInputQuery] = useState('');
    const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
    const quickMenuRef = useRef(null);

    useEffect(() => {
        if (!authed) {
            setInputQuery('');
            return;
        }
        const params = new URLSearchParams(location.search || '');
        setInputQuery(params.get('q') || '');
    }, [authed, location.search]);

    useEffect(() => {
        const onPointerDown = (event) => {
            if (!quickMenuRef.current) return;
            if (quickMenuRef.current.contains(event.target)) return;
            setIsQuickMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, []);

    const isAuthRoute = /^\/(login|signup|verify-email)(\/|$)/.test(pathname);
    const isHomeRoute = pathname === '/home' || pathname === '/';
    const isProjectMainRoute = /^\/project-management\/projects\/[^/]+\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';
    const isProjectBudgetMainRoute = /^\/project-management\/projects\/[^/]+\/budget\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';

    if (isAuthRoute || isHomeRoute || isProjectMainRoute || isProjectBudgetMainRoute) {
        return (
            <div className="min-h-screen bg-slate-50 font-sans text-foreground antialiased">
                {children}
            </div>
        );
    }

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        navigate(buildHomeSearchPath(inputQuery));
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="h-16 border-b border-border bg-card/95 backdrop-blur">
                <div className="mx-auto h-full max-w-[1600px] px-4 lg:px-6 flex items-center gap-3">
                    <Link to="/home" className="w-44 shrink-0 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center text-xs font-bold">S</div>
                        <div className="leading-tight">
                            <p className="font-extrabold tracking-tight text-sm">sync-hub</p>
                            <p className="text-[10px] text-muted-foreground">검색 워크스페이스</p>
                        </div>
                    </Link>

                    {authed ? (
                        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0">
                            <label className="relative block">
                                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={inputQuery}
                                    onChange={(event) => setInputQuery(event.target.value)}
                                    placeholder={SEARCH_PLACEHOLDER}
                                    className="h-10 w-full rounded-full border border-input bg-secondary pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                        </form>
                    ) : (
                        <div className="flex-1" />
                    )}

                    <div className="w-40 shrink-0 flex items-center justify-end gap-2">
                        {authed ? (
                            <>
                                <button type="button" className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary">
                                    <Bell className="h-4 w-4" />
                                </button>
                                <div className="relative" ref={quickMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setIsQuickMenuOpen((prev) => !prev)}
                                        className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary"
                                        aria-label="빠른 메뉴"
                                        aria-expanded={isQuickMenuOpen}
                                    >
                                        <Grid2x2 className="h-4 w-4" />
                                    </button>

                                    {isQuickMenuOpen && (
                                        <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-border bg-card p-3 shadow-xl">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Link
                                                    to="/project-management/projects/new"
                                                    onClick={() => setIsQuickMenuOpen(false)}
                                                    className="flex flex-col items-center gap-1 rounded-xl p-3 text-foreground hover:bg-secondary"
                                                >
                                                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                                                        <Plus className="h-4 w-4" />
                                                    </span>
                                                    <span className="text-xs font-semibold text-center">새 프로젝트 생성</span>
                                                </Link>

                                                <button
                                                    type="button"
                                                    className="flex flex-col items-center gap-1 rounded-xl p-3 text-muted-foreground/70 cursor-not-allowed"
                                                    title="데이터 허브는 아직 구현되지 않았습니다."
                                                >
                                                    <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                                                        <Database className="h-4 w-4" />
                                                    </span>
                                                    <span className="text-xs font-semibold text-center">데이터 허브(미구현)</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button type="button" className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center">
                                    <span>{userBadge}</span>
                                </button>
                            </>
                        ) : (
                            <Link
                                to="/login"
                                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
                            >
                                로그인
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6 lg:py-6">
                {children}
            </main>
        </div>
    );
};

export default Layout;
