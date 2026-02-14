import React, { useEffect, useMemo, useState } from 'react';
import {
    Loader2,
    PencilLine,
    Search,
    TimerReset,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
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

function formatDateLabel(value) {
    const text = String(value || '').trim();
    if (!text || text.length < 10) return '-';
    return `${text.slice(0, 4)}.${text.slice(5, 7)}.${text.slice(8, 10)}`;
}

function formatMonthDay(value) {
    const text = String(value || '').trim();
    if (!text || text.length < 10) return '-';
    return `${text.slice(5, 7)}/${text.slice(8, 10)}`;
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

export default function BudgetProjectScheduleManagement() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [schedule, setSchedule] = useState(() => normalizeSchedulePayload(null));

    const [searchText, setSearchText] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [kindFilter, setKindFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

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

    const filteredRows = useMemo(() => {
        const keyword = searchText.trim().toLowerCase();

        return rawRows
            .filter((row) => {
                if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
                if (kindFilter !== 'all' && row.kind !== kindFilter) return false;
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
    }, [kindFilter, rawRows, searchText, stageFilter, statusFilter]);

    const chartBounds = useMemo(() => getScheduleBounds(filteredRows), [filteredRows]);
    const chartScale = useMemo(() => pickAutoScale(filteredRows), [filteredRows]);
    const chartTicks = useMemo(() => buildTickItems(chartBounds, chartScale), [chartBounds, chartScale]);
    const chartWeekendBands = useMemo(() => (
        schedule.weekend_mode === WEEKEND_MODES.exclude
            ? weekendBands(chartBounds)
            : []
    ), [chartBounds, schedule.weekend_mode]);
    const todayLinePos = useMemo(() => getTodayLinePosition(chartBounds, today), [chartBounds, today]);
    const milestoneData = useMemo(() => {
        if (!chartBounds) {
            return { total: 0, items: [] };
        }

        const sortedEvents = filteredRows
            .filter((row) => row.kind === 'event' && parseYmd(row.start_date))
            .sort((a, b) => {
                if (a.start_date !== b.start_date) return a.start_date.localeCompare(b.start_date);
                const stageDiff = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
                if (stageDiff !== 0) return stageDiff;
                return a.name.localeCompare(b.name, 'ko-KR');
            });

        const items = sortedEvents.slice(0, 20).map((row, index) => {
            const position = getDatePositionPercent(chartBounds, row.start_date);
            const safePosition = Math.max(1, Math.min(99, Number(position ?? 0)));
            const align = safePosition <= 14
                ? 'left'
                : safePosition >= 86
                    ? 'right'
                    : 'center';
            return {
                id: row.id,
                name: row.name || '이벤트',
                stage: row.stage,
                date: row.start_date,
                lane: index % 2,
                align,
                position: safePosition,
            };
        });

        return {
            total: sortedEvents.length,
            items,
        };
    }, [chartBounds, filteredRows]);

    const resetFilters = () => {
        setSearchText('');
        setStageFilter('all');
        setKindFilter('all');
        setStatusFilter('all');
    };

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

    const scaleText = chartScale === 'day' ? '일 단위' : chartScale === 'week' ? '주 단위' : '월 단위';

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="일정 관리"
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
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

            <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-800">간트 차트 상세 조회</h3>
                    <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                        <TimerReset className="mr-1 h-3.5 w-3.5" />
                        필터 초기화
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                    <label className="xl:col-span-2">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">검색</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                placeholder="일정명, 그룹, 메모, 날짜 검색"
                                className="pl-9"
                            />
                        </div>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold text-slate-500">단계</span>
                        <select
                            value={stageFilter}
                            onChange={(event) => setStageFilter(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                            <option value="all">전체</option>
                            {STAGE_ORDER.map((stage) => (
                                <option key={`stage-filter-${stage}`} value={stage}>{STAGE_LABELS[stage]}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold text-slate-500">구분</span>
                        <select
                            value={kindFilter}
                            onChange={(event) => setKindFilter(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                            <option value="all">전체</option>
                            <option value="task">일정</option>
                            <option value="event">이벤트</option>
                        </select>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold text-slate-500">상태</span>
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                        >
                            <option value="all">전체</option>
                            <option value="upcoming">예정</option>
                            <option value="in_progress">진행 중</option>
                            <option value="completed">완료</option>
                        </select>
                    </label>
                </div>

                {chartBounds && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-700">주요 이벤트 마일스톤</p>
                            <p className="text-[11px] text-slate-500">
                                현재 필터 기준 {milestoneData.total.toLocaleString('ko-KR')}건
                                {milestoneData.total > milestoneData.items.length ? ` (상위 ${milestoneData.items.length}건 표시)` : ''}
                            </p>
                        </div>

                        {milestoneData.items.length === 0 ? (
                            <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
                                이벤트 유형 일정이 없어 마일스톤을 표시할 수 없습니다.
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                <div className="relative h-28 w-full overflow-hidden">
                                    <div className="absolute inset-x-0 top-20 border-t border-slate-300" />

                                    {chartTicks.map((tick) => (
                                        <div
                                            key={`milestone-tick-${tick.key}`}
                                            className="absolute inset-y-0 border-l border-slate-200/90"
                                            style={{ left: `${tick.left}%` }}
                                        />
                                    ))}

                                    {todayLinePos !== null && (
                                        <div
                                            className="absolute inset-y-0 border-l-2 border-rose-500/80"
                                            style={{ left: `${todayLinePos}%` }}
                                        />
                                    )}

                                    {milestoneData.items.map((milestone) => {
                                        const stageStyle = STAGE_STYLES[milestone.stage] || STAGE_STYLES.design;
                                        const topOffset = 10 + (milestone.lane * 26);
                                        const alignClass = milestone.align === 'left'
                                            ? ''
                                            : milestone.align === 'right'
                                                ? '-translate-x-full'
                                                : '-translate-x-1/2';
                                        return (
                                            <div
                                                key={`milestone-${milestone.id}`}
                                                className="absolute"
                                                style={{ left: `${milestone.position}%`, top: `${topOffset}px` }}
                                            >
                                                <div className={cn('relative', alignClass)}>
                                                    <span
                                                        className={cn(
                                                            'inline-flex max-w-[170px] items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold shadow-sm',
                                                            stageStyle.badge,
                                                        )}
                                                        title={milestone.name}
                                                    >
                                                        <span className="mr-1 shrink-0 rounded bg-white/60 px-1 py-px text-[9px] text-slate-600">
                                                            {formatMonthDay(milestone.date)}
                                                        </span>
                                                        <span className="truncate">{milestone.name}</span>
                                                    </span>
                                                    <span className={cn('absolute left-1/2 top-full h-3 w-px -translate-x-1/2', stageStyle.bar)} />
                                                    <span className={cn('absolute left-1/2 top-[calc(100%+12px)] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white shadow', stageStyle.bar)} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">표시 단위: {scaleText}</span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 오늘 기준선
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> 이벤트 포인트
                    </span>
                </div>

                {!chartBounds && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                        조건에 맞는 일정이 없어 간트 차트를 표시할 수 없습니다.
                    </div>
                )}

                {chartBounds && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                                            <span className="absolute left-1 top-0.5 text-[9px] font-semibold text-slate-500">{tick.label}</span>
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

                            <div className="divide-y divide-slate-200">
                                {filteredRows.map((row) => {
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
                                                    <span className="shrink-0 font-mono text-[10px] text-slate-600">
                                                        {formatDateLabel(row.start_date)}~{formatDateLabel(row.end_date)}
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
