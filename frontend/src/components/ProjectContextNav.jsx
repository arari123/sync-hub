import React from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const MENU_ITEMS = [
    { key: 'overview', label: '프로젝트 메인', subPath: '' },
    { key: 'budget', label: '예산 메인', subPath: '/budget' },
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
        <nav className={cn('bg-secondary p-1 rounded-lg inline-flex flex-wrap items-center justify-end gap-1', className)}>
            {MENU_ITEMS.map((item) => {
                const to = `${basePath}${item.subPath}`;
                const isActive = isMenuItemActive(item.key, location.pathname, basePath);
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
            })}
        </nav>
    );
};

export default ProjectContextNav;
