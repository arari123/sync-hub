import React from 'react';
import { useLocation } from 'react-router-dom';
import GlobalTopBar from './GlobalTopBar';

const Layout = ({ children }) => {
    const location = useLocation();
    const pathname = location.pathname;

    const isAuthRoute = /^\/(login|signup|verify-email)(\/|$)/.test(pathname);
    const isHomeRoute = pathname === '/home' || pathname === '/';
    const isProjectMainRoute = /^\/project-management\/projects\/[^/]+\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';
    const isProjectBudgetMainRoute = /^\/project-management\/projects\/[^/]+\/budget\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';

    if (isAuthRoute || isHomeRoute) {
        return (
            <div className="app-shell min-h-screen text-foreground antialiased">
                {children}
            </div>
        );
    }

    if (isProjectMainRoute || isProjectBudgetMainRoute) {
        return (
            <div className="app-shell min-h-screen text-foreground antialiased">
                {children}
            </div>
        );
    }

    return (
        <div className="app-shell min-h-screen text-foreground">
            <GlobalTopBar />
            <main className="app-enter mx-auto max-w-[1640px] px-4 py-4 lg:px-6 lg:py-6">
                {children}
            </main>
        </div>
    );
};

export default Layout;
