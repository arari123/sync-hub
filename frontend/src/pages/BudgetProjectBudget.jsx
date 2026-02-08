import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import ProjectPageHeader from '../components/ProjectPageHeader';

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
    return `${toNumber(value).toLocaleString('ko-KR')}원`;
}

const BudgetProjectBudget = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [totals, setTotals] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const versionsResp = await api.get(`/budget/projects/${projectId}/versions`);
                const payload = versionsResp?.data || {};
                const currentProject = payload.project || null;
                setProject(currentProject);

                const currentVersion = (payload.versions || []).find((item) => item.is_current) || (payload.versions || [])[0] || null;
                setVersion(currentVersion);

                if (!currentVersion?.id) {
                    setEquipments([]);
                    setTotals(currentProject?.totals || null);
                    return;
                }

                const equipmentResp = await api.get(`/budget/versions/${currentVersion.id}/equipments`);
                const itemList = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
                setEquipments(itemList);
                setTotals(equipmentResp?.data?.totals || currentProject?.totals || null);
            } catch (err) {
                setError(getErrorMessage(err, '예산 관리 데이터를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [projectId]);

    const equipmentCards = useMemo(
        () =>
            equipments.map((item) => {
                const material = toNumber(item.material_fab_cost) + toNumber(item.material_install_cost);
                const labor = toNumber(item.labor_fab_cost) + toNumber(item.labor_install_cost);
                const expense = toNumber(item.expense_fab_cost) + toNumber(item.expense_install_cost);
                const maxValue = Math.max(material, labor, expense, 1);
                return {
                    equipment_name: item.equipment_name || '미지정 설비',
                    material,
                    labor,
                    expense,
                    maxValue,
                };
            }),
        [equipments]
    );

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    const monitoring = project?.monitoring || {};

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="예산 관리"
                canEdit={project.can_edit}
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                    { label: '예산 관리' },
                ]}
            />

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div>
                    <p className="text-xs text-muted-foreground">프로젝트 예산 운영</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        현재 단계: {project.current_stage_label || '-'} · 버전 {version?.version_no || '-'}
                        {version?.revision_no > 0 ? `-r${version.revision_no}` : ''}
                    </p>
                </div>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">예산 요약</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <AmountCell label="재료비" value={formatAmount(totals?.material_total)} />
                    <AmountCell label="인건비" value={formatAmount(totals?.labor_total)} />
                    <AmountCell label="경비" value={formatAmount(totals?.expense_total)} />
                    <AmountCell label="총액" value={formatAmount(totals?.grand_total)} strong />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <AmountCell label="확정 예산" value={formatAmount(monitoring.confirmed_budget_total)} />
                    <AmountCell
                        label="집행 금액"
                        value={monitoring.actual_spent_total === null || monitoring.actual_spent_total === undefined ? '-' : formatAmount(monitoring.actual_spent_total)}
                    />
                    <AmountCell
                        label="차액"
                        value={monitoring.variance_total === null || monitoring.variance_total === undefined ? '-' : formatAmount(monitoring.variance_total)}
                        strong={monitoring.variance_total !== null && monitoring.variance_total !== undefined}
                    />
                </div>
            </section>

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">설비별 예산 현황</h2>
                {!equipmentCards.length ? (
                    <p className="text-sm text-muted-foreground">설비 예산 데이터가 아직 없습니다.</p>
                ) : (
                    <div className={equipmentCards.length === 1 ? 'space-y-3' : 'grid grid-cols-1 gap-3 lg:grid-cols-2'}>
                        {equipmentCards.map((item) => (
                            <article key={item.equipment_name} className="rounded-lg border bg-muted/10 p-4">
                                <p className="mb-3 text-sm font-semibold">{item.equipment_name}</p>
                                <GraphRow label="재료비" value={item.material} maxValue={item.maxValue} barClass="bg-blue-500" />
                                <GraphRow label="인건비" value={item.labor} maxValue={item.maxValue} barClass="bg-emerald-500" />
                                <GraphRow label="경비" value={item.expense} maxValue={item.maxValue} barClass="bg-amber-500" />
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const AmountCell = ({ label, value, strong = false }) => (
    <div className={`rounded-md border p-3 ${strong ? 'border-primary/40 bg-primary/5' : 'bg-muted/10'}`}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-sm ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</p>
    </div>
);

const GraphRow = ({ label, value, maxValue, barClass }) => {
    const ratio = Math.max(0, Math.min(100, (toNumber(value) / toNumber(maxValue || 1)) * 100));
    return (
        <div className="mb-2.5">
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{formatAmount(value)}</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${barClass}`} style={{ width: `${ratio}%` }} />
            </div>
        </div>
    );
};

export default BudgetProjectBudget;
