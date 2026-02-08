import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const MENU_ITEMS = [
    { key: 'overview', label: '프로젝트 상세', subPath: '' },
    {
        key: 'budget',
        label: '예산 관리',
        subPath: '/budget',
        children: [
            { key: 'material', label: '재료비 입력', subPath: '/edit/material' },
            { key: 'labor', label: '인건비 입력', subPath: '/edit/labor' },
            { key: 'expense', label: '경비 입력', subPath: '/edit/expense' },
        ],
    },
    { key: 'issue', label: '이슈 관리', subPath: '/joblist' },
    { key: 'schedule', label: '일정 관리', subPath: '/schedule' },
    { key: 'spec', label: '사양 관리', subPath: '/spec' },
    { key: 'data', label: '데이터 관리', subPath: '/data' },
    { key: 'info', label: '프로젝트 정보 수정', subPath: '/info/edit' },
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
        <nav className={cn('rounded-xl border bg-white/95 p-2 shadow-sm', className)}>
            <div className="flex flex-wrap items-center gap-1.5">
                <Link
                    to="/project-management"
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                    프로젝트 관리
                </Link>

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
                                    'inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors',
                                    isActive
                                        ? 'border-primary/40 bg-primary/10 text-primary'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                )}
                            >
                                {item.label}
                            </Link>
                        );
                    }

                    return (
                        <div key={item.key} className="relative group/budget-menu">
                            <Link
                                to={to}
                                className={cn(
                                    'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition-colors',
                                    isActive
                                        ? 'border-primary/40 bg-primary/10 text-primary'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                )}
                            >
                                {item.label}
                                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                            </Link>

                            <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 min-w-[170px] translate-y-1 rounded-lg border border-slate-200 bg-white p-1 opacity-0 shadow-lg transition-all group-hover/budget-menu:pointer-events-auto group-hover/budget-menu:translate-y-0 group-hover/budget-menu:opacity-100 group-focus-within/budget-menu:pointer-events-auto group-focus-within/budget-menu:translate-y-0 group-focus-within/budget-menu:opacity-100">
                                {item.children.map((child) => {
                                    const childTo = `${basePath}${child.subPath}`;
                                    const isChildActive = isChildItemActive(location.pathname, basePath, child.subPath);
                                    return (
                                        <Link
                                            key={child.key}
                                            to={childTo}
                                            className={cn(
                                                'flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors',
                                                isChildActive
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-slate-600 hover:bg-slate-100',
                                            )}
                                        >
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
