import React, { useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { getCurrentUser, isAuthenticated } from '../lib/session';
import { Input } from './ui/Input';
import Logo from './ui/Logo';
import UserMenu from './UserMenu';
import AppQuickMenu from './AppQuickMenu';

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

    const searchInputRef = useRef(null);

    const locationSearchQuery = useMemo(() => {
        if (!authed) return '';
        const params = new URLSearchParams(location.search || '');
        return params.get('q') || '';
    }, [authed, location.search]);

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const text = String(searchInputRef.current?.value || '').trim();
        navigate(buildHomeSearchPath(text));
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
                                key={`global-search-${locationSearchQuery}`}
                                ref={searchInputRef}
                                type="text"
                                defaultValue={locationSearchQuery}
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
                            <button
                                type="button"
                                className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary"
                            >
                                <Bell className="h-4 w-4" />
                            </button>
                            <AppQuickMenu />
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
