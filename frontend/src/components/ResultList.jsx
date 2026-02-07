import React from 'react';
import { cn } from '../lib/utils';
import { FileText, FileSearch, Hash, Tag } from 'lucide-react';

const DOCUMENT_TYPE_LABELS = {
    equipment_failure_report: '설비 장애 조치보고서',
    catalog: '카탈로그',
    manual: '설명서',
    datasheet: '데이터시트',
    unclassified: '미분류',
};

function formatScore(score) {
    if (typeof score !== 'number') return '-';
    return score.toFixed(3);
}

function normalizeDocumentTypes(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
    }

    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return [...new Set(parsed.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
            }
        } catch (error) {
            return [];
        }
    }

    return [...new Set(trimmed.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function toTypeLabel(type) {
    return DOCUMENT_TYPE_LABELS[type] || type;
}

function parseFailureReportSummary(summaryText) {
    const text = String(summaryText || '').trim();
    if (!text) return null;

    const parsed = {};
    const pattern = /(작업내용|작성자|작업장소)\s*:\s*(.*?)(?=(?:,\s*(?:작업내용|작성자|작업장소)\s*:)|$)/g;
    let match = pattern.exec(text);
    while (match) {
        const key = match[1];
        const value = String(match[2] || '').trim();
        if (value) parsed[key] = value;
        match = pattern.exec(text);
    }

    if (!parsed['작업내용'] && !parsed['작성자'] && !parsed['작업장소']) {
        return null;
    }
    return parsed;
}

const ResultList = ({ results, query, selectedResult, onSelect }) => {
    if (!results.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed rounded-xl bg-muted/30">
                <div className="p-4 bg-muted rounded-full mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">검색 결과가 없습니다</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    검색어와 일치하는 문서를 찾지 못했습니다. 검색어를 바꾸거나 필터를 조정해 보세요.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {results.map((result) => {
                const isActive = selectedResult?.doc_id === result.doc_id;
                const titleText = result.title || result.filename || '제목 없음 문서';
                const summaryText = result.summary || '요약 정보가 아직 생성되지 않았습니다.';
                const pageText = typeof result.page === 'number' ? `p.${result.page}` : 'p.-';
                const documentTypes = normalizeDocumentTypes(result.document_types);
                const visibleDocumentTypes = documentTypes.length ? documentTypes : ['unclassified'];
                const isFailureReport = visibleDocumentTypes.includes('equipment_failure_report');
                const failureSummary = isFailureReport ? parseFailureReportSummary(summaryText) : null;

                return (
                    <div
                        key={`${result.doc_id}-${result.filename}`}
                        className={cn(
                            "p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md text-left bg-card",
                            isActive ? "ring-2 ring-primary border-transparent" : "hover:border-primary/50"
                        )}
                        onClick={() => onSelect(result)}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-primary/10 rounded-full text-primary">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg leading-tight text-primary hover:underline">
                                        {titleText}
                                    </h3>
                                    <span className="text-xs text-muted-foreground break-all">{result.filename}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">{pageText}</span>
                                <span className="text-[11px] font-mono text-muted-foreground/80">점수 {formatScore(result.score)}</span>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-foreground/80">
                            {failureSummary ? (
                                <div className="space-y-1 rounded-md bg-muted/25 px-2 py-2 text-[11px]">
                                    <SummaryRow label="작업내용" value={failureSummary['작업내용'] || '-'} />
                                    <SummaryRow label="작성자" value={failureSummary['작성자'] || '-'} />
                                    <SummaryRow label="작업장소" value={failureSummary['작업장소'] || '-'} />
                                </div>
                            ) : (
                                <p className="line-clamp-2">{summaryText}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {visibleDocumentTypes.map((type) => (
                                    <span
                                        key={`${result.doc_id}-${type}`}
                                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2 py-1 text-[11px] text-foreground"
                                    >
                                        <Tag className="h-3 w-3" />
                                        {toTypeLabel(type)}
                                    </span>
                                ))}
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                    <FileSearch className="h-3 w-3" />
                                    검색어: {query || '-'}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                                    <Hash className="h-3 w-3" />
                                    문서 ID: {result.doc_id}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const SummaryRow = ({ label, value }) => (
    <div className="flex items-center gap-2">
        <span className="min-w-[44px] text-[10px] font-semibold text-foreground/75">{label}</span>
        <span className="truncate text-[11px] text-foreground/85">{value}</span>
    </div>
);

export default ResultList;
