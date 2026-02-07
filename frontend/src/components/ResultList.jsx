import React from 'react';
import { renderHighlightedText } from '../lib/highlight';
import { cn } from '../lib/utils';
import { FileText } from 'lucide-react';

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
                const summaryText = result.summary || '';
                const snippetText = result.snippet || 'No snippet available.';
                const showSnippet = !summaryText || summaryText !== snippetText;
                const evidenceList = Array.isArray(result.evidence) ? result.evidence : [];

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
                                        {result.filename}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">ID: {result.doc_id}</span>
                                </div>
                            </div>
                            <div className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                                Score: {formatScore(result.score)}
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-foreground/80">
                            {summaryText && (
                                <p className="line-clamp-3">{renderHighlightedText(summaryText, query)}</p>
                            )}

                            {showSnippet && (
                                <p className="text-muted-foreground text-xs italic">{renderHighlightedText(snippetText, query)}</p>
                            )}

                            {evidenceList.length > 0 && (
                                <ul className="mt-2 space-y-1 pl-4 border-l-2 border-primary/20">
                                    {evidenceList.slice(0, 2).map((sentence, index) => (
                                        <li key={index} className="text-xs text-muted-foreground">
                                            {renderHighlightedText(sentence, query)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ResultList;
