import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, BriefcaseBusiness, Calculator, Package, Receipt, Users, Wallet } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { cn } from '../lib/utils';

const EXECUTION_STAGES = new Set(['fabrication', 'installation', 'warranty']);
const PHASES = ['fabrication', 'installation'];
const PHASE_LABEL = {
    fabrication: '제작',
    installation: '설치',
};
const STAFFING_TYPES = ['자체', '외주'];
const EXPENSE_TYPES = ['자체', '외주'];
const DEFAULT_LABOR_SETTINGS = {
    installation_locale: 'domestic',
    labor_days_per_week_domestic: 5,
    labor_days_per_week_overseas: 7,
    labor_days_per_month_domestic: 22,
    labor_days_per_month_overseas: 30,
};
const INHOUSE_LABOR_RATE_PER_HOUR = 35000;
const OUTSOURCE_LABOR_RATE_PER_DAY = 400000;
const EMPTY_DETAILS = {
    material_items: [],
    labor_items: [],
    expense_items: [],
    execution_material_items: [],
    execution_labor_items: [],
    execution_expense_items: [],
    budget_settings: { ...DEFAULT_LABOR_SETTINGS },
};

function toNumber(value) {
    const parsed = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePhase(value) {
    return String(value || '').trim() === 'installation' ? 'installation' : 'fabrication';
}

function normalizeEquipmentName(value, fallback = '미지정 설비') {
    const normalized = String(value || '').trim();
    return normalized || fallback;
}

function normalizeLocationType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['overseas', 'abroad', '해외'].includes(normalized)) return 'overseas';
    return 'domestic';
}

function normalizeStaffingType(value) {
    return String(value || '').trim() === '외주' ? '외주' : '자체';
}

function normalizeExpenseType(value) {
    return String(value || '').trim() === '외주' ? '외주' : '자체';
}

function normalizeMaterialUnitCountMap(source) {
    const result = {};
    if (!source || typeof source !== 'object') return result;
    Object.entries(source).forEach(([scopeKey, rawValue]) => {
        const key = String(scopeKey || '').trim();
        if (!key) return;
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) return;
        result[key] = Math.max(1, Math.floor(parsed));
    });
    return result;
}

function materialUnitScopeKeyFromRow(row) {
    const equipmentName = normalizeEquipmentName(row?.equipment_name, '미지정 설비');
    const phase = normalizePhase(row?.phase);
    const unitName = String(row?.unit_name || row?.part_name || '').trim();
    if (!unitName) return '';
    return `${equipmentName}::${phase}::${unitName}`;
}

function laborUnitToHours(unit, locationType, settings) {
    const normalizedUnit = String(unit || 'H').trim().toUpperCase();
    if (normalizedUnit === 'H') return 1;
    if (normalizedUnit === 'D') return 8;

    const merged = { ...DEFAULT_LABOR_SETTINGS, ...(settings || {}) };
    const locale = normalizeLocationType(locationType || merged.installation_locale);

    if (normalizedUnit === 'W') {
        const days = locale === 'overseas'
            ? toNumber(merged.labor_days_per_week_overseas) || 7
            : toNumber(merged.labor_days_per_week_domestic) || 5;
        return days * 8;
    }

    if (normalizedUnit === 'M') {
        const days = locale === 'overseas'
            ? toNumber(merged.labor_days_per_month_overseas) || 30
            : toNumber(merged.labor_days_per_month_domestic) || 22;
        return days * 8;
    }

    return 1;
}

function calcLaborBudgetAmount(row, settings) {
    const quantity = toNumber(row?.quantity);
    const headcount = toNumber(row?.headcount) || 1;
    const phase = normalizePhase(row?.phase);
    const locationType = phase === 'installation'
        ? normalizeLocationType(row?.location_type || settings?.installation_locale)
        : 'domestic';
    const hours = laborUnitToHours(row?.unit || 'H', locationType, settings);
    const staffingType = normalizeStaffingType(row?.staffing_type);

    if (staffingType === '외주') {
        const days = hours / 8;
        return quantity * days * OUTSOURCE_LABOR_RATE_PER_DAY * headcount;
    }

    return quantity * hours * INHOUSE_LABOR_RATE_PER_HOUR * headcount;
}

function uniqueValues(values) {
    const unique = [];
    const seen = new Set();
    values.forEach((value) => {
        const normalized = String(value || '').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        unique.push(normalized);
    });
    return unique;
}

function formatAmount(value) {
    const number = toNumber(value);
    const roundedManwon = number >= 0 ? Math.floor(number / 10000) : Math.ceil(number / 10000);
    return `${roundedManwon.toLocaleString('ko-KR')}만원`;
}

function formatCount(value) {
    return `${Math.max(0, Math.floor(toNumber(value))).toLocaleString('ko-KR')}개`;
}

function createEquipmentPhaseBucket() {
    return {
        totals: {
            material: { budget: 0, execution: 0 },
            labor: { budget: 0, execution: 0 },
            expense: { budget: 0, execution: 0 },
        },
        materialUnits: new Map(),
        laborItems: {
            자체: new Map(),
            외주: new Map(),
        },
        expenseItems: {
            자체: new Map(),
            외주: new Map(),
        },
    };
}

function createEquipmentBucket(name) {
    return {
        name,
        phases: {
            fabrication: createEquipmentPhaseBucket(),
            installation: createEquipmentPhaseBucket(),
        },
    };
}

function ensureEquipmentBucket(map, equipmentName) {
    if (!map.has(equipmentName)) {
        map.set(equipmentName, createEquipmentBucket(equipmentName));
    }
    return map.get(equipmentName);
}

function ensureMaterialUnitBucket(map, unitName) {
    if (!map.has(unitName)) {
        map.set(unitName, {
            unitName,
            unitCount: 1,
            partCount: 0,
            quantityTotal: 0,
            budgetAmount: 0,
            executionAmount: 0,
        });
    }
    return map.get(unitName);
}

function ensureNamedAmountBucket(map, key, fallbackLabel = '미지정 항목') {
    const normalizedKey = String(key || '').trim() || fallbackLabel;
    if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
            name: normalizedKey,
            budgetAmount: 0,
            executionAmount: 0,
            basis: '',
        });
    }
    return map.get(normalizedKey);
}

function collectEquipmentNames(projectType, equipments, details) {
    if (projectType !== 'equipment') return ['공통'];

    const namesFromEquipments = (equipments || []).map((item) => normalizeEquipmentName(item?.equipment_name, ''));
    const uniqueFromEquipments = uniqueValues(namesFromEquipments);
    if (uniqueFromEquipments.length > 0) {
        return uniqueFromEquipments;
    }
    const namesFromDetails = [
        ...(details?.material_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
        ...(details?.labor_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
        ...(details?.expense_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
        ...(details?.execution_material_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
        ...(details?.execution_labor_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
        ...(details?.execution_expense_items || []).map((row) => normalizeEquipmentName(row?.equipment_name, '')),
    ];

    const merged = uniqueValues(namesFromDetails);
    return merged.length > 0 ? merged : ['미지정 설비'];
}

function sortByAmountDesc(items, key = 'budgetAmount') {
    return [...(items || [])].sort((a, b) => {
        const diff = toNumber(b?.[key]) - toNumber(a?.[key]);
        if (diff !== 0) return diff;
        return String(a?.name || a?.unitName || '').localeCompare(String(b?.name || b?.unitName || ''), 'ko-KR');
    });
}

const BudgetProjectBudget = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [details, setDetails] = useState(EMPTY_DETAILS);
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
                    setDetails(EMPTY_DETAILS);
                    return;
                }

                const [equipmentResp, detailResp] = await Promise.all([
                    api.get(`/budget/versions/${currentVersion.id}/equipments`),
                    api.get(`/budget/versions/${currentVersion.id}/details`),
                ]);

                const itemList = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
                setEquipments(itemList);
                setDetails(detailResp?.data?.details || EMPTY_DETAILS);
            } catch (err) {
                setError(getErrorMessage(err, '예산 관리 데이터를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [projectId]);

    const showExecution = useMemo(
        () => EXECUTION_STAGES.has(String(project?.current_stage || '').trim()),
        [project?.current_stage],
    );

    const dashboard = useMemo(() => {
        const settings = { ...DEFAULT_LABOR_SETTINGS, ...(details?.budget_settings || {}) };
        const materialUnitCountMap = normalizeMaterialUnitCountMap(settings?.material_unit_counts);
        const isEquipmentProject = (project?.project_type || 'equipment') === 'equipment';
        const equipmentNames = collectEquipmentNames(project?.project_type || 'equipment', equipments, details);
        const allowedEquipmentSet = new Set(equipmentNames);
        const fallbackEquipmentName = equipmentNames[0] || '미지정 설비';
        const resolveScopedEquipmentName = (rawEquipmentName) => {
            const normalized = normalizeEquipmentName(rawEquipmentName, '');
            if (!normalized) return fallbackEquipmentName;
            if (isEquipmentProject && allowedEquipmentSet.size > 0 && !allowedEquipmentSet.has(normalized)) {
                return '';
            }
            return normalized;
        };
        const equipmentMap = new Map();

        equipmentNames.forEach((name) => {
            ensureEquipmentBucket(equipmentMap, name);
        });

        (details?.material_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const unitName = String(row?.unit_name || row?.part_name || '미지정 유닛').trim() || '미지정 유닛';
            const unitScopeKey = materialUnitScopeKeyFromRow(row);
            const unitCount = Math.max(1, Number(materialUnitCountMap[unitScopeKey] || 1));
            const amount = toNumber(row?.quantity) * toNumber(row?.unit_price) * unitCount;

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const unitBucket = ensureMaterialUnitBucket(phaseBucket.materialUnits, unitName);

            phaseBucket.totals.material.budget += amount;
            unitBucket.unitCount = Math.max(1, toNumber(unitCount));
            unitBucket.partCount += 1;
            unitBucket.quantityTotal += toNumber(row?.quantity);
            unitBucket.budgetAmount += amount;
        });

        (details?.execution_material_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const unitName = String(row?.unit_name || row?.part_name || '미지정 유닛').trim() || '미지정 유닛';
            const unitScopeKey = materialUnitScopeKeyFromRow(row);
            const unitCount = Math.max(1, Number(materialUnitCountMap[unitScopeKey] || 1));
            const amount = toNumber(row?.executed_amount);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const unitBucket = ensureMaterialUnitBucket(phaseBucket.materialUnits, unitName);

            phaseBucket.totals.material.execution += amount;
            unitBucket.unitCount = Math.max(1, toNumber(unitCount));
            unitBucket.executionAmount += amount;
        });

        (details?.labor_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const staffingType = normalizeStaffingType(row?.staffing_type);
            const taskName = String(row?.task_name || '').trim() || '미지정 항목';
            const amount = calcLaborBudgetAmount(row, settings);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const taskBucket = ensureNamedAmountBucket(phaseBucket.laborItems[staffingType], taskName);

            phaseBucket.totals.labor.budget += amount;
            taskBucket.budgetAmount += amount;
        });

        (details?.execution_labor_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const staffingType = normalizeStaffingType(row?.staffing_type);
            const taskName = String(row?.task_name || '').trim() || '미지정 항목';
            const amount = toNumber(row?.executed_amount);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const taskBucket = ensureNamedAmountBucket(phaseBucket.laborItems[staffingType], taskName);

            phaseBucket.totals.labor.execution += amount;
            taskBucket.executionAmount += amount;
        });

        (details?.expense_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const expenseType = normalizeExpenseType(row?.expense_type);
            const expenseName = String(row?.expense_name || '').trim() || '미지정 항목';
            const amount = toNumber(row?.amount);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const expenseBucket = ensureNamedAmountBucket(phaseBucket.expenseItems[expenseType], expenseName);

            phaseBucket.totals.expense.budget += amount;
            expenseBucket.budgetAmount += amount;
            expenseBucket.basis = String(row?.basis || '').trim() || expenseBucket.basis;
        });

        (details?.execution_expense_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const expenseType = normalizeExpenseType(row?.expense_type);
            const expenseName = String(row?.expense_name || '').trim() || '미지정 항목';
            const amount = toNumber(row?.executed_amount);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const expenseBucket = ensureNamedAmountBucket(phaseBucket.expenseItems[expenseType], expenseName);

            phaseBucket.totals.expense.execution += amount;
            expenseBucket.executionAmount += amount;
            expenseBucket.basis = String(row?.basis || '').trim() || expenseBucket.basis;
        });

        const equipmentSummaries = Array.from(equipmentMap.values()).map((equipment) => {
            const phases = {};
            PHASES.forEach((phase) => {
                const phaseBucket = equipment.phases[phase];
                const materialBudget = toNumber(phaseBucket.totals.material.budget);
                const materialExecution = toNumber(phaseBucket.totals.material.execution);
                const laborBudget = toNumber(phaseBucket.totals.labor.budget);
                const laborExecution = toNumber(phaseBucket.totals.labor.execution);
                const expenseBudget = toNumber(phaseBucket.totals.expense.budget);
                const expenseExecution = toNumber(phaseBucket.totals.expense.execution);

                const budgetTotal = materialBudget + laborBudget + expenseBudget;
                const executionTotal = materialExecution + laborExecution + expenseExecution;

                phases[phase] = {
                    material: {
                        budget: materialBudget,
                        execution: materialExecution,
                        remaining: materialBudget - materialExecution,
                        units: sortByAmountDesc(Array.from(phaseBucket.materialUnits.values()), 'budgetAmount'),
                    },
                    labor: {
                        budget: laborBudget,
                        execution: laborExecution,
                        remaining: laborBudget - laborExecution,
                        byStaffing: {
                            자체: sortByAmountDesc(Array.from(phaseBucket.laborItems.자체.values()), 'budgetAmount'),
                            외주: sortByAmountDesc(Array.from(phaseBucket.laborItems.외주.values()), 'budgetAmount'),
                        },
                    },
                    expense: {
                        budget: expenseBudget,
                        execution: expenseExecution,
                        remaining: expenseBudget - expenseExecution,
                        byType: {
                            자체: sortByAmountDesc(Array.from(phaseBucket.expenseItems.자체.values()), 'budgetAmount'),
                            외주: sortByAmountDesc(Array.from(phaseBucket.expenseItems.외주.values()), 'budgetAmount'),
                        },
                    },
                    total: {
                        budget: budgetTotal,
                        execution: executionTotal,
                        remaining: budgetTotal - executionTotal,
                    },
                };
            });
            return {
                name: equipment.name,
                phases,
            };
        });

        const aggregatePhaseBudget = {
            fabrication: { material: 0, labor: 0, expense: 0, total: 0 },
            installation: { material: 0, labor: 0, expense: 0, total: 0 },
        };
        const aggregatePhaseExecution = {
            fabrication: { material: 0, labor: 0, expense: 0, total: 0 },
            installation: { material: 0, labor: 0, expense: 0, total: 0 },
        };

        equipmentSummaries.forEach((equipment) => {
            PHASES.forEach((phase) => {
                const phaseData = equipment.phases[phase];
                aggregatePhaseBudget[phase].material += phaseData.material.budget;
                aggregatePhaseBudget[phase].labor += phaseData.labor.budget;
                aggregatePhaseBudget[phase].expense += phaseData.expense.budget;
                aggregatePhaseBudget[phase].total += phaseData.total.budget;

                aggregatePhaseExecution[phase].material += phaseData.material.execution;
                aggregatePhaseExecution[phase].labor += phaseData.labor.execution;
                aggregatePhaseExecution[phase].expense += phaseData.expense.execution;
                aggregatePhaseExecution[phase].total += phaseData.total.execution;
            });
        });

        const aggregateBudget = {
            material: aggregatePhaseBudget.fabrication.material + aggregatePhaseBudget.installation.material,
            labor: aggregatePhaseBudget.fabrication.labor + aggregatePhaseBudget.installation.labor,
            expense: aggregatePhaseBudget.fabrication.expense + aggregatePhaseBudget.installation.expense,
            fabrication: aggregatePhaseBudget.fabrication.total,
            installation: aggregatePhaseBudget.installation.total,
            grand: aggregatePhaseBudget.fabrication.total + aggregatePhaseBudget.installation.total,
        };

        const aggregateExecution = {
            material: aggregatePhaseExecution.fabrication.material + aggregatePhaseExecution.installation.material,
            labor: aggregatePhaseExecution.fabrication.labor + aggregatePhaseExecution.installation.labor,
            expense: aggregatePhaseExecution.fabrication.expense + aggregatePhaseExecution.installation.expense,
            fabrication: aggregatePhaseExecution.fabrication.total,
            installation: aggregatePhaseExecution.installation.total,
            grand: aggregatePhaseExecution.fabrication.total + aggregatePhaseExecution.installation.total,
        };

        return {
            settings,
            equipmentSummaries,
            phaseBudget: aggregatePhaseBudget,
            phaseExecution: aggregatePhaseExecution,
            budget: aggregateBudget,
            execution: aggregateExecution,
            remaining: {
                material: aggregateBudget.material - aggregateExecution.material,
                labor: aggregateBudget.labor - aggregateExecution.labor,
                expense: aggregateBudget.expense - aggregateExecution.expense,
                fabrication: aggregateBudget.fabrication - aggregateExecution.fabrication,
                installation: aggregateBudget.installation - aggregateExecution.installation,
                grand: aggregateBudget.grand - aggregateExecution.grand,
            },
        };
    }, [details, equipments, project?.project_type]);

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    const baseProjectPath = `/project-management/projects/${project.id}`;
    const entryPages = [
        { key: 'material', label: '재료비 입력', to: `${baseProjectPath}/edit/material`, icon: Package },
        { key: 'labor', label: '인건비 입력', to: `${baseProjectPath}/edit/labor`, icon: Users },
        { key: 'expense', label: '경비 입력', to: `${baseProjectPath}/edit/expense`, icon: Receipt },
    ];

    return (
        <div className="space-y-5 pb-10">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="예산 관리"
                canEdit={project.can_edit}
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project.name || '프로젝트', to: baseProjectPath },
                    { label: '예산 관리' },
                ]}
            />

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-bold text-muted-foreground">예산 모니터링 대시보드</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            현재 단계: <span className="font-semibold text-foreground">{project.current_stage_label || '-'}</span>
                            {' · '}버전 {version?.version_no || '-'}{version?.revision_no > 0 ? `-r${version.revision_no}` : ''}
                            {showExecution ? ' · 집행비/잔액 포함' : ' · 예산 중심 모드'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {entryPages.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.key}
                                    to={item.to}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <StatCard icon={Calculator} label="총 예산" value={formatAmount(dashboard.budget.grand)} tone="primary" />
                <StatCard icon={Boxes} label="재료비 합계" value={formatAmount(dashboard.budget.material)} />
                <StatCard icon={Users} label="인건비 합계" value={formatAmount(dashboard.budget.labor)} />
                <StatCard icon={Receipt} label="경비 합계" value={formatAmount(dashboard.budget.expense)} />
                <StatCard icon={BriefcaseBusiness} label="제작 예산" value={formatAmount(dashboard.budget.fabrication)} />
                <StatCard icon={BriefcaseBusiness} label="설치 예산" value={formatAmount(dashboard.budget.installation)} />
                {showExecution && (
                    <>
                        <StatCard icon={Wallet} label="총 집행비" value={formatAmount(dashboard.execution.grand)} tone="indigo" />
                        <StatCard icon={Wallet} label="총 잔액" value={formatAmount(dashboard.remaining.grand)} tone={dashboard.remaining.grand < 0 ? 'danger' : 'emerald'} />
                        <StatCard icon={BarChart3} label="제작 집행비" value={formatAmount(dashboard.execution.fabrication)} tone="indigo" />
                        <StatCard icon={BarChart3} label="설치 집행비" value={formatAmount(dashboard.execution.installation)} tone="indigo" />
                        <StatCard icon={BarChart3} label="제작 잔액" value={formatAmount(dashboard.remaining.fabrication)} tone={dashboard.remaining.fabrication < 0 ? 'danger' : 'emerald'} />
                        <StatCard icon={BarChart3} label="설치 잔액" value={formatAmount(dashboard.remaining.installation)} tone={dashboard.remaining.installation < 0 ? 'danger' : 'emerald'} />
                    </>
                )}
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold">설비별 제작/설치 합계</h2>
                    <p className="text-[11px] text-muted-foreground">재료비/인건비/경비를 설비 기준으로 집계</p>
                </div>
                <div className="space-y-3">
                    {dashboard.equipmentSummaries.map((equipment) => (
                        <article key={equipment.name} className="rounded-xl border bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-bold">{equipment.name}</p>
                                <p className="text-[11px] text-muted-foreground">설비 총 예산 {formatAmount(equipment.phases.fabrication.total.budget + equipment.phases.installation.total.budget)}</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {PHASES.map((phase) => {
                                    const phaseData = equipment.phases[phase];
                                    return (
                                        <div key={`${equipment.name}-${phase}`} className="rounded-lg border bg-slate-50/70 p-3">
                                            <p className="mb-1 text-xs font-bold text-slate-700">{PHASE_LABEL[phase]}</p>
                                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                <AmountLine label="재료비" budget={phaseData.material.budget} execution={phaseData.material.execution} showExecution={showExecution} layout="vertical" />
                                                <AmountLine label="인건비" budget={phaseData.labor.budget} execution={phaseData.labor.execution} showExecution={showExecution} layout="vertical" />
                                                <AmountLine label="경비" budget={phaseData.expense.budget} execution={phaseData.expense.execution} showExecution={showExecution} layout="vertical" />
                                                <AmountLine label="소계" budget={phaseData.total.budget} execution={phaseData.total.execution} showExecution={showExecution} strong layout="vertical" />
                                            </div>
                                            <div className="mt-2 border-t border-slate-200 pt-2">
                                                <CompareBar budget={phaseData.total.budget} execution={phaseData.total.execution} showExecution={showExecution} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold">재료비 모니터링</h2>
                    <p className="text-[11px] text-muted-foreground">설비 &gt; 제작/설치 &gt; 유닛 기준</p>
                </div>
                <div className="space-y-3">
                    {dashboard.equipmentSummaries.map((equipment) => (
                        <article key={`material-${equipment.name}`} className="rounded-xl border bg-white p-3">
                            <p className="mb-2 text-sm font-bold">{equipment.name}</p>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {PHASES.map((phase) => {
                                    const material = equipment.phases[phase].material;
                                    return (
                                        <div key={`material-${equipment.name}-${phase}`} className="rounded-lg border bg-slate-50/70 p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-bold text-slate-700">{PHASE_LABEL[phase]}</p>
                                                <p className="text-[11px] text-slate-500">예산 {formatAmount(material.budget)}</p>
                                            </div>
                                            {showExecution && (
                                                <div className="mb-2 rounded-md border border-slate-200 bg-white p-2">
                                                    <AmountLine label="집행비" budget={material.execution} execution={0} showExecution={false} />
                                                    <AmountLine label="잔액(설비기준)" budget={material.remaining} execution={0} showExecution={false} strong />
                                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                                        재료비 집행은 유닛 매칭이 다를 수 있어 잔액은 설비 기준으로 표시합니다.
                                                    </p>
                                                </div>
                                            )}
                                            {!material.units.length ? (
                                                <p className="text-[11px] text-muted-foreground">등록된 유닛이 없습니다.</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {material.units.map((unit) => (
                                                        <div key={`${equipment.name}-${phase}-${unit.unitName}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="truncate text-[11px] font-semibold">{unit.unitName}</p>
                                                                <p className="text-[11px] font-semibold text-slate-700">{formatAmount(unit.budgetAmount)}</p>
                                                            </div>
                                                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                                유닛 개수 {formatCount(unit.unitCount)} · 포함 파츠 {formatCount(unit.partCount)} · 파츠 수량 합계 {toNumber(unit.quantityTotal).toLocaleString('ko-KR')}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold">인건비 모니터링</h2>
                    <p className="text-[11px] text-muted-foreground">자체/외주, 항목별 금액 및 잔액</p>
                </div>
                <div className="space-y-3">
                    {dashboard.equipmentSummaries.map((equipment) => (
                        <article key={`labor-${equipment.name}`} className="rounded-xl border bg-white p-3">
                            <p className="mb-2 text-sm font-bold">{equipment.name}</p>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {PHASES.map((phase) => {
                                    const labor = equipment.phases[phase].labor;
                                    return (
                                        <div key={`labor-${equipment.name}-${phase}`} className="rounded-lg border bg-slate-50/70 p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-bold text-slate-700">{PHASE_LABEL[phase]}</p>
                                                <AmountLine label="소계" budget={labor.budget} execution={labor.execution} showExecution={showExecution} strong />
                                            </div>
                                            {STAFFING_TYPES.map((staffingType) => {
                                                const items = labor.byStaffing[staffingType] || [];
                                                return (
                                                    <div key={`labor-${equipment.name}-${phase}-${staffingType}`} className="mb-2 rounded-md border border-slate-200 bg-white p-2">
                                                        <p className="mb-1 text-[11px] font-bold text-slate-700">{staffingType} 인원</p>
                                                        {!items.length ? (
                                                            <p className="text-[10px] text-muted-foreground">항목 없음</p>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {items.map((item) => (
                                                                    <AmountItem
                                                                        key={`${equipment.name}-${phase}-${staffingType}-${item.name}`}
                                                                        label={item.name}
                                                                        budget={item.budgetAmount}
                                                                        execution={item.executionAmount}
                                                                        showExecution={showExecution}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold">경비 모니터링</h2>
                    <p className="text-[11px] text-muted-foreground">항목별 산정 금액과 집행/잔액</p>
                </div>
                <div className="space-y-3">
                    {dashboard.equipmentSummaries.map((equipment) => (
                        <article key={`expense-${equipment.name}`} className="rounded-xl border bg-white p-3">
                            <p className="mb-2 text-sm font-bold">{equipment.name}</p>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {PHASES.map((phase) => {
                                    const expense = equipment.phases[phase].expense;
                                    return (
                                        <div key={`expense-${equipment.name}-${phase}`} className="rounded-lg border bg-slate-50/70 p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-bold text-slate-700">{PHASE_LABEL[phase]}</p>
                                                <AmountLine label="소계" budget={expense.budget} execution={expense.execution} showExecution={showExecution} strong />
                                            </div>
                                            {EXPENSE_TYPES.map((expenseType) => {
                                                const items = expense.byType[expenseType] || [];
                                                return (
                                                    <div key={`expense-${equipment.name}-${phase}-${expenseType}`} className="mb-2 rounded-md border border-slate-200 bg-white p-2">
                                                        <p className="mb-1 text-[11px] font-bold text-slate-700">{expenseType} 경비</p>
                                                        {!items.length ? (
                                                            <p className="text-[10px] text-muted-foreground">항목 없음</p>
                                                        ) : (
                                                            <div className="space-y-1">
                                                                {items.map((item) => (
                                                                    <AmountItem
                                                                        key={`${equipment.name}-${phase}-${expenseType}-${item.name}`}
                                                                        label={item.name}
                                                                        budget={item.budgetAmount}
                                                                        execution={item.executionAmount}
                                                                        showExecution={showExecution}
                                                                        description={item.basis || ''}
                                                                        zeroMuted
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
};

const toneClassByType = {
    default: 'border-slate-200 bg-white text-slate-800',
    primary: 'border-primary/30 bg-primary/5 text-primary',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
};

const StatCard = ({ icon: Icon, label, value, tone = 'default' }) => (
    <div className={cn('rounded-xl border p-3 shadow-sm', toneClassByType[tone] || toneClassByType.default)}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold">
            <Icon className="h-3.5 w-3.5" />
            {label}
        </p>
        <p className="mt-1 text-sm font-black">{value}</p>
    </div>
);

const AmountLine = ({ label, budget, execution, showExecution, strong = false, layout = 'default' }) => {
    const isVertical = layout === 'vertical';
    if (!showExecution) {
        if (isVertical) {
            return (
                <div className="mb-2 rounded-md border border-slate-200 bg-white/80 px-2.5 py-2">
                    <p className={cn('text-[12px] text-slate-500', strong && 'font-bold text-slate-700')}>{label}</p>
                    <p className={cn('mt-1 text-[16px] font-bold text-slate-800', strong && 'text-[17px]')}>{formatAmount(budget)}</p>
                </div>
            );
        }
        return (
            <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className={cn('text-slate-500', strong && 'font-bold text-slate-700')}>{label}</span>
                <span className={cn('font-semibold text-slate-700', strong && 'font-bold')}>{formatAmount(budget)}</span>
            </div>
        );
    }

    const remaining = toNumber(budget) - toNumber(execution);
    if (isVertical) {
        return (
            <div className="mb-2 rounded-md border border-slate-200 bg-white/80 px-2.5 py-2">
                <p className={cn('text-[12px] text-slate-500', strong && 'font-bold text-slate-700')}>{label}</p>
                <p className={cn('mt-1 text-[16px] font-bold text-slate-800', strong && 'text-[17px]')}>예산 {formatAmount(budget)}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">집행 {formatAmount(execution)}</p>
                <p className={cn('mt-0.5 text-[12px] font-semibold', remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                    잔액 {formatAmount(remaining)}
                </p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
            <span className={cn('text-slate-500', strong && 'font-bold text-slate-700')}>{label}</span>
            <span className={cn('justify-self-end font-semibold text-slate-700', strong && 'font-bold')}>예산 {formatAmount(budget)}</span>
            <span className="text-[10px] text-slate-400">집행/잔액</span>
            <span className="justify-self-end text-[10px] font-medium text-slate-500">
                {formatAmount(execution)} / <span className={cn(remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>{formatAmount(remaining)}</span>
            </span>
        </div>
    );
};

const CompareBar = ({ budget, execution, showExecution }) => {
    if (!showExecution) {
        return (
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-full bg-blue-500" />
            </div>
        );
    }

    const budgetAmount = Math.max(toNumber(budget), 0);
    const executionAmount = Math.max(toNumber(execution), 0);
    const ratio = budgetAmount > 0 ? Math.min(100, (executionAmount / budgetAmount) * 100) : 0;

    return (
        <div className="mt-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-indigo-500" style={{ width: `${ratio}%` }} />
            </div>
            <p className="mt-1 text-right text-[10px] text-slate-500">집행률 {Math.floor(ratio)}%</p>
        </div>
    );
};

const AmountItem = ({ label, budget, execution, showExecution, description = '', zeroMuted = false }) => {
    const remaining = toNumber(budget) - toNumber(execution);
    const isZeroBudget = toNumber(budget) === 0;
    const isZeroExecution = toNumber(execution) === 0;
    const isZeroRemaining = toNumber(remaining) === 0;
    const isZeroItem = showExecution
        ? (isZeroBudget && isZeroExecution && isZeroRemaining)
        : isZeroBudget;
    const muted = zeroMuted && isZeroItem;

    return (
        <div className={cn(
            'rounded border border-slate-100 px-2 py-1.5',
            muted && 'border-slate-200 bg-slate-100/80',
        )}
        >
            <div className="flex items-center justify-between gap-2">
                <p className={cn('truncate text-[11px] font-semibold text-slate-700', muted && 'text-slate-500')}>{label}</p>
                {!showExecution ? (
                    <p className={cn('text-[11px] font-semibold text-slate-700', muted && 'text-slate-500')}>{formatAmount(budget)}</p>
                ) : (
                    <p className={cn('text-[11px] font-semibold text-slate-700', muted && 'text-slate-500')}>
                        {formatAmount(budget)}
                        <span className={cn('ml-1 text-[10px] font-medium text-slate-500', muted && 'text-slate-400')}>/ {formatAmount(execution)}</span>
                    </p>
                )}
            </div>
            {showExecution && (
                <p className="mt-0.5 text-right text-[10px] font-medium">
                    잔액 <span className={cn(
                        remaining < 0 ? 'text-rose-600' : 'text-emerald-700',
                        muted && 'text-slate-400',
                    )}
                    >{formatAmount(remaining)}</span>
                </p>
            )}
            {description && (
                <p className={cn('mt-0.5 truncate text-[10px] text-muted-foreground', muted && 'text-slate-400')}>{description}</p>
            )}
        </div>
    );
};

export default BudgetProjectBudget;
