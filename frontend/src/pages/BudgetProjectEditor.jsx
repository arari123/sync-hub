import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Plus, Save } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';

const SECTION_META = {
    material: { label: '재료비', key: 'material_items' },
    labor: { label: '인건비', key: 'labor_items' },
    expense: { label: '경비', key: 'expense_items' },
};

function toNumber(value) {
    const number = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(number) ? number : 0;
}

function buildEmptyRow(section) {
    if (section === 'material') {
        return {
            equipment_name: '',
            unit_name: '',
            part_name: '',
            spec: '',
            quantity: 0,
            unit_price: 0,
            phase: 'fabrication',
            memo: '',
        };
    }
    if (section === 'labor') {
        return {
            equipment_name: '',
            task_name: '',
            worker_type: '',
            unit: 'H',
            quantity: 0,
            hourly_rate: 0,
            phase: 'fabrication',
            memo: '',
        };
    }
    return {
        equipment_name: '',
        expense_name: '',
        basis: '',
        amount: 0,
        phase: 'fabrication',
        memo: '',
    };
}

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

const BudgetProjectEditor = () => {
    const navigate = useNavigate();
    const { projectId, section = 'material' } = useParams();

    if (!SECTION_META[section]) {
        return <Navigate to={`/budget-management/projects/${projectId}/edit/material`} replace />;
    }

    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [details, setDetails] = useState({
        material_items: [],
        labor_items: [],
        expense_items: [],
    });
    const [totals, setTotals] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const rows = details[SECTION_META[section].key] || [];
    const canEditProject = project?.can_edit !== false;
    const isConfirmed = version?.status === 'confirmed';
    const isReadonly = isConfirmed || !canEditProject;

    const load = async () => {
        if (!projectId) return;
        setIsLoading(true);
        setError('');
        try {
            const versionResp = await api.get(`/budget/projects/${projectId}/versions`);
            const payload = versionResp?.data || {};
            setProject(payload.project || null);

            let currentVersion = (payload.versions || []).find((item) => item.is_current);
            if (!currentVersion) {
                const created = await api.post(`/budget/projects/${projectId}/versions`, { stage: 'review' });
                currentVersion = created.data;
            }
            setVersion(currentVersion || null);

            const detailResp = await api.get(`/budget/versions/${currentVersion.id}/details`);
            setDetails(detailResp?.data?.details || { material_items: [], labor_items: [], expense_items: [] });
            setTotals(detailResp?.data?.totals || null);
        } catch (err) {
            setError(getErrorMessage(err, '예산 상세 데이터를 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const stageTabs = useMemo(
        () => Object.entries(SECTION_META).map(([key, value]) => ({ key, ...value })),
        []
    );

    const updateRow = (index, key, value) => {
        const targetKey = SECTION_META[section].key;
        setDetails((prev) => ({
            ...prev,
            [targetKey]: (prev[targetKey] || []).map((row, rowIndex) => {
                if (rowIndex !== index) return row;
                if (['quantity', 'unit_price', 'hourly_rate', 'amount'].includes(key)) {
                    return { ...row, [key]: toNumber(value) };
                }
                return { ...row, [key]: value };
            }),
        }));
    };

    const addRow = () => {
        const targetKey = SECTION_META[section].key;
        setDetails((prev) => ({
            ...prev,
            [targetKey]: [...(prev[targetKey] || []), buildEmptyRow(section)],
        }));
    };

    const removeRow = (index) => {
        const targetKey = SECTION_META[section].key;
        setDetails((prev) => ({
            ...prev,
            [targetKey]: (prev[targetKey] || []).filter((_, rowIndex) => rowIndex !== index),
        }));
    };

    const saveDetail = async () => {
        if (!version?.id) return;
        setIsSaving(true);
        setError('');
        try {
            const response = await api.put(`/budget/versions/${version.id}/details`, details);
            setDetails(response?.data?.details || details);
            setTotals(response?.data?.totals || totals);
            setVersion(response?.data?.version || version);
        } catch (err) {
            setError(getErrorMessage(err, '상세 저장에 실패했습니다.'));
        } finally {
            setIsSaving(false);
        }
    };

    const confirmCurrentVersion = async () => {
        if (!version?.id) return;
        setIsConfirming(true);
        setError('');
        try {
            const response = await api.post(`/budget/versions/${version.id}/confirm`);
            setVersion(response?.data?.version || version);
        } catch (err) {
            setError(getErrorMessage(err, '버전 확정에 실패했습니다.'));
        } finally {
            setIsConfirming(false);
        }
    };

    const createRevision = async () => {
        if (!version?.id) return;
        const reason = window.prompt('리비전 사유를 입력해 주세요.');
        if (!reason || !reason.trim()) return;
        setError('');
        try {
            const response = await api.post(`/budget/versions/${version.id}/revision`, {
                change_reason: reason.trim(),
            });
            const nextVersion = response?.data?.version;
            if (!nextVersion?.id) return;
            setVersion(nextVersion);
            const detailResp = await api.get(`/budget/versions/${nextVersion.id}/details`);
            setDetails(detailResp?.data?.details || details);
            setTotals(detailResp?.data?.totals || totals);
        } catch (err) {
            setError(getErrorMessage(err, '리비전 생성에 실패했습니다.'));
        }
    };

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    return (
        <div className="space-y-5">
            <BudgetBreadcrumb
                items={[
                    { label: '프로젝트 관리', to: '/budget-management' },
                    { label: project?.name || '프로젝트', to: `/budget-management/projects/${projectId}` },
                    { label: '예산 관리', to: `/budget-management/projects/${projectId}/budget` },
                    { label: `${SECTION_META[section].label} 입력` },
                ]}
            />

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">프로젝트 예산 입력</p>
                        <h1 className="text-2xl font-bold">{project?.name || '프로젝트'}</h1>
                        <p className="mt-1 text-xs text-muted-foreground">
                            버전 v{version?.version_no || 0}
                            {version?.revision_no > 0 ? `-r${version.revision_no}` : ''} · 상태: {version?.status || '-'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            to={`/budget-management/projects/${projectId}/budget`}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                        >
                            예산 관리로
                        </Link>
                        {canEditProject && !isConfirmed && (
                            <button
                                type="button"
                                onClick={saveDetail}
                                disabled={isSaving}
                                className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                                <Save className="h-3.5 w-3.5" />
                                {isSaving ? '저장 중...' : '저장'}
                            </button>
                        )}
                        {canEditProject && !isConfirmed && (
                            <button
                                type="button"
                                onClick={confirmCurrentVersion}
                                disabled={isConfirming}
                                className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:opacity-60"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {isConfirming ? '확정 중...' : '버전 확정'}
                            </button>
                        )}
                        {canEditProject && isConfirmed && (
                            <button
                                type="button"
                                onClick={createRevision}
                                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                            >
                                리비전 생성
                            </button>
                        )}
                        {!canEditProject && (
                            <span className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs text-muted-foreground">
                                읽기 전용(수정 권한 없음)
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap gap-2">
                    {stageTabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => navigate(`/budget-management/projects/${projectId}/edit/${tab.key}`)}
                            className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm ${
                                section === tab.key
                                    ? 'bg-primary text-primary-foreground'
                                    : 'border border-input bg-background hover:bg-accent'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-semibold">{SECTION_META[section].label} 상세 입력</h2>
                    {!isReadonly && (
                        <button
                            type="button"
                            onClick={addRow}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-accent"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            행 추가
                        </button>
                    )}
                </div>

                {section === 'material' && (
                    <MaterialTable rows={rows} onChange={updateRow} onRemove={removeRow} readonly={isReadonly} />
                )}
                {section === 'labor' && (
                    <LaborTable rows={rows} onChange={updateRow} onRemove={removeRow} readonly={isReadonly} />
                )}
                {section === 'expense' && (
                    <ExpenseTable rows={rows} onChange={updateRow} onRemove={removeRow} readonly={isReadonly} />
                )}
            </section>

            <section className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-4">
                <SummaryCell label="재료비" value={formatAmount(totals?.material_total)} />
                <SummaryCell label="인건비" value={formatAmount(totals?.labor_total)} />
                <SummaryCell label="경비" value={formatAmount(totals?.expense_total)} />
                <SummaryCell label="총액" value={formatAmount(totals?.grand_total)} strong />
            </section>
        </div>
    );
};

const SummaryCell = ({ label, value, strong = false }) => (
    <div className={`rounded-md border p-3 ${strong ? 'border-primary/30 bg-primary/5' : 'bg-muted/10'}`}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-sm ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</p>
    </div>
);

const Field = ({ value, onChange, placeholder, readonly = false, type = 'text' }) => (
    <input
        type={type}
        className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        disabled={readonly}
    />
);

const PhaseSelect = ({ value, onChange, readonly = false }) => (
    <select
        className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
        value={value}
        onChange={onChange}
        disabled={readonly}
    >
        <option value="fabrication">제작</option>
        <option value="installation">설치</option>
    </select>
);

const MaterialTable = ({ rows, onChange, onRemove, readonly }) => (
    <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[1180px] w-full text-xs">
            <thead className="bg-muted/40">
                <tr>
                    <th className="px-2 py-2 text-left">설비</th>
                    <th className="px-2 py-2 text-left">유닛</th>
                    <th className="px-2 py-2 text-left">부품</th>
                    <th className="px-2 py-2 text-left">규격</th>
                    <th className="px-2 py-2 text-right">수량</th>
                    <th className="px-2 py-2 text-right">단가</th>
                    <th className="px-2 py-2 text-center">구분</th>
                    <th className="px-2 py-2 text-left">비고</th>
                    <th className="px-2 py-2 text-center">삭제</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={`m-${index}`} className="border-t">
                        <td className="px-2 py-1"><Field value={row.equipment_name || ''} onChange={(e) => onChange(index, 'equipment_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.unit_name || ''} onChange={(e) => onChange(index, 'unit_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.part_name || ''} onChange={(e) => onChange(index, 'part_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.spec || ''} onChange={(e) => onChange(index, 'spec', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field type="number" value={row.quantity ?? 0} onChange={(e) => onChange(index, 'quantity', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field type="number" value={row.unit_price ?? 0} onChange={(e) => onChange(index, 'unit_price', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><PhaseSelect value={row.phase || 'fabrication'} onChange={(e) => onChange(index, 'phase', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.memo || ''} onChange={(e) => onChange(index, 'memo', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1 text-center">
                            <button type="button" className="rounded border border-input px-2 py-1 text-[11px] disabled:opacity-50" disabled={readonly} onClick={() => onRemove(index)}>삭제</button>
                        </td>
                    </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-xs text-muted-foreground">재료비 항목이 없습니다.</td></tr>}
            </tbody>
        </table>
    </div>
);

const LaborTable = ({ rows, onChange, onRemove, readonly }) => (
    <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[1120px] w-full text-xs">
            <thead className="bg-muted/40">
                <tr>
                    <th className="px-2 py-2 text-left">설비</th>
                    <th className="px-2 py-2 text-left">작업명</th>
                    <th className="px-2 py-2 text-left">직군</th>
                    <th className="px-2 py-2 text-center">단위(H/D/W/M)</th>
                    <th className="px-2 py-2 text-right">수량</th>
                    <th className="px-2 py-2 text-right">시간당 단가</th>
                    <th className="px-2 py-2 text-center">구분</th>
                    <th className="px-2 py-2 text-left">비고</th>
                    <th className="px-2 py-2 text-center">삭제</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={`l-${index}`} className="border-t">
                        <td className="px-2 py-1"><Field value={row.equipment_name || ''} onChange={(e) => onChange(index, 'equipment_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.task_name || ''} onChange={(e) => onChange(index, 'task_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.worker_type || ''} onChange={(e) => onChange(index, 'worker_type', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.unit || 'H'} onChange={(e) => onChange(index, 'unit', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field type="number" value={row.quantity ?? 0} onChange={(e) => onChange(index, 'quantity', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field type="number" value={row.hourly_rate ?? 0} onChange={(e) => onChange(index, 'hourly_rate', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><PhaseSelect value={row.phase || 'fabrication'} onChange={(e) => onChange(index, 'phase', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.memo || ''} onChange={(e) => onChange(index, 'memo', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1 text-center">
                            <button type="button" className="rounded border border-input px-2 py-1 text-[11px] disabled:opacity-50" disabled={readonly} onClick={() => onRemove(index)}>삭제</button>
                        </td>
                    </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-xs text-muted-foreground">인건비 항목이 없습니다.</td></tr>}
            </tbody>
        </table>
    </div>
);

const ExpenseTable = ({ rows, onChange, onRemove, readonly }) => (
    <div className="overflow-x-auto rounded-md border">
        <table className="min-w-[980px] w-full text-xs">
            <thead className="bg-muted/40">
                <tr>
                    <th className="px-2 py-2 text-left">설비</th>
                    <th className="px-2 py-2 text-left">경비 항목</th>
                    <th className="px-2 py-2 text-left">산정 기준</th>
                    <th className="px-2 py-2 text-right">금액</th>
                    <th className="px-2 py-2 text-center">구분</th>
                    <th className="px-2 py-2 text-left">비고</th>
                    <th className="px-2 py-2 text-center">삭제</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, index) => (
                    <tr key={`e-${index}`} className="border-t">
                        <td className="px-2 py-1"><Field value={row.equipment_name || ''} onChange={(e) => onChange(index, 'equipment_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.expense_name || ''} onChange={(e) => onChange(index, 'expense_name', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.basis || ''} onChange={(e) => onChange(index, 'basis', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field type="number" value={row.amount ?? 0} onChange={(e) => onChange(index, 'amount', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><PhaseSelect value={row.phase || 'fabrication'} onChange={(e) => onChange(index, 'phase', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1"><Field value={row.memo || ''} onChange={(e) => onChange(index, 'memo', e.target.value)} readonly={readonly} /></td>
                        <td className="px-2 py-1 text-center">
                            <button type="button" className="rounded border border-input px-2 py-1 text-[11px] disabled:opacity-50" disabled={readonly} onClick={() => onRemove(index)}>삭제</button>
                        </td>
                    </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="px-2 py-6 text-center text-xs text-muted-foreground">경비 항목이 없습니다.</td></tr>}
            </tbody>
        </table>
    </div>
);

export default BudgetProjectEditor;
