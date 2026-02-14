import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
const FIELD_LABELS = {
    name: '프로젝트명',
    code: '프로젝트코드',
    customer_name: '고객사',
    installation_site: '설치장소',
    manager_name: '담당자',
    equipment_names: '설비명',
    description: '설명',
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

const ProjectResultList = ({ results, query }) => {
    const list = Array.isArray(results) ? results : [];
    const queryTokens = useMemo(() => tokenizeQuery(query), [query]);

    if (list.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
                프로젝트 검색 결과가 없습니다.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {list.map((project) => {
                const projectId = project?.project_id;
                const title = String(project?.name || '이름 없는 프로젝트').trim();
                const snippet = String(project?.snippet || project?.description || '').trim();
                const matchFields = normalizeList(project?.match_fields);
                const matchedTerms = normalizeList(project?.matched_terms);
                const highlightTerms = matchedTerms.length ? matchedTerms : queryTokens;
                const matchFieldLabels = matchFields.map((field) => FIELD_LABELS[field] || field);
                const snippetFieldLabel = FIELD_LABELS[project?.snippet_field] || String(project?.snippet_field || '').trim();

                const metaParts = [
                    String(project?.code || '').trim(),
                    String(project?.project_type_label || '').trim(),
                    String(project?.current_stage_label || '').trim(),
                ].filter(Boolean);
                const metaText = metaParts.join(' · ');

                return (
                    <article key={projectId || title} className="group">
                        <div className="text-[11px] text-muted-foreground">
                            sync-hub › 프로젝트 {metaText ? `› ${metaText}` : ''}
                        </div>

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
                            {project?.customer_name ? <span>고객사 {project.customer_name}</span> : null}
                            {project?.installation_site ? <span>설치장소 {project.installation_site}</span> : null}
                            {project?.manager_name ? <span>담당자 {project.manager_name}</span> : null}
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
                    </article>
                );
            })}
        </div>
    );
};

export default ProjectResultList;
