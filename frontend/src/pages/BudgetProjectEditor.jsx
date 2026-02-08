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

const DEFAULT_LABOR_DEPARTMENTS = ['PM', '설계', 'SW', '검사기술', '제어1', '제어2'];

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
    domestic_trip_daily: 32000,
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

function toNumber(value) {
    const number = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(number) ? number : 0;
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
            headcount: 1,
            location_type: 'domestic',
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
    const result = { ...detailsObj, budget_settings: mergeBudgetSettings(detailsObj?.budget_settings) };
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

function calcBudgetAmount(row, section, settings) {
    if (section === 'material') return toNumber(row.quantity) * toNumber(row.unit_price);
    if (section === 'labor') {
        const locationType = normalizeLocationType(row.location_type || settings?.installation_locale);
        const hours = laborUnitToHours(row.unit, locationType, settings);
        const headcount = toNumber(row.headcount) || 1;
        return toNumber(row.quantity) * hours * headcount * toNumber(row.hourly_rate);
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
    const [budgetViewMode, setBudgetViewMode] = useState(false);
    const [sortState, setSortState] = useState({ key: '', direction: 'none' });

    const canEditProject = project?.can_edit !== false;
    const isConfirmed = version?.status === 'confirmed';
    const currentStage = (project?.current_stage || version?.stage || 'review').toLowerCase();
    const isExecutionStage = EXECUTION_STAGES.has(currentStage);
    const budgetSettings = useMemo(() => mergeBudgetSettings(details?.budget_settings), [details?.budget_settings]);

    const activeMode = isExecutionStage && !budgetViewMode ? 'execution' : 'budget';
    const activeKey = activeMode === 'execution' ? SECTION_META[section].executionKey : SECTION_META[section].budgetKey;
    const rows = details[activeKey] || [];

    const canEditExecutionFields = canEditProject && isExecutionStage;
    const canEditBudgetFields = canEditProject && !isConfirmed && !isExecutionStage;

    const aggregationModeLabel = activeMode === 'execution' ? '집행금액' : '예산';
    const entryModeLabel = activeMode === 'execution' ? '집행금액 입력 모드' : (isExecutionStage ? '예산 조회 모드' : '예산 입력 모드');

    useEffect(() => {
        setBudgetViewMode(false);
    }, [projectId, section, currentStage]);

    const displayRows = useMemo(
        () => rows
            .map((row, index) => ({ ...row, originalIndex: index }))
            .filter((row) => (row.phase || 'fabrication') === currentPhase),
        [rows, currentPhase],
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
                    : calcBudgetAmount(row, sectionKey, budgetSettings);
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
    }, [details, activeMode, budgetSettings]);

    const aggregation = useMemo(() => ({
        total: Number(sidebarSummary?.[section]?.fabrication_total || 0) + Number(sidebarSummary?.[section]?.installation_total || 0),
        equipments: sidebarSummary?.material?.equipments || [],
    }), [sidebarSummary, section]);

    const budgetColumnsBySection = useMemo(() => ({
        material: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'unit_name', label: '유닛', width: 'w-32' },
            { key: 'part_name', label: '파츠명', width: 'w-40' },
            { key: 'spec', label: '규격/모델명', width: 'w-48' },
            { key: 'quantity', label: '수량', width: 'w-24', type: 'number' },
            { key: 'unit_price', label: '단가', width: 'w-32', type: 'number' },
            { key: 'line_total', label: '합계', width: 'w-36', type: 'number', readonly: true, computed: (row) => toNumber(row.quantity) * toNumber(row.unit_price) },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        labor: [
            { key: 'equipment_name', label: '설비', width: 'w-32' },
            { key: 'task_name', label: '부서', width: 'w-40' },
            { key: 'headcount', label: '인원', width: 'w-20', type: 'number' },
            { key: 'worker_type', label: '직군/메모', width: 'w-32' },
            { key: 'unit', label: '단위', width: 'w-20', options: ['H', 'D', 'W', 'M'] },
            { key: 'quantity', label: '시간/기간', width: 'w-24', type: 'number' },
            { key: 'hourly_rate', label: '시간단가', width: 'w-32', type: 'number' },
            {
                key: 'line_total',
                label: '금액',
                width: 'w-36',
                type: 'number',
                readonly: true,
                computed: (row) => calcBudgetAmount(row, 'labor', budgetSettings),
            },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
        expense: [
            { key: 'equipment_name', label: '설비', width: 'w-40' },
            { key: 'expense_name', label: '경비 항목', width: 'w-48' },
            { key: 'basis', label: '산정 기준', width: 'w-48' },
            { key: 'amount', label: '예산금액', width: 'w-32', type: 'number' },
            { key: 'memo', label: '비고', width: 'w-48' },
        ],
    }), [budgetSettings]);

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
    const isMultiEquipmentProject = useMemo(() => {
        const names = new Set();
        Object.values(SECTION_META).forEach((meta) => {
            (details[meta.budgetKey] || []).forEach((row) => {
                const value = String(row?.equipment_name || '').trim();
                if (value) names.add(value);
            });
        });
        return names.size > 1;
    }, [details]);
    const visibleColumns = useMemo(
        () => columns.filter((col) => isMultiEquipmentProject || col.key !== 'equipment_name'),
        [columns, isMultiEquipmentProject],
    );
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
        const equipmentSet = new Set();
        const unitSet = new Set();
        Object.values(SECTION_META).forEach((meta) => {
            (details[meta.budgetKey] || []).forEach((row) => {
                const equipmentName = String(row?.equipment_name || '').trim();
                if (equipmentName) equipmentSet.add(equipmentName);
            });
        });
        (details.material_items || []).forEach((row) => {
            const unitName = String(row?.unit_name || '').trim();
            if (unitName) unitSet.add(unitName);
        });
        return {
            equipment_name: Array.from(equipmentSet),
            unit_name: Array.from(unitSet),
            task_name: budgetSettings.labor_departments || DEFAULT_LABOR_DEPARTMENTS,
        };
    }, [details, budgetSettings]);
    const canEditActiveRows = activeMode === 'execution' ? canEditExecutionFields : canEditBudgetFields;
    const canSave = canEditActiveRows;

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
                budget_settings: mergeBudgetSettings(),
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

    const updateBudgetSettings = (patch) => {
        setDetails((prev) => ({
            ...prev,
            budget_settings: mergeBudgetSettings({
                ...(prev?.budget_settings || {}),
                ...(typeof patch === 'function' ? patch(prev?.budget_settings || {}) : patch),
            }),
        }));
    };

    const applyDefaultLaborDepartments = () => {
        setDetails((prev) => {
            const settings = mergeBudgetSettings(prev?.budget_settings);
            const departments = settings.labor_departments || DEFAULT_LABOR_DEPARTMENTS;
            const source = [...(prev.labor_items || [])];
            const phaseRows = source.filter((row) => (row.phase || 'fabrication') === currentPhase);
            const existingDepartments = new Set(
                phaseRows
                    .map((row) => String(row.task_name || '').trim())
                    .filter(Boolean),
            );
            const equipmentFallback = phaseRows.find((row) => String(row?.equipment_name || '').trim())?.equipment_name || '';

            departments.forEach((department) => {
                if (existingDepartments.has(department)) return;
                source.push({
                    ...buildEmptyBudgetRow('labor', currentPhase),
                    equipment_name: equipmentFallback,
                    task_name: department,
                    location_type: currentPhase === 'installation'
                        ? normalizeLocationType(settings.installation_locale)
                        : 'domestic',
                });
            });

            return {
                ...prev,
                labor_items: source,
            };
        });
    };

    const autoFillExpenseRows = () => {
        setDetails((prev) => {
            const settings = mergeBudgetSettings(prev?.budget_settings);
            const phase = currentPhase;
            const locale = phase === 'installation'
                ? normalizeLocationType(settings.installation_locale)
                : 'domestic';

            const materialRows = prev.material_items || [];
            const laborRows = prev.labor_items || [];
            const expenseRows = prev.expense_items || [];

            const materialFabTotal = materialRows
                .filter((row) => (row.phase || 'fabrication') === 'fabrication')
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'material', settings), 0);
            const materialInstallTotal = materialRows
                .filter((row) => (row.phase || 'fabrication') === 'installation')
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'material', settings), 0);
            const materialTotal = materialFabTotal + materialInstallTotal;
            const laborFabTotal = laborRows
                .filter((row) => (row.phase || 'fabrication') === 'fabrication')
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'labor', settings), 0);
            const laborInstallTotal = laborRows
                .filter((row) => (row.phase || 'fabrication') === 'installation')
                .reduce((sum, row) => sum + calcBudgetAmount(row, 'labor', settings), 0);
            const projectBudgetBase = materialTotal + laborFabTotal + laborInstallTotal;

            const installationManDays = laborRows
                .filter((row) => (row.phase || 'fabrication') === 'installation')
                .reduce((sum, row) => {
                    const headcount = toNumber(row.headcount) || 1;
                    const locationType = normalizeLocationType(row.location_type || settings.installation_locale);
                    const hours = toNumber(row.quantity) * laborUnitToHours(row.unit, locationType, settings);
                    return sum + ((hours / 8) * headcount);
                }, 0);

            const autoRows = [];
            autoRows.push({
                ...buildEmptyBudgetRow('expense', phase),
                expense_name: '프로젝트 운영비',
                basis: `총 예산 기준 ${toNumber(settings.project_overhead_ratio)}%`,
                amount: Math.floor(projectBudgetBase * (toNumber(settings.project_overhead_ratio) / 100)),
                is_auto: true,
                auto_formula: AUTO_EXPENSE_FORMULAS.PROJECT_OPERATION,
            });
            autoRows.push({
                ...buildEmptyBudgetRow('expense', phase),
                expense_name: '소모품비',
                basis: phase === 'fabrication'
                    ? `제작 재료비 ${toNumber(settings.consumable_ratio_fabrication)}%`
                    : `총 재료비 ${toNumber(settings.consumable_ratio_installation)}%`,
                amount: Math.floor((phase === 'fabrication' ? materialFabTotal : materialTotal) * (
                    phase === 'fabrication'
                        ? toNumber(settings.consumable_ratio_fabrication)
                        : toNumber(settings.consumable_ratio_installation)
                ) / 100),
                is_auto: true,
                auto_formula: AUTO_EXPENSE_FORMULAS.CONSUMABLES,
            });
            autoRows.push({
                ...buildEmptyBudgetRow('expense', phase),
                expense_name: '공구비',
                basis: phase === 'fabrication'
                    ? `제작 재료비 ${toNumber(settings.tool_ratio_fabrication)}%`
                    : `총 재료비 ${toNumber(settings.tool_ratio_installation)}%`,
                amount: Math.floor((phase === 'fabrication' ? materialFabTotal : materialTotal) * (
                    phase === 'fabrication'
                        ? toNumber(settings.tool_ratio_fabrication)
                        : toNumber(settings.tool_ratio_installation)
                ) / 100),
                is_auto: true,
                auto_formula: AUTO_EXPENSE_FORMULAS.TOOLS,
            });

            if (phase === 'fabrication' || locale === 'domestic') {
                const trip = Math.floor(installationManDays * (toNumber(settings.domestic_trip_daily) || 32000));
                const lodging = Math.floor(installationManDays * (toNumber(settings.domestic_lodging_daily) || 70000));
                const transportBundle = Math.ceil(installationManDays / 5);
                const transport = Math.floor(
                    transportBundle
                    * (toNumber(settings.domestic_distance_km) || 0)
                    * (toNumber(settings.domestic_transport_per_km) || 250)
                );
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '출장비',
                    basis: `설치 인원 MD ${installationManDays.toFixed(1)} * ${(toNumber(settings.domestic_trip_daily) || 32000).toLocaleString('ko-KR')}원`,
                    amount: trip,
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.TRIP,
                });
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '숙박비',
                    basis: `설치 인원 MD ${installationManDays.toFixed(1)} * ${(toNumber(settings.domestic_lodging_daily) || 70000).toLocaleString('ko-KR')}원`,
                    amount: lodging,
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.LODGING,
                });
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '국내 교통비',
                    basis: `${transportBundle}회 * ${(toNumber(settings.domestic_distance_km) || 0).toLocaleString('ko-KR')}km * ${(toNumber(settings.domestic_transport_per_km) || 250).toLocaleString('ko-KR')}원`,
                    amount: transport,
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.DOMESTIC_TRANSPORT,
                });
            } else {
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '출장비',
                    basis: `해외 설치 MD ${installationManDays.toFixed(1)} * ${(toNumber(settings.overseas_trip_daily) || 120000).toLocaleString('ko-KR')}원`,
                    amount: Math.floor(installationManDays * (toNumber(settings.overseas_trip_daily) || 120000)),
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.TRIP,
                });
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '숙박비',
                    basis: `해외 설치 MD ${installationManDays.toFixed(1)} * ${(toNumber(settings.overseas_lodging_daily) || 200000).toLocaleString('ko-KR')}원`,
                    amount: Math.floor(installationManDays * (toNumber(settings.overseas_lodging_daily) || 200000)),
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.LODGING,
                });
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '해외 교통비',
                    basis: `해외 교통비 단가 수동 입력 필요 (자동 산정 수량: ${Math.ceil(installationManDays * (toNumber(settings.overseas_transport_daily_count) || 1))})`,
                    amount: 0,
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.OVERSEAS_TRANSPORT,
                });
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: '항공료',
                    basis: `해외 설치 MD ${installationManDays.toFixed(1)} * ${(toNumber(settings.overseas_airfare_daily) || 350000).toLocaleString('ko-KR')}원`,
                    amount: Math.floor(installationManDays * (toNumber(settings.overseas_airfare_daily) || 350000)),
                    is_auto: true,
                    auto_formula: AUTO_EXPENSE_FORMULAS.AIRFARE,
                });
            }

            [
                ['현지인원채용 비용', AUTO_EXPENSE_FORMULAS.LOCAL_HIRE],
                ['도비 비용', AUTO_EXPENSE_FORMULAS.DOBI],
                ['기타 비용', AUTO_EXPENSE_FORMULAS.OTHER],
            ].forEach(([name, formula]) => {
                autoRows.push({
                    ...buildEmptyBudgetRow('expense', phase),
                    expense_name: name,
                    basis: '수동 입력',
                    amount: 0,
                    is_auto: true,
                    auto_formula: formula,
                });
            });

            const samePhaseRows = expenseRows.filter((row) => (row.phase || 'fabrication') === phase);
            const otherPhaseRows = expenseRows.filter((row) => (row.phase || 'fabrication') !== phase);
            const currentByFormula = {};
            samePhaseRows.forEach((row) => {
                const formula = String(row.auto_formula || '').trim();
                if (!formula) return;
                currentByFormula[formula] = row;
            });

            const nextPhaseRows = [];
            autoRows.forEach((generated) => {
                const current = currentByFormula[generated.auto_formula];
                if (current && current.is_auto === false) {
                    nextPhaseRows.push(current);
                    return;
                }
                nextPhaseRows.push({
                    ...generated,
                    equipment_name: current?.equipment_name || generated.equipment_name,
                    memo: current?.memo || generated.memo,
                });
            });

            samePhaseRows.forEach((row) => {
                if (!row.auto_formula || row.is_auto === false) {
                    nextPhaseRows.push(row);
                }
            });

            return {
                ...prev,
                expense_items: [...otherPhaseRows, ...nextPhaseRows],
            };
        });
    };

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
            if (['quantity', 'unit_price', 'hourly_rate', 'amount', 'executed_amount', 'headcount'].includes(key)) {
                row[key] = toNumber(value);
            } else if (key === 'unit') {
                row[key] = String(value || '').toUpperCase();
            } else if (key === 'location_type') {
                row[key] = normalizeLocationType(value);
            } else {
                row[key] = value;
            }
            if (section === 'expense' && activeMode === 'budget' && key === 'amount' && row.is_auto) {
                row.is_auto = false;
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
            const equipmentFallback = (project?.name || '기본 설비').trim() || '기본 설비';
            Object.keys(SECTION_META).forEach((sectionKey) => {
                const meta = SECTION_META[sectionKey];
                cleanDetails[meta.budgetKey] = (details[meta.budgetKey] || [])
                    .filter((row) => !isBudgetRowEmpty(row, sectionKey))
                    .map((row) => {
                        if (isMultiEquipmentProject) return row;
                        return {
                            ...row,
                            equipment_name: String(row?.equipment_name || '').trim() || equipmentFallback,
                        };
                    });
                cleanDetails[meta.executionKey] = (details[meta.executionKey] || [])
                    .filter((row) => !isExecutionRowEmpty(row, sectionKey))
                    .map((row) => {
                        if (isMultiEquipmentProject) return row;
                        return {
                            ...row,
                            equipment_name: String(row?.equipment_name || '').trim() || equipmentFallback,
                        };
                    });
            });
            cleanDetails.budget_settings = mergeBudgetSettings(details?.budget_settings);

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

    const switchMode = (mode) => {
        if (!isExecutionStage) return;
        setBudgetViewMode(mode === 'budget');
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
        <div className="flex h-screen border-t border-slate-200 overflow-hidden">
            <BudgetSidebar aggregation={aggregation} summary={sidebarSummary} modeLabel={aggregationModeLabel} />

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

                                {!isMultiEquipmentProject && (
                                    <div className="inline-flex items-center rounded-md border bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                        단일 설비 프로젝트: 설비 컬럼은 숨김 처리됨
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

                                {isExecutionStage && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => switchMode('execution')}
                                            className={cn(
                                                'h-8 rounded-lg px-3 text-[11px] font-black transition-colors',
                                                !budgetViewMode ? 'bg-white text-blue-700 ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-800',
                                            )}
                                        >
                                            집행 입력
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => switchMode('budget')}
                                            className={cn(
                                                'h-8 rounded-lg px-3 text-[11px] font-black transition-colors',
                                                budgetViewMode ? 'bg-white text-amber-700 ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-800',
                                            )}
                                        >
                                            예산 보기
                                        </button>
                                    </div>
                                )}

                                {activeMode === 'budget' && section === 'labor' && (
                                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={applyDefaultLaborDepartments}
                                            className="h-8 rounded-lg px-3 text-[11px] font-black bg-white text-emerald-700 ring-1 ring-slate-200"
                                        >
                                            기본 부서 적용
                                        </button>
                                        <input
                                            value={(budgetSettings.labor_departments || []).join(', ')}
                                            onChange={(event) => {
                                                const departments = event.target.value
                                                    .split(',')
                                                    .map((item) => item.trim())
                                                    .filter(Boolean);
                                                updateBudgetSettings({ labor_departments: departments });
                                            }}
                                            className="h-8 w-64 rounded-md border bg-white px-2 text-[11px]"
                                            placeholder="부서명 콤마(,) 구분"
                                        />
                                    </div>
                                )}

                                {activeMode === 'budget' && (section === 'labor' || section === 'expense') && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => updateBudgetSettings({ installation_locale: 'domestic' })}
                                            className={cn(
                                                'h-8 rounded-lg px-3 text-[11px] font-black transition-colors',
                                                budgetSettings.installation_locale === 'domestic'
                                                    ? 'bg-white text-blue-700 ring-1 ring-slate-200'
                                                    : 'text-slate-600 hover:text-slate-800',
                                            )}
                                        >
                                            국내 설치
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateBudgetSettings({ installation_locale: 'overseas' })}
                                            className={cn(
                                                'h-8 rounded-lg px-3 text-[11px] font-black transition-colors',
                                                budgetSettings.installation_locale === 'overseas'
                                                    ? 'bg-white text-indigo-700 ring-1 ring-slate-200'
                                                    : 'text-slate-600 hover:text-slate-800',
                                            )}
                                        >
                                            해외 설치
                                        </button>
                                    </div>
                                )}

                                {activeMode === 'budget' && section === 'expense' && (
                                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={autoFillExpenseRows}
                                            className="h-8 rounded-lg px-3 text-[11px] font-black bg-white text-indigo-700 ring-1 ring-slate-200"
                                        >
                                            경비 자동 산정
                                        </button>
                                        <input
                                            type="text"
                                            value={toNumber(budgetSettings.domestic_distance_km).toLocaleString('ko-KR')}
                                            onChange={(event) => updateBudgetSettings({ domestic_distance_km: toNumber(event.target.value) })}
                                            className="h-8 w-28 rounded-md border bg-white px-2 text-[11px]"
                                            placeholder="왕복거리(km)"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 mr-2">
                                    <ClipboardPaste size={12} />
                                    <span>{canEditActiveRows ? '엑셀 붙여넣기 가능' : '예산 보기 모드(수정 불가)'}</span>
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
                                columns={visibleColumns}
                                rows={sortedDisplayRows}
                                sortState={sortState}
                                onSort={toggleSort}
                                autoCompleteOptions={autoCompleteOptions}
                                onChange={(idx, key, val) => updateRow(sortedDisplayRows[idx].originalIndex, key, val)}
                                onRemove={(idx) => removeRow(sortedDisplayRows[idx].originalIndex)}
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
}) => {
    const tableWrapperRef = useRef(null);
    const tableRef = useRef(null);
    const preserveSelectionOnFocusRef = useRef(false);
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
        if (!editable || !column || column.readonly) return;
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

            const rowMin = Math.min(anchor.row, target.row);
            const rowMax = Math.max(anchor.row, target.row);
            const colMin = Math.min(anchor.col, target.col);
            const colMax = Math.max(anchor.col, target.col);
            const sourceColumn = columns[anchor.col];
            if (!sourceColumn || sourceColumn.readonly) return;
            const sourceRow = rows[anchor.row];
            if (!sourceRow) return;
            const sourceValueRaw = sourceColumn.computed
                ? sourceColumn.computed(sourceRow)
                : sourceRow[sourceColumn.key];
            const sourceValue = sourceColumn.type === 'number'
                ? String(toNumber(sourceValueRaw))
                : String(sourceValueRaw ?? '');

            for (let r = rowMin; r <= rowMax; r += 1) {
                for (let c = colMin; c <= colMax; c += 1) {
                    if (r === anchor.row && c === anchor.col) continue;
                    const column = columns[c];
                    if (!column || column.readonly) continue;
                    const nextValue = column.type === 'number'
                        ? sourceValue.replace(/[^0-9]/g, '')
                        : sourceValue;
                    onChange(r, column.key, nextValue);
                }
            }
        };

        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [columns, fillAnchor, fillTarget, isFillDragging, onChange, rows]);

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
        const isCellEditable = editable && column && !column.readonly;
        const isPrintableKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
        const isEditingCurrentCell = isEditing(rowIndex, colIndex);

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
            onChange(rowIndex, column.key, nextValue);
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
        setActiveCell({ row: rowIndex, col: colIndex });
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
            setSelectionEnd({ row: rowIndex, col: colIndex });
        } else {
            setSelectionStart({ row: rowIndex, col: colIndex });
            setSelectionEnd({ row: rowIndex, col: colIndex });
        }
        setIsSelecting(true);
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
                const normalizedValue = column.type === 'number'
                    ? String(toNumber(rawValue))
                    : String(rawValue ?? '');
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

        matrix.forEach((cells, rowOffset) => {
            cells.forEach((cellText, colOffset) => {
                const targetRow = startRow + rowOffset;
                const targetCol = startCol + colOffset;
                if (targetRow < 0 || targetRow >= rowCount) return;
                if (targetCol < 0 || targetCol >= colCount) return;

                const column = columns[targetCol];
                if (!column || column.readonly) return;

                let nextValue = String(cellText ?? '');
                if (column.type === 'number') {
                    nextValue = nextValue.replace(/[^0-9]/g, '');
                } else if (column.options) {
                    nextValue = nextValue.trim().toUpperCase();
                }
                onChange(targetRow, column.key, nextValue);
                hasWrite = true;
                rowMax = Math.max(rowMax, targetRow);
                colMax = Math.max(colMax, targetCol);
            });
        });

        if (!hasWrite) return;
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
                                const displayValue = col.type === 'number'
                                    ? (rawValue === null || rawValue === undefined || rawValue === '' ? '' : toNumber(rawValue).toLocaleString('ko-KR'))
                                    : (rawValue || '');
                                const isCellEditable = editable && !col.readonly;
                                const dataListId = (autoCompleteOptions[col.key] || []).length ? `editor-autocomplete-${col.key}` : undefined;
                                const isSelected = isCellInSelection(rowIndex, colIndex);
                                const isActive = activeCell.row === rowIndex && activeCell.col === colIndex;
                                const isEditingCurrentCell = isEditing(rowIndex, colIndex);
                                const isCopied = isCellInCopiedRange(rowIndex, colIndex);
                                const cellCursorClass = isEditingCurrentCell ? 'cursor-text' : 'cursor-default';

                                if (col.options && isCellEditable) {
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
                                            {isEditingCurrentCell ? (
                                                <select
                                                    className="w-full h-8 px-2 bg-transparent text-[10.5px] font-medium outline-none focus:bg-white focus:ring-1 focus:ring-primary text-slate-700 cursor-text"
                                                    value={String(rawValue || '').toUpperCase()}
                                                    onChange={(event) => onChange(rowIndex, col.key, event.target.value)}
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
                                                    className="w-full h-8 px-2 bg-transparent text-[10.5px] font-medium text-left text-slate-700 cursor-default"
                                                    onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                                    onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                                >
                                                    {String(rawValue || '').toUpperCase()}
                                                </button>
                                            )}
                                            {isActive && editable && !col.readonly && (
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
                                                    : 'bg-slate-50 text-slate-400',
                                                isEditingCurrentCell ? 'cursor-text' : 'cursor-default',
                                            )}
                                            value={displayValue}
                                            onChange={(event) => {
                                                if (!isCellEditable) return;
                                                let val = event.target.value;
                                                if (col.type === 'number') val = val.replace(/[^0-9]/g, '');
                                                onChange(rowIndex, col.key, val);
                                            }}
                                            onFocus={() => handleCellFocus(rowIndex, colIndex)}
                                            onKeyDown={(event) => handleKeyDown(event, rowIndex, colIndex)}
                                            onBlur={() => {
                                                if (!isEditing(rowIndex, colIndex)) return;
                                                stopEditingCell();
                                            }}
                                            readOnly={!isCellEditable || !isEditing(rowIndex, colIndex)}
                                        />
                                        {isActive && editable && !col.readonly && (
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
