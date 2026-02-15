import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    CheckCircle2,
    ClipboardList,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    FileClock,
    MessageCircle,
    MessageSquare,
    Paperclip,
    Plus,
    Search,
} from 'lucide-react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import { Input } from '../components/ui/Input';

const PER_PAGE = 10;
const PAGE_GROUP_SIZE = 10;
const FILTER_CHIP_BASE_CLASS =
    'inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const FILTER_CHIP_ACTIVE_CLASS = 'border-primary bg-primary text-primary-foreground shadow-sm';
const FILTER_CHIP_INACTIVE_CLASS =
    'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground';

function formatHours(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return '-';
    return `${number.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}시간`;
}

function PersonLine({ label, name, org }) {
    return (
        <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-500">{label}</span>
            {' '}
            <span className="font-semibold text-slate-800">{name || '-'}</span>
            {org ? <span className="text-slate-500"> ({org})</span> : null}
        </p>
    );
}

function AgendaCard({ item, onClick }) {
    const isReport = item.thread_kind === 'work_report';
    const isDraft = item.record_status === 'draft';
    const isInProgress = item.progress_status === 'in_progress';
    const replyCount = Number(item.reply_count || 0);
    const hasReplies = replyCount > 0 && !isDraft;

    const rootTitle = item.root_title || item.title || '';
    const latestTitle = item.latest_title || item.title || '';
    const rootSummary = String(item.root_summary_plain || '').trim();
    const latestSummary = String(item.latest_summary_plain || item.summary_plain || '').trim();
    const createdLabel = item.created_at?.slice(0, 16).replace('T', ' ') || '-';
    const updatedLabel = item.last_updated_at?.slice(0, 16).replace('T', ' ') || '-';

    return (
        <article
            onClick={onClick}
            className={cn(
                'cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md',
                isInProgress ? 'border-cyan-200' : 'border-slate-200',
            )}
        >
            <div className="flex flex-col gap-4 lg:flex-row">
                <div className="h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:h-24 lg:w-40">
                    <img src={item.thumbnail_url} alt="안건 썸네일" className="h-full w-full object-cover" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn(
                                    'inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-bold',
                                    isReport
                                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                                        : 'border-cyan-200 bg-cyan-50 text-cyan-700',
                                )}
                                >
                                    {isReport ? '작업보고서' : '일반 안건'}
                                </span>
                                {isDraft && (
                                    <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700">
                                        임시 저장
                                    </span>
                                )}
                                <span className="text-xs font-semibold text-slate-400">{item.agenda_code}</span>
                            </div>
                            {hasReplies ? (
                                <div className="grid grid-cols-1 gap-2 pt-1 lg:grid-cols-2">
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-bold text-slate-500">최초 등록 안건</span>
                                            <span className="font-mono text-[10px] text-slate-400">{createdLabel}</span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">{rootTitle}</p>
                                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{rootSummary || '-'}</p>
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            <span className="font-semibold text-slate-500">작성자</span> <span className="font-semibold text-slate-800">{item.author_name || '-'}</span>
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-bold text-slate-500">최신 답변 안건</span>
                                            <span className="font-mono text-[10px] text-slate-400">{updatedLabel}</span>
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">{latestTitle}</p>
                                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{latestSummary || '-'}</p>
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            <span className="font-semibold text-slate-500">최종 작성자</span> <span className="font-semibold text-slate-800">{item.latest_author_name || '-'}</span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h3 className="line-clamp-2 text-base font-bold text-slate-900">
                                        {rootTitle}
                                    </h3>
                                    {item.latest_title && item.latest_title !== item.root_title && (
                                        <p className="line-clamp-1 text-sm font-medium text-slate-600">
                                            최근 답변: {item.latest_title}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        <span className={cn(
                            'inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold',
                            isInProgress
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-100 text-slate-600',
                        )}
                        >
                            {isInProgress ? '진행 중' : '완료'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        {!isReport ? (
                            <>
                                <PersonLine label="작성자" name={item.author_name} />
                                <PersonLine label="요청자" name={item.requester_name} org={item.requester_org} />
                                <PersonLine label="답변자" name={item.responder_name} org={item.responder_org} />
                                <p className="text-xs text-slate-500">최종 작성자: {item.latest_author_name || '-'}</p>
                            </>
                        ) : (
                            <>
                                <PersonLine label="작성자" name={item.author_name} />
                                <PersonLine label="요청자" name={item.requester_name} org={item.requester_org} />
                                <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-500">작업자</span> <span className="font-semibold text-slate-800">{item.worker_summary || '-'}</span>
                                </p>
                                <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-500">작업일</span> {item.work_date_label || '-'}
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="font-semibold text-slate-500">합계</span> {formatHours(item.total_work_hours)}
                                </p>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 첨부 {item.attachment_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> 답변 {item.reply_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 코멘트 {item.comment_count || 0}</span>
                        <span className="ml-auto text-[11px] text-slate-400">업데이트 {item.last_updated_at?.slice(0, 16).replace('T', ' ')}</span>
                    </div>
                </div>
            </div>
        </article>
    );
}

export default function AgendaList() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const navigationType = useNavigationType();

    const scrollStorageKey = useMemo(
        () => `agenda_list_scroll:${location.pathname}${location.search}`,
        [location.pathname, location.search],
    );
    const [isScrollRestored, setIsScrollRestored] = useState(false);

    const [project, setProject] = useState(null);
    const [items, setItems] = useState([]);

    const [inputQuery, setInputQuery] = useState('');
    const [query, setQuery] = useState('');
    const [searchField, setSearchField] = useState('all');
    const [progressStatus, setProgressStatus] = useState('all');
    const [threadKind, setThreadKind] = useState('all');
    const [includeDrafts, setIncludeDrafts] = useState(false);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const persistScrollTop = () => {
            try {
                window.sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
            } catch (error) {
                // ignore
            }
        };

        let rafId = null;
        const handleScroll = () => {
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                persistScrollTop();
            });
        };

        persistScrollTop();
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, [scrollStorageKey]);

    useLayoutEffect(() => {
        if (isScrollRestored) return;
        if (navigationType !== 'POP') {
            setIsScrollRestored(true);
            return;
        }
        if (isLoading) return;

        let raw = null;
        try {
            raw = window.sessionStorage.getItem(scrollStorageKey);
        } catch (error) {
            setIsScrollRestored(true);
            return;
        }
        if (!raw) {
            setIsScrollRestored(true);
            return;
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) {
            try {
                window.sessionStorage.removeItem(scrollStorageKey);
            } catch (error) {
                // ignore
            }
            setIsScrollRestored(true);
            return;
        }

        requestAnimationFrame(() => {
            window.scrollTo({ top: value, left: 0, behavior: 'auto' });
            setIsScrollRestored(true);
        });
    }, [isLoading, isScrollRestored, navigationType, scrollStorageKey]);

    useEffect(() => {
        const loadProject = async () => {
            if (!projectId) return;
            try {
                const response = await api.get(`/agenda/projects/${projectId}/meta`);
                setProject(response?.data?.project || null);
            } catch (err) {
                setError(getErrorMessage(err, '프로젝트 정보를 불러오지 못했습니다.'));
            }
        };

        loadProject();
    }, [projectId]);

    useEffect(() => {
        const loadList = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const response = await api.get(`/agenda/projects/${projectId}/threads`, {
                    params: {
                        q: query,
                        search_field: searchField,
                        progress_status: progressStatus,
                        thread_kind: threadKind,
                        include_drafts: includeDrafts,
                        page,
                        per_page: PER_PAGE,
                    },
                });

                const payload = response?.data || {};
                setItems(Array.isArray(payload.items) ? payload.items : []);
                setTotal(Number(payload.total || 0));
                setTotalPages(Number(payload.total_pages || 0));
            } catch (err) {
                setError(getErrorMessage(err, '안건 목록을 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        loadList();
    }, [projectId, query, searchField, progressStatus, threadKind, includeDrafts, page]);

    const pageNumbers = useMemo(() => {
        if (!totalPages || totalPages <= 0) return [];
        const safePage = Math.max(1, Math.min(page, totalPages));
        const pageGroupStart = Math.floor((safePage - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1;
        const pageGroupEnd = Math.min(totalPages, pageGroupStart + PAGE_GROUP_SIZE - 1);
        return Array.from({ length: Math.max(0, pageGroupEnd - pageGroupStart + 1) }, (_, index) => pageGroupStart + index);
    }, [page, totalPages]);

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        setPage(1);
        setQuery(inputQuery.trim());
    };

    if (!project && !isLoading && error) {
        return <p className="text-sm text-slate-500">{error}</p>;
    }

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project?.id || projectId}
                projectName={project?.name || '프로젝트'}
                projectCode={project?.code || ''}
                pageLabel="안건 관리"
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project?.name || '프로젝트', to: `/project-management/projects/${projectId}` },
                    { label: '안건 관리' },
                ]}
                actions={(
                    <button
                        type="button"
                        onClick={() => navigate(`/project-management/projects/${projectId}/agenda/new`)}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700"
                    >
                        <Plus className="h-4 w-4" /> 안건 작성
                    </button>
                )}
            />

            <section className="app-surface-soft px-3 py-2">
                <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <select
                            value={searchField}
                            onChange={(event) => {
                                setSearchField(event.target.value);
                                setPage(1);
                            }}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs font-semibold text-muted-foreground sm:w-32"
                            aria-label="검색 조건"
                        >
                            <option value="all">전체</option>
                            <option value="title">제목</option>
                            <option value="title_content">제목+내용</option>
                            <option value="content">내용</option>
                            <option value="author">작성자</option>
                            <option value="requester">요청자</option>
                            <option value="responder_worker">답변자/작업자</option>
                        </select>

                        <div className="relative w-full sm:w-[320px]">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                            <Input
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder="안건 검색"
                                className="h-8 w-full rounded-md bg-background px-2 pr-2 pl-7 text-xs"
                            />
                        </div>

                        <button
                            type="submit"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1"
                        >
                            검색
                        </button>
                    </div>

                    <div className="hidden h-5 w-px shrink-0 bg-slate-200 lg:block" />

                    <div className="min-w-0 flex flex-wrap items-center gap-1 overflow-x-auto pb-0.5">
                        {[
                            { value: 'all', label: '상태 전체' },
                            { value: 'in_progress', label: '진행 중' },
                            { value: 'completed', label: '완료' },
                        ].map((item) => {
                            const isActive = progressStatus === item.value;
                            return (
                                <button
                                    key={`progress-${item.value}`}
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

                    <div className="hidden h-5 w-px shrink-0 bg-slate-200 lg:block" />

                    <div className="min-w-0 flex flex-wrap items-center gap-1 overflow-x-auto pb-0.5">
                        {[
                            { value: 'all', label: '유형 전체' },
                            { value: 'general', label: '일반 안건' },
                            { value: 'work_report', label: '작업보고서' },
                        ].map((item) => {
                            const isActive = threadKind === item.value;
                            return (
                                <button
                                    key={`kind-${item.value}`}
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

                    <div className="hidden h-5 w-px shrink-0 bg-slate-200 lg:block" />

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
                        <FileClock className="mr-1 h-3.5 w-3.5" />
                        임시 저장 포함
                    </button>
                </form>
            </section>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}

            <section className="space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <p>총 {total.toLocaleString('ko-KR')}건</p>
                    <p>정렬: 진행 중 우선 · 최신 업데이트 순</p>
                </div>

                {isLoading ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        목록을 불러오는 중...
                    </div>
                ) : items.length <= 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        표시할 안건이 없습니다.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => (
                            <AgendaCard
                                key={item.id}
                                item={item}
                                onClick={() => {
                                    if (item.record_status === 'draft') {
                                        navigate(`/project-management/projects/${projectId}/agenda/new?draft=${item.id}`);
                                        return;
                                    }
                                    navigate(`/project-management/projects/${projectId}/agenda/${item.id}`);
                                }}
                            />
                        ))}
                    </div>
                )}

                {totalPages > 1 && (() => {
                    const safePage = Math.max(1, Math.min(page, totalPages));
                    const visibleStart = total > 0 ? (safePage - 1) * PER_PAGE + 1 : 0;
                    const visibleEnd = Math.min(safePage * PER_PAGE, total);

                    const baseButtonClass =
                        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
                    const disabledButtonClass = 'cursor-not-allowed border-border bg-background text-muted-foreground/40';
                    const enabledButtonClass = 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground';
                    const pageButtonClass = (isActive) => cn(
                        'min-w-9 px-2 font-semibold',
                        isActive ? 'border-primary bg-primary text-primary-foreground' : enabledButtonClass,
                    );

                    return (
                        <>
                            <div className="app-surface-soft flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="text-[11px] font-semibold text-slate-500">
                                    페이지 {safePage} / {totalPages}
                                </span>
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setPage(1)}
                                        disabled={safePage <= 1}
                                        className={cn(baseButtonClass, safePage <= 1 ? disabledButtonClass : enabledButtonClass)}
                                        title="맨앞"
                                    >
                                        <ChevronsLeft className="h-3.5 w-3.5" />
                                        맨앞
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                        disabled={safePage <= 1}
                                        className={cn(baseButtonClass, safePage <= 1 ? disabledButtonClass : enabledButtonClass)}
                                        title="이전"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                        이전
                                    </button>

                                    {pageNumbers.map((pageNo) => (
                                        <button
                                            key={`agenda-page-${pageNo}`}
                                            type="button"
                                            onClick={() => setPage(pageNo)}
                                            aria-current={pageNo === safePage ? 'page' : undefined}
                                            className={cn(baseButtonClass, pageButtonClass(pageNo === safePage))}
                                        >
                                            {pageNo}
                                        </button>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                        disabled={safePage >= totalPages}
                                        className={cn(baseButtonClass, safePage >= totalPages ? disabledButtonClass : enabledButtonClass)}
                                        title="다음"
                                    >
                                        다음
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPage(totalPages)}
                                        disabled={safePage >= totalPages}
                                        className={cn(baseButtonClass, safePage >= totalPages ? disabledButtonClass : enabledButtonClass)}
                                        title="맨뒤"
                                    >
                                        맨뒤
                                        <ChevronsRight className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
                                <span>안건 {visibleStart}-{visibleEnd} / 총 {total.toLocaleString('ko-KR')}건</span>
                            </div>
                        </>
                    );
                })()}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
                <p className="mb-1 inline-flex items-center gap-1 font-semibold text-slate-700">
                    <ClipboardList className="h-4 w-4" /> 기록 정책
                </p>
                <p>정식 등록된 안건과 코멘트는 수정/삭제할 수 없습니다.</p>
                <p className="mt-1 inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> 진행 상태 변경은 최초 등록자만 가능합니다.</p>
            </section>
        </div>
    );
}
