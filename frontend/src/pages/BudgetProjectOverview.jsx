import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, PencilLine, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
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
    customer_name: '',
    installation_site: '',
    manager_user_id: '',
    description: '',
    cover_image_url: '',
};

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

    return (
        <>
            <div className="space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <BudgetBreadcrumb
                            items={[
                                { label: '프로젝트 관리', to: '/project-management' },
                                { label: project.name || '프로젝트' },
                            ]}
                        />
                        <h1 className="text-3xl font-bold tracking-tight mt-2">{project.name}</h1>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <StageBadge label={`단계 ${project.current_stage_label || '-'}`} accent />
                            <StageBadge
                                label={`버전 ${version?.version_no || '-'}${version?.revision_no > 0 ? `-r${version.revision_no}` : ''}`}
                            />
                            <StageBadge label={`업데이트 ${formatDate(project.updated_at)}`} muted={false} />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to={`/project-management/projects/${project.id}/budget`}>
                            <Button className="gap-2">
                                예산 관리
                                <ArrowRight size={18} />
                            </Button>
                        </Link>
                        {!project.can_edit && (
                            <span className="inline-flex h-10 items-center px-4 rounded-lg border bg-muted text-xs font-semibold text-muted-foreground shadow-sm">
                                읽기 전용
                            </span>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <section className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">프로젝트 기본 정보</h2>
                        {project.can_edit && (
                            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setIsEditOpen(true)}>
                                <PencilLine className="h-3.5 w-3.5" />
                                기본 정보 수정
                            </Button>
                        )}
                    </div>

                    <div className={coverImageUrl ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]' : 'space-y-3'}>
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <InfoCell label="종류" value={project.project_type_label || '-'} compact />
                                <InfoCell label="담당자" value={project.manager_name || '담당자 미지정'} compact />
                                <InfoCell label="고객사" value={project.customer_name || '-'} compact />
                                <InfoCell label="설치 장소" value={project.installation_site || '-'} compact />
                                <InfoCell label="코드" value={project.code || '-'} compact />
                                <InfoCell label="작성자" value={project.created_by_name || '-'} compact />
                            </div>
                            <InfoCell label="개요" value={project.description || '개요가 아직 없습니다.'} />
                        </div>

                        {coverImageUrl && (
                            <article className="overflow-hidden rounded-lg border bg-muted/10">
                                <img src={coverImageUrl} alt={`${project.name} 대표 이미지`} className="h-full min-h-[180px] w-full object-cover" />
                            </article>
                        )}
                    </div>
                </section>

                <section className="rounded-xl border bg-card p-6 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold">요약 일정</h2>
                        <span className="text-xs text-muted-foreground">{project.schedule_detail_note || '상세 일정 작성은 추후 구현 예정입니다.'}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {milestones.map((item) => (
                            <MilestoneCard key={item.key || item.label} item={item} />
                        ))}
                    </div>
                </section>

                <section className="rounded-xl border bg-card p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold">전체 예산 요약</h2>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                        <AmountCell
                            label="재료비"
                            value={formatAmount(confirmedMaterial)}
                            subLabel="집행 금액"
                            subValue={formatAmount(spentMaterial)}
                        />
                        <AmountCell
                            label="인건비"
                            value={formatAmount(confirmedLabor)}
                            subLabel="집행 금액"
                            subValue={formatAmount(spentLabor)}
                        />
                        <AmountCell
                            label="경비"
                            value={formatAmount(confirmedExpense)}
                            subLabel="집행 금액"
                            subValue={formatAmount(spentExpense)}
                        />
                        <AmountCell
                            label="확정 예산"
                            value={formatAmount(confirmedTotal)}
                            subLabel="집행 금액 합계"
                            subValue={formatAmount(projectActualSpentTotal)}
                            strong
                        />
                        <AmountCell
                            label="잔액"
                            value={formatAmount(remainingTotal)}
                            note="확정예산 - 집행금액 = 잔액"
                            strong
                        />
                    </div>
                </section>

                <section className="rounded-xl border bg-card p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold">설비별 예산/집행 현황</h2>
                    {!equipmentCards.length ? (
                        <p className="text-sm text-muted-foreground">설비 예산 데이터가 아직 없습니다.</p>
                    ) : (
                        <div className={equipmentCards.length === 1 ? 'space-y-3' : 'grid grid-cols-1 gap-3 lg:grid-cols-2'}>
                            {equipmentCards.map((item) => (
                                <article key={item.equipment_name} className="rounded-lg border bg-muted/10 p-4">
                                    <p className="mb-3 text-sm font-semibold">{item.equipment_name}</p>
                                    <GraphRow
                                        label="재료비"
                                        value={item.material}
                                        maxValue={item.maxValue}
                                        barClass="bg-blue-500"
                                    />
                                    <GraphRow
                                        label="인건비"
                                        value={item.labor}
                                        maxValue={item.maxValue}
                                        barClass="bg-emerald-500"
                                    />
                                    <GraphRow
                                        label="경비"
                                        value={item.expense}
                                        maxValue={item.maxValue}
                                        barClass="bg-amber-500"
                                    />
                                    <GraphRow
                                        label="집행"
                                        value={item.spent}
                                        maxValue={item.maxValue}
                                        barClass="bg-rose-500"
                                    />
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>

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
        </>
    );
};

const StageBadge = ({ label, accent = false, muted = true }) => {
    const styleClass = accent
        ? 'border-primary/30 bg-primary/10 text-primary'
        : muted
            ? 'border-border bg-muted/15 text-muted-foreground'
            : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
    return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${styleClass}`}>{label}</span>;
};

const InfoCell = ({ label, value, compact = false }) => (
    <div className={`rounded-md border bg-muted/10 ${compact ? 'px-3 py-2.5' : 'p-3'}`}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 ${compact ? 'text-sm font-semibold' : 'text-sm font-medium'} break-words`}>{value}</p>
    </div>
);

const AmountCell = ({ label, value, subLabel = '', subValue = '', note = '', strong = false }) => (
    <div className={`rounded-md border p-3 ${strong ? 'border-primary/40 bg-primary/5' : 'bg-muted/10'}`}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-sm ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</p>
        {subLabel && (
            <div className="mt-1.5">
                <p className="text-[11px] text-muted-foreground">{subLabel}</p>
                <p className="mt-0.5 text-sm font-semibold">{subValue || '-'}</p>
            </div>
        )}
        {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
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

const MilestoneCard = ({ item }) => {
    const status = String(item.status || 'planned').toLowerCase();
    const markerClass = status === 'done'
        ? 'bg-emerald-500'
        : status === 'active'
            ? 'bg-blue-500'
            : 'bg-slate-300 dark:bg-slate-600';

    const statusClass = status === 'done'
        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
        : status === 'active'
            ? 'bg-blue-500/12 text-blue-700 dark:text-blue-300'
            : 'bg-muted/50 text-muted-foreground';

    return (
        <article className="rounded-md border bg-muted/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${markerClass}`} />
                    <p className="text-sm font-semibold">{item.label || '-'}</p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}>
                    {item.status_label || '-'}
                </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">목표일 {item.date || '-'}</p>
        </article>
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
