import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Database, Loader2, Search, Sparkles } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import { Input } from '../components/ui/Input';
import ResultList from '../components/ResultList';
import DocumentDetail from '../components/DocumentDetail';
import UploadWidget from '../components/UploadWidget';

const PAGE_SIZE = 10;

function formatPageLabel(page) {
    if (typeof page !== 'number' || !Number.isFinite(page)) return '-';
    return `p.${page}`;
}

function SourcesPanel({ sources, onSelectDoc }) {
    if (!sources?.length) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                근거가 없습니다.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {sources.map((item, index) => (
                <button
                    key={`src-${item.doc_id}-${item.chunk_id}-${index}`}
                    type="button"
                    onClick={() => onSelectDoc?.(item.doc_id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-secondary"
                >
                    <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{item.filename || `문서 ${item.doc_id}`}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                            doc_id {item.doc_id} · {formatPageLabel(item.page)}
                        </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground">
                        {typeof item.score === 'number' ? item.score.toFixed(3) : '-'}
                    </span>
                </button>
            ))}
        </div>
    );
}

export default function DataHub() {
    const [permissions, setPermissions] = useState({ can_upload: false, can_use_ai: false });
    const [query, setQuery] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [results, setResults] = useState([]);
    const [total, setTotal] = useState(0);
    const [selectedResult, setSelectedResult] = useState(null);
    const [error, setError] = useState('');

    const [isSearching, setIsSearching] = useState(false);
    const [isAsking, setIsAsking] = useState(false);
    const [aiMode, setAiMode] = useState('');
    const [aiAgenda, setAiAgenda] = useState(null);
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiSources, setAiSources] = useState([]);
    const [aiUsage, setAiUsage] = useState(null);
    const [aiCacheHit, setAiCacheHit] = useState(false);

    const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)), [total]);
    const safePage = Math.min(Math.max(1, page), totalPages);

    useEffect(() => {
        const loadPermissions = async () => {
            try {
                const response = await api.get('/data-hub/permissions');
                setPermissions({
                    can_upload: !!response.data?.can_upload,
                    can_use_ai: !!response.data?.can_use_ai,
                });
            } catch (err) {
                // Keep the page usable even when permissions endpoint is misconfigured.
                setPermissions({ can_upload: false, can_use_ai: false });
            }
        };
        loadPermissions();
    }, []);

    const runSearch = async (nextQuery) => {
        const normalized = String(nextQuery || '').trim();
        setError('');
        setAiMode('');
        setAiAgenda(null);
        setAiAnswer('');
        setAiSources([]);
        setAiUsage(null);
        setAiCacheHit(false);

        if (!normalized) {
            setSearchQuery('');
            setResults([]);
            setTotal(0);
            setSelectedResult(null);
            return;
        }

        setSearchQuery(normalized);
        setPage(1);
        await fetchResults(normalized, 1);
    };

    const fetchResults = async (q, nextPage) => {
        const normalized = String(q || '').trim();
        if (!normalized) return;

        setIsSearching(true);
        setError('');
        try {
            const response = await api.get('/documents/search', {
                params: {
                    q: normalized,
                    page: nextPage,
                    page_size: PAGE_SIZE,
                },
            });
            const items = Array.isArray(response.data?.items) ? response.data.items : [];
            setResults(items);
            setTotal(Number(response.data?.total || 0));
            setSelectedResult(items[0] || null);
        } catch (err) {
            setError(getErrorMessage(err, '검색 결과를 불러오지 못했습니다.'));
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (!searchQuery) return;
        fetchResults(searchQuery, safePage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safePage]);

    const handleSearchSubmit = async (event) => {
        event.preventDefault();
        await runSearch(query);
    };

    const handleAskAi = async () => {
        if (!permissions.can_use_ai) {
            setError('AI 기능이 구성되지 않았습니다. 관리자에게 GEMINI_API_KEY 설정을 요청해 주세요.');
            return;
        }
        if (!searchQuery) {
            setError('먼저 검색어를 입력해 주세요.');
            return;
        }

        setIsAsking(true);
        setError('');
        try {
            const response = await api.post('/data-hub/ask', {
                q: searchQuery,
            });
            setAiMode(String(response.data?.mode || ''));
            setAiAgenda(response.data?.agenda && typeof response.data.agenda === 'object' ? response.data.agenda : null);
            setAiAnswer(String(response.data?.answer || ''));
            setAiSources(Array.isArray(response.data?.sources) ? response.data.sources : []);
            setAiUsage(response.data?.usage || null);
            setAiCacheHit(!!response.data?.cache_hit);
        } catch (err) {
            setError(getErrorMessage(err, 'AI 답변을 생성하지 못했습니다.'));
        } finally {
            setIsAsking(false);
        }
    };

    const handleSelectSourceDoc = (docId) => {
        const match = results.find((item) => item.doc_id === docId);
        if (match) setSelectedResult(match);
    };

    const isAgendaAi = String(aiMode || '').startsWith('agenda');

    return (
        <div className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                                <Database className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <h1 className="truncate text-base font-extrabold tracking-tight text-foreground">데이터 허브</h1>
                                <p className="truncate text-xs text-muted-foreground">PDF 카탈로그/데이터시트/메뉴얼 업로드 후 자연어로 검색합니다.</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSearchSubmit} className="flex w-full max-w-[640px] items-center gap-2">
                        <label className="relative block flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="예: 700W 이상 서보모터, 5M 컬러 카메라, 901 알람 조치방법"
                                className="h-10 w-full rounded-full border-border/90 bg-background pl-10 pr-4 text-sm"
                            />
                        </label>
                        <button
                            type="submit"
                            className={cn(
                                "inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors",
                                isSearching ? "cursor-wait border-border bg-muted text-muted-foreground" : "border-border bg-card hover:bg-secondary"
                            )}
                            disabled={isSearching}
                        >
                            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
                        </button>
                        <button
                            type="button"
                            onClick={handleAskAi}
                            disabled={isAsking || !permissions.can_use_ai}
                            className={cn(
                                "inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                                permissions.can_use_ai
                                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "cursor-not-allowed border-border bg-muted text-muted-foreground"
                            )}
                            title={permissions.can_use_ai ? '검색 결과를 근거로 AI 답변을 생성합니다.' : 'AI 기능이 구성되지 않았습니다.'}
                        >
                            {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            AI 답변 생성
                        </button>
                    </form>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>문서 검색 결과: {total || 0}건</span>
                    {aiUsage && (
                        <span className="font-mono text-[11px]">
                            {aiCacheHit ? 'cache_hit · ' : ''}
                            prompt {aiUsage.promptTokenCount ?? '-'} · output {aiUsage.candidatesTokenCount ?? '-'}
                        </span>
                    )}
                </div>

                {error && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}
            </section>

            <section
                className={cn(
                    "grid grid-cols-1 gap-4",
                    permissions.can_upload ? "lg:grid-cols-2" : "lg:grid-cols-1"
                )}
            >
                <div className="rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-primary" />
                            <h2 className="text-sm font-semibold text-foreground">AI 검색 결과</h2>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{aiCacheHit ? '캐시됨' : ''}</span>
                    </div>
                    <div className="space-y-4 p-4">
                        {isAgendaAi ? (
                            <div className="rounded-lg border border-border bg-background p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-extrabold text-foreground">
                                            {aiMode === 'agenda_summary' ? '안건 요약' : '안건 코드 조회'}
                                        </p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                            {aiAgenda?.agenda_code ? aiAgenda.agenda_code : ''}
                                            {aiAgenda?.title ? ` · ${aiAgenda.title}` : ''}
                                        </p>
                                    </div>
                                    {aiAgenda?.project_id && aiAgenda?.thread_id ? (
                                        <Link
                                            to={`/project-management/projects/${aiAgenda.project_id}/agenda/${aiAgenda.thread_id}`}
                                            className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                                        >
                                            안건 열기
                                        </Link>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        <div className="rounded-lg border border-border bg-background p-3">
                            {aiAnswer ? (
                                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
                                    {aiAnswer}
                                </pre>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    검색 후 <span className="font-semibold text-foreground">AI 답변 생성</span>을 누르면, 검색 결과를 근거로 답변을 생성합니다.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground">
                                {isAgendaAi ? '근거(안건)' : '근거(문서/페이지)'}
                            </p>
                            {isAgendaAi ? (
                                <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
                                    {aiMode === 'agenda_summary'
                                        ? '안건 본문(루트/최신 엔트리 및 작업보고서 섹션)을 요약했습니다.'
                                        : '해당 코드로 조회되는 안건이 없거나, 열람 권한이 없습니다.'}
                                </div>
                            ) : (
                                <SourcesPanel sources={aiSources} onSelectDoc={handleSelectSourceDoc} />
                            )}
                        </div>
                    </div>
                </div>

                {permissions.can_upload ? (
                    <UploadWidget
                        title="데이터 허브 PDF 업로드"
                        uploadEndpoint="/data-hub/documents/upload"
                        allowedExtensions={['.pdf']}
                        accept=".pdf,application/pdf"
                        description="텍스트 PDF(카탈로그/데이터시트/메뉴얼)를 업로드하면 자동으로 인덱싱됩니다."
                    />
                ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    <div className="lg:col-span-7">
                        {isSearching ? (
                            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-10 text-sm text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" /> 검색 중...
                            </div>
                        ) : (
                            <ResultList
                                results={results}
                                query={searchQuery}
                                selectedResult={selectedResult}
                                onSelect={setSelectedResult}
                            />
                        )}

                        <div className="mt-4 flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                                disabled={!searchQuery || safePage <= 1 || isSearching}
                                className={cn(
                                    "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors",
                                    safePage <= 1 || isSearching
                                        ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                                        : "border-border bg-card hover:bg-secondary"
                                )}
                            >
                                이전
                            </button>
                            <span className="text-xs text-muted-foreground">
                                {searchQuery ? `${safePage} / ${totalPages}` : '-'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={!searchQuery || safePage >= totalPages || isSearching}
                                className={cn(
                                    "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors",
                                    safePage >= totalPages || isSearching
                                        ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                                        : "border-border bg-card hover:bg-secondary"
                                )}
                            >
                                다음
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 lg:col-span-5">
                        <DocumentDetail result={selectedResult} />
                    </div>
                </div>
            </section>
        </div>
    );
}
