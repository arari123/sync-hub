import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
    Loader2,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import GlobalTopBar from '../components/GlobalTopBar';

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

const PROJECT_TYPE_LABEL_ALIAS = {
    equipment: '설비',
    parts: '파츠',
    as: '유지보수',
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

function formatAgendaDate(value) {
    const text = String(value || '').trim();
    if (text.length < 10) return '-';
    const month = text.slice(5, 7);
    const day = text.slice(8, 10);
    return `${month}.${day}`;
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

function localizeProjectTypeLabel(labelValue, typeValue) {
    const rawLabel = String(labelValue || '').trim();
    const normalizedLabel = rawLabel.toLowerCase();
    if (rawLabel && PROJECT_TYPE_LABEL_ALIAS[normalizedLabel]) {
        return PROJECT_TYPE_LABEL_ALIAS[normalizedLabel];
    }
    if (rawLabel && !/[A-Za-z]/.test(rawLabel)) {
        return rawLabel;
    }

    const normalizedType = String(typeValue || '').trim().toLowerCase();
    if (PROJECT_TYPE_LABEL_ALIAS[normalizedType]) {
        return PROJECT_TYPE_LABEL_ALIAS[normalizedType];
    }

    if (rawLabel) return rawLabel;
    if (typeValue && !/[A-Za-z]/.test(String(typeValue))) return String(typeValue);
    return '미분류';
}

const BudgetProjectOverview = () => {
    const { projectId } = useParams();
    const location = useLocation();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [totals, setTotals] = useState(null);
    const [agendaItems, setAgendaItems] = useState([]);
    const [agendaTotal, setAgendaTotal] = useState(0);
    const [isAgendaLoading, setIsAgendaLoading] = useState(false);
    const [agendaError, setAgendaError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setIsAgendaLoading(true);
            setError('');
            setAgendaError('');

            try {
                const versionsResp = await api.get(`/budget/projects/${projectId}/versions`);
                const payload = versionsResp?.data || {};
                const currentProject = payload.project || null;
                setProject(currentProject);

                const currentVersion = (payload.versions || []).find((item) => item.is_current) || (payload.versions || [])[0] || null;
                setVersion(currentVersion);

                try {
                    const agendaResp = await api.get(`/agenda/projects/${projectId}/threads`, {
                        params: { page: 1, per_page: 5, include_drafts: false },
                    });
                    const agendaPayload = agendaResp?.data || {};
                    setAgendaItems(Array.isArray(agendaPayload?.items) ? agendaPayload.items : []);
                    setAgendaTotal(Number(agendaPayload?.total || 0));
                    setAgendaError('');
                } catch (agendaErr) {
                    setAgendaItems([]);
                    setAgendaTotal(0);
                    setAgendaError(getErrorMessage(agendaErr, '안건 정보를 불러오지 못했습니다.'));
                }

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
                setIsAgendaLoading(false);
                setIsLoading(false);
            }
        };

        load();
    }, [projectId]);

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
    const currentProjectTypeLabel = localizeProjectTypeLabel(project?.project_type_label, project?.project_type);
    const coverImageUrl = String(
        project?.cover_image_display_url || project?.cover_image_fallback_url || project?.cover_image_url || ''
    ).trim();

    const executionRate = ratio(spentTotal, confirmedTotal);
    const materialRate = ratio(spentMaterial, Math.max(confirmedMaterial, 1));
    const laborRate = ratio(spentLabor, Math.max(confirmedLabor, 1));
    const expenseRate = ratio(spentExpense, Math.max(confirmedExpense, 1));

    const issueCount = Math.max(agendaTotal, agendaItems.length);
    const latestAgenda = agendaItems[0] || null;
    const latestAgendaTitle = latestAgenda
        ? (latestAgenda.latest_title || latestAgenda.root_title || latestAgenda.title || '')
        : '';
    const latestAgendaSubText = latestAgendaTitle
        ? `${formatAgendaDate(latestAgenda.last_updated_at || latestAgenda.updated_at)} · ${latestAgendaTitle}`
        : (agendaError || '등록된 안건이 없습니다.');
    const documentCount = Math.max(toNumber(project?.document_count), toNumber(project?.documents_count));
    const resourcesCount = Math.max(documentCount + equipments.length, 0);

    const baseProjectPath = `/project-management/projects/${project?.id || projectId}`;
    const projectMainPath = baseProjectPath;
    const budgetManagementPath = `${baseProjectPath}/budget`;
    const issueManagementPath = `${baseProjectPath}/agenda`;
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
        <div className="app-shell min-h-screen bg-background text-foreground">
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
                                {trimmedProjectName || '프로젝트'}
                            </span>
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
                                to={budgetManagementPath}
                                data-active={isBudgetActive}
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
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700">
                                                    {currentProjectTypeLabel}
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
                                    {isAgendaLoading ? (
                                        <div className="h-full rounded-lg border border-border bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground">
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                안건 정보를 불러오는 중...
                                            </span>
                                        </div>
                                    ) : agendaItems.length <= 0 ? (
                                        <div className="h-full rounded-lg border border-dashed border-border bg-secondary/40 flex items-center justify-center text-sm text-muted-foreground">
                                            {agendaError || '등록된 안건이 없습니다.'}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {agendaItems.map((agendaItem) => {
                                                const agendaTitle = agendaItem.root_title || agendaItem.title || '제목 없음';
                                                const latestTitle = agendaItem.latest_title || agendaTitle;
                                                const statusLabel = agendaItem.progress_status === 'completed' ? '완료' : '진행 중';
                                                const subDate = formatAgendaDate(agendaItem.last_updated_at || agendaItem.updated_at);
                                                return (
                                                    <Link
                                                        key={`overview-agenda-${agendaItem.id}`}
                                                        to={`${issueManagementPath}/${agendaItem.id}`}
                                                        className="block rounded-lg border border-border bg-background px-3 py-2 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="truncate text-sm font-semibold text-slate-800">{agendaTitle}</p>
                                                            <span className={cn(
                                                                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                                                                agendaItem.progress_status === 'completed'
                                                                    ? 'border-slate-300 bg-slate-100 text-slate-600'
                                                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                            )}
                                                            >
                                                                {statusLabel}
                                                            </span>
                                                        </div>
                                                        {latestTitle !== agendaTitle && (
                                                            <p className="mt-1 truncate text-[11px] text-slate-600">최근 답변: {latestTitle}</p>
                                                        )}
                                                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                                            <span>답변 {agendaItem.reply_count || 0} · 코멘트 {agendaItem.comment_count || 0}</span>
                                                            <span>{subDate}</span>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
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
                                    subText={latestAgendaSubText}
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
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
        <div className={cn(
            'block text-sm font-bold text-slate-800',
            mono && 'mt-0.5 w-fit break-all rounded bg-secondary px-2 py-0.5 font-mono'
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
