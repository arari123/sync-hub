import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Search,
    Database,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    User
} from 'lucide-react';
import Logo from './ui/Logo';
import { cn } from '../lib/utils';
import { clearSession, getCurrentUser } from '../lib/session';

const SidebarItem = ({ icon: Icon, label, to, active, collapsed }) => (
    <Link
        to={to}
        className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
            active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
    >
        <Icon className={cn("shrink-0", collapsed ? "w-6 h-6" : "w-5 h-5")} />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
        {collapsed && (
            <div className="absolute left-14 bg-popover text-popover-foreground px-2 py-1 rounded shadow-md text-xs font-medium opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                {label}
            </div>
        )}
    </Link>
);

const Sidebar = () => {
    const [collapsed, setCollapsed] = React.useState(false);
    const location = useLocation();
    const user = getCurrentUser();

    const navItems = [
        { icon: Search, label: '지식 검색', to: '/' },
        { icon: Database, label: '지식 베이스', to: '/knowledge' },
        { icon: Settings, label: '설정', to: '/settings' },
    ];

    const handleLogout = () => {
        clearSession();
        window.location.href = '/login';
    };

    return (
        <aside
            className={cn(
                "relative flex flex-col h-screen bg-card border-r transition-all duration-300 ease-in-out z-40",
                collapsed ? "w-16" : "w-64"
            )}
        >
            {/* Sidebar Header */}
            <div className={cn("p-4 flex items-center mb-6", collapsed ? "justify-center" : "justify-between")}>
                {!collapsed && <Logo size="small" />}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 px-3 space-y-1">
                {navItems.map((item) => (
                    <SidebarItem
                        key={item.to}
                        {...item}
                        active={location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))}
                        collapsed={collapsed}
                    />
                ))}
            </nav>

            {/* User & Logout */}
            <div className="p-4 border-t space-y-4">
                <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "px-2")}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <User size={18} />
                    </div>
                    {!collapsed && (
                        <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{user?.full_name || user?.name || '사용자'}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleLogout}
                    className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
                        collapsed && "justify-center"
                    )}
                >
                    <LogOut size={18} />
                    {!collapsed && <span className="text-sm font-medium">로그아웃</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
