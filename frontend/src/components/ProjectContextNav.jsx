import React from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const PRIMARY_MENU_ITEMS = [
    { key: 'overview', label: '프로젝트 상세', subPath: '' },
    { key: 'budget', label: '예산 관리', subPath: '/budget' },
    { key: 'issue', label: '이슈 관리', subPath: '/joblist' },
    { key: 'schedule', label: '일정 관리', subPath: '/schedule' },
    { key: 'spec', label: '사양 관리', subPath: '/spec' },
    { key: 'data', label: '데이터 관리', subPath: '/data' },
    { key: 'info', label: '프로젝트 정보 수정', subPath: '/info/edit' },
];

const BUDGET_INPUT_ITEMS = [
    { key: 'material', label: '재료비 입력', subPath: '/edit/material' },
    { key: 'labor', label: '인건비 입력', subPath: '/edit/labor' },
    { key: 'expense', label: '경비 입력', subPath: '/edit/expense' },
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
    return pathname.startsWith(`${basePath}${PRIMARY_MENU_ITEMS.find((item) => item.key === itemKey)?.subPath || ''}`);
}

const ProjectContextNav = () => {
    const location = useLocation();
    const isCreatePage = location.pathname === '/project-management/projects/new'
        || location.pathname.startsWith('/project-management/projects/new/');
    if (isCreatePage) {
        return null;
    }

    const projectMatch = matchPath('/project-management/projects/:projectId/*', location.pathname)
        || matchPath('/project-management/projects/:projectId', location.pathname);

    if (!projectMatch?.params?.projectId) {
        return null;
    }

    const { projectId } = projectMatch.params;
    const basePath = `/project-management/projects/${projectId}`;
    const isBudgetContext = isBudgetRootPath(location.pathname, basePath) || isBudgetInputPath(location.pathname, basePath);

    return (
        <div className="border-y border-slate-200 bg-white/90 backdrop-blur">
            <div className="container mx-auto px-4 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                        to="/project-management"
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        프로젝트 관리
                    </Link>
                    {PRIMARY_MENU_ITEMS.map((item) => {
                        const to = `${basePath}${item.subPath}`;
                        const isActive = isMenuItemActive(item.key, location.pathname, basePath);
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
                    })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={cn(
                        'inline-flex h-7 items-center rounded-md px-2 text-[10px] font-bold uppercase tracking-wider',
                        isBudgetContext ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500',
                    )}
                    >
                        예산 입력
                    </span>
                    {BUDGET_INPUT_ITEMS.map((item) => {
                        const to = `${basePath}${item.subPath}`;
                        const isActive = location.pathname === to || location.pathname === `${to}/`;
                        return (
                            <Link
                                key={item.key}
                                to={to}
                                className={cn(
                                    'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors',
                                    isActive
                                        ? 'border-primary/35 bg-primary text-primary-foreground'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                )}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ProjectContextNav;
