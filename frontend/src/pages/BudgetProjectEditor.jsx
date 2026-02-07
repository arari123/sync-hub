import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, ClipboardPaste, Package, Save, Users, Wallet } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';
import BudgetSidebar from '../components/BudgetSidebar';
import { cn } from '../lib/utils';

const EXECUTION_STAGES = new Set(['fabrication', 'installation', 'warranty']);

const SECTION_META = {
    material: { label: '재료비', budgetKey: 'material_items', executionKey: 'execution_material_items' },
    labor: { label: '인건비', budgetKey: 'labor_items', executionKey: 'execution_labor_items' },
    expense: { label: '경비', budgetKey: 'expense_items', executionKey: 'execution_expense_items' },
};

function toNumber(value) {
    const number = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(number) ? number : 0;
}

function isBudgetRowEmpty(row, section) {
    if (!row) return true;
    if (section === 'material') {
        return !(row.equipment_name || row.unit_name || row.part_name || row.spec || row.quantity || row.unit_price || row.memo);
    }
    if (section === 'labor') {
        return !(row.equipment_name || row.task_name || row.worker_type || row.unit || row.quantity || row.hourly_rate || row.memo);
    }
    return !(row.equipment_name || row.expense_name || row.basis || row.amount || row.memo);
}

function isExecutionRowEmpty(row, section) {
    if (!row) return true;
    if (section === 'material') {
        return !(row.equipment_name || row.unit_name || row.part_name || row.spec || row.executed_amount || row.memo);
    }
    if (section === 'labor') {
        return !(row.equipment_name || row.task_name || row.worker_type || row.executed_amount || row.memo);
    }
    return !(row.equipment_name || row.expense_name || row.basis || row.executed_amount || row.memo);
}

function buildEmptyBudgetRow(section, phase = 'fabrication') {
    if (section === 'material') {
        return {
            equipment_name: '',
            unit_name: '',
            part_name: '',
            spec: '',
            quantity: 0,
            unit_price: 0,
            phase,
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
            phase,
            memo: '',
        };
    }
    return {
        equipment_name: '',
        expense_name: '',
        basis: '',
        amount: 0,
        phase,
        memo: '',
    };
}

function buildEmptyExecutionRow(section, phase = 'fabrication') {
    if (section === 'material') {
        return {
            equipment_name: '',
            unit_name: '',
            part_name: '',
            spec: '',
            executed_amount: 0,
            phase,
            memo: '',
        };
    }
    if (section === 'labor') {
        return {
            equipment_name: '',
            task_name: '',
            worker_type: '',
            executed_amount: 0,
            phase,
            memo: '',
        };
    }
    return {
        equipment_name: '',
        expense_name: '',
        basis: '',
        executed_amount: 0,
        phase,
        memo: '',
    };
}

function _injectKeyBuffers(list, builder) {
    const rows = (list || []).map((item) => ({ ...item, phase: item.phase || 'fabrication' }));
    const fabCount = rows.filter((item) => item.phase === 'fabrication').length;
    const instCount = rows.filter((item) => item.phase === 'installation').length;
    const fabBuffer = Array.from({ length: Math.max(0, 50 - fabCount) }, () => builder('fabrication'));
    const instBuffer = Array.from({ length: Math.max(0, 50 - instCount) }, () => builder('installation'));
    return [...rows, ...fabBuffer, ...instBuffer];
}

function injectBuffers(detailsObj) {
    const result = { ...detailsObj };
    Object.keys(SECTION_META).forEach((section) => {
        const meta = SECTION_META[section];
        result[meta.budgetKey] = _injectKeyBuffers(
            result[meta.budgetKey],
            (phase) => buildEmptyBudgetRow(section, phase),
        );
        result[meta.executionKey] = _injectKeyBuffers(
            result[meta.executionKey],
            (phase) => buildEmptyExecutionRow(section, phase),
        );
    });
    return result;
}

function calcBudgetAmount(row, section) {
    if (section === 'material') return toNumber(row.quantity) * toNumber(row.unit_price);
    if (section === 'labor') return toNumber(row.quantity) * toNumber(row.hourly_rate);
    return toNumber(row.amount);
}

const BudgetProjectEditor = () => {
    const { projectId, section = 'material' } = useParams();

    if (!SECTION_META[section]) {
        return <Navigate to={`/project-management/projects/${projectId}/edit/material`} replace />;
    }

    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [details, setDetails] = useState(() => injectBuffers({
        material_items: [],
        labor_items: [],
        expense_items: [],
        execution_material_items: [],
        execution_labor_items: [],
        execution_expense_items: [],
    }));
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [currentPhase, setCurrentPhase] = useState('fabrication');
    const [budgetEditMode, setBudgetEditMode] = useState(false);

    const canEditProject = project?.can_edit !== false;
    const isConfirmed = version?.status === 'confirmed';
    const currentStage = (project?.current_stage || version?.stage || 'review').toLowerCase();
    const isExecutionStage = EXECUTION_STAGES.has(currentStage);

    const activeMode = isExecutionStage && !budgetEditMode ? 'execution' : 'budget';
    const activeKey = activeMode === 'execution' ? SECTION_META[section].executionKey : SECTION_META[section].budgetKey;
    const rows = details[activeKey] || [];

    const canEditExecutionFields = canEditProject && isExecutionStage;
    const canEditBudgetFields = canEditProject && !isConfirmed && (!isExecutionStage || budgetEditMode);
    const canSave = canEditBudgetFields || canEditExecutionFields;

    const aggregationModeLabel = activeMode === 'execution' ? '집행금액' : '예산';
    const entryModeLabel = activeMode === 'execution' ? '집행금액 입력 모드' : '예산 입력 모드';

    useEffect(() => {
        setBudgetEditMode(false);
    }, [projectId, section, currentStage]);

    const displayRows = useMemo(
        () => rows
            .map((row, index) => ({ ...row, originalIndex: index }))
            .filter((row) => (row.phase || 'fabrication') === currentPhase),
        [rows, currentPhase],
    );

    const aggregation = useMemo(() => {
        const result = { total: 0, equipments: [] };
        const equipmentMap = {};

        rows.forEach((row) => {
            const amount = activeMode === 'execution'
                ? toNumber(row.executed_amount)
                : calcBudgetAmount(row, section);

            result.total += amount;
            const equipmentName = (row.equipment_name || '미지정 설비').trim() || '미지정 설비';
            const unitName = section === 'material'
                ? ((row.unit_name || row.part_name || '미지정').trim() || '미지정')
                : ((row.phase || 'fabrication') === 'installation' ? '설치' : '제작');

            if (!equipmentMap[equipmentName]) {
                equipmentMap[equipmentName] = { name: equipmentName, total: 0, units: {}, unitOrder: [] };
                result.equipments.push(equipmentMap[equipmentName]);
            }
            equipmentMap[equipmentName].total += amount;

            if (!equipmentMap[equipmentName].units[unitName]) {
                equipmentMap[equipmentName].units[unitName] = { name: unitName, total: 0 };
                equipmentMap[equipmentName].unitOrder.push(equipmentMap[equipmentName].units[unitName]);
            }
            equipmentMap[equipmentName].units[unitName].total += amount;
        });

        result.equipments.forEach((item) => {
            item.units = item.unitOrder;
        });
        return result;
    }, [rows, section, activeMode]);

    const budgetColumnsBySection = useMemo(() => ({
        material: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'unit_name', label: '유닛', width: 'w-32' },
            { key: 'part_name', label: '부품명', width: 'w-40' },
            { key: 'spec', label: '규격/모델명', width: 'w-48' },
            { key: 'quantity', label: '수량', width: 'w-24', type: 'number' },
            { key: 'unit_price', label: '단가', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        labor: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'task_name', label: '작업명', width: 'w-40' },
            { key: 'worker_type', label: '직군', width: 'w-32' },
            { key: 'unit', label: '단위', width: 'w-20' },
            { key: 'quantity', label: '수량', width: 'w-24', type: 'number' },
            { key: 'hourly_rate', label: '단가', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        expense: [
            { key: 'equipment_name', label: '설비', width: 'w-40' },
            { key: 'expense_name', label: '경비 항목', width: 'w-48' },
            { key: 'basis', label: '산정 기준', width: 'w-48' },
            { key: 'amount', label: '예산금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
    }), []);

    const executionColumnsBySection = useMemo(() => ({
        material: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'unit_name', label: '유닛(집행)', width: 'w-32' },
            { key: 'part_name', label: '파츠(집행)', width: 'w-40' },
            { key: 'spec', label: '규격/메모', width: 'w-48' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        labor: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'task_name', label: '작업명(집행)', width: 'w-40' },
            { key: 'worker_type', label: '직군(집행)', width: 'w-32' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        expense: [
            { key: 'equipment_name', label: '설비', width: 'w-40' },
            { key: 'expense_name', label: '경비 항목(집행)', width: 'w-48' },
            { key: 'basis', label: '산정 기준(집행)', width: 'w-48' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
    }), []);

    const columns = activeMode === 'execution' ? executionColumnsBySection[section] : budgetColumnsBySection[section];
    const canEditActiveRows = activeMode === 'execution' ? canEditExecutionFields : canEditBudgetFields;

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
            const loadedDetails = detailResp?.data?.details || {
                material_items: [],
                labor_items: [],
                expense_items: [],
                execution_material_items: [],
                execution_labor_items: [],
                execution_expense_items: [],
            };

            setDetails(injectBuffers(loadedDetails));
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

    const handlePaste = (event) => {
        if (!canEditActiveRows) return;

        event.preventDefault();
        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedData = clipboardData.getData('text');
        const pasteRows = pastedData.split(/\r\n|\n/).filter((line) => line.trim() !== '');

        const parsedRows = pasteRows.map((rowText) => {
            const cols = rowText.split('\t');

            if (activeMode === 'execution') {
                if (section === 'material') {
                    return {
                        equipment_name: cols[0] || '',
                        unit_name: cols[1] || '',
                        part_name: cols[2] || '',
                        spec: cols[3] || '',
                        executed_amount: toNumber(cols[4]),
                        phase: (cols[5] || '').includes('설치') ? 'installation' : currentPhase,
                        memo: cols[6] || '',
                    };
                }
                if (section === 'labor') {
                    return {
                        equipment_name: cols[0] || '',
                        task_name: cols[1] || '',
                        worker_type: cols[2] || '',
                        executed_amount: toNumber(cols[3]),
                        phase: (cols[4] || '').includes('설치') ? 'installation' : currentPhase,
                        memo: cols[5] || '',
                    };
                }
                return {
                    equipment_name: cols[0] || '',
                    expense_name: cols[1] || '',
                    basis: cols[2] || '',
                    executed_amount: toNumber(cols[3]),
                    phase: (cols[4] || '').includes('설치') ? 'installation' : currentPhase,
                    memo: cols[5] || '',
                };
            }

            if (section === 'material') {
                return {
                    equipment_name: cols[0] || '',
                    unit_name: cols[1] || '',
                    part_name: cols[2] || '',
                    spec: cols[3] || '',
                    quantity: toNumber(cols[4]),
                    unit_price: toNumber(cols[5]),
                    phase: (cols[6] || '').includes('설치') ? 'installation' : currentPhase,
                    memo: cols[7] || '',
                };
            }
            if (section === 'labor') {
                return {
                    equipment_name: cols[0] || '',
                    task_name: cols[1] || '',
                    worker_type: cols[2] || '',
                    unit: cols[3] || 'H',
                    quantity: toNumber(cols[4]),
                    hourly_rate: toNumber(cols[5]),
                    phase: (cols[6] || '').includes('설치') ? 'installation' : currentPhase,
                    memo: cols[7] || '',
                };
            }
            return {
                equipment_name: cols[0] || '',
                expense_name: cols[1] || '',
                basis: cols[2] || '',
                amount: toNumber(cols[3]),
                phase: (cols[4] || '').includes('설치') ? 'installation' : currentPhase,
                memo: cols[5] || '',
            };
        });

        setDetails((prev) => {
            const currentRows = prev[activeKey] || [];
            const currentPhaseExisting = currentRows.filter((row) => (row.phase || 'fabrication') === currentPhase);
            const otherPhaseExisting = currentRows.filter((row) => (row.phase || 'fabrication') !== currentPhase);
            const mergedCurrent = [...currentPhaseExisting.filter((row) => !(activeMode === 'execution'
                ? isExecutionRowEmpty(row, section)
                : isBudgetRowEmpty(row, section))), ...parsedRows];

            return injectBuffers({
                ...prev,
                [activeKey]: [...mergedCurrent, ...otherPhaseExisting],
            });
        });
    };

    const updateRow = (index, key, value) => {
        setDetails((prev) => {
            const newList = [...(prev[activeKey] || [])];
            const row = { ...newList[index] };
            if (['quantity', 'unit_price', 'hourly_rate', 'amount', 'executed_amount'].includes(key)) {
                row[key] = toNumber(value);
            } else if (key === 'unit') {
                row[key] = String(value || '').toUpperCase();
            } else {
                row[key] = value;
            }
            newList[index] = row;

            const filteredIndices = [];
            newList.forEach((item, itemIndex) => {
                if ((item.phase || 'fabrication') === currentPhase) filteredIndices.push(itemIndex);
            });
            const positionInDisplay = filteredIndices.indexOf(index);
            if (positionInDisplay >= filteredIndices.length - 3) {
                const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
                const buffer = Array.from({ length: 20 }, () => builder(section, currentPhase));
                newList.push(...buffer);
            }

            return {
                ...prev,
                [activeKey]: newList,
            };
        });
    };

    const removeRow = (index) => {
        setDetails((prev) => ({
            ...prev,
            [activeKey]: (prev[activeKey] || []).filter((_, rowIndex) => rowIndex !== index),
        }));
    };

    const saveDetail = async () => {
        if (!version?.id || !canSave) return;

        setIsSaving(true);
        setError('');
        try {
            const cleanDetails = {};
            Object.keys(SECTION_META).forEach((sectionKey) => {
                const meta = SECTION_META[sectionKey];
                cleanDetails[meta.budgetKey] = (details[meta.budgetKey] || []).filter((row) => !isBudgetRowEmpty(row, sectionKey));
                cleanDetails[meta.executionKey] = (details[meta.executionKey] || []).filter((row) => !isExecutionRowEmpty(row, sectionKey));
            });

            const response = await api.put(`/budget/versions/${version.id}/details`, cleanDetails);
            const savedDetails = response?.data?.details || cleanDetails;
            setDetails(injectBuffers(savedDetails));
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

    const createRevision = async (reasonInput = null) => {
        if (!version?.id) return null;
        const reason = reasonInput ?? window.prompt('리비전 사유를 입력해 주세요.');
        if (!reason || !String(reason).trim()) return null;

        setError('');
        try {
            const response = await api.post(`/budget/versions/${version.id}/revision`, {
                change_reason: String(reason).trim(),
            });
            const nextVersion = response?.data?.version;
            if (!nextVersion?.id) return null;

            setVersion(nextVersion);
            const detailResp = await api.get(`/budget/versions/${nextVersion.id}/details`);
            setDetails(injectBuffers(detailResp?.data?.details || details));
            return nextVersion;
        } catch (err) {
            setError(getErrorMessage(err, '리비전 생성에 실패했습니다.'));
            return null;
        }
    };

    const toggleBudgetEditMode = async () => {
        if (!isExecutionStage || !canEditProject) return;

        if (budgetEditMode) {
            setBudgetEditMode(false);
            return;
        }

        if (isConfirmed) {
            const reason = window.prompt('확정 버전입니다. 예산 변경을 위해 리비전을 생성합니다. 변경 사유를 입력해 주세요.');
            if (!reason || !String(reason).trim()) return;
            const nextVersion = await createRevision(String(reason).trim());
            if (!nextVersion) return;
        }

        setBudgetEditMode(true);
    };

    const handleScroll = (event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.target;
        if (scrollHeight - scrollTop <= clientHeight + 100) {
            const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
            setDetails((prev) => ({
                ...prev,
                [activeKey]: [...(prev[activeKey] || []), ...Array.from({ length: 50 }, () => builder(section, currentPhase))],
            }));
        }
    };

    if (isLoading) {
        return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
    }

    return (
        <div className="flex h-screen border-t border-slate-200 overflow-hidden" onPaste={handlePaste}>
            <BudgetSidebar aggregation={aggregation} modeLabel={aggregationModeLabel} />

            <div className="flex-1 overflow-y-auto px-8 pt-2 pb-0 space-y-2 flex flex-col min-w-0" onScroll={handleScroll}>
                <div className="flex-none">
                    <div className="flex items-center justify-between mb-2">
                        <BudgetBreadcrumb
                            items={[
                                { label: '프로젝트 관리', to: '/project-management' },
                                { label: project?.name || '프로젝트', to: `/project-management/projects/${projectId}` },
                                { label: '예산 관리', to: `/project-management/projects/${projectId}/budget` },
                                { label: `${SECTION_META[section].label} 입력` },
                            ]}
                        />
                        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-inner">
                            <NavLink
                                to={`/project-management/projects/${projectId}/budget`}
                                className={({ isActive }) => cn(
                                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                    isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700',
                                )}
                            >
                                <BarChart3 size={12} />
                                모니터링
                            </NavLink>
                            <div className="w-px h-3 bg-slate-300 mx-1" />
                            {Object.keys(SECTION_META).map((key) => (
                                <NavLink
                                    key={key}
                                    to={`/project-management/projects/${projectId}/edit/${key}`}
                                    className={({ isActive }) => cn(
                                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                        isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700',
                                    )}
                                >
                                    {key === 'material' ? <Package size={12} /> : key === 'labor' ? <Users size={12} /> : <Wallet size={12} />}
                                    {SECTION_META[key].label}
                                </NavLink>
                            ))}
                        </div>
                    </div>

                    <section className="rounded-2xl border bg-card p-4 shadow-sm mt-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Budget Entry</p>
                                <h1 className="text-2xl font-black tracking-tight text-slate-900">{project?.name || '프로젝트'}</h1>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                    버전 <span className="text-slate-900">v{version?.version_no || 0}</span>
                                    {version?.revision_no > 0 ? `-r${version.revision_no}` : ''} ·
                                    상태: <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-black uppercase leading-none">{version?.status || '-'}</span>
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-50 text-[10px] font-black text-blue-700 uppercase leading-none">{entryModeLabel}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {canSave && (
                                    <button
                                        type="button"
                                        onClick={saveDetail}
                                        disabled={isSaving}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-black text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 disabled:opacity-60 transition-all active:scale-95"
                                    >
                                        <Save size={16} />
                                        {isSaving ? '저장 중...' : '전체 저장'}
                                    </button>
                                )}
                                {canEditProject && !isConfirmed && (
                                    <button
                                        type="button"
                                        onClick={confirmCurrentVersion}
                                        disabled={isConfirming}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                                    >
                                        <CheckCircle2 size={16} />
                                        {isConfirming ? '확정 중...' : '버전 확정'}
                                    </button>
                                )}
                                {canEditProject && isConfirmed && (
                                    <button
                                        type="button"
                                        onClick={() => createRevision()}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                                    >
                                        리비전 생성
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                    <section className="flex-1 rounded-2xl border bg-card p-4 shadow-sm flex flex-col min-h-0">
                        <div className="mb-3 flex items-center justify-between flex-none">
                            <div className="flex items-center gap-6 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'p-2 rounded-lg',
                                        section === 'material' ? 'bg-blue-50 text-blue-600' :
                                            section === 'labor' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600',
                                    )}
                                    >
                                        {section === 'material' ? <Package size={20} /> : section === 'labor' ? <Users size={20} /> : <Wallet size={20} />}
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-black text-slate-900">{SECTION_META[section].label} 상세 입력</h2>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{entryModeLabel}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                    <button
                                        onClick={() => setCurrentPhase('fabrication')}
                                        className={cn(
                                            'px-4 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                            currentPhase === 'fabrication' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700',
                                        )}
                                    >
                                        제작
                                    </button>
                                    <button
                                        onClick={() => setCurrentPhase('installation')}
                                        className={cn(
                                            'px-4 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                            currentPhase === 'installation' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700',
                                        )}
                                    >
                                        설치
                                    </button>
                                </div>

                                {isExecutionStage && (
                                    <button
                                        type="button"
                                        onClick={toggleBudgetEditMode}
                                        className={cn(
                                            'h-8 rounded-lg px-3 text-[11px] font-black transition-colors border',
                                            budgetEditMode
                                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                                        )}
                                    >
                                        {budgetEditMode ? '집행 입력으로 복귀' : '예산 변경'}
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 mr-2">
                                    <ClipboardPaste size={12} />
                                    <span>엑셀 붙여넣기 가능</span>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">
                                {error}
                            </div>
                        )}

                        <div className="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50/20 custom-scrollbar relative">
                            <ExcelTable
                                columns={columns}
                                rows={displayRows}
                                onChange={(idx, key, val) => updateRow(displayRows[idx].originalIndex, key, val)}
                                onRemove={(idx) => removeRow(displayRows[idx].originalIndex)}
                                editable={canEditActiveRows}
                                allowRowDelete={canEditActiveRows}
                            />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

const ExcelTable = ({ columns, rows, onChange, onRemove, editable, allowRowDelete }) => {
    const tableRef = useRef(null);

    const handleKeyDown = (event, rowIndex, colIndex) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;

        const rowCount = rows.length;
        const colCount = columns.length;
        let nextRow = rowIndex;
        let nextCol = colIndex;

        if (event.key === 'ArrowUp') nextRow = Math.max(0, rowIndex - 1);
        else if (event.key === 'ArrowDown' || event.key === 'Enter') nextRow = Math.min(rowCount - 1, rowIndex + 1);
        else if (event.key === 'ArrowLeft') nextCol = Math.max(0, colIndex - 1);
        else if (event.key === 'ArrowRight') nextCol = Math.min(colCount - 1, colIndex + 1);

        const nextTarget = tableRef.current?.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"] input`);
        if (!nextTarget) return;

        event.preventDefault();
        nextTarget.focus();
        if (nextTarget.select) nextTarget.select();
    };

    return (
        <table className="w-full text-[11px] border-collapse bg-white" ref={tableRef}>
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                <tr>
                    {columns.map((col, idx) => (
                        <th key={idx} className={cn('p-2 text-left font-black text-slate-500 uppercase tracking-tighter border-r border-slate-200 last:border-0', col.width)}>
                            {col.label}
                        </th>
                    ))}
                    {allowRowDelete && <th className="p-2 w-16 text-center text-slate-500 font-bold border-r-0 uppercase tracking-tighter">삭제</th>}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-slate-100 hover:bg-slate-50/50 focus-within:bg-blue-50/30 group transition-colors">
                        {columns.map((col, colIndex) => {
                            const rawValue = row[col.key];
                            const displayValue = col.type === 'number'
                                ? (rawValue === null || rawValue === undefined || rawValue === '' ? '' : toNumber(rawValue).toLocaleString('ko-KR'))
                                : (rawValue || '');

                            return (
                                <td key={colIndex} className="p-0 border-r border-slate-100 last:border-0" data-row={rowIndex} data-col={colIndex}>
                                    <input
                                        type="text"
                                        className={cn(
                                            'w-full h-8 px-2 outline-none transition-all font-medium placeholder:text-slate-300 text-[10.5px]',
                                            editable
                                                ? 'bg-transparent focus:bg-white focus:ring-1 focus:ring-primary text-slate-700'
                                                : 'bg-slate-50 text-slate-400',
                                        )}
                                        value={displayValue}
                                        onChange={(event) => {
                                            if (!editable) return;
                                            let val = event.target.value;
                                            if (col.type === 'number') val = val.replace(/[^0-9]/g, '');
                                            onChange(rowIndex, col.key, val);
                                        }}
                                        onFocus={(event) => event.target.select()}
                                        onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                        readOnly={!editable}
                                    />
                                </td>
                            );
                        })}
                        {allowRowDelete && (
                            <td className="p-0 text-center">
                                <button
                                    type="button"
                                    onClick={() => onRemove(rowIndex)}
                                    className="p-2 text-slate-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all font-black text-[10px] uppercase"
                                >
                                    Del
                                </button>
                            </td>
                        )}
                    </tr>
                ))}
                {!rows.length && (
                    <tr>
                        <td colSpan={columns.length + (allowRowDelete ? 1 : 0)} className="p-12 text-center text-slate-400 font-bold italic bg-white">
                            입력된 데이터가 없습니다.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
};

export default BudgetProjectEditor;
