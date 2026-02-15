import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Package } from 'lucide-react';

const FIELD_LABELS = {
    // Project search fields (backend: /budget/projects/search)
    name: '프로젝트명',
    code: '프로젝트코드',
    customer_name: '고객사',
    installation_site: '설치장소',
    manager_name: '담당자',
    equipment_names: '설비명',
    description: '설명',

    // Agenda search fields (backend: /agenda/threads/search)
    title: '제목',
    agenda_code: '안건코드',
    project: '프로젝트',
    summary_plain: '요약',
    content: '본문',
    requester: '요청자',
    responder: '응답자',
    author: '작성자',
    worker_summary: '작업자',
};

function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function tokenizeQuery(query) {
    return String(query || '')
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, terms) {
    const raw = String(text || '');
    const tokens = normalizeList(terms);
    if (!raw || tokens.length === 0) return raw;

    const uniqueTokens = [...new Set(tokens)].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`(${uniqueTokens.map(escapeRegExp).join('|')})`, 'ig');
    const parts = raw.split(pattern);
    const lowerSet = new Set(uniqueTokens.map((token) => token.toLowerCase()));

    return parts.map((part, index) => {
        if (!part) return null;
        if (lowerSet.has(part.toLowerCase())) {
            return (
                <mark
                    key={`${index}-${part}`}
                    className="rounded bg-yellow-100 px-0.5 font-semibold text-foreground"
                >
                    {part}
                </mark>
            );
        }
        return <span key={`${index}-${part}`}>{part}</span>;
    });
}

function agendaProgressLabel(value) {
    const token = String(value || '').trim().toLowerCase();
    if (token === 'completed') return '완료';
    if (token === 'in_progress') return '진행중';
    return token || '상태 미정';
}

function getResultKind(result) {
    if (!result || typeof result !== 'object') return 'unknown';
    if ('thread_id' in result) return 'agenda';
    if ('project_id' in result && 'name' in result) return 'project';
    return result.kind || 'unknown';
}

const GlobalSearchResultList = ({ results, query }) => {
    const list = Array.isArray(results) ? results : [];
    const queryTokens = useMemo(() => tokenizeQuery(query), [query]);

    if (list.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {list.map((result) => {
                const kind = getResultKind(result);
                const matchFields = normalizeList(result?.match_fields);
                const matchedTerms = normalizeList(result?.matched_terms);
                const highlightTerms = matchedTerms.length ? matchedTerms : queryTokens;
                const matchFieldLabels = matchFields.map((field) => FIELD_LABELS[field] || field);
                const snippetFieldLabel = FIELD_LABELS[result?.snippet_field] || String(result?.snippet_field || '').trim();

                if (kind === 'agenda') {
                    const threadId = result?.thread_id;
                    const projectId = result?.project_id;
                    const title = String(result?.title || '제목 없는 안건').trim();
                    const snippet = String(result?.snippet || result?.summary_plain || '').trim();
                    const projectName = String(result?.project_name || '').trim();
                    const projectCode = String(result?.project_code || '').trim();
                    const agendaCode = String(result?.agenda_code || '').trim();
                    const progressLabel = agendaProgressLabel(result?.progress_status);
                    const metaParts = [
                        projectName ? `프로젝트 ${projectName}` : '',
                        projectCode ? `(${projectCode})` : '',
                        agendaCode ? `· ${agendaCode}` : '',
                        progressLabel ? `· ${progressLabel}` : '',
                    ].filter(Boolean);

                    return (
                        <article key={`agenda-${threadId || title}`} className="group">
                            <div className="text-[11px] text-muted-foreground">
                                sync-hub › 안건
                            </div>

                            <div className="mt-1 flex items-start gap-3">
                                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-700">
                                    <FileText className="h-4 w-4" />
                                </span>

                                <div className="min-w-0 flex-1">
                                    {threadId && projectId ? (
                                        <Link
                                            to={`/project-management/projects/${projectId}/agenda/${threadId}`}
                                            className="block text-[18px] font-semibold leading-tight text-sky-700 hover:underline"
                                        >
                                            {highlightText(title, highlightTerms)}
                                        </Link>
                                    ) : (
                                        <div className="text-[18px] font-semibold leading-tight text-sky-700">
                                            {highlightText(title, highlightTerms)}
                                        </div>
                                    )}

                                    {metaParts.length > 0 && (
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            {metaParts.join(' ')}
                                        </div>
                                    )}

                                    <div className="mt-1 text-sm leading-relaxed text-foreground/80">
                                        {snippet
                                            ? highlightText(snippet, highlightTerms)
                                            : <span className="text-muted-foreground">안건 요약이 없습니다.</span>}
                                    </div>

                                    {(matchFieldLabels.length > 0 || matchedTerms.length > 0 || snippetFieldLabel) && (
                                        <div className="mt-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="font-semibold text-foreground/80">왜 검색됨</span>
                                                {matchFieldLabels.length > 0 && <span>일치 항목: {matchFieldLabels.join(', ')}</span>}
                                                {matchedTerms.length > 0 && <span>키워드: {matchedTerms.join(', ')}</span>}
                                                {snippetFieldLabel && <span>스니펫: {snippetFieldLabel}</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>
                    );
                }

                // Default: project
                const projectId = result?.project_id;
                const title = String(result?.name || '이름 없는 프로젝트').trim();
                const snippet = String(result?.snippet || result?.description || '').trim();
                const metaParts = [
                    String(result?.code || '').trim(),
                    String(result?.project_type_label || '').trim(),
                    String(result?.current_stage_label || '').trim(),
                ].filter(Boolean);
                const metaText = metaParts.join(' · ');

                return (
                    <article key={`project-${projectId || title}`} className="group">
                        <div className="text-[11px] text-muted-foreground">
                            sync-hub › 프로젝트 {metaText ? `› ${metaText}` : ''}
                        </div>

                        <div className="mt-1 flex items-start gap-3">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-500/10 text-sky-700">
                                <Package className="h-4 w-4" />
                            </span>

                            <div className="min-w-0 flex-1">
                                {projectId ? (
                                    <Link
                                        to={`/project-management/projects/${projectId}`}
                                        className="block text-[18px] font-semibold leading-tight text-sky-700 hover:underline"
                                    >
                                        {highlightText(title, highlightTerms)}
                                    </Link>
                                ) : (
                                    <div className="text-[18px] font-semibold leading-tight text-sky-700">
                                        {highlightText(title, highlightTerms)}
                                    </div>
                                )}

                                <div className="mt-1 text-sm leading-relaxed text-foreground/80">
                                    {snippet
                                        ? highlightText(snippet, highlightTerms)
                                        : <span className="text-muted-foreground">프로젝트 설명이 없습니다.</span>}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                    {result?.customer_name ? <span>고객사 {result.customer_name}</span> : null}
                                    {result?.installation_site ? <span>설치장소 {result.installation_site}</span> : null}
                                    {result?.manager_name ? <span>담당자 {result.manager_name}</span> : null}
                                </div>

                                {(matchFieldLabels.length > 0 || matchedTerms.length > 0 || snippetFieldLabel) && (
                                    <div className="mt-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="font-semibold text-foreground/80">왜 검색됨</span>
                                            {matchFieldLabels.length > 0 && <span>일치 항목: {matchFieldLabels.join(', ')}</span>}
                                            {matchedTerms.length > 0 && <span>키워드: {matchedTerms.join(', ')}</span>}
                                            {snippetFieldLabel && <span>스니펫: {snippetFieldLabel}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export default GlobalSearchResultList;

