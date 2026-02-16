import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Database, Grid2x2, Plus, Search } from 'lucide-react';
import { getCurrentUser, isAuthenticated } from '../lib/session';
import { Input } from './ui/Input';
import Logo from './ui/Logo';
import UserMenu from './UserMenu';

const SEARCH_PLACEHOLDER = '프로젝트, 안건, 사양, PDF, 엑셀 데이터를 자연어로 검색';

function buildHomeSearchPath(query) {
    const text = String(query || '').trim();
    if (!text) return '/home';
    const params = new URLSearchParams();
    params.set('q', text);
    return `/home?${params.toString()}`;
}

export default function GlobalTopBar() {
    const navigate = useNavigate();
    const location = useLocation();
    const authed = isAuthenticated();
    const user = getCurrentUser();

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

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        navigate(buildHomeSearchPath(inputQuery));
    };

    return (
        <header className="topbar-shell h-16">
            <div className="mx-auto flex h-full max-w-[1640px] items-center gap-3 px-4 lg:px-6">
                <Logo variant="topbar" showSubtitle={false} className="w-48 shrink-0" />

                {authed ? (
                    <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1">
                        <label className="relative block">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                            <Input
                                type="text"
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder={SEARCH_PLACEHOLDER}
                                className="h-10 w-full rounded-full border-border/90 bg-card/85 pl-11 pr-4 text-sm"
                            />
                        </label>
                    </form>
                ) : (
                    <div className="flex-1" />
                )}

                <div className="flex w-44 shrink-0 items-center justify-end gap-2">
                    {authed ? (
                        <>
                            <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary">
                                <Bell className="h-4 w-4" />
                            </button>
                            <div className="relative z-[70]" ref={quickMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsQuickMenuOpen((prev) => !prev)}
                                    className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary"
                                    aria-label="빠른 메뉴"
                                    aria-expanded={isQuickMenuOpen}
                                >
                                    <Grid2x2 className="h-4 w-4" />
                                </button>

                            {isQuickMenuOpen && (
                                <div className="app-surface-soft absolute right-0 top-11 z-[90] w-60 p-3">
                                    <div className="grid grid-cols-2 gap-2">
                                            <Link
                                                to="/project-management/projects/new"
                                                onClick={() => setIsQuickMenuOpen(false)}
                                                className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-foreground transition-colors hover:bg-secondary"
                                            >
                                                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                                    <Plus className="h-4 w-4" />
                                                </span>
                                                <span className="text-xs font-semibold text-center">새 프로젝트 생성</span>
                                            </Link>

                                            <Link
                                                to="/data-hub"
                                                onClick={() => setIsQuickMenuOpen(false)}
                                                className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-foreground transition-colors hover:bg-secondary"
                                            >
                                                <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                                                    <Database className="h-4 w-4" />
                                                </span>
                                                <span className="text-xs font-semibold text-center">데이터 허브</span>
                                            </Link>
                                    </div>
                                </div>
                            )}
                        </div>
                            <UserMenu user={user} />
                        </>
                    ) : (
                        <Link
                            to="/login"
                            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                            로그인
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
