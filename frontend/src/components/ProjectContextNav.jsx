import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    CalendarDays,
    ChevronDown,
    Database,
    FileCode2,
    FolderKanban,
    Package,
    Receipt,
    Settings2,
    Users,
} from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const MENU_ITEMS = [
    { key: 'overview', label: '프로젝트 상세', subPath: '', icon: FolderKanban },
    {
        key: 'budget',
        label: '예산 관리',
        subPath: '/budget',
        icon: Receipt,
        children: [
            { key: 'material', label: '재료비 입력', subPath: '/edit/material', icon: Package },
            { key: 'labor', label: '인건비 입력', subPath: '/edit/labor', icon: Users },
            { key: 'expense', label: '경비 입력', subPath: '/edit/expense', icon: Receipt },
        ],
    },
    { key: 'issue', label: '이슈 관리', subPath: '/joblist', icon: AlertCircle },
    { key: 'schedule', label: '일정 관리', subPath: '/schedule', icon: CalendarDays },
    { key: 'spec', label: '사양 관리', subPath: '/spec', icon: FileCode2 },
    { key: 'data', label: '데이터 관리', subPath: '/data', icon: Database },
    { key: 'info', label: '프로젝트 정보 수정', subPath: '/info/edit', icon: Settings2 },
];

function isProjectOverviewPath(pathname, basePath) {
    return pathname === basePath || pathname === `${basePath}/`;
}

function isBudgetRootPath(pathname, basePath) {
    return pathname === `${basePath}/budget` || pathname === `${basePath}/budget/`;
}

function isBudgetInputPath(pathname, basePath) {
    return pathname.startsWith(`${basePath}/edit/`);
}

function isMenuItemActive(itemKey, pathname, basePath) {
    if (itemKey === 'overview') return isProjectOverviewPath(pathname, basePath);
    if (itemKey === 'budget') return isBudgetRootPath(pathname, basePath) || isBudgetInputPath(pathname, basePath);
    if (itemKey === 'info') return pathname.startsWith(`${basePath}/info/edit`);
    return pathname.startsWith(`${basePath}${MENU_ITEMS.find((item) => item.key === itemKey)?.subPath || ''}`);
}

function isChildItemActive(pathname, basePath, childPath) {
    return pathname === `${basePath}${childPath}` || pathname === `${basePath}${childPath}/`;
}

const ProjectContextNav = ({ projectId = '', className = '' }) => {
    const location = useLocation();
    const [openMenuKey, setOpenMenuKey] = useState('');
    const closeTimerRef = useRef(null);

    const clearCloseTimer = useCallback(() => {
        if (!closeTimerRef.current) return;
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }, []);

    const keepMenuOpen = useCallback((menuKey) => {
        clearCloseTimer();
        setOpenMenuKey(menuKey);
    }, [clearCloseTimer]);

    const scheduleMenuClose = useCallback(() => {
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
            setOpenMenuKey('');
            closeTimerRef.current = null;
        }, 2000);
    }, [clearCloseTimer]);

    useEffect(() => () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    const isCreatePagePath = location.pathname === '/project-management/projects/new'
        || location.pathname.startsWith('/project-management/projects/new/');

    if (isCreatePagePath && !projectId) {
        return null;
    }

    const matchedProjectRoute = matchPath('/project-management/projects/:projectId/*', location.pathname)
        || matchPath('/project-management/projects/:projectId', location.pathname);
    const resolvedProjectId = String(projectId || matchedProjectRoute?.params?.projectId || '').trim();

    if (!resolvedProjectId || resolvedProjectId === 'new') {
        return null;
    }

    const basePath = `/project-management/projects/${resolvedProjectId}`;

    return (
        <nav className={cn('rounded-xl border bg-white/95 p-1.5 shadow-sm', className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                {MENU_ITEMS.map((item) => {
                    const to = `${basePath}${item.subPath}`;
                    const isActive = isMenuItemActive(item.key, location.pathname, basePath);
                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
                    const Icon = item.icon;

                    if (!hasChildren) {
                        return (
                            <Link
                                key={item.key}
                                to={to}
                                className={cn(
                                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10.5px] font-semibold transition-colors',
                                    isActive
                                        ? 'border-primary/45 bg-primary/10 text-primary shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {item.label}
                            </Link>
                        );
                    }

                    const isOpen = openMenuKey === item.key;
                    return (
                        <div
                            key={item.key}
                            className="relative"
                            onMouseEnter={() => keepMenuOpen(item.key)}
                            onMouseLeave={scheduleMenuClose}
                            onFocusCapture={() => keepMenuOpen(item.key)}
                            onBlurCapture={scheduleMenuClose}
                        >
                            <Link
                                to={to}
                                className={cn(
                                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10.5px] font-semibold transition-colors',
                                    isActive
                                        ? 'border-primary/45 bg-primary/10 text-primary shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {item.label}
                                <ChevronDown className={cn('h-3 w-3 opacity-70 transition-transform', isOpen && 'rotate-180')} />
                            </Link>

                            <div
                                className={cn(
                                    'absolute left-0 top-full z-30 mt-1 min-w-[170px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg transition-all',
                                    isOpen
                                        ? 'pointer-events-auto translate-y-0 opacity-100'
                                        : 'pointer-events-none translate-y-1 opacity-0',
                                )}
                            >
                                {item.children.map((child) => {
                                    const childTo = `${basePath}${child.subPath}`;
                                    const isChildActive = isChildItemActive(location.pathname, basePath, child.subPath);
                                    const ChildIcon = child.icon;
                                    return (
                                        <Link
                                            key={child.key}
                                            to={childTo}
                                            className={cn(
                                                'flex h-7 items-center gap-1.5 rounded-md px-2 text-[10.5px] font-semibold transition-colors',
                                                isChildActive
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'text-slate-600 hover:bg-slate-100',
                                            )}
                                        >
                                            <ChildIcon className="h-3.5 w-3.5" />
                                            {child.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </nav>
    );
};

export default ProjectContextNav;
