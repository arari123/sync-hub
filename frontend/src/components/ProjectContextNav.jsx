import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const MENU_ITEMS = [
    { key: 'overview', label: '프로젝트 메인', subPath: '' },
    {
        key: 'budget',
        label: '예산 메인',
        subPath: '/budget',
        children: [
            { key: 'material', label: '재료비 관리', subPath: '/edit/material' },
            { key: 'labor', label: '인건비 관리', subPath: '/edit/labor' },
            { key: 'expense', label: '경비 관리', subPath: '/edit/expense' },
        ],
    },
    { key: 'issue', label: '이슈 관리', subPath: '/agenda' },
    { key: 'schedule', label: '일정 관리', subPath: '/schedule' },
    { key: 'spec', label: '사양 관리', subPath: '/spec' },
    { key: 'data', label: '데이터 관리', subPath: '/data' },
    { key: 'info', label: '프로젝트 설정', subPath: '/info/edit' },
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
        }, 1000);
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
        <nav className={cn('bg-secondary p-1 rounded-lg inline-flex flex-wrap items-center justify-end gap-1', className)}>
            {MENU_ITEMS.map((item) => {
                const to = `${basePath}${item.subPath}`;
                const isActive = isMenuItemActive(item.key, location.pathname, basePath);
                const hasChildren = Array.isArray(item.children) && item.children.length > 0;

                if (!hasChildren) {
                    return (
                        <Link
                            key={item.key}
                            to={to}
                            className={cn(
                                'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                            )}
                        >
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
                                'inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                            )}
                        >
                            {item.label}
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                        </Link>

                        {isOpen && (
                            <div
                                className="absolute right-0 top-[calc(100%+6px)] z-30 w-max rounded-lg border border-border bg-card p-1.5 shadow-lg"
                                onMouseEnter={() => keepMenuOpen(item.key)}
                                onMouseLeave={scheduleMenuClose}
                            >
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                    {item.children.map((child) => {
                                        const childTo = `${basePath}${child.subPath}`;
                                        const isChildActive = isChildItemActive(location.pathname, basePath, child.subPath);
                                        return (
                                            <Link
                                                key={child.key}
                                                to={childTo}
                                                className={cn(
                                                    'inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-secondary',
                                                    isChildActive ? 'bg-secondary text-slate-900' : 'text-slate-700',
                                                )}
                                            >
                                                {child.label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
};

export default ProjectContextNav;
