import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchInput from '../components/SearchInput';
import ResultList from '../components/ResultList';
import ProjectResultList from '../components/ProjectResultList';
import DocumentDetail from '../components/DocumentDetail';
import { api, getErrorMessage } from '../lib/api';
import { Loader2, AlertCircle } from 'lucide-react';

function extractItems(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (Array.isArray(payload?.items)) {
        return payload.items;
    }
    return [];
}

function tokenizeQuery(query) {
    return String(query || '')
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
}

function scoreProject(project, queryTokens, queryLower) {
    const name = String(project?.name || '').toLowerCase();
    const description = String(project?.description || '').toLowerCase();
    const customer = String(project?.customer_name || '').toLowerCase();
    const manager = String(project?.manager_name || project?.author_name || '').toLowerCase();
    const code = String(project?.code || '').toLowerCase();
    const installationSite = String(project?.installation_site || '').toLowerCase();
    const equipmentNames = Array.isArray(project?.equipment_names)
        ? project.equipment_names.map((item) => String(item || '').toLowerCase()).join(' ')
        : '';
    const haystack = `${name} ${description} ${customer} ${manager} ${code} ${installationSite} ${equipmentNames}`.trim();
    if (!haystack) return 0;
    const hasExactPhrase = Boolean(queryLower) && haystack.includes(queryLower);
    const matchedTokens = queryTokens.filter((token) => haystack.includes(token)).length;

    if (!hasExactPhrase && queryTokens.length >= 2) {
        const requiredTokenMatches = queryTokens.length <= 3 ? 2 : 3;
        if (matchedTokens < requiredTokenMatches) {
            return 0;
        }
    }

    let score = 0;
    if (queryLower && haystack.includes(queryLower)) score += 3;
    if (queryLower && name.includes(queryLower)) score += 4;
    if (queryLower && code.includes(queryLower)) score += 3;
    if (queryLower && customer.includes(queryLower)) score += 2;
    if (queryLower && manager.includes(queryLower)) score += 2;
    if (queryLower && installationSite.includes(queryLower)) score += 2;
    if (queryLower && equipmentNames.includes(queryLower)) score += 2.5;

    for (const token of queryTokens) {
        if (name.includes(token)) score += 1.5;
        if (description.includes(token)) score += 1.0;
        if (customer.includes(token)) score += 1.0;
        if (manager.includes(token)) score += 1.0;
        if (code.includes(token)) score += 1.2;
        if (installationSite.includes(token)) score += 0.9;
        if (equipmentNames.includes(token)) score += 1.1;
    }
    return score;
}

function searchProjectsLocally(projects, query, limit = 8) {
    const list = Array.isArray(projects) ? projects : [];
    const queryLower = String(query || '').trim().toLowerCase();
    if (!queryLower) return [];
    const queryTokens = tokenizeQuery(queryLower);

    const scored = list
        .map((project) => ({ ...project, score: scoreProject(project, queryTokens, queryLower) }))
        .filter((project) => project.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
}

const SearchResults = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const [results, setResults] = useState([]);
    const [projectResults, setProjectResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedResult, setSelectedResult] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        const fetchResults = async () => {
            if (!query.trim()) {
                if (!active) return;
                setResults([]);
                setProjectResults([]);
                setSelectedResult(null);
                return;
            }

            if (!active) return;
            setIsLoading(true);
            setError('');
            setSelectedResult(null);

            try {
                const [docResult, projectResult] = await Promise.allSettled([
                    api.get('/documents/search', {
                        params: { q: query, page: 1, page_size: 10 },
                        signal: controller.signal,
                    }),
                    api.get('/budget/projects/search', {
                        params: { q: query, limit: 8 },
                        signal: controller.signal,
                    }),
                ]);

                if (docResult.status !== 'fulfilled') {
                    throw docResult.reason;
                }

                if (!active) return;
                const docData = extractItems(docResult.value?.data);
                let projectData =
                    projectResult.status === 'fulfilled' && Array.isArray(projectResult.value?.data)
                        ? projectResult.value.data
                        : [];

                if (projectResult.status !== 'fulfilled') {
                    try {
                        const fallbackResp = await api.get('/budget/projects', {
                            params: { page: 1, page_size: 200 },
                            signal: controller.signal,
                        });
                        projectData = searchProjectsLocally(extractItems(fallbackResp.data), query, 8);
                    } catch (_fallbackErr) {
                        projectData = [];
                    }
                }
                if (!active) return;
                setResults(docData);
                setProjectResults(projectData);
            } catch (err) {
                if (!active || err?.code === 'ERR_CANCELED') {
                    return;
                }
                setResults([]);
                setProjectResults([]);
                setError(getErrorMessage(err, '검색 요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'));
            } finally {
                if (!active) return;
                setIsLoading(false);
            }
        };

        fetchResults();

        return () => {
            active = false;
            controller.abort();
        };
    }, [query]);

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md pb-4 pt-2 -mt-2 border-b">
                <div className="w-full">
                    <SearchInput initialQuery={query} />
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">검색 중입니다...</p>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center p-12 border rounded-xl bg-destructive/5 text-center">
                    <div className="p-4 bg-destructive/10 rounded-full mb-4 text-destructive animate-pulse">
                        <AlertCircle className="h-8 w-8" />
                    </div>
                    <h3 className="font-bold text-lg text-destructive mb-2">검색을 진행할 수 없습니다</h3>
                    <p className="text-sm text-destructive/80 mb-6 max-w-xs mx-auto leading-relaxed">{error}</p>

                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-6 py-2"
                    >
                        페이지 새로고침
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-7">
                        <h2 className="text-sm font-semibold text-muted-foreground mb-4">
                            총 {projectResults.length + results.length}건 검색됨 (프로젝트 {projectResults.length}건 · 문서 {results.length}건)
                        </h2>
                        {projectResults.length > 0 && (
                            <section className="mb-5 space-y-2">
                                <h3 className="text-sm font-semibold">프로젝트 결과</h3>
                                <ProjectResultList results={projectResults} />
                            </section>
                        )}
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">문서 결과</h3>
                            {results.length > 0 || projectResults.length === 0 ? (
                                <ResultList
                                    results={results}
                                    query={query}
                                    selectedResult={selectedResult}
                                    onSelect={setSelectedResult}
                                />
                            ) : (
                                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                                    문서 검색 결과는 없습니다.
                                </div>
                            )}
                        </section>
                    </div>
                    <div className="hidden lg:block lg:col-span-5 sticky top-24">
                        <DocumentDetail result={selectedResult} />
                    </div>
                    {/* Mobile detail view overlay could be added here if needed */}
                </div>
            )}
        </div>
    );
};

export default SearchResults;
