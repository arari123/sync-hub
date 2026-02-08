import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, ClipboardPaste, Package, Save, Users, Wallet } from 'lucide-react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
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

    const handleSheetRowsChange = (nextDisplayRows) => {
        setDetails((prev) => {
            const newList = [...(prev[activeKey] || [])];
            const phaseIndices = [];
            newList.forEach((item, itemIndex) => {
                if ((item.phase || 'fabrication') === currentPhase) phaseIndices.push(itemIndex);
            });

            const builder = activeMode === 'execution' ? buildEmptyExecutionRow : buildEmptyBudgetRow;
            const targetCount = Math.max(nextDisplayRows.length, phaseIndices.length);
            for (let displayIndex = 0; displayIndex < targetCount; displayIndex += 1) {
                const sourceRow = nextDisplayRows[displayIndex];
                const targetIndex = phaseIndices[displayIndex];
                if (targetIndex === undefined) {
                    if (!sourceRow) continue;
                    newList.push({
                        ...builder(section, currentPhase),
                        ...sourceRow,
                        phase: currentPhase,
                    });
                    continue;
                }

                const base = { ...newList[targetIndex] };
                if (!sourceRow) {
                    newList[targetIndex] = {
                        ...builder(section, currentPhase),
                        phase: currentPhase,
                    };
                    continue;
                }

                const normalized = { ...sourceRow };
                Object.keys(normalized).forEach((key) => {
                    if (normalized[key] === undefined || normalized[key] === null) {
                        normalized[key] = '';
                    }
                });

                if (section === 'expense' && activeMode === 'budget' && base.is_auto) {
                    const currentAmount = toNumber(base.amount);
                    const nextAmount = toNumber(normalized.amount);
                    if (currentAmount !== nextAmount) {
                        base.is_auto = false;
                    }
                }

                newList[targetIndex] = {
                    ...base,
                    ...normalized,
                    phase: currentPhase,
                };
            }

            const currentPhaseCount = newList.filter((item) => (item.phase || 'fabrication') === currentPhase).length;
            if (currentPhaseCount < 120) {
                newList.push(...Array.from({ length: 120 - currentPhaseCount }, () => builder(section, currentPhase)));
            }

            return {
                ...prev,
                [activeKey]: newList,
            };
        });
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
                            <FortuneSheetTable
                                columns={visibleColumns}
                                rows={displayRows}
                                onRowsChange={handleSheetRowsChange}
                                editable={canEditActiveRows}
                            />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

function _normalizeFortuneCellValue(cell) {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'object') {
        if (cell.v !== undefined && cell.v !== null) return cell.v;
        if (cell.m !== undefined && cell.m !== null) return cell.m;
    }
    return cell;
}

function _rowsSignature(rows, columns) {
    const normalized = (rows || []).map((row) => {
        const mapped = {};
        (columns || []).forEach((col) => {
            if (col.readonly || col.computed) return;
            mapped[col.key] = row?.[col.key] ?? '';
        });
        return mapped;
    });
    return JSON.stringify(normalized);
}

function _buildFortuneSheetData(columns, rows) {
    const headerRow = columns.map((col) => ({
        v: col.label,
        m: col.label,
        bg: '#f1f5f9',
        bl: 1,
    }));
    const bodyRows = (rows || []).map((row) => columns.map((col) => {
        const raw = col.computed ? col.computed(row) : row?.[col.key];
        if (raw === '' || raw === null || raw === undefined) return null;
        if (col.type === 'number') {
            const numeric = toNumber(raw);
            return { v: numeric, m: String(numeric) };
        }
        return { v: raw, m: String(raw) };
    }));
    const matrix = [headerRow, ...bodyRows];
    return [
        {
            name: '예산입력',
            id: 'budget-sheet-1',
            order: 0,
            status: 1,
            row: Math.max((rows?.length || 0) + 120, 160),
            column: columns.length,
            data: matrix,
        },
    ];
}

function _parseFortuneRows(columns, workbookSheets, fallbackRowCount) {
    const matrix = Array.isArray(workbookSheets?.[0]?.data) ? workbookSheets[0].data : [];
    const dataRowCount = Math.max(fallbackRowCount, Math.max(matrix.length - 1, 0));
    const parsed = [];

    for (let rowIndex = 0; rowIndex < dataRowCount; rowIndex += 1) {
        const sourceRow = matrix[rowIndex + 1] || [];
        const nextRow = {};
        columns.forEach((col, colIndex) => {
            if (col.readonly || col.computed) return;
            const value = _normalizeFortuneCellValue(sourceRow[colIndex]);
            if (col.type === 'number') {
                nextRow[col.key] = toNumber(value);
            } else if (col.options && col.options.length > 0) {
                const normalized = String(value || '').trim().toUpperCase();
                nextRow[col.key] = col.options.includes(normalized) ? normalized : (col.options[0] || '');
            } else {
                nextRow[col.key] = String(value ?? '');
            }
        });
        parsed.push(nextRow);
    }

    return parsed;
}

const FortuneSheetTable = ({ columns, rows, onRowsChange, editable }) => {
    const [sheetData, setSheetData] = useState(() => _buildFortuneSheetData(columns, rows));
    const rowsSignatureRef = useRef(_rowsSignature(rows, columns));

    useEffect(() => {
        const nextSignature = _rowsSignature(rows, columns);
        rowsSignatureRef.current = nextSignature;
        setSheetData(_buildFortuneSheetData(columns, rows));
    }, [columns, rows]);

    return (
        <div className="h-full min-h-[560px] overflow-hidden rounded-xl">
            <Workbook
                data={sheetData}
                allowEdit={editable}
                showToolbar
                showFormulaBar
                showSheetTabs={false}
                row={Math.max((rows?.length || 0) + 120, 160)}
                column={columns.length}
                hooks={{
                    beforeUpdateCell: (r, c) => {
                        if (!editable) return false;
                        if (r === 0) return false;
                        const column = columns[c];
                        if (!column) return false;
                        if (column.readonly || column.computed) return false;
                        return true;
                    },
                }}
                onChange={(nextSheets) => {
                    setSheetData(nextSheets);
                    const parsedRows = _parseFortuneRows(columns, nextSheets, rows.length);
                    const nextSignature = _rowsSignature(parsedRows, columns);
                    if (nextSignature === rowsSignatureRef.current) return;
                    rowsSignatureRef.current = nextSignature;
                    onRowsChange(parsedRows);
                }}
            />
        </div>
    );
};

export default BudgetProjectEditor;
