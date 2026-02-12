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
    Scale,
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

const BUDGET_TAB_ITEMS = [
    { key: 'summary', label: '통합 요약', icon: BarChart3 },
    { key: 'material', label: '재료비', icon: Boxes },
    { key: 'labor', label: '인건비', icon: Users },
    { key: 'expense', label: '경비', icon: Receipt },
];
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

function formatWon(value) {
    const amount = Math.round(toNumber(value));
    return `₩ ${amount.toLocaleString('ko-KR')}`;
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

function includesKeyword(value, keyword) {
    if (!keyword) return true;
    return String(value || '').toLowerCase().includes(keyword);
}

function matchAnyKeyword(keyword, values = []) {
    if (!keyword) return true;
    return values.some((value) => includesKeyword(value, keyword));
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

function buildBudgetViewModel({
    equipmentSummaries = [],
    selectedPhases = [],
    selectedCostTypes = [],
    selectedSources = [],
    selectedEquipments = [],
    searchKeyword = '',
}) {
    const phaseSet = new Set(selectedPhases);
    const costTypeSet = new Set(selectedCostTypes);
    const sourceSet = new Set(selectedSources);
    const equipmentSet = new Set(selectedEquipments);
    const keyword = String(searchKeyword || '').trim().toLowerCase();
    const hasKeyword = keyword.length > 0;

    const items = (equipmentSummaries || [])
        .filter((equipment) => equipmentSet.has(equipment.name))
        .map((equipment) => {
            const equipmentLabelMatch = matchAnyKeyword(keyword, [equipment.name]);
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
                const phaseLabel = `${PHASE_LABEL[phase]} 단계`;
                const phaseLabelMatch = matchAnyKeyword(keyword, [phaseLabel]);

                const materialEnabled = costTypeSet.has('material');
                const laborEnabled = costTypeSet.has('labor');
                const expenseEnabled = costTypeSet.has('expense');

                const baseMaterialRows = materialEnabled ? phaseData.material.units : [];
                const matchedMaterialRows = hasKeyword
                    ? baseMaterialRows.filter((unit) => matchAnyKeyword(keyword, [
                        unit.unitName,
                        unit.partCount,
                        unit.quantityTotal,
                        formatAmount(unit.budgetAmount),
                        formatAmount(unit.executionAmount),
                    ]))
                    : baseMaterialRows;
                const materialLabelMatch = hasKeyword && (equipmentLabelMatch || phaseLabelMatch || includesKeyword(COST_TYPE_LABEL.material, keyword));
                const materialRows = !hasKeyword
                    ? baseMaterialRows
                    : (matchedMaterialRows.length > 0 ? matchedMaterialRows : (materialLabelMatch ? baseMaterialRows : []));

                const materialBudget = materialRows.reduce((sum, row) => sum + toNumber(row.budgetAmount), 0);
                const materialExecution = materialRows.reduce((sum, row) => sum + toNumber(row.executionAmount), 0);
                const material = {
                    units: materialRows,
                    budget: materialBudget,
                    execution: materialExecution,
                    remaining: materialBudget - materialExecution,
                    isVisible: materialEnabled && (!hasKeyword || matchedMaterialRows.length > 0 || materialLabelMatch),
                };

                const laborBySource = {};
                let laborBudget = 0;
                let laborExecution = 0;
                SOURCE_TYPES.forEach((source) => {
                    if (!sourceSet.has(source)) return;
                    const baseRows = phaseData.labor.byStaffing[source] || [];
                    const matchedRows = hasKeyword
                        ? baseRows.filter((row) => matchAnyKeyword(keyword, [
                            row.name,
                            source,
                            COST_TYPE_LABEL.labor,
                            formatAmount(row.budgetAmount),
                            formatAmount(row.executionAmount),
                        ]))
                        : baseRows;
                    const sourceLabelMatch = hasKeyword && matchAnyKeyword(keyword, [source, `${source} 인건비`, COST_TYPE_LABEL.labor, phaseLabel, equipment.name]);
                    const rows = !hasKeyword
                        ? baseRows
                        : (matchedRows.length > 0 ? matchedRows : (sourceLabelMatch ? baseRows : []));
                    const sums = sumAmountRows(rows);
                    laborBySource[source] = {
                        rows,
                        budget: sums.budget,
                        execution: sums.execution,
                        remaining: sums.budget - sums.execution,
                        isVisible: !hasKeyword || matchedRows.length > 0 || sourceLabelMatch,
                    };
                    if (laborBySource[source].isVisible) {
                        laborBudget += sums.budget;
                        laborExecution += sums.execution;
                    }
                });

                const laborSources = Object.values(laborBySource).filter((item) => item.isVisible);
                const labor = {
                    bySource: laborBySource,
                    budget: laborBudget,
                    execution: laborExecution,
                    remaining: laborBudget - laborExecution,
                    isVisible: laborEnabled && laborSources.length > 0,
                };

                const expenseBySource = {};
                let expenseBudget = 0;
                let expenseExecution = 0;
                SOURCE_TYPES.forEach((source) => {
                    if (!sourceSet.has(source)) return;
                    const baseRows = phaseData.expense.byType[source] || [];
                    const matchedRows = hasKeyword
                        ? baseRows.filter((row) => matchAnyKeyword(keyword, [
                            row.name,
                            row.basis,
                            source,
                            COST_TYPE_LABEL.expense,
                            formatAmount(row.budgetAmount),
                            formatAmount(row.executionAmount),
                        ]))
                        : baseRows;
                    const sourceLabelMatch = hasKeyword && matchAnyKeyword(keyword, [source, `${source} 경비`, COST_TYPE_LABEL.expense, phaseLabel, equipment.name]);
                    const rows = !hasKeyword
                        ? baseRows
                        : (matchedRows.length > 0 ? matchedRows : (sourceLabelMatch ? baseRows : []));
                    const sums = sumAmountRows(rows);
                    expenseBySource[source] = {
                        rows,
                        budget: sums.budget,
                        execution: sums.execution,
                        remaining: sums.budget - sums.execution,
                        isVisible: !hasKeyword || matchedRows.length > 0 || sourceLabelMatch,
                    };
                    if (expenseBySource[source].isVisible) {
                        expenseBudget += sums.budget;
                        expenseExecution += sums.execution;
                    }
                });

                const expenseSources = Object.values(expenseBySource).filter((item) => item.isVisible);
                const expense = {
                    bySource: expenseBySource,
                    budget: expenseBudget,
                    execution: expenseExecution,
                    remaining: expenseBudget - expenseExecution,
                    isVisible: expenseEnabled && expenseSources.length > 0,
                };

                const visibleCosts = [material.isVisible, labor.isVisible, expense.isVisible].filter(Boolean).length;
                if (visibleCosts === 0) return;

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
            if (Object.keys(phases).length === 0) return null;
            return {
                name: equipment.name,
                phases,
                totals,
            };
        })
        .filter(Boolean);

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

    return { items, summary };
}

function getBudgetStatusMeta(budget, execution) {
    const safeBudget = toNumber(budget);
    const safeExecution = toNumber(execution);
    const remaining = safeBudget - safeExecution;
    const percent = usagePercent(safeBudget, safeExecution);
    if (remaining < 0 || percent >= 100) {
        return { label: '초과', className: 'bg-rose-100 text-rose-700 border-rose-200' };
    }
    if (percent >= 80) {
        return { label: '주의', className: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { label: '정상', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
}

function buildSummaryRows(items) {
    const rows = [];
    (items || []).forEach((equipment) => {
        rows.push({
            key: `${equipment.name}-total`,
            kind: 'equipment',
            label: equipment.name,
            budget: toNumber(equipment.totals?.total?.budget),
            execution: toNumber(equipment.totals?.total?.execution),
        });
        PHASES.forEach((phase) => {
            const phaseData = equipment.phases?.[phase];
            if (!phaseData) return;
            rows.push({
                key: `${equipment.name}-${phase}`,
                kind: 'phase',
                label: `${PHASE_LABEL[phase]} 단계`,
                budget: toNumber(phaseData.total?.budget),
                execution: toNumber(phaseData.total?.execution),
            });
        });
    });
    return rows;
}

function buildMaterialRows(items) {
    const rows = [];
    (items || []).forEach((equipment) => {
        PHASES.forEach((phase) => {
            const phaseView = equipment.phases?.[phase];
            if (!phaseView?.material?.isVisible) return;
            (phaseView.material.units || []).forEach((unit) => {
                const quantity = toNumber(unit.quantityTotal);
                const budget = toNumber(unit.budgetAmount);
                const execution = toNumber(unit.executionAmount);
                rows.push({
                    key: `${equipment.name}-${phase}-material-${unit.unitName}`,
                    phase,
                    equipmentName: equipment.name,
                    unitName: unit.unitName,
                    partCount: toNumber(unit.partCount),
                    quantity,
                    unitCost: quantity > 0 ? budget / quantity : 0,
                    budget,
                    execution,
                    remaining: budget - execution,
                });
            });
        });
    });
    return rows;
}

function buildLaborRows(items) {
    const rows = [];
    (items || []).forEach((equipment) => {
        PHASES.forEach((phase) => {
            const phaseView = equipment.phases?.[phase];
            if (!phaseView?.labor?.isVisible) return;
            SOURCE_TYPES.forEach((source) => {
                const sourceBlock = phaseView.labor.bySource?.[source];
                if (!sourceBlock?.isVisible) return;
                (sourceBlock.rows || []).forEach((row) => {
                    const budget = toNumber(row.budgetAmount);
                    const execution = toNumber(row.executionAmount);
                    rows.push({
                        key: `${equipment.name}-${phase}-labor-${source}-${row.name}`,
                        phase,
                        equipmentName: equipment.name,
                        source,
                        taskName: row.name,
                        budget,
                        execution,
                        remaining: budget - execution,
                    });
                });
            });
        });
    });
    return rows;
}

function buildExpenseRows(items) {
    const rows = [];
    (items || []).forEach((equipment) => {
        PHASES.forEach((phase) => {
            const phaseView = equipment.phases?.[phase];
            if (!phaseView?.expense?.isVisible) return;
            SOURCE_TYPES.forEach((source) => {
                const sourceBlock = phaseView.expense.bySource?.[source];
                if (!sourceBlock?.isVisible) return;
                (sourceBlock.rows || []).forEach((row) => {
                    const budget = toNumber(row.budgetAmount);
                    const execution = toNumber(row.executionAmount);
                    rows.push({
                        key: `${equipment.name}-${phase}-expense-${source}-${row.name}`,
                        phase,
                        equipmentName: equipment.name,
                        source,
                        expenseName: row.name,
                        basis: row.basis || '',
                        budget,
                        execution,
                        remaining: budget - execution,
                    });
                });
            });
        });
    });
    return rows;
}

const BudgetProjectBudget = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [project, setProject] = useState(null);
    const [, setVersion] = useState(null);
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

    const detailSearchQuery = '';
    const [selectedPhases, setSelectedPhases] = useState([...PHASES]);
    const [selectedCostTypes, setSelectedCostTypes] = useState([...COST_TYPES]);
    const [selectedSources, setSelectedSources] = useState([...SOURCE_TYPES]);
    const [selectedEquipments, setSelectedEquipments] = useState([]);
    const [isTotalFixed, setIsTotalFixed] = useState(false);
    const [isTreeExpanded, setIsTreeExpanded] = useState(true);
    const [activeBudgetTab, setActiveBudgetTab] = useState('summary');

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

    const viewModel = useMemo(() => {
        return buildBudgetViewModel({
            equipmentSummaries: dashboard.equipmentSummaries,
            selectedPhases,
            selectedCostTypes,
            selectedSources,
            selectedEquipments,
            searchKeyword: detailSearchQuery,
        });
    }, [
        dashboard.equipmentSummaries,
        selectedPhases,
        selectedCostTypes,
        selectedSources,
        selectedEquipments,
        detailSearchQuery,
    ]);

    const fixedSummaryViewModel = useMemo(() => {
        return buildBudgetViewModel({
            equipmentSummaries: dashboard.equipmentSummaries,
            selectedPhases: [...PHASES],
            selectedCostTypes: [...COST_TYPES],
            selectedSources: [...SOURCE_TYPES],
            selectedEquipments: dashboard.equipmentSummaries.map((item) => item.name),
            searchKeyword: '',
        });
    }, [dashboard.equipmentSummaries]);

    const summaryView = isTotalFixed ? fixedSummaryViewModel.summary : viewModel.summary;
    const totalBudget = toNumber(summaryView.total.budget);
    const totalExecution = toNumber(summaryView.total.execution);
    const totalRemaining = toNumber(summaryView.total.remaining);
    const totalExecutionPercent = usagePercent(totalBudget, totalExecution);
    const initialCap = Math.round(totalBudget * 0.94);
    const initialCapDeltaPercent = initialCap > 0 ? ((totalBudget - initialCap) / initialCap) * 100 : 0;
    const remainingPercent = totalBudget > 0 ? Math.max(0, (totalRemaining / totalBudget) * 100) : 0;
    const isOverBudget = totalRemaining < 0;
    const summaryRows = useMemo(() => buildSummaryRows(viewModel.items), [viewModel.items]);
    const materialRows = useMemo(() => buildMaterialRows(viewModel.items), [viewModel.items]);
    const laborRows = useMemo(() => buildLaborRows(viewModel.items), [viewModel.items]);
    const expenseRows = useMemo(() => buildExpenseRows(viewModel.items), [viewModel.items]);

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

                <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-primary" />
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-slate-600">총 예산</p>
                                <h3 className="mt-1 text-2xl font-bold leading-none text-slate-900">{formatWon(totalBudget)}</h3>
                            </div>
                            <div className="rounded-md bg-blue-50 p-2 text-blue-600">
                                <Wallet className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-center text-[11px] text-slate-500">
                            <span className="mr-1.5 font-medium text-slate-600">초기 {formatWon(initialCap)}</span>
                            <span>(조정 {formatPercent(initialCapDeltaPercent)})</span>
                        </div>
                    </article>

                    <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-rose-500" />
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-slate-600">총 집행</p>
                                <h3 className="mt-1 text-2xl font-bold leading-none text-slate-900">{formatWon(totalExecution)}</h3>
                            </div>
                            <div className="rounded-md bg-rose-50 p-2 text-rose-600">
                                <BarChart3 className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-center text-[11px] text-slate-500">
                            <div className="mr-2 h-2 w-full rounded-full bg-slate-200">
                                <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.min(totalExecutionPercent, 100)}%` }} />
                            </div>
                            <span className="whitespace-nowrap font-semibold">{totalExecutionPercent.toFixed(1)}%</span>
                        </div>
                    </article>

                    <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-emerald-500" />
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-slate-600">총 잔액</p>
                                <h3 className="mt-1 text-2xl font-bold leading-none text-slate-900">{formatWon(totalRemaining)}</h3>
                            </div>
                            <div className="rounded-md bg-emerald-50 p-2 text-emerald-600">
                                <Scale className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="mt-2 flex items-center text-[11px] text-slate-500">
                            <span
                                className={cn(
                                    'rounded px-2 py-0.5 text-xs font-semibold',
                                    isOverBudget ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                )}
                            >
                                {isOverBudget ? '예산 초과' : '예산 정상'}
                            </span>
                            <span className="ml-2">잔여율 {remainingPercent.toFixed(1)}%</span>
                        </div>
                    </article>
                </section>

                <nav className="mb-6 rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="scrollbar-hide flex flex-1 gap-10 overflow-x-auto">
                            {BUDGET_TAB_ITEMS.map((tab) => {
                                const isActive = activeBudgetTab === tab.key;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveBudgetTab(tab.key)}
                                        className={cn(
                                            'inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-4 text-sm transition-all focus-visible:outline-none',
                                            isActive
                                                ? 'border-primary font-bold text-primary'
                                                : 'border-transparent font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                        )}
                                    >
                                        <Icon className="h-[19px] w-[19px]" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                        >
                            <Calculator className="h-3.5 w-3.5" />
                            보고서 내보내기
                        </button>
                    </div>
                </nav>

                {activeBudgetTab === 'summary' && (
                    <SummaryTabContent
                        summaryView={summaryView}
                        summaryRows={summaryRows}
                    />
                )}

                {activeBudgetTab === 'material' && (
                    <MaterialTabContent rows={materialRows} />
                )}

                {activeBudgetTab === 'labor' && (
                    <LaborTabContent rows={laborRows} />
                )}

                {activeBudgetTab === 'expense' && (
                    <ExpenseTabContent rows={expenseRows} />
                )}
            </main>
        </div>
    );
};

const BudgetStatusBadge = ({ budget, execution }) => {
    const meta = getBudgetStatusMeta(budget, execution);
    return (
        <span className={cn('inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold', meta.className)}>
            {meta.label}
        </span>
    );
};

const SummaryTabContent = ({ summaryView, summaryRows }) => {
    const metricCards = [
        { key: 'material', label: '재료비', accent: 'bg-blue-500' },
        { key: 'labor', label: '인건비', accent: 'bg-violet-500' },
        { key: 'expense', label: '경비', accent: 'bg-amber-500' },
    ];

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {metricCards.map((card) => {
                    const data = summaryView[card.key];
                    const percent = usagePercent(data.budget, data.execution);
                    return (
                        <article key={card.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-900">{card.label}</h3>
                                <span className={cn('h-2.5 w-2.5 rounded-full', card.accent)} />
                            </div>
                            <div className="space-y-1 text-sm">
                                <p className="font-semibold text-slate-800">예산 {formatWon(data.budget)}</p>
                                <p className="text-slate-700">집행 {formatWon(data.execution)}</p>
                                <p className={cn('font-semibold', toNumber(data.remaining) < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                    잔액 {formatWon(data.remaining)}
                                </p>
                            </div>
                            <div className="mt-3">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div
                                        className={cn('h-full', usageBarClass(percent))}
                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-right text-xs font-semibold text-slate-600">{percent.toFixed(1)}%</p>
                            </div>
                        </article>
                    );
                })}
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3">
                    <h3 className="text-sm font-bold text-white">통합 예산 상세</h3>
                    <span className="text-xs font-semibold text-slate-200">설비/단계별 실제 집계</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-700">
                            <tr>
                                <th className="px-4 py-3 text-left">구분</th>
                                <th className="px-4 py-3 text-right">예산</th>
                                <th className="px-4 py-3 text-right">집행</th>
                                <th className="px-4 py-3 text-right">잔액</th>
                                <th className="px-4 py-3 text-center">상태</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {summaryRows.map((row) => {
                                const remaining = toNumber(row.budget) - toNumber(row.execution);
                                return (
                                    <tr key={row.key} className={cn(row.kind === 'equipment' ? 'bg-slate-50 font-semibold text-slate-900' : 'bg-white text-slate-800')}>
                                        <td className="px-4 py-3">
                                            <span className={cn(row.kind === 'phase' && 'pl-4 text-slate-700')}>{row.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
                                        <td className="px-4 py-3 text-right">{formatWon(row.execution)}</td>
                                        <td className={cn('px-4 py-3 text-right font-semibold', remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                            {formatWon(remaining)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-900 text-white">
                                <td className="px-4 py-3 text-left text-sm font-bold">전체 합계</td>
                                <td className="px-4 py-3 text-right font-bold">{formatWon(summaryView.total.budget)}</td>
                                <td className="px-4 py-3 text-right font-bold">{formatWon(summaryView.total.execution)}</td>
                                <td className="px-4 py-3 text-right font-bold">{formatWon(summaryView.total.remaining)}</td>
                                <td className="px-4 py-3 text-center">
                                    <BudgetStatusBadge budget={summaryView.total.budget} execution={summaryView.total.execution} />
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>
        </div>
    );
};

const MaterialTabContent = ({ rows }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3">
            <h3 className="text-sm font-bold text-white">재료비 상세</h3>
            <span className="text-xs font-semibold text-slate-200">실제 프로젝트 데이터</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <tr>
                        <th className="px-4 py-3 text-left">단계</th>
                        <th className="px-4 py-3 text-left">설비</th>
                        <th className="px-4 py-3 text-left">유닛</th>
                        <th className="px-4 py-3 text-right">파트수</th>
                        <th className="px-4 py-3 text-right">수량</th>
                        <th className="px-4 py-3 text-right">단가</th>
                        <th className="px-4 py-3 text-right">예산</th>
                        <th className="px-4 py-3 text-right">집행</th>
                        <th className="px-4 py-3 text-right">잔액</th>
                        <th className="px-4 py-3 text-center">상태</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                    {rows.length === 0 && (
                        <tr>
                            <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={10}>
                                표시할 재료비 데이터가 없습니다.
                            </td>
                        </tr>
                    )}
                    {rows.map((row, index) => (
                        <tr key={row.key} className={cn(index % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                            <td className="px-4 py-3 font-semibold text-slate-700">{PHASE_LABEL[row.phase]}</td>
                            <td className="px-4 py-3 font-semibold">{row.equipmentName}</td>
                            <td className="px-4 py-3">{row.unitName}</td>
                            <td className="px-4 py-3 text-right">{row.partCount.toLocaleString('ko-KR')}</td>
                            <td className="px-4 py-3 text-right">{row.quantity.toLocaleString('ko-KR')}</td>
                            <td className="px-4 py-3 text-right">{formatWon(row.unitCost)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
                            <td className="px-4 py-3 text-right">{formatWon(row.execution)}</td>
                            <td className={cn('px-4 py-3 text-right font-semibold', row.remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                {formatWon(row.remaining)}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

const LaborTabContent = ({ rows }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3">
            <h3 className="text-sm font-bold text-white">인건비 상세</h3>
            <span className="text-xs font-semibold text-slate-200">실제 프로젝트 데이터</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <tr>
                        <th className="px-4 py-3 text-left">단계</th>
                        <th className="px-4 py-3 text-left">설비</th>
                        <th className="px-4 py-3 text-left">구분</th>
                        <th className="px-4 py-3 text-left">업무/부서</th>
                        <th className="px-4 py-3 text-right">예산</th>
                        <th className="px-4 py-3 text-right">집행</th>
                        <th className="px-4 py-3 text-right">잔액</th>
                        <th className="px-4 py-3 text-center">상태</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                    {rows.length === 0 && (
                        <tr>
                            <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={8}>
                                표시할 인건비 데이터가 없습니다.
                            </td>
                        </tr>
                    )}
                    {rows.map((row, index) => (
                        <tr key={row.key} className={cn(index % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                            <td className="px-4 py-3 font-semibold text-slate-700">{PHASE_LABEL[row.phase]}</td>
                            <td className="px-4 py-3 font-semibold">{row.equipmentName}</td>
                            <td className="px-4 py-3">{row.source}</td>
                            <td className="px-4 py-3">{row.taskName}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
                            <td className="px-4 py-3 text-right">{formatWon(row.execution)}</td>
                            <td className={cn('px-4 py-3 text-right font-semibold', row.remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                {formatWon(row.remaining)}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

const ExpenseTabContent = ({ rows }) => (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-3">
            <h3 className="text-sm font-bold text-white">경비 상세</h3>
            <span className="text-xs font-semibold text-slate-200">실제 프로젝트 데이터</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-700">
                    <tr>
                        <th className="px-4 py-3 text-left">단계</th>
                        <th className="px-4 py-3 text-left">설비</th>
                        <th className="px-4 py-3 text-left">구분</th>
                        <th className="px-4 py-3 text-left">경비 항목</th>
                        <th className="px-4 py-3 text-left">산정 기준</th>
                        <th className="px-4 py-3 text-right">예산</th>
                        <th className="px-4 py-3 text-right">집행</th>
                        <th className="px-4 py-3 text-right">잔액</th>
                        <th className="px-4 py-3 text-center">상태</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                    {rows.length === 0 && (
                        <tr>
                            <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={9}>
                                표시할 경비 데이터가 없습니다.
                            </td>
                        </tr>
                    )}
                    {rows.map((row, index) => (
                        <tr key={row.key} className={cn(index % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                            <td className="px-4 py-3 font-semibold text-slate-700">{PHASE_LABEL[row.phase]}</td>
                            <td className="px-4 py-3 font-semibold">{row.equipmentName}</td>
                            <td className="px-4 py-3">{row.source}</td>
                            <td className="px-4 py-3">{row.expenseName}</td>
                            <td className="px-4 py-3 text-slate-600">{row.basis || '-'}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
                            <td className="px-4 py-3 text-right">{formatWon(row.execution)}</td>
                            <td className={cn('px-4 py-3 text-right font-semibold', row.remaining < 0 ? 'text-rose-600' : 'text-emerald-700')}>
                                {formatWon(row.remaining)}
                            </td>
                            <td className="px-4 py-3 text-center">
                                <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

export default BudgetProjectBudget;
