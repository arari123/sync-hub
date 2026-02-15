import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    Boxes,
    Calculator,
    ChevronDown,
    ChevronRight,
    Loader2,
    Receipt,
    Scale,
    Users,
    Wallet,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { subscribeBudgetDataUpdated } from '../lib/budgetSync';
import { cn } from '../lib/utils';
import GlobalTopBar from '../components/GlobalTopBar';
import BudgetProjectEditor from './BudgetProjectEditor';

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
const BUDGET_TAB_KEYS = new Set(BUDGET_TAB_ITEMS.map((item) => item.key));
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

function normalizeStage(value) {
    const stage = String(value || '').trim().toLowerCase();
    if (stage === 'progress') return 'fabrication';
    if (stage === 'as' || stage === 'a/s') return 'warranty';
    if (stage === 'closed') return 'closure';
    return stage || 'review';
}

function resolveBudgetTabFromSearch(search) {
    const params = new URLSearchParams(search || '');
    const rawTab = String(params.get('tab') || '').trim().toLowerCase();
    if (!rawTab) return '';
    return BUDGET_TAB_KEYS.has(rawTab) ? rawTab : '';
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
            parts: new Map(),
        });
    }
    return map.get(unitName);
}

function ensureMaterialPartBucket(map, partName) {
    const normalizedPartName = String(partName || '').trim() || '미지정 파츠';
    if (!map.has(normalizedPartName)) {
        map.set(normalizedPartName, {
            partName: normalizedPartName,
            modelName: '',
            quantityTotal: 0,
            budgetAmount: 0,
            executionAmount: 0,
        });
    }
    return map.get(normalizedPartName);
}

function ensureNamedAmountBucket(map, key, fallbackLabel = '미지정 항목') {
    const normalizedKey = String(key || '').trim() || fallbackLabel;
    if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
            name: normalizedKey,
            quantityTotal: 0,
            budgetAmount: 0,
            executionAmount: 0,
            basis: '',
        });
    }
    return map.get(normalizedKey);
}

function collectEquipmentNames(projectType, equipments, details) {
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
    if (merged.length > 0) {
        return merged;
    }

    // Non-equipment project types (parts/as) may still carry equipment rows.
    // Fall back to a shared bucket only when we truly have no equipment names.
    if (projectType !== 'equipment') {
        return ['공통'];
    }

    return ['미지정 설비'];
}

function sortByAmountDesc(items, key = 'budgetAmount') {
    return [...(items || [])].sort((a, b) => {
        const diff = toNumber(b?.[key]) - toNumber(a?.[key]);
        if (diff !== 0) return diff;
        return String(a?.name || a?.unitName || a?.partName || '').localeCompare(String(b?.name || b?.unitName || b?.partName || ''), 'ko-KR');
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
    // When the equipment selection is empty, treat it as \"all selected\".
    // This prevents transient 0 totals during initial load / route transitions.
    const shouldFilterEquipment = equipmentSet.size > 0;
    const keyword = String(searchKeyword || '').trim().toLowerCase();
    const hasKeyword = keyword.length > 0;

    const items = (equipmentSummaries || [])
        .filter((equipment) => !shouldFilterEquipment || equipmentSet.has(equipment.name))
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
                        ...((unit.parts || []).map((part) => part.partName)),
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

function buildMaterialRows(items) {
    const rows = [];
    const formatPartDisplayName = (part) => {
        const partName = String(part?.partName || '').trim() || '미지정 파츠';
        const modelName = String(part?.modelName || '').trim();
        return modelName ? `${partName}(${modelName})` : partName;
    };
    (items || []).forEach((equipment) => {
        PHASES.forEach((phase) => {
            const phaseView = equipment.phases?.[phase];
            if (!phaseView?.material?.isVisible) return;
            (phaseView.material.units || []).forEach((unit) => {
                const unitCount = Math.max(1, toNumber(unit.unitCount) || 1);
                const quantity = unitCount;
                const budget = toNumber(unit.budgetAmount);
                const execution = toNumber(unit.executionAmount);
                const partRows = (unit.parts || []).map((part) => {
                    const partQuantityPerUnit = toNumber(part.quantityTotal);
                    const partBudget = toNumber(part.budgetAmount);
                    const partExecution = toNumber(part.executionAmount);
                    const partTotalQuantity = partQuantityPerUnit * unitCount;
                    return {
                        key: `${equipment.name}-${phase}-material-${unit.unitName}-part-${part.partName}`,
                        partName: part.partName,
                        modelName: part.modelName || '',
                        displayName: formatPartDisplayName(part),
                        quantity: partTotalQuantity,
                        unitCost: partTotalQuantity > 0 ? partBudget / partTotalQuantity : 0,
                        budget: partBudget,
                        execution: partExecution,
                    };
                });
                rows.push({
                    key: `${equipment.name}-${phase}-material-${unit.unitName}`,
                    phase,
                    equipmentName: equipment.name,
                    unitName: unit.unitName,
                    partCount: toNumber(unit.partCount),
                    unitCount,
                    quantity,
                    unitCost: unitCount > 0 ? budget / unitCount : 0,
                    budget,
                    execution,
                    remaining: budget - execution,
                    parts: partRows,
                });
            });
        });
    });
    return rows;
}

function buildMaterialExecutionRows(executionItems) {
    const unitMap = new Map();
    const formatPartDisplayName = (part) => {
        const partName = String(part?.partName || '').trim() || '미지정 파츠';
        const modelName = String(part?.modelName || '').trim();
        return modelName ? `${partName}(${modelName})` : partName;
    };

    (executionItems || []).forEach((row) => {
        if (!row) return;
        const equipmentName = normalizeEquipmentName(row?.equipment_name, '미지정 설비');
        const phase = normalizePhase(row?.phase);
        const unitName = String(row?.unit_name || row?.part_name || '미지정 유닛').trim() || '미지정 유닛';
        const partName = String(row?.part_name || '').trim() || '미지정 파츠';
        const modelName = String(row?.spec || '').trim();
        const execution = toNumber(row?.executed_amount);

        const unitKey = `${equipmentName}-${phase}-material-execution-${unitName}`;
        if (!unitMap.has(unitKey)) {
            unitMap.set(unitKey, {
                key: unitKey,
                phase,
                equipmentName,
                unitName,
                execution: 0,
                parts: new Map(),
            });
        }

        const unit = unitMap.get(unitKey);
        unit.execution += execution;

        const partKey = `${partName}-${modelName}`;
        if (!unit.parts.has(partKey)) {
            unit.parts.set(partKey, {
                key: `${unitKey}-part-${partKey}`,
                partName,
                modelName,
                displayName: formatPartDisplayName({ partName, modelName }),
                execution: 0,
            });
        }
        const part = unit.parts.get(partKey);
        part.execution += execution;
    });

    const rows = Array.from(unitMap.values())
        .map((unit) => {
            const parts = Array.from(unit.parts.values()).sort((a, b) => {
                const diff = toNumber(b.execution) - toNumber(a.execution);
                if (diff !== 0) return diff;
                return String(a.displayName).localeCompare(String(b.displayName), 'ko-KR');
            });
            return {
                ...unit,
                partCount: parts.length,
                parts,
            };
        })
        .sort((a, b) => {
            const phaseDiff = PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase);
            if (phaseDiff !== 0) return phaseDiff;
            const executionDiff = toNumber(b.execution) - toNumber(a.execution);
            if (executionDiff !== 0) return executionDiff;
            const equipmentDiff = String(a.equipmentName).localeCompare(String(b.equipmentName), 'ko-KR');
            if (equipmentDiff !== 0) return equipmentDiff;
            return String(a.unitName).localeCompare(String(b.unitName), 'ko-KR');
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
                    const quantity = toNumber(row.quantityTotal);
                    const executionQuantity = budget > 0 && execution > 0
                        ? (quantity * execution) / budget
                        : 0;
                    rows.push({
                        key: `${equipment.name}-${phase}-labor-${source}-${row.name}`,
                        phase,
                        equipmentName: equipment.name,
                        source,
                        taskName: row.name,
                        quantity,
                        executionQuantity,
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

function summarizeBudgetExecution(rows) {
    return (rows || []).reduce((acc, row) => {
        acc.budget += toNumber(row?.budget);
        acc.execution += toNumber(row?.execution);
        acc.quantity += toNumber(row?.quantity);
        acc.executionQuantity += toNumber(row?.executionQuantity);
        return acc;
    }, { budget: 0, execution: 0, quantity: 0, executionQuantity: 0 });
}

function buildRowsByPhase(rows) {
    return PHASES.map((phase) => {
        const phaseRows = (rows || []).filter((row) => row.phase === phase);
        const totals = summarizeBudgetExecution(phaseRows);
        return {
            phase,
            label: PHASE_LABEL[phase] || phase,
            rows: phaseRows,
            ...totals,
            remaining: totals.budget - totals.execution,
        };
    }).filter((group) => group.rows.length > 0);
}

function buildRowsByPhaseAndSource(rows) {
    return PHASES.map((phase) => {
        const phaseRows = (rows || []).filter((row) => row.phase === phase);
        const sourceGroups = SOURCE_TYPES.map((source) => {
            const sourceRows = phaseRows.filter((row) => row.source === source);
            const totals = summarizeBudgetExecution(sourceRows);
            return {
                source,
                rows: sourceRows,
                ...totals,
                remaining: totals.budget - totals.execution,
            };
        }).filter((group) => group.rows.length > 0);

        const totals = summarizeBudgetExecution(phaseRows);
        return {
            phase,
            label: PHASE_LABEL[phase] || phase,
            sourceGroups,
            ...totals,
            remaining: totals.budget - totals.execution,
        };
    }).filter((group) => group.sourceGroups.length > 0);
}

function buildSummaryCategoryRows(items, summaryView) {
    const categoryMap = {
        material: {
            key: 'material',
            label: '재료비 (합계)',
            phaseValues: {
                fabrication: { budget: 0, execution: 0 },
                installation: { budget: 0, execution: 0 },
            },
        },
        labor: {
            key: 'labor',
            label: '인건비 (합계)',
            phaseValues: {
                fabrication: { budget: 0, execution: 0 },
                installation: { budget: 0, execution: 0 },
            },
        },
        expense: {
            key: 'expense',
            label: '경비 (합계)',
            phaseValues: {
                fabrication: { budget: 0, execution: 0 },
                installation: { budget: 0, execution: 0 },
            },
        },
    };
    const materialUnitsByPhase = {
        fabrication: [],
        installation: [],
    };
    const laborUnitsByPhase = {
        fabrication: [],
        installation: [],
    };
    const expenseUnitsByPhase = {
        fabrication: [],
        installation: [],
    };
    const materialEquipmentSet = new Set();

    (items || []).forEach((equipment) => {
        PHASES.forEach((phase) => {
            const phaseData = equipment?.phases?.[phase];
            if (!phaseData) return;
            (phaseData.material?.units || []).forEach((unit) => {
                materialEquipmentSet.add(equipment.name);
                const unitBudget = toNumber(unit?.budgetAmount);
                const unitExecution = toNumber(unit?.executionAmount);
                const unitCount = Math.max(1, toNumber(unit?.unitCount) || 1);
                const unitKey = `material::${phase}::${equipment.name}::${unit.unitName}`;
                const sortedParts = sortByAmountDesc(unit?.parts || [], 'budgetAmount');
                materialUnitsByPhase[phase].push({
                    key: unitKey,
                    equipmentName: equipment.name,
                    unitName: unit.unitName,
                    partCount: toNumber(unit?.partCount),
                    quantity: unitCount,
                    budget: unitBudget,
                    execution: unitExecution,
                    remaining: unitBudget - unitExecution,
                    percent: usagePercent(unitBudget, unitExecution),
                    parts: sortedParts.map((part) => {
                        const partBudget = toNumber(part?.budgetAmount);
                        const partExecution = toNumber(part?.executionAmount);
                        const partQuantityPerUnit = toNumber(part?.quantityTotal);
                        return {
                            key: `${unitKey}::${part.partName}`,
                            partName: String(part?.partName || '미지정 파츠'),
                            quantity: partQuantityPerUnit * unitCount,
                            budget: partBudget,
                            execution: partExecution,
                            remaining: partBudget - partExecution,
                            percent: usagePercent(partBudget, partExecution),
                        };
                    }),
                });
            });
            SOURCE_TYPES.forEach((source) => {
                const laborSource = phaseData.labor?.bySource?.[source];
                (laborSource?.rows || []).forEach((row) => {
                    const budget = toNumber(row?.budgetAmount);
                    const execution = toNumber(row?.executionAmount);
                    const name = String(row?.name || '').trim() || '미지정 항목';
                    const key = `labor::${phase}::${equipment.name}::${source}::${name}`;
                    laborUnitsByPhase[phase].push({
                        key,
                        equipmentName: equipment.name,
                        source,
                        name,
                        budget,
                        execution,
                        remaining: budget - execution,
                        percent: usagePercent(budget, execution),
                    });
                });

                const expenseSource = phaseData.expense?.bySource?.[source];
                (expenseSource?.rows || []).forEach((row) => {
                    const budget = toNumber(row?.budgetAmount);
                    const execution = toNumber(row?.executionAmount);
                    const name = String(row?.name || '').trim() || '미지정 항목';
                    const basis = String(row?.basis || '').trim();
                    const key = `expense::${phase}::${equipment.name}::${source}::${name}`;
                    expenseUnitsByPhase[phase].push({
                        key,
                        equipmentName: equipment.name,
                        source,
                        name,
                        basis,
                        budget,
                        execution,
                        remaining: budget - execution,
                        percent: usagePercent(budget, execution),
                    });
                });
            });
            COST_TYPES.forEach((type) => {
                const bucket = phaseData[type];
                if (!bucket?.isVisible) return;
                categoryMap[type].phaseValues[phase].budget += toNumber(bucket.budget);
                categoryMap[type].phaseValues[phase].execution += toNumber(bucket.execution);
            });
        });
    });
    PHASES.forEach((phase) => {
        materialUnitsByPhase[phase] = [...materialUnitsByPhase[phase]].sort((a, b) => {
            const diff = toNumber(b?.budget) - toNumber(a?.budget);
            if (diff !== 0) return diff;
            const aName = `${a?.equipmentName || ''}::${a?.unitName || ''}`;
            const bName = `${b?.equipmentName || ''}::${b?.unitName || ''}`;
            return aName.localeCompare(bName, 'ko-KR');
        });
        laborUnitsByPhase[phase] = [...laborUnitsByPhase[phase]].sort((a, b) => {
            const diff = toNumber(b?.budget) - toNumber(a?.budget);
            if (diff !== 0) return diff;
            const aName = `${a?.equipmentName || ''}::${a?.source || ''}::${a?.name || ''}`;
            const bName = `${b?.equipmentName || ''}::${b?.source || ''}::${b?.name || ''}`;
            return aName.localeCompare(bName, 'ko-KR');
        });
        expenseUnitsByPhase[phase] = [...expenseUnitsByPhase[phase]].sort((a, b) => {
            const diff = toNumber(b?.budget) - toNumber(a?.budget);
            if (diff !== 0) return diff;
            const aName = `${a?.equipmentName || ''}::${a?.source || ''}::${a?.name || ''}`;
            const bName = `${b?.equipmentName || ''}::${b?.source || ''}::${b?.name || ''}`;
            return aName.localeCompare(bName, 'ko-KR');
        });
    });

    return COST_TYPES.map((type) => {
        const budget = toNumber(summaryView?.[type]?.budget);
        const execution = toNumber(summaryView?.[type]?.execution);
        const remaining = budget - execution;
        return {
            ...categoryMap[type],
            budget,
            execution,
            remaining,
            percent: usagePercent(budget, execution),
            equipmentCount: type === 'material' ? materialEquipmentSet.size : 0,
            children: PHASES.map((phase) => {
                const phaseBudget = toNumber(categoryMap[type].phaseValues[phase].budget);
                const phaseExecution = toNumber(categoryMap[type].phaseValues[phase].execution);
                return {
                    key: `${type}-${phase}`,
                    label: `${PHASE_LABEL[phase]} 단계`,
                    budget: phaseBudget,
                    execution: phaseExecution,
                    remaining: phaseBudget - phaseExecution,
                    percent: usagePercent(phaseBudget, phaseExecution),
                    units: type === 'material'
                        ? materialUnitsByPhase[phase]
                        : (type === 'labor' ? laborUnitsByPhase[phase] : expenseUnitsByPhase[phase]),
                };
            }),
        };
    });
}

function formatCompactNumber(value) {
    return Math.round(toNumber(value)).toLocaleString('ko-KR');
}

function formatQuantity(value) {
    const number = toNumber(value);
    if (!Number.isFinite(number)) return '0';
    if (Number.isInteger(number)) return number.toLocaleString('ko-KR');
    return number.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatSignedCompact(value) {
    const amount = Math.round(toNumber(value));
    if (amount > 0) return `+ ${Math.abs(amount).toLocaleString('ko-KR')}`;
    if (amount < 0) return `- ${Math.abs(amount).toLocaleString('ko-KR')}`;
    return '0';
}

const BudgetProjectBudget = () => {
    const { projectId } = useParams();
    const location = useLocation();
    const [project, setProject] = useState(null);
    const [, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [details, setDetails] = useState(EMPTY_DETAILS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const detailSearchQuery = '';
    const [selectedPhases, setSelectedPhases] = useState([...PHASES]);
    const [selectedCostTypes, setSelectedCostTypes] = useState([...COST_TYPES]);
    const [selectedSources, setSelectedSources] = useState([...SOURCE_TYPES]);
    const [selectedEquipments, setSelectedEquipments] = useState([]);
    const [isTotalFixed, setIsTotalFixed] = useState(false);
    const [isTreeExpanded, setIsTreeExpanded] = useState(true);
    const [activeBudgetTab, setActiveBudgetTab] = useState(() => resolveBudgetTabFromSearch(location.search) || 'summary');
    const [isInputMode, setIsInputMode] = useState(false);
    const pendingScrollTopRef = useRef(null);

    const handleBudgetTabChange = (nextTab) => {
        if (nextTab === activeBudgetTab) return;
        pendingScrollTopRef.current = window.scrollY;
        setActiveBudgetTab(nextTab);
    };

    useLayoutEffect(() => {
        if (!Number.isFinite(pendingScrollTopRef.current)) return;
        const targetTop = pendingScrollTopRef.current;
        pendingScrollTopRef.current = null;

        const rafId = window.requestAnimationFrame(() => {
            const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const clampedTop = Math.max(0, Math.min(targetTop, maxTop));
            window.scrollTo(0, clampedTop);
        });

        return () => {
            window.cancelAnimationFrame(rafId);
        };
    }, [activeBudgetTab]);

    useEffect(() => {
        const requestedTab = resolveBudgetTabFromSearch(location.search);
        if (!requestedTab) return;
        setActiveBudgetTab((prev) => (prev === requestedTab ? prev : requestedTab));
    }, [location.search]);

    const loadBudgetData = useCallback(async ({ background = false } = {}) => {
        if (!projectId) return;
        if (!background) {
            setIsLoading(true);
        }
        setError('');

        try {
            const versionsResp = await api.get(`/budget/projects/${projectId}/versions`);
            const payload = versionsResp?.data || {};
            const currentProject = payload.project || null;
            setProject(currentProject);

            const versionPool = Array.isArray(payload.versions) ? payload.versions : [];
            const currentStage = normalizeStage(currentProject?.current_stage || '');
            const currentVersion = versionPool.find((item) => item.is_current && normalizeStage(item?.stage) === currentStage)
                || versionPool.find((item) => item.is_current)
                || versionPool[0]
                || null;
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
            if (!background) {
                setIsLoading(false);
            }
        }
    }, [projectId]);

    useEffect(() => {
        loadBudgetData();
    }, [loadBudgetData]);

    useEffect(() => {
        const unsubscribe = subscribeBudgetDataUpdated((detail) => {
            const eventProjectId = String(detail?.projectId || '').trim();
            const targetProjectId = String(projectId || '').trim();
            if (eventProjectId && targetProjectId && eventProjectId !== targetProjectId) {
                return;
            }
            loadBudgetData({ background: true });
        });
        return unsubscribe;
    }, [loadBudgetData, projectId]);

    const handleEditorLiveDetailsChange = useCallback((nextDetails) => {
        setDetails(nextDetails || EMPTY_DETAILS);
    }, []);

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
            const partName = String(row?.part_name || row?.spec || '미지정 파츠').trim() || '미지정 파츠';
            const modelName = String(row?.spec || '').trim();
            const unitScopeKey = materialUnitScopeKeyFromRow(row);
            const unitCount = Math.max(1, Number(materialUnitCountMap[unitScopeKey] || 1));
            const amount = toNumber(row?.quantity) * toNumber(row?.unit_price) * unitCount;

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const unitBucket = ensureMaterialUnitBucket(phaseBucket.materialUnits, unitName);
            const partBucket = ensureMaterialPartBucket(unitBucket.parts, partName);

            phaseBucket.totals.material.budget += amount;
            unitBucket.unitCount = Math.max(1, toNumber(unitCount));
            unitBucket.quantityTotal += toNumber(row?.quantity);
            unitBucket.budgetAmount += amount;
            partBucket.quantityTotal += toNumber(row?.quantity);
            partBucket.budgetAmount += amount;
            if (modelName) {
                partBucket.modelName = modelName;
            }
            unitBucket.partCount = unitBucket.parts.size;
        });

        (details?.execution_material_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const unitName = String(row?.unit_name || row?.part_name || '미지정 유닛').trim() || '미지정 유닛';
            const partName = String(row?.part_name || row?.spec || '미지정 파츠').trim() || '미지정 파츠';
            const modelName = String(row?.spec || '').trim();
            const unitScopeKey = materialUnitScopeKeyFromRow(row);
            const unitCount = Math.max(1, Number(materialUnitCountMap[unitScopeKey] || 1));
            const amount = toNumber(row?.executed_amount);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const unitBucket = ensureMaterialUnitBucket(phaseBucket.materialUnits, unitName);
            const partBucket = ensureMaterialPartBucket(unitBucket.parts, partName);

            phaseBucket.totals.material.execution += amount;
            unitBucket.unitCount = Math.max(1, toNumber(unitCount));
            unitBucket.executionAmount += amount;
            partBucket.executionAmount += amount;
            if (!partBucket.modelName && modelName) {
                partBucket.modelName = modelName;
            }
            unitBucket.partCount = unitBucket.parts.size;
        });

        (details?.labor_items || []).forEach((row) => {
            const equipmentName = resolveScopedEquipmentName(row?.equipment_name);
            if (!equipmentName) return;
            const phase = normalizePhase(row?.phase);
            const staffingType = normalizeStaffingType(row?.staffing_type);
            const taskName = String(row?.task_name || '').trim() || '미지정 항목';
            const amount = calcLaborBudgetAmount(row, settings);
            const quantity = toNumber(row?.quantity);

            const equipment = ensureEquipmentBucket(equipmentMap, equipmentName);
            const phaseBucket = equipment.phases[phase];
            const taskBucket = ensureNamedAmountBucket(phaseBucket.laborItems[staffingType], taskName);

            phaseBucket.totals.labor.budget += amount;
            taskBucket.budgetAmount += amount;
            taskBucket.quantityTotal += quantity;
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
                        units: sortByAmountDesc(
                            Array.from(phaseBucket.materialUnits.values()).map((unit) => ({
                                ...unit,
                                parts: sortByAmountDesc(Array.from(unit.parts.values()), 'budgetAmount'),
                            })),
                            'budgetAmount',
                        ),
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
            if (!kept.length) return names;

            // Avoid sticky placeholder selections during initial load when
            // a single fallback bucket (e.g., '공통') appears before real equipments.
            if (kept.length === 1 && (kept[0] === '공통' || kept[0] === '미지정 설비') && names.length > 1) {
                return names;
            }

            return kept;
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
    const summaryCategoryRows = useMemo(
        () => buildSummaryCategoryRows(viewModel.items, summaryView),
        [viewModel.items, summaryView]
    );
    const materialRows = useMemo(() => buildMaterialRows(viewModel.items), [viewModel.items]);
    const laborRows = useMemo(() => buildLaborRows(viewModel.items), [viewModel.items]);
    const expenseRows = useMemo(() => buildExpenseRows(viewModel.items), [viewModel.items]);

    const baseProjectPath = `/project-management/projects/${project?.id || projectId}`;
    const projectMainPath = baseProjectPath;
    const budgetMainPath = `${baseProjectPath}/budget`;
    const issueManagementPath = `${baseProjectPath}/agenda`;
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

    const projectName = project?.name || '프로젝트';

    if (isLoading) {
        return (
            <div className="min-h-screen text-foreground">
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
            <div className="min-h-screen text-foreground">
                <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-20">
                    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                        프로젝트를 찾을 수 없습니다.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell min-h-screen text-foreground">
            <GlobalTopBar />

            <div className="border-b border-border/80 bg-card/65 backdrop-blur">
                <div className="mx-auto max-w-[1600px] px-4 lg:px-6 py-2">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <nav
                            aria-label="현재 경로"
                            className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground"
                        >
                            <Link to="/home" className="font-medium hover:text-primary">
                                메인
                            </Link>
                            <span>/</span>
                            <Link to="/home" className="font-medium hover:text-primary">
                                글로벌 검색
                            </Link>
                            <span>&gt;</span>
                            <span className="font-semibold text-foreground/90" title={projectName}>
                                {shortProjectName(projectName)}
                            </span>
                            <span>&gt;</span>
                            <Link to={budgetMainPath} className="font-semibold text-foreground/90 hover:text-primary">
                                예산 메인
                            </Link>
                        </nav>

                        <div className="app-surface-soft inline-flex flex-wrap items-center justify-end gap-1 p-1.5">
                            <Link
                                to={projectMainPath}
                                data-active={isProjectMainActive}
                                className="nav-pill"
                            >
                                프로젝트 메인
                            </Link>

                            <Link
                                to={budgetMainPath}
                                data-active={isBudgetMainActive}
                                className="nav-pill"
                            >
                                예산 메인
                            </Link>

                            <Link
                                to={issueManagementPath}
                                data-active={isIssueActive}
                                className="nav-pill"
                            >
                                이슈 관리
                            </Link>
                            <Link
                                to={scheduleManagementPath}
                                data-active={isScheduleActive}
                                className="nav-pill"
                            >
                                일정 관리
                            </Link>
                            <Link
                                to={specManagementPath}
                                data-active={isSpecActive}
                                className="nav-pill"
                            >
                                사양 관리
                            </Link>
                            <Link
                                to={dataManagementPath}
                                data-active={isDataActive}
                                className="nav-pill"
                            >
                                데이터 관리
                            </Link>
                            <Link
                                to={projectSettingPath}
                                data-active={isSettingActive}
                                className="nav-pill"
                            >
                                프로젝트 설정
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <main className="app-enter mx-auto max-w-[1640px] px-4 py-5 lg:px-6">
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
                                        onClick={() => handleBudgetTabChange(tab.key)}
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
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsInputMode((prev) => !prev)}
                                aria-pressed={isInputMode}
                                className={cn(
                                    'inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors',
                                    isInputMode
                                        ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                                )}
                            >
                                입력 모드
                            </button>
                            <button
                                type="button"
                                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
                            >
                                <Calculator className="h-3.5 w-3.5" />
                                보고서 내보내기
                            </button>
                        </div>
                    </div>
                </nav>

                {activeBudgetTab === 'summary' && (
                    <SummaryTabContent
                        summaryView={summaryView}
                        summaryCategoryRows={summaryCategoryRows}
                    />
                )}

                {activeBudgetTab === 'material' && (
                    <MaterialTabContent
                        rows={materialRows}
                        executionItems={details?.execution_material_items || []}
                        currentStage={normalizeStage(project?.current_stage || '')}
                        isInputMode={isInputMode}
                        onLiveDetailsChange={handleEditorLiveDetailsChange}
                    />
                )}

                {activeBudgetTab === 'labor' && (
                    <LaborTabContent
                        rows={laborRows}
                        isInputMode={isInputMode}
                        onLiveDetailsChange={handleEditorLiveDetailsChange}
                    />
                )}

                {activeBudgetTab === 'expense' && (
                    <ExpenseTabContent
                        rows={expenseRows}
                        isInputMode={isInputMode}
                        onLiveDetailsChange={handleEditorLiveDetailsChange}
                    />
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

const SUMMARY_THEME = {
    material: {
        dot: 'bg-blue-500',
        categoryIcon: 'bg-blue-100 text-blue-600',
        categoryProgress: 'bg-blue-500',
        childProgress: 'bg-blue-400',
        childBorder: 'border-l-blue-500/20',
    },
    labor: {
        dot: 'bg-violet-500',
        categoryIcon: 'bg-violet-100 text-violet-600',
        categoryProgress: 'bg-violet-500',
        childProgress: 'bg-violet-400',
        childBorder: 'border-l-violet-500/20',
    },
    expense: {
        dot: 'bg-orange-500',
        categoryIcon: 'bg-orange-100 text-orange-600',
        categoryProgress: 'bg-orange-500',
        childProgress: 'bg-orange-400',
        childBorder: 'border-l-orange-500/20',
    },
};

const PHASE_TOTAL_THEME = {
    fabrication: 'bg-blue-900 text-white',
    installation: 'bg-emerald-700 text-white',
};

const phaseBadgeClass = (phase) => (phase === 'fabrication'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-emerald-100 text-emerald-800');

const CostSummaryPanel = ({ panelBadge, items }) => (
    <section className="rounded-2xl border border-slate-300/80 bg-gradient-to-br from-slate-100 to-slate-50 p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-xs font-bold tracking-[0.14em] text-slate-600">비용군 요약 패널</h3>
            <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                {panelBadge}
            </span>
        </div>
        <div className={cn('grid grid-cols-1 gap-2.5', items.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-1')}>
            {items.map((item) => {
                const theme = SUMMARY_THEME[item.key] || SUMMARY_THEME.material;
                return (
                    <article key={item.key} className="rounded-xl border border-white bg-white/95 px-3 py-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <span className={cn('inline-flex rounded-md p-1.5', theme.categoryIcon)}>
                                    {item.key === 'material' && <Boxes className="h-3.5 w-3.5" />}
                                    {item.key === 'labor' && <Users className="h-3.5 w-3.5" />}
                                    {item.key === 'expense' && <Receipt className="h-3.5 w-3.5" />}
                                </span>
                                {item.label}
                            </h4>
                            <span className="text-[11px] font-semibold text-slate-500">{item.percent.toFixed(1)}%</span>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                                <p className="text-[10px] font-semibold tracking-wide text-slate-500">{item.budgetLabel}</p>
                                <p className="mt-0.5 text-sm font-bold leading-none text-slate-900">{formatCompactNumber(item.budget)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold tracking-wide text-slate-500">{item.executionLabel}</p>
                                <p className="mt-0.5 text-sm font-bold leading-none text-slate-900">{formatCompactNumber(item.execution)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold tracking-wide text-slate-500">{item.remainingLabel}</p>
                                <p className={cn('mt-0.5 text-sm font-bold leading-none', item.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                    {formatCompactNumber(item.remaining)}
                                </p>
                            </div>
                        </div>

                        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                            <div className={cn('h-1.5 rounded-full', theme.categoryProgress)} style={{ width: `${Math.min(item.percent, 100)}%` }} />
                        </div>
                    </article>
                );
            })}
        </div>
    </section>
);

const TabCostMetricPanel = ({ panelBadge, costKey, budgetLabel, executionLabel, remainingLabel, budget, execution, remaining }) => {
    const theme = SUMMARY_THEME[costKey] || SUMMARY_THEME.material;
    const metricCards = [
        {
            key: 'budget',
            label: budgetLabel,
            value: budget,
            valueClass: 'text-slate-900',
            toneClass: 'border-blue-100 bg-blue-50/60',
        },
        {
            key: 'execution',
            label: executionLabel,
            value: execution,
            valueClass: 'text-slate-900',
            toneClass: 'border-amber-100 bg-amber-50/60',
        },
        {
            key: 'remaining',
            label: remainingLabel,
            value: remaining,
            valueClass: remaining < 0 ? 'text-rose-600' : 'text-emerald-600',
            toneClass: remaining < 0 ? 'border-rose-100 bg-rose-50/60' : 'border-emerald-100 bg-emerald-50/60',
        },
    ];

    return (
        <section className="rounded-2xl border border-slate-300/80 bg-gradient-to-br from-slate-100 to-slate-50 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-bold tracking-[0.14em] text-slate-600">비용군 요약 패널</h3>
                <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {panelBadge}
                </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {metricCards.map((metric) => (
                    <article key={metric.key} className={cn('rounded-xl border px-3 py-2.5 shadow-sm', metric.toneClass)}>
                        <div className="flex items-center gap-2">
                            <span className={cn('inline-flex rounded-md p-1.5', theme.categoryIcon)}>
                                {costKey === 'material' && <Boxes className="h-3.5 w-3.5" />}
                                {costKey === 'labor' && <Users className="h-3.5 w-3.5" />}
                                {costKey === 'expense' && <Receipt className="h-3.5 w-3.5" />}
                            </span>
                            <p className="text-[11px] font-semibold tracking-wide text-slate-600">{metric.label}</p>
                        </div>
                        <p className={cn('mt-2 text-lg font-bold leading-none', metric.valueClass)}>
                            {formatCompactNumber(metric.value)}
                        </p>
                    </article>
                ))}
            </div>
        </section>
    );
};

const SummaryTabContent = ({ summaryView, summaryCategoryRows }) => {
    const materialCategory = useMemo(
        () => summaryCategoryRows.find((category) => category.key === 'material') || null,
        [summaryCategoryRows],
    );
    const materialUnitKeysByPhase = useMemo(() => {
        const mapped = {};
        (materialCategory?.children || []).forEach((child) => {
            mapped[child.key] = (child.units || []).map((unit) => unit.key);
        });
        return mapped;
    }, [materialCategory]);
    const materialUnitKeys = useMemo(
        () => Object.values(materialUnitKeysByPhase).flat(),
        [materialUnitKeysByPhase],
    );
    const allPhaseKeys = useMemo(
        () => summaryCategoryRows.flatMap((category) => (category.children || []).map((child) => child.key)),
        [summaryCategoryRows],
    );
    const [expandedPhaseKeys, setExpandedPhaseKeys] = useState([]);
    const [expandedMaterialUnitKeys, setExpandedMaterialUnitKeys] = useState([]);

    useEffect(() => {
        setExpandedPhaseKeys((prev) => prev.filter((key) => allPhaseKeys.includes(key)));
        setExpandedMaterialUnitKeys((prev) => prev.filter((key) => materialUnitKeys.includes(key)));
    }, [allPhaseKeys, materialUnitKeys]);

    const collapseAllTreeRows = useCallback(() => {
        setExpandedPhaseKeys([]);
        setExpandedMaterialUnitKeys([]);
    }, []);
    const expandAllTreeRows = useCallback(() => {
        setExpandedPhaseKeys(allPhaseKeys);
        setExpandedMaterialUnitKeys(materialUnitKeys);
    }, [allPhaseKeys, materialUnitKeys]);
    const toggleSummaryPhase = useCallback((phaseKey) => {
        const key = String(phaseKey || '');
        const categoryKey = key.split('-')[0];
        const phaseUnitKeys = categoryKey === 'material' ? (materialUnitKeysByPhase[key] || []) : [];
        setExpandedPhaseKeys((prev) => {
            const isExpanded = prev.includes(key);
            if (isExpanded) {
                setExpandedMaterialUnitKeys((unitPrev) => unitPrev.filter((unitKey) => !phaseUnitKeys.includes(unitKey)));
                return prev.filter((item) => item !== key);
            }
            return [...prev, key];
        });
    }, [materialUnitKeysByPhase]);
    const toggleMaterialUnit = useCallback((unitKey) => {
        setExpandedMaterialUnitKeys((prev) => (
            prev.includes(unitKey)
                ? prev.filter((key) => key !== unitKey)
                : [...prev, unitKey]
        ));
    }, []);

    const allTreeExpanded = allPhaseKeys.length > 0
        && allPhaseKeys.every((key) => expandedPhaseKeys.includes(key))
        && materialUnitKeys.every((key) => expandedMaterialUnitKeys.includes(key));

    return (
        <div className="space-y-8">
            <CostSummaryPanel
                panelBadge="재료비/인건비/경비"
                items={summaryCategoryRows.map((category) => ({
                    key: category.key,
                    label: COST_TYPE_LABEL[category.key],
                    budgetLabel: '예산',
                    executionLabel: '집행금액',
                    remainingLabel: '잔여 예산',
                    budget: category.budget,
                    execution: category.execution,
                    remaining: category.remaining,
                    percent: category.percent,
                }))}
            />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-lg font-bold text-slate-800">통합 원가 상세</h3>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={collapseAllTreeRows}
                            disabled={!expandedPhaseKeys.length && !expandedMaterialUnitKeys.length}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            모두 접기
                        </button>
                        <button
                            type="button"
                            onClick={expandAllTreeRows}
                            disabled={allTreeExpanded}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            모두 펼치기
                        </button>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">보기: 단계별 상세</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm text-left">
                        <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="w-1/4 px-6 py-4 font-semibold">비용 구분 / 단계</th>
                                <th className="px-6 py-4 text-right font-semibold">배정 예산</th>
                                <th className="px-6 py-4 text-right font-semibold">집행 금액</th>
                                <th className="px-6 py-4 text-right font-semibold">편차(잔액)</th>
                                <th className="w-36 px-6 py-4 text-center font-semibold">진행률</th>
                                <th className="w-24 px-6 py-4 text-center font-semibold">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-slate-700">
                            {summaryCategoryRows.map((category) => {
                                const theme = SUMMARY_THEME[category.key];
                                const isMaterialCategory = category.key === 'material';
                                return (
                                    <React.Fragment key={category.key}>
                                        <tr className="bg-slate-50 font-medium">
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={cn('rounded p-1.5', theme.categoryIcon)}>
                                                        {category.key === 'material' && <Boxes className="h-4 w-4" />}
                                                        {category.key === 'labor' && <Users className="h-4 w-4" />}
                                                        {category.key === 'expense' && <Receipt className="h-4 w-4" />}
                                                    </div>
                                                    <span className="font-bold text-slate-900">{category.label}</span>
                                                    {category.key === 'material' && (
                                                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                                            설비 {formatCompactNumber(category.equipmentCount)}개
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right text-slate-900">{formatCompactNumber(category.budget)}</td>
                                            <td className="px-6 py-3 text-right text-slate-900">{formatCompactNumber(category.execution)}</td>
                                            <td className={cn('px-6 py-3 text-right', category.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                {formatCompactNumber(category.remaining)}
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="h-1.5 w-full rounded-full bg-slate-200">
                                                    <div className={cn('h-1.5 rounded-full', theme.categoryProgress)} style={{ width: `${Math.min(category.percent, 100)}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-700">합계</span>
                                            </td>
                                        </tr>
                                        {category.children.map((child) => {
                                            const childStatus = getBudgetStatusMeta(child.budget, child.execution);
                                            const phaseUnits = Array.isArray(child.units) ? child.units : [];
                                            const isPhaseExpanded = expandedPhaseKeys.includes(child.key);
                                            return (
                                                <React.Fragment key={child.key}>
                                                    <tr
                                                        className={cn(
                                                            'bg-white transition border-l-4',
                                                            theme.childBorder,
                                                            'cursor-pointer hover:bg-slate-50',
                                                        )}
                                                        onClick={() => toggleSummaryPhase(child.key)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(event) => {
                                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                                            event.preventDefault();
                                                            toggleSummaryPhase(child.key);
                                                        }}
                                                    >
                                                        <td className="px-6 py-3 pl-12 text-sm text-slate-600">
                                                            <div className="inline-flex items-center gap-1.5 text-left text-slate-700">
                                                                {isPhaseExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                <span>{child.label}</span>
                                                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                                                    {formatCompactNumber(phaseUnits.length)} {isMaterialCategory ? '유닛' : '항목'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-right text-slate-600">{formatCompactNumber(child.budget)}</td>
                                                        <td className="px-6 py-3 text-right text-slate-800">{formatCompactNumber(child.execution)}</td>
                                                        <td className={cn('px-6 py-3 text-right font-medium', child.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                            {formatCompactNumber(child.remaining)}
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-8 text-right text-[10px] text-slate-500">{child.percent.toFixed(0)}%</span>
                                                                <div className="h-1 w-full rounded-full bg-slate-100">
                                                                    <div className={cn('h-1 rounded-full', theme.childProgress)} style={{ width: `${Math.min(child.percent, 100)}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <span className={cn('rounded border px-2 py-1 text-xs font-medium', childStatus.className)}>
                                                                {childStatus.label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                    {isMaterialCategory && isPhaseExpanded && phaseUnits.map((unit) => {
                                                        const isUnitExpanded = expandedMaterialUnitKeys.includes(unit.key);
                                                        return (
                                                            <React.Fragment key={unit.key}>
                                                                <tr
                                                                    className="cursor-pointer border-l-4 border-l-slate-200 bg-slate-50/50 hover:bg-slate-100/70"
                                                                    onClick={() => toggleMaterialUnit(unit.key)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    onKeyDown={(event) => {
                                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                                        event.preventDefault();
                                                                        toggleMaterialUnit(unit.key);
                                                                    }}
                                                                >
                                                                    <td className="px-6 py-3 pl-16 text-sm text-slate-700">
                                                                        <div className="inline-flex items-center gap-1.5 text-left text-slate-700">
                                                                            {isUnitExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                            <span>
                                                                                <span className="font-bold">{unit.equipmentName}</span>
                                                                                <span className="mx-1 text-slate-500">/</span>
                                                                                <span className="inline-flex items-center gap-1">
                                                                                    <span>{unit.unitName}</span>
                                                                                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                                        수량 {formatCompactNumber(unit.quantity)}
                                                                                    </span>
                                                                                </span>
                                                                            </span>
                                                                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                                {formatCompactNumber(unit.partCount)} 파츠
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right">{formatCompactNumber(unit.budget)}</td>
                                                                    <td className="px-6 py-3 text-right">{formatCompactNumber(unit.execution)}</td>
                                                                    <td className={cn('px-6 py-3 text-right font-medium', unit.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                                        {formatCompactNumber(unit.remaining)}
                                                                    </td>
                                                                    <td className="px-6 py-3" />
                                                                    <td className="px-6 py-3" />
                                                                </tr>
                                                                {isUnitExpanded && (unit.parts || []).map((part) => {
                                                                    return (
                                                                        <tr key={part.key} className="border-l-4 border-l-slate-100 bg-slate-50/80">
                                                                            <td className="px-6 py-3 pl-20 text-sm text-slate-600">
                                                                                <div className="inline-flex items-center gap-2">
                                                                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                                                                    <span>{part.partName}</span>
                                                                                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                                                                                        수량 {formatCompactNumber(part.quantity)}
                                                                                    </span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-6 py-3 text-right">{formatCompactNumber(part.budget)}</td>
                                                                            <td className="px-6 py-3 text-right">{formatCompactNumber(part.execution)}</td>
                                                                            <td className={cn('px-6 py-3 text-right font-medium', part.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                                                {formatCompactNumber(part.remaining)}
                                                                            </td>
                                                                            <td className="px-6 py-3" />
                                                                            <td className="px-6 py-3" />
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                    {!isMaterialCategory && isPhaseExpanded && phaseUnits.map((unit) => {
                                                        const isLaborCategory = category.key === 'labor';
                                                        const sourceBadgeClass = unit?.source === '자체'
                                                            ? 'bg-indigo-100 text-indigo-700'
                                                            : 'bg-violet-100 text-violet-700';
                                                        const titleText = isLaborCategory
                                                            ? `${unit?.equipmentName || ''} / ${unit?.name || ''}`.trim()
                                                            : `${unit?.equipmentName || ''} / ${unit?.name || ''}${unit?.basis ? ` (${unit.basis})` : ''}`.trim();
                                                        return (
                                                            <tr key={unit.key} className="border-l-4 border-l-slate-200 bg-slate-50/50">
                                                                <td className="px-6 py-3 pl-16 text-sm text-slate-700">
                                                                    <div className="flex min-w-0 items-center gap-2" title={titleText}>
                                                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                                                        <span className="min-w-0 truncate">
                                                                            <span className="font-bold">{unit.equipmentName}</span>
                                                                            <span className="mx-1 text-slate-500">/</span>
                                                                            <span>{unit.name}</span>
                                                                            {!isLaborCategory && unit.basis && (
                                                                                <span className="text-slate-500"> ({unit.basis})</span>
                                                                            )}
                                                                        </span>
                                                                        {unit.source && (
                                                                            <span className={cn(
                                                                                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                                                                sourceBadgeClass
                                                                            )}>
                                                                                {unit.source}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-3 text-right">{formatCompactNumber(unit.budget)}</td>
                                                                <td className="px-6 py-3 text-right">{formatCompactNumber(unit.execution)}</td>
                                                                <td className={cn('px-6 py-3 text-right font-medium', unit.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                                    {formatCompactNumber(unit.remaining)}
                                                                </td>
                                                                <td className="px-6 py-3" />
                                                                <td className="px-6 py-3" />
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-xl border border-blue-800 bg-blue-900 p-6 text-white shadow-lg">
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                    <div>
                        <h3 className="text-xl font-bold tracking-wide">프로젝트 통합 원가 검토</h3>
                        <p className="mt-1 text-sm text-blue-200">재료비 + 인건비 + 경비 통합 집계</p>
                    </div>
                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <div className="mb-1 text-xs tracking-wider text-blue-200">총 편차</div>
                            <div className={cn('text-2xl font-bold', summaryView.total.remaining < 0 ? 'text-rose-300' : 'text-emerald-400')}>
                                {formatSignedCompact(summaryView.total.remaining)}
                            </div>
                        </div>
                        <div className="hidden h-10 w-px bg-blue-700 md:block" />
                        <div className="text-right">
                            <div className="mb-1 text-xs tracking-wider text-blue-200">총 집행</div>
                            <div className="text-3xl font-bold text-amber-200">₩ {formatCompactNumber(summaryView.total.execution)}</div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

const MaterialTabContent = ({ rows, executionItems, currentStage, isInputMode, onLiveDetailsChange }) => {
    const total = summarizeBudgetExecution(rows);
    const remaining = total.budget - total.execution;
    const defaultUnitViewMode = currentStage === 'review' ? 'budget' : 'execution';
    const [unitViewMode, setUnitViewMode] = useState(defaultUnitViewMode);

    useEffect(() => {
        setUnitViewMode(defaultUnitViewMode);
    }, [defaultUnitViewMode]);

	    const budgetRows = useMemo(
	        () => (rows || []).filter((row) => toNumber(row?.budget) > 0),
	        [rows],
	    );
	    const materialUnitMetaByKey = useMemo(() => {
	        const meta = new Map();
	        (rows || []).forEach((unit) => {
	            const unitKey = `${unit.equipmentName}::${unit.phase}::${unit.unitName}`;
	            const partMeta = new Map();
	            (unit.parts || []).forEach((part) => {
	                const partKey = `${String(part?.partName || '').trim()}::${String(part?.modelName || '').trim()}`;
	                if (!partKey) return;
	                partMeta.set(partKey, { quantity: toNumber(part?.quantity) });
	            });
	            meta.set(unitKey, {
	                unitCount: Math.max(1, toNumber(unit.unitCount) || 1),
	                parts: partMeta,
	            });
	        });
	        return meta;
	    }, [rows]);
	    const executionRows = useMemo(
	        () => buildMaterialExecutionRows(executionItems || []).map((unit) => {
	            const unitKey = `${unit.equipmentName}::${unit.phase}::${unit.unitName}`;
	            const meta = materialUnitMetaByKey.get(unitKey);
	            const quantity = Math.max(1, toNumber(meta?.unitCount) || 1);
	            const unitCost = quantity > 0 ? toNumber(unit.execution) / quantity : 0;

	            const parts = (unit.parts || []).map((part) => {
	                const partKey = `${String(part?.partName || '').trim()}::${String(part?.modelName || '').trim()}`;
	                const partQuantity = toNumber(meta?.parts?.get(partKey)?.quantity);
	                const partUnitCost = partQuantity > 0 ? toNumber(part.execution) / partQuantity : 0;
	                return {
	                    ...part,
	                    quantity: partQuantity,
	                    unitCost: partUnitCost,
	                };
	            });

	            return {
	                ...unit,
	                quantity,
	                unitCost,
	                parts,
	            };
	        }),
	        [executionItems, materialUnitMetaByKey],
	    );
    const activeUnitRows = unitViewMode === 'execution' ? executionRows : budgetRows;
    const allUnitKeys = useMemo(() => (activeUnitRows || []).map((row) => row.key), [activeUnitRows]);
    const [expandedUnitKeys, setExpandedUnitKeys] = useState([]);
    const allExpanded = allUnitKeys.length > 0 && allUnitKeys.every((key) => expandedUnitKeys.includes(key));

    useEffect(() => {
        setExpandedUnitKeys((prev) => prev.filter((key) => allUnitKeys.includes(key)));
    }, [allUnitKeys]);

    const executionPhaseGroups = useMemo(() => {
        return PHASES.map((phase) => {
            const phaseRows = executionRows.filter((row) => row.phase === phase);
            return {
                phase,
                label: PHASE_LABEL[phase] || phase,
                rows: phaseRows,
                execution: phaseRows.reduce((sum, row) => sum + toNumber(row?.execution), 0),
            };
        }).filter((group) => group.rows.length > 0);
    }, [executionRows]);
    const executionTotal = useMemo(
        () => executionRows.reduce((sum, row) => sum + toNumber(row?.execution), 0),
        [executionRows],
    );

    const collapseAllUnits = useCallback(() => {
        setExpandedUnitKeys([]);
    }, []);
    const expandAllUnits = useCallback(() => {
        setExpandedUnitKeys(allUnitKeys);
    }, [allUnitKeys]);
    const toggleUnitRow = useCallback((unitKey) => {
        setExpandedUnitKeys((prev) => (
            prev.includes(unitKey)
                ? prev.filter((key) => key !== unitKey)
                : [...prev, unitKey]
        ));
    }, []);

    return (
        <div className="space-y-8">
            <TabCostMetricPanel
                panelBadge="재료비"
                costKey="material"
                budgetLabel="재료비 총 예산"
                executionLabel="재료비 집행금액"
                remainingLabel="재료비 잔액"
                budget={total.budget}
                execution={total.execution}
                remaining={remaining}
            />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-lg font-bold text-slate-800">재료비 상세 내역</h3>
                    {!isInputMode && (
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setUnitViewMode('budget')}
                                    className={cn(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                                        unitViewMode === 'budget'
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-600 hover:bg-slate-100',
                                    )}
                                >
                                    예산 유닛
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUnitViewMode('execution')}
                                    className={cn(
                                        'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                                        unitViewMode === 'execution'
                                            ? 'bg-slate-900 text-white'
                                            : 'text-slate-600 hover:bg-slate-100',
                                    )}
                                >
                                    집행 유닛
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={collapseAllUnits}
                                disabled={!expandedUnitKeys.length}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                모두 접기
                            </button>
                            <button
                                type="button"
                                onClick={expandAllUnits}
                                disabled={!allUnitKeys.length || allExpanded}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                모두 펼치기
                            </button>
                            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">단위: 원</span>
                        </div>
                    )}
                </div>
                {isInputMode ? (
                    <div className="p-4">
                        <BudgetProjectEditor
                            embedded
                            forceSection="material"
                            onLiveDetailsChange={onLiveDetailsChange}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
	                        {unitViewMode === 'execution' ? (
	                            <table className="w-full min-w-[980px] table-fixed text-sm text-left">
	                                <colgroup>
	                                    <col className="w-[88px]" />
	                                    <col className="w-[180px]" />
	                                    <col />
	                                    <col className="w-[110px]" />
	                                    <col className="w-[150px]" />
	                                    <col className="w-[170px]" />
	                                </colgroup>
	                                <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
	                                    <tr>
	                                        <th className="w-24 px-4 py-3 text-center font-semibold">단계</th>
	                                        <th className="px-4 py-3 font-semibold">설비</th>
	                                        <th className="px-4 py-3 font-semibold">명칭</th>
	                                        <th className="w-24 px-4 py-3 text-right font-semibold">수량</th>
	                                        <th className="w-32 px-4 py-3 text-right font-semibold">단가</th>
	                                        <th className="w-40 px-4 py-3 text-right font-semibold">집행</th>
	                                    </tr>
	                                </thead>
	                                <tbody className="divide-y divide-slate-200 text-slate-700">
	                                    {executionRows.length === 0 && (
	                                        <tr>
	                                            <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
	                                                표시할 재료비 집행 데이터가 없습니다. (예산 유닛으로 전환할 수 있습니다.)
	                                            </td>
	                                        </tr>
	                                    )}

                                    {executionPhaseGroups.map((group) => {
                                        const phaseRowSpan = group.rows.reduce((sum, row) => (
                                            sum + 1 + (expandedUnitKeys.includes(row.key) ? (row.parts || []).length : 0)
                                        ), 0);

                                        return (
                                            <React.Fragment key={group.phase}>
                                                {group.rows.map((row, index) => {
                                                    const isUnitExpanded = expandedUnitKeys.includes(row.key);
                                                    return (
                                                        <React.Fragment key={row.key}>
                                                            <tr
                                                                className={cn(
                                                                    index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                                                                    'cursor-pointer hover:bg-slate-100/70',
                                                                )}
                                                                onClick={() => toggleUnitRow(row.key)}
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(event) => {
                                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                                    event.preventDefault();
                                                                    toggleUnitRow(row.key);
                                                                }}
                                                            >
                                                                {index === 0 && (
                                                                    <td
                                                                        rowSpan={phaseRowSpan}
                                                                        className="border-r border-slate-200 px-4 py-3 text-center align-middle font-bold"
                                                                    >
                                                                        <span className={cn('rounded px-2 py-1 text-xs', phaseBadgeClass(group.phase))}>
                                                                            {group.phase === 'fabrication' ? '제작' : '설치'}
                                                                        </span>
                                                                    </td>
                                                                )}
                                                                <td className="px-4 py-3 font-semibold">
                                                                    <div className="truncate" title={row.equipmentName}>{row.equipmentName}</div>
                                                                </td>
	                                                                <td className="px-4 py-3">
	                                                                    <div className="flex min-w-0 items-center gap-1.5">
	                                                                        {isUnitExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
	                                                                        <span className="truncate" title={row.unitName}>{row.unitName}</span>
	                                                                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
	                                                                            {formatCompactNumber(row.partCount)} 파츠
	                                                                        </span>
	                                                                    </div>
	                                                                </td>
	                                                                <td className="px-4 py-3 text-right">{formatQuantity(row.quantity)}</td>
	                                                                <td className="px-4 py-3 text-right">{toNumber(row.quantity) > 0 ? formatWon(row.unitCost) : '-'}</td>
	                                                                <td className="px-4 py-3 text-right font-semibold">{formatWon(row.execution)}</td>
	                                                            </tr>
	                                                            {isUnitExpanded && (row.parts || []).map((part) => (
	                                                                <tr key={part.key} className="bg-slate-50/70">
	                                                                    <td className="px-4 py-2" />
	                                                                    <td className="px-4 py-2 pl-10 text-sm text-slate-600">
	                                                                        <div className="flex min-w-0 items-center gap-2">
	                                                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
	                                                                            <span className="truncate" title={part.displayName}>{part.displayName}</span>
	                                                                        </div>
	                                                                    </td>
	                                                                    <td className="px-4 py-2 text-right text-sm text-slate-600">{formatQuantity(part.quantity)}</td>
	                                                                    <td className="px-4 py-2 text-right text-sm text-slate-600">{toNumber(part.quantity) > 0 ? formatWon(part.unitCost) : '-'}</td>
	                                                                    <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700">{formatWon(part.execution)}</td>
	                                                                </tr>
	                                                            ))}
	                                                        </React.Fragment>
	                                                    );
	                                                })}
	                                                <tr className={PHASE_TOTAL_THEME[group.phase]}>
	                                                    <td className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wide" colSpan={5}>
	                                                        {group.label} 재료비 집행 소계
	                                                    </td>
	                                                    <td className="px-4 py-3 text-right font-bold">{formatWon(group.execution)}</td>
	                                                </tr>
	                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
	                                {executionRows.length > 0 && (
	                                    <tfoot>
	                                        <tr className="bg-slate-950 text-white">
	                                            <td className="px-4 py-4 text-right text-sm font-bold uppercase tracking-wide" colSpan={5}>
	                                                프로젝트 재료비 집행 총괄
	                                            </td>
	                                            <td className="whitespace-nowrap px-4 py-4 text-right text-lg font-bold tabular-nums text-amber-300">{formatWon(executionTotal)}</td>
	                                        </tr>
	                                    </tfoot>
                                )}
                            </table>
                        ) : (
                            <table className="w-full min-w-[900px] table-fixed text-sm text-left">
                                <colgroup>
                                    <col className="w-[88px]" />
                                    <col className="w-[180px]" />
                                    <col />
                                    <col className="w-[110px]" />
                                    <col className="w-[150px]" />
                                    <col className="w-[170px]" />
                                </colgroup>
                                <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="w-24 px-4 py-3 text-center font-semibold">단계</th>
                                        <th className="px-4 py-3 font-semibold">설비</th>
                                        <th className="px-4 py-3 font-semibold">명칭</th>
                                        <th className="w-24 px-4 py-3 text-right font-semibold">수량</th>
                                        <th className="w-32 px-4 py-3 text-right font-semibold">단가</th>
                                        <th className="w-32 px-4 py-3 text-right font-semibold">예산</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 text-slate-700">
                                    {budgetRows.length === 0 && (
                                        <tr>
                                            <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                                                표시할 재료비 데이터가 없습니다.
                                            </td>
                                        </tr>
                                    )}

                                    {buildRowsByPhase(budgetRows).map((group) => {
                                        const phaseRowSpan = group.rows.reduce((sum, row) => (
                                            sum + 1 + (expandedUnitKeys.includes(row.key) ? (row.parts || []).length : 0)
                                        ), 0);

                                        return (
                                            <React.Fragment key={group.phase}>
                                                {group.rows.map((row, index) => {
                                                    const isUnitExpanded = expandedUnitKeys.includes(row.key);
                                                    return (
                                                        <React.Fragment key={row.key}>
                                                            <tr
                                                                className={cn(
                                                                    index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                                                                    'cursor-pointer hover:bg-slate-100/70',
                                                                )}
                                                                onClick={() => toggleUnitRow(row.key)}
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(event) => {
                                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                                    event.preventDefault();
                                                                    toggleUnitRow(row.key);
                                                                }}
                                                            >
                                                                {index === 0 && (
                                                                    <td
                                                                        rowSpan={phaseRowSpan}
                                                                        className="border-r border-slate-200 px-4 py-3 text-center align-middle font-bold"
                                                                    >
                                                                        <span className={cn('rounded px-2 py-1 text-xs', phaseBadgeClass(group.phase))}>
                                                                            {group.phase === 'fabrication' ? '제작' : '설치'}
                                                                        </span>
                                                                    </td>
                                                                )}
                                                                <td className="px-4 py-3 font-semibold">
                                                                    <div className="truncate" title={row.equipmentName}>{row.equipmentName}</div>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                                        {isUnitExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                        <span className="truncate" title={row.unitName}>{row.unitName}</span>
                                                                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                            {formatCompactNumber(row.partCount)} 파츠
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-right">{formatCompactNumber(row.quantity)}</td>
                                                                <td className="px-4 py-3 text-right">{formatWon(row.unitCost)}</td>
                                                                <td className="px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
                                                            </tr>
                                                            {isUnitExpanded && (row.parts || []).map((part) => (
                                                                <tr key={part.key} className="bg-slate-50/70">
                                                                    <td className="px-4 py-2" />
                                                                    <td className="px-4 py-2 pl-10 text-sm text-slate-600">
                                                                        <div className="flex min-w-0 items-center gap-2">
                                                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                                                            <span className="truncate" title={part.displayName}>{part.displayName}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right text-sm text-slate-600">{formatCompactNumber(part.quantity)}</td>
                                                                    <td className="px-4 py-2 text-right text-sm text-slate-600">{formatWon(part.unitCost)}</td>
                                                                    <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700">{formatWon(part.budget)}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                <tr className={PHASE_TOTAL_THEME[group.phase]}>
                                                    <td className="px-4 py-3 text-right text-sm font-bold uppercase tracking-wide" colSpan={5}>
                                                        {group.label} 재료비 소계
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold">{formatWon(group.budget)}</td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                {budgetRows.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-slate-950 text-white">
                                            <td className="px-4 py-4 text-right text-sm font-bold uppercase tracking-wide" colSpan={5}>
                                                프로젝트 재료비 총괄
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4 text-right text-lg font-bold tabular-nums text-amber-300">{formatWon(total.budget)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

const LaborTabContent = ({ rows, isInputMode, onLiveDetailsChange }) => {
    const total = summarizeBudgetExecution(rows);
    const remaining = total.budget - total.execution;
    const totalPercent = usagePercent(total.budget, total.execution);
    const phaseGroups = buildRowsByPhaseAndSource(rows);

    return (
        <div className="space-y-8">
            <TabCostMetricPanel
                panelBadge="인건비"
                costKey="labor"
                budgetLabel="인건비 총 예산"
                executionLabel="인건비 집행금액"
                remainingLabel="인건비 잔액"
                budget={total.budget}
                execution={total.execution}
                remaining={remaining}
            />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h3 className="text-sm font-bold tracking-wide text-slate-800">인건비 상세 내역</h3>
                    {!isInputMode && <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">단위: 원</span>}
                </div>
                {isInputMode ? (
                    <div className="p-4">
                        <BudgetProjectEditor
                            embedded
                            forceSection="labor"
                            onLiveDetailsChange={onLiveDetailsChange}
                        />
                    </div>
	                ) : (
	                    <div className="overflow-x-auto">
		                        <table className="w-full min-w-[1120px] border-collapse text-sm">
		                            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
		                                <tr>
		                                    <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold">설비</th>
		                                    <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold">업무/부서</th>
		                                    <th className="w-24 border-r border-slate-200 px-4 py-3 text-right font-semibold">예산 수량</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">예산</th>
		                                    <th className="w-24 border-r border-slate-200 px-4 py-3 text-right font-semibold">집행 수량</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">집행</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">잔액</th>
		                                    <th className="w-24 border-r border-slate-200 px-4 py-3 text-right font-semibold">집행률</th>
		                                    <th className="w-28 px-4 py-3 text-center font-semibold">상태</th>
		                                </tr>
		                            </thead>
		                            <tbody className="divide-y divide-slate-200 text-slate-700">
		                                {rows.length === 0 && (
		                                    <tr>
		                                        <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={9}>
		                                            표시할 인건비 데이터가 없습니다.
		                                        </td>
		                                    </tr>
		                                )}
	
		                                {phaseGroups.map((group) => (
		                                    <React.Fragment key={group.phase}>
		                                        <tr className={cn('border-y border-slate-200', group.phase === 'fabrication' ? 'bg-blue-50' : 'bg-emerald-50')}>
		                                            <td className="px-4 py-2 text-xs font-bold tracking-wide text-slate-700" colSpan={9}>
		                                                {group.label} 단계
		                                            </td>
		                                        </tr>

                                        {group.sourceGroups.map((sourceGroup) => {
                                            const sourcePercent = usagePercent(sourceGroup.budget, sourceGroup.execution);
	                                            return (
	                                                <React.Fragment key={`${group.phase}-${sourceGroup.source}`}>
		                                                    <tr className={cn(
		                                                        sourceGroup.source === '자체' ? 'bg-indigo-50/60' : 'bg-violet-50/60'
		                                                    )}>
		                                                        <td className="px-4 py-2 text-xs font-semibold tracking-wide text-slate-700" colSpan={9}>
		                                                            {sourceGroup.source} 인력
		                                                        </td>
		                                                    </tr>
	
		                                                    {sourceGroup.rows.map((row) => (
		                                                        <tr key={row.key}>
		                                                            <td className="border-r border-slate-200 px-4 py-3 font-medium">{row.equipmentName}</td>
		                                                            <td className="border-r border-slate-200 px-4 py-3">{row.taskName}</td>
		                                                            <td className="border-r border-slate-200 px-4 py-3 text-right">{formatQuantity(row.quantity)}</td>
		                                                            <td className="border-r border-slate-200 px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
		                                                            <td className="border-r border-slate-200 px-4 py-3 text-right">{formatQuantity(row.executionQuantity)}</td>
		                                                            <td className="border-r border-slate-200 px-4 py-3 text-right">{formatWon(row.execution)}</td>
		                                                            <td className={cn('border-r border-slate-200 px-4 py-3 text-right font-semibold', row.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
		                                                                {formatWon(row.remaining)}
		                                                            </td>
                                                            <td className="border-r border-slate-200 px-4 py-3 text-right text-xs font-semibold text-slate-600">
                                                                {usagePercent(row.budget, row.execution).toFixed(1)}%
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                                                            </td>
                                                        </tr>
                                                    ))}

		                                                    <tr className="bg-slate-100/80">
		                                                        <td className="px-4 py-2 text-right font-semibold text-slate-700" colSpan={2}>
		                                                            {sourceGroup.source} 소계
		                                                        </td>
		                                                        <td className="px-4 py-2 text-right font-semibold">{formatQuantity(sourceGroup.quantity)}</td>
		                                                        <td className="px-4 py-2 text-right font-semibold">{formatWon(sourceGroup.budget)}</td>
		                                                        <td className="px-4 py-2 text-right font-semibold">{formatQuantity(sourceGroup.executionQuantity)}</td>
		                                                        <td className="px-4 py-2 text-right font-semibold">{formatWon(sourceGroup.execution)}</td>
		                                                        <td className={cn('px-4 py-2 text-right font-semibold', sourceGroup.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
		                                                            {formatWon(sourceGroup.remaining)}
		                                                        </td>
                                                        <td className="px-4 py-2 text-right text-xs font-semibold text-slate-600">{sourcePercent.toFixed(1)}%</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <BudgetStatusBadge budget={sourceGroup.budget} execution={sourceGroup.execution} />
                                                        </td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}

	                                        <tr className={PHASE_TOTAL_THEME[group.phase]}>
	                                            <td className="px-4 py-3 text-right font-bold" colSpan={2}>{group.label} 인건비 소계</td>
	                                            <td className="px-4 py-3 text-right font-bold">{formatQuantity(group.quantity)}</td>
	                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.budget)}</td>
	                                            <td className="px-4 py-3 text-right font-bold">{formatQuantity(group.executionQuantity)}</td>
	                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.execution)}</td>
	                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.remaining)}</td>
	                                            <td className="px-4 py-3 text-right font-bold">{usagePercent(group.budget, group.execution).toFixed(1)}%</td>
	                                            <td className="px-4 py-3 text-center">
	                                                <BudgetStatusBadge budget={group.budget} execution={group.execution} />
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}

		                                {rows.length > 0 && (
		                                    <tr className="border-t-4 border-double border-slate-600 bg-slate-950 font-bold text-white">
		                                        <td className="px-4 py-4 text-center" colSpan={2}>프로젝트 인건비 총괄</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums">{formatQuantity(total.quantity)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums text-amber-300">{formatWon(total.budget)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums">{formatQuantity(total.executionQuantity)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums">{formatWon(total.execution)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums text-amber-300">{formatWon(remaining)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums">{totalPercent.toFixed(1)}%</td>
	                                        <td className="px-4 py-4 text-center">
	                                            <BudgetStatusBadge budget={total.budget} execution={total.execution} />
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const ExpenseTabContent = ({ rows, isInputMode, onLiveDetailsChange }) => {
    const visibleRows = rows.filter((row) => !(toNumber(row.budget) === 0 && toNumber(row.execution) === 0));
    const total = summarizeBudgetExecution(visibleRows);
    const remaining = total.budget - total.execution;
    const phaseGroups = buildRowsByPhaseAndSource(visibleRows);

    return (
        <div className="space-y-8">
            <TabCostMetricPanel
                panelBadge="경비"
                costKey="expense"
                budgetLabel="경비 총 예산"
                executionLabel="경비 집행금액"
                remainingLabel="경비 잔액"
                budget={total.budget}
                execution={total.execution}
                remaining={remaining}
            />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h3 className="text-sm font-bold tracking-wide text-slate-800">경비 상세 내역</h3>
                    {!isInputMode && <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">단위: 원</span>}
                </div>
                {isInputMode ? (
                    <div className="p-4">
                        <BudgetProjectEditor
                            embedded
                            forceSection="expense"
                            onLiveDetailsChange={onLiveDetailsChange}
                        />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
		                        <table className="w-full min-w-[1120px] border-collapse text-sm">
		                            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
		                                <tr>
		                                    <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold">설비</th>
		                                    <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold">경비 항목</th>
		                                    <th className="border-r border-slate-200 px-4 py-3 text-left font-semibold">산정 기준</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">예산</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">집행</th>
		                                    <th className="w-32 border-r border-slate-200 px-4 py-3 text-right font-semibold">잔액</th>
		                                    <th className="w-28 px-4 py-3 text-center font-semibold">상태</th>
		                                </tr>
		                            </thead>
		                            <tbody className="divide-y divide-slate-200 text-slate-700">
		                                {visibleRows.length === 0 && (
		                                    <tr>
		                                        <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={7}>
		                                            표시할 경비 데이터가 없습니다.
		                                        </td>
		                                    </tr>
		                                )}
	
		                                {phaseGroups.map((group) => (
		                                    <React.Fragment key={group.phase}>
		                                        <tr className={cn('border-y border-slate-200', group.phase === 'fabrication' ? 'bg-blue-50' : 'bg-emerald-50')}>
		                                            <td className="px-4 py-2 text-xs font-bold tracking-wide text-slate-700" colSpan={7}>
		                                                {group.label} 단계
		                                            </td>
		                                        </tr>
	
		                                        {group.sourceGroups.map((sourceGroup) => (
		                                            <React.Fragment key={`${group.phase}-${sourceGroup.source}`}>
		                                                <tr className={cn(
		                                                    sourceGroup.source === '자체' ? 'bg-indigo-50/60' : 'bg-violet-50/60'
		                                                )}>
		                                                    <td className="px-4 py-2 text-xs font-semibold tracking-wide text-slate-700" colSpan={7}>
		                                                        {sourceGroup.source} 경비
		                                                    </td>
		                                                </tr>
	
		                                                {sourceGroup.rows.map((row) => (
		                                                    <tr key={row.key}>
		                                                        <td className="border-r border-slate-200 px-4 py-3 font-medium">{row.equipmentName}</td>
		                                                        <td className="border-r border-slate-200 px-4 py-3">{row.expenseName}</td>
		                                                        <td className="border-r border-slate-200 px-4 py-3 text-slate-600">{row.basis || '-'}</td>
		                                                        <td className="border-r border-slate-200 px-4 py-3 text-right font-semibold">{formatWon(row.budget)}</td>
		                                                        <td className="border-r border-slate-200 px-4 py-3 text-right">{formatWon(row.execution)}</td>
		                                                        <td className={cn('border-r border-slate-200 px-4 py-3 text-right font-semibold', row.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
		                                                            {formatWon(row.remaining)}
	                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <BudgetStatusBadge budget={row.budget} execution={row.execution} />
                                                        </td>
                                                    </tr>
                                                ))}

		                                                <tr className="bg-slate-100/80">
		                                                    <td className="px-4 py-2 text-right font-semibold text-slate-700" colSpan={3}>
		                                                        {sourceGroup.source} 소계
		                                                    </td>
		                                                    <td className="px-4 py-2 text-right font-semibold">{formatWon(sourceGroup.budget)}</td>
		                                                    <td className="px-4 py-2 text-right font-semibold">{formatWon(sourceGroup.execution)}</td>
		                                                    <td className={cn('px-4 py-2 text-right font-semibold', sourceGroup.remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
		                                                        {formatWon(sourceGroup.remaining)}
	                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <BudgetStatusBadge budget={sourceGroup.budget} execution={sourceGroup.execution} />
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        ))}

		                                        <tr className={PHASE_TOTAL_THEME[group.phase]}>
		                                            <td className="px-4 py-3 text-right font-bold" colSpan={3}>{group.label} 경비 소계</td>
		                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.budget)}</td>
		                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.execution)}</td>
		                                            <td className="px-4 py-3 text-right font-bold">{formatWon(group.remaining)}</td>
		                                            <td className="px-4 py-3 text-center">
		                                                <BudgetStatusBadge budget={group.budget} execution={group.execution} />
	                                            </td>
	                                        </tr>
                                    </React.Fragment>
                                ))}

		                                {visibleRows.length > 0 && (
		                                    <tr className="border-t-4 border-double border-slate-600 bg-slate-950 font-bold text-white">
		                                        <td className="px-4 py-4 text-center" colSpan={3}>프로젝트 경비 총괄</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums text-amber-300">{formatWon(total.budget)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums">{formatWon(total.execution)}</td>
		                                        <td className="whitespace-nowrap px-4 py-4 text-right text-lg tabular-nums text-amber-300">{formatWon(remaining)}</td>
		                                        <td className="px-4 py-4 text-center">
		                                            <BudgetStatusBadge budget={total.budget} execution={total.execution} />
	                                        </td>
	                                    </tr>
	                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

export default BudgetProjectBudget;
