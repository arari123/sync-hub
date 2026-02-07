import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, GitBranch, Plus, Save, Wallet } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';

const STAGE_OPTIONS = [
    { value: 'review', label: '검토' },
    { value: 'progress', label: '진행' },
    { value: 'closure', label: '종료' },
];

const COST_KEYS = [
    'material_fab_cost',
    'material_install_cost',
    'labor_fab_cost',
    'labor_install_cost',
    'expense_fab_cost',
    'expense_install_cost',
];

function emptyEquipment() {
    return {
        equipment_name: '',
        material_fab_cost: 0,
        material_install_cost: 0,
        labor_fab_cost: 0,
        labor_install_cost: 0,
        expense_fab_cost: 0,
        expense_install_cost: 0,
        currency: 'KRW',
    };
}

function formatCurrency(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
}

function toNumber(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

const BudgetManagement = () => {
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [versions, setVersions] = useState([]);
    const [selectedVersionId, setSelectedVersionId] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [totals, setTotals] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingEquipments, setIsSavingEquipments] = useState(false);
    const [error, setError] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectCode, setNewProjectCode] = useState('');
    const [newProjectDescription, setNewProjectDescription] = useState('');
    const [newVersionStage, setNewVersionStage] = useState('review');

    const selectedProject = useMemo(
        () => projects.find((item) => item.id === selectedProjectId) || null,
        [projects, selectedProjectId]
    );
    const selectedVersion = useMemo(
        () => versions.find((item) => item.id === selectedVersionId) || null,
        [versions, selectedVersionId]
    );

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await api.get('/budget/projects');
            const data = Array.isArray(response.data) ? response.data : [];
            setProjects(data);
            if (data.length === 0) {
                setSelectedProjectId(null);
                setVersions([]);
                setSelectedVersionId(null);
                setEquipments([]);
                setTotals(null);
                return;
            }

            const nextProjectId = selectedProjectId && data.some((item) => item.id === selectedProjectId)
                ? selectedProjectId
                : data[0].id;
            setSelectedProjectId(nextProjectId);
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, [selectedProjectId]);

    const loadVersions = useCallback(async (projectId) => {
        if (!projectId) {
            setVersions([]);
            setSelectedVersionId(null);
            return;
        }

        setError('');
        try {
            const response = await api.get(`/budget/projects/${projectId}/versions`);
            const nextVersions = response?.data?.versions || [];
            setVersions(nextVersions);
            if (!nextVersions.length) {
                setSelectedVersionId(null);
                setEquipments([]);
                setTotals(null);
                return;
            }
            const nextVersionId = selectedVersionId && nextVersions.some((item) => item.id === selectedVersionId)
                ? selectedVersionId
                : nextVersions[0].id;
            setSelectedVersionId(nextVersionId);
        } catch (err) {
            setError(getErrorMessage(err, '버전 목록을 불러오지 못했습니다.'));
        }
    }, [selectedVersionId]);

    const loadEquipments = useCallback(async (versionId) => {
        if (!versionId) {
            setEquipments([]);
            setTotals(null);
            return;
        }
        setError('');
        try {
            const response = await api.get(`/budget/versions/${versionId}/equipments`);
            const payload = response?.data || {};
            setEquipments(Array.isArray(payload.items) ? payload.items : []);
            setTotals(payload.totals || null);
        } catch (err) {
            setError(getErrorMessage(err, '설비 비용 목록을 불러오지 못했습니다.'));
        }
    }, []);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        loadVersions(selectedProjectId);
    }, [selectedProjectId, loadVersions]);

    useEffect(() => {
        loadEquipments(selectedVersionId);
    }, [selectedVersionId, loadEquipments]);

    const createProject = async (event) => {
        event.preventDefault();
        if (!newProjectName.trim()) {
            setError('프로젝트 이름을 입력해 주세요.');
            return;
        }

        setError('');
        try {
            const response = await api.post('/budget/projects', {
                name: newProjectName.trim(),
                code: newProjectCode.trim(),
                description: newProjectDescription.trim(),
            });
            const created = response?.data;
            setNewProjectName('');
            setNewProjectCode('');
            setNewProjectDescription('');
            await loadProjects();
            if (created?.id) {
                setSelectedProjectId(created.id);
            }
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 생성에 실패했습니다.'));
        }
    };

    const createVersion = async () => {
        if (!selectedProjectId) return;
        setError('');
        try {
            await api.post(`/budget/projects/${selectedProjectId}/versions`, {
                stage: newVersionStage,
            });
            await loadProjects();
            await loadVersions(selectedProjectId);
        } catch (err) {
            setError(getErrorMessage(err, '버전 생성에 실패했습니다.'));
        }
    };

    const confirmVersion = async (versionId) => {
        setError('');
        try {
            await api.post(`/budget/versions/${versionId}/confirm`);
            await loadVersions(selectedProjectId);
            if (selectedVersionId === versionId) {
                await loadEquipments(versionId);
            }
        } catch (err) {
            setError(getErrorMessage(err, '버전 확정에 실패했습니다.'));
        }
    };

    const createRevision = async (versionId) => {
        const reason = window.prompt('변경 사유를 입력해 주세요.');
        if (!reason || !reason.trim()) return;
        setError('');
        try {
            const response = await api.post(`/budget/versions/${versionId}/revision`, {
                change_reason: reason.trim(),
            });
            await loadVersions(selectedProjectId);
            if (response?.data?.version?.id) {
                setSelectedVersionId(response.data.version.id);
            }
        } catch (err) {
            setError(getErrorMessage(err, '리비전 생성에 실패했습니다.'));
        }
    };

    const addEquipment = () => {
        setEquipments((prev) => [...prev, emptyEquipment()]);
    };

    const updateEquipment = (index, key, value) => {
        setEquipments((prev) =>
            prev.map((item, itemIndex) => {
                if (itemIndex !== index) return item;
                if (key === 'equipment_name' || key === 'currency') {
                    return { ...item, [key]: value };
                }
                return { ...item, [key]: toNumber(value) };
            })
        );
    };

    const removeEquipment = (index) => {
        setEquipments((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    };

    const saveEquipments = async () => {
        if (!selectedVersionId) return;
        setIsSavingEquipments(true);
        setError('');
        try {
            const payload = {
                items: equipments.map((item) => ({
                    ...item,
                    equipment_name: String(item.equipment_name || '').trim(),
                    material_fab_cost: toNumber(item.material_fab_cost),
                    material_install_cost: toNumber(item.material_install_cost),
                    labor_fab_cost: toNumber(item.labor_fab_cost),
                    labor_install_cost: toNumber(item.labor_install_cost),
                    expense_fab_cost: toNumber(item.expense_fab_cost),
                    expense_install_cost: toNumber(item.expense_install_cost),
                    currency: String(item.currency || 'KRW').trim() || 'KRW',
                })),
            };
            const response = await api.put(`/budget/versions/${selectedVersionId}/equipments`, payload);
            const nextItems = Array.isArray(response?.data?.items) ? response.data.items : [];
            setEquipments(nextItems);
            setTotals(response?.data?.totals || null);
            await loadVersions(selectedProjectId);
            await loadProjects();
        } catch (err) {
            setError(getErrorMessage(err, '설비 비용 저장에 실패했습니다.'));
        } finally {
            setIsSavingEquipments(false);
        }
    };

    return (
        <div className="space-y-6">
            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold">프로젝트 예산관리</h1>
                        <p className="text-sm text-muted-foreground">
                            프로젝트별 버전 관리와 설비 예산 집계를 한 화면에서 관리합니다.
                        </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        Phase 1 구현
                    </span>
                </div>
            </section>

            {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="space-y-4 xl:col-span-4">
                    <article className="rounded-xl border bg-card p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold">프로젝트 생성</h2>
                        <form className="space-y-3" onSubmit={createProject}>
                            <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                placeholder="프로젝트 이름"
                                value={newProjectName}
                                onChange={(event) => setNewProjectName(event.target.value)}
                            />
                            <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                placeholder="프로젝트 코드(선택)"
                                value={newProjectCode}
                                onChange={(event) => setNewProjectCode(event.target.value)}
                            />
                            <textarea
                                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                placeholder="설명(선택)"
                                value={newProjectDescription}
                                onChange={(event) => setNewProjectDescription(event.target.value)}
                            />
                            <button
                                type="submit"
                                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                            >
                                <Plus className="h-4 w-4" />
                                프로젝트 추가
                            </button>
                        </form>
                    </article>

                    <article className="rounded-xl border bg-card p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold">프로젝트 목록</h2>
                        {isLoading ? (
                            <p className="text-sm text-muted-foreground">불러오는 중...</p>
                        ) : projects.length === 0 ? (
                            <p className="text-sm text-muted-foreground">등록된 프로젝트가 없습니다.</p>
                        ) : (
                            <div className="space-y-2">
                                {projects.map((project) => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        onClick={() => setSelectedProjectId(project.id)}
                                        className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                                            selectedProjectId === project.id
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:bg-muted/40'
                                        }`}
                                    >
                                        <p className="font-semibold">{project.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            단계: {project.current_stage_label} · 버전 {project.version_count}개
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            총액: {formatCurrency(project.totals?.grand_total || 0)}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </article>
                </div>

                <div className="space-y-4 xl:col-span-8">
                    <article className="rounded-xl border bg-card p-5 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold">버전 관리</h2>
                            {selectedProject && (
                                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                    {selectedProject.name}
                                </span>
                            )}
                        </div>

                        {!selectedProject ? (
                            <p className="text-sm text-muted-foreground">프로젝트를 선택해 주세요.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
                                    <select
                                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                        value={newVersionStage}
                                        onChange={(event) => setNewVersionStage(event.target.value)}
                                    >
                                        {STAGE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={createVersion}
                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                                    >
                                        <GitBranch className="h-4 w-4" />
                                        신규 버전 생성
                                    </button>
                                </div>

                                {!versions.length ? (
                                    <p className="text-sm text-muted-foreground">버전이 없습니다. 신규 버전을 생성하세요.</p>
                                ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {versions.map((version) => (
                                            <div
                                                key={version.id}
                                                className={`rounded-lg border p-3 ${
                                                    selectedVersionId === version.id
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-border bg-card'
                                                }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedVersionId(version.id)}
                                                    className="w-full text-left"
                                                >
                                                    <p className="font-semibold">
                                                        {version.stage_label} · v{version.version_no}
                                                        {version.revision_no > 0 ? `-r${version.revision_no}` : ''}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        상태: {version.status} · 설비 {version.equipment_count}개
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        총액: {formatCurrency(version.totals?.grand_total || 0)}
                                                    </p>
                                                </button>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {version.status !== 'confirmed' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => confirmVersion(version.id)}
                                                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-accent"
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            확정
                                                        </button>
                                                    )}
                                                    {version.status === 'confirmed' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => createRevision(version.id)}
                                                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-accent"
                                                        >
                                                            <GitBranch className="h-3.5 w-3.5" />
                                                            리비전 생성
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </article>

                    <article className="rounded-xl border bg-card p-5 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-base font-semibold">설비 예산 입력</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={addEquipment}
                                    disabled={!selectedVersion || selectedVersion.status === 'confirmed'}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Plus className="h-4 w-4" />
                                    설비 행 추가
                                </button>
                                <button
                                    type="button"
                                    onClick={saveEquipments}
                                    disabled={!selectedVersion || selectedVersion.status === 'confirmed' || isSavingEquipments}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Save className="h-4 w-4" />
                                    {isSavingEquipments ? '저장 중...' : '저장'}
                                </button>
                            </div>
                        </div>

                        {!selectedVersion ? (
                            <p className="text-sm text-muted-foreground">버전을 선택해 주세요.</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="overflow-x-auto rounded-md border">
                                    <table className="min-w-[980px] w-full text-sm">
                                        <thead className="bg-muted/40">
                                            <tr>
                                                <th className="px-2 py-2 text-left">설비명</th>
                                                <th className="px-2 py-2 text-right">재료비(제작)</th>
                                                <th className="px-2 py-2 text-right">재료비(설치)</th>
                                                <th className="px-2 py-2 text-right">인건비(제작)</th>
                                                <th className="px-2 py-2 text-right">인건비(설치)</th>
                                                <th className="px-2 py-2 text-right">경비(제작)</th>
                                                <th className="px-2 py-2 text-right">경비(설치)</th>
                                                <th className="px-2 py-2 text-center">삭제</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {equipments.map((item, index) => (
                                                <tr key={`${index}-${item.equipment_name}`} className="border-t">
                                                    <td className="px-2 py-1">
                                                        <input
                                                            className="h-8 w-full rounded border border-input bg-background px-2 text-sm"
                                                            value={item.equipment_name || ''}
                                                            onChange={(event) => updateEquipment(index, 'equipment_name', event.target.value)}
                                                            disabled={selectedVersion.status === 'confirmed'}
                                                        />
                                                    </td>
                                                    {COST_KEYS.map((costKey) => (
                                                        <td key={`${index}-${costKey}`} className="px-2 py-1">
                                                            <input
                                                                className="h-8 w-full rounded border border-input bg-background px-2 text-right text-sm"
                                                                value={item[costKey] ?? 0}
                                                                onChange={(event) => updateEquipment(index, costKey, event.target.value)}
                                                                disabled={selectedVersion.status === 'confirmed'}
                                                            />
                                                        </td>
                                                    ))}
                                                    <td className="px-2 py-1 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeEquipment(index)}
                                                            disabled={selectedVersion.status === 'confirmed'}
                                                            className="rounded border border-input px-2 py-1 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                                        >
                                                            삭제
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {!equipments.length && (
                                                <tr>
                                                    <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={8}>
                                                        입력된 설비 예산이 없습니다.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-3">
                                    <div className="rounded-md border bg-card p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">재료비 합계</p>
                                        <p className="font-semibold">{formatCurrency(totals?.material_total || 0)}</p>
                                    </div>
                                    <div className="rounded-md border bg-card p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">인건비 합계</p>
                                        <p className="font-semibold">{formatCurrency(totals?.labor_total || 0)}</p>
                                    </div>
                                    <div className="rounded-md border bg-card p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">경비 합계</p>
                                        <p className="font-semibold">{formatCurrency(totals?.expense_total || 0)}</p>
                                    </div>
                                    <div className="rounded-md border bg-card p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">제작비 합계</p>
                                        <p className="font-semibold">{formatCurrency(totals?.fab_total || 0)}</p>
                                    </div>
                                    <div className="rounded-md border bg-card p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">설치비 합계</p>
                                        <p className="font-semibold">{formatCurrency(totals?.install_total || 0)}</p>
                                    </div>
                                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                                        <p className="mb-1 text-xs text-muted-foreground">총 예산</p>
                                        <p className="inline-flex items-center gap-2 text-lg font-bold">
                                            <Wallet className="h-4 w-4 text-primary" />
                                            {formatCurrency(totals?.grand_total || 0)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </article>
                </div>
            </section>
        </div>
    );
};

export default BudgetManagement;
