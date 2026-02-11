import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';
import { clearSession, getCurrentUser, isAuthenticated } from '../lib/session';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const pathname = location.pathname;
    const authed = isAuthenticated();
    const user = getCurrentUser();
    const isSearchRoute = pathname === '/' || pathname === '/search';
    const isProjectMainRoute = /^\/project-management\/projects\/[^/]+\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';
    const isProjectBudgetMainRoute = /^\/project-management\/projects\/[^/]+\/budget\/?$/.test(pathname)
        && pathname !== '/project-management/projects/new';
    const isProjectManagementRoute = pathname.startsWith('/project-management');
    const isBudgetContextRoute = /^\/project-management\/projects\/[^/]+\/(budget|edit\/(material|labor|expense))(\/|$)/.test(pathname);

    const logout = () => {
        clearSession();
        navigate('/login', { replace: true });
    };

    if (isSearchRoute || isProjectMainRoute || isProjectBudgetMainRoute) {
        return (
            <div className="min-h-screen bg-slate-50 font-sans text-foreground antialiased">
                {children}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/10 selection:text-primary">
            <div className="absolute inset-0 -z-10 h-full w-full bg-white [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#63e_100%)] dark:[background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] opacity-20 pointer-events-none" />
            <header className="container mx-auto px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Logo />
                    {isProjectManagementRoute && (
                        <div className="hidden sm:flex items-center gap-1 text-sm font-semibold tracking-tight text-foreground/85">
                            <Link to="/project-management" className="hover:text-primary transition-colors">
                                프로젝트 관리
                            </Link>
                            {isBudgetContextRoute && (
                                <>
                                    <span className="text-foreground/40">-</span>
                                    <span>예산 메인</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {authed ? (
                        <>
                            <span className="hidden text-xs text-muted-foreground md:inline">
                                {user?.email || '로그인 사용자'}
                            </span>
                            {!isProjectManagementRoute && (
                                <Link
                                    to="/project-management"
                                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                                >
                                    프로젝트 관리
                                </Link>
                            )}
                            <button
                                type="button"
                                onClick={logout}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
                            >
                                로그아웃
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
            </header>
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
        </div>
    );
};

export default Layout;
