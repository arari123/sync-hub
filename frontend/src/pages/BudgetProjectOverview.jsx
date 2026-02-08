import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';
import { Button } from '../components/ui/Button';

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
    return `${toNumber(value).toLocaleString('ko-KR')}원`;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ko-KR', { hour12: false });
}

const EMPTY_EDIT_FORM = {
    name: '',
    code: '',
    project_type: 'equipment',
    current_stage: 'review',
    customer_name: '',
    installation_site: '',
    manager_user_id: '',
    description: '',
    cover_image_url: '',
};

const ACTIVE_MANAGEMENT_AREAS = [
    { key: 'budget', label: '예산 관리', path: 'budget' },
    { key: 'joblist', label: '잡리스트', path: 'joblist' },
    { key: 'schedule', label: '일정 관리', path: 'schedule' },
];

const UPCOMING_MANAGEMENT_AREAS = [
    { key: 'spec', label: '사양 관리', path: 'spec' },
    { key: 'fabrication', label: '제작 관리', path: 'fabrication' },
    { key: 'installation', label: '설치 관리', path: 'installation' },
    { key: 'as', label: 'AS 관리', path: 'as' },
];

const JOBLIST_PLACEHOLDERS = [
    { title: '이슈 → 조치', description: '이슈 발생 원인과 조치 내역이 등록됩니다.' },
    { title: 'TODO LIST', description: '담당자별 작업 항목과 우선순위가 등록됩니다.' },
    { title: 'Q&A', description: '프로젝트 질의응답 이력이 등록됩니다.' },
];

const BudgetProjectOverview = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [totals, setTotals] = useState(null);
    const [managerOptions, setManagerOptions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

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
                setError(getErrorMessage(err, '프로젝트 예산 요약을 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [projectId]);

    useEffect(() => {
        if (!project) {
            setEditForm(EMPTY_EDIT_FORM);
            return;
        }
        setEditForm({
            name: project.name || '',
            code: project.code || '',
            project_type: project.project_type || 'equipment',
            current_stage: project.current_stage || 'review',
            customer_name: project.customer_name || '',
            installation_site: project.installation_site || '',
            manager_user_id: project.manager_user_id ? String(project.manager_user_id) : '',
            description: project.description || '',
            cover_image_url: project.cover_image_url || '',
        });
    }, [project]);

    useEffect(() => {
        if (!project?.can_edit) {
            setManagerOptions([]);
            return;
        }
        let mounted = true;
        const loadManagers = async () => {
            try {
                const response = await api.get('/auth/users');
                if (!mounted) return;
                const items = Array.isArray(response?.data) ? response.data : [];
                setManagerOptions(items);
            } catch (_err) {
                if (!mounted) return;
                setManagerOptions([]);
            }
        };
        loadManagers();
        return () => {
            mounted = false;
        };
    }, [project?.can_edit]);

    const monitoring = project?.monitoring || {};
    const projectGrandTotal = Math.max(toNumber(totals?.grand_total), 0);
    const confirmedMaterial = Math.max(toNumber(monitoring.confirmed_budget_material), toNumber(totals?.material_total));
    const confirmedLabor = Math.max(toNumber(monitoring.confirmed_budget_labor), toNumber(totals?.labor_total));
    const confirmedExpense = Math.max(toNumber(monitoring.confirmed_budget_expense), toNumber(totals?.expense_total));
    const confirmedTotal = Math.max(toNumber(monitoring.confirmed_budget_total), projectGrandTotal);

    const spentMaterial = Math.max(toNumber(monitoring.actual_spent_material), 0);
    const spentLabor = Math.max(toNumber(monitoring.actual_spent_labor), 0);
    const spentExpense = Math.max(toNumber(monitoring.actual_spent_expense), 0);
    const spentTotalFromParts = spentMaterial + spentLabor + spentExpense;
    const projectActualSpentTotal = Math.max(toNumber(monitoring.actual_spent_total), spentTotalFromParts, 0);
    const remainingTotal = confirmedTotal - projectActualSpentTotal;

    const equipmentCards = useMemo(
        () =>
            equipments.map((item) => {
                const material = toNumber(item.material_fab_cost) + toNumber(item.material_install_cost);
                const labor = toNumber(item.labor_fab_cost) + toNumber(item.labor_install_cost);
                const expense = toNumber(item.expense_fab_cost) + toNumber(item.expense_install_cost);
                const equipmentTotal = material + labor + expense;
                const spent = projectGrandTotal > 0 ? (equipmentTotal / projectGrandTotal) * projectActualSpentTotal : 0;
                const maxValue = Math.max(material, labor, expense, spent, 1);
                return {
                    equipment_name: item.equipment_name || '미지정 설비',
                    material,
                    labor,
                    expense,
                    spent,
                    maxValue,
                };
            }),
        [equipments, projectActualSpentTotal, projectGrandTotal]
    );

    const saveProjectBasics = async (event) => {
        event.preventDefault();
        if (!project?.id) return;
        const name = (editForm.name || '').trim();
        if (!name) {
            setSaveError('프로젝트 이름을 입력해 주세요.');
            return;
        }

        setSaveError('');
        setIsSaving(true);
        try {
            const response = await api.put(`/budget/projects/${project.id}`, {
                name,
                code: (editForm.code || '').trim(),
                project_type: editForm.project_type || 'equipment',
                current_stage: editForm.current_stage || 'review',
                customer_name: (editForm.customer_name || '').trim(),
                installation_site: (editForm.installation_site || '').trim(),
                manager_user_id: editForm.manager_user_id ? Number(editForm.manager_user_id) : undefined,
                description: (editForm.description || '').trim(),
                cover_image_url: (editForm.cover_image_url || '').trim(),
            });
            const updated = response?.data || null;
            if (updated) {
                setProject(updated);
            }
            setIsEditOpen(false);
        } catch (err) {
            setSaveError(getErrorMessage(err, '기본 정보 저장에 실패했습니다.'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    const coverImageUrl = (project.cover_image_display_url || project.cover_image_url || project.cover_image_fallback_url || '').trim();
    const milestones = Array.isArray(project.summary_milestones) ? project.summary_milestones : [];
    const baseProjectPath = `/project-management/projects/${project.id}`;
    const budgetManagementPath = `${baseProjectPath}/budget`;
    const scheduleManagementPath = `${baseProjectPath}/schedule`;
    const jobListPath = `${baseProjectPath}/joblist`;
    const managementLinks = ACTIVE_MANAGEMENT_AREAS.map((item) => ({
        ...item,
        to: `${baseProjectPath}/${item.path}`,
    }));
    const upcomingManagementLinks = UPCOMING_MANAGEMENT_AREAS.map((item) => ({
        ...item,
        to: `${baseProjectPath}/${item.path}`,
    }));

    return (
        <div className="space-y-5 pb-12 animate-in fade-in duration-500">
            {/* 1. Header & Breadcrumb */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <BudgetBreadcrumb
                        items={[
                            { label: '프로젝트 관리', to: '/project-management' },
                            { label: project.name || '프로젝트' },
                        ]}
                    />
                    <div className="flex items-center gap-3 mt-2">
                        <h1 className="text-2xl font-black tracking-tight text-slate-900">{project.name}</h1>
                        <span className="text-xs font-bold text-slate-400 font-mono tracking-tighter bg-slate-100 px-1.5 py-0.5 rounded">{project.code || 'NO-CODE'}</span>
                    </div>
                </div>
                <div className="w-full md:w-auto rounded-xl border bg-card/70 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {managementLinks.map((item) => (
                            <ManagementLinkButton key={item.key} to={item.to} label={item.label} />
                        ))}
                        {upcomingManagementLinks.map((item) => (
                            <ManagementLinkButton
                                key={item.key}
                                to={item.to}
                                label={item.label}
                                upcoming
                            />
                        ))}
                        {!project.can_edit && (
                            <span className="ml-1 inline-flex h-7 items-center rounded-md border bg-slate-50 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                READ ONLY
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. Dashboard Hero Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <HeroCard
                    label="현재 진행 단계"
                    value={project.current_stage_label || '-'}
                    subValue={`업데이트: ${formatDate(project.updated_at)}`}
                />
                <HeroCard
                    label="집행율"
                    value={`${((projectActualSpentTotal / Math.max(confirmedTotal, 1)) * 100).toFixed(1)}%`}
                    progress={(projectActualSpentTotal / Math.max(confirmedTotal, 1)) * 100}
                    subValue={`확정 예산: ${formatAmount(confirmedTotal)}`}
                />
                <HeroCard
                    label="현재 잔액"
                    value={formatAmount(remainingTotal)}
                    subValue="남은 가용 예산"
                    variant={remainingTotal < 0 ? 'destructive' : 'primary'}
                />
                <HeroCard
                    label="총 집행 금액"
                    value={formatAmount(projectActualSpentTotal)}
                    subValue={`전체 ${version?.version_no || '1'}개 버전 기반`}
                />
            </div>

            {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:[grid-template-rows:repeat(3,minmax(0,1fr))]">
                <section className="rounded-2xl border bg-card overflow-hidden shadow-sm lg:row-span-3 h-full min-h-0">
                    {coverImageUrl && (
                        <div className="w-full max-w-[360px] aspect-square overflow-hidden border-b border-slate-100 mx-auto">
                            <img src={coverImageUrl} alt={project.name} className="h-full w-full object-cover" />
                        </div>
                    )}
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold">프로젝트 정보</h2>
                            {project.can_edit && (
                                <button onClick={() => setIsEditOpen(true)} className="text-[10px] font-bold text-primary hover:underline underline-offset-4">상세 정보 수정</button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-2.5">
                            <IdentityRow label="고객사" value={project.customer_name} />
                            <IdentityRow label="설치 장소" value={project.installation_site} />
                            <IdentityRow label="담당자" value={project.manager_name} />
                            <IdentityRow label="프로젝트 구분" value={project.project_type_label} />
                            <IdentityRow label="현재 단계" value={project.current_stage_label} />
                        </div>
                        <div className="pt-3 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1.5">개요</p>
                            <p className="text-xs text-slate-600 leading-relaxed break-words whitespace-pre-wrap">
                                {project.description || '작성된 개요가 없습니다.'}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-4 shadow-sm h-full min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Link to={jobListPath} className="text-sm font-bold flex items-center gap-2 hover:text-primary">
                            <span className="w-1 h-4 bg-primary rounded-full" />
                            잡리스트
                        </Link>
                        <Link to={jobListPath}>
                            <Button size="sm" className="h-7 px-2.5 text-[11px] font-semibold">
                                잡리스트
                            </Button>
                        </Link>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <MiniStat label="이슈/조치" value={0} />
                        <MiniStat label="TODO" value={0} tone="primary" />
                        <MiniStat label="Q&A" value={0} />
                    </div>
                    <div className="space-y-2 overflow-auto flex-1 min-h-0 pr-1">
                        {JOBLIST_PLACEHOLDERS.map((item) => (
                            <div key={item.title} className="rounded-md border bg-muted/20 px-2.5 py-2">
                                <p className="text-[11px] font-semibold truncate">{item.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-4 shadow-sm h-full min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Link to={budgetManagementPath} className="text-sm font-bold flex items-center gap-2 hover:text-primary">
                            <span className="w-1 h-4 bg-primary rounded-full" />
                            예산/집행 분석
                        </Link>
                        <Link to={budgetManagementPath}>
                            <Button size="sm" className="h-7 px-2.5 text-[11px] font-semibold">
                                예산 관리
                            </Button>
                        </Link>
                    </div>
                    <div className="space-y-3 mt-auto">
                        <VarianceRow
                            label="재료비 (Material)"
                            confirmed={confirmedMaterial}
                            actual={spentMaterial}
                            color="blue"
                        />
                        <VarianceRow
                            label="인건비 (Labor)"
                            confirmed={confirmedLabor}
                            actual={spentLabor}
                            color="emerald"
                        />
                        <VarianceRow
                            label="경비 (Expense)"
                            confirmed={confirmedExpense}
                            actual={spentExpense}
                            color="indigo"
                        />
                    </div>
                </section>

                <section className="rounded-2xl border bg-card p-4 shadow-sm h-full min-h-0 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <Link to={scheduleManagementPath} className="text-sm font-bold flex items-center gap-2 hover:text-primary">
                            <span className="w-1 h-4 bg-primary rounded-full" />
                            주요 일정 (Timeline)
                        </Link>
                        <Link to={scheduleManagementPath}>
                            <Button size="sm" className="h-7 px-2.5 text-[11px] font-semibold">
                                일정 관리
                            </Button>
                        </Link>
                    </div>
                    <div className="relative pl-3 border-l-2 border-slate-100 space-y-4 ml-1.5 overflow-auto pr-1 flex-1 min-h-0">
                        {milestones.length > 0 ? (
                            milestones.map((item, idx) => (
                                <TimelineItem key={item.key || idx} item={item} />
                            ))
                        ) : (
                            <p className="text-xs text-slate-400">일정 데이터가 없습니다.</p>
                        )}
                    </div>
                </section>
            </div>

            {equipmentCards.length > 1 && (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                            <span className="w-1 h-4 bg-primary rounded-full" />
                            설비별 집행 현황
                        </h2>
                    </div>
                    <div className="flex flex-col gap-3">
                        {equipmentCards.map((item) => (
                            <CompactEquipmentCard key={item.equipment_name} item={item} />
                        ))}
                    </div>
                </section>
            )}

            {isEditOpen && (
                <ProjectEditModal
                    canEdit={project.can_edit}
                    form={editForm}
                    setForm={setEditForm}
                    managerOptions={managerOptions}
                    isSaving={isSaving}
                    saveError={saveError}
                    onClose={() => {
                        if (isSaving) return;
                        setSaveError('');
                        setIsEditOpen(false);
                    }}
                    onSubmit={saveProjectBasics}
                />
            )}
        </div>
    );
};

const HeroCard = ({ label, value, subValue, progress, variant = 'primary' }) => (
    <div className="bg-card border rounded-2xl p-4 shadow-sm relative overflow-hidden group">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
        <div className="flex items-baseline gap-1">
            <p className={cn(
                "text-xl font-black tracking-tighter",
                variant === 'destructive' ? 'text-destructive' : 'text-slate-950'
            )}>{value}</p>
        </div>
        <p className="text-[10px] font-medium text-slate-400 mt-1">{subValue}</p>
        {progress !== undefined && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-50">
                <div
                    className="h-full bg-primary transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                />
            </div>
        )}
    </div>
);

const VarianceRow = ({ label, confirmed, actual, color = 'blue' }) => {
    const ratio = confirmed > 0 ? (actual / confirmed) * 100 : 0;
    const isOver = actual > confirmed;

    const colorMap = {
        blue: 'bg-blue-500',
        emerald: 'bg-emerald-500',
        indigo: 'bg-indigo-500',
        amber: 'bg-amber-500',
        rose: 'bg-rose-500'
    };

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-slate-700 truncate">{label}</span>
                <span className={cn("font-semibold whitespace-nowrap", isOver ? 'text-destructive' : 'text-slate-700')}>
                    {formatAmount(actual)} / {formatAmount(confirmed)}
                </span>
            </div>
            <div className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={cn("h-full transition-all duration-700", isOver ? 'bg-rose-500' : colorMap[color])}
                    style={{ width: `${Math.min(ratio, 100)}%` }}
                />
                {isOver && (
                    <div className="absolute inset-0 bg-rose-500/20 animate-pulse" />
                )}
            </div>
            <div className="flex justify-between items-center text-[10px] px-0.5">
                <span className={cn(isOver ? 'text-destructive' : 'text-slate-400')}>
                    집행율 {ratio.toFixed(1)}% {isOver && '(예산 초과)'}
                </span>
                <span className="text-slate-400">
                    차이: {formatAmount(confirmed - actual)}
                </span>
            </div>
        </div>
    );
};

const CompactEquipmentCard = ({ item }) => {
    const totalBudget = item.material + item.labor + item.expense;
    const progress = totalBudget > 0 ? (item.spent / totalBudget) * 100 : 0;

    return (
        <article className="border border-slate-100 bg-slate-50/30 rounded-xl p-3 hover:border-primary/30 transition-all group">
            <div className="flex items-center justify-between mb-3 min-w-0">
                <h4 className="text-xs font-bold truncate pr-2 text-slate-800">{item.equipment_name}</h4>
                <span className="text-[10px] font-black tracking-tighter bg-white border border-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                    {progress.toFixed(0)}%
                </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-3">
                <MiniAmount label="재료비" value={item.material} />
                <MiniAmount label="인건비" value={item.labor} />
                <MiniAmount label="경비" value={item.expense} />
                <MiniAmount label="실집행" value={item.spent} color="primary" />
            </div>

            <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                />
            </div>
        </article>
    );
};

const MiniAmount = ({ label, value, color = 'muted' }) => (
    <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{label}</span>
        <span className={cn("text-[10px] font-semibold", color === 'primary' ? 'text-primary' : 'text-slate-600')}>{formatAmount(value)}</span>
    </div>
);

const ManagementLinkButton = ({ to, label, upcoming = false }) => (
    <Link
        to={to}
        className={cn(
            'inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-semibold transition-colors',
            upcoming
                ? 'border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted/40'
                : 'border-primary/35 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
        )}
    >
        {label}
    </Link>
);

const MiniStat = ({ label, value, tone = 'default' }) => (
    <div
        className={cn(
            'rounded-md border px-2 py-1.5 text-center',
            tone === 'primary' ? 'border-primary/30 bg-primary/5' : 'bg-muted/15'
        )}
    >
        <p className="text-[9px] text-muted-foreground">{label}</p>
        <p className={cn('text-[12px] font-bold', tone === 'primary' ? 'text-primary' : 'text-foreground')}>{value}</p>
    </div>
);

const IdentityRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">{label}</span>
        <span className="text-xs font-semibold text-slate-700 truncate">{value || '-'}</span>
    </div>
);

const TimelineItem = ({ item }) => {
    const status = String(item.status || 'planned').toLowerCase();
    const isActive = status === 'active';
    const isDone = status === 'done';

    return (
        <div className="relative flex items-start">
            <div className={cn(
                "absolute -left-[17px] mt-1 w-2 h-2 rounded-full border-2 ring-4 ring-card",
                isDone ? "bg-emerald-500 border-white shadow-sm" :
                    isActive ? "bg-blue-500 border-white shadow-[0_0_8px_rgba(59,130,246,0.5)]" :
                        "bg-white border-slate-300"
            )} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className={cn("text-xs font-bold leading-none", isActive ? "text-blue-600" : isDone ? "text-slate-800" : "text-slate-400")}>
                        {item.label}
                    </p>
                    <span className={cn(
                        "text-[9px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded",
                        isDone ? "bg-emerald-50 text-emerald-600" :
                            isActive ? "bg-blue-50 text-blue-600 animate-pulse" :
                                "bg-slate-50 text-slate-400"
                    )}>
                        {item.status_label}
                    </span>
                </div>
                <p className="text-[10px] font-medium text-slate-400 font-mono tracking-tighter">목표: {item.date || '-'}</p>
            </div>
        </div>
    );
};

const ProjectEditModal = ({ canEdit, form, setForm, managerOptions, isSaving, saveError, onClose, onSubmit }) => {
    if (!canEdit) return null;

    const updateField = (key, value) => {
        setForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 md:p-6">
            <div className="mx-auto max-w-2xl rounded-xl border bg-background shadow-2xl">
                <form onSubmit={onSubmit}>
                    <div className="flex items-center justify-between border-b px-5 py-4">
                        <h3 className="text-base font-semibold">프로젝트 기본 정보 수정</h3>
                        <button type="button" className="rounded-md p-1.5 hover:bg-accent" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
                        {saveError && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {saveError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="프로젝트 이름" required>
                                <input
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.name}
                                    onChange={(event) => updateField('name', event.target.value)}
                                />
                            </Field>
                            <Field label="프로젝트 코드">
                                <input
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.code}
                                    onChange={(event) => updateField('code', event.target.value)}
                                />
                            </Field>
                            <Field label="프로젝트 종류">
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.project_type}
                                    onChange={(event) => updateField('project_type', event.target.value)}
                                >
                                    <option value="equipment">설비</option>
                                    <option value="parts">파츠</option>
                                    <option value="as">AS</option>
                                </select>
                            </Field>
                            <Field label="현재 진행 단계">
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.current_stage}
                                    onChange={(event) => updateField('current_stage', event.target.value)}
                                >
                                    <option value="review">검토</option>
                                    <option value="fabrication">제작</option>
                                    <option value="installation">설치</option>
                                    <option value="warranty">AS</option>
                                    <option value="closure">종료</option>
                                </select>
                            </Field>
                            <Field label="담당자">
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.manager_user_id}
                                    onChange={(event) => updateField('manager_user_id', event.target.value)}
                                >
                                    <option value="">담당자 선택</option>
                                    {managerOptions.map((user) => (
                                        <option key={user.id} value={String(user.id)}>
                                            {(user.full_name || '').trim() || user.email}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="고객사">
                                <input
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.customer_name}
                                    onChange={(event) => updateField('customer_name', event.target.value)}
                                />
                            </Field>
                            <Field label="설치 장소">
                                <input
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={form.installation_site}
                                    onChange={(event) => updateField('installation_site', event.target.value)}
                                />
                            </Field>
                        </div>

                        <Field label="개요">
                            <textarea
                                className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={form.description}
                                onChange={(event) => updateField('description', event.target.value)}
                            />
                        </Field>

                        <Field label="대표 이미지 URL">
                            <input
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                placeholder="비워두면 자동 생성 이미지 사용"
                                value={form.cover_image_url}
                                onChange={(event) => updateField('cover_image_url', event.target.value)}
                            />
                        </Field>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
                        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
                            취소
                        </Button>
                        <Button type="submit" size="sm" isLoading={isSaving}>
                            저장
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Field = ({ label, children, required = false }) => (
    <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
            {label}
            {required ? ' *' : ''}
        </span>
        {children}
    </label>
);

export default BudgetProjectOverview;
