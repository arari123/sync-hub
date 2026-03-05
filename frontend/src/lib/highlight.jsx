import React from 'react';

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeQuery(value) {
    const seen = new Set();
    return (value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => {
            const lowered = token.toLowerCase();
            if (seen.has(lowered)) return false;
            seen.add(lowered);
            return true;
        })
        .sort((left, right) => right.length - left.length);
}

export function renderHighlightedText(text, query) {
    const source = text || '';
    if (!source) return source;

    const tokens = tokenizeQuery(query);
    if (!tokens.length) return source;

    const matcher = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'gi');
    const tokenSet = new Set(tokens.map((token) => token.toLowerCase()));

    return source.split(matcher).map((part, index) => {
        if (tokenSet.has(part.toLowerCase())) {
            return (
                <mark key={`mark-${index}`} className="bg-yellow-200 dark:bg-yellow-900/50 text-foreground rounded-sm px-0.5">
                    {part}
                </mark>
            );
        }
        return <span key={`text-${index}`}>{part}</span>;
    });
}
