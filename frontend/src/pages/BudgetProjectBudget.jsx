import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    Bell,
    Boxes,
    Calculator,
    ChevronDown,
    Database,
    Grid2x2,
    Loader2,
    Plus,
    Receipt,
    Search,
    Users,
    Wallet,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';

const EXECUTION_STAGES = new Set(['fabrication', 'installation', 'warranty']);
const PHASES = ['fabrication', 'installation'];
const PHASE_LABEL = {
    fabrication: '제작',
    installation: '설치',
};
const PHASE_THEME = {
    fabrication: {
        border: 'border-indigo-500',
        panel: 'bg-indigo-50/50',
        text: 'text-indigo-700',
        badge: 'bg-indigo-100 text-indigo-700',
        progress: 'bg-indigo-500',
    },
    installation: {
        border: 'border-emerald-500',
        panel: 'bg-emerald-50/50',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-700',
        progress: 'bg-emerald-500',
    },
};
const COST_TYPES = ['material', 'labor', 'expense'];
const COST_TYPE_LABEL = {
    material: '재료비',
    labor: '인건비',
    expense: '경비',
};
const SOURCE_TYPES = ['자체', '외주'];
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

function formatPercent(value) {
    return `${Math.round(Math.max(0, value))}%`;
}

function shortProjectName(value, maxLength = 10) {
    const text = String(value || '').trim();
    if (!text) return '프로젝트';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
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

function sumAmountRows(rows) {
    return (rows || []).reduce((acc, row) => {
        acc.budget += toNumber(row?.budgetAmount);
        acc.execution += toNumber(row?.executionAmount);
        return acc;
    }, { budget: 0, execution: 0 });
}

function usagePercent(budget, execution) {
    const safeBudget = Math.max(toNumber(budget), 0);
    if (safeBudget === 0) return 0;
    return Math.min(100, (Math.max(toNumber(execution), 0) / safeBudget) * 100);
}

function usageBarClass(percent) {
    if (percent >= 100) return 'bg-rose-500';
    if (percent >= 80) return 'bg-orange-500';
    return 'bg-primary';
}

function statusDotClass(percent) {
    if (percent >= 100) return 'bg-rose-500';
    if (percent >= 80) return 'bg-orange-400';
    return 'bg-emerald-500';
}

const BudgetProjectBudget = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [details, setDetails] = useState(EMPTY_DETAILS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [inputQuery, setInputQuery] = useState(() => searchParams.get('q') || '');
    const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
    const quickMenuRef = useRef(null);

    const [isBudgetMenuOpen, setIsBudgetMenuOpen] = useState(false);
    const budgetMenuRef = useRef(null);
    const budgetMenuCloseTimerRef = useRef(null);

    const [equipmentKeyword, setEquipmentKeyword] = useState('');
    const [selectedPhases, setSelectedPhases] = useState([...PHASES]);
    const [selectedCostTypes, setSelectedCostTypes] = useState([...COST_TYPES]);
    const [selectedSources, setSelectedSources] = useState([...SOURCE_TYPES]);
    const [selectedEquipments, setSelectedEquipments] = useState([]);

    useEffect(() => {
        setInputQuery(searchParams.get('q') || '');
    }, [searchParams]);

    useEffect(() => {
        const handleGlobalClick = (event) => {
            const target = event.target;
            const isQuickMenuTarget = quickMenuRef.current?.contains(target);
            const isBudgetMenuTarget = budgetMenuRef.current?.contains(target);
            if (!isQuickMenuTarget) setIsQuickMenuOpen(false);
            if (!isBudgetMenuTarget) setIsBudgetMenuOpen(false);
        };

        document.addEventListener('mousedown', handleGlobalClick);
        return () => {
            document.removeEventListener('mousedown', handleGlobalClick);
        };
    }, []);

    useEffect(() => () => {
        if (!budgetMenuCloseTimerRef.current) return;
        clearTimeout(budgetMenuCloseTimerRef.current);
        budgetMenuCloseTimerRef.current = null;
    }, []);

    const keepBudgetMenuOpen = () => {
        if (budgetMenuCloseTimerRef.current) {
            clearTimeout(budgetMenuCloseTimerRef.current);
            budgetMenuCloseTimerRef.current = null;
        }
        setIsBudgetMenuOpen(true);
    };

    const scheduleBudgetMenuClose = () => {
        if (budgetMenuCloseTimerRef.current) {
            clearTimeout(budgetMenuCloseTimerRef.current);
        }
        budgetMenuCloseTimerRef.current = setTimeout(() => {
            setIsBudgetMenuOpen(false);
            budgetMenuCloseTimerRef.current = null;
        }, 1000);
    };

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
                setError(getErrorMessage(err, '예산 메인 데이터를 불러오지 못했습니다.'));
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

        return {
            settings,
            equipmentSummaries,
        };
    }, [details, equipments, project?.project_type]);

    useEffect(() => {
        const names = dashboard.equipmentSummaries.map((item) => item.name);
        setSelectedEquipments((prev) => {
            if (!names.length) return [];
            if (!prev.length) return names;
            const kept = prev.filter((name) => names.includes(name));
            return kept.length ? kept : names;
        });
    }, [dashboard.equipmentSummaries]);

    const equipmentFilterOptions = useMemo(() => {
        const keyword = equipmentKeyword.trim().toLowerCase();
        if (!keyword) return dashboard.equipmentSummaries.map((item) => item.name);
        return dashboard.equipmentSummaries
            .map((item) => item.name)
            .filter((name) => name.toLowerCase().includes(keyword));
    }, [dashboard.equipmentSummaries, equipmentKeyword]);

    const viewModel = useMemo(() => {
        const phaseSet = new Set(selectedPhases);
        const costTypeSet = new Set(selectedCostTypes);
        const sourceSet = new Set(selectedSources);
        const equipmentSet = new Set(selectedEquipments);

        const items = dashboard.equipmentSummaries
            .filter((equipment) => equipmentSet.has(equipment.name))
            .map((equipment) => {
                const phases = {};
                const totals = {
                    material: { budget: 0, execution: 0, remaining: 0 },
                    labor: { budget: 0, execution: 0, remaining: 0 },
                    expense: { budget: 0, execution: 0, remaining: 0 },
                    total: { budget: 0, execution: 0, remaining: 0 },
                };

                PHASES.forEach((phase) => {
                    if (!phaseSet.has(phase)) return;
                    const phaseData = equipment.phases[phase];
                    const materialEnabled = costTypeSet.has('material');
                    const laborEnabled = costTypeSet.has('labor');
                    const expenseEnabled = costTypeSet.has('expense');

                    const material = {
                        units: materialEnabled ? phaseData.material.units : [],
                        budget: materialEnabled ? toNumber(phaseData.material.budget) : 0,
                        execution: materialEnabled ? toNumber(phaseData.material.execution) : 0,
                    };
                    material.remaining = material.budget - material.execution;

                    const laborBySource = {};
                    let laborBudget = 0;
                    let laborExecution = 0;
                    SOURCE_TYPES.forEach((source) => {
                        const rows = phaseData.labor.byStaffing[source] || [];
                        const sums = sumAmountRows(rows);
                        laborBySource[source] = {
                            rows,
                            budget: sums.budget,
                            execution: sums.execution,
                            remaining: sums.budget - sums.execution,
                        };
                        if (laborEnabled && sourceSet.has(source)) {
                            laborBudget += sums.budget;
                            laborExecution += sums.execution;
                        }
                    });
                    const labor = {
                        bySource: laborBySource,
                        budget: laborBudget,
                        execution: laborExecution,
                        remaining: laborBudget - laborExecution,
                    };

                    const expenseBySource = {};
                    let expenseBudget = 0;
                    let expenseExecution = 0;
                    SOURCE_TYPES.forEach((source) => {
                        const rows = phaseData.expense.byType[source] || [];
                        const sums = sumAmountRows(rows);
                        expenseBySource[source] = {
                            rows,
                            budget: sums.budget,
                            execution: sums.execution,
                            remaining: sums.budget - sums.execution,
                        };
                        if (expenseEnabled && sourceSet.has(source)) {
                            expenseBudget += sums.budget;
                            expenseExecution += sums.execution;
                        }
                    });
                    const expense = {
                        bySource: expenseBySource,
                        budget: expenseBudget,
                        execution: expenseExecution,
                        remaining: expenseBudget - expenseExecution,
                    };

                    const phaseBudget = material.budget + labor.budget + expense.budget;
                    const phaseExecution = material.execution + labor.execution + expense.execution;
                    const phaseRemaining = phaseBudget - phaseExecution;

                    phases[phase] = {
                        material,
                        labor,
                        expense,
                        total: {
                            budget: phaseBudget,
                            execution: phaseExecution,
                            remaining: phaseRemaining,
                            percent: usagePercent(phaseBudget, phaseExecution),
                        },
                    };

                    totals.material.budget += material.budget;
                    totals.material.execution += material.execution;
                    totals.material.remaining += material.remaining;
                    totals.labor.budget += labor.budget;
                    totals.labor.execution += labor.execution;
                    totals.labor.remaining += labor.remaining;
                    totals.expense.budget += expense.budget;
                    totals.expense.execution += expense.execution;
                    totals.expense.remaining += expense.remaining;
                    totals.total.budget += phaseBudget;
                    totals.total.execution += phaseExecution;
                    totals.total.remaining += phaseRemaining;
                });

                totals.total.percent = usagePercent(totals.total.budget, totals.total.execution);
                return {
                    name: equipment.name,
                    phases,
                    totals,
                };
            })
            .filter((item) => Object.keys(item.phases).length > 0);

        const summary = {
            material: { budget: 0, execution: 0, remaining: 0 },
            labor: { budget: 0, execution: 0, remaining: 0 },
            expense: { budget: 0, execution: 0, remaining: 0 },
            total: { budget: 0, execution: 0, remaining: 0 },
            phases: {
                fabrication: { budget: 0, execution: 0, remaining: 0 },
                installation: { budget: 0, execution: 0, remaining: 0 },
            },
        };

        items.forEach((item) => {
            COST_TYPES.forEach((type) => {
                summary[type].budget += item.totals[type].budget;
                summary[type].execution += item.totals[type].execution;
                summary[type].remaining += item.totals[type].remaining;
            });
            summary.total.budget += item.totals.total.budget;
            summary.total.execution += item.totals.total.execution;
            summary.total.remaining += item.totals.total.remaining;
            PHASES.forEach((phase) => {
                const phaseData = item.phases[phase];
                if (!phaseData) return;
                summary.phases[phase].budget += phaseData.total.budget;
                summary.phases[phase].execution += phaseData.total.execution;
                summary.phases[phase].remaining += phaseData.total.remaining;
            });
        });

        summary.total.percent = usagePercent(summary.total.budget, summary.total.execution);
        PHASES.forEach((phase) => {
            summary.phases[phase].percent = usagePercent(summary.phases[phase].budget, summary.phases[phase].execution);
        });

        return {
            items,
            summary,
        };
    }, [dashboard.equipmentSummaries, selectedPhases, selectedCostTypes, selectedEquipments, selectedSources]);

    const allPhaseSelected = selectedPhases.length === PHASES.length;
    const allCostTypeSelected = selectedCostTypes.length === COST_TYPES.length;
    const allSourceSelected = selectedSources.length === SOURCE_TYPES.length;

    const baseProjectPath = `/project-management/projects/${project?.id || projectId}`;
    const projectMainPath = baseProjectPath;
    const budgetMainPath = `${baseProjectPath}/budget`;
    const budgetMaterialPath = `${baseProjectPath}/edit/material`;
    const budgetLaborPath = `${baseProjectPath}/edit/labor`;
    const budgetExpensePath = `${baseProjectPath}/edit/expense`;
    const issueManagementPath = `${baseProjectPath}/joblist`;
    const scheduleManagementPath = `${baseProjectPath}/schedule`;
    const specManagementPath = `${baseProjectPath}/spec`;
    const dataManagementPath = `${baseProjectPath}/data`;
    const projectSettingPath = `${baseProjectPath}/info/edit`;

    const pathname = location.pathname;
    const isProjectMainActive = pathname === projectMainPath || pathname === `${projectMainPath}/`;
    const isBudgetMainActive = pathname === budgetMainPath || pathname === `${budgetMainPath}/` || pathname.startsWith(`${baseProjectPath}/edit/`);
    const isIssueActive = pathname === issueManagementPath || pathname === `${issueManagementPath}/`;
    const isScheduleActive = pathname === scheduleManagementPath || pathname === `${scheduleManagementPath}/`;
    const isSpecActive = pathname === specManagementPath || pathname === `${specManagementPath}/`;
    const isDataActive = pathname === dataManagementPath || pathname === `${dataManagementPath}/`;
    const isSettingActive = pathname.startsWith(projectSettingPath);

    const user = getCurrentUser();
    const userBadge = String(user?.name || user?.email || 'U').trim().slice(0, 1).toUpperCase() || 'U';
    const projectName = project?.name || '프로젝트';

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const query = inputQuery.trim();
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        navigate({ pathname: '/', search: params.toString() ? `?${params.toString()}` : '' });
    };

    const toggleMulti = (setter, value) => {
        setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-20">
                    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
                        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            예산 메인 정보를 불러오는 중입니다.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-20">
                    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                        프로젝트를 찾을 수 없습니다.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="h-16 border-b border-border bg-card/95 backdrop-blur">
                <div className="mx-auto h-full max-w-[1600px] px-4 lg:px-6 flex items-center gap-3">
                    <Link to="/" className="w-44 shrink-0 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center text-xs font-bold">S</div>
                        <div className="leading-tight">
                            <p className="font-extrabold tracking-tight text-sm">sync-hub</p>
                            <p className="text-[10px] text-muted-foreground">검색 워크스페이스</p>
                        </div>
                    </Link>

                    <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0">
                        <label className="relative block">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder="프로젝트, 안건, 사양, PDF, 엑셀 데이터를 자연어로 검색"
                                className="h-10 w-full rounded-full border border-input bg-secondary pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                            />
                        </label>
                    </form>

                    <div className="w-40 shrink-0 flex items-center justify-end gap-2">
                        <button type="button" className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary">
                            <Bell className="h-4 w-4" />
                        </button>
                        <div className="relative" ref={quickMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsQuickMenuOpen((prev) => !prev)}
                                className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary"
                                aria-label="빠른 메뉴"
                                aria-expanded={isQuickMenuOpen}
                            >
                                <Grid2x2 className="h-4 w-4" />
                            </button>

                            {isQuickMenuOpen && (
                                <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-border bg-card p-3 shadow-xl">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Link
                                            to="/project-management/projects/new"
                                            onClick={() => setIsQuickMenuOpen(false)}
                                            className="flex flex-col items-center gap-1 rounded-xl p-3 text-foreground hover:bg-secondary"
                                        >
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                                                <Plus className="h-4 w-4" />
                                            </span>
                                            <span className="text-xs font-semibold text-center">새 프로젝트 생성</span>
                                        </Link>
                                        <button
                                            type="button"
                                            className="flex flex-col items-center gap-1 rounded-xl p-3 text-muted-foreground/70 cursor-not-allowed"
                                            title="데이터 허브는 아직 구현되지 않았습니다."
                                        >
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                                                <Database className="h-4 w-4" />
                                            </span>
                                            <span className="text-xs font-semibold text-center">데이터 허브(미구현)</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button type="button" className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center">
                            <span>{userBadge}</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="border-b border-border bg-secondary/80">
                <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-2">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <nav
                            aria-label="현재 경로"
                            className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground"
                        >
                            <Link to="/" className="font-medium hover:text-primary">
                                메인
                            </Link>
                            <span>/</span>
                            <Link to="/search" className="font-medium hover:text-primary">
                                글로벌 검색
                            </Link>
                            <span>&gt;</span>
                            <span className="font-semibold text-foreground/90" title={projectName}>
                                {shortProjectName(projectName)}
                            </span>
                        </nav>

                        <div className="bg-secondary p-1 rounded-lg inline-flex flex-wrap items-center justify-end gap-1">
                            <Link
                                to={projectMainPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isProjectMainActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                프로젝트 메인
                            </Link>

                            <div
                                className="relative"
                                ref={budgetMenuRef}
                                onMouseEnter={keepBudgetMenuOpen}
                                onMouseLeave={scheduleBudgetMenuClose}
                            >
                                <Link
                                    to={budgetMainPath}
                                    onMouseEnter={keepBudgetMenuOpen}
                                    className={cn(
                                        'inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                        isBudgetMainActive
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                    )}
                                >
                                    예산 메인
                                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isBudgetMenuOpen && 'rotate-180')} />
                                </Link>

                                {isBudgetMenuOpen && (
                                    <div
                                        className="absolute right-0 top-[calc(100%+6px)] z-30 w-max rounded-lg border border-border bg-card p-1.5 shadow-lg"
                                        onMouseEnter={keepBudgetMenuOpen}
                                        onMouseLeave={scheduleBudgetMenuClose}
                                    >
                                        <div className="flex items-center gap-1 whitespace-nowrap">
                                            <Link
                                                to={budgetMaterialPath}
                                                onClick={() => setIsBudgetMenuOpen(false)}
                                                className="inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-secondary"
                                            >
                                                재료비 관리
                                            </Link>
                                            <Link
                                                to={budgetLaborPath}
                                                onClick={() => setIsBudgetMenuOpen(false)}
                                                className="inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-secondary"
                                            >
                                                인건비 관리
                                            </Link>
                                            <Link
                                                to={budgetExpensePath}
                                                onClick={() => setIsBudgetMenuOpen(false)}
                                                className="inline-flex items-center whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-secondary"
                                            >
                                                경비 관리
                                            </Link>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Link
                                to={issueManagementPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isIssueActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                이슈 관리
                            </Link>
                            <Link
                                to={scheduleManagementPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isScheduleActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                일정 관리
                            </Link>
                            <Link
                                to={specManagementPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isSpecActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                사양 관리
                            </Link>
                            <Link
                                to={dataManagementPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isDataActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                데이터 관리
                            </Link>
                            <Link
                                to={projectSettingPath}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                    isSettingActive
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                )}
                            >
                                프로젝트 설정
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <main className="mx-auto max-w-[1600px] px-4 lg:px-6 py-5">
                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-5 xl:flex-row">
                    <aside className="xl:w-80 shrink-0 rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-800">필터</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setEquipmentKeyword('');
                                    setSelectedPhases([...PHASES]);
                                    setSelectedCostTypes([...COST_TYPES]);
                                    setSelectedSources([...SOURCE_TYPES]);
                                    setSelectedEquipments(dashboard.equipmentSummaries.map((item) => item.name));
                                }}
                                className="text-xs font-semibold text-primary hover:text-primary/80"
                            >
                                전체 초기화
                            </button>
                        </div>

                        <div className="space-y-5 text-sm">
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">설비 검색</p>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={equipmentKeyword}
                                        onChange={(event) => setEquipmentKeyword(event.target.value)}
                                        placeholder="설비 이름 검색"
                                        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">프로젝트 단계</p>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={allPhaseSelected}
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    setSelectedPhases([...PHASES]);
                                                } else {
                                                    setSelectedPhases([]);
                                                }
                                            }}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        전체 단계
                                    </label>
                                    {PHASES.map((phase) => (
                                        <label key={phase} className="flex items-center gap-2 text-xs text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={selectedPhases.includes(phase)}
                                                onChange={() => toggleMulti(setSelectedPhases, phase)}
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                            />
                                            {PHASE_LABEL[phase]}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">비용 유형</p>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={allCostTypeSelected}
                                            onChange={(event) => {
                                                if (event.target.checked) {
                                                    setSelectedCostTypes([...COST_TYPES]);
                                                } else {
                                                    setSelectedCostTypes([]);
                                                }
                                            }}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        전체 비용
                                    </label>
                                    {COST_TYPES.map((type) => (
                                        <label key={type} className="flex items-center gap-2 text-xs text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={selectedCostTypes.includes(type)}
                                                onChange={() => toggleMulti(setSelectedCostTypes, type)}
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                            />
                                            {COST_TYPE_LABEL[type]}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">출처</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {SOURCE_TYPES.map((source) => (
                                        <button
                                            key={source}
                                            type="button"
                                            onClick={() => toggleMulti(setSelectedSources, source)}
                                            className={cn(
                                                'h-8 rounded-md border text-xs font-semibold transition-colors',
                                                selectedSources.includes(source)
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                                            )}
                                        >
                                            {source}
                                        </button>
                                    ))}
                                </div>
                                {!allSourceSelected && (
                                    <p className="mt-1 text-[11px] text-slate-500">선택된 출처만 합산됩니다.</p>
                                )}
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">설비</p>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedEquipments(dashboard.equipmentSummaries.map((item) => item.name))}
                                        className="text-[11px] font-semibold text-primary hover:text-primary/80"
                                    >
                                        전체 선택
                                    </button>
                                </div>
                                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                                    {equipmentFilterOptions.map((name) => (
                                        <label key={name} className="flex items-center gap-2 text-xs text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={selectedEquipments.includes(name)}
                                                onChange={() => toggleMulti(setSelectedEquipments, name)}
                                                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                            />
                                            <span className="truncate">{name}</span>
                                        </label>
                                    ))}
                                    {equipmentFilterOptions.length === 0 && (
                                        <p className="text-[11px] text-slate-500">일치하는 설비가 없습니다.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </aside>

                    <div className="flex-1 space-y-5">
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <SummaryCard
                                icon={Calculator}
                                title="총 예산"
                                value={formatAmount(viewModel.summary.total.budget)}
                                subText="할당 100%"
                            />
                            <SummaryCard
                                icon={Wallet}
                                title="총 집행"
                                value={formatAmount(viewModel.summary.total.execution)}
                                subText={`집행률 ${formatPercent(viewModel.summary.total.percent)}`}
                                tone="warning"
                            />
                            <SummaryCard
                                icon={BarChart3}
                                title="총 잔액"
                                value={formatAmount(viewModel.summary.total.remaining)}
                                subText={showExecution ? '집행 반영 모드' : '예산 중심 모드'}
                                tone="primary"
                            />
                        </section>

                        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {PHASES.filter((phase) => selectedPhases.includes(phase)).map((phase) => {
                                const phaseSummary = viewModel.summary.phases[phase];
                                const theme = PHASE_THEME[phase];
                                const materialShare = phaseSummary.execution > 0
                                    ? Math.round((viewModel.summary.material.execution / Math.max(phaseSummary.execution, 1)) * 100)
                                    : 0;
                                const laborShare = phaseSummary.execution > 0
                                    ? Math.round((viewModel.summary.labor.execution / Math.max(phaseSummary.execution, 1)) * 100)
                                    : 0;
                                const expenseShare = phaseSummary.execution > 0
                                    ? Math.round((viewModel.summary.expense.execution / Math.max(phaseSummary.execution, 1)) * 100)
                                    : 0;

                                return (
                                    <article
                                        key={`phase-summary-${phase}`}
                                        className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', theme.border, 'border-l-4')}
                                    >
                                        <div className="mb-3 flex items-center justify-between">
                                            <div>
                                                <h3 className={cn('text-sm font-bold', theme.text)}>{PHASE_LABEL[phase]} 단계</h3>
                                                <p className="text-xs text-slate-500">예산 {formatAmount(phaseSummary.budget)}</p>
                                            </div>
                                            <span className={cn('rounded px-2 py-1 text-[11px] font-bold', theme.badge)}>
                                                집행률 {formatPercent(phaseSummary.percent)}
                                            </span>
                                        </div>
                                        <div className="mb-3 text-xs text-slate-600">
                                            <span>집행 {formatAmount(phaseSummary.execution)}</span>
                                            <span className="mx-2">/</span>
                                            <span>잔액 {formatAmount(phaseSummary.remaining)}</span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                            <div
                                                className={cn('h-full', theme.progress)}
                                                style={{ width: `${phaseSummary.percent}%` }}
                                            />
                                        </div>
                                        <div className={cn('mt-3 grid grid-cols-3 gap-2 rounded-lg p-2', theme.panel)}>
                                            <MiniMetric label="재료비" value={`${materialShare}%`} icon={Boxes} />
                                            <MiniMetric label="인건비" value={`${laborShare}%`} icon={Users} />
                                            <MiniMetric label="경비" value={`${expenseShare}%`} icon={Receipt} />
                                        </div>
                                    </article>
                                );
                            })}
                        </section>

                        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-800">예산 상세 브레이크다운</h3>
                                <div className="text-xs text-slate-500 flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />안전</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />경고</span>
                                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />초과</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                <div className="col-span-5">설비 / 카테고리</div>
                                <div className="col-span-2 text-right">예산</div>
                                <div className="col-span-2 text-right">집행</div>
                                <div className="col-span-2 text-right">잔액</div>
                                <div className="col-span-1 text-center">상태</div>
                            </div>

                            <div className="divide-y divide-slate-200">
                                {viewModel.items.length === 0 && (
                                    <div className="px-5 py-10 text-center text-sm text-slate-500">
                                        선택된 필터 조건에 맞는 예산 데이터가 없습니다.
                                    </div>
                                )}

                                {viewModel.items.map((equipment) => {
                                    const totalPercent = equipment.totals.total.percent;
                                    return (
                                        <details key={equipment.name} className="group" open>
                                            <summary className="grid grid-cols-12 gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors items-center select-none border-l-4 border-transparent hover:border-primary">
                                                <div className="col-span-5 flex items-center gap-2 min-w-0">
                                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                                                    <div className="truncate text-sm font-semibold text-slate-800">{equipment.name}</div>
                                                </div>
                                                <div className="col-span-2 text-right text-sm font-medium text-slate-700">{formatAmount(equipment.totals.total.budget)}</div>
                                                <div className="col-span-2 text-right text-sm font-medium text-slate-700">{formatAmount(equipment.totals.total.execution)}</div>
                                                <div className={cn('col-span-2 text-right text-sm font-bold', equipment.totals.total.remaining < 0 ? 'text-rose-600' : 'text-primary')}>
                                                    {formatAmount(equipment.totals.total.remaining)}
                                                </div>
                                                <div className="col-span-1 flex justify-center">
                                                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
                                                        <div className={cn('h-full', usageBarClass(totalPercent))} style={{ width: `${Math.min(totalPercent, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </summary>

                                            <div className="pl-4 pr-2 pb-3">
                                                {PHASES.filter((phase) => selectedPhases.includes(phase)).map((phase) => {
                                                    const phaseView = equipment.phases[phase];
                                                    if (!phaseView) return null;
                                                    const theme = PHASE_THEME[phase];

                                                    return (
                                                        <details key={`${equipment.name}-${phase}`} className="group/phase mb-2" open>
                                                            <summary
                                                                className={cn(
                                                                    'grid grid-cols-12 gap-3 px-5 py-3 cursor-pointer transition-colors items-center rounded-l-lg border-l-4',
                                                                    theme.panel,
                                                                    theme.border
                                                                )}
                                                            >
                                                                <div className="col-span-5 flex items-center gap-2">
                                                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open/phase:rotate-180" />
                                                                    <span className={cn('text-xs font-bold', theme.text)}>{PHASE_LABEL[phase]} 단계</span>
                                                                </div>
                                                                <div className="col-span-2 text-right text-xs font-semibold text-slate-700">{formatAmount(phaseView.total.budget)}</div>
                                                                <div className="col-span-2 text-right text-xs font-semibold text-slate-700">{formatAmount(phaseView.total.execution)}</div>
                                                                <div className={cn('col-span-2 text-right text-xs font-semibold', phaseView.total.remaining < 0 ? 'text-rose-600' : theme.text)}>
                                                                    {formatAmount(phaseView.total.remaining)}
                                                                </div>
                                                                <div className="col-span-1 flex justify-center">
                                                                    <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold', theme.badge)}>
                                                                        {formatPercent(phaseView.total.percent)}
                                                                    </span>
                                                                </div>
                                                            </summary>

                                                            <div className="ml-6 border-l border-slate-200 pl-4 pr-2 py-2 space-y-2">
                                                                {selectedCostTypes.includes('material') && (
                                                                    <details className="group/type" open>
                                                                        <summary className="grid grid-cols-12 gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 rounded">
                                                                            <div className="col-span-5 flex items-center gap-2">
                                                                                <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open/type:rotate-180" />
                                                                                <span className="text-xs font-semibold text-slate-700">재료비</span>
                                                                            </div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.material.budget)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.material.execution)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.material.remaining)}</div>
                                                                            <div className="col-span-1 flex justify-center">
                                                                                <span className={cn('inline-block h-2 w-2 rounded-full', statusDotClass(usagePercent(phaseView.material.budget, phaseView.material.execution)))} />
                                                                            </div>
                                                                        </summary>
                                                                        <div className="px-5 py-2">
                                                                            {!phaseView.material.units.length ? (
                                                                                <p className="text-[11px] text-slate-500">등록된 유닛 데이터가 없습니다.</p>
                                                                            ) : (
                                                                                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                                                                                    <thead className="bg-slate-50 text-slate-500">
                                                                                        <tr>
                                                                                            <th className="px-3 py-2 text-left">유닛</th>
                                                                                            <th className="px-3 py-2 text-right">예산</th>
                                                                                            <th className="px-3 py-2 text-right">집행</th>
                                                                                            <th className="px-3 py-2 text-right">상태</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-slate-100">
                                                                                        {phaseView.material.units.map((unit) => {
                                                                                            const percent = usagePercent(unit.budgetAmount, unit.executionAmount);
                                                                                            return (
                                                                                                <tr key={`${equipment.name}-${phase}-${unit.unitName}`}>
                                                                                                    <td className="px-3 py-2 text-slate-700">{unit.unitName}</td>
                                                                                                    <td className="px-3 py-2 text-right text-slate-700">{formatAmount(unit.budgetAmount)}</td>
                                                                                                    <td className="px-3 py-2 text-right text-slate-500">{formatAmount(unit.executionAmount)}</td>
                                                                                                    <td className="px-3 py-2 text-right"><span className={cn('inline-block h-2 w-2 rounded-full', statusDotClass(percent))} /></td>
                                                                                                </tr>
                                                                                            );
                                                                                        })}
                                                                                    </tbody>
                                                                                </table>
                                                                            )}
                                                                        </div>
                                                                    </details>
                                                                )}

                                                                {selectedCostTypes.includes('labor') && (
                                                                    <details className="group/type" open>
                                                                        <summary className="grid grid-cols-12 gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 rounded">
                                                                            <div className="col-span-5 flex items-center gap-2">
                                                                                <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open/type:rotate-180" />
                                                                                <span className="text-xs font-semibold text-slate-700">인건비</span>
                                                                            </div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.labor.budget)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.labor.execution)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.labor.remaining)}</div>
                                                                            <div className="col-span-1 flex justify-center">
                                                                                <span className={cn('inline-block h-2 w-2 rounded-full', statusDotClass(usagePercent(phaseView.labor.budget, phaseView.labor.execution)))} />
                                                                            </div>
                                                                        </summary>
                                                                        <div className="px-5 py-2 space-y-2">
                                                                            {SOURCE_TYPES.filter((source) => selectedSources.includes(source)).map((source) => {
                                                                                const sourceBlock = phaseView.labor.bySource[source];
                                                                                return (
                                                                                    <div key={`${equipment.name}-${phase}-labor-${source}`} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                                                                                        <div className="mb-1 flex items-center justify-between">
                                                                                            <p className="text-[11px] font-semibold text-slate-700">{source} 인건비</p>
                                                                                            <p className="text-[11px] text-slate-600">{formatAmount(sourceBlock.budget)} / {formatAmount(sourceBlock.execution)}</p>
                                                                                        </div>
                                                                                        {!sourceBlock.rows.length ? (
                                                                                            <p className="text-[11px] text-slate-500">항목 없음</p>
                                                                                        ) : (
                                                                                            <div className="space-y-1">
                                                                                                {sourceBlock.rows.map((row) => (
                                                                                                    <div key={`${equipment.name}-${phase}-labor-${source}-${row.name}`} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-[11px]">
                                                                                                        <span className="truncate text-slate-700">{row.name}</span>
                                                                                                        <span className="shrink-0 text-slate-600">{formatAmount(row.budgetAmount)} / {formatAmount(row.executionAmount)}</span>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </details>
                                                                )}

                                                                {selectedCostTypes.includes('expense') && (
                                                                    <details className="group/type" open>
                                                                        <summary className="grid grid-cols-12 gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 rounded">
                                                                            <div className="col-span-5 flex items-center gap-2">
                                                                                <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open/type:rotate-180" />
                                                                                <span className="text-xs font-semibold text-slate-700">경비</span>
                                                                            </div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.expense.budget)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.expense.execution)}</div>
                                                                            <div className="col-span-2 text-right text-xs text-slate-600">{formatAmount(phaseView.expense.remaining)}</div>
                                                                            <div className="col-span-1 flex justify-center">
                                                                                <span className={cn('inline-block h-2 w-2 rounded-full', statusDotClass(usagePercent(phaseView.expense.budget, phaseView.expense.execution)))} />
                                                                            </div>
                                                                        </summary>
                                                                        <div className="px-5 py-2 space-y-2">
                                                                            {SOURCE_TYPES.filter((source) => selectedSources.includes(source)).map((source) => {
                                                                                const sourceBlock = phaseView.expense.bySource[source];
                                                                                return (
                                                                                    <div key={`${equipment.name}-${phase}-expense-${source}`} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                                                                                        <div className="mb-1 flex items-center justify-between">
                                                                                            <p className="text-[11px] font-semibold text-slate-700">{source} 경비</p>
                                                                                            <p className="text-[11px] text-slate-600">{formatAmount(sourceBlock.budget)} / {formatAmount(sourceBlock.execution)}</p>
                                                                                        </div>
                                                                                        {!sourceBlock.rows.length ? (
                                                                                            <p className="text-[11px] text-slate-500">항목 없음</p>
                                                                                        ) : (
                                                                                            <div className="space-y-1">
                                                                                                {sourceBlock.rows.map((row) => (
                                                                                                    <div key={`${equipment.name}-${phase}-expense-${source}-${row.name}`} className="rounded border border-slate-100 bg-white px-2 py-1 text-[11px]">
                                                                                                        <div className="flex items-center justify-between gap-2">
                                                                                                            <span className="truncate text-slate-700">{row.name}</span>
                                                                                                            <span className="shrink-0 text-slate-600">{formatAmount(row.budgetAmount)} / {formatAmount(row.executionAmount)}</span>
                                                                                                        </div>
                                                                                                        {row.basis && <p className="mt-0.5 truncate text-[10px] text-slate-500">기준: {row.basis}</p>}
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </details>
                                                                )}
                                                            </div>
                                                        </details>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

const SummaryCard = ({ icon: Icon, title, value, subText, tone = 'default' }) => {
    const toneClass = tone === 'primary'
        ? 'bg-primary text-white border-primary'
        : tone === 'warning'
            ? 'bg-orange-50 border-orange-200 text-slate-900'
            : 'bg-white border-slate-200 text-slate-900';

    const subToneClass = tone === 'primary' ? 'text-white/85' : 'text-slate-500';

    return (
        <article className={cn('rounded-xl border p-4 shadow-sm', toneClass)}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{title}</p>
                <Icon className="h-4 w-4" />
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
            <p className={cn('mt-2 text-xs font-medium', subToneClass)}>{subText}</p>
        </article>
    );
};

const MiniMetric = ({ label, value, icon: Icon }) => (
    <div className="rounded-md bg-white/70 px-2 py-1.5 border border-white/50">
        <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
            <Icon className="h-3 w-3" />
            {label}
        </p>
        <p className="mt-0.5 text-xs font-bold text-slate-700">{value}</p>
    </div>
);

export default BudgetProjectBudget;
