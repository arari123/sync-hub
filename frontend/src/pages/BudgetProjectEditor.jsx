import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, Package, Save, Users, Wallet } from 'lucide-react';
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

const DEFAULT_LABOR_DEPARTMENTS = ['PM', '설계', 'SW', '검사기술', '제어1', '제어2'];
const OUTSOURCE_LABOR_DEPARTMENTS = ['PM', '설계', '기구', '전장', '제어', 'SW'];
const STAFFING_TYPE_OPTIONS = ['자체', '외주'];
const EXPENSE_TYPE_OPTIONS = ['자체', '외주'];
const INHOUSE_LABOR_RATE_PER_HOUR = 35000;
const OUTSOURCE_LABOR_RATE_PER_DAY = 400000;

const DEFAULT_BUDGET_SETTINGS = {
    labor_departments: DEFAULT_LABOR_DEPARTMENTS,
    installation_locale: 'domestic',
    labor_days_per_week_domestic: 5,
    labor_days_per_week_overseas: 7,
    labor_days_per_month_domestic: 22,
    labor_days_per_month_overseas: 30,
    project_overhead_ratio: 3,
    consumable_ratio_fabrication: 2,
    consumable_ratio_installation: 2,
    tool_ratio_fabrication: 1,
    tool_ratio_installation: 1,
    domestic_trip_daily: 36000,
    domestic_lodging_daily: 70000,
    domestic_transport_per_km: 250,
    domestic_distance_km: 0,
    overseas_trip_daily: 120000,
    overseas_lodging_daily: 200000,
    overseas_airfare_daily: 350000,
    overseas_transport_daily_count: 1,
};

const AUTO_EXPENSE_FORMULAS = {
    PROJECT_OPERATION: 'project_operation',
    CONSUMABLES: 'consumables',
    TOOLS: 'tools',
    TRIP: 'trip',
    LODGING: 'lodging',
    DOMESTIC_TRANSPORT: 'domestic_transport',
    OVERSEAS_TRANSPORT: 'overseas_transport',
    AIRFARE: 'airfare',
    LOCAL_HIRE: 'local_hire',
    DOBI: 'dobi',
    OTHER: 'other',
};
const AUTO_EXPENSE_FORMULA_BY_NAME = {
    '프로젝트 운영비': AUTO_EXPENSE_FORMULAS.PROJECT_OPERATION,
    '소모품비': AUTO_EXPENSE_FORMULAS.CONSUMABLES,
    '공구비': AUTO_EXPENSE_FORMULAS.TOOLS,
    '출장비': AUTO_EXPENSE_FORMULAS.TRIP,
    '숙박비': AUTO_EXPENSE_FORMULAS.LODGING,
    '국내 교통비': AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT,
    '해외 교통비': AUTO_EXPENSE_FORMULAS.OVERSEAS_TRANSPORT,
    '항공료': AUTO_EXPENSE_FORMULAS.AIRFARE,
    '현지인원채용 비용': AUTO_EXPENSE_FORMULAS.LOCAL_HIRE,
    '도비 비용': AUTO_EXPENSE_FORMULAS.DOBI,
    '기타 비용': AUTO_EXPENSE_FORMULAS.OTHER,
};
const HIDDEN_EXPENSE_QUANTITY_FORMULAS = new Set([
    AUTO_EXPENSE_FORMULAS.PROJECT_OPERATION,
    AUTO_EXPENSE_FORMULAS.CONSUMABLES,
    AUTO_EXPENSE_FORMULAS.TOOLS,
    AUTO_EXPENSE_FORMULAS.LOCAL_HIRE,
    AUTO_EXPENSE_FORMULAS.DOBI,
]);

const COMMON_EQUIPMENT_NAME = '공통';

function toNumber(value) {
    const number = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(number) ? number : 0;
}

function parseLockAutoValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return false;
    return ['잠금', 'locked', 'true', '1', 'yes', 'y'].includes(text);
}

function normalizeExpenseType(value) {
    const normalized = String(value || '').trim();
    return normalized === '외주' ? '외주' : '자체';
}

function normalizeStaffingType(value) {
    const normalized = String(value || '').trim();
    return normalized === '외주' ? '외주' : '자체';
}

function resolveLaborStaffingType(row) {
    const explicit = String(row?.staffing_type || '').trim();
    if (explicit === '외주' || explicit === '자체') return explicit;
    const unit = String(row?.unit || '').trim().toUpperCase();
    if (unit === 'D') return '외주';
    return '자체';
}

function resolveExpenseAutoFormula(row) {
    const explicit = String(row?.auto_formula || '').trim();
    if (explicit) return explicit;
    const name = String(row?.expense_name || '').trim();
    return AUTO_EXPENSE_FORMULA_BY_NAME[name] || '';
}

function shouldHideExpenseQuantity(row) {
    const formula = resolveExpenseAutoFormula(row);
    return HIDDEN_EXPENSE_QUANTITY_FORMULAS.has(formula);
}

function normalizeEquipmentName(value) {
    return String(value || '').trim();
}

function uniqueEquipmentNames(values) {
    const unique = [];
    const seen = new Set();
    (values || []).forEach((value) => {
        const normalized = normalizeEquipmentName(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        unique.push(normalized);
    });
    return unique;
}

function extractEquipmentNamesFromDetails(detailsObj) {
    const names = [];
    Object.values(SECTION_META).forEach((meta) => {
        (detailsObj?.[meta.budgetKey] || []).forEach((row) => {
            names.push(normalizeEquipmentName(row?.equipment_name));
        });
        (detailsObj?.[meta.executionKey] || []).forEach((row) => {
            names.push(normalizeEquipmentName(row?.equipment_name));
        });
    });
    return uniqueEquipmentNames(names);
}

function resolveEquipmentNames({ projectType, equipmentItems = [], detailsObj }) {
    if (projectType !== 'equipment') return [COMMON_EQUIPMENT_NAME];
    const namesFromEquipment = equipmentItems.map((item) => normalizeEquipmentName(item?.equipment_name));
    const namesFromDetails = extractEquipmentNamesFromDetails(detailsObj);
    return uniqueEquipmentNames([...namesFromEquipment, ...namesFromDetails]);
}

function normalizeDetailsWithEquipment(detailsObj, equipmentName) {
    const target = normalizeEquipmentName(equipmentName);
    if (!target) return detailsObj;
    const result = { ...detailsObj };
    Object.values(SECTION_META).forEach((meta) => {
        result[meta.budgetKey] = (result[meta.budgetKey] || []).map((row) => ({
            ...row,
            equipment_name: normalizeEquipmentName(row?.equipment_name) || target,
            ...(meta.budgetKey === SECTION_META.expense.budgetKey
                ? {
                    expense_type: normalizeExpenseType(row?.expense_type),
                    auto_formula: resolveExpenseAutoFormula(row),
                }
                : {}),
            ...(meta.budgetKey === SECTION_META.labor.budgetKey
                ? { staffing_type: resolveLaborStaffingType(row) }
                : {}),
        }));
        result[meta.executionKey] = (result[meta.executionKey] || []).map((row) => ({
            ...row,
            equipment_name: normalizeEquipmentName(row?.equipment_name) || target,
            ...(meta.executionKey === SECTION_META.expense.executionKey
                ? { expense_type: normalizeExpenseType(row?.expense_type) }
                : {}),
            ...(meta.executionKey === SECTION_META.labor.executionKey
                ? { staffing_type: resolveLaborStaffingType(row) }
                : {}),
        }));
    });
    return result;
}

function normalizeLocationType(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['overseas', 'abroad', '해외'].includes(normalized)) return 'overseas';
    return 'domestic';
}

function mergeBudgetSettings(settings) {
    const merged = { ...DEFAULT_BUDGET_SETTINGS, ...(settings || {}) };
    const departments = Array.isArray(merged.labor_departments)
        ? merged.labor_departments.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    merged.labor_departments = departments.length ? departments : DEFAULT_LABOR_DEPARTMENTS;
    merged.installation_locale = normalizeLocationType(merged.installation_locale);
    return merged;
}

function detectInstallationLocaleFromProject(project, fallbackLocale = 'domestic') {
    const site = String(project?.installation_site || '').trim();
    const lowered = site.toLowerCase();
    const overseasKeywords = ['해외', 'overseas', 'abroad', 'global'];
    const domesticKeywords = [
        '국내',
        '대한민국',
        '한국',
        'korea',
        'seoul',
        'busan',
        'incheon',
        'daejeon',
        'daegu',
        'ulsan',
        'gwangju',
    ];

    let locale = normalizeLocationType(fallbackLocale);
    if (overseasKeywords.some((token) => lowered.includes(token))) {
        locale = 'overseas';
    } else if (domesticKeywords.some((token) => lowered.includes(token))) {
        locale = 'domestic';
    }

    const label = locale === 'overseas'
        ? `해외${site ? ` (${site})` : ''}`
        : `국내${site ? ` (${site})` : ''}`;

    return { locale, label };
}

function laborUnitToHours(unit, locationType, settings) {
    const normalizedUnit = String(unit || 'H').trim().toUpperCase();
    if (normalizedUnit === 'H') return 1;
    if (normalizedUnit === 'D') return 8;
    const merged = mergeBudgetSettings(settings);
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

function isBudgetRowEmpty(row, section) {
    if (!row) return true;
    if (section === 'material') {
        return !(row.unit_name || row.part_name || row.spec || row.quantity || row.unit_price || row.memo);
    }
    if (section === 'labor') {
        return !(row.task_name || row.worker_type || row.quantity || row.memo);
    }
    return !(row.expense_name || row.basis || row.amount || row.memo);
}

function isExecutionRowEmpty(row, section) {
    if (!row) return true;
    if (section === 'material') {
        return !(row.unit_name || row.part_name || row.spec || row.executed_amount || row.memo);
    }
    if (section === 'labor') {
        return !(row.task_name || row.worker_type || row.executed_amount || row.memo);
    }
    return !(row.expense_name || row.basis || row.executed_amount || row.memo);
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
            staffing_type: '자체',
            worker_type: '',
            unit: 'H',
            quantity: '',
            location_type: 'domestic',
            hourly_rate: '',
            phase,
            memo: '',
        };
    }
    return {
        equipment_name: '',
        expense_type: '자체',
        expense_name: '',
        lock_auto: false,
        basis: '',
        quantity: '',
        amount: 0,
        is_auto: false,
        auto_formula: '',
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
            staffing_type: '자체',
            worker_type: '',
            executed_amount: 0,
            phase,
            memo: '',
        };
    }
    return {
        equipment_name: '',
        expense_type: '자체',
        expense_name: '',
        basis: '',
        executed_amount: 0,
        phase,
        memo: '',
    };
}

function _injectKeyBuffers(list, builder, minRowsPerPhase = 50) {
    const rows = (list || []).map((item) => ({ ...item, phase: item.phase || 'fabrication' }));
    if (minRowsPerPhase <= 0) {
        return rows;
    }
    const fabCount = rows.filter((item) => item.phase === 'fabrication').length;
    const instCount = rows.filter((item) => item.phase === 'installation').length;
    const fabBuffer = Array.from({ length: Math.max(0, minRowsPerPhase - fabCount) }, () => builder('fabrication'));
    const instBuffer = Array.from({ length: Math.max(0, minRowsPerPhase - instCount) }, () => builder('installation'));
    return [...rows, ...fabBuffer, ...instBuffer];
}

function trimMaterialEmptyRowsByScope(list, rowIsEmptyFn, maxEmptyRowsPerScope = 50) {
    const rows = (list || []).map((item) => ({ ...item, phase: item.phase || 'fabrication' }));
    const emptyCountByScope = new Map();
    const normalizedMax = Math.max(0, Number(maxEmptyRowsPerScope) || 0);
    return rows.filter((row) => {
        if (!rowIsEmptyFn(row, 'material')) return true;
        const phase = (row.phase || 'fabrication') === 'installation' ? 'installation' : 'fabrication';
        const equipmentName = normalizeEquipmentName(row?.equipment_name) || COMMON_EQUIPMENT_NAME;
        const scopeKey = `${equipmentName}::${phase}`;
        const currentCount = emptyCountByScope.get(scopeKey) || 0;
        if (currentCount >= normalizedMax) return false;
        emptyCountByScope.set(scopeKey, currentCount + 1);
        return true;
    });
}

function injectBuffers(detailsObj) {
    const result = { ...detailsObj, budget_settings: mergeBudgetSettings(detailsObj?.budget_settings) };
    Object.keys(SECTION_META).forEach((section) => {
        const meta = SECTION_META[section];
        const minRowsPerPhase = section === 'material' ? 50 : 0;
        const budgetSource = section === 'material'
            ? trimMaterialEmptyRowsByScope(result[meta.budgetKey], isBudgetRowEmpty, 50)
            : result[meta.budgetKey];
        const executionSource = section === 'material'
            ? trimMaterialEmptyRowsByScope(result[meta.executionKey], isExecutionRowEmpty, 50)
            : result[meta.executionKey];
        result[meta.budgetKey] = _injectKeyBuffers(
            budgetSource,
            (phase) => buildEmptyBudgetRow(section, phase),
            minRowsPerPhase,
        );
        result[meta.executionKey] = _injectKeyBuffers(
            executionSource,
            (phase) => buildEmptyExecutionRow(section, phase),
            minRowsPerPhase,
        );
    });
    return result;
}

function calcBudgetAmount(row, section, settings) {
    if (section === 'material') return toNumber(row.quantity) * toNumber(row.unit_price);
    if (section === 'labor') {
        const phase = (row?.phase || 'fabrication') === 'installation' ? 'installation' : 'fabrication';
        const locationType = phase === 'installation'
            ? normalizeLocationType(settings?.installation_locale)
            : 'domestic';
        const hours = laborUnitToHours(row.unit, locationType, settings);
        const quantity = toNumber(row.quantity);
        const headcount = toNumber(row.headcount) || 1;
        const isOutsource = resolveLaborStaffingType(row) === '외주';
        if (isOutsource) {
            const days = hours / 8;
            return quantity * days * OUTSOURCE_LABOR_RATE_PER_DAY * headcount;
        }
        return quantity * hours * INHOUSE_LABOR_RATE_PER_HOUR * headcount;
    }
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
        budget_settings: mergeBudgetSettings(),
    }));
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [currentPhase, setCurrentPhase] = useState('fabrication');
    const [currentExpenseType, setCurrentExpenseType] = useState('자체');
    const [equipmentNames, setEquipmentNames] = useState([]);
    const [currentEquipmentName, setCurrentEquipmentName] = useState('');
    const [sortState, setSortState] = useState({ key: '', direction: 'none' });
    const [isMaterialUnitDragOver, setIsMaterialUnitDragOver] = useState(false);

    const canEditProject = project?.can_edit !== false;
    const isEquipmentProject = (project?.project_type || 'equipment') === 'equipment';
    const activeEquipmentName = isEquipmentProject
        ? normalizeEquipmentName(currentEquipmentName || equipmentNames[0] || '')
        : COMMON_EQUIPMENT_NAME;
    const activeExpenseType = normalizeExpenseType(currentExpenseType);
    const isConfirmed = version?.status === 'confirmed';
    const currentStage = (project?.current_stage || version?.stage || 'review').toLowerCase();
    const isExecutionStage = EXECUTION_STAGES.has(currentStage);
    const budgetSettings = useMemo(() => mergeBudgetSettings(details?.budget_settings), [details?.budget_settings]);
    const projectInstallationInfo = useMemo(
        () => detectInstallationLocaleFromProject(project, budgetSettings.installation_locale),
        [budgetSettings.installation_locale, project],
    );
    const projectBusinessTripDistanceKm = useMemo(
        () => Math.max(0, toNumber(project?.business_trip_distance_km)),
        [project?.business_trip_distance_km],
    );
    const effectiveBudgetSettings = useMemo(
        () => ({
            ...budgetSettings,
            installation_locale: projectInstallationInfo.locale,
            domestic_distance_km: projectBusinessTripDistanceKm,
        }),
        [budgetSettings, projectBusinessTripDistanceKm, projectInstallationInfo.locale],
    );

    const activeMode = isExecutionStage ? 'execution' : 'budget';
    const activeKey = activeMode === 'execution' ? SECTION_META[section].executionKey : SECTION_META[section].budgetKey;
    const rows = details[activeKey] || [];

    const canEditExecutionFields = canEditProject && isExecutionStage;
    const canEditBudgetFields = canEditProject && !isConfirmed && !isExecutionStage;
    const canEditScopedRows = (canEditExecutionFields || canEditBudgetFields)
        && (!isEquipmentProject || Boolean(activeEquipmentName));

    const aggregationModeLabel = activeMode === 'execution' ? '집행금액' : '예산';
    const entryModeLabel = activeMode === 'execution' ? '집행금액 입력 모드' : '예산 입력 모드';
    const currentPhaseLabel = currentPhase === 'installation' ? '설치' : '제작';

    const displayRows = useMemo(
        () => rows
            .map((row, index) => ({ ...row, originalIndex: index }))
            .filter((row) => {
                if ((row.phase || 'fabrication') !== currentPhase) return false;
                if (!activeEquipmentName) return false;
                if (normalizeEquipmentName(row.equipment_name) !== activeEquipmentName) return false;
                if (section === 'labor') return String(row?.task_name || '').trim().length > 0;
                if (section === 'expense') {
                    if (normalizeExpenseType(row?.expense_type) !== activeExpenseType) return false;
                    return String(row?.expense_name || '').trim().length > 0;
                }
                return true;
            }),
        [rows, currentPhase, activeEquipmentName, activeExpenseType, section],
    );

    const sidebarSummary = useMemo(() => {
        const summary = {
            material: { fabrication_total: 0, installation_total: 0, equipments: [] },
            labor: { fabrication_total: 0, installation_total: 0 },
            expense: { fabrication_total: 0, installation_total: 0 },
        };
        const materialEquipmentMap = {};

        Object.entries(SECTION_META).forEach(([sectionKey, meta]) => {
            const sourceRows = details[activeMode === 'execution' ? meta.executionKey : meta.budgetKey] || [];
            sourceRows.forEach((row) => {
                const phase = (row.phase || 'fabrication') === 'installation' ? 'installation' : 'fabrication';
                const amount = activeMode === 'execution'
                    ? toNumber(row.executed_amount)
                    : calcBudgetAmount(row, sectionKey, effectiveBudgetSettings);
                const phaseKey = `${phase}_total`;
                summary[sectionKey][phaseKey] += amount;

                if (sectionKey !== 'material') return;

                const equipmentName = (row.equipment_name || '미지정 설비').trim() || '미지정 설비';
                const unitName = ((row.unit_name || row.part_name || '미지정').trim() || '미지정');
                if (!materialEquipmentMap[equipmentName]) {
                    materialEquipmentMap[equipmentName] = {
                        name: equipmentName,
                        fabrication_total: 0,
                        installation_total: 0,
                        total: 0,
                        units: {},
                        unitOrder: [],
                    };
                    summary.material.equipments.push(materialEquipmentMap[equipmentName]);
                }
                const equipmentBucket = materialEquipmentMap[equipmentName];
                equipmentBucket[phaseKey] += amount;
                equipmentBucket.total += amount;
                if (!equipmentBucket.units[unitName]) {
                    equipmentBucket.units[unitName] = {
                        name: unitName,
                        fabrication_total: 0,
                        installation_total: 0,
                        total: 0,
                    };
                    equipmentBucket.unitOrder.push(equipmentBucket.units[unitName]);
                }
                equipmentBucket.units[unitName][phaseKey] += amount;
                equipmentBucket.units[unitName].total += amount;
            });
        });

        summary.material.equipments.forEach((item) => {
            item.units = item.unitOrder;
            delete item.unitOrder;
        });
        return summary;
    }, [details, activeMode, effectiveBudgetSettings]);

    const aggregation = useMemo(() => ({
        total: Number(sidebarSummary?.[section]?.fabrication_total || 0) + Number(sidebarSummary?.[section]?.installation_total || 0),
        equipments: sidebarSummary?.material?.equipments || [],
    }), [sidebarSummary, section]);
    const materialUnitLibrary = useMemo(() => {
        const executionRows = details.execution_material_items || [];
        const budgetRows = details.material_items || [];
        const useExecutionRows = activeMode === 'execution'
            && executionRows.some((row) => !isExecutionRowEmpty(row, 'material'));
        const sourceRows = useExecutionRows ? executionRows : budgetRows;
        const rowIsEmpty = useExecutionRows ? isExecutionRowEmpty : isBudgetRowEmpty;
        const buckets = new Map();

        sourceRows.forEach((row) => {
            if (rowIsEmpty(row, 'material')) return;
            const phase = (row.phase || 'fabrication') === 'installation' ? 'installation' : 'fabrication';
            const phaseLabel = phase === 'installation' ? '설치' : '제작';
            const unitName = String(row?.unit_name || '').trim() || String(row?.part_name || '').trim();
            if (!unitName) return;
            const equipmentName = normalizeEquipmentName(row?.equipment_name) || '미지정 설비';
            const key = `${equipmentName}::${phase}::${unitName}`;
            const amount = useExecutionRows
                ? toNumber(row.executed_amount)
                : calcBudgetAmount(row, 'material', effectiveBudgetSettings);

            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    equipment_name: equipmentName,
                    phase,
                    phase_label: phaseLabel,
                    unit_name: unitName,
                    total: 0,
                    items: [],
                });
            }

            const bucket = buckets.get(key);
            bucket.total += amount;
            bucket.items.push({
                unit_name: unitName,
                part_name: String(row?.part_name || '').trim(),
                spec: String(row?.spec || '').trim(),
                quantity: toNumber(row?.quantity),
                unit_price: toNumber(row?.unit_price),
                executed_amount: toNumber(row?.executed_amount),
                memo: String(row?.memo || '').trim(),
            });
        });

        return Array.from(buckets.values()).sort((a, b) => {
            const equipmentCompare = String(a.equipment_name).localeCompare(String(b.equipment_name), 'ko-KR');
            if (equipmentCompare !== 0) return equipmentCompare;
            if (a.phase !== b.phase) return a.phase === 'fabrication' ? -1 : 1;
            if (b.total !== a.total) return b.total - a.total;
            return String(a.unit_name).localeCompare(String(b.unit_name), 'ko-KR');
        });
    }, [activeMode, details.execution_material_items, details.material_items, effectiveBudgetSettings]);

    const budgetColumnsBySection = useMemo(() => ({
        material: [
            { key: 'unit_name', label: '유닛', width: 'w-32' },
            { key: 'part_name', label: '파츠명', width: 'w-40' },
            { key: 'spec', label: '규격/모델명', width: 'w-48' },
            { key: 'quantity', label: '수량', width: 'w-20', type: 'number' },
            { key: 'unit_price', label: '단가', width: 'w-32', type: 'number' },
            { key: 'line_total', label: '합계', width: 'w-36', type: 'number', readonly: true, computed: (row) => toNumber(row.quantity) * toNumber(row.unit_price) },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        labor: [
            { key: 'task_name', label: '부서', width: 'w-40', readonly: true },
            { key: 'staffing_type', label: '구분', width: 'w-24', options: STAFFING_TYPE_OPTIONS, readonly: true },
            { key: 'worker_type', label: '직군/메모', width: 'w-32' },
            { key: 'unit', label: '단위', width: 'w-20', options: ['H', 'D', 'W', 'M'] },
            { key: 'quantity', label: '시간/기간', width: 'w-20', type: 'number' },
            {
                key: 'line_total',
                label: '금액',
                width: 'w-36',
                type: 'number',
                readonly: true,
                computed: (row) => calcBudgetAmount(row, 'labor', effectiveBudgetSettings),
            },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        expense: [
            { key: 'expense_name', label: '경비 항목', width: 'w-48', readonly: true },
            { key: 'lock_auto', label: '잠금', width: 'w-20', options: ['해제', '잠금'] },
            { key: 'basis', label: '산정 기준', width: 'w-48', readonly: true },
            { key: 'quantity', label: '횟수/MD', width: 'w-24', type: 'number' },
            { key: 'amount', label: '예산금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
    }), [effectiveBudgetSettings]);

    const executionColumnsBySection = useMemo(() => ({
        material: [
            { key: 'unit_name', label: '유닛(집행)', width: 'w-32' },
            { key: 'part_name', label: '파츠(집행)', width: 'w-40' },
            { key: 'spec', label: '규격/메모', width: 'w-48' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        labor: [
            { key: 'task_name', label: '작업명(집행)', width: 'w-40', readonly: true },
            { key: 'staffing_type', label: '구분', width: 'w-24', options: STAFFING_TYPE_OPTIONS, readonly: true },
            { key: 'worker_type', label: '직군(집행)', width: 'w-32' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        expense: [
            { key: 'expense_name', label: '경비 항목(집행)', width: 'w-48' },
            { key: 'basis', label: '산정 기준(집행)', width: 'w-48' },
            { key: 'executed_amount', label: '집행금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
    }), []);

    const columns = activeMode === 'execution' ? executionColumnsBySection[section] : budgetColumnsBySection[section];
    const visibleColumns = useMemo(() => columns, [columns]);
    const sortedDisplayRows = useMemo(() => {
        if (!sortState?.key || sortState.direction === 'none') return displayRows;
        const next = [...displayRows];
        const targetColumn = visibleColumns.find((item) => item.key === sortState.key);
        const isNumeric = targetColumn?.type === 'number';
        next.sort((a, b) => {
            const rawA = targetColumn?.computed ? targetColumn.computed(a) : a?.[sortState.key];
            const rawB = targetColumn?.computed ? targetColumn.computed(b) : b?.[sortState.key];
            const valueA = isNumeric ? toNumber(rawA) : String(rawA || '').toLowerCase();
            const valueB = isNumeric ? toNumber(rawB) : String(rawB || '').toLowerCase();
            if (valueA < valueB) return sortState.direction === 'asc' ? -1 : 1;
            if (valueA > valueB) return sortState.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return next;
    }, [displayRows, sortState, visibleColumns]);
    const autoCompleteOptions = useMemo(() => {
        const unitSet = new Set();
        const laborDeptSet = new Set([
            ...(budgetSettings.labor_departments || DEFAULT_LABOR_DEPARTMENTS),
            ...OUTSOURCE_LABOR_DEPARTMENTS,
        ]);
        (details.material_items || []).forEach((row) => {
            const unitName = String(row?.unit_name || '').trim();
            if (unitName) unitSet.add(unitName);
        });
        (details.labor_items || []).forEach((row) => {
            const taskName = String(row?.task_name || '').trim();
            if (taskName) laborDeptSet.add(taskName);
        });
        return {
            unit_name: Array.from(unitSet),
            task_name: Array.from(laborDeptSet),
        };
    }, [details, budgetSettings]);
    const canEditActiveRows = activeMode === 'execution' ? canEditExecutionFields : canEditBudgetFields;
    const canSave = canEditScopedRows;

    const load = async () => {
        if (!projectId) return;
        setIsLoading(true);
        setError('');
        try {
            const versionResp = await api.get(`/budget/projects/${projectId}/versions`);
            const payload = versionResp?.data || {};
            setProject(payload.project || null);
            const projectType = (payload?.project?.project_type || 'equipment');

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
                budget_settings: mergeBudgetSettings(),
            };
            let equipmentItems = [];
            try {
                const equipmentResp = await api.get(`/budget/versions/${currentVersion.id}/equipments`);
                equipmentItems = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
            } catch (_err) {
                equipmentItems = [];
            }
            const resolvedEquipmentNames = resolveEquipmentNames({
                projectType,
                equipmentItems,
                detailsObj: loadedDetails,
            });
            const normalizedDetails = normalizeDetailsWithEquipment(
                loadedDetails,
                projectType === 'equipment'
                    ? resolvedEquipmentNames[0]
                    : COMMON_EQUIPMENT_NAME,
            );

            setEquipmentNames(resolvedEquipmentNames);
            setCurrentEquipmentName((prev) => (
                resolvedEquipmentNames.includes(prev)
                    ? prev
                    : (resolvedEquipmentNames[0] || '')
            ));
            setDetails(injectBuffers(normalizedDetails));
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

    const addLaborDepartmentRow = ({ department, staffingType }) => {
        const targetDepartment = String(department || '').trim();
        const normalizedStaffingType = staffingType === '외주' ? '외주' : '자체';
        if (!targetDepartment || !activeEquipmentName) return;
        setDetails((prev) => {
            const source = [...(prev.labor_items || [])];
            const phaseRows = source
                .filter((row) => (row.phase || 'fabrication') === currentPhase)
                .filter((row) => normalizeEquipmentName(row?.equipment_name) === activeEquipmentName)
                .filter((row) => resolveLaborStaffingType(row) === normalizedStaffingType);
            const duplicateCount = phaseRows.filter((row) => {
                const name = String(row.task_name || '').trim();
                return name === targetDepartment || name.startsWith(`${targetDepartment}(`);
            }).length;
            const nextDepartmentName = duplicateCount > 0
                ? `${targetDepartment}(${duplicateCount + 1})`
                : targetDepartment;

            const newRow = {
                ...buildEmptyBudgetRow('labor', currentPhase),
                equipment_name: activeEquipmentName,
                task_name: nextDepartmentName,
                staffing_type: normalizedStaffingType,
                unit: normalizedStaffingType === '외주' ? 'D' : 'H',
                location_type: currentPhase === 'installation'
                    ? projectInstallationInfo.locale
                    : 'domestic',
            };
            const firstEmptyIndex = source.findIndex(
                (row) => (
                    (row.phase || 'fabrication') === currentPhase
                    && normalizeEquipmentName(row?.equipment_name) === activeEquipmentName
                    && isBudgetRowEmpty(row, 'labor')
                ),
            );
            if (firstEmptyIndex >= 0) {
                source[firstEmptyIndex] = { ...source[firstEmptyIndex], ...newRow };
            } else {
                source.push(newRow);
            }

            return {
                ...prev,
                labor_items: source,
            };
        });
    };

    const autoFillExpenseRows = useCallback(({ forceReset = false } = {}) => {
        setDetails((prev) => {
            if (!activeEquipmentName) return prev;
            const settings = mergeBudgetSettings(prev?.budget_settings);
            settings.installation_locale = projectInstallationInfo.locale;
            settings.domestic_distance_km = projectBusinessTripDistanceKm;
            const phase = currentPhase;
            const locale = phase === 'installation'
                ? projectInstallationInfo.locale
                : 'domestic';
            const targetEquipmentName = activeEquipmentName;
            const targetExpenseType = activeExpenseType;
            const isOutsourceExpense = targetExpenseType === '외주';
            const outsourceAutoFormulas = new Set([
                AUTO_EXPENSE_FORMULAS.TRIP,
                AUTO_EXPENSE_FORMULAS.LODGING,
                AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT,
                AUTO_EXPENSE_FORMULAS.OVERSEAS_TRANSPORT,
            ]);
            const fabricationManualFormulas = new Set([
                AUTO_EXPENSE_FORMULAS.TRIP,
                AUTO_EXPENSE_FORMULAS.LODGING,
                AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT,
            ]);

            const materialRows = prev.material_items || [];
            const laborRows = prev.labor_items || [];
            const expenseRows = prev.expense_items || [];
            const matchesCoreScope = (row, targetPhase = null) => {
                const phaseMatched = targetPhase
                    ? (row.phase || 'fabrication') === targetPhase
                    : true;
                if (!phaseMatched) return false;
                return normalizeEquipmentName(row?.equipment_name) === targetEquipmentName;
            };
            const matchesExpenseScope = (row, targetPhase = null) => (
                matchesCoreScope(row, targetPhase)
                && normalizeExpenseType(row?.expense_type) === targetExpenseType
            );

            const materialFabTotal = materialRows
                .filter((row) => matchesCoreScope(row, 'fabrication'))
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'material', settings), 0);
            const materialInstallTotal = materialRows
                .filter((row) => matchesCoreScope(row, 'installation'))
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'material', settings), 0);
            const materialTotal = materialFabTotal + materialInstallTotal;
            const laborFabTotal = laborRows
                .filter((row) => matchesCoreScope(row, 'fabrication'))
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'labor', settings), 0);
            const laborInstallTotal = laborRows
                .filter((row) => matchesCoreScope(row, 'installation'))
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'labor', settings), 0);
            const projectBudgetBase = materialTotal + laborFabTotal + laborInstallTotal;

            const installationManDays = laborRows
                .filter((row) => matchesCoreScope(row, 'installation'))
                .filter((row) => resolveLaborStaffingType(row) === targetExpenseType)
                .reduce((sum, row) => {
                    const locationType = projectInstallationInfo.locale;
                    const hours = toNumber(row.quantity) * laborUnitToHours(row.unit, locationType, settings);
                    return sum + (hours / 8);
                }, 0);
            const domesticTripDaily = toNumber(settings.domestic_trip_daily) || 36000;
            const domesticLodgingDaily = toNumber(settings.domestic_lodging_daily) || 70000;
            const domesticDistanceKm = toNumber(settings.domestic_distance_km) || 0;
            const domesticRoundTripDistanceKm = Math.max(0, domesticDistanceKm * 2);
            const domesticTransportPerKm = toNumber(settings.domestic_transport_per_km) || 250;
            const overseasTripDaily = toNumber(settings.overseas_trip_daily) || 120000;
            const overseasLodgingDaily = toNumber(settings.overseas_lodging_daily) || 200000;
            const overseasAirfareDaily = toNumber(settings.overseas_airfare_daily) || 350000;
            const overseasTransportDailyCount = toNumber(settings.overseas_transport_daily_count) || 1;
            const isDomesticExpenseFormula = phase === 'fabrication' || locale === 'domestic';
            const defaultTransportBundle = Math.ceil(installationManDays / 5);
            const defaultOverseasTransportCount = Math.ceil(installationManDays * overseasTransportDailyCount);
            const autoRows = [];
            const pushExpenseRow = ({
                formula,
                name,
                basis,
                amount = 0,
                quantity = '',
            }) => {
                const isFabricationManualFormula = phase === 'fabrication' && fabricationManualFormulas.has(formula);
                const autoEnabled = !isFabricationManualFormula
                    && (!isOutsourceExpense || outsourceAutoFormulas.has(formula));
                const basisText = isFabricationManualFormula
                    ? basis
                    : (autoEnabled ? basis : '수동 입력');
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    equipment_name: targetEquipmentName,
                    expense_type: targetExpenseType,
                    expense_name: name,
                    basis: basisText,
                    quantity: autoEnabled ? quantity : '',
                    amount: autoEnabled ? amount : 0,
                    is_auto: autoEnabled,
                    lock_auto: false,
                    auto_formula: formula,
                });
            };

            pushExpenseRow({
                formula: AUTO_EXPENSE_FORMULAS.PROJECT_OPERATION,
                name: '프로젝트 운영비',
                basis: `총 예산 기준 ${toNumber(settings.project_overhead_ratio)}%`,
                amount: Math.floor(projectBudgetBase * (toNumber(settings.project_overhead_ratio) / 100)),
            });
            pushExpenseRow({
                formula: AUTO_EXPENSE_FORMULAS.CONSUMABLES,
                name: '소모품비',
                basis: phase === 'fabrication'
                    ? `제작 재료비 ${toNumber(settings.consumable_ratio_fabrication)}%`
                    : `총 재료비 ${toNumber(settings.consumable_ratio_installation)}%`,
                amount: Math.floor((phase === 'fabrication' ? materialFabTotal : materialTotal) * (
                    phase === 'fabrication'
                        ? toNumber(settings.consumable_ratio_fabrication)
                        : toNumber(settings.consumable_ratio_installation)
                ) / 100),
            });
            pushExpenseRow({
                formula: AUTO_EXPENSE_FORMULAS.TOOLS,
                name: '공구비',
                basis: phase === 'fabrication'
                    ? `제작 재료비 ${toNumber(settings.tool_ratio_fabrication)}%`
                    : `총 재료비 ${toNumber(settings.tool_ratio_installation)}%`,
                amount: Math.floor((phase === 'fabrication' ? materialFabTotal : materialTotal) * (
                    phase === 'fabrication'
                        ? toNumber(settings.tool_ratio_fabrication)
                        : toNumber(settings.tool_ratio_installation)
                ) / 100),
            });

            if (phase === 'fabrication' || locale === 'domestic') {
                const tripQuantity = installationManDays;
                const lodgingQuantity = installationManDays;
                const transportQuantity = defaultTransportBundle;
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.TRIP,
                    name: '출장비',
                    basis: phase === 'fabrication'
                        ? `수동 입력 (횟수/MD * ${domesticTripDaily.toLocaleString('ko-KR')}원)`
                        : `출장 횟수/MD * ${domesticTripDaily.toLocaleString('ko-KR')}원`,
                    quantity: phase === 'fabrication' ? '' : tripQuantity,
                    amount: phase === 'fabrication' ? 0 : Math.floor(tripQuantity * domesticTripDaily),
                });
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.LODGING,
                    name: '숙박비',
                    basis: phase === 'fabrication'
                        ? `수동 입력 (횟수/MD * ${domesticLodgingDaily.toLocaleString('ko-KR')}원)`
                        : `숙박 횟수/MD * ${domesticLodgingDaily.toLocaleString('ko-KR')}원`,
                    quantity: phase === 'fabrication' ? '' : lodgingQuantity,
                    amount: phase === 'fabrication' ? 0 : Math.floor(lodgingQuantity * domesticLodgingDaily),
                });
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT,
                    name: '국내 교통비',
                    basis: `교통 횟수 * 왕복 ${domesticRoundTripDistanceKm.toLocaleString('ko-KR')}km * ${domesticTransportPerKm.toLocaleString('ko-KR')}원`,
                    quantity: phase === 'fabrication' ? '' : transportQuantity,
                    amount: phase === 'fabrication' ? 0 : Math.floor(transportQuantity * domesticRoundTripDistanceKm * domesticTransportPerKm),
                });
            } else {
                const tripQuantity = installationManDays;
                const lodgingQuantity = installationManDays;
                const transportQuantity = defaultOverseasTransportCount;
                const airfareQuantity = installationManDays;
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.TRIP,
                    name: '출장비',
                    basis: `출장 횟수/MD * ${overseasTripDaily.toLocaleString('ko-KR')}원`,
                    quantity: tripQuantity,
                    amount: Math.floor(tripQuantity * overseasTripDaily),
                });
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.LODGING,
                    name: '숙박비',
                    basis: `숙박 횟수/MD * ${overseasLodgingDaily.toLocaleString('ko-KR')}원`,
                    quantity: lodgingQuantity,
                    amount: Math.floor(lodgingQuantity * overseasLodgingDaily),
                });
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.OVERSEAS_TRANSPORT,
                    name: '해외 교통비',
                    basis: '해외 교통비 단가 수동 입력 (횟수 자동 제안)',
                    quantity: transportQuantity,
                    amount: 0,
                });
                pushExpenseRow({
                    formula: AUTO_EXPENSE_FORMULAS.AIRFARE,
                    name: '항공료',
                    basis: `항공 횟수/MD * ${overseasAirfareDaily.toLocaleString('ko-KR')}원`,
                    quantity: airfareQuantity,
                    amount: Math.floor(airfareQuantity * overseasAirfareDaily),
                });
            }

            [
                ['현지인원채용 비용', AUTO_EXPENSE_FORMULAS.LOCAL_HIRE],
                ['도비 비용', AUTO_EXPENSE_FORMULAS.DOBI],
                ['기타 비용', AUTO_EXPENSE_FORMULAS.OTHER],
            ].forEach(([name, formula]) => {
                pushExpenseRow({
                    formula,
                    name,
                    basis: '수동 입력',
                    amount: 0,
                });
            });

            const samePhaseRows = expenseRows.filter((row) => matchesExpenseScope(row, phase));
            const otherPhaseRows = expenseRows.filter((row) => !matchesExpenseScope(row, phase));
            const currentByFormula = {};
            const currentByName = {};
            const selectPreferredExpenseRow = (current, next) => {
                if (!current) return next;
                const currentLocked = Boolean(current?.lock_auto);
                const nextLocked = Boolean(next?.lock_auto);
                const currentManual = current?.is_auto !== true;
                const nextManual = next?.is_auto !== true;
                if (nextLocked && !currentLocked) return next;
                if (nextManual && !currentManual) return next;
                return current;
            };
            samePhaseRows.forEach((row) => {
                const normalizedName = String(row?.expense_name || '').trim();
                const formula = resolveExpenseAutoFormula(row);
                const normalizedRow = formula && String(row?.auto_formula || '').trim() !== formula
                    ? { ...row, auto_formula: formula }
                    : row;
                if (formula) {
                    currentByFormula[formula] = selectPreferredExpenseRow(
                        currentByFormula[formula],
                        normalizedRow,
                    );
                }
                if (normalizedName) {
                    currentByName[normalizedName] = selectPreferredExpenseRow(
                        currentByName[normalizedName],
                        normalizedRow,
                    );
                }
            });

            const nextPhaseRows = [];
            autoRows.forEach((generated) => {
                const current = currentByFormula[generated.auto_formula]
                    || currentByName[String(generated?.expense_name || '').trim()];
                const isLocked = Boolean(current?.lock_auto);
                if (!forceReset && current) {
                    const resolvedCurrentFormula = resolveExpenseAutoFormula(current) || generated.auto_formula;
                    nextPhaseRows.push({
                        ...current,
                        equipment_name: normalizeEquipmentName(current?.equipment_name || generated.equipment_name) || targetEquipmentName,
                        expense_type: normalizeExpenseType(current?.expense_type || generated.expense_type || targetExpenseType),
                        expense_name: String(current?.expense_name || generated.expense_name || '').trim()
                            || generated.expense_name,
                        basis: generated.basis,
                        auto_formula: resolvedCurrentFormula,
                    });
                    return;
                }
                if (isLocked) {
                    nextPhaseRows.push(current);
                    return;
                }
                nextPhaseRows.push({
                    ...generated,
                    equipment_name: normalizeEquipmentName(current?.equipment_name || generated.equipment_name) || targetEquipmentName,
                    expense_type: normalizeExpenseType(current?.expense_type || generated.expense_type || targetExpenseType),
                    quantity: generated.quantity,
                    amount: generated.amount,
                    memo: String(current?.memo || generated.memo || '').trim(),
                    lock_auto: Boolean(current?.lock_auto),
                });
            });

            if (!forceReset) {
                const includedFormulaKeys = new Set(
                    nextPhaseRows
                        .map((row) => resolveExpenseAutoFormula(row))
                        .filter(Boolean),
                );
                const includedNames = new Set(
                    nextPhaseRows
                        .map((row) => String(row?.expense_name || '').trim())
                        .filter(Boolean),
                );
                samePhaseRows.forEach((row) => {
                    const formula = resolveExpenseAutoFormula(row);
                    const normalizedName = String(row?.expense_name || '').trim();
                    if (formula) {
                        if (includedFormulaKeys.has(formula)) return;
                        includedFormulaKeys.add(formula);
                        if (normalizedName) includedNames.add(normalizedName);
                        nextPhaseRows.push(
                            String(row?.auto_formula || '').trim() === formula
                                ? row
                                : { ...row, auto_formula: formula },
                        );
                        return;
                    }
                    if (normalizedName && includedNames.has(normalizedName)) return;
                    if (normalizedName) includedNames.add(normalizedName);
                    nextPhaseRows.push(row);
                });
            } else {
                const autoExpenseNameSet = new Set(
                    autoRows.map((item) => String(item?.expense_name || '').trim()).filter(Boolean),
                );
                samePhaseRows.forEach((row) => {
                    if (!resolveExpenseAutoFormula(row)) {
                        const normalizedName = String(row?.expense_name || '').trim();
                        if (autoExpenseNameSet.has(normalizedName)) {
                            return;
                        }
                        nextPhaseRows.push(row);
                    }
                });
            }

            const dedupedPhaseRows = [];
            const seenAutoFormula = new Set();
            nextPhaseRows.forEach((row) => {
                const formulaKey = resolveExpenseAutoFormula(row);
                if (formulaKey) {
                    if (seenAutoFormula.has(formulaKey)) return;
                    seenAutoFormula.add(formulaKey);
                }
                dedupedPhaseRows.push(
                    formulaKey && String(row?.auto_formula || '').trim() !== formulaKey
                        ? { ...row, auto_formula: formulaKey }
                        : row,
                );
            });

            return {
                ...prev,
                expense_items: [...otherPhaseRows, ...dedupedPhaseRows],
            };
        });
    }, [activeEquipmentName, activeExpenseType, currentPhase, projectBusinessTripDistanceKm, projectInstallationInfo.locale]);

    const toggleSort = (columnKey) => {
        setSortState((prev) => {
            if (prev.key !== columnKey) {
                return { key: columnKey, direction: 'asc' };
            }
            if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' };
            if (prev.direction === 'desc') return { key: '', direction: 'none' };
            return { key: columnKey, direction: 'asc' };
        });
    };

    const updateRow = (index, key, value) => {
        setDetails((prev) => {
            const newList = [...(prev[activeKey] || [])];
            const row = { ...newList[index] };
            if (activeEquipmentName) {
                row.equipment_name = activeEquipmentName;
            }
            if (section === 'expense') {
                row.expense_type = activeExpenseType;
            }
            if (
                section === 'expense'
                && activeMode === 'budget'
                && key === 'quantity'
                && shouldHideExpenseQuantity(row)
            ) {
                row.quantity = '';
            } else if (['quantity', 'unit_price', 'amount', 'executed_amount'].includes(key)) {
                row[key] = toNumber(value);
            } else if (key === 'unit') {
                row[key] = String(value || '').toUpperCase();
            } else if (key === 'staffing_type') {
                row[key] = normalizeStaffingType(value);
            } else if (key === 'lock_auto') {
                row[key] = parseLockAutoValue(value);
            } else if (key === 'location_type') {
                row[key] = normalizeLocationType(value);
            } else {
                row[key] = value;
            }
            const resolvedExpenseFormula = section === 'expense' ? resolveExpenseAutoFormula(row) : '';
            if (section === 'expense' && resolvedExpenseFormula && !String(row?.auto_formula || '').trim()) {
                row.auto_formula = resolvedExpenseFormula;
            }
            if (
                section === 'expense'
                && activeMode === 'budget'
                && resolvedExpenseFormula
                && ['equipment_name', 'expense_name', 'basis', 'amount'].includes(key)
                && row.is_auto
            ) {
                row.is_auto = false;
            }
            if (section === 'labor' && activeMode === 'budget') {
                row.location_type = (row.phase || 'fabrication') === 'installation'
                    ? projectInstallationInfo.locale
                    : 'domestic';
            }
            if (
                section === 'expense'
                && activeMode === 'budget'
                && key === 'quantity'
                && resolvedExpenseFormula
            ) {
                const settings = mergeBudgetSettings(prev?.budget_settings);
                settings.installation_locale = projectInstallationInfo.locale;
                settings.domestic_distance_km = projectBusinessTripDistanceKm;
                const rowPhase = (row.phase || 'fabrication') === 'installation' ? 'installation' : 'fabrication';
                const locale = rowPhase === 'installation' ? projectInstallationInfo.locale : 'domestic';
                const qty = toNumber(row.quantity);
                if (resolvedExpenseFormula === AUTO_EXPENSE_FORMULAS.TRIP) {
                    const rate = (rowPhase === 'fabrication' || locale === 'domestic')
                        ? (toNumber(settings.domestic_trip_daily) || 36000)
                        : (toNumber(settings.overseas_trip_daily) || 120000);
                    row.amount = Math.floor(qty * rate);
                } else if (resolvedExpenseFormula === AUTO_EXPENSE_FORMULAS.LODGING) {
                    const rate = (rowPhase === 'fabrication' || locale === 'domestic')
                        ? (toNumber(settings.domestic_lodging_daily) || 70000)
                        : (toNumber(settings.overseas_lodging_daily) || 200000);
                    row.amount = Math.floor(qty * rate);
                } else if (resolvedExpenseFormula === AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT) {
                    const roundTripKm = Math.max(0, (toNumber(settings.domestic_distance_km) || 0) * 2);
                    row.amount = Math.floor(
                        qty
                        * roundTripKm
                        * (toNumber(settings.domestic_transport_per_km) || 250),
                    );
                } else if (resolvedExpenseFormula === AUTO_EXPENSE_FORMULAS.AIRFARE) {
                    row.amount = Math.floor(qty * (toNumber(settings.overseas_airfare_daily) || 350000));
                }
            }
            newList[index] = row;

            const filteredIndices = [];
            newList.forEach((item, itemIndex) => {
                const isExpenseTypeMatched = section !== 'expense'
                    || normalizeExpenseType(item?.expense_type) === activeExpenseType;
                if (
                    (item.phase || 'fabrication') === currentPhase
                    && normalizeEquipmentName(item?.equipment_name) === activeEquipmentName
                    && isExpenseTypeMatched
                ) {
                    filteredIndices.push(itemIndex);
                }
            });
            const positionInDisplay = filteredIndices.indexOf(index);
            if (section === 'material' && positionInDisplay >= filteredIndices.length - 3) {
                const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
                const buffer = Array.from({ length: 20 }, () => ({
                    ...builder(section, currentPhase),
                    equipment_name: activeEquipmentName,
                }));
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

    const insertMaterialTemplateRows = useCallback((templateRows, unitCount = 1) => {
        if (section !== 'material' || !activeEquipmentName) return;
        const parsedUnitCount = Number(unitCount);
        const normalizedUnitCount = Number.isFinite(parsedUnitCount)
            ? Math.max(1, Math.floor(parsedUnitCount))
            : 1;
        const normalizedRows = (templateRows || [])
            .map((row) => ({
                unit_name: String(row?.unit_name || '').trim(),
                part_name: String(row?.part_name || '').trim(),
                spec: String(row?.spec || '').trim(),
                memo: String(row?.memo || '').trim(),
                quantity: toNumber(row?.quantity),
                unit_price: toNumber(row?.unit_price),
                executed_amount: toNumber(row?.executed_amount),
            }))
            .filter((row) => (
                row.unit_name
                || row.part_name
                || row.spec
                || row.memo
                || row.quantity
                || row.unit_price
                || row.executed_amount
            ));
        if (!normalizedRows.length) return;

        setDetails((prev) => {
            const source = [...(prev[activeKey] || [])];
            const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
            const rowIsEmpty = activeMode === 'execution' ? isExecutionRowEmpty : isBudgetRowEmpty;

            normalizedRows.forEach((item) => {
                const nextRow = {
                    ...builder('material', currentPhase),
                    equipment_name: activeEquipmentName,
                    unit_name: item.unit_name,
                    part_name: item.part_name,
                    spec: item.spec,
                    memo: item.memo,
                };
                if (activeMode === 'execution') {
                    nextRow.executed_amount = toNumber(item.executed_amount) * normalizedUnitCount;
                } else {
                    nextRow.quantity = toNumber(item.quantity) * normalizedUnitCount;
                    nextRow.unit_price = item.unit_price;
                }

                const scopedEmptyIndex = source.findIndex((row) => (
                    (row.phase || 'fabrication') === currentPhase
                    && normalizeEquipmentName(row?.equipment_name) === activeEquipmentName
                    && rowIsEmpty(row, 'material')
                ));
                if (scopedEmptyIndex >= 0) {
                    source[scopedEmptyIndex] = { ...source[scopedEmptyIndex], ...nextRow };
                } else {
                    source.push(nextRow);
                }
            });

            return {
                ...prev,
                [activeKey]: source,
            };
        });
    }, [activeEquipmentName, activeKey, activeMode, currentPhase, section]);

    const handleMaterialUnitDragOver = useCallback((event) => {
        if (section !== 'material') return;
        const types = Array.from(event.dataTransfer?.types || []);
        if (!types.includes('application/json') && !types.includes('text/plain')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsMaterialUnitDragOver(true);
    }, [section]);

    const handleMaterialUnitDrop = useCallback((event) => {
        if (section !== 'material') return;
        event.preventDefault();
        setIsMaterialUnitDragOver(false);
        const raw = event.dataTransfer?.getData('application/json')
            || event.dataTransfer?.getData('text/plain')
            || '';
        if (!raw) return;
        try {
            const payload = JSON.parse(raw);
            if (payload?.kind !== 'material_unit_template') return;
            const fallbackUnitName = String(payload?.unit_name || '').trim();
            const templateRows = (payload?.rows || []).map((row) => ({
                ...row,
                unit_name: String(row?.unit_name || fallbackUnitName).trim(),
            }));
            insertMaterialTemplateRows(templateRows, payload?.unit_count);
        } catch (_error) {
            // ignore malformed drop payload
        }
    }, [insertMaterialTemplateRows, section]);

    const handleMaterialUnitDragLeave = useCallback((event) => {
        if (section !== 'material') return;
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setIsMaterialUnitDragOver(false);
    }, [section]);

    const saveDetail = async () => {
        if (!version?.id || !canSave) return;
        if (isEquipmentProject && !equipmentNames.length) {
            setError('설비 프로젝트는 기본정보에서 설비를 최소 1개 이상 등록해야 합니다.');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            const preservedMaterialEmptyRows = (details.material_items || [])
                .filter((row) => isBudgetRowEmpty(row, 'material'))
                .map((row) => ({ ...row }));
            const preservedExecutionMaterialEmptyRows = (details.execution_material_items || [])
                .filter((row) => isExecutionRowEmpty(row, 'material'))
                .map((row) => ({ ...row }));
            const normalizeBudgetRowForSave = (sectionKey, row, equipmentName) => {
                const baseRow = {
                    ...row,
                    equipment_name: equipmentName,
                };
                if (sectionKey === 'material') {
                    return {
                        ...baseRow,
                        unit_name: String(row?.unit_name || '').trim(),
                        part_name: String(row?.part_name || '').trim(),
                        spec: String(row?.spec || '').trim(),
                        quantity: toNumber(row?.quantity),
                        unit_price: toNumber(row?.unit_price),
                        memo: String(row?.memo || '').trim(),
                    };
                }
                if (sectionKey === 'labor') {
                    const staffingType = resolveLaborStaffingType(row);
                    return {
                        ...baseRow,
                        task_name: String(row?.task_name || '').trim(),
                        staffing_type: staffingType,
                        worker_type: String(row?.worker_type || '').trim(),
                        unit: String(row?.unit || (staffingType === '외주' ? 'D' : 'H')).trim().toUpperCase() || (staffingType === '외주' ? 'D' : 'H'),
                        quantity: toNumber(row?.quantity),
                        headcount: toNumber(row?.headcount) || 1,
                        location_type: normalizeLocationType(row?.location_type),
                        hourly_rate: toNumber(row?.hourly_rate),
                        memo: String(row?.memo || '').trim(),
                    };
                }
                return {
                    ...baseRow,
                    expense_name: String(row?.expense_name || '').trim(),
                    basis: String(row?.basis || '').trim(),
                    quantity: toNumber(row?.quantity),
                    amount: toNumber(row?.amount),
                    is_auto: Boolean(row?.is_auto),
                    auto_formula: resolveExpenseAutoFormula(row),
                    lock_auto: parseLockAutoValue(row?.lock_auto),
                    memo: String(row?.memo || '').trim(),
                    ...(sectionKey === 'expense'
                        ? { expense_type: normalizeExpenseType(row?.expense_type) }
                        : {}),
                };
            };
            const normalizeExecutionRowForSave = (sectionKey, row, equipmentName) => {
                const baseRow = {
                    ...row,
                    equipment_name: equipmentName,
                };
                if (sectionKey === 'material') {
                    return {
                        ...baseRow,
                        unit_name: String(row?.unit_name || '').trim(),
                        part_name: String(row?.part_name || '').trim(),
                        spec: String(row?.spec || '').trim(),
                        executed_amount: toNumber(row?.executed_amount),
                        memo: String(row?.memo || '').trim(),
                    };
                }
                if (sectionKey === 'labor') {
                    const staffingType = resolveLaborStaffingType(row);
                    return {
                        ...baseRow,
                        task_name: String(row?.task_name || '').trim(),
                        staffing_type: staffingType,
                        worker_type: String(row?.worker_type || '').trim(),
                        executed_amount: toNumber(row?.executed_amount),
                        memo: String(row?.memo || '').trim(),
                    };
                }
                return {
                    ...baseRow,
                    expense_name: String(row?.expense_name || '').trim(),
                    basis: String(row?.basis || '').trim(),
                    executed_amount: toNumber(row?.executed_amount),
                    memo: String(row?.memo || '').trim(),
                    ...(sectionKey === 'expense'
                        ? { expense_type: normalizeExpenseType(row?.expense_type) }
                        : {}),
                };
            };
            const cleanDetails = {};
            const primaryEquipmentName = activeEquipmentName || equipmentNames[0] || COMMON_EQUIPMENT_NAME;
            const allowedEquipmentSet = new Set(equipmentNames);
            Object.keys(SECTION_META).forEach((sectionKey) => {
                const meta = SECTION_META[sectionKey];
                cleanDetails[meta.budgetKey] = (details[meta.budgetKey] || [])
                    .filter((row) => !isBudgetRowEmpty(row, sectionKey))
                    .map((row) => {
                        let equipmentName = normalizeEquipmentName(row?.equipment_name) || primaryEquipmentName;
                        if (isEquipmentProject && allowedEquipmentSet.size > 0 && !allowedEquipmentSet.has(equipmentName)) {
                            equipmentName = primaryEquipmentName;
                        }
                        return normalizeBudgetRowForSave(sectionKey, row, equipmentName);
                    });
                cleanDetails[meta.executionKey] = (details[meta.executionKey] || [])
                    .filter((row) => !isExecutionRowEmpty(row, sectionKey))
                    .map((row) => {
                        let equipmentName = normalizeEquipmentName(row?.equipment_name) || primaryEquipmentName;
                        if (isEquipmentProject && allowedEquipmentSet.size > 0 && !allowedEquipmentSet.has(equipmentName)) {
                            equipmentName = primaryEquipmentName;
                        }
                        return normalizeExecutionRowForSave(sectionKey, row, equipmentName);
                    });
            });
            cleanDetails.budget_settings = mergeBudgetSettings(details?.budget_settings);

            const response = await api.put(`/budget/versions/${version.id}/details`, cleanDetails);
            const savedDetails = response?.data?.details || cleanDetails;
            const savedWithMaterialBuffers = {
                ...savedDetails,
                material_items: [
                    ...(savedDetails.material_items || []),
                    ...preservedMaterialEmptyRows,
                ],
                execution_material_items: [
                    ...(savedDetails.execution_material_items || []),
                    ...preservedExecutionMaterialEmptyRows,
                ],
            };
            let equipmentItems = [];
            try {
                const equipmentResp = await api.get(`/budget/versions/${version.id}/equipments`);
                equipmentItems = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
            } catch (_err) {
                equipmentItems = [];
            }
            const refreshedEquipmentNames = resolveEquipmentNames({
                projectType: project?.project_type || 'equipment',
                equipmentItems,
                detailsObj: savedDetails,
            });
            const normalizedSavedDetails = normalizeDetailsWithEquipment(
                savedWithMaterialBuffers,
                (project?.project_type || 'equipment') === 'equipment'
                    ? refreshedEquipmentNames[0]
                    : COMMON_EQUIPMENT_NAME,
            );

            setEquipmentNames(refreshedEquipmentNames);
            setCurrentEquipmentName((prev) => (
                refreshedEquipmentNames.includes(prev)
                    ? prev
                    : (refreshedEquipmentNames[0] || '')
            ));
            setDetails(injectBuffers(normalizedSavedDetails));
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
            const revisionDetails = detailResp?.data?.details || details;
            let equipmentItems = [];
            try {
                const equipmentResp = await api.get(`/budget/versions/${nextVersion.id}/equipments`);
                equipmentItems = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
            } catch (_err) {
                equipmentItems = [];
            }
            const refreshedEquipmentNames = resolveEquipmentNames({
                projectType: project?.project_type || 'equipment',
                equipmentItems,
                detailsObj: revisionDetails,
            });
            const normalizedRevisionDetails = normalizeDetailsWithEquipment(
                revisionDetails,
                (project?.project_type || 'equipment') === 'equipment'
                    ? refreshedEquipmentNames[0]
                    : COMMON_EQUIPMENT_NAME,
            );
            setEquipmentNames(refreshedEquipmentNames);
            setCurrentEquipmentName((prev) => (
                refreshedEquipmentNames.includes(prev)
                    ? prev
                    : (refreshedEquipmentNames[0] || '')
            ));
            setDetails(injectBuffers(normalizedRevisionDetails));
            return nextVersion;
        } catch (err) {
            setError(getErrorMessage(err, '리비전 생성에 실패했습니다.'));
            return null;
        }
    };

    useEffect(() => {
        if (activeMode !== 'budget') return;
        if (isEquipmentProject && !activeEquipmentName) return;
        autoFillExpenseRows({ forceReset: false });
    }, [
        activeMode,
        activeEquipmentName,
        autoFillExpenseRows,
        currentPhase,
        details.labor_items,
        details.material_items,
        details.budget_settings,
        isEquipmentProject,
    ]);

    useEffect(() => {
        if (section !== 'material') return;
        if (!activeEquipmentName) return;
        const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
        setDetails((prev) => {
            const source = [...(prev[activeKey] || [])];
            const scopedCount = source.filter((row) => (
                (row.phase || 'fabrication') === currentPhase
                && normalizeEquipmentName(row?.equipment_name) === activeEquipmentName
            )).length;
            if (scopedCount >= 50) return prev;
            const buffer = Array.from({ length: 50 - scopedCount }, () => ({
                ...builder(section, currentPhase),
                equipment_name: activeEquipmentName,
            }));
            return {
                ...prev,
                [activeKey]: [...source, ...buffer],
            };
        });
    }, [activeEquipmentName, activeKey, activeMode, currentPhase, details[activeKey], section]);

    useEffect(() => {
        if (section === 'material') return;
        setIsMaterialUnitDragOver(false);
    }, [section]);

    const appendMaterialBufferRows = useCallback((count = 50) => {
        if (section !== 'material') return;
        if (!activeEquipmentName) return;
        const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
        setDetails((prev) => ({
            ...prev,
            [activeKey]: [
                ...(prev[activeKey] || []),
                ...Array.from({ length: count }, () => ({
                    ...builder(section, currentPhase),
                    equipment_name: activeEquipmentName,
                })),
            ],
        }));
    }, [activeEquipmentName, activeKey, activeMode, currentPhase, section]);

    const handleMaterialTableScroll = useCallback((event) => {
        if (section !== 'material') return;
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100) {
            appendMaterialBufferRows(30);
        }
    }, [appendMaterialBufferRows, section]);

    if (isLoading) {
        return <p className="text-sm text-muted-foreground p-6">불러오는 중...</p>;
    }

    return (
        <div className="flex h-screen border-t border-slate-200 overflow-hidden">
            <BudgetSidebar
                aggregation={aggregation}
                summary={sidebarSummary}
                modeLabel={aggregationModeLabel}
                section={section}
                materialUnitLibrary={materialUnitLibrary}
            />

            <div className="flex-1 overflow-y-auto px-8 pt-2 pb-0 space-y-2 flex flex-col min-w-0">
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
                            <div className="flex items-center gap-4 flex-wrap">
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

                                {isEquipmentProject && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
                                        {equipmentNames.length ? (
                                            equipmentNames.map((equipmentName) => (
                                                <button
                                                    key={`equipment-tab-${equipmentName}`}
                                                    type="button"
                                                    onClick={() => setCurrentEquipmentName(equipmentName)}
                                                    className={cn(
                                                        'px-3 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                                        activeEquipmentName === equipmentName
                                                            ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200'
                                                            : 'text-slate-500 hover:text-slate-700',
                                                    )}
                                                >
                                                    {equipmentName}
                                                </button>
                                            ))
                                        ) : (
                                            <span className="px-2 py-1 text-[11px] font-black text-rose-600">
                                                설비 기본정보에서 설비를 먼저 등록해 주세요.
                                            </span>
                                        )}
                                    </div>
                                )}

                                {!isEquipmentProject && (
                                    <div className="inline-flex items-center rounded-lg border bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-600">
                                        설비 구분 없음: 공통 입력
                                    </div>
                                )}

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

                                {section === 'expense' && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        {EXPENSE_TYPE_OPTIONS.map((expenseType) => (
                                            <button
                                                key={`expense-type-${expenseType}`}
                                                type="button"
                                                onClick={() => setCurrentExpenseType(expenseType)}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-lg text-[11px] font-black transition-all',
                                                    activeExpenseType === expenseType
                                                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                                                        : 'text-slate-500 hover:text-slate-700',
                                                )}
                                            >
                                                {expenseType} 경비
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="inline-flex items-center rounded-lg border bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-600">
                                    입력 스코프:
                                    <span className="ml-1 text-slate-900">
                                        {isEquipmentProject ? activeEquipmentName || '설비 미선택' : '공통'}
                                        {' > '}
                                        {currentPhaseLabel}
                                        {section === 'expense' ? ` > ${activeExpenseType} 경비` : ''}
                                    </span>
                                </div>

                                {activeMode === 'budget' && section === 'labor' && (
                                    <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
                                        <span className="px-2 text-[10px] font-black text-slate-500 uppercase">자체</span>
                                        {(budgetSettings.labor_departments || DEFAULT_LABOR_DEPARTMENTS).map((department) => (
                                            <button
                                                key={`inhouse-${department}`}
                                                type="button"
                                                onClick={() => addLaborDepartmentRow({ department, staffingType: '자체' })}
                                                className="h-8 rounded-lg px-2.5 text-[11px] font-black bg-white text-emerald-700 ring-1 ring-slate-200 hover:bg-emerald-50"
                                            >
                                                {department}
                                            </button>
                                        ))}
                                        <span className="mx-1 h-5 w-px bg-slate-300" />
                                        <span className="px-2 text-[10px] font-black text-slate-500 uppercase">외주</span>
                                        {OUTSOURCE_LABOR_DEPARTMENTS.map((department) => (
                                            <button
                                                key={`outsource-${department}`}
                                                type="button"
                                                onClick={() => addLaborDepartmentRow({ department, staffingType: '외주' })}
                                                className="h-8 rounded-lg px-2.5 text-[11px] font-black bg-white text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50"
                                            >
                                                {department}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {activeMode === 'budget' && section === 'labor' && (
                                    <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-700">
                                            자체인원 1M/H {INHOUSE_LABOR_RATE_PER_HOUR.toLocaleString('ko-KR')}원
                                        </span>
                                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-indigo-700">
                                            외주인원 1M/D {OUTSOURCE_LABOR_RATE_PER_DAY.toLocaleString('ko-KR')}원
                                        </span>
                                    </div>
                                )}

                                {activeMode === 'budget' && (section === 'labor' || section === 'expense') && (
                                    <div className="inline-flex items-center rounded-lg border bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-600">
                                        설치 기준: <span className="ml-1 text-slate-900">{projectInstallationInfo.label}</span>
                                    </div>
                                )}

                                {activeMode === 'budget' && section === 'expense' && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => autoFillExpenseRows({ forceReset: true })}
                                            className="h-8 rounded-lg px-3 text-[11px] font-black bg-white text-indigo-700 ring-1 ring-slate-200"
                                        >
                                            경비 자동 산정
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div className="mb-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">
                                {error}
                            </div>
                        )}

                        {activeMode === 'budget' && section === 'expense' && (
                            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-[11px] font-black text-slate-700 mb-1.5">경비 입력 안내</p>
                                <ul className="space-y-1 text-[11px] font-medium text-slate-600 list-disc pl-4">
                                    <li>재료비와 인건비를 기준으로 경비 금액이 자동 산정되며, 필요 시 금액을 수동으로 수정할 수 있습니다.</li>
                                    <li>'경비 자동 산정' 버튼을 누르면 잠금 해제된 행이 자동 산정 기준 금액으로 일괄 초기화됩니다.</li>
                                    <li>산정 기준이 '수동 입력'인 항목은 자동 산정 대상이 아닙니다.</li>
                                </ul>
                            </div>
                        )}

                        <div
                            className="flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50/20 custom-scrollbar relative"
                            onScroll={handleMaterialTableScroll}
                            onDragOver={handleMaterialUnitDragOver}
                            onDrop={handleMaterialUnitDrop}
                            onDragLeave={handleMaterialUnitDragLeave}
                        >
                            <ExcelTable
                                columns={visibleColumns}
                                rows={sortedDisplayRows}
                                sortState={sortState}
                                onSort={toggleSort}
                                autoCompleteOptions={autoCompleteOptions}
                                onChange={(idx, key, val) => updateRow(sortedDisplayRows[idx].originalIndex, key, val)}
                                onRemove={(idx) => removeRow(sortedDisplayRows[idx].originalIndex)}
                                editable={canEditScopedRows}
                                allowRowDelete={canEditScopedRows}
                                isCellReadonly={(row, column) => (
                                    activeMode === 'budget'
                                    && section === 'expense'
                                    && column?.key === 'quantity'
                                    && shouldHideExpenseQuantity(row)
                                )}
                                getCellDisplayValue={(row, column, rawValue) => {
                                    if (
                                        activeMode === 'budget'
                                        && section === 'expense'
                                        && column?.key === 'quantity'
                                        && shouldHideExpenseQuantity(row)
                                    ) {
                                        return '';
                                    }
                                    return rawValue;
                                }}
                            />
                            {section === 'material' && isMaterialUnitDragOver && (
                                <div className="pointer-events-none absolute inset-2 rounded-xl border-2 border-dashed border-sky-400 bg-sky-50/70 flex items-center justify-center z-20">
                                    <div className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-[11px] font-black text-sky-700 shadow-sm">
                                        유닛 템플릿을 여기에 놓으면 현재 설비/단계에 파츠가 입력됩니다.
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

const ExcelTable = ({
    columns,
    rows,
    sortState,
    onSort,
    autoCompleteOptions = {},
    onChange,
    onRemove,
    editable,
    allowRowDelete,
    isCellReadonly,
    getCellDisplayValue,
}) => {
    const tableWrapperRef = useRef(null);
    const tableRef = useRef(null);
    const preserveSelectionOnFocusRef = useRef(false);
    const undoStackRef = useRef([]);
    const isUndoingRef = useRef(false);
    const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
    const [selectionStart, setSelectionStart] = useState({ row: 0, col: 0 });
    const [selectionEnd, setSelectionEnd] = useState({ row: 0, col: 0 });
    const [editingCell, setEditingCell] = useState(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isFillDragging, setIsFillDragging] = useState(false);
    const [fillAnchor, setFillAnchor] = useState(null);
    const [fillTarget, setFillTarget] = useState(null);
    const [fillOverlayRect, setFillOverlayRect] = useState(null);
    const [copiedRange, setCopiedRange] = useState(null);

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const rowCount = rows.length;
    const colCount = columns.length;

    const range = useMemo(() => {
        const rowMin = Math.min(selectionStart.row, selectionEnd.row);
        const rowMax = Math.max(selectionStart.row, selectionEnd.row);
        const colMin = Math.min(selectionStart.col, selectionEnd.col);
        const colMax = Math.max(selectionStart.col, selectionEnd.col);
        return { rowMin, rowMax, colMin, colMax };
    }, [selectionStart, selectionEnd]);

    const isCellInSelection = (row, col) => (
        row >= range.rowMin
        && row <= range.rowMax
        && col >= range.colMin
        && col <= range.colMax
    );

    const isCellInCopiedRange = (row, col) => {
        if (!copiedRange) return false;
        return row >= copiedRange.rowMin
            && row <= copiedRange.rowMax
            && col >= copiedRange.colMin
            && col <= copiedRange.colMax;
    };

    const normalizeHistoryValue = (value, column) => {
        if (column?.key === 'lock_auto') return parseLockAutoValue(value) ? '잠금' : '해제';
        if (column?.type === 'number') return String(toNumber(value));
        if (column?.key === 'unit') return String(value ?? '').toUpperCase();
        return String(value ?? '');
    };

    const normalizeWriteValue = (value, column) => {
        if (column?.key === 'lock_auto') {
            const text = String(value ?? '').trim();
            if (text === '잠금') return '잠금';
            if (text === '해제') return '해제';
            return parseLockAutoValue(value) ? '잠금' : '해제';
        }
        if (column?.type === 'number') return String(value ?? '').replace(/[^0-9]/g, '');
        if (column?.key === 'unit') return String(value ?? '').trim().toUpperCase();
        return String(value ?? '');
    };

    const isCellLocked = (rowIndex, colIndex, columnArg = null, rowArg = null) => {
        const column = columnArg || columns[colIndex];
        const row = rowArg || rows[rowIndex];
        if (!column || !row) return true;
        if (column.readonly) return true;
        return Boolean(isCellReadonly?.(row, column, rowIndex, colIndex));
    };

    const resolveCellDisplayRawValue = (rowIndex, colIndex, row, column, rawValue) => {
        if (!getCellDisplayValue) return rawValue;
        return getCellDisplayValue(row, column, rawValue, rowIndex, colIndex);
    };

    const pushUndoAction = (changes) => {
        if (!changes.length) return;
        undoStackRef.current.push(changes);
        if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    };

    const buildCellChange = (rowIndex, colIndex, nextValue) => {
        const column = columns[colIndex];
        const row = rows[rowIndex];
        if (!column || !row || isCellLocked(rowIndex, colIndex, column, row)) return null;
        const currentRaw = column.computed ? column.computed(row) : row[column.key];
        const before = normalizeHistoryValue(currentRaw, column);
        const writeValue = normalizeWriteValue(nextValue, column);
        const after = normalizeHistoryValue(writeValue, column);
        if (before === after) return null;
        return {
            row: rowIndex,
            key: column.key,
            before,
            after,
            writeValue,
        };
    };

    const applyCellChanges = (changes, { trackUndo = true } = {}) => {
        if (!changes.length) return;
        changes.forEach((change) => {
            onChange(change.row, change.key, change.writeValue);
        });
        if (trackUndo && !isUndoingRef.current) {
            pushUndoAction(changes.map(({ row, key, before, after }) => ({ row, key, before, after })));
        }
    };

    const undoLastChange = () => {
        const lastAction = undoStackRef.current.pop();
        if (!lastAction?.length) return;
        isUndoingRef.current = true;
        lastAction.forEach((change) => {
            onChange(change.row, change.key, change.before);
        });
        isUndoingRef.current = false;
        setCopiedRange(null);
    };

    const focusCell = (row, col, { selectText = false, preserveSelection = false } = {}) => {
        const nextTarget = tableRef.current?.querySelector(
            `[data-row="${row}"][data-col="${col}"] input, [data-row="${row}"][data-col="${col}"] select, [data-row="${row}"][data-col="${col}"] [data-cell-display="true"]`,
        );
        if (!nextTarget) return;
        if (preserveSelection) preserveSelectionOnFocusRef.current = true;
        nextTarget.focus();
        if (selectText && nextTarget.select) nextTarget.select();
    };

    const setSingleCellSelection = (row, col) => {
        const nextRow = clamp(row, 0, Math.max(rowCount - 1, 0));
        const nextCol = clamp(col, 0, Math.max(colCount - 1, 0));
        setActiveCell({ row: nextRow, col: nextCol });
        setSelectionStart({ row: nextRow, col: nextCol });
        setSelectionEnd({ row: nextRow, col: nextCol });
    };

    const handleCellFocus = (row, col) => {
        const nextRow = clamp(row, 0, Math.max(rowCount - 1, 0));
        const nextCol = clamp(col, 0, Math.max(colCount - 1, 0));
        setActiveCell({ row: nextRow, col: nextCol });
        if (preserveSelectionOnFocusRef.current) {
            preserveSelectionOnFocusRef.current = false;
            return;
        }
        if (isCellInSelection(nextRow, nextCol)) return;
        setSelectionStart({ row: nextRow, col: nextCol });
        setSelectionEnd({ row: nextRow, col: nextCol });
    };

    const isEditing = (row, col) => (
        editingCell?.row === row && editingCell?.col === col
    );

    const startEditingCell = (row, col, { selectText = true } = {}) => {
        const column = columns[col];
        if (!editable || !column || isCellLocked(row, col, column, rows[row])) return;
        if (column.key === 'lock_auto') return;
        setEditingCell({ row, col });
        requestAnimationFrame(() => {
            focusCell(row, col, { selectText, preserveSelection: true });
        });
    };

    const stopEditingCell = () => {
        setEditingCell(null);
    };

    const isCellFilled = (row, col) => {
        const colDef = columns[col];
        if (!colDef || !rows[row]) return false;
        const value = colDef.computed ? colDef.computed(rows[row]) : rows[row][colDef.key];
        if (value === null || value === undefined) return false;
        if (typeof value === 'number') return Number.isFinite(value);
        return String(value).trim() !== '';
    };

    const findCtrlJumpTarget = (row, col, direction) => {
        if (direction === 'ArrowUp' || direction === 'ArrowDown') {
            const step = direction === 'ArrowUp' ? -1 : 1;
            let target = row;
            let found = false;
            for (let idx = row + step; idx >= 0 && idx < rowCount; idx += step) {
                if (isCellFilled(idx, col)) {
                    target = idx;
                    found = true;
                }
            }
            return found ? target : (step > 0 ? rowCount - 1 : 0);
        }
        const step = direction === 'ArrowLeft' ? -1 : 1;
        let target = col;
        let found = false;
        for (let idx = col + step; idx >= 0 && idx < colCount; idx += step) {
            if (isCellFilled(row, idx)) {
                target = idx;
                found = true;
            }
        }
        return found ? target : (step > 0 ? colCount - 1 : 0);
    };

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsSelecting(false);
            if (!isFillDragging) return;
            const anchor = fillAnchor;
            const target = fillTarget;
            setIsFillDragging(false);
            setFillAnchor(null);
            setFillTarget(null);
            if (!anchor || !target) return;

            const isAnchorInSelection = (
                anchor.row >= range.rowMin
                && anchor.row <= range.rowMax
                && anchor.col >= range.colMin
                && anchor.col <= range.colMax
            );
            const sourceRange = isAnchorInSelection
                ? {
                    rowMin: range.rowMin,
                    rowMax: range.rowMax,
                    colMin: range.colMin,
                    colMax: range.colMax,
                }
                : {
                    rowMin: anchor.row,
                    rowMax: anchor.row,
                    colMin: anchor.col,
                    colMax: anchor.col,
                };

            const fillRect = {
                rowMin: Math.min(sourceRange.rowMin, target.row),
                rowMax: Math.max(sourceRange.rowMax, target.row),
                colMin: Math.min(sourceRange.colMin, target.col),
                colMax: Math.max(sourceRange.colMax, target.col),
            };

            const sourceHeight = sourceRange.rowMax - sourceRange.rowMin + 1;
            const sourceWidth = sourceRange.colMax - sourceRange.colMin + 1;
            const mod = (value, base) => ((value % base) + base) % base;

            const fillChanges = [];
            for (let r = fillRect.rowMin; r <= fillRect.rowMax; r += 1) {
                for (let c = fillRect.colMin; c <= fillRect.colMax; c += 1) {
                    const isInSourceRange = (
                        r >= sourceRange.rowMin
                        && r <= sourceRange.rowMax
                        && c >= sourceRange.colMin
                        && c <= sourceRange.colMax
                    );
                    if (isInSourceRange) continue;

                    const sourceRowIndex = sourceRange.rowMin + mod(r - sourceRange.rowMin, sourceHeight);
                    const sourceColIndex = sourceRange.colMin + mod(c - sourceRange.colMin, sourceWidth);
                    const sourceColumn = columns[sourceColIndex];
                    const sourceRow = rows[sourceRowIndex];
                    if (!sourceColumn || !sourceRow) continue;
                    const sourceValueRaw = sourceColumn.computed
                        ? sourceColumn.computed(sourceRow)
                        : sourceRow[sourceColumn.key];
                    const nextValue = sourceColumn.type === 'number'
                        ? String(toNumber(sourceValueRaw))
                        : String(sourceValueRaw ?? '');

                    const change = buildCellChange(r, c, nextValue);
                    if (change) fillChanges.push(change);
                }
            }
            applyCellChanges(fillChanges);
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [applyCellChanges, buildCellChange, columns, fillAnchor, fillTarget, isFillDragging, range, rows]);

    useEffect(() => {
        if (!isFillDragging || !fillAnchor || !fillTarget) {
            setFillOverlayRect(null);
            return;
        }

        const containerEl = tableWrapperRef.current;
        const anchorCell = tableRef.current?.querySelector(
            `td[data-row="${fillAnchor.row}"][data-col="${fillAnchor.col}"]`,
        );
        const targetCell = tableRef.current?.querySelector(
            `td[data-row="${fillTarget.row}"][data-col="${fillTarget.col}"]`,
        );
        if (!containerEl || !anchorCell || !targetCell) return;

        const containerRect = containerEl.getBoundingClientRect();
        const anchorRect = anchorCell.getBoundingClientRect();
        const targetRect = targetCell.getBoundingClientRect();
        const left = Math.min(anchorRect.left, targetRect.left) - containerRect.left + containerEl.scrollLeft;
        const top = Math.min(anchorRect.top, targetRect.top) - containerRect.top + containerEl.scrollTop;
        const right = Math.max(anchorRect.right, targetRect.right) - containerRect.left + containerEl.scrollLeft;
        const bottom = Math.max(anchorRect.bottom, targetRect.bottom) - containerRect.top + containerEl.scrollTop;

        setFillOverlayRect({
            left,
            top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        });
    }, [fillAnchor, fillTarget, isFillDragging]);

    const handleKeyDown = (event, rowIndex, colIndex) => {
        const column = columns[colIndex];
        const isCellEditable = editable && column && !isCellLocked(rowIndex, colIndex, column, rows[rowIndex]);
        const isPrintableKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
        const isEditingCurrentCell = isEditing(rowIndex, colIndex);

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            undoLastChange();
            return;
        }

        if (event.key === 'Escape' && copiedRange) {
            event.preventDefault();
            setCopiedRange(null);
            return;
        }

        if (!isEditingCurrentCell && event.key === 'Delete') {
            event.preventDefault();
            const clearChanges = [];
            for (let row = range.rowMin; row <= range.rowMax; row += 1) {
                for (let col = range.colMin; col <= range.colMax; col += 1) {
                    const change = buildCellChange(row, col, '');
                    if (change) clearChanges.push(change);
                }
            }
            applyCellChanges(clearChanges);
            setCopiedRange(null);
            return;
        }

        if (isEditingCurrentCell) {
            if (event.key === 'Escape') {
                event.preventDefault();
                stopEditingCell();
                focusCell(rowIndex, colIndex);
                return;
            }
            if (!['Enter', 'Tab'].includes(event.key)) return;
        } else if (event.key === 'F2' && isCellEditable) {
            event.preventDefault();
            startEditingCell(rowIndex, colIndex);
            return;
        } else if (isCellEditable && !column?.options && (isPrintableKey || event.key === 'Backspace' || event.key === 'Delete')) {
            event.preventDefault();
            let nextValue = '';
            if (isPrintableKey) {
                nextValue = column.type === 'number' ? event.key.replace(/[^0-9]/g, '') : event.key;
                if (!nextValue) return;
            }
            const change = buildCellChange(rowIndex, colIndex, nextValue);
            if (change) applyCellChanges([change]);
            startEditingCell(rowIndex, colIndex, { selectText: false });
            return;
        }

        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].includes(event.key)) return;

        let nextRow = rowIndex;
        let nextCol = colIndex;

        if (event.ctrlKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                nextRow = findCtrlJumpTarget(rowIndex, colIndex, event.key);
            } else {
                nextCol = findCtrlJumpTarget(rowIndex, colIndex, event.key);
            }
        } else if (event.key === 'ArrowUp') nextRow = Math.max(0, rowIndex - 1);
        else if (event.key === 'ArrowDown' || event.key === 'Enter') nextRow = Math.min(rowCount - 1, rowIndex + 1);
        else if (event.key === 'ArrowLeft') nextCol = Math.max(0, colIndex - 1);
        else if (event.key === 'ArrowRight') nextCol = Math.min(colCount - 1, colIndex + 1);
        else if (event.key === 'Tab') nextCol = event.shiftKey ? Math.max(0, colIndex - 1) : Math.min(colCount - 1, colIndex + 1);

        event.preventDefault();

        if (isEditingCurrentCell) {
            stopEditingCell();
        }

        if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            setActiveCell({ row: nextRow, col: nextCol });
            setSelectionEnd({ row: nextRow, col: nextCol });
        } else {
            setSingleCellSelection(nextRow, nextCol);
        }
        focusCell(nextRow, nextCol, { preserveSelection: true });
    };

    const handleCellMouseDown = (event, rowIndex, colIndex) => {
        if (event.button !== 0) return;
        if (isFillDragging) return;
        event.preventDefault();
        stopEditingCell();
        const column = columns[colIndex];
        setActiveCell({ row: rowIndex, col: colIndex });
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            setSelectionEnd({ row: rowIndex, col: colIndex });
        } else {
            setSelectionStart({ row: rowIndex, col: colIndex });
            setSelectionEnd({ row: rowIndex, col: colIndex });
        }
        const isToggleLockCell = (
            column?.key === 'lock_auto'
            && editable
            && !isCellLocked(rowIndex, colIndex, column, rows[rowIndex])
            && !event.shiftKey
            && !event.ctrlKey
            && !event.metaKey
        );
        if (isToggleLockCell) {
            const currentLocked = parseLockAutoValue(rows[rowIndex]?.[column.key]);
            const change = buildCellChange(rowIndex, colIndex, currentLocked ? '해제' : '잠금');
            if (change) applyCellChanges([change]);
            setIsSelecting(false);
        } else {
            setIsSelecting(true);
        }
        focusCell(rowIndex, colIndex, { preserveSelection: true });
    };

    const handleRowHeaderMouseDown = (event, rowIndex) => {
        if (event.button !== 0) return;
        event.preventDefault();
        stopEditingCell();
        setActiveCell({ row: rowIndex, col: 0 });

        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            setSelectionEnd({ row: rowIndex, col: Math.max(colCount - 1, 0) });
        } else {
            setSelectionStart({ row: rowIndex, col: 0 });
            setSelectionEnd({ row: rowIndex, col: Math.max(colCount - 1, 0) });
        }
        setIsSelecting(false);
        focusCell(rowIndex, 0, { preserveSelection: true });
    };

    const handleCellDoubleClick = (rowIndex, colIndex) => {
        const column = columns[colIndex];
        if (column?.key === 'lock_auto') return;
        startEditingCell(rowIndex, colIndex);
    };

    const handleCellMouseEnter = (rowIndex, colIndex) => {
        if (isFillDragging) {
            setFillTarget({ row: rowIndex, col: colIndex });
            return;
        }
        if (!isSelecting) return;
        setSelectionEnd({ row: rowIndex, col: colIndex });
    };

    const handleFillMouseDown = (event, rowIndex, colIndex) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        setIsFillDragging(true);
        setFillAnchor({ row: rowIndex, col: colIndex });
        setFillTarget({ row: rowIndex, col: colIndex });
    };

    const handleCopy = (event) => {
        if (!tableWrapperRef.current?.contains(event.target)) return;
        if (editingCell) return;

        const { rowMin, rowMax, colMin, colMax } = range;
        const lines = [];
        for (let rowIndex = rowMin; rowIndex <= rowMax; rowIndex += 1) {
            const cells = [];
            for (let colIndex = colMin; colIndex <= colMax; colIndex += 1) {
                const column = columns[colIndex];
                if (!column || !rows[rowIndex]) {
                    cells.push('');
                    continue;
                }
                const rawValue = column.computed ? column.computed(rows[rowIndex]) : rows[rowIndex][column.key];
                const displayRawValue = resolveCellDisplayRawValue(
                    rowIndex,
                    colIndex,
                    rows[rowIndex],
                    column,
                    rawValue,
                );
                const normalizedValue = column.type === 'number'
                    ? (displayRawValue === '' ? '' : String(toNumber(displayRawValue)))
                    : String(displayRawValue ?? '');
                cells.push(normalizedValue);
            }
            lines.push(cells.join('\t'));
        }

        const payload = lines.join('\n');
        event.preventDefault();
        event.stopPropagation();
        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', payload);
        }
        setCopiedRange({ rowMin, rowMax, colMin, colMax });
    };

    const handlePasteToCells = (event) => {
        if (!editable) return;
        if (!tableWrapperRef.current?.contains(event.target)) return;
        if (editingCell) return;

        const pastedText = event.clipboardData?.getData('text/plain') || '';
        if (!pastedText) return;

        const lines = pastedText.replace(/\r/g, '').split('\n');
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        if (!lines.length) return;
        const matrix = lines.map((line) => line.split('\t'));

        event.preventDefault();
        event.stopPropagation();

        const startRow = activeCell.row;
        const startCol = activeCell.col;
        let hasWrite = false;
        let rowMax = startRow;
        let colMax = startCol;
        const matrixChanges = [];

        matrix.forEach((cells, rowOffset) => {
            cells.forEach((cellText, colOffset) => {
                const targetRow = startRow + rowOffset;
                const targetCol = startCol + colOffset;
                if (targetRow < 0 || targetRow >= rowCount) return;
                if (targetCol < 0 || targetCol >= colCount) return;

                const column = columns[targetCol];
                if (!column || isCellLocked(targetRow, targetCol, column, rows[targetRow])) return;

                let nextValue = String(cellText ?? '');
                if (column.type === 'number') {
                    nextValue = nextValue.replace(/[^0-9]/g, '');
                } else if (column.key === 'unit') {
                    nextValue = nextValue.trim().toUpperCase();
                }
                const change = buildCellChange(targetRow, targetCol, nextValue);
                if (!change) return;
                hasWrite = true;
                rowMax = Math.max(rowMax, targetRow);
                colMax = Math.max(colMax, targetCol);
                matrixChanges.push(change);
            });
        });

        if (!hasWrite || !matrixChanges.length) return;
        applyCellChanges(matrixChanges);
        stopEditingCell();
        setActiveCell({ row: startRow, col: startCol });
        setSelectionStart({ row: startRow, col: startCol });
        setSelectionEnd({ row: rowMax, col: colMax });
        focusCell(startRow, startCol, { preserveSelection: true });
    };

    useEffect(() => {
        if (!rowCount || !colCount) return;
        setActiveCell((prev) => ({
            row: clamp(prev.row, 0, rowCount - 1),
            col: clamp(prev.col, 0, colCount - 1),
        }));
        setSelectionStart((prev) => ({
            row: clamp(prev.row, 0, rowCount - 1),
            col: clamp(prev.col, 0, colCount - 1),
        }));
        setSelectionEnd((prev) => ({
            row: clamp(prev.row, 0, rowCount - 1),
            col: clamp(prev.col, 0, colCount - 1),
        }));
    }, [colCount, rowCount]);

    return (
        <>
            <div className="relative" ref={tableWrapperRef} onCopy={handleCopy} onPaste={handlePasteToCells}>
                <table className="w-full text-[11px] border-collapse bg-white" ref={tableRef}>
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                    <tr>
                        <th className="w-14 p-0 text-center font-black text-slate-500 uppercase tracking-tighter border-r border-slate-200">
                            No
                        </th>
                        {columns.map((col, idx) => (
                            <th key={idx} className={cn('p-0 text-left font-black text-slate-500 uppercase tracking-tighter border-r border-slate-200 last:border-0', col.width)}>
                                <button
                                    type="button"
                                    onClick={() => onSort?.(col.key)}
                                    className="flex h-9 w-full items-center justify-between px-2 hover:bg-slate-200/60"
                                >
                                    <span>{col.label}</span>
                                    <span className="text-[10px] text-slate-400">
                                        {sortState?.key === col.key
                                            ? (sortState.direction === 'asc' ? '▲' : sortState.direction === 'desc' ? '▼' : '·')
                                            : '·'}
                                    </span>
                                </button>
                            </th>
                        ))}
                        {allowRowDelete && <th className="p-2 w-16 text-center text-slate-500 font-bold border-r-0 uppercase tracking-tighter">삭제</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-slate-100 hover:bg-slate-50/50 focus-within:bg-blue-50/30 group transition-colors">
                            <td
                                className={cn(
                                    "w-14 h-8 px-1 text-center text-[10px] font-black border-r border-slate-200 select-none cursor-default",
                                    rowIndex >= range.rowMin && rowIndex <= range.rowMax
                                        ? "bg-sky-100 text-sky-700"
                                        : "bg-slate-50 text-slate-400",
                                )}
                                onMouseDown={(event) => handleRowHeaderMouseDown(event, rowIndex)}
                            >
                                {rowIndex + 1}
                            </td>
                            {columns.map((col, colIndex) => {
                                const rawValue = col.computed ? col.computed(row) : row[col.key];
                                const displayRawFromMeta = resolveCellDisplayRawValue(
                                    rowIndex,
                                    colIndex,
                                    row,
                                    col,
                                    rawValue,
                                );
                                const normalizedRawValue = col.key === 'staffing_type'
                                    ? resolveLaborStaffingType(row)
                                    : displayRawFromMeta;
                                const displayValue = col.type === 'number'
                                    ? (normalizedRawValue === null || normalizedRawValue === undefined || normalizedRawValue === '' ? '' : toNumber(normalizedRawValue).toLocaleString('ko-KR'))
                                    : (normalizedRawValue || '');
                                const optionValue = col.key === 'lock_auto'
                                    ? (parseLockAutoValue(rawValue) ? '잠금' : '해제')
                                    : String(normalizedRawValue || '');
                                const isCellEditable = editable && !isCellLocked(rowIndex, colIndex, col, row);
                                const dataListId = (autoCompleteOptions[col.key] || []).length ? `editor-autocomplete-${col.key}` : undefined;
                                const isSelected = isCellInSelection(rowIndex, colIndex);
                                const isActive = activeCell.row === rowIndex && activeCell.col === colIndex;
                                const isEditingCurrentCell = isEditing(rowIndex, colIndex);
                                const isCopied = isCellInCopiedRange(rowIndex, colIndex);
                                const cellCursorClass = isEditingCurrentCell ? 'cursor-text' : 'cursor-default';
                                const isLockAutoColumn = col.key === 'lock_auto';
                                const isLockedAuto = parseLockAutoValue(rawValue);

                                if (col.options && isCellEditable) {
                                    return (
                                        <td
                                            key={colIndex}
                                            className={cn(
                                                "p-0 border-r border-slate-200 last:border-0 relative",
                                                cellCursorClass,
                                                !isSelected && isLockAutoColumn && (isLockedAuto ? 'bg-amber-50' : 'bg-emerald-50'),
                                                isSelected && "bg-sky-100/90 border-sky-300 shadow-[inset_0_0_0_1px_rgba(14,116,144,0.42)]",
                                                isActive && "ring-2 ring-sky-600/85 ring-inset z-10",
                                                isCopied && "outline outline-2 outline-emerald-500/80 -outline-offset-2 bg-emerald-50/60",
                                            )}
                                            data-row={rowIndex}
                                            data-col={colIndex}
                                            onMouseDown={(event) => handleCellMouseDown(event, rowIndex, colIndex)}
                                            onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                                            onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                                        >
                                            {isEditingCurrentCell ? (
                                                <select
                                                    className="w-full h-8 px-2 bg-transparent text-[10.5px] font-medium outline-none focus:bg-white focus:ring-1 focus:ring-primary text-slate-700 cursor-text"
                                                    value={optionValue}
                                                    onChange={(event) => {
                                                        const change = buildCellChange(rowIndex, colIndex, event.target.value);
                                                        if (change) applyCellChanges([change]);
                                                    }}
                                                    onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                                    onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                                    onBlur={() => {
                                                        if (!isEditing(rowIndex, colIndex)) return;
                                                        stopEditingCell();
                                                    }}
                                                >
                                                    {col.options.map((opt) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button
                                                    type="button"
                                                    data-cell-display="true"
                                                    className={cn(
                                                        "w-full h-8 px-2 bg-transparent text-[10.5px] font-medium text-left cursor-default",
                                                        isLockAutoColumn
                                                            ? (isLockedAuto ? 'text-amber-700 font-black' : 'text-emerald-700 font-black')
                                                            : 'text-slate-700',
                                                    )}
                                                    onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                                    onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                                >
                                                    {optionValue}
                                                </button>
                                            )}
                                            {isActive && isCellEditable && (
                                                <button
                                                    type="button"
                                                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-sm bg-primary border border-white cursor-crosshair"
                                                    onMouseDown={(event) => handleFillMouseDown(event, rowIndex, colIndex)}
                                                    aria-label="자동 복사 드래그"
                                                />
                                            )}
                                        </td>
                                    );
                                }

                                return (
                                    <td
                                        key={colIndex}
                                        className={cn(
                                            "p-0 border-r border-slate-200 last:border-0 relative",
                                            cellCursorClass,
                                            isSelected && "bg-sky-100/90 border-sky-300 shadow-[inset_0_0_0_1px_rgba(14,116,144,0.42)]",
                                            isActive && "ring-2 ring-sky-600/85 ring-inset z-10",
                                            isCopied && "outline outline-2 outline-emerald-500/80 -outline-offset-2 bg-emerald-50/60",
                                        )}
                                        data-row={rowIndex}
                                        data-col={colIndex}
                                        onMouseDown={(event) => handleCellMouseDown(event, rowIndex, colIndex)}
                                        onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                                        onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                                    >
                                        <input
                                            type="text"
                                            list={dataListId}
                                            className={cn(
                                                'w-full h-8 px-2 outline-none transition-all font-medium placeholder:text-slate-300 text-[10.5px]',
                                                isCellEditable
                                                    ? 'bg-transparent focus:bg-white focus:ring-1 focus:ring-primary text-slate-700'
                                                    : 'bg-slate-100 text-slate-600 font-black',
                                                isEditingCurrentCell ? 'cursor-text' : 'cursor-default',
                                            )}
                                            value={displayValue}
                                            onChange={(event) => {
                                                if (!isCellEditable) return;
                                                const change = buildCellChange(rowIndex, colIndex, event.target.value);
                                                if (change) applyCellChanges([change]);
                                            }}
                                            onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                            onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                            onBlur={() => {
                                                if (!isEditing(rowIndex, colIndex)) return;
                                                stopEditingCell();
                                            }}
                                            readOnly={!isCellEditable || !isEditing(rowIndex, colIndex)}
                                        />
                                        {isActive && isCellEditable && (
                                            <button
                                                type="button"
                                                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-sm bg-primary border border-white cursor-crosshair"
                                                onMouseDown={(event) => handleFillMouseDown(event, rowIndex, colIndex)}
                                                aria-label="자동 복사 드래그"
                                            />
                                        )}
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
                            <td colSpan={columns.length + (allowRowDelete ? 1 : 0) + 1} className="p-12 text-center text-slate-400 font-bold italic bg-white">
                                입력된 데이터가 없습니다.
                            </td>
                        </tr>
                    )}
                </tbody>
                </table>
                {isFillDragging && fillOverlayRect && (
                    <div
                        className="pointer-events-none absolute z-30 rounded-[2px] border-2 border-primary/70 bg-primary/10"
                        style={{
                            left: `${fillOverlayRect.left}px`,
                            top: `${fillOverlayRect.top}px`,
                            width: `${fillOverlayRect.width}px`,
                            height: `${fillOverlayRect.height}px`,
                        }}
                    >
                        <div className="absolute -top-6 right-0 rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            복사 범위 선택 중
                        </div>
                    </div>
                )}
            </div>
            {Object.entries(autoCompleteOptions).map(([key, values]) => {
                if (!Array.isArray(values) || !values.length) return null;
                return (
                    <datalist key={key} id={`editor-autocomplete-${key}`}>
                        {values.map((item) => (
                            <option key={`${key}-${item}`} value={item} />
                        ))}
                    </datalist>
                );
            })}
        </>
    );
};

export default BudgetProjectEditor;
