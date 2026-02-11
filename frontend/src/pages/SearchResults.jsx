import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Bell,
    ChevronDown,
    Database,
    Filter,
    FolderKanban,
    Loader2,
    MoreVertical,
    Plus,
    Search,
    Settings,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';

const PROJECT_SCOPE_PATTERN = /프로젝트코드\s*:\s*([^\s]+)/;
const STAGE_OPTIONS = [
    { value: 'all', label: '전체 단계' },
    { value: 'review', label: '검토' },
    { value: 'fabrication', label: '제작' },
    { value: 'installation', label: '설치' },
    { value: 'warranty', label: '워런티' },
    { value: 'closure', label: '종료' },
];
const TABLE_PAGE_SIZE = 10;

function extractItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
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

function searchProjectsLocally(projects, query, limit = 20) {
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

function parseScopedQuery(rawQuery) {
    const raw = String(rawQuery || '').trim();
    if (!raw) {
        return { projectScope: '', searchQuery: '' };
    }
    const matched = raw.match(PROJECT_SCOPE_PATTERN);
    if (!matched) {
        return { projectScope: '', searchQuery: raw };
    }

    const projectScope = String(matched[1] || '').trim();
    const stripped = raw.replace(matched[0], '').trim();
    const searchQuery = stripped || projectScope;
    return { projectScope, searchQuery };
}

function normalizeStage(value) {
    const stage = String(value || '').trim().toLowerCase();
    if (stage === 'progress') return 'fabrication';
    return stage;
}

function buildUpdateLinks(project) {
    const projectId = project?.id;
    if (!projectId) return [];

    const updates = [];
    const varianceTotal = Number(project?.monitoring?.variance_total ?? 0);
    const equipmentCount = Array.isArray(project?.equipment_names) ? project.equipment_names.length : 0;

    if ((project?.current_stage || '') === 'review') {
        updates.push({ label: '안건', to: `/project-management/projects/${projectId}/joblist`, tone: 'amber' });
    }
    if (Math.abs(varianceTotal) >= 1) {
        updates.push({ label: '예산', to: `/project-management/projects/${projectId}/budget`, tone: 'blue' });
    }
    if (equipmentCount > 0) {
        updates.push({ label: '사양', to: `/project-management/projects/${projectId}/spec`, tone: 'emerald' });
    }
    if (String(project?.description || '').trim()) {
        updates.push({ label: '기본정보', to: `/project-management/projects/${projectId}/info/edit`, tone: 'violet' });
    }

    const unique = [];
    const seen = new Set();
    for (const item of updates) {
        if (seen.has(item.label)) continue;
        seen.add(item.label);
        unique.push(item);
    }
    return unique.slice(0, 3);
}

function badgeToneClass(tone) {
    if (tone === 'amber') return 'bg-amber-100 text-amber-800';
    if (tone === 'blue') return 'bg-blue-100 text-blue-800';
    if (tone === 'emerald') return 'bg-emerald-100 text-emerald-800';
    if (tone === 'violet') return 'bg-violet-100 text-violet-800';
    return 'bg-slate-100 text-slate-700';
}

function formatDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    return text.slice(0, 10);
}

function mergeProjectSearchRows(projectPool, projectHits, query) {
    const pool = Array.isArray(projectPool) ? projectPool : [];
    const map = new Map(pool.map((project) => [Number(project.id), project]));
    const merged = [];
    const seenIds = new Set();

    for (const hit of Array.isArray(projectHits) ? projectHits : []) {
        const projectId = Number(hit?.project_id || 0);
        if (!projectId || seenIds.has(projectId)) continue;
        seenIds.add(projectId);

        const full = map.get(projectId);
        if (full) {
            merged.push({ ...full, score: Number(hit?.score || 0) });
            continue;
        }

        merged.push({
            id: projectId,
            name: hit?.name || '이름 없는 프로젝트',
            code: '',
            description: hit?.description || '',
            customer_name: hit?.customer_name || '',
            manager_name: hit?.manager_name || '',
            installation_site: '',
            is_mine: false,
            cover_image_display_url: '',
            current_stage: hit?.current_stage || '',
            current_stage_label: hit?.current_stage_label || '',
            score: Number(hit?.score || 0),
            monitoring: {},
        });
    }

    if (merged.length > 0) {
        return merged.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
    }

    return searchProjectsLocally(pool, query, 50);
}

const SearchResults = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const query = searchParams.get('q') || '';

    const { projectScope, searchQuery } = useMemo(() => parseScopedQuery(query), [query]);
    const hasSearchQuery = Boolean(searchQuery.trim());

    const [inputQuery, setInputQuery] = useState(query);
    const [projectPool, setProjectPool] = useState([]);
    const [projectRows, setProjectRows] = useState([]);
    const [showAllProjects, setShowAllProjects] = useState(false);
    const [projectFilters, setProjectFilters] = useState({
        projectName: '',
        projectCode: '',
        customerName: '',
        managerName: '',
        stage: 'all',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const user = getCurrentUser();
    const userBadge = (user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase();

    useEffect(() => {
        setInputQuery(query);
    }, [query]);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        const fetchResults = async () => {
            setIsLoading(true);
            setError('');

            try {
                const projectListPromise = api.get('/budget/projects', {
                    params: { page: 1, page_size: 200, sort_by: 'updated_desc' },
                    signal: controller.signal,
                });

                const projectSearchPromise = hasSearchQuery
                    ? api.get('/budget/projects/search', {
                        params: { q: searchQuery, limit: 50 },
                        signal: controller.signal,
                    })
                    : Promise.resolve({ data: [] });

                const [projectListResult, projectSearchResult] = await Promise.allSettled([
                    projectListPromise,
                    projectSearchPromise,
                ]);

                if (projectListResult.status !== 'fulfilled') {
                    throw projectListResult.reason;
                }

                const projectList = extractItems(projectListResult.value?.data);

                let nextProjectRows = projectList;
                if (hasSearchQuery) {
                    if (projectSearchResult.status === 'fulfilled' && Array.isArray(projectSearchResult.value?.data)) {
                        nextProjectRows = mergeProjectSearchRows(projectList, projectSearchResult.value.data, searchQuery);
                    } else {
                        nextProjectRows = searchProjectsLocally(projectList, searchQuery, 50);
                    }
                }

                if (!active) return;
                setProjectPool(projectList);
                setProjectRows(nextProjectRows);
            } catch (err) {
                if (!active || err?.code === 'ERR_CANCELED') {
                    return;
                }
                setProjectPool([]);
                setProjectRows([]);
                setError(getErrorMessage(err, '검색 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
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
    }, [hasSearchQuery, searchQuery]);

    const visibleProjects = useMemo(() => {
        const source = Array.isArray(projectRows) ? projectRows : [];
        const projectNameFilter = String(projectFilters.projectName || '').trim().toLowerCase();
        const projectCodeFilter = String(projectFilters.projectCode || '').trim().toLowerCase();
        const customerNameFilter = String(projectFilters.customerName || '').trim().toLowerCase();
        const managerNameFilter = String(projectFilters.managerName || '').trim().toLowerCase();
        const scopeFilter = String(projectScope || '').trim().toLowerCase();

        return source.filter((project) => {
            if (!showAllProjects && project?.is_mine === false) {
                return false;
            }

            const name = String(project?.name || '').toLowerCase();
            const code = String(project?.code || '').toLowerCase();
            const customerName = String(project?.customer_name || '').toLowerCase();
            const managerName = String(project?.manager_name || '').toLowerCase();
            const installationSite = String(project?.installation_site || '').toLowerCase();

            if (projectNameFilter && !name.includes(projectNameFilter)) return false;
            if (projectCodeFilter && !code.includes(projectCodeFilter)) return false;
            if (customerNameFilter && !customerName.includes(customerNameFilter)) return false;
            if (managerNameFilter && !managerName.includes(managerNameFilter)) return false;

            if (projectFilters.stage !== 'all' && normalizeStage(project?.current_stage) !== projectFilters.stage) {
                return false;
            }

            if (scopeFilter) {
                const scopeHaystack = `${name} ${code} ${customerName} ${installationSite}`.trim();
                if (!scopeHaystack.includes(scopeFilter)) {
                    return false;
                }
            }

            return true;
        });
    }, [projectRows, projectFilters, projectScope, showAllProjects]);

    const tableProjects = useMemo(
        () => visibleProjects.slice(0, TABLE_PAGE_SIZE),
        [visibleProjects]
    );

    const totalVisibleCount = visibleProjects.length;
    const totalProjectCount = showAllProjects ? projectPool.length : projectPool.filter((project) => project?.is_mine !== false).length;

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const nextQuery = inputQuery.trim();
        if (!nextQuery) {
            navigate('/');
            return;
        }
        navigate(`/?q=${encodeURIComponent(nextQuery)}`);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur">
                <div className="mx-auto h-full max-w-[1600px] px-4 lg:px-6 flex items-center gap-3">
                        <Link to="/" className="w-44 shrink-0 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center text-xs font-bold">S</div>
                        <div className="leading-tight">
                            <p className="font-extrabold tracking-tight text-sm">sync-hub</p>
                            <p className="text-[10px] text-slate-500">Search Workspace</p>
                        </div>
                    </Link>

                    <form onSubmit={handleSearchSubmit} className="flex-1">
                        <label className="relative block">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder="프로젝트, 안건, 사양, PDF, EXCEL 데이터를 자연어로 검색"
                                className="h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                            />
                        </label>
                    </form>

                    <div className="w-28 shrink-0 flex items-center justify-end gap-2">
                        <button type="button" className="h-9 w-9 rounded-full grid place-items-center text-slate-500 hover:bg-slate-100">
                            <Bell className="h-4 w-4" />
                        </button>
                        <button type="button" className="h-9 w-9 rounded-full bg-slate-900 text-white text-xs font-bold grid place-items-center">
                            <span>{userBadge}</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1600px]">
                <aside className="hidden xl:flex w-60 shrink-0 border-r border-slate-200 bg-white p-3">
                    <nav className="w-full space-y-1.5 text-sm">
                        <Link to="/" className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-900">
                            <Search className="h-4 w-4" />
                            글로벌 검색
                        </Link>
                        <Link to="/project-management" className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">
                            <FolderKanban className="h-4 w-4" />
                            프로젝트 리스트
                        </Link>
                        <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">
                            <Database className="h-4 w-4" />
                            자료 검색
                        </button>
                        <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">
                            <Settings className="h-4 w-4" />
                            설정
                        </button>
                    </nav>
                </aside>

                <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
                    <section className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="inline-flex w-fit rounded-lg border border-slate-200 p-1">
                                <button
                                    type="button"
                                    onClick={() => setShowAllProjects(false)}
                                    className={cn(
                                        'px-3 py-1.5 text-sm rounded-md transition',
                                        !showAllProjects
                                            ? 'bg-slate-900 text-white font-semibold'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    )}
                                >
                                    내 프로젝트
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAllProjects(true)}
                                    className={cn(
                                        'px-3 py-1.5 text-sm rounded-md transition',
                                        showAllProjects
                                            ? 'bg-slate-900 text-white font-semibold'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    )}
                                >
                                    전체 프로젝트
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-500">
                                    프로젝트 {totalVisibleCount}건 표시 / 기준 풀 {totalProjectCount}건
                                </span>
                                <Link
                                    to="/project-management/projects/new"
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                >
                                    <Plus className="h-4 w-4" />
                                    새 프로젝트 생성
                                </Link>
                            </div>
                        </div>
                    </section>

                    <details className="rounded-2xl border border-slate-200 bg-white">
                        <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between">
                            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Filter className="h-4 w-4" />
                                필터
                            </div>
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                        </summary>
                        <div className="border-t border-slate-200 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                                <input
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                                    placeholder="프로젝트명"
                                    value={projectFilters.projectName}
                                    onChange={(event) => setProjectFilters((prev) => ({ ...prev, projectName: event.target.value }))}
                                />
                                <input
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                                    placeholder="프로젝트 코드"
                                    value={projectFilters.projectCode}
                                    onChange={(event) => setProjectFilters((prev) => ({ ...prev, projectCode: event.target.value }))}
                                />
                                <input
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                                    placeholder="고객사"
                                    value={projectFilters.customerName}
                                    onChange={(event) => setProjectFilters((prev) => ({ ...prev, customerName: event.target.value }))}
                                />
                                <input
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                                    placeholder="담당자"
                                    value={projectFilters.managerName}
                                    onChange={(event) => setProjectFilters((prev) => ({ ...prev, managerName: event.target.value }))}
                                />
                                <select
                                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                                    value={projectFilters.stage}
                                    onChange={(event) => setProjectFilters((prev) => ({ ...prev, stage: event.target.value }))}
                                >
                                    {STAGE_OPTIONS.map((item) => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </details>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1120px]">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold">프로젝트</th>
                                        <th className="px-4 py-3 text-left font-semibold">미확인 업데이트 (바로가기)</th>
                                        <th className="px-4 py-3 text-left font-semibold">고객사/위치</th>
                                        <th className="px-4 py-3 text-left font-semibold">담당자</th>
                                        <th className="px-4 py-3 text-left font-semibold">마지막 안건</th>
                                        <th className="px-4 py-3 text-right font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-16 text-center">
                                                <div className="inline-flex items-center gap-2 text-slate-500">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    데이터를 불러오는 중입니다.
                                                </div>
                                            </td>
                                        </tr>
                                    ) : tableProjects.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                                                표시할 프로젝트가 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        tableProjects.map((project) => {
                                            const updateLinks = buildUpdateLinks(project);
                                            return (
                                                <tr key={`project-row-${project.id}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                                                    <td className="px-4 py-3 align-top">
                                                        <div className="flex items-start gap-3">
                                                            <img
                                                                src={project.cover_image_display_url || project.cover_image_fallback_url || ''}
                                                                alt={`${project.name || '프로젝트'} 대표 이미지`}
                                                                className="h-12 w-20 rounded-md border border-slate-200 object-cover bg-slate-100"
                                                            />
                                                            <div className="min-w-0">
                                                                <Link
                                                                    to={`/project-management/projects/${project.id}`}
                                                                    className="block truncate text-sm font-semibold text-slate-900 hover:text-slate-700"
                                                                >
                                                                    {project.name || '이름 없는 프로젝트'}
                                                                </Link>
                                                                <p className="mt-0.5 text-xs text-slate-500 font-mono">{project.code || 'NO-CODE'}</p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    최근 업데이트: {formatDate(project.updated_at)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 align-top">
                                                        {updateLinks.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {updateLinks.map((item) => (
                                                                    <Link
                                                                        key={`${project.id}-${item.label}`}
                                                                        to={item.to}
                                                                        className={cn(
                                                                            'rounded-full px-2 py-1 text-[11px] font-semibold',
                                                                            badgeToneClass(item.tone)
                                                                        )}
                                                                    >
                                                                        {item.label}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">미확인 업데이트 없음</span>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3 align-top text-xs text-slate-600">
                                                        <p className="font-medium text-slate-700">{project.customer_name || '-'}</p>
                                                        <p className="mt-1">{project.installation_site || '-'}</p>
                                                    </td>

                                                    <td className="px-4 py-3 align-top text-xs text-slate-600">
                                                        {project.manager_name || '담당자 미지정'}
                                                    </td>

                                                    <td className="px-4 py-3 align-top">
                                                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                                                            Empty (이슈 등록 미구현)
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-3 align-top text-right">
                                                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                            <span>
                                Showing {Math.min(TABLE_PAGE_SIZE, totalVisibleCount)} of {totalVisibleCount}
                                {projectScope ? ` (프로젝트코드:${projectScope} 범위)` : ''}
                            </span>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

export default SearchResults;
