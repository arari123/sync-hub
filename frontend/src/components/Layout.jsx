import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './ui/Logo';
import { clearSession, getCurrentUser, isAuthenticated } from '../lib/session';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const authed = isAuthenticated();
    const user = getCurrentUser();

    const logout = () => {
        clearSession();
        navigate('/login', { replace: true });
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/10 selection:text-primary">
            <div className="absolute inset-0 -z-10 h-full w-full bg-white [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#63e_100%)] dark:[background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] opacity-20 pointer-events-none" />
            <header className="container mx-auto px-4 py-4 flex items-center justify-between">
                <Logo />
                <div className="flex items-center gap-4">
                    {authed ? (
                        <>
                            <span className="hidden text-xs text-muted-foreground md:inline">
                                {user?.email || '로그인 사용자'}
                            </span>
                            {location.pathname !== '/budget-management' && (
                                <Link
                                    to="/budget-management"
                                    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                                >
                                    예산관리
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
