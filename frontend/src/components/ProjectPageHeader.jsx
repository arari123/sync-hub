import React from 'react';
import BudgetBreadcrumb from './BudgetBreadcrumb';
import ProjectContextNav from './ProjectContextNav';

const ProjectPageHeader = ({
    projectId,
    projectName = '프로젝트',
    projectCode = '',
    pageLabel = '',
    breadcrumbItems = [],
    canEdit = true,
    actions = null,
}) => {
    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {projectName && (
                        <h1 className="text-2xl font-black tracking-tight text-slate-900">{projectName}</h1>
                    )}
                    {projectCode && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold tracking-tight text-slate-500">
                            {projectCode}
                        </span>
                    )}
                    {pageLabel && (
                        <span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600">
                            {pageLabel}
                        </span>
                    )}
                    {!canEdit && (
                        <span className="inline-flex h-6 items-center rounded-md border bg-slate-50 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            READ ONLY
                        </span>
                    )}
                </div>
            </div>

            <div className="w-full space-y-2 md:w-auto md:min-w-[540px]">
                <BudgetBreadcrumb items={breadcrumbItems} />
                <ProjectContextNav projectId={projectId} />
                {actions && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectPageHeader;
