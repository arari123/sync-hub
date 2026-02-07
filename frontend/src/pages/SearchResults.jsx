import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SearchInput from '../components/SearchInput';
import ResultList from '../components/ResultList';
import ProjectResultList from '../components/ProjectResultList';
import DocumentDetail from '../components/DocumentDetail';
import { api, getErrorMessage } from '../lib/api';
import { Loader2, AlertCircle, FolderKanban } from 'lucide-react';

const SearchResults = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const [results, setResults] = useState([]);
    const [projectResults, setProjectResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedResult, setSelectedResult] = useState(null);

    useEffect(() => {
        const fetchResults = async () => {
            if (!query.trim()) {
                setResults([]);
                setProjectResults([]);
                setSelectedResult(null);
                return;
            }

            setIsLoading(true);
            setError('');
            setSelectedResult(null);

            try {
                const [docResult, projectResult] = await Promise.allSettled([
                    api.get('/documents/search', {
                        params: { q: query, limit: 10 },
                    }),
                    api.get('/budget/projects/search', {
                        params: { q: query, limit: 8 },
                    }),
                ]);

                if (docResult.status !== 'fulfilled') {
                    throw docResult.reason;
                }

                const docData = Array.isArray(docResult.value?.data) ? docResult.value.data : [];
                const projectData =
                    projectResult.status === 'fulfilled' && Array.isArray(projectResult.value?.data)
                        ? projectResult.value.data
                        : [];
                setResults(docData);
                setProjectResults(projectData);
            } catch (err) {
                setResults([]);
                setProjectResults([]);
                setError(getErrorMessage(err, '검색 요청을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'));
            } finally {
                setIsLoading(false);
            }
        };

        fetchResults();
    }, [query]);

    return (
        <div className="space-y-6">
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md pb-4 pt-2 -mt-2 border-b">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="w-full md:flex-1">
                        <SearchInput initialQuery={query} />
                    </div>
                    <Link
                        to="/budget-management"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        <FolderKanban className="h-4 w-4" />
                        프로젝트 관리 접속
                    </Link>
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
