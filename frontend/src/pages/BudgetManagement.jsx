import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderKanban, ArrowRight } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

function stageBadgeClass(stage) {
    if (stage === 'progress') {
        return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    if (stage === 'closure') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    return 'border-blue-200 bg-blue-50 text-blue-700';
}

const BudgetManagement = () => {
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await api.get('/budget/projects');
            setProjects(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const summary = projects.reduce(
        (acc, project) => {
            acc.projectCount += 1;
            if (project?.current_stage === 'progress') {
                acc.progressCount += 1;
            } else if (project?.current_stage === 'closure') {
                acc.closureCount += 1;
            } else {
                acc.reviewCount += 1;
            }
            return acc;
        },
        {
            projectCount: 0,
            reviewCount: 0,
            progressCount: 0,
            closureCount: 0,
        }
    );

    return (
        <div className="space-y-6">
            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">예산관리</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            전체 프로젝트 예산 현황을 모니터링하고 상세 입력으로 이동할 수 있습니다.
                        </p>
                    </div>
                    <Link
                        to="/budget-management/projects/new"
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        프로젝트 생성
                    </Link>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    전체 프로젝트 {summary.projectCount}개 · 검토 {summary.reviewCount}개 · 진행 {summary.progressCount}개 · 종료 {summary.closureCount}개
                </p>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">프로젝트 모니터링</h2>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">불러오는 중...</p>
                ) : projects.length === 0 ? (
                    <div className="rounded-md border border-dashed px-4 py-8 text-center">
                        <p className="text-sm text-muted-foreground">등록된 프로젝트가 없습니다.</p>
                        <Link
                            to="/budget-management/projects/new"
                            className="mt-3 inline-flex h-9 items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            첫 프로젝트 생성하기
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                        {projects.map((project) => {
                            const confirmedBudget = Number(project?.monitoring?.confirmed_budget_total ?? project?.totals?.grand_total ?? 0);
                            const actualSpentRaw = project?.monitoring?.actual_spent_total;
                            const hasActual = actualSpentRaw !== null && actualSpentRaw !== undefined;
                            const actualSpent = hasActual ? Number(actualSpentRaw) : 0;
                            const variance = hasActual
                                ? Number(project?.monitoring?.variance_total ?? confirmedBudget - actualSpent)
                                : null;
                            const showExecutionPanel = project?.current_stage !== 'review';

                            return (
                                <article key={project.id} className="rounded-xl border bg-muted/10 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{project.name}</p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">코드: {project.code || '-'}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${stageBadgeClass(project.current_stage)}`}>
                                                {project.current_stage_label}
                                            </span>
                                            <Link
                                                to={`/budget-management/projects/${project.id}/edit/material`}
                                                className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-[11px] hover:bg-accent hover:text-accent-foreground"
                                            >
                                                입력
                                                <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <AmountCell label="재료비" value={formatAmount(project.totals?.material_total)} />
                                        <AmountCell label="인건비" value={formatAmount(project.totals?.labor_total)} />
                                        <AmountCell label="경비" value={formatAmount(project.totals?.expense_total)} />
                                        <AmountCell label="총 예산" value={formatAmount(project.totals?.grand_total)} strong />
                                    </div>

                                    <div className="my-3 border-t" />

                                    {showExecutionPanel ? (
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                            <AmountCell label="확정 예산" value={formatAmount(confirmedBudget)} />
                                            <AmountCell label="집행 금액" value={hasActual ? formatAmount(actualSpent) : '-'} />
                                            <AmountCell label="차액" value={hasActual ? formatAmount(variance) : '-'} strong={hasActual} />
                                        </div>
                                    ) : null}

                                    {showExecutionPanel && !hasActual && (
                                        <p className="mt-2 text-[11px] text-muted-foreground">
                                            집행 금액 연동 전: 현재는 확정 예산 기준으로 모니터링 구조만 제공됩니다.
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

const AmountCell = ({ label, value, strong = false }) => (
    <div className={`rounded-md border px-2 py-2 ${strong ? 'border-primary/30 bg-primary/5' : 'bg-background'}`}>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xs ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</p>
    </div>
);

export default BudgetManagement;
