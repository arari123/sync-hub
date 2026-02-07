import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, UserRound, ClipboardList, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

function formatScore(score) {
    if (typeof score !== 'number') return '-';
    return score.toFixed(2);
}

const ProjectResultList = ({ results }) => {
    if (!results.length) {
        return null;
    }

    return (
        <div className="space-y-3">
            {results.map((project) => (
                <Link
                    key={project.project_id}
                    to={`/budget-management/projects/${project.project_id}`}
                    className={cn(
                        'block rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md'
                    )}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-primary">{project.name || '이름 없는 프로젝트'}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-foreground/80">
                                {project.description || '프로젝트 개요가 등록되지 않았습니다.'}
                            </p>
                        </div>
                        <div className="shrink-0 text-[11px] text-muted-foreground">점수 {formatScore(project.score)}</div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                            <Building2 className="h-3 w-3" />
                            고객사: {project.customer_name || '-'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                            <UserRound className="h-3 w-3" />
                            담당자: {project.manager_name || '담당자 미지정'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                            <ClipboardList className="h-3 w-3" />
                            단계: {project.current_stage_label || '-'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-border/80 px-2 py-1 text-foreground">
                            프로젝트 상세 이동
                            <ArrowRight className="h-3 w-3" />
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    );
};

export default ProjectResultList;
