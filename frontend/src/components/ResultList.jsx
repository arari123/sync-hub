import React from 'react';
import { cn } from '../lib/utils';
import { FileText, FileSearch, Hash } from 'lucide-react';

function formatScore(score) {
    if (typeof score !== 'number') return '-';
    return score.toFixed(3);
}

const ResultList = ({ results, query, selectedResult, onSelect }) => {
    if (!results.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed rounded-xl bg-muted/30">
                <div className="p-4 bg-muted rounded-full mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No results found</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                    We couldn't find any documents matching your search. Try adjusting your keywords or filters.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {results.map((result) => {
                const isActive = selectedResult?.doc_id === result.doc_id;
                const titleText = result.title || result.filename || 'Untitled document';
                const summaryText = result.summary || '요약 정보가 아직 생성되지 않았습니다.';
                const pageText = typeof result.page === 'number' ? `p.${result.page}` : 'p.-';

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
                                <span className="text-[11px] font-mono text-muted-foreground/80">score {formatScore(result.score)}</span>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-foreground/80">
                            <p className="line-clamp-2">{summaryText}</p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
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

export default ResultList;
