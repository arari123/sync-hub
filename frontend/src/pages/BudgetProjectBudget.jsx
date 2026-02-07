import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, PencilLine } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
    return `${toNumber(value).toLocaleString('ko-KR')}원`;
}

const EDIT_SECTIONS = [
    { key: 'material', label: '재료비 입력' },
    { key: 'labor', label: '인건비 입력' },
    { key: 'expense', label: '경비 입력' },
];

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
            <BudgetBreadcrumb
                items={[
                    { label: '프로젝트 관리', to: '/budget-management' },
                    { label: project.name || '프로젝트', to: `/budget-management/projects/${project.id}` },
                    { label: '예산 관리' },
                ]}
            />

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">프로젝트 예산 운영</p>
                        <h1 className="text-2xl font-bold">예산 관리</h1>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {project.name} · 단계: {project.current_stage_label} · 버전 {version?.version_no || '-'}
                            {version?.revision_no > 0 ? `-r${version.revision_no}` : ''}
                        </p>
                    </div>
                    <Link
                        to={`/budget-management/projects/${project.id}`}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs hover:bg-accent"
                    >
                        프로젝트 상세
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="mb-3 text-base font-semibold">입력 페이지 이동</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {EDIT_SECTIONS.map((item) => (
                        <Link
                            key={item.key}
                            to={`/budget-management/projects/${project.id}/edit/${item.key}`}
                            className={`inline-flex h-9 items-center justify-center gap-1 rounded-md border px-3 text-sm ${
                                project?.can_edit
                                    ? 'border-input bg-background hover:bg-accent'
                                    : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/30'
                            }`}
                        >
                            <PencilLine className="h-3.5 w-3.5" />
                            {item.label}
                        </Link>
                    ))}
                </div>
                {!project?.can_edit && (
                    <p className="mt-2 text-xs text-muted-foreground">읽기 전용 권한입니다. 입력 페이지에서는 수정할 수 없습니다.</p>
                )}
            </section>

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
