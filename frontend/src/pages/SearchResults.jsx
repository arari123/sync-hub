import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Bell,
    Database,
    Grid2x2,
    Loader2,
    Plus,
    Search,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';
import ResultList from '../components/ResultList';
import DocumentDetail from '../components/DocumentDetail';

const PROJECT_SCOPE_PATTERN = /프로젝트코드\s*:\s*([^\s]+)/;
const STAGE_OPTIONS = [
    { value: 'review', label: '검토' },
    { value: 'fabrication', label: '제작' },
    { value: 'installation', label: '설치' },
    { value: 'warranty', label: '워런티' },
    { value: 'closure', label: '종료' },
];
const PROJECT_TYPE_OPTIONS = [
    { value: 'equipment', label: '설비' },
    { value: 'parts', label: '파츠' },
    { value: 'as', label: 'AS' },
];
const TABLE_PAGE_SIZE = 10;
const STAGE_LABEL_MAP = Object.fromEntries(STAGE_OPTIONS.map((item) => [item.value, item.label]));
const PROJECT_TYPE_LABEL_MAP = {
    equipment: '설비',
    parts: '파츠',
    as: '유지보수',
};
const PROJECT_SIGNAL_LABELS = ['안건', '예산', '사양'];
const FILTER_CHIP_BASE_CLASS =
    'whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none transition-all duration-150 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';
const FILTER_CHIP_ACTIVE_CLASS = 'border-sky-500 bg-sky-500 text-white shadow-sm shadow-sky-500/20';
const FILTER_CHIP_INACTIVE_CLASS =
    'border-slate-200 bg-white/95 text-slate-500 hover:border-sky-400 hover:text-sky-600';
const STAGE_PROGRESS_FALLBACK = {
    review: 18,
    fabrication: 46,
    installation: 72,
    warranty: 88,
    closure: 100,
};
const STAGE_STYLE_MAP = {
    review: {
        badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
        statusTextClass: 'text-sky-600',
        progressFrom: '#38bdf8',
        progressTo: '#10b981',
        dotColor: '#0ea5e9',
        statusLabel: '검토 진행',
    },
    fabrication: {
        badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        statusTextClass: 'text-indigo-600',
        progressFrom: '#6366f1',
        progressTo: '#14b8a6',
        dotColor: '#6366f1',
        statusLabel: '제작 진행',
    },
    installation: {
        badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        statusTextClass: 'text-emerald-600',
        progressFrom: '#34d399',
        progressTo: '#06b6d4',
        dotColor: '#10b981',
        statusLabel: '설치 진행',
    },
    warranty: {
        badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
        statusTextClass: 'text-amber-600',
        progressFrom: '#f59e0b',
        progressTo: '#f97316',
        dotColor: '#f59e0b',
        statusLabel: '워런티 대응',
    },
    closure: {
        badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
        statusTextClass: 'text-slate-600',
        progressFrom: '#94a3b8',
        progressTo: '#64748b',
        dotColor: '#64748b',
        statusLabel: '종료',
    },
    default: {
        badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
        statusTextClass: 'text-slate-600',
        progressFrom: '#94a3b8',
        progressTo: '#64748b',
        dotColor: '#64748b',
        statusLabel: '진행',
    },
};

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

function normalizeProjectType(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'equipment' || raw === '설비') return 'equipment';
    if (raw === 'parts' || raw === '파츠') return 'parts';
    if (raw === 'as' || raw === 'a/s' || raw === '유지보수' || raw === 'as project') return 'as';
    return raw;
}

function resolveProjectStatusLabel(project) {
    const explicitLabel = String(project?.current_stage_label || '').trim();
    if (explicitLabel) return explicitLabel;
    const stage = normalizeStage(project?.current_stage);
    return STAGE_LABEL_MAP[stage] || '-';
}

function resolveProjectTypeLabel(project) {
    const explicitLabel = String(project?.project_type_label || '').trim();
    if (explicitLabel) return explicitLabel;
    const type = String(project?.project_type || '').trim().toLowerCase();
    if (!type) return '미분류';
    return PROJECT_TYPE_LABEL_MAP[type] || type;
}

function matchProjectFilterQuery(project, rawQuery) {
    const query = String(rawQuery || '').trim().toLowerCase();
    if (!query) return true;

    const tokens = query.split(/\s+/).map((item) => item.trim()).filter(Boolean);
    if (tokens.length === 0) return true;

    const equipmentNames = Array.isArray(project?.equipment_names)
        ? project.equipment_names.map((item) => String(item || '')).join(' ')
        : '';

    const haystack = [
        project?.name,
        project?.code,
        project?.description,
        project?.customer_name,
        project?.manager_name,
        project?.author_name,
        project?.installation_site,
        equipmentNames,
        resolveProjectStatusLabel(project),
        resolveProjectTypeLabel(project),
    ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');

    return tokens.every((token) => haystack.includes(token));
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
    if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (tone === 'blue') return 'border-sky-200 bg-sky-50 text-sky-700';
    if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (tone === 'violet') return 'border-violet-200 bg-violet-50 text-violet-700';
    return 'border-slate-200 bg-slate-100 text-slate-700';
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatCompactKrw(value) {
    const amount = toNumber(value);
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    const normalized = sign ? abs : amount;

    if (abs >= 100000000) {
        const unit = (normalized / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
        return `${sign}${unit}억 원`;
    }
    if (abs >= 10000) {
        const unit = (normalized / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
        return `${sign}${unit}만 원`;
    }
    return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
}

function resolveStageStyle(project) {
    const stage = normalizeStage(project?.current_stage);
    return STAGE_STYLE_MAP[stage] || STAGE_STYLE_MAP.default;
}

function resolveBudgetSnapshot(project) {
    const monitoring = project?.monitoring || {};
    const totals = project?.totals || {};
    const confirmedBudget = Math.max(
        toNumber(monitoring.confirmed_budget_total),
        toNumber(totals.grand_total),
    );
    const spentByParts = (
        toNumber(monitoring.actual_spent_material)
        + toNumber(monitoring.actual_spent_labor)
        + toNumber(monitoring.actual_spent_expense)
    );
    const spent = Math.max(toNumber(monitoring.actual_spent_total), spentByParts, 0);
    const balance = confirmedBudget - spent;
    return {
        confirmedBudget,
        spent,
        balance,
    };
}

function computeProgressPercent(project) {
    const milestones = Array.isArray(project?.summary_milestones) ? project.summary_milestones : [];
    if (milestones.length > 0) {
        let progressScore = 0;
        for (const milestone of milestones) {
            const status = String(milestone?.status || '').trim().toLowerCase();
            if (status === 'done') {
                progressScore += 1;
            } else if (status === 'active') {
                progressScore += 0.55;
            }
        }
        const ratio = progressScore / milestones.length;
        return Math.max(8, Math.min(100, Math.round(ratio * 100)));
    }

    const stage = normalizeStage(project?.current_stage);
    return STAGE_PROGRESS_FALLBACK[stage] || 15;
}

function resolveProgressMeta(project, balance, progressPercent) {
    const stage = normalizeStage(project?.current_stage);
    const stageStyle = resolveStageStyle(project);

    if (balance < 0) {
        return { label: '예산 주의', dotColor: '#f59e0b', textClass: 'text-amber-600' };
    }
    if (stage === 'closure') {
        return { label: '종료', dotColor: '#64748b', textClass: 'text-slate-600' };
    }
    if (progressPercent >= 90) {
        return { label: '완료 임박', dotColor: '#10b981', textClass: 'text-emerald-600' };
    }
    return {
        label: stageStyle.statusLabel,
        dotColor: stageStyle.dotColor,
        textClass: stageStyle.statusTextClass,
    };
}

function buildMockAgendaTitles(project) {
    const stageLabel = resolveProjectStatusLabel(project) || '진행';
    const equipmentName = Array.isArray(project?.equipment_names) && project.equipment_names.length > 0
        ? String(project.equipment_names[0] || '').trim()
        : '핵심 설비';

    return [
        `${stageLabel} 단계 주간 이슈 점검`,
        `${equipmentName} 사양 확정 협의`,
        '납기 대응 일정 및 협력사 조율',
    ];
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
            project_type: hit?.project_type || '',
            project_type_label: hit?.project_type_label || '',
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
    const [documentResults, setDocumentResults] = useState([]);
    const [selectedResult, setSelectedResult] = useState(null);
    const [showAllProjects, setShowAllProjects] = useState(false);
    const [projectFilters, setProjectFilters] = useState({
        stages: [],
        types: [],
    });
    const [projectFilterQuery, setProjectFilterQuery] = useState('');
    const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const user = getCurrentUser();
    const userBadge = (user?.full_name || user?.email || 'U').slice(0, 1).toUpperCase();
    const quickMenuRef = useRef(null);

    useEffect(() => {
        setInputQuery(query);
    }, [query]);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!quickMenuRef.current) return;
            if (quickMenuRef.current.contains(event.target)) return;
            setIsQuickMenuOpen(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        const fetchResults = async () => {
            setIsLoading(true);
            setError('');
            setSelectedResult(null);

            try {
                const projectListPromise = api.get('/budget/projects', {
                    params: { page: 1, page_size: 200, sort_by: 'updated_desc' },
                    signal: controller.signal,
                });

                const documentSearchPromise = hasSearchQuery
                    ? api.get('/documents/search', {
                        params: { q: searchQuery, page: 1, page_size: 10 },
                        signal: controller.signal,
                    })
                    : Promise.resolve({ data: { items: [] } });

                const projectSearchPromise = hasSearchQuery
                    ? api.get('/budget/projects/search', {
                        params: { q: searchQuery, limit: 50 },
                        signal: controller.signal,
                    })
                    : Promise.resolve({ data: [] });

                const [projectListResult, documentSearchResult, projectSearchResult] = await Promise.allSettled([
                    projectListPromise,
                    documentSearchPromise,
                    projectSearchPromise,
                ]);

                if (projectListResult.status !== 'fulfilled') {
                    throw projectListResult.reason;
                }

                if (hasSearchQuery && documentSearchResult.status !== 'fulfilled') {
                    throw documentSearchResult.reason;
                }

                const projectList = extractItems(projectListResult.value?.data);
                const docs = documentSearchResult.status === 'fulfilled'
                    ? extractItems(documentSearchResult.value?.data)
                    : [];

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
                setDocumentResults(docs);
            } catch (err) {
                if (!active || err?.code === 'ERR_CANCELED') {
                    return;
                }
                setProjectPool([]);
                setProjectRows([]);
                setDocumentResults([]);
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

    const filteredProjects = useMemo(() => {
        const source = Array.isArray(projectRows) ? projectRows : [];
        const scopeFilter = String(projectScope || '').trim().toLowerCase();

        return source.filter((project) => {
            if (!showAllProjects && project?.is_mine === false) {
                return false;
            }

            const name = String(project?.name || '').toLowerCase();
            const code = String(project?.code || '').toLowerCase();
            const customerName = String(project?.customer_name || '').toLowerCase();
            const installationSite = String(project?.installation_site || '').toLowerCase();

            if (scopeFilter) {
                const scopeHaystack = `${name} ${code} ${customerName} ${installationSite}`.trim();
                if (!scopeHaystack.includes(scopeFilter)) {
                    return false;
                }
            }

            if (!matchProjectFilterQuery(project, projectFilterQuery)) {
                return false;
            }

            return true;
        });
    }, [projectRows, projectScope, projectFilterQuery, showAllProjects]);

    const stageCounts = useMemo(() => {
        const counts = Object.fromEntries(STAGE_OPTIONS.map((item) => [item.value, 0]));
        for (const project of filteredProjects) {
            const stage = normalizeStage(project?.current_stage);
            if (!(stage in counts)) continue;
            counts[stage] += 1;
        }
        return counts;
    }, [filteredProjects]);

    const typeCounts = useMemo(() => {
        const counts = Object.fromEntries(PROJECT_TYPE_OPTIONS.map((item) => [item.value, 0]));
        for (const project of filteredProjects) {
            const type = normalizeProjectType(project?.project_type || project?.project_type_label);
            if (!(type in counts)) continue;
            counts[type] += 1;
        }
        return counts;
    }, [filteredProjects]);

    const visibleProjects = useMemo(() => {
        const selectedStages = new Set(Array.isArray(projectFilters.stages) ? projectFilters.stages : []);
        const selectedTypes = new Set(Array.isArray(projectFilters.types) ? projectFilters.types : []);

        return filteredProjects.filter((project) => {
            if (selectedStages.size > 0 && !selectedStages.has(normalizeStage(project?.current_stage))) {
                return false;
            }
            const projectTypeKey = normalizeProjectType(project?.project_type || project?.project_type_label);
            if (selectedTypes.size > 0 && !selectedTypes.has(projectTypeKey)) {
                return false;
            }
            return true;
        });
    }, [filteredProjects, projectFilters.stages, projectFilters.types]);

    const tableProjects = useMemo(
        () => visibleProjects.slice(0, TABLE_PAGE_SIZE),
        [visibleProjects]
    );

    const totalVisibleCount = visibleProjects.length;
    const visibleStartIndex = totalVisibleCount > 0 ? 1 : 0;
    const visibleEndIndex = Math.min(TABLE_PAGE_SIZE, totalVisibleCount);
    const myProjectCount = projectPool.filter((project) => project?.is_mine !== false).length;
    const allProjectCount = projectPool.length;
    const totalProjectCount = showAllProjects ? allProjectCount : myProjectCount;
    const hasProjectPanel = isLoading || projectRows.length > 0 || !hasSearchQuery;

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const nextQuery = inputQuery.trim();
        if (!nextQuery) {
            navigate('/');
            return;
        }
        navigate(`/?q=${encodeURIComponent(nextQuery)}`);
    };

    const toggleStageFilter = (stage) => {
        setProjectFilters((prev) => {
            const current = Array.isArray(prev.stages) ? prev.stages : [];
            const nextStages = current.includes(stage)
                ? current.filter((value) => value !== stage)
                : [...current, stage];
            return { ...prev, stages: nextStages };
        });
    };

    const clearStageFilters = () => {
        setProjectFilters((prev) => ({ ...prev, stages: [] }));
    };

    const toggleTypeFilter = (type) => {
        setProjectFilters((prev) => {
            const current = Array.isArray(prev.types) ? prev.types : [];
            const nextTypes = current.includes(type)
                ? current.filter((value) => value !== type)
                : [...current, type];
            return { ...prev, types: nextTypes };
        });
    };

    const clearTypeFilters = () => {
        setProjectFilters((prev) => ({ ...prev, types: [] }));
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="h-16 border-b border-border bg-card/95 backdrop-blur">
                <div className="mx-auto h-full max-w-[1600px] px-4 lg:px-6 flex items-center gap-3">
                    <Link to="/" className="w-44 shrink-0 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center text-xs font-bold">S</div>
                        <div className="leading-tight">
                            <p className="font-extrabold tracking-tight text-sm">sync-hub</p>
                            <p className="text-[10px] text-muted-foreground">Search Workspace</p>
                        </div>
                    </Link>

                    <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0">
                        <label className="relative block">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder="프로젝트, 안건, 사양, PDF, EXCEL 데이터를 자연어로 검색"
                                className="h-10 w-full rounded-full border border-input bg-secondary pl-11 pr-4 text-sm outline-none transition focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                            />
                        </label>
                    </form>

                    <div className="w-40 shrink-0 flex items-center justify-end gap-2">
                        <button type="button" className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary">
                            <Bell className="h-4 w-4" />
                        </button>
                        <div className="relative" ref={quickMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsQuickMenuOpen((prev) => !prev)}
                                className="h-9 w-9 rounded-full grid place-items-center text-muted-foreground hover:bg-secondary hover:text-primary"
                                aria-label="빠른 메뉴"
                                aria-expanded={isQuickMenuOpen}
                            >
                                <Grid2x2 className="h-4 w-4" />
                            </button>

                            {isQuickMenuOpen && (
                                <div className="absolute right-0 top-11 z-20 w-56 rounded-2xl border border-border bg-card p-3 shadow-xl">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Link
                                            to="/project-management/projects/new"
                                            onClick={() => setIsQuickMenuOpen(false)}
                                            className="flex flex-col items-center gap-1 rounded-xl p-3 text-foreground hover:bg-secondary"
                                        >
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                                                <Plus className="h-4 w-4" />
                                            </span>
                                            <span className="text-xs font-semibold text-center">새 프로젝트 생성</span>
                                        </Link>
                                        <button
                                            type="button"
                                            className="flex flex-col items-center gap-1 rounded-xl p-3 text-muted-foreground/70 cursor-not-allowed"
                                            title="데이터 허브는 아직 구현되지 않았습니다."
                                        >
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground">
                                                <Database className="h-4 w-4" />
                                            </span>
                                            <span className="text-xs font-semibold text-center">데이터 허브(미구현)</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button type="button" className="h-9 w-9 rounded-full bg-primary text-primary-foreground text-xs font-bold grid place-items-center">
                            <span>{userBadge}</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="border-b border-border bg-secondary/80">
                <div className="mx-auto h-10 max-w-[1600px] px-4 lg:px-6 flex items-center">
                    <nav
                        aria-label="현재 경로"
                        className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground"
                    >
                        <Link to="/" className="font-medium hover:text-primary">
                            메인
                        </Link>
                        <span>/</span>
                        <Link to="/search" className="font-semibold text-foreground/90 hover:text-primary">
                            글로벌 검색
                        </Link>
                    </nav>
                </div>
            </div>

            <div className="mx-auto min-h-[calc(100vh-6.5rem)] max-w-[1600px]">
                <main className="overflow-y-auto p-4 lg:p-6 space-y-4">
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {hasProjectPanel && (
                        <section className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-col gap-2">
                                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                                    <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-1">
                                        <button
                                            type="button"
                                            onClick={clearStageFilters}
                                            aria-pressed={projectFilters.stages.length === 0}
                                            className={cn(
                                                FILTER_CHIP_BASE_CLASS,
                                                projectFilters.stages.length === 0
                                                    ? FILTER_CHIP_ACTIVE_CLASS
                                                    : FILTER_CHIP_INACTIVE_CLASS
                                            )}
                                        >
                                            전체 ({filteredProjects.length})
                                        </button>
                                        {STAGE_OPTIONS.map((item) => {
                                            const isActive = projectFilters.stages.includes(item.value);
                                            return (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    onClick={() => toggleStageFilter(item.value)}
                                                    aria-pressed={isActive}
                                                    className={cn(
                                                        FILTER_CHIP_BASE_CLASS,
                                                        isActive
                                                            ? FILTER_CHIP_ACTIVE_CLASS
                                                            : FILTER_CHIP_INACTIVE_CLASS
                                                    )}
                                                >
                                                    {item.label} ({stageCounts[item.value] || 0})
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex rounded-md bg-slate-100 p-0.5">
                                            <button
                                                type="button"
                                                onClick={() => setShowAllProjects(false)}
                                                className={cn(
                                                    'rounded px-2.5 py-1 text-[11px] font-semibold transition-colors',
                                                    !showAllProjects
                                                        ? 'bg-white text-slate-900 shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                )}
                                            >
                                                내프로젝트
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowAllProjects(true)}
                                                className={cn(
                                                    'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                                                    showAllProjects
                                                        ? 'bg-white text-slate-900 shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-800'
                                                )}
                                            >
                                                전체프로젝트
                                            </button>
                                        </div>

                                        <div className="relative w-full sm:w-52 xl:w-56">
                                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={projectFilterQuery}
                                                onChange={(event) => setProjectFilterQuery(event.target.value)}
                                                placeholder="프로젝트 검색"
                                                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 pr-2 pl-7 text-xs text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-1 focus:ring-sky-300"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-1">
                                    <button
                                        type="button"
                                        onClick={clearTypeFilters}
                                        aria-pressed={projectFilters.types.length === 0}
                                        className={cn(
                                            FILTER_CHIP_BASE_CLASS,
                                            projectFilters.types.length === 0
                                                ? FILTER_CHIP_ACTIVE_CLASS
                                                : FILTER_CHIP_INACTIVE_CLASS
                                        )}
                                    >
                                        전체 유형 ({filteredProjects.length})
                                    </button>
                                    {PROJECT_TYPE_OPTIONS.map((item) => {
                                        const isActive = projectFilters.types.includes(item.value);
                                        return (
                                            <button
                                                key={item.value}
                                                type="button"
                                                onClick={() => toggleTypeFilter(item.value)}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    FILTER_CHIP_BASE_CLASS,
                                                    isActive
                                                        ? FILTER_CHIP_ACTIVE_CLASS
                                                        : FILTER_CHIP_INACTIVE_CLASS
                                                )}
                                            >
                                                {item.label} ({typeCounts[item.value] || 0})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    )}

                    {hasProjectPanel ? (
                        <section className="space-y-3">
                            {isLoading ? (
                                <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-16 text-center shadow-sm">
                                    <div className="inline-flex items-center gap-2 text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        데이터를 불러오는 중입니다.
                                    </div>
                                </div>
                            ) : tableProjects.length === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-16 text-center text-sm text-slate-500 shadow-sm">
                                    필터 조건에 맞는 프로젝트가 없습니다.
                                </div>
                            ) : (
                                tableProjects.map((project) => {
                                    const updateLinks = buildUpdateLinks(project);
                                    const updateLinkMap = new Map(updateLinks.map((item) => [item.label, item]));
                                    const signalUpdates = PROJECT_SIGNAL_LABELS.map((label) => ({
                                        label,
                                        ...updateLinkMap.get(label),
                                    }));
                                    const mockAgendaTitles = buildMockAgendaTitles(project);
                                    const stageStyle = resolveStageStyle(project);
                                    const budget = resolveBudgetSnapshot(project);
                                    const progressPercent = computeProgressPercent(project);
                                    const progressWidth = `${Math.max(6, Math.min(100, progressPercent))}%`;
                                    const progressMeta = resolveProgressMeta(project, budget.balance, progressPercent);
                                    const coverImage = project.cover_image_display_url || project.cover_image_fallback_url || '';
                                    return (
                                        <article
                                            key={`project-row-${project.id}`}
                                            className="rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm transition-all hover:border-sky-200 hover:shadow-md"
                                        >
                                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                                <div className="flex min-w-0 gap-3">
                                                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                                        {coverImage ? (
                                                            <img
                                                                src={coverImage}
                                                                alt={`${project.name || '프로젝트'} 대표 이미지`}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-400">
                                                                이미지 없음
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1 flex items-center justify-between gap-2">
                                                            <span className="truncate text-[10px] font-mono tracking-wider text-slate-400">
                                                                {project.code || '코드 없음'}
                                                            </span>
                                                            <span className={cn(
                                                                'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold',
                                                                stageStyle.badgeClass
                                                            )}
                                                            >
                                                                {resolveProjectStatusLabel(project)}
                                                            </span>
                                                        </div>

                                                        <Link
                                                            to={`/project-management/projects/${project.id}`}
                                                            className="mb-1.5 block min-h-[2.4rem] text-base font-bold leading-tight tracking-tight text-slate-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden hover:text-sky-700"
                                                        >
                                                            {project.name || '이름 없는 프로젝트'}
                                                        </Link>

                                                        <p className="truncate text-[11px] text-slate-600">
                                                            고객사 {project.customer_name || '-'} · 설치장소 {project.installation_site || '-'} · 담당자 {project.manager_name || '미지정'}
                                                        </p>

                                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                            {signalUpdates.map((item) => (
                                                                item.to ? (
                                                                    <Link
                                                                        key={`${project.id}-${item.label}`}
                                                                        to={item.to}
                                                                        className={cn(
                                                                            'rounded border px-1.5 py-0.5 text-[10px] font-bold',
                                                                            badgeToneClass(item.tone)
                                                                        )}
                                                                    >
                                                                        {item.label}
                                                                    </Link>
                                                                ) : (
                                                                    <span
                                                                        key={`${project.id}-${item.label}`}
                                                                        className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
                                                                    >
                                                                        {item.label}
                                                                    </span>
                                                                )
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-200 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                                                    <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">예산</span>
                                                            <span className="text-xs font-bold text-slate-700">
                                                                {formatCompactKrw(budget.confirmedBudget)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-slate-200 pl-2">
                                                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">사용</span>
                                                            <span className="text-xs font-bold text-slate-700">
                                                                {formatCompactKrw(budget.spent)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col border-l border-slate-200 pl-2">
                                                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">잔액</span>
                                                            <span className={cn(
                                                                'text-xs font-bold',
                                                                budget.balance >= 0 ? 'text-emerald-600' : 'text-amber-600'
                                                            )}
                                                            >
                                                                {budget.balance >= 0 ? '+' : ''}
                                                                {formatCompactKrw(budget.balance)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                        <span>시작</span>
                                                        <span className={stageStyle.statusTextClass}>{resolveProjectStatusLabel(project)}</span>
                                                        <span>종료</span>
                                                    </div>

                                                    <div className="relative mb-1 py-2">
                                                        <div className="h-1.5 rounded-full bg-slate-200" />
                                                        <div
                                                            className="absolute left-0 top-2 h-1.5 rounded-full transition-all duration-500"
                                                            style={{
                                                                width: progressWidth,
                                                                background: `linear-gradient(90deg, ${stageStyle.progressFrom} 0%, ${stageStyle.progressTo} 100%)`,
                                                            }}
                                                        />
                                                        <div className="absolute left-0 top-2 h-2 w-2 -translate-x-1/2 -translate-y-1/4 rounded-full border border-white bg-slate-300" />
                                                        <div className="absolute right-0 top-2 h-2 w-2 translate-x-1/2 -translate-y-1/4 rounded-full border border-white bg-slate-300" />
                                                        <div
                                                            className="absolute top-2 h-3 w-3 -translate-x-1/2 -translate-y-1/3 rounded-full border-2 border-white shadow-sm"
                                                            style={{ left: progressWidth, backgroundColor: stageStyle.dotColor }}
                                                        />
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-semibold text-slate-500">진행률 {progressPercent}%</span>
                                                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', progressMeta.textClass)}>
                                                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: progressMeta.dotColor }} />
                                                            {progressMeta.label}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-200 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                                                    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50/70 p-2">
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">최신 안건</p>
                                                                <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-600">
                                                                    3건
                                                                </span>
                                                            </div>
                                                            <Link
                                                                to={`/project-management/projects/${project.id}`}
                                                                className="text-[10px] font-semibold text-sky-600 hover:underline"
                                                            >
                                                                보기
                                                            </Link>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            {mockAgendaTitles.map((title, index) => (
                                                                <div
                                                                    key={`${project.id}-agenda-${index}`}
                                                                    className={cn(
                                                                        'group relative overflow-hidden rounded-lg border px-2 py-1.5 transition-all',
                                                                        index === 0
                                                                            ? 'border-sky-300 bg-white shadow-sm'
                                                                            : 'border-slate-200 bg-white/80 hover:border-slate-300'
                                                                    )}
                                                                >
                                                                    <span
                                                                        className={cn(
                                                                            'absolute left-0 top-0 h-full w-0.5',
                                                                            index === 0 ? 'bg-sky-400' : 'bg-slate-300'
                                                                        )}
                                                                    />
                                                                    <div className="flex items-start gap-2">
                                                                        <span
                                                                            className={cn(
                                                                                'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                                                                                index === 0
                                                                                    ? 'bg-sky-100 text-sky-700'
                                                                                    : 'bg-slate-100 text-slate-500'
                                                                            )}
                                                                        >
                                                                            {index + 1}
                                                                        </span>
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-[10px] font-semibold text-slate-700">
                                                                                {title}
                                                                            </p>
                                                                            <p className="text-[9px] text-slate-400">
                                                                                안건 연동 전 임시 제목
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
                                <span>
                                    프로젝트 {visibleStartIndex}-{visibleEndIndex} / 총 {totalVisibleCount}건
                                    {` · 기준 모드 ${showAllProjects ? '전체' : '내 프로젝트'} (${totalProjectCount}건)`}
                                    {projectScope ? ` (프로젝트코드:${projectScope} 범위)` : ''}
                                </span>
                                {hasSearchQuery && (
                                    <span>문서 검색 결과 {documentResults.length}건</span>
                                )}
                            </div>
                        </section>
                    ) : null}

                    {hasSearchQuery && documentResults.length > 0 && (
                        <section className="rounded-2xl border border-border bg-card p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-foreground">문서 검색 결과</h2>
                                <span className="text-xs text-muted-foreground">검색어: {searchQuery}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                                <div className="lg:col-span-7">
                                    <ResultList
                                        results={documentResults}
                                        query={searchQuery}
                                        selectedResult={selectedResult}
                                        onSelect={setSelectedResult}
                                    />
                                </div>
                                <div className="lg:col-span-5">
                                    <DocumentDetail result={selectedResult} />
                                </div>
                            </div>
                        </section>
                    )}

                    {hasSearchQuery && !isLoading && !error && totalVisibleCount === 0 && documentResults.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                            검색 결과가 없습니다.
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SearchResults;
