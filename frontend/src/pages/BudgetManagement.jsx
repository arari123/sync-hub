import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FolderKanban, ArrowRight } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
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

    return (
        <div className="space-y-6">
            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">예산관리</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            프로젝트별 요약 예산 현황을 확인하고 상세 예산 입력 화면으로 이동할 수 있습니다.
                        </p>
                    </div>
                    <Link
                        to="/budget-management/projects/new"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                        <Plus className="h-4 w-4" />
                        프로젝트 생성
                    </Link>
                </div>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">프로젝트 예산 현황</h2>
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
                    <div className="overflow-x-auto rounded-md border">
                        <table className="min-w-[1100px] w-full text-sm">
                            <thead className="bg-muted/30">
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="px-3 py-3 font-medium">프로젝트</th>
                                    <th className="px-3 py-3 font-medium">단계</th>
                                    <th className="px-3 py-3 font-medium text-right">재료비</th>
                                    <th className="px-3 py-3 font-medium text-right">인건비</th>
                                    <th className="px-3 py-3 font-medium text-right">경비</th>
                                    <th className="px-3 py-3 font-medium text-right">총액</th>
                                    <th className="px-3 py-3 font-medium text-center">입력</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((project) => (
                                    <tr key={project.id} className="border-t">
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2">
                                                <FolderKanban className="h-4 w-4 text-primary" />
                                                <div>
                                                    <p className="font-semibold">{project.name}</p>
                                                    <p className="text-xs text-muted-foreground">코드: {project.code || '-'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-xs">{project.current_stage_label}</td>
                                        <td className="px-3 py-3 text-right text-xs">{formatAmount(project.totals?.material_total)}</td>
                                        <td className="px-3 py-3 text-right text-xs">{formatAmount(project.totals?.labor_total)}</td>
                                        <td className="px-3 py-3 text-right text-xs">{formatAmount(project.totals?.expense_total)}</td>
                                        <td className="px-3 py-3 text-right text-xs font-semibold">{formatAmount(project.totals?.grand_total)}</td>
                                        <td className="px-3 py-3 text-center">
                                            <Link
                                                to={`/budget-management/projects/${project.id}/edit/material`}
                                                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs hover:bg-accent hover:text-accent-foreground"
                                            >
                                                상세 입력
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default BudgetManagement;
