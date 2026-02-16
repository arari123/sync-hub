import { useEffect, useMemo, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MessageCircle,
    PanelLeftClose,
    PanelLeftOpen,
    Paperclip,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../../lib/api';
import {
    loadAgendaEntrySeenBaselines,
    markAgendaEntrySeen,
    saveAgendaEntrySeenBaselines,
} from '../../lib/agendaSeen';
import { downloadFromApi } from '../../lib/download';
import { cn } from '../../lib/utils';

const PER_PAGE = 10;
const PAGE_GROUP_SIZE = 10;

const FILTER_CHIP_BASE_CLASS =
    'inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const FILTER_CHIP_ACTIVE_CLASS = 'border-primary bg-primary text-primary-foreground shadow-sm';
const FILTER_CHIP_INACTIVE_CLASS =
    'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground';

function entryKindLabel(value) {
    const kind = String(value || '').toLowerCase();
    if (kind === 'root') return '최초등록';
    if (kind === 'additional_work') return '추가작업';
    return '답변';
}

function entryToneClass(value) {
    const kind = String(value || '').toLowerCase();
    if (kind === 'root') return 'border-slate-200 bg-slate-50 text-slate-700';
    if (kind === 'additional_work') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-cyan-200 bg-cyan-50 text-cyan-700';
}

function isUnreadByBaselines(baselines, entryId, updatedAt) {
    const key = String(Number(entryId || 0));
    if (!key || key === '0') return false;
    const nextUpdatedAt = String(updatedAt || '').trim();
    if (!nextUpdatedAt) return false;
    const raw = baselines?.[key];
    const seenUpdatedAt = typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && typeof raw.last_seen_updated_at === 'string'
            ? raw.last_seen_updated_at
            : '';
    if (!seenUpdatedAt) return true;
    return nextUpdatedAt > seenUpdatedAt;
}

function collectThreadEntries(detail) {
    const result = [];
    const pushIfValid = (entry) => {
        if (!entry || !entry.id) return;
        result.push(entry);
    };

    pushIfValid(detail?.root_entry);
    const middleEntries = Array.isArray(detail?.middle_entries) ? detail.middle_entries : [];
    middleEntries.forEach(pushIfValid);
    pushIfValid(detail?.latest_entry);

    const dedup = new Map();
    result.forEach((entry) => {
        const key = Number(entry.id || 0);
        if (!key) return;
        dedup.set(key, entry);
    });
    return Array.from(dedup.values());
}

function ListItem({ item, isSelected, isUnread, showProjectMeta, onClick }) {
    const projectName = String(item?.project_name || '').trim();
    const projectCode = String(item?.project_code || '').trim();
    const projectLabel = projectName || projectCode
        ? `${projectName || '프로젝트'}${projectCode ? ` · ${projectCode}` : ''}`
        : '';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                isSelected
                    ? 'border-cyan-300 bg-cyan-50/70'
                    : isUnread
                        ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
            )}
        >
            <div className="mb-1 flex items-center gap-1.5">
                <span className={cn('inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-bold', entryToneClass(item?.entry_kind))}>
                    {entryKindLabel(item?.entry_kind)}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">{item?.agenda_code}</span>
                {isUnread && (
                    <span className="ml-auto inline-flex h-5 items-center rounded-full border border-amber-200 bg-amber-100 px-2 text-[10px] font-bold text-amber-700">
                        미조회
                    </span>
                )}
            </div>

            <p className={cn('line-clamp-2 text-sm', isUnread ? 'font-black text-slate-900' : 'font-semibold text-slate-800')}>
                {item?.title || '-'}
            </p>

            {showProjectMeta && projectLabel && (
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                    {projectLabel}
                </p>
            )}

            <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                {item?.summary_plain || '본문 요약이 없습니다.'}
            </p>

            <p className="mt-1 text-[10px] text-slate-400">
                {item?.author_name || '-'} · {String(item?.updated_at || '').slice(0, 16).replace('T', ' ')}
            </p>
        </button>
    );
}

function EntryBodyPanel({ entry, label, tone = 'slate' }) {
    if (!entry) return null;
    const toneClass = tone === 'cyan'
        ? 'border-cyan-200 bg-cyan-50/30'
        : tone === 'amber'
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-slate-200 bg-white';

    return (
        <article className={cn('rounded-xl border p-4 shadow-sm', toneClass)}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                {label && (
                    <span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600">
                        {label}
                    </span>
                )}
                <span className="text-[11px] text-slate-500">{entry.created_at?.slice(0, 16).replace('T', ' ')}</span>
            </div>

            <h3 className="text-lg font-bold text-slate-900">{entry.title}</h3>

            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                <p><span className="font-semibold text-slate-500">작성자</span> {entry.author_name || '-'}</p>
                <p><span className="font-semibold text-slate-500">요청자</span> {entry.requester_name || '-'}{entry.requester_org ? ` (${entry.requester_org})` : ''}</p>
                <p><span className="font-semibold text-slate-500">답변자</span> {entry.responder_name || '-'}{entry.responder_org ? ` (${entry.responder_org})` : ''}</p>
                <p><span className="font-semibold text-slate-500">첨부</span> {entry.attachment_count || 0}건</p>
            </div>

            <div className="prose mt-4 max-w-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
                {entry.content_html
                    ? <div dangerouslySetInnerHTML={{ __html: entry.content_html }} />
                    : <p>{entry.content_plain || '-'}</p>}
            </div>

            {(entry.attachments || []).length > 0 && (
                <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                        <Paperclip className="h-3.5 w-3.5" /> 첨부 파일
                    </p>
                    {(entry.attachments || []).map((attachment) => (
                        <button
                            key={`att-${attachment.id}`}
                            type="button"
                            onClick={() => downloadFromApi(attachment.download_url, attachment.original_filename)}
                            className="block truncate text-xs text-slate-700 underline-offset-2 hover:underline"
                        >
                            {attachment.original_filename}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
}

export default function AgendaSplitView({
    mode = 'project',
    projectId = '',
    showProjectMeta = false,
    className = '',
}) {
    const navigate = useNavigate();
    const isMyMode = mode === 'my';
    const normalizedProjectId = Number(projectId || 0);

    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [progressStatus, setProgressStatus] = useState('all');
    const [threadKind, setThreadKind] = useState('all');
    const [includeDrafts, setIncludeDrafts] = useState(isMyMode);
    const [isListLoading, setIsListLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [isListCollapsed, setIsListCollapsed] = useState(false);

    const [selectedThreadId, setSelectedThreadId] = useState(0);
    const [selectedEntryId, setSelectedEntryId] = useState(0);
    const [selectedProjectId, setSelectedProjectId] = useState(0);

    const [detail, setDetail] = useState(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');

    const [entrySeenBaselines, setEntrySeenBaselines] = useState(() => loadAgendaEntrySeenBaselines());

    const listApiPath = isMyMode
        ? '/agenda/entries/my'
        : normalizedProjectId > 0
            ? `/agenda/projects/${normalizedProjectId}/entries`
            : '';

    useEffect(() => {
        if (!listApiPath) return undefined;
        const controller = new AbortController();
        let active = true;

        const fetchList = async () => {
            setIsListLoading(true);
            setListError('');
            try {
                const response = await api.get(listApiPath, {
                    params: {
                        progress_status: progressStatus,
                        thread_kind: threadKind,
                        include_drafts: includeDrafts,
                        page,
                        per_page: PER_PAGE,
                    },
                    signal: controller.signal,
                });
                const payload = response?.data || {};
                if (!active) return;
                const nextItems = Array.isArray(payload.items) ? payload.items : [];
                setItems(nextItems);
                setTotal(Number(payload.total || 0));
                setTotalPages(Number(payload.total_pages || 0));
            } catch (error) {
                if (!active || error?.code === 'ERR_CANCELED') return;
                setItems([]);
                setTotal(0);
                setTotalPages(0);
                setListError(getErrorMessage(error, '안건 목록을 불러오지 못했습니다.'));
            } finally {
                if (!active) return;
                setIsListLoading(false);
            }
        };

        fetchList();
        return () => {
            active = false;
            controller.abort();
        };
    }, [includeDrafts, listApiPath, page, progressStatus, threadKind]);

    useEffect(() => {
        if (items.length <= 0) {
            setSelectedThreadId(0);
            setSelectedEntryId(0);
            setSelectedProjectId(0);
            setDetail(null);
            return;
        }
        const exists = items.some((item) => Number(item.entry_id || 0) === Number(selectedEntryId || 0));
        if (exists) return;

        const first = items[0];
        setSelectedThreadId(Number(first.thread_id || 0));
        setSelectedEntryId(Number(first.entry_id || 0));
        setSelectedProjectId(Number(first.project_id || 0));
    }, [items, selectedEntryId]);

    useEffect(() => {
        if (!selectedThreadId) return undefined;
        const controller = new AbortController();
        let active = true;

        const fetchDetail = async () => {
            setIsDetailLoading(true);
            setDetailError('');
            try {
                const response = await api.get(`/agenda/threads/${selectedThreadId}`, { signal: controller.signal });
                if (!active) return;
                setDetail(response?.data || null);
            } catch (error) {
                if (!active || error?.code === 'ERR_CANCELED') return;
                setDetail(null);
                setDetailError(getErrorMessage(error, '안건 상세를 불러오지 못했습니다.'));
            } finally {
                if (!active) return;
                setIsDetailLoading(false);
            }
        };

        fetchDetail();
        return () => {
            active = false;
            controller.abort();
        };
    }, [selectedThreadId]);

    const selectItem = (item) => {
        const nextThreadId = Number(item?.thread_id || 0);
        const nextEntryId = Number(item?.entry_id || 0);
        const nextProjectId = Number(item?.project_id || 0);
        setSelectedThreadId(nextThreadId);
        setSelectedEntryId(nextEntryId);
        setSelectedProjectId(nextProjectId);

        const updatedAt = String(item?.updated_at || '').trim();
        markAgendaEntrySeen(nextEntryId, updatedAt);
        setEntrySeenBaselines((prev) => {
            const key = String(nextEntryId);
            const prevValue = prev?.[key];
            const prevUpdatedAt = typeof prevValue === 'string'
                ? prevValue
                : prevValue && typeof prevValue === 'object' && typeof prevValue.last_seen_updated_at === 'string'
                    ? prevValue.last_seen_updated_at
                    : '';
            if (!updatedAt || (prevUpdatedAt && prevUpdatedAt >= updatedAt)) return prev;
            const next = { ...(prev || {}), [key]: updatedAt };
            saveAgendaEntrySeenBaselines(next);
            return next;
        });
    };

    const selectedEntry = useMemo(() => {
        const entries = collectThreadEntries(detail);
        const match = entries.find((entry) => Number(entry.id || 0) === Number(selectedEntryId || 0));
        if (match) return match;
        return entries[0] || null;
    }, [detail, selectedEntryId]);

    const rootEntry = detail?.root_entry || null;
    const selectedIsRoot = selectedEntry && rootEntry
        ? Number(selectedEntry.id || 0) === Number(rootEntry.id || 0)
        : false;

    const safePage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
    const pageGroupStart = Math.floor((safePage - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1;
    const pageGroupEnd = Math.min(Math.max(totalPages, 1), pageGroupStart + PAGE_GROUP_SIZE - 1);
    const pageNumbers = Array.from(
        { length: Math.max(0, pageGroupEnd - pageGroupStart + 1) },
        (_, index) => pageGroupStart + index,
    );

    const openFullDetail = () => {
        const targetProjectId = Number(selectedProjectId || selectedEntry?.project_id || 0);
        const targetThreadId = Number(selectedThreadId || 0);
        if (!targetProjectId || !targetThreadId) return;
        const recordStatus = String(detail?.thread?.record_status || '').trim();
        if (recordStatus === 'draft') {
            navigate(`/project-management/projects/${targetProjectId}/agenda/new?draft=${targetThreadId}`);
            return;
        }
        navigate(`/project-management/projects/${targetProjectId}/agenda/${targetThreadId}`);
    };

    return (
        <div className={cn('space-y-3', className)}>
            <div className={cn(
                'grid gap-3',
                isListCollapsed
                    ? 'grid-cols-[52px_minmax(0,1fr)]'
                    : 'grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)]',
            )}
            >
                <section className="min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className={cn('border-b border-slate-200 p-2', isListCollapsed && 'flex h-full items-start justify-center border-b-0')}>
                        <button
                            type="button"
                            onClick={() => setIsListCollapsed((prev) => !prev)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {isListCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            {!isListCollapsed && '리스트 접기'}
                        </button>
                    </div>

                    {!isListCollapsed && (
                        <>
                            <div className="space-y-2 border-b border-slate-200 p-2">
                                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                                    {[
                                        { value: 'all', label: '상태 전체' },
                                        { value: 'in_progress', label: '진행 중' },
                                        { value: 'completed', label: '완료' },
                                    ].map((item) => {
                                        const isActive = progressStatus === item.value;
                                        return (
                                            <button
                                                key={`split-progress-${item.value}`}
                                                type="button"
                                                onClick={() => {
                                                    setProgressStatus(item.value);
                                                    setPage(1);
                                                }}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    FILTER_CHIP_BASE_CLASS,
                                                    isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                                    {[
                                        { value: 'all', label: '유형 전체' },
                                        { value: 'general', label: '일반 안건' },
                                        { value: 'work_report', label: '작업보고서' },
                                    ].map((item) => {
                                        const isActive = threadKind === item.value;
                                        return (
                                            <button
                                                key={`split-kind-${item.value}`}
                                                type="button"
                                                onClick={() => {
                                                    setThreadKind(item.value);
                                                    setPage(1);
                                                }}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    FILTER_CHIP_BASE_CLASS,
                                                    isActive ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                                )}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIncludeDrafts((prev) => !prev);
                                        setPage(1);
                                    }}
                                    aria-pressed={includeDrafts}
                                    className={cn(
                                        FILTER_CHIP_BASE_CLASS,
                                        includeDrafts ? FILTER_CHIP_ACTIVE_CLASS : FILTER_CHIP_INACTIVE_CLASS,
                                    )}
                                >
                                    임시 저장 포함
                                </button>
                            </div>

                            <div className="max-h-[calc(100vh-18rem)] space-y-2 overflow-auto p-2">
                                {isListLoading ? (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                                        목록을 불러오는 중...
                                    </div>
                                ) : listError ? (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
                                        {listError}
                                    </div>
                                ) : items.length <= 0 ? (
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-500">
                                        표시할 안건이 없습니다.
                                    </div>
                                ) : (
                                    items.map((item) => {
                                        const entryId = Number(item?.entry_id || 0);
                                        const isSelected = entryId > 0 && entryId === Number(selectedEntryId || 0);
                                        const isUnread = isUnreadByBaselines(entrySeenBaselines, entryId, item?.updated_at);
                                        return (
                                            <ListItem
                                                key={`entry-item-${item.entry_id}`}
                                                item={item}
                                                isSelected={isSelected}
                                                isUnread={isUnread}
                                                showProjectMeta={showProjectMeta}
                                                onClick={() => selectItem(item)}
                                            />
                                        );
                                    })
                                )}
                            </div>

                            <div className="border-t border-slate-200 p-2">
                                <div className="mb-2 text-[11px] font-semibold text-slate-500">
                                    안건 {total > 0 ? (safePage - 1) * PER_PAGE + 1 : 0}-{Math.min(safePage * PER_PAGE, total)} / 총 {total.toLocaleString('ko-KR')}건
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex flex-wrap items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setPage(1)}
                                            disabled={safePage <= 1}
                                            className={cn(
                                                'inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold',
                                                safePage <= 1
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                                            )}
                                        >
                                            <ChevronsLeft className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                            disabled={safePage <= 1}
                                            className={cn(
                                                'inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold',
                                                safePage <= 1
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                                            )}
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </button>
                                        {pageNumbers.map((pageNo) => (
                                            <button
                                                key={`split-page-${pageNo}`}
                                                type="button"
                                                onClick={() => setPage(pageNo)}
                                                className={cn(
                                                    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold',
                                                    pageNo === safePage
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                                                )}
                                            >
                                                {pageNo}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={safePage >= totalPages}
                                            className={cn(
                                                'inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold',
                                                safePage >= totalPages
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                                            )}
                                        >
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPage(totalPages)}
                                            disabled={safePage >= totalPages}
                                            className={cn(
                                                'inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold',
                                                safePage >= totalPages
                                                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                                            )}
                                        >
                                            <ChevronsRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>

                <section className="min-h-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    {isDetailLoading ? (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-12 text-center text-sm text-slate-500">
                            상세를 불러오는 중...
                        </div>
                    ) : detailError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
                            {detailError}
                        </div>
                    ) : !detail?.thread || !selectedEntry ? (
                        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-12 text-center text-sm text-slate-500">
                            왼쪽 리스트에서 안건을 선택하세요.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={cn(
                                        'inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold',
                                        detail.thread.progress_status === 'in_progress'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 bg-slate-100 text-slate-600',
                                    )}
                                    >
                                        {detail.thread.progress_status === 'in_progress' ? '진행 중' : '완료'}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-500">{detail.thread.agenda_code}</span>
                                    <span className="text-xs text-slate-400">업데이트 {detail.thread.last_updated_at?.slice(0, 16).replace('T', ' ')}</span>

                                    <button
                                        type="button"
                                        onClick={openFullDetail}
                                        className="ml-auto inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        상세 페이지 열기
                                    </button>
                                </div>
                                <h2 className="mt-2 text-xl font-black text-slate-900">{detail.thread.root_title || detail.thread.title}</h2>
                                <p className="mt-1 text-sm font-medium text-slate-600">
                                    현재 선택: {entryKindLabel(selectedEntry.entry_kind)} · {selectedEntry.title}
                                </p>
                            </section>

                            <EntryBodyPanel
                                entry={selectedEntry}
                                tone={selectedIsRoot ? 'slate' : 'cyan'}
                                label={selectedIsRoot ? '최초 등록 안건' : '선택한 답변 안건'}
                            />

                            {!selectedIsRoot && rootEntry && (
                                <EntryBodyPanel entry={rootEntry} tone="slate" label="최초 등록 안건" />
                            )}

                            <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                                <h3 className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
                                    <MessageCircle className="h-4 w-4" /> 코멘트 ({detail.thread.comment_count || 0})
                                </h3>

                                <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                                    {(detail.comments || []).length <= 0 && (
                                        <p className="text-xs text-slate-500">등록된 코멘트가 없습니다.</p>
                                    )}
                                    {(detail.comments || []).map((comment) => (
                                        <div key={`comment-${comment.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <p className="text-xs font-semibold text-slate-700">{comment.author_name}</p>
                                                <p className="text-[11px] text-slate-400">{comment.created_at?.slice(0, 16).replace('T', ' ')}</p>
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-xs text-slate-700">{comment.body}</p>
                                        </div>
                                    ))}
                                </div>
                            </aside>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

