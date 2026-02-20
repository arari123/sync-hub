import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Loader2,
    PencilLine,
    Search,
    SlidersHorizontal,
    TimerReset,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import {
    buildHierarchy,
    ganttPosition,
    getScheduleBounds,
    normalizeSchedulePayload,
    parseYmd,
    pickAutoScale,
    STAGE_LABELS,
    STAGE_ORDER,
    todayYmd,
    WEEKEND_MODES,
    weekendBands,
} from '../lib/scheduleUtils';

const STAGE_STYLES = {
    design: {
        badge: 'border-sky-200 bg-sky-50 text-sky-700',
        bar: 'bg-sky-500',
        rail: 'bg-sky-100',
        rowBorder: 'border-l-sky-500',
    },
    fabrication: {
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        bar: 'bg-amber-500',
        rail: 'bg-amber-100',
        rowBorder: 'border-l-amber-500',
    },
    installation: {
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        bar: 'bg-emerald-500',
        rail: 'bg-emerald-100',
        rowBorder: 'border-l-emerald-500',
    },
};

const FILTER_CHIP_BASE_CLASS =
    'inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const FILTER_CHIP_ACTIVE_CLASS = 'border-primary bg-primary text-primary-foreground shadow-sm';
const FILTER_CHIP_INACTIVE_CLASS =
    'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground';
const MOBILE_FILTER_BUTTON_BASE_CLASS =
    'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const MOBILE_FILTER_BUTTON_ACTIVE_CLASS = 'border-primary/40 bg-primary/10 text-primary';
const MOBILE_FILTER_BUTTON_INACTIVE_CLASS =
    'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground';
const KIND_FILTER_OPTIONS = [
    { value: 'task', label: '일정' },
    { value: 'event', label: '이벤트' },
];
const STATUS_FILTER_OPTIONS = [
    { value: 'upcoming', label: '예정' },
    { value: 'in_progress', label: '진행 중' },
    { value: 'completed', label: '완료' },
];
const MILESTONE_ROW_HEIGHT_NO_EVENTS_PX = 44;
const MILESTONE_BASE_ROW_HEIGHT_PX = 56;
const MILESTONE_EVENT_LANE_HEIGHT_PX = 18;
const MILESTONE_EVENT_LABEL_MIN_WIDTH_PX = 96;
const MILESTONE_EVENT_LABEL_MAX_WIDTH_PX = 320;
const MILESTONE_EVENT_LABEL_GAP_PX = 10;
const MILESTONE_CHART_MIN_WIDTH_PX = 320;

function formatDateLabel(value) {
    const text = String(value || '').trim();
    if (!text || text.length < 10) return '-';
    return `${text.slice(0, 4)}.${text.slice(5, 7)}.${text.slice(8, 10)}`;
}

function formatRangeLabel(startValue, endValue) {
    const start = formatDateLabel(startValue);
    const end = formatDateLabel(endValue);
    if (start === '-' && end === '-') return '-';
    return `${start} ~ ${end}`;
}

function resolveStatus(row, today) {
    if (!row?.start_date || !row?.end_date) return 'upcoming';
    if (row.end_date < today) return 'completed';
    if (row.start_date > today) return 'upcoming';
    return 'in_progress';
}

function flattenRows(hierarchy) {
    const rows = [];

    const visitGroup = (groupNode, ancestorNames = [], stageLabel = '') => {
        const currentName = String(groupNode?.name || '').trim();
        const isRoot = Boolean(groupNode?.is_system);
        const nextAncestors = isRoot
            ? (stageLabel ? [stageLabel] : ancestorNames)
            : [...ancestorNames, currentName];

        (groupNode?.rows || []).forEach((row) => {
            rows.push({
                ...row,
                group_path: nextAncestors.join(' / '),
            });
        });

        (groupNode?.children || []).forEach((child) => {
            visitGroup(child, nextAncestors, stageLabel);
        });
    };

    (hierarchy?.stages || []).forEach((stageNode) => {
        visitGroup(stageNode.root, [], stageNode.label || STAGE_LABELS[stageNode.stage] || '단계');
    });

    return rows;
}

function buildTickItems(bounds, scale) {
    if (!bounds) return [];

    const items = [];
    const dayMs = 86400000;
    const totalDays = Math.max(1, bounds.days);

    if (scale === 'day') {
        const step = Math.max(1, Math.ceil(totalDays / 12));
        for (let offset = 0; offset < totalDays; offset += step) {
            const date = new Date(bounds.min.getTime() + (offset * dayMs));
            items.push({
                key: `d-${offset}`,
                left: (offset / totalDays) * 100,
                label: `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`,
            });
        }
        return items;
    }

    if (scale === 'week') {
        let cursor = new Date(bounds.min.getTime());
        const day = cursor.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        cursor.setUTCDate(cursor.getUTCDate() + mondayOffset);

        while (cursor <= bounds.max) {
            const offset = Math.floor((cursor.getTime() - bounds.min.getTime()) / dayMs);
            if (offset >= 0) {
                items.push({
                    key: `w-${offset}`,
                    left: (offset / totalDays) * 100,
                    label: `${String(cursor.getUTCMonth() + 1).padStart(2, '0')}/${String(cursor.getUTCDate()).padStart(2, '0')}`,
                });
            }
            cursor.setUTCDate(cursor.getUTCDate() + 7);
        }

        return items;
    }

    let cursor = new Date(Date.UTC(bounds.min.getUTCFullYear(), bounds.min.getUTCMonth(), 1));
    while (cursor <= bounds.max) {
        const offset = Math.floor((cursor.getTime() - bounds.min.getTime()) / dayMs);
        if (offset >= 0) {
            items.push({
                key: `m-${offset}`,
                left: (offset / totalDays) * 100,
                label: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
            });
        }
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }

    return items;
}

function getTodayLinePosition(bounds, today) {
    if (!bounds) return null;
    const parsedToday = parseYmd(today);
    if (!parsedToday) return null;
    if (parsedToday < bounds.min || parsedToday > bounds.max) return null;

    const offset = Math.floor((parsedToday.getTime() - bounds.min.getTime()) / 86400000);
    return (offset / Math.max(1, bounds.days)) * 100;
}

function getDatePositionPercent(bounds, ymd) {
    if (!bounds) return null;
    const parsed = parseYmd(ymd);
    if (!parsed) return null;
    if (parsed < bounds.min || parsed > bounds.max) return null;
    const offset = Math.floor((parsed.getTime() - bounds.min.getTime()) / 86400000);
    return (offset / Math.max(1, bounds.days)) * 100;
}

function clampPercent(value, min = 0.5, max = 99.5) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, number));
}

function estimateEventNameVisualLength(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    return Array.from(text).reduce((sum, char) => (
        sum + (/[\x20-\x7E]/.test(char) ? 1 : 1.7)
    ), 0);
}

function estimateMilestoneLabelWidthPx(dateValue, eventName) {
    const dateText = formatDateLabel(dateValue);
    const dateVisualLength = estimateEventNameVisualLength(dateText);
    const nameVisualLength = estimateEventNameVisualLength(eventName);
    const dateChipWidth = 10 + (dateVisualLength * 5.4);
    const nameWidth = Math.max(12, nameVisualLength * 6.2);
    const estimated = 16 + dateChipWidth + 6 + nameWidth;
    return Math.min(
        MILESTONE_EVENT_LABEL_MAX_WIDTH_PX,
        Math.max(MILESTONE_EVENT_LABEL_MIN_WIDTH_PX, estimated),
    );
}

function resolveMilestoneLabelWindowPx(positionPx, widthPx, chartWidthPx) {
    const safeWidth = Math.min(
        MILESTONE_EVENT_LABEL_MAX_WIDTH_PX,
        Math.max(MILESTONE_EVENT_LABEL_MIN_WIDTH_PX, widthPx),
    );
    const maxStart = Math.max(0, chartWidthPx - safeWidth);
    const startPx = Math.min(maxStart, Math.max(0, positionPx - (safeWidth / 2)));
    return { startPx, widthPx: safeWidth };
}

function layoutMilestoneEvents(rows, bounds, chartWidthPx) {
    if (!Number.isFinite(chartWidthPx) || chartWidthPx <= 0) return [];

    const topLaneRightEdges = [];
    const bottomLaneRightEdges = [];
    let previousWindow = null;

    const findLane = (laneRightEdges, startPx) => {
        let lane = 0;
        while (
            lane < laneRightEdges.length
            && startPx <= (laneRightEdges[lane] + MILESTONE_EVENT_LABEL_GAP_PX)
        ) {
            lane += 1;
        }
        return lane;
    };

    return rows
        .map((row) => {
            const rawPos = getDatePositionPercent(bounds, row.start_date);
            const safePosition = clampPercent(rawPos);
            if (safePosition === null) return null;

            const anchorPx = (safePosition / 100) * chartWidthPx;
            const labelWidthPx = estimateMilestoneLabelWidthPx(row.start_date, row.name || '이벤트');
            const window = resolveMilestoneLabelWindowPx(
                anchorPx,
                labelWidthPx,
                chartWidthPx,
            );

            const isCloseToPrevious = previousWindow
                ? window.startPx <= (previousWindow.endPx + MILESTONE_EVENT_LABEL_GAP_PX)
                : false;

            const preferredPlacement = isCloseToPrevious
                ? (previousWindow?.placement === 'top' ? 'bottom' : 'top')
                : 'top';
            const oppositePlacement = preferredPlacement === 'top' ? 'bottom' : 'top';

            const preferredLaneRightEdges = preferredPlacement === 'top' ? topLaneRightEdges : bottomLaneRightEdges;
            const oppositeLaneRightEdges = oppositePlacement === 'top' ? topLaneRightEdges : bottomLaneRightEdges;

            let placement = preferredPlacement;
            let lane = findLane(preferredLaneRightEdges, window.startPx);

            if (lane > 0) {
                const oppositeLane = findLane(oppositeLaneRightEdges, window.startPx);
                if (oppositeLane < lane) {
                    placement = oppositePlacement;
                    lane = oppositeLane;
                }
            }

            const laneRightEdges = placement === 'top' ? topLaneRightEdges : bottomLaneRightEdges;
            laneRightEdges[lane] = window.startPx + window.widthPx;

            const event = {
                id: row.id,
                name: row.name || '이벤트',
                date: row.start_date,
                lane,
                placement,
                position: safePosition,
            };

            previousWindow = {
                placement,
                endPx: window.startPx + window.widthPx,
            };

            return event;
        })
        .filter(Boolean);
}

function resolveMilestoneRowHeight(laneDepth, showEvents) {
    if (!showEvents) return MILESTONE_ROW_HEIGHT_NO_EVENTS_PX;
    const safeLaneDepth = Math.max(1, Number(laneDepth || 1));
    return MILESTONE_BASE_ROW_HEIGHT_PX + ((safeLaneDepth - 1) * MILESTONE_EVENT_LANE_HEIGHT_PX * 2);
}

export default function BudgetProjectScheduleManagement() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [schedule, setSchedule] = useState(() => normalizeSchedulePayload(null));

    const [searchText, setSearchText] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [kindFilter, setKindFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const milestoneScrollRef = useRef(null);
    const ganttScrollRef = useRef(null);
    const milestoneChartAreaRef = useRef(null);
    const isSyncingScrollRef = useRef(false);
    const [milestoneChartWidth, setMilestoneChartWidth] = useState(640);

    useEffect(() => {
        const loadSchedule = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const response = await api.get(`/budget/projects/${projectId}/schedule`);
                const payload = response?.data || {};
                setProject(payload.project || null);
                setSchedule(normalizeSchedulePayload(payload.schedule || null));
            } catch (err) {
                setError(getErrorMessage(err, '일정 관리 데이터를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        loadSchedule();
    }, [projectId]);

    const today = useMemo(() => todayYmd(), []);

    const rawRows = useMemo(() => {
        const hierarchy = buildHierarchy(schedule);
        const flattened = flattenRows(hierarchy);
        return flattened.map((row) => {
            const status = resolveStatus(row, today);
            return {
                ...row,
                status,
            };
        });
    }, [schedule, today]);

    const scopedRows = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();

        return rawRows
            .filter((row) => {
                if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
                if (statusFilter !== 'all' && row.status !== statusFilter) return false;

                if (!keyword) return true;

                const haystack = [
                    row.name,
                    row.group_path,
                    row.note,
                    row.start_date,
                    row.end_date,
                    STAGE_LABELS[row.stage],
                ].join(' ').toLowerCase();

                return haystack.includes(keyword);
            })
            .sort((a, b) => {
                const stageDiff = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
                if (stageDiff !== 0) return stageDiff;
                if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
                if (a.end_date !== b.end_date) return a.end_date.localeCompare(b.end_date);
                return a.name.localeCompare(b.name, 'ko-KR');
            });
    }, [rawRows, searchText, stageFilter, statusFilter]);

    const kindFilteredRows = useMemo(() => {
        if (kindFilter === 'all') return scopedRows;
        return scopedRows.filter((row) => row.kind === kindFilter);
    }, [kindFilter, scopedRows]);

    const ganttRows = useMemo(() => {
        if (kindFilter === 'event') return [];
        return scopedRows.filter((row) => row.kind === 'task');
    }, [kindFilter, scopedRows]);

    const chartBounds = useMemo(() => getScheduleBounds(scopedRows), [scopedRows]);
    const chartScale = useMemo(() => pickAutoScale(scopedRows), [scopedRows]);
    const chartTicks = useMemo(() => buildTickItems(chartBounds, chartScale), [chartBounds, chartScale]);
    const chartWeekendBands = useMemo(() => (
        schedule.weekend_mode === WEEKEND_MODES.exclude
            ? weekendBands(chartBounds)
            : []
    ), [chartBounds, schedule.weekend_mode]);
    const todayLinePos = useMemo(() => getTodayLinePosition(chartBounds, today), [chartBounds, today]);

    useEffect(() => {
        const chartEl = milestoneChartAreaRef.current;
        if (!chartEl) return undefined;

        const updateWidth = () => {
            const nextWidth = Math.max(MILESTONE_CHART_MIN_WIDTH_PX, Math.floor(chartEl.clientWidth || 0));
            setMilestoneChartWidth((prev) => (prev === nextWidth ? prev : nextWidth));
        };

        updateWidth();

        if (typeof ResizeObserver === 'function') {
            const observer = new ResizeObserver(() => updateWidth());
            observer.observe(chartEl);
            return () => observer.disconnect();
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', updateWidth);
            return () => window.removeEventListener('resize', updateWidth);
        }

        return undefined;
    }, [chartBounds]);

    const stageSummaries = useMemo(() => {
        if (!chartBounds) return [];

        return STAGE_ORDER.map((stage) => {
            const tasks = scopedRows.filter((row) => (
                row.stage === stage
                && row.kind === 'task'
                && parseYmd(row.start_date)
                && parseYmd(row.end_date)
            ));

            let startDate = '';
            let endDate = '';
            tasks.forEach((row) => {
                if (!startDate || (row.start_date && row.start_date < startDate)) {
                    startDate = row.start_date || startDate;
                }
                if (!endDate || (row.end_date && row.end_date > endDate)) {
                    endDate = row.end_date || endDate;
                }
            });

            const position = startDate && endDate
                ? ganttPosition({ kind: 'task', start_date: startDate, end_date: endDate }, chartBounds)
                : null;

            const eventRows = scopedRows
                .filter((row) => row.stage === stage && row.kind === 'event' && parseYmd(row.start_date))
                .sort((a, b) => {
                    if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
                    return a.name.localeCompare(b.name, 'ko-KR');
                });
            const events = layoutMilestoneEvents(eventRows, chartBounds, milestoneChartWidth);
            const topLaneCount = events.reduce((maxLane, event) => (
                event.placement === 'top'
                    ? Math.max(maxLane, event.lane + 1)
                    : maxLane
            ), 0);
            const bottomLaneCount = events.reduce((maxLane, event) => (
                event.placement === 'bottom'
                    ? Math.max(maxLane, event.lane + 1)
                    : maxLane
            ), 0);

            return {
                stage,
                label: STAGE_LABELS[stage] || stage,
                start_date: startDate,
                end_date: endDate,
                position,
                task_count: tasks.length,
                events,
                top_lane_count: topLaneCount,
                bottom_lane_count: bottomLaneCount,
            };
        });
    }, [chartBounds, scopedRows, milestoneChartWidth]);

    const resetFilters = () => {
        setSearchText('');
        setStageFilter('all');
        setKindFilter('all');
        setStatusFilter('all');
    };

    const syncHorizontalScroll = (source) => {
        if (isSyncingScrollRef.current) return;

        const milestoneEl = milestoneScrollRef.current;
        const ganttEl = ganttScrollRef.current;
        if (!milestoneEl || !ganttEl) return;

        isSyncingScrollRef.current = true;
        if (source === 'milestone') {
            ganttEl.scrollLeft = milestoneEl.scrollLeft;
        } else {
            milestoneEl.scrollLeft = ganttEl.scrollLeft;
        }

        const release = () => {
            isSyncingScrollRef.current = false;
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(release);
        } else {
            setTimeout(release, 0);
        }
    };

    const handleMilestoneScroll = () => syncHorizontalScroll('milestone');
    const handleGanttScroll = () => syncHorizontalScroll('gantt');

    const showMilestoneEvents = kindFilter !== 'task';
    const milestoneLaneDepth = showMilestoneEvents
        ? stageSummaries.reduce((maxDepth, summary) => (
            Math.max(maxDepth, summary.top_lane_count || 0, summary.bottom_lane_count || 0, 1)
        ), 1)
        : 1;
    const milestoneRowHeight = resolveMilestoneRowHeight(milestoneLaneDepth, showMilestoneEvents);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                일정 관리 화면을 불러오는 중입니다.
            </div>
        );
    }

    if (!project) {
        return <p className="text-sm text-slate-500">{error || '프로젝트를 찾을 수 없습니다.'}</p>;
    }

    const projectTypeKey = String(project?.project_type || '').trim().toLowerCase();
    const isAsProject = projectTypeKey === 'as';
    const parentProject = project?.parent_project || null;

    if (isAsProject) {
        return (
            <div className="space-y-5">
                <ProjectPageHeader
                    projectId={project.id}
                    projectName={project.name || '프로젝트'}
                    projectCode={project.code || ''}
                    pageLabel="일정 관리"
                    breadcrumbItems={[
                        { label: '메인 페이지', to: '/project-management' },
                        { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                        { label: '일정 관리' },
                    ]}
                    actions={parentProject?.id ? (
                        <Link to={`/project-management/projects/${parentProject.id}/schedule`}>
                            <Button type="button" size="sm" variant="outline">
                                소속 설비 일정 보기
                            </Button>
                        </Link>
                    ) : null}
                />

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-semibold">AS 프로젝트는 일정 입력이 필요하지 않습니다.</p>
                    {parentProject?.id ? (
                        <p className="mt-2 text-xs text-amber-900/80">
                            소속 설비: <Link className="font-semibold underline underline-offset-2" to={`/project-management/projects/${parentProject.id}`}>
                                {(parentProject.code || parentProject.name || `#${parentProject.id}`)}
                            </Link>
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-amber-900/80">
                            소속 설비 프로젝트가 지정되어 있지 않습니다. 프로젝트 정보에서 소속 설비를 선택해 주세요.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const scaleText = chartScale === 'day' ? '일 단위' : chartScale === 'week' ? '주 단위' : '월 단위';

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="일정 관리"
                breadcrumbItems={[
                    { label: '메인 페이지', to: '/project-management' },
                    { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                    { label: '일정 관리' },
                ]}
                actions={(
                    <Button type="button" size="sm" onClick={() => navigate(`/project-management/projects/${project.id}/schedule/write`)}>
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        일정 작성
                    </Button>
                )}
            />

            <section className="app-surface-soft space-y-3 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-800">간트 차트 상세 조회</h3>
                    <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                        <TimerReset className="mr-1 h-3.5 w-3.5" />
                        필터 초기화
                    </Button>
                </div>

                <div className="flex items-center justify-between lg:hidden">
                    <button
                        type="button"
                        onClick={() => setIsMobileFilterOpen((prev) => !prev)}
                        aria-expanded={isMobileFilterOpen}
                        className={cn(
                            MOBILE_FILTER_BUTTON_BASE_CLASS,
                            isMobileFilterOpen
                                ? MOBILE_FILTER_BUTTON_ACTIVE_CLASS
                                : MOBILE_FILTER_BUTTON_INACTIVE_CLASS,
                        )}
                    >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {isMobileFilterOpen ? '필터 닫기' : '필터'}
                    </button>
                    <span className="text-[11px] font-medium text-muted-foreground">
                        표시 {kindFilteredRows.length.toLocaleString('ko-KR')}건
                    </span>
                </div>

                <div className="hidden lg:flex lg:min-h-8 lg:items-center lg:gap-2">
                    <div className="relative w-60 shrink-0">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                        <Input
                            type="text"
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            placeholder="일정 검색"
                            className="h-8 w-full rounded-md bg-background px-2 pr-2 pl-7 text-xs"
                        />
                    </div>

                    <div className="h-5 w-px shrink-0 bg-slate-200" />

                    <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
                        <button
                            type="button"
                            onClick={() => setStageFilter('all')}
                            aria-pressed={stageFilter === 'all'}
                            className={cn(
                                FILTER_CHIP_BASE_CLASS,
                                stageFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                            )}
                        >
                            전체 단계
                        </button>
                        {STAGE_ORDER.map((stage) => {
                            const isActive = stageFilter === stage;
                            return (
                                <button
                                    key={`stage-filter-${stage}`}
                                    type="button"
                                    onClick={() => setStageFilter(stage)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        FILTER_CHIP_BASE_CLASS,
                                        isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                    )}
                                >
                                    {STAGE_LABELS[stage] || stage}
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-5 w-px shrink-0 bg-slate-200" />

                    <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
                        <button
                            type="button"
                            onClick={() => setKindFilter('all')}
                            aria-pressed={kindFilter === 'all'}
                            className={cn(
                                FILTER_CHIP_BASE_CLASS,
                                kindFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                            )}
                        >
                            전체 구분
                        </button>
                        {KIND_FILTER_OPTIONS.map((option) => {
                            const isActive = kindFilter === option.value;
                            return (
                                <button
                                    key={`kind-filter-${option.value}`}
                                    type="button"
                                    onClick={() => setKindFilter(option.value)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        FILTER_CHIP_BASE_CLASS,
                                        isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                    )}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-5 w-px shrink-0 bg-slate-200" />

                    <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            aria-pressed={statusFilter === 'all'}
                            className={cn(
                                FILTER_CHIP_BASE_CLASS,
                                statusFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                            )}
                        >
                            전체 상태
                        </button>
                        {STATUS_FILTER_OPTIONS.map((option) => {
                            const isActive = statusFilter === option.value;
                            return (
                                <button
                                    key={`status-filter-${option.value}`}
                                    type="button"
                                    onClick={() => setStatusFilter(option.value)}
                                    aria-pressed={isActive}
                                    className={cn(
                                        FILTER_CHIP_BASE_CLASS,
                                        isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                    )}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className={cn('space-y-2 lg:hidden', !isMobileFilterOpen && 'hidden')}>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                        <Input
                            type="text"
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            placeholder="일정명, 그룹, 메모, 날짜 검색"
                            className="h-8 w-full rounded-md bg-background px-2 pr-2 pl-7 text-xs"
                        />
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-slate-500">단계 필터</p>
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                            <button
                                type="button"
                                onClick={() => setStageFilter('all')}
                                aria-pressed={stageFilter === 'all'}
                                className={cn(
                                    FILTER_CHIP_BASE_CLASS,
                                    stageFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                )}
                            >
                                전체 단계
                            </button>
                            {STAGE_ORDER.map((stage) => {
                                const isActive = stageFilter === stage;
                                return (
                                    <button
                                        key={`stage-filter-mobile-${stage}`}
                                        type="button"
                                        onClick={() => setStageFilter(stage)}
                                        aria-pressed={isActive}
                                        className={cn(
                                            FILTER_CHIP_BASE_CLASS,
                                            isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                        )}
                                    >
                                        {STAGE_LABELS[stage] || stage}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-slate-500">구분 필터</p>
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                            <button
                                type="button"
                                onClick={() => setKindFilter('all')}
                                aria-pressed={kindFilter === 'all'}
                                className={cn(
                                    FILTER_CHIP_BASE_CLASS,
                                    kindFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                )}
                            >
                                전체 구분
                            </button>
                            {KIND_FILTER_OPTIONS.map((option) => {
                                const isActive = kindFilter === option.value;
                                return (
                                    <button
                                        key={`kind-filter-mobile-${option.value}`}
                                        type="button"
                                        onClick={() => setKindFilter(option.value)}
                                        aria-pressed={isActive}
                                        className={cn(
                                            FILTER_CHIP_BASE_CLASS,
                                            isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-slate-500">상태 필터</p>
                        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('all')}
                                aria-pressed={statusFilter === 'all'}
                                className={cn(
                                    FILTER_CHIP_BASE_CLASS,
                                    statusFilter === 'all' ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                )}
                            >
                                전체 상태
                            </button>
                            {STATUS_FILTER_OPTIONS.map((option) => {
                                const isActive = statusFilter === option.value;
                                return (
                                    <button
                                        key={`status-filter-mobile-${option.value}`}
                                        type="button"
                                        onClick={() => setStatusFilter(option.value)}
                                        aria-pressed={isActive}
                                        className={cn(
                                            FILTER_CHIP_BASE_CLASS,
                                            isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {chartBounds && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80">
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                            <p className="text-[11px] font-bold text-slate-700">마일스톤 요약</p>
                            <p className="text-[11px] text-slate-500">
                                일정 {stageSummaries.reduce((sum, item) => sum + item.task_count, 0).toLocaleString('ko-KR')}건
                                {' · '}
                                이벤트 {stageSummaries.reduce((sum, item) => sum + item.events.length, 0).toLocaleString('ko-KR')}건
                            </p>
                        </div>

                        <div className="border-t border-slate-200">
                            <div
                                ref={milestoneScrollRef}
                                onScroll={handleMilestoneScroll}
                                className="overflow-x-auto"
                            >
                                <div className="min-w-[1060px]">
                                    <div className="grid grid-cols-[460px_1fr]">
                                        <div className="divide-y divide-slate-200 border-r border-slate-200 bg-white/40 pt-3">
                                            {stageSummaries.map((summary) => (
                                                <div
                                                    key={`milestone-stage-label-${summary.stage}`}
                                                    className="flex items-center justify-between gap-3 px-3"
                                                    style={{ height: `${milestoneRowHeight}px` }}
                                                >
                                                    <span className="text-xs font-bold text-slate-800">{summary.label}</span>
                                                    <div className="text-right font-mono text-[11px] text-slate-600">
                                                        {formatRangeLabel(summary.start_date, summary.end_date)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div ref={milestoneChartAreaRef} className="relative overflow-visible bg-white">
                                            <div className="pointer-events-none absolute inset-0 z-0">
                                                {chartTicks.map((tick) => (
                                                    <div
                                                        key={`milestone-tick-${tick.key}`}
                                                        className="absolute inset-y-0 border-l border-slate-200/90"
                                                        style={{ left: `${tick.left}%` }}
                                                    />
                                                ))}
                                            </div>

                                            {todayLinePos !== null && (
                                                <div
                                                    className="pointer-events-none absolute inset-y-0 z-30 border-l-2 border-rose-500/80"
                                                    style={{ left: `${todayLinePos}%` }}
                                                />
                                            )}

                                            <div className="relative z-10 divide-y divide-slate-200 pt-3">
                                                {stageSummaries.map((summary) => {
                                                    const stageStyle = STAGE_STYLES[summary.stage] || STAGE_STYLES.design;
                                                    const barLeft = summary.position?.left ?? 0;
                                                    const barWidth = summary.position ? Math.max(summary.position.width, 0.6) : 0;
                                                    const rowHeight = milestoneRowHeight;

                                                    return (
                                                        <div
                                                            key={`milestone-stage-row-${summary.stage}`}
                                                            className="relative overflow-visible px-2"
                                                            style={{ height: `${rowHeight}px` }}
                                                        >
                                                            <div className={cn('absolute inset-x-2 top-1/2 h-3.5 -translate-y-1/2 rounded-md border border-slate-200/70', stageStyle.rail)}>
                                                                {summary.position ? (
                                                                    <span
                                                                        className={cn('absolute inset-y-0 rounded-md shadow-sm', stageStyle.bar)}
                                                                        style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
                                                                    />
                                                                ) : null}

                                                                {showMilestoneEvents && summary.events.map((event) => {
                                                                    const laneOffsetPx = event.lane * MILESTONE_EVENT_LANE_HEIGHT_PX;
                                                                    const isTop = event.placement !== 'bottom';
                                                                    return (
                                                                        <React.Fragment key={`milestone-event-${summary.stage}-${event.id}`}>
                                                                            <div
                                                                                className="absolute top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"
                                                                                style={{ left: `${event.position}%` }}
                                                                            >
                                                                                <span
                                                                                    className={cn(
                                                                                        'block h-3 w-3 rounded-full ring-2 ring-white shadow',
                                                                                        stageStyle.bar,
                                                                                    )}
                                                                                />
                                                                            </div>
                                                                            <div
                                                                                className={cn(
                                                                                    'absolute z-50',
                                                                                    isTop ? 'bottom-full pb-1' : 'top-full pt-1',
                                                                                )}
                                                                                style={{
                                                                                    left: `${event.position}%`,
                                                                                    transform: isTop
                                                                                        ? `translate(-50%, -${laneOffsetPx}px)`
                                                                                        : `translate(-50%, ${laneOffsetPx}px)`,
                                                                                }}
                                                                            >
                                                                                <span
                                                                                    className={cn(
                                                                                        'inline-flex w-auto items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold shadow-sm',
                                                                                        stageStyle.badge,
                                                                                    )}
                                                                                    title={event.name}
                                                                                >
                                                                                    <span className="mr-1 shrink-0 rounded bg-white/60 px-1 py-px font-mono text-[10px] text-slate-700">
                                                                                        {formatDateLabel(event.date)}
                                                                                    </span>
                                                                                    <span className="whitespace-nowrap">{event.name}</span>
                                                                                </span>
                                                                            </div>
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">표시 단위: {scaleText}</span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 오늘 기준선
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="inline-flex items-center -space-x-1">
                            <span className={cn('h-2.5 w-2.5 rounded-full ring-1 ring-white', STAGE_STYLES.design.bar)} />
                            <span className={cn('h-2.5 w-2.5 rounded-full ring-1 ring-white', STAGE_STYLES.fabrication.bar)} />
                            <span className={cn('h-2.5 w-2.5 rounded-full ring-1 ring-white', STAGE_STYLES.installation.bar)} />
                        </span>
                        이벤트 포인트
                    </span>
                </div>

                {!chartBounds && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                        조건에 맞는 일정이 없어 간트 차트를 표시할 수 없습니다.
                    </div>
                )}

                {chartBounds && (
                    <div
                        ref={ganttScrollRef}
                        onScroll={handleGanttScroll}
                        className="overflow-x-auto rounded-lg border border-slate-200"
                    >
                        <div className="min-w-[1060px]">
                            <div className="grid grid-cols-[460px_1fr] border-b border-slate-200 bg-slate-50">
                                <div className="px-2 py-1.5 text-[11px] font-bold text-slate-700">그룹 · 일정 명칭 · 날짜</div>
                                <div className="relative h-10 overflow-hidden">
                                    {chartTicks.map((tick) => (
                                        <div
                                            key={tick.key}
                                            className="absolute inset-y-0 border-l border-slate-300/80"
                                            style={{ left: `${tick.left}%` }}
                                        >
                                            <span className="absolute left-1 top-0.5 text-[10px] font-semibold text-slate-500">{tick.label}</span>
                                        </div>
                                    ))}
                                    {todayLinePos !== null && (
                                        <div
                                            className="absolute inset-y-0 border-l-2 border-rose-500"
                                            style={{ left: `${todayLinePos}%` }}
                                        >
                                            <span className="absolute -left-3 top-4 rounded bg-rose-500 px-1 text-[9px] font-bold text-white">TODAY</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {ganttRows.length === 0 ? (
                                <div className="px-4 py-10 text-center text-xs text-slate-500">
                                    표시할 일정이 없습니다. 이벤트는 상단 마일스톤 패널에서 확인할 수 있습니다.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-200">
                                    {ganttRows.map((row) => {
                                    const stageStyle = STAGE_STYLES[row.stage] || STAGE_STYLES.design;
                                    const position = ganttPosition(row, chartBounds);

                                    return (
                                        <div key={`gantt-row-${row.id}`} className={cn('grid grid-cols-[460px_1fr] border-l-4', stageStyle.rowBorder)}>
                                            <div className="px-2 py-0.5">
                                                <div className="flex h-7 min-w-0 items-center gap-1.5 text-[10px]">
                                                    <span className={cn('inline-flex h-4 shrink-0 items-center rounded border px-1 text-[9px] font-bold', stageStyle.badge)}>
                                                        {STAGE_LABELS[row.stage] || '-'}
                                                    </span>
                                                    <span
                                                        className="max-w-[150px] truncate text-slate-500"
                                                        title={row.group_path || '-'}
                                                    >
                                                        {row.group_path || '-'}
                                                    </span>
                                                    <span className="shrink-0 text-slate-300">|</span>
                                                    <span
                                                        className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-900"
                                                        title={row.name || ''}
                                                    >
                                                        {row.name || '-'}
                                                    </span>
                                                    <span className="shrink-0 text-slate-300">|</span>
                                                    <span className="shrink-0 font-mono text-[11px] text-slate-600">
                                                        {formatRangeLabel(row.start_date, row.end_date)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="px-2 py-0.5">
                                                <div className={cn('relative h-5 overflow-hidden rounded-md', stageStyle.rail)}>
                                                    {chartWeekendBands.map((band) => (
                                                        <div
                                                            key={`weekend-${row.id}-${band.key}`}
                                                            className="pointer-events-none absolute inset-y-0 bg-slate-300/35"
                                                            style={{ left: `${band.left}%`, width: `${band.width}%` }}
                                                        />
                                                    ))}

                                                    {todayLinePos !== null && (
                                                        <div
                                                            className="pointer-events-none absolute inset-y-0 border-l-2 border-rose-500/80"
                                                            style={{ left: `${todayLinePos}%` }}
                                                        />
                                                    )}

                                                    {row.kind === 'event' ? (
                                                        <span
                                                            className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-white shadow', stageStyle.bar)}
                                                            style={{ left: `calc(${position.left}% - 5px)` }}
                                                        />
                                                    ) : (
                                                        <span
                                                            className={cn('absolute top-1/2 h-2 -translate-y-1/2 rounded-full shadow-sm', stageStyle.bar)}
                                                            style={{
                                                                left: `${position.left}%`,
                                                                width: `${Math.max(position.width, 0.6)}%`,
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}
        </div>
    );
}
