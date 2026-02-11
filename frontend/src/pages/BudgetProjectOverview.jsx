import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    Bell,
    ChevronDown,
    Database,
    Grid2x2,
    Loader2,
    Plus,
    Search,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';

const STAGE_SEGMENTS = [
    { key: 'review', label: '검토' },
    { key: 'design', label: '설계' },
    { key: 'production', label: '제작' },
    { key: 'install', label: '설치' },
    { key: 'as', label: '유지보수' },
    { key: 'closed', label: '종료' },
];

const MOCK_TIMELINE_ITEMS = [
    { key: 'design', label: '설계', status: 'completed', statusLabel: '완료', date: '2026-03-15' },
    { key: 'production', label: '제작', status: 'in_progress', statusLabel: '진행 중', date: '2026-04-30' },
    { key: 'install', label: '설치', status: 'pending', statusLabel: '대기', date: '2026-05-20' },
];

const STAGE_LABEL_ALIAS = {
    review: '검토',
    design: '설계',
    production: '제작',
    install: '설치',
    installation: '설치',
    as: '유지보수',
    warranty: '유지보수',
    closed: '종료',
    closure: '종료',
    fabrication: '제작',
    progress: '제작',
};

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
    const number = Math.round(toNumber(value));
    return `${number.toLocaleString('ko-KR')}원`;
}

function truncateProjectName(value, max = 10) {
    const chars = Array.from(String(value || '').trim());
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, max).join('');
}

function resolveStageKey(value) {
    const stage = String(value || '').trim().toLowerCase();
    if (stage === 'review') return 'review';
    if (stage === 'fabrication' || stage === 'progress') return 'production';
    if (stage === 'installation') return 'install';
    if (stage === 'warranty') return 'as';
    if (stage === 'closure') return 'closed';
    return 'design';
}

function ratio(actual, total) {
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (actual / total) * 100));
}

function localizeStageLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase();
    if (STAGE_LABEL_ALIAS[normalized]) return STAGE_LABEL_ALIAS[normalized];
    if (raw === 'A/S') return '유지보수';
    if (/[A-Za-z]/.test(raw)) return '';
    return raw;
}

const BudgetProjectOverview = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [totals, setTotals] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [inputQuery, setInputQuery] = useState('');
    const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
    const [isBudgetMenuOpen, setIsBudgetMenuOpen] = useState(false);
    const quickMenuRef = useRef(null);
    const budgetMenuRef = useRef(null);
    const budgetMenuCloseTimerRef = useRef(null);

    const user = getCurrentUser();
    const userBadge = (user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase();

    useEffect(() => {
        const handlePointerDown = (event) => {
            const target = event.target;
            const isQuickMenuTarget = quickMenuRef.current?.contains(target);
            const isBudgetMenuTarget = budgetMenuRef.current?.contains(target);

            if (!isQuickMenuTarget) setIsQuickMenuOpen(false);
            if (!isBudgetMenuTarget) setIsBudgetMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
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
                    setTotals(currentProject?.totals || null);
                    return;
                }

                const equipmentResp = await api.get(`/budget/versions/${currentVersion.id}/equipments`);
                const itemList = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
                setEquipments(itemList);
                setTotals(equipmentResp?.data?.totals || currentProject?.totals || null);
            } catch (err) {
                setError(getErrorMessage(err, '프로젝트 메인 정보를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [projectId]);

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const nextQuery = inputQuery.trim();
        if (!nextQuery) {
            navigate('/');
            return;
        }
        navigate(`/?q=${encodeURIComponent(nextQuery)}`);
    };

    const monitoring = project?.monitoring || {};
    const confirmedMaterial = Math.max(toNumber(monitoring.confirmed_budget_material), toNumber(totals?.material_total));
    const confirmedLabor = Math.max(toNumber(monitoring.confirmed_budget_labor), toNumber(totals?.labor_total));
    const confirmedExpense = Math.max(toNumber(monitoring.confirmed_budget_expense), toNumber(totals?.expense_total));
    const confirmedTotal = Math.max(
        toNumber(monitoring.confirmed_budget_total),
        confirmedMaterial + confirmedLabor + confirmedExpense,
        toNumber(totals?.grand_total)
    );

    const spentMaterial = Math.max(toNumber(monitoring.actual_spent_material), 0);
    const spentLabor = Math.max(toNumber(monitoring.actual_spent_labor), 0);
    const spentExpense = Math.max(toNumber(monitoring.actual_spent_expense), 0);
    const spentTotal = Math.max(toNumber(monitoring.actual_spent_total), spentMaterial + spentLabor + spentExpense, 0);
    const balanceTotal = confirmedTotal - spentTotal;

    const projectName = String(project?.name || '프로젝트').trim() || '프로젝트';
    const trimmedProjectName = truncateProjectName(projectName, 10);
    const currentStageKey = resolveStageKey(project?.current_stage);
    const currentStageLabel = localizeStageLabel(project?.current_stage_label)
        || STAGE_SEGMENTS.find((item) => item.key === currentStageKey)?.label
        || '-';
    const coverImageUrl = String(
        project?.cover_image_display_url || project?.cover_image_fallback_url || project?.cover_image_url || ''
    ).trim();

    const executionRate = ratio(spentTotal, confirmedTotal);
    const materialRate = ratio(spentMaterial, Math.max(confirmedMaterial, 1));
    const laborRate = ratio(spentLabor, Math.max(confirmedLabor, 1));
    const expenseRate = ratio(spentExpense, Math.max(confirmedExpense, 1));

    const issueCount = 0;
    const documentCount = Math.max(toNumber(project?.document_count), toNumber(project?.documents_count));
    const resourcesCount = Math.max(documentCount + equipments.length, 0);

    const baseProjectPath = `/project-management/projects/${project?.id || projectId}`;
    const projectMainPath = baseProjectPath;
    const budgetManagementPath = `${baseProjectPath}/budget`;
    const budgetMaterialPath = `${baseProjectPath}/edit/material`;
    const budgetLaborPath = `${baseProjectPath}/edit/labor`;
    const budgetExpensePath = `${baseProjectPath}/edit/expense`;
    const issueManagementPath = `${baseProjectPath}/joblist`;
    const scheduleManagementPath = `${baseProjectPath}/schedule`;
    const specManagementPath = `${baseProjectPath}/spec`;
    const dataManagementPath = `${baseProjectPath}/data`;
    const projectSettingPath = `${baseProjectPath}/info/edit`;

    const timelineItems = useMemo(() => MOCK_TIMELINE_ITEMS, []);
    const pathname = location.pathname;
    const isProjectMainActive = pathname === projectMainPath || pathname === `${projectMainPath}/`;
    const isBudgetActive = pathname === budgetManagementPath
        || pathname === `${budgetManagementPath}/`
        || pathname.startsWith(`${baseProjectPath}/edit/`);
    const isIssueActive = pathname === issueManagementPath || pathname === `${issueManagementPath}/`;
    const isScheduleActive = pathname === scheduleManagementPath || pathname === `${scheduleManagementPath}/`;
    const isSpecActive = pathname === specManagementPath || pathname === `${specManagementPath}/`;
    const isDataActive = pathname === dataManagementPath || pathname === `${dataManagementPath}/`;
    const isSettingActive = pathname.startsWith(projectSettingPath);

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
                                {trimmedProjectName || '프로젝트'}
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
                                    to={budgetManagementPath}
                                    onMouseEnter={keepBudgetMenuOpen}
                                    className={cn(
                                        'inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                                        isBudgetActive
                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                    )}
                                >
                                    예산 관리
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

                {isLoading ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
                        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            프로젝트 메인 정보를 불러오는 중입니다.
                        </div>
                    </div>
                ) : !project ? (
                    <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
                        프로젝트를 찾을 수 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-12 gap-6">
                        <section className="col-span-12 bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                            <div className="flex flex-col lg:flex-row h-full">
                                <div className="w-full lg:w-72 h-48 lg:h-auto relative shrink-0 bg-secondary">
                                    {coverImageUrl ? (
                                        <img
                                            alt={`${projectName} 대표 이미지`}
                                            className="w-full h-full object-cover"
                                            src={coverImageUrl}
                                        />
                                    ) : (
                                        <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">대표 이미지 없음</div>
                                    )}
                                </div>

                                <div className="flex-1 p-5 md:p-6 flex flex-col justify-between">
                                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-6">
                                        <div>
                                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                                                <h1 className="text-2xl font-bold text-slate-900">{projectName}</h1>
                                                <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded border border-primary/20">
                                                    {currentStageLabel}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground max-w-2xl">
                                                {project.description || '프로젝트 설명이 아직 등록되지 않았습니다.'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-y-4 gap-x-8 border-t border-border pt-5">
                                        <InfoField label="고객사" value={project.customer_name || '-'} />
                                        <InfoField label="위치" value={project.installation_site || '-'} />
                                        <InfoField label="담당자" value={project.manager_name || '-'} />
                                        <InfoField label="프로젝트 코드" value={project.code || '코드 없음'} mono />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
                            <section className="bg-card rounded-xl shadow-sm border border-border flex-1 flex flex-col">
                                <div className="p-5 border-b border-border flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-red-500 rounded-full" /> 마지막 안건
                                    </h2>
                                    <Link className="text-xs font-medium text-primary hover:text-primary/80" to={issueManagementPath}>
                                        전체 보기
                                    </Link>
                                </div>
                                <div className="p-3 overflow-y-auto flex-1 h-[280px]">
                                    <div className="h-full rounded-lg border border-dashed border-border bg-secondary/40 flex items-center justify-center text-sm text-muted-foreground">
                                        비어 있음 (이슈 등록 미구현)
                                    </div>
                                </div>
                            </section>

                            <section className="bg-card rounded-xl shadow-sm border border-border p-5">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-teal-500 rounded-full" /> 일정 타임라인
                                    </h2>
                                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">향후 일정 연동 예정</span>
                                </div>

                                <div className="relative px-2">
                                    <div className="absolute top-[14px] left-0 w-full h-0.5 bg-border rounded" />
                                    <div className="grid grid-cols-3 gap-2 relative">
                                        {timelineItems.map((item, index) => (
                                            <TimelineStep
                                                key={item.key}
                                                item={item}
                                                step={index + 1}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
                            <section className="bg-card rounded-xl shadow-sm border border-border p-6 flex-1">
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
                                            <span className="w-1.5 h-6 bg-primary rounded-full" /> 예산 대비 집행
                                        </h2>
                                        <p className="text-xs text-muted-foreground">프로젝트 예산/집행 현황</p>
                                    </div>
                                    <div className="text-right">
                                        <Link className="mb-1 inline-flex text-xs font-medium text-primary hover:text-primary/80" to={budgetManagementPath}>
                                            전체 보기
                                        </Link>
                                        <div className="text-3xl font-bold text-slate-900 font-mono tracking-tight">
                                            {formatAmount(balanceTotal)}
                                        </div>
                                        <div className="text-xs font-medium text-emerald-600">사용 가능 잔액</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                    <div className="relative flex items-center justify-center p-4">
                                        <div
                                            className="w-48 h-48 rounded-full p-4"
                                            style={{
                                                background: `conic-gradient(hsl(var(--primary)) ${Math.round(executionRate * 3.6)}deg, hsl(var(--secondary)) 0deg)`,
                                            }}
                                        >
                                            <div className="h-full w-full rounded-full bg-card border border-border flex items-center justify-center text-center">
                                                <div>
                                                    <span className="block text-3xl font-bold text-slate-800">{executionRate.toFixed(0)}%</span>
                                                    <span className="text-xs text-muted-foreground font-medium tracking-wide">집행률</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute bottom-0 right-0 md:-right-4 flex flex-col gap-2 bg-card/95 p-3 rounded-lg shadow-sm border border-border backdrop-blur-sm">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="w-3 h-3 rounded-full bg-primary" />
                                                <span className="text-slate-600">집행: {formatAmount(spentTotal)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="w-3 h-3 rounded-full bg-secondary" />
                                                <span className="text-slate-600">총액: {formatAmount(confirmedTotal)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <BudgetBar
                                            label="재료비"
                                            actual={spentMaterial}
                                            total={confirmedMaterial}
                                            percent={materialRate}
                                            colorClass="from-primary to-blue-400"
                                        />
                                        <BudgetBar
                                            label="인건비"
                                            actual={spentLabor}
                                            total={confirmedLabor}
                                            percent={laborRate}
                                            colorClass="from-teal-500 to-emerald-400"
                                        />
                                        <BudgetBar
                                            label="경비"
                                            actual={spentExpense}
                                            total={confirmedExpense}
                                            percent={expenseRate}
                                            colorClass="from-amber-500 to-orange-400"
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="grid grid-cols-2 gap-6">
                                <StatCard
                                    label="등록 안건 수"
                                    value={`${issueCount}`}
                                    subText="마지막 안건 비어 있음"
                                    accentClass="text-orange-500"
                                    boxClass="bg-orange-50 text-orange-500"
                                />
                                <StatCard
                                    label="자료/데이터"
                                    value={`${resourcesCount}`}
                                    subText={`설비 ${equipments.length}개 / 버전 ${version?.version_no || '-'} `}
                                    accentClass="text-primary"
                                    boxClass="bg-blue-50 text-primary"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

const InfoField = ({ label, value, mono = false }) => (
    <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
        <div className={cn(
            'text-sm font-medium text-slate-700',
            mono && 'font-mono bg-secondary px-2 py-0.5 rounded inline-block'
        )}>
            {value}
        </div>
    </div>
);

const TimelineStep = ({ item, step }) => {
    const isCompleted = item.status === 'completed';
    const isInProgress = item.status === 'in_progress';

    return (
        <div className={cn('flex flex-col items-center text-center group', item.status === 'pending' && 'opacity-60')}>
            <div
                className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-card z-10 mb-3',
                    isCompleted && 'bg-primary text-primary-foreground shadow-lg',
                    isInProgress && 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 animate-pulse',
                    !isCompleted && !isInProgress && 'bg-secondary text-muted-foreground'
                )}
            >
                {isCompleted ? '✓' : step}
            </div>
            <div className={cn('text-sm font-bold mb-1', isInProgress ? 'text-primary' : 'text-slate-700')}>
                {item.label}
            </div>
            <div className={cn('text-[10px] uppercase font-semibold', isInProgress ? 'text-primary' : 'text-muted-foreground')}>
                {item.statusLabel}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{item.date}</div>
        </div>
    );
};

const BudgetBar = ({ label, actual, total, percent, colorClass }) => (
    <div>
        <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">{label}</span>
            <span className="font-mono text-slate-500">{formatAmount(actual)} / {formatAmount(total)}</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
            <div className={cn('h-3 rounded-full bg-gradient-to-r', colorClass)} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
        <div className="flex justify-end mt-1">
            <span className="text-[10px] text-muted-foreground font-medium">{percent.toFixed(1)}%</span>
        </div>
    </div>
);

const StatCard = ({ label, value, subText, accentClass, boxClass }) => (
    <div className="bg-card rounded-xl shadow-sm border border-border p-5 flex items-center justify-between group hover:border-primary/30 transition-all">
        <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
            <h3 className={cn('text-3xl font-bold text-slate-900 group-hover:text-primary transition-colors', accentClass)}>{value}</h3>
            <p className="text-xs text-slate-500 mt-1">{subText}</p>
        </div>
        <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform text-xl', boxClass)}>
            •
        </div>
    </div>
);

export default BudgetProjectOverview;
