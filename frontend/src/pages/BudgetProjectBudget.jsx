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
import {
    BUDGET_CLONE_EXPENSE_CONTENT,
    BUDGET_CLONE_LABOR_CONTENT,
    BUDGET_CLONE_MATERIAL_CONTENT,
    BUDGET_CLONE_SUMMARY_CONTENT,
} from './budgetCloneTemplates';

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
    { key: 'summary', label: 'Summary Overview', icon: BarChart3 },
    { key: 'material', label: 'Material Budget', icon: Boxes },
    { key: 'labor', label: 'Labor Cost', icon: Users },
    { key: 'expense', label: 'Expenses', icon: Receipt },
];

const BUDGET_TAB_CONTENT = {
    summary: BUDGET_CLONE_SUMMARY_CONTENT,
    material: BUDGET_CLONE_MATERIAL_CONTENT,
    labor: BUDGET_CLONE_LABOR_CONTENT,
    expense: BUDGET_CLONE_EXPENSE_CONTENT,
};

const BUDGET_CLONE_CUSTOM_CSS = `
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
.budget-clone-content .bg-surface-light {
    background-color: #ffffff;
}
.budget-clone-content .bg-background-light {
    background-color: #f3f4f6;
}
.budget-clone-content .bg-subtotal-light {
    background-color: #e0f2fe;
}
.budget-clone-content .bg-total-light {
    background-color: #1e3a8a;
}
.budget-clone-content .bg-navy-header {
    background-color: #1e3a8a;
}
.budget-clone-content .bg-emerald-header {
    background-color: #047857;
}
.budget-clone-content .bg-deep-navy {
    background-color: #0f172a;
}
.budget-clone-content .text-gold-accent {
    color: #fbbf24;
}
.budget-clone-content .shadow-soft-blue {
    box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.1), 0 2px 4px -1px rgba(14, 165, 233, 0.06);
}
.budget-clone-content .shadow-card {
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12), 0 1px 2px rgba(15, 23, 42, 0.08);
}
.budget-clone-content table {
    width: 100%;
}
`;
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

function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    const [detailSearchQuery, setDetailSearchQuery] = useState('');
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
    const activeTabContentHtml = BUDGET_TAB_CONTENT[activeBudgetTab] || BUDGET_CLONE_SUMMARY_CONTENT;
    const totalBudget = toNumber(summaryView.total.budget);
    const totalExecution = toNumber(summaryView.total.execution);
    const totalRemaining = toNumber(summaryView.total.remaining);
    const totalExecutionPercent = usagePercent(totalBudget, totalExecution);
    const initialCap = Math.round(totalBudget * 0.94);
    const initialCapDeltaPercent = initialCap > 0 ? ((totalBudget - initialCap) / initialCap) * 100 : 0;
    const remainingPercent = totalBudget > 0 ? Math.max(0, (totalRemaining / totalBudget) * 100) : 0;
    const isOverBudget = totalRemaining < 0;

    const allPhaseSelected = selectedPhases.length === PHASES.length;
    const allCostTypeSelected = selectedCostTypes.length === COST_TYPES.length;
    const allSourceSelected = selectedSources.length === SOURCE_TYPES.length;
    const allEquipmentSelected = selectedEquipments.length > 0
        && selectedEquipments.length === dashboard.equipmentSummaries.length;
    const shouldForceExpandBySearch = detailSearchQuery.trim().length > 0;

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

    const handleSelectAllFilters = () => {
        setSelectedPhases([...PHASES]);
        setSelectedCostTypes([...COST_TYPES]);
        setSelectedSources([...SOURCE_TYPES]);
        setSelectedEquipments(dashboard.equipmentSummaries.map((item) => item.name));
    };

    const handleClearAllFilters = () => {
        setSelectedPhases([]);
        setSelectedCostTypes([]);
        setSelectedSources([]);
        setSelectedEquipments([]);
    };

    const renderHighlightedText = (text) => {
        const source = String(text ?? '');
        const keyword = detailSearchQuery.trim();
        if (!keyword) return source;
        const escaped = escapeRegExp(keyword);
        const regex = new RegExp(`(${escaped})`, 'ig');
        const tokens = source.split(regex);
        const keywordLower = keyword.toLowerCase();
        return tokens.map((token, index) => (
            token.toLowerCase() === keywordLower
                ? <mark key={`${source}-${index}`} className="rounded bg-yellow-200 px-0.5 text-inherit">{token}</mark>
                : <React.Fragment key={`${source}-${index}`}>{token}</React.Fragment>
        ));
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
                <style>{BUDGET_CLONE_CUSTOM_CSS}</style>

                <section className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                            Phased Integrated Cost Breakdown Dashboard
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Consolidated Financial Review (Unit: KRW)
                        </p>
                    </div>
                    <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
                    >
                        <Calculator className="h-4 w-4" />
                        Export PDF
                    </button>
                </section>

                <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <article className="relative overflow-hidden rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-primary" />
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Total Project Budget</p>
                                <h3 className="mt-2 text-3xl font-bold text-slate-900">{formatWon(totalBudget)}</h3>
                                <p className="mt-1 text-xs text-slate-400">Material + Labor + Expenses</p>
                            </div>
                            <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
                                <Wallet className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-slate-500">
                            <span className="mr-2 font-medium text-slate-600">Initial Cap: {formatWon(initialCap)}</span>
                            <span>({formatPercent(initialCapDeltaPercent)} Adjust)</span>
                        </div>
                    </article>

                    <article className="relative overflow-hidden rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-rose-500" />
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Total Expenditure</p>
                                <h3 className="mt-2 text-3xl font-bold text-slate-900">{formatWon(totalExecution)}</h3>
                                <p className="mt-1 text-xs text-slate-400">Actual Spent to Date</p>
                            </div>
                            <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
                                <BarChart3 className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-slate-500">
                            <div className="mr-2 h-2 w-full rounded-full bg-slate-200">
                                <div className="h-2 rounded-full bg-rose-500" style={{ width: `${Math.min(totalExecutionPercent, 100)}%` }} />
                            </div>
                            <span className="whitespace-nowrap font-semibold">{totalExecutionPercent.toFixed(1)}%</span>
                        </div>
                    </article>

                    <article className="relative overflow-hidden rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
                        <div className="absolute right-0 top-0 h-full w-1 bg-emerald-500" />
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Total Variance (Remaining)</p>
                                <h3 className="mt-2 text-3xl font-bold text-slate-900">{formatWon(totalRemaining)}</h3>
                                <p className="mt-1 text-xs text-slate-400">Available Funds</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
                                <Scale className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center text-sm text-slate-500">
                            <span
                                className={cn(
                                    'rounded px-2 py-0.5 text-xs font-semibold',
                                    isOverBudget ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                                )}
                            >
                                {isOverBudget ? 'Over Budget' : 'On Budget'}
                            </span>
                            <span className="ml-2">{remainingPercent.toFixed(1)}% Remaining</span>
                        </div>
                    </article>
                </section>

                <nav className="mb-6 rounded-xl border border-gray-200 bg-white px-6 shadow-sm">
                    <div className="scrollbar-hide flex gap-10 overflow-x-auto">
                        {BUDGET_TAB_ITEMS.map((tab) => {
                            const isActive = activeBudgetTab === tab.key;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveBudgetTab(tab.key)}
                                    className={cn(
                                        'inline-flex items-center gap-2 whitespace-nowrap border-b-2 py-4 text-sm transition-all',
                                        isActive
                                            ? 'border-primary font-bold text-primary'
                                            : 'border-transparent font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                    )}
                                >
                                    <Icon className="h-[19px] w-[19px]" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </nav>

                <section
                    className="budget-clone-content"
                    dangerouslySetInnerHTML={{ __html: activeTabContentHtml }}
                />
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
