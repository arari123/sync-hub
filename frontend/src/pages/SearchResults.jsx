import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Bell,
    ChevronLeft,
    ChevronRight,
    Database,
    Grid2x2,
    Loader2,
    Plus,
    Search,
    SlidersHorizontal,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { cn } from '../lib/utils';
import {
    computeGroupStats,
    formatYmd,
    normalizeSchedulePayload,
    parseYmd,
    ROOT_GROUP_IDS,
} from '../lib/scheduleUtils';
import ResultList from '../components/ResultList';
import DocumentDetail from '../components/DocumentDetail';
import GlobalSearchResultList from '../components/GlobalSearchResultList';
import UserMenu from '../components/UserMenu';
import { Input } from '../components/ui/Input';

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
const FILTER_TOGGLE_GROUP_CLASS = 'flex shrink-0 rounded-md border border-border bg-secondary/80 p-0.5';
const FILTER_TOGGLE_BUTTON_BASE_CLASS =
    'inline-flex h-6 items-center rounded px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const FILTER_TOGGLE_BUTTON_ACTIVE_CLASS = 'bg-primary text-primary-foreground shadow-sm';
const FILTER_TOGGLE_BUTTON_INACTIVE_CLASS = 'text-muted-foreground hover:bg-card hover:text-foreground';
const FILTER_CHIP_BASE_CLASS =
    'inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2 text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1';
const FILTER_CHIP_ACTIVE_CLASS = 'border-primary bg-primary text-primary-foreground shadow-sm';
const FILTER_CHIP_INACTIVE_CLASS =
    'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground';
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
const HOME_STAGE_TIMELINE = [
    { key: 'design', label: '설계', solidClass: 'bg-sky-500', softClass: 'bg-sky-200', textClass: 'text-sky-700' },
    { key: 'fabrication', label: '제작', solidClass: 'bg-indigo-500', softClass: 'bg-indigo-200', textClass: 'text-indigo-700' },
    { key: 'installation', label: '설치', solidClass: 'bg-emerald-500', softClass: 'bg-emerald-200', textClass: 'text-emerald-700' },
    { key: 'as', label: 'AS', solidClass: 'bg-amber-500', softClass: 'bg-amber-200', textClass: 'text-amber-700' },
];
const HOME_STAGE_TIMELINE_META = HOME_STAGE_TIMELINE;

function normalizeProjectId(value) {
    const projectId = Number(value || 0);
    if (!Number.isFinite(projectId) || projectId <= 0) return 0;
    return Math.floor(projectId);
}

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
        updates.push({ label: '안건', to: `/project-management/projects/${projectId}/agenda`, tone: 'amber' });
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

function formatYmdDot(value) {
    const text = String(value || '').trim();
    if (!text || text.length < 10) return '-';
    return `${text.slice(0, 4)}.${text.slice(5, 7)}.${text.slice(8, 10)}`;
}

function formatYmdRange(startYmd, endYmd) {
    const start = String(startYmd || '').trim();
    const end = String(endYmd || '').trim();
    if (start && end) {
        if (start === end) return formatYmdDot(start);
        return `${formatYmdDot(start)}~${formatYmdDot(end)}`;
    }
    if (start) return formatYmdDot(start);
    if (end) return formatYmdDot(end);
    return '-';
}

function addYearsToYmd(value, deltaYears = 1) {
    const parsed = parseYmd(value);
    if (!parsed) return '';
    const delta = Number.isFinite(Number(deltaYears)) ? Math.trunc(Number(deltaYears)) : 1;
    const next = new Date(Date.UTC(
        parsed.getUTCFullYear() + delta,
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
    ));
    return formatYmd(next);
}

function resolveStageStyle(project) {
    const stage = normalizeStage(project?.current_stage);
    return STAGE_STYLE_MAP[stage] || STAGE_STYLE_MAP.default;
}

function resolveTimelineProgressIndex(stageKey) {
    const stage = normalizeStage(stageKey);
    if (stage === 'fabrication') return 1;
    if (stage === 'installation') return 2;
    if (stage === 'warranty') return 3; // AS
    if (stage === 'closure') return HOME_STAGE_TIMELINE.length; // all done
    return 0; // review or unknown
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

function formatAgendaUpdatedDate(value) {
    const text = String(value || '').trim();
    if (!text || text.length < 10) return '--.--';
    const month = text.slice(5, 7);
    const day = text.slice(8, 10);
    if (!month || !day) return '--.--';
    return `${month}.${day}`;
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
    const [projectSearchResults, setProjectSearchResults] = useState([]);
    const [agendaSearchResults, setAgendaSearchResults] = useState([]);
    const [documentResults, setDocumentResults] = useState([]);
    const [selectedResult, setSelectedResult] = useState(null);
    const [showAllProjects, setShowAllProjects] = useState(false);
    const [projectPage, setProjectPage] = useState(1);
    const [projectFilters, setProjectFilters] = useState({
        stages: [],
        types: [],
    });
    const [projectFilterQuery, setProjectFilterQuery] = useState('');
    const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
    const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [projectAgendaMap, setProjectAgendaMap] = useState({});
    const [projectScheduleMap, setProjectScheduleMap] = useState({});

    const user = getCurrentUser();
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
        if (hasSearchQuery) return undefined;

        const controller = new AbortController();
        let active = true;

        const fetchHomeProjects = async () => {
            setIsLoading(true);
            setError('');
            setSelectedResult(null);
            setDocumentResults([]);
            setProjectSearchResults([]);
            setAgendaSearchResults([]);

            try {
                const projectListResult = await api.get('/budget/projects', {
                    params: { page: 1, page_size: 200, sort_by: 'updated_desc' },
                    signal: controller.signal,
                });

                const projectList = extractItems(projectListResult?.data);
                if (!active) return;
                setProjectPool(projectList);
                setProjectRows(projectList);
            } catch (err) {
                if (!active || err?.code === 'ERR_CANCELED') {
                    return;
                }
                setProjectPool([]);
                setProjectRows([]);
                setAgendaSearchResults([]);
                setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
            } finally {
                if (!active) return;
                setIsLoading(false);
            }
        };

        fetchHomeProjects();

        return () => {
            active = false;
            controller.abort();
        };
    }, [hasSearchQuery]);

    const globalEntityResults = useMemo(() => {
        const projects = (Array.isArray(projectSearchResults) ? projectSearchResults : []).map((item) => ({
            ...item,
            kind: 'project',
            score: Number(item?.score || 0),
        }));
        const agendas = (Array.isArray(agendaSearchResults) ? agendaSearchResults : []).map((item) => ({
            ...item,
            kind: 'agenda',
            score: Number(item?.score || 0),
        }));

        const merged = [...projects, ...agendas];
        const priority = { project: 0, agenda: 1 };

        merged.sort((a, b) => {
            const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
            if (scoreDiff !== 0) return scoreDiff;

            const kindDiff = (priority[a?.kind] ?? 99) - (priority[b?.kind] ?? 99);
            if (kindDiff !== 0) return kindDiff;

            const aId = a?.kind === 'agenda' ? Number(a?.thread_id || 0) : Number(a?.project_id || 0);
            const bId = b?.kind === 'agenda' ? Number(b?.thread_id || 0) : Number(b?.project_id || 0);
            return bId - aId;
        });

        return merged;
    }, [agendaSearchResults, projectSearchResults]);

    useEffect(() => {
        if (!hasSearchQuery) return undefined;

        const controller = new AbortController();
        let active = true;

        const fetchSearchResults = async () => {
            setIsLoading(true);
            setError('');
            setSelectedResult(null);
            setDocumentResults([]);
            setProjectSearchResults([]);
            setAgendaSearchResults([]);

            try {
                const documentSearchPromise = api.get('/documents/search', {
                    params: { q: searchQuery, page: 1, page_size: 10 },
                    signal: controller.signal,
                });

                const projectSearchPromise = api.get('/budget/projects/search', {
                    params: { q: searchQuery, limit: 30 },
                    signal: controller.signal,
                });

                const agendaSearchPromise = api.get('/agenda/threads/search', {
                    params: { q: searchQuery, limit: 30 },
                    signal: controller.signal,
                });

                const [documentSearchResult, projectSearchResult, agendaSearchResult] = await Promise.allSettled([
                    documentSearchPromise,
                    projectSearchPromise,
                    agendaSearchPromise,
                ]);

                const docs = documentSearchResult.status === 'fulfilled'
                    ? extractItems(documentSearchResult.value?.data)
                    : [];
                const projects = projectSearchResult.status === 'fulfilled' && Array.isArray(projectSearchResult.value?.data)
                    ? projectSearchResult.value.data
                    : [];
                const agendas = agendaSearchResult.status === 'fulfilled' && Array.isArray(agendaSearchResult.value?.data)
                    ? agendaSearchResult.value.data
                    : [];

                if (!active) return;
                setDocumentResults(docs);
                setProjectSearchResults(projects);
                setAgendaSearchResults(agendas);

                const hasAnyResult = (
                    documentSearchResult.status === 'fulfilled'
                    || projectSearchResult.status === 'fulfilled'
                    || agendaSearchResult.status === 'fulfilled'
                );

                if (!hasAnyResult) {
                    throw documentSearchResult.status === 'rejected'
                        ? documentSearchResult.reason
                        : projectSearchResult.status === 'rejected'
                            ? projectSearchResult.reason
                            : agendaSearchResult.reason;
                }

                const missingLabels = [];
                if (documentSearchResult.status !== 'fulfilled') missingLabels.push('문서');
                if (projectSearchResult.status !== 'fulfilled') missingLabels.push('프로젝트');
                if (agendaSearchResult.status !== 'fulfilled') missingLabels.push('안건');

                const rejected = [documentSearchResult, projectSearchResult, agendaSearchResult]
                    .filter((item) => item.status === 'rejected');
                if (missingLabels.length > 0 && rejected.length > 0) {
                    setError(
                        getErrorMessage(
                            rejected[0].reason,
                            `${missingLabels.join(', ')} 검색 결과를 불러오지 못했습니다. 나머지 결과는 표시 중입니다.`
                        )
                    );
                }
            } catch (err) {
                if (!active || err?.code === 'ERR_CANCELED') {
                    return;
                }
                setDocumentResults([]);
                setProjectSearchResults([]);
                setAgendaSearchResults([]);
                setError(getErrorMessage(err, '검색 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
            } finally {
                if (!active) return;
                setIsLoading(false);
            }
        };

        fetchSearchResults();

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

    useEffect(() => {
        setProjectPage(1);
    }, [projectRows, projectScope, projectFilterQuery, projectFilters.stages, projectFilters.types, showAllProjects]);

    const totalVisibleCount = visibleProjects.length;
    const totalProjectPages = Math.max(1, Math.ceil(totalVisibleCount / TABLE_PAGE_SIZE));

    useEffect(() => {
        setProjectPage((prev) => Math.max(1, Math.min(prev, totalProjectPages)));
    }, [totalProjectPages]);

    const pageStartIndex = (projectPage - 1) * TABLE_PAGE_SIZE;
    const pageEndIndex = pageStartIndex + TABLE_PAGE_SIZE;
    const tableProjects = useMemo(
        () => visibleProjects.slice(pageStartIndex, pageEndIndex),
        [pageEndIndex, pageStartIndex, visibleProjects]
    );
    const visibleProjectIds = useMemo(
        () => tableProjects.map((project) => normalizeProjectId(project?.id)).filter(Boolean),
        [tableProjects]
    );

    const visibleStartIndex = totalVisibleCount > 0 ? pageStartIndex + 1 : 0;
    const visibleEndIndex = Math.min(pageEndIndex, totalVisibleCount);
    const myProjectCount = projectPool.filter((project) => project?.is_mine !== false).length;
    const allProjectCount = projectPool.length;
    const totalProjectCount = showAllProjects ? allProjectCount : myProjectCount;
    const hasProjectPanel = !hasSearchQuery;

    useEffect(() => {
        if (hasSearchQuery) return undefined;
        if (visibleProjectIds.length <= 0) return undefined;

        const pendingProjectIds = visibleProjectIds.filter((projectId) => !(projectId in projectAgendaMap));
        if (pendingProjectIds.length <= 0) return undefined;

        let active = true;
        const controller = new AbortController();

        const fetchProjectAgendas = async () => {
            const responses = await Promise.all(
                pendingProjectIds.map(async (projectId) => {
                    try {
                        const response = await api.get(`/agenda/projects/${projectId}/threads`, {
                            params: { page: 1, per_page: 3, include_drafts: false },
                            signal: controller.signal,
                        });
                        const payload = response?.data || {};
                        return {
                            projectId,
                            value: {
                                items: Array.isArray(payload.items) ? payload.items : [],
                                total: Number(payload.total || 0),
                                fetchedAt: Date.now(),
                                hasError: false,
                            },
                        };
                    } catch (err) {
                        if (err?.code === 'ERR_CANCELED') {
                            return {
                                projectId,
                                value: {
                                    items: [],
                                    total: 0,
                                    fetchedAt: Date.now(),
                                    hasError: true,
                                },
                            };
                        }
                        return {
                            projectId,
                            value: {
                                items: [],
                                total: 0,
                                fetchedAt: Date.now(),
                                hasError: true,
                            },
                        };
                    }
                })
            );

            if (!active) return;

            setProjectAgendaMap((prev) => {
                const next = { ...prev };
                for (const item of responses) {
                    next[item.projectId] = item.value;
                }
                return next;
            });
        };

        fetchProjectAgendas();

        return () => {
            active = false;
            controller.abort();
        };
    }, [hasSearchQuery, projectAgendaMap, visibleProjectIds]);

    useEffect(() => {
        if (hasSearchQuery) return undefined;
        if (visibleProjectIds.length <= 0) return undefined;

        const pendingProjectIds = visibleProjectIds.filter((projectId) => !(projectId in projectScheduleMap));
        if (pendingProjectIds.length <= 0) return undefined;

        let active = true;
        const controller = new AbortController();

        const fetchProjectSchedules = async () => {
            const emptyStages = {
                design: { start: '', end: '' },
                fabrication: { start: '', end: '' },
                installation: { start: '', end: '' },
                as: { start: '', end: '' },
                closure: { start: '', end: '' },
            };

            const responses = await Promise.all(
                pendingProjectIds.map(async (projectId) => {
                    try {
                        const response = await api.get(`/budget/projects/${projectId}/schedule`, { signal: controller.signal });
                        const schedule = normalizeSchedulePayload(response?.data?.schedule || {});
                        const stats = computeGroupStats(schedule);
                        const designStats = stats.get(ROOT_GROUP_IDS.design) || {};
                        const fabricationStats = stats.get(ROOT_GROUP_IDS.fabrication) || {};
                        const installationStats = stats.get(ROOT_GROUP_IDS.installation) || {};

                        const installationEnd = String(installationStats?.last_end || '').trim();
                        const asStart = installationEnd;
                        const closureDate = addYearsToYmd(asStart, 1);

                        return {
                            projectId,
                            value: {
                                stages: {
                                    design: {
                                        start: String(designStats.first_start || '').trim(),
                                        end: String(designStats.last_end || '').trim(),
                                    },
                                    fabrication: {
                                        start: String(fabricationStats.first_start || '').trim(),
                                        end: String(fabricationStats.last_end || '').trim(),
                                    },
                                    installation: {
                                        start: String(installationStats.first_start || '').trim(),
                                        end: String(installationStats.last_end || '').trim(),
                                    },
                                    as: {
                                        start: asStart,
                                        end: closureDate,
                                    },
                                    closure: {
                                        start: closureDate,
                                        end: closureDate,
                                    },
                                },
                                fetchedAt: Date.now(),
                                hasError: false,
                            },
                        };
                    } catch (err) {
                        if (err?.code === 'ERR_CANCELED') {
                            return null;
                        }
                        return {
                            projectId,
                            value: {
                                stages: emptyStages,
                                fetchedAt: Date.now(),
                                hasError: true,
                            },
                        };
                    }
                })
            );

            if (!active) return;

            setProjectScheduleMap((prev) => {
                const next = { ...prev };
                for (const item of responses.filter(Boolean)) {
                    next[item.projectId] = item.value;
                }
                return next;
            });
        };

        fetchProjectSchedules();

        return () => {
            active = false;
            controller.abort();
        };
    }, [hasSearchQuery, projectScheduleMap, visibleProjectIds]);

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const nextQuery = inputQuery.trim();
        if (!nextQuery) {
            navigate('/home');
            return;
        }
        navigate(`/home?q=${encodeURIComponent(nextQuery)}`);
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
        <div className="app-shell min-h-screen bg-background text-foreground">
            <header className="topbar-shell h-16">
                <div className="mx-auto flex h-full max-w-[1640px] items-center gap-3 px-4 lg:px-6">
                    <Link to="/home" className="flex w-48 shrink-0 items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[11px] font-extrabold text-primary-foreground shadow-sm">S</div>
                        <div className="leading-tight">
                            <p className="text-sm font-extrabold tracking-tight text-foreground">Sync-Hub</p>
                            <p className="text-[10px] font-medium text-muted-foreground">Industrial Knowledge Workspace</p>
                        </div>
                    </Link>

                    <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0">
                        <label className="relative block">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                            <Input
                                type="text"
                                value={inputQuery}
                                onChange={(event) => setInputQuery(event.target.value)}
                                placeholder="프로젝트, 안건, 사양, PDF, EXCEL 데이터를 자연어로 검색"
                                className="h-10 w-full rounded-full border-border/90 bg-card/85 pl-11 pr-4 text-sm"
                            />
                        </label>
                    </form>

                    <div className="w-40 shrink-0 flex items-center justify-end gap-2">
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary">
                            <Bell className="h-4 w-4" />
                        </button>
                        <div className="relative z-[70]" ref={quickMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsQuickMenuOpen((prev) => !prev)}
                                className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-primary"
                                aria-label="빠른 메뉴"
                                aria-expanded={isQuickMenuOpen}
                            >
                                <Grid2x2 className="h-4 w-4" />
                            </button>

                            {isQuickMenuOpen && (
                                <div className="app-surface-soft absolute right-0 top-11 z-[90] w-60 p-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <Link
                                            to="/project-management/projects/new"
                                            onClick={() => setIsQuickMenuOpen(false)}
                                            className="flex flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-foreground transition-colors hover:bg-secondary"
                                        >
                                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                                <Plus className="h-4 w-4" />
                                            </span>
                                            <span className="text-xs font-semibold text-center">새 프로젝트 생성</span>
                                        </Link>
                                        <button
                                            type="button"
                                            className="flex cursor-not-allowed flex-col items-center gap-1 rounded-xl border border-border/70 bg-card/65 p-3 text-muted-foreground/70"
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
                        <UserMenu user={user} />
                    </div>
                </div>
            </header>

            <div className="border-b border-border/80 bg-card/65 backdrop-blur">
                <div className="mx-auto flex h-10 max-w-[1640px] items-center px-4 lg:px-6">
                    <nav
                        aria-label="현재 경로"
                        className="min-w-0 flex items-center gap-1.5 text-sm text-muted-foreground"
                    >
                        <Link to="/home" className="font-medium hover:text-primary">
                            메인
                        </Link>
                        <span>/</span>
                        <span className="font-semibold text-foreground/90">글로벌 검색</span>
                    </nav>
                </div>
            </div>

            <div className="mx-auto min-h-[calc(100vh-6.5rem)] max-w-[1640px]">
                <main className="app-enter overflow-y-auto space-y-4 p-4 lg:p-6">
                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {hasSearchQuery && (
                        <section className="rounded-2xl border border-border bg-card p-4">
                            <div className="mx-auto max-w-[980px]">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-sm font-semibold text-foreground">검색 결과</h2>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            검색어: <span className="font-medium text-foreground/80">{searchQuery}</span>
                                        </p>
                                    </div>
                                    {!isLoading && (
                                        <span className="text-xs text-muted-foreground">총 {globalEntityResults.length}건</span>
                                    )}
                                </div>

                                {isLoading ? (
                                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        검색 결과를 불러오는 중입니다.
                                    </div>
                                ) : (
                                    <GlobalSearchResultList results={globalEntityResults} query={searchQuery} />
                                )}
                            </div>
                        </section>
                    )}

                    {hasProjectPanel && (
                        <section className="app-surface-soft px-3 py-2">
                            <div className="flex items-center justify-between lg:hidden">
                                <button
                                    type="button"
                                    onClick={() => setIsMobileFilterOpen((prev) => !prev)}
                                    aria-expanded={isMobileFilterOpen}
                                    className={cn(
                                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
                                        isMobileFilterOpen
                                            ? 'border-primary/40 bg-primary/10 text-primary'
                                            : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                    )}
                                >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    {isMobileFilterOpen ? '필터 닫기' : '필터'}
                                </button>
                                <span className="text-[11px] font-medium text-muted-foreground">
                                    {showAllProjects ? `전체 ${allProjectCount}건` : `내 프로젝트 ${myProjectCount}건`}
                                </span>
                            </div>

                            <div className="hidden lg:flex lg:min-h-8 lg:items-center lg:gap-2">
                                <div className={FILTER_TOGGLE_GROUP_CLASS}>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllProjects(false)}
                                        className={cn(
                                            FILTER_TOGGLE_BUTTON_BASE_CLASS,
                                            !showAllProjects
                                                ? FILTER_TOGGLE_BUTTON_ACTIVE_CLASS
                                                : FILTER_TOGGLE_BUTTON_INACTIVE_CLASS
                                        )}
                                    >
                                        내프로젝트
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllProjects(true)}
                                        className={cn(
                                            FILTER_TOGGLE_BUTTON_BASE_CLASS,
                                            showAllProjects
                                                ? FILTER_TOGGLE_BUTTON_ACTIVE_CLASS
                                                : FILTER_TOGGLE_BUTTON_INACTIVE_CLASS
                                        )}
                                    >
                                        전체프로젝트
                                    </button>
                                </div>

                                <div className="relative w-52 shrink-0">
                                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                                    <Input
                                        type="text"
                                        value={projectFilterQuery}
                                        onChange={(event) => setProjectFilterQuery(event.target.value)}
                                        placeholder="프로젝트 검색"
                                        className="h-8 w-full rounded-md bg-background px-2 pr-2 pl-7 text-xs"
                                    />
                                </div>

                                <div className="h-5 w-px shrink-0 bg-slate-200" />

                                <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
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

                                <div className="h-5 w-px shrink-0 bg-slate-200" />

                                <div className="min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
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

                            <div className={cn('mt-2 space-y-2 lg:hidden', !isMobileFilterOpen && 'hidden')}>
                                <div className="flex rounded-md border border-border bg-secondary/80 p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowAllProjects(false)}
                                        className={cn(
                                            `${FILTER_TOGGLE_BUTTON_BASE_CLASS} flex-1 justify-center`,
                                            !showAllProjects
                                                ? FILTER_TOGGLE_BUTTON_ACTIVE_CLASS
                                                : FILTER_TOGGLE_BUTTON_INACTIVE_CLASS
                                        )}
                                    >
                                        내프로젝트
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllProjects(true)}
                                        className={cn(
                                            `${FILTER_TOGGLE_BUTTON_BASE_CLASS} flex-1 justify-center`,
                                            showAllProjects
                                                ? FILTER_TOGGLE_BUTTON_ACTIVE_CLASS
                                                : FILTER_TOGGLE_BUTTON_INACTIVE_CLASS
                                        )}
                                    >
                                        전체프로젝트
                                    </button>
                                </div>

                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
                                    <Input
                                        type="text"
                                        value={projectFilterQuery}
                                        onChange={(event) => setProjectFilterQuery(event.target.value)}
                                        placeholder="프로젝트 검색"
                                        className="h-8 w-full rounded-md bg-background px-2 pr-2 pl-7 text-xs"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-500">단계 필터</p>
                                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
                                </div>

                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-500">유형 필터</p>
                                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
                            </div>
                        </section>
                    )}

                    {hasProjectPanel ? (
                        <section className="space-y-3">
                            {isLoading ? (
                                <div className="app-surface-soft px-4 py-16 text-center">
                                    <div className="inline-flex items-center gap-2 text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        데이터를 불러오는 중입니다.
                                    </div>
                                </div>
                            ) : tableProjects.length === 0 ? (
                                <div className="app-surface-soft px-4 py-16 text-center text-sm text-slate-500">
                                    필터 조건에 맞는 프로젝트가 없습니다.
                                </div>
                            ) : (
                                tableProjects.map((project) => {
                                    const normalizedProjectId = normalizeProjectId(project?.id);
                                    const updateLinks = buildUpdateLinks(project);
                                    const updateLinkMap = new Map(updateLinks.map((item) => [item.label, item]));
                                    const signalUpdates = PROJECT_SIGNAL_LABELS.map((label) => ({
                                        label,
                                        ...updateLinkMap.get(label),
                                    }));
                                    const agendaSummary = projectAgendaMap[normalizedProjectId];
                                    const agendaItems = Array.isArray(agendaSummary?.items)
                                        ? agendaSummary.items.slice(0, 3)
                                        : [];
                                    const agendaCount = Number(agendaSummary?.total || agendaItems.length || 0);
                                    const isAgendaLoading = !agendaSummary;
                                    const scheduleSummary = projectScheduleMap[normalizedProjectId];
                                    const isScheduleLoading = !scheduleSummary;
                                    const scheduleStages = scheduleSummary?.stages || {};
                                    const projectStageKey = normalizeStage(project?.current_stage);
                                    const timelineActiveIndex = resolveTimelineProgressIndex(projectStageKey);
                                    const isReviewStage = projectStageKey === 'review';
                                    const isClosureStage = projectStageKey === 'closure';
                                    const createdDateLabel = formatYmdDot(project?.created_at);
                                    const closureDateLabel = (() => {
                                        if (isScheduleLoading) return '...';
                                        if (scheduleSummary?.hasError) return '-';
                                        return formatYmdDot(scheduleStages?.closure?.end || scheduleStages?.as?.end);
                                    })();
                                    const stageStyle = resolveStageStyle(project);
                                    const budget = resolveBudgetSnapshot(project);
                                    const coverImage = project.cover_image_display_url || project.cover_image_fallback_url || '';
                                    return (
                                        <article
                                            key={`project-row-${project.id}`}
                                            className="app-surface-soft p-3 transition-all hover:border-sky-200"
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
                                                            <span className="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-rose-600">
                                                                NEW UPDATE
                                                            </span>
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

                                                    <div className="mb-1 flex items-center justify-between px-1">
                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">단계 일정</span>
                                                        <span className={cn('text-[10px] font-bold', stageStyle.statusTextClass)}>
                                                            {resolveProjectStatusLabel(project)}
                                                        </span>
                                                    </div>

                                                    <div className="relative mb-1">
                                                        <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
                                                            <div className="flex h-full divide-x divide-white/70">
                                                                {HOME_STAGE_TIMELINE.map((item, index) => {
                                                                    const isDone = timelineActiveIndex > index;
                                                                    const isActive = timelineActiveIndex === index;
                                                                    const barClass = isDone || isActive ? item.solidClass : item.softClass;
                                                                    const opacityClass = isActive ? 'opacity-100' : isDone ? 'opacity-90' : 'opacity-55';
                                                                    return (
                                                                        <div
                                                                            key={`timeline-bar-${project.id}-${item.key}`}
                                                                            className={cn('h-full flex-1 transition-colors', barClass, opacityClass)}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {isReviewStage && (
                                                            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-full -translate-x-1/2 -translate-y-1/2 px-2">
                                                                <div className="mx-auto w-fit max-w-full">
                                                                    <div className="relative inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-sky-200/70 bg-gradient-to-r from-sky-50/95 via-white/90 to-emerald-50/90 px-2.5 py-1 text-[10px] font-extrabold text-slate-800 shadow-[0_16px_34px_-26px_hsl(220_40%_15%/0.62)] backdrop-blur">
                                                                        <span className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 shadow-[0_0_0_2px_hsl(0_0%_100%/0.8)]" />
                                                                        <span className="shrink-0 tracking-[0.08em] text-sky-700">검토</span>
                                                                        <span className="text-slate-300">|</span>
                                                                        <span className="truncate font-mono text-slate-600">생성 {createdDateLabel}</span>
                                                                        <span className="pointer-events-none absolute -inset-px -z-10 rounded-full bg-white/35 blur-md" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {isClosureStage && (
                                                            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-full -translate-x-1/2 -translate-y-1/2 px-2">
                                                                <div className="mx-auto w-fit max-w-full">
                                                                    <div className="relative inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-slate-200/80 bg-gradient-to-r from-slate-50/95 via-white/90 to-slate-100/90 px-2.5 py-1 text-[10px] font-extrabold text-slate-800 shadow-[0_16px_34px_-26px_hsl(220_40%_15%/0.62)] backdrop-blur">
                                                                        <span className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-slate-500 to-slate-700 shadow-[0_0_0_2px_hsl(0_0%_100%/0.8)]" />
                                                                        <span className="shrink-0 tracking-[0.08em] text-slate-700">종료</span>
                                                                        <span className="text-slate-300">|</span>
                                                                        <span className="truncate font-mono text-slate-600">종료일 {closureDateLabel}</span>
                                                                        <span className="pointer-events-none absolute -inset-px -z-10 rounded-full bg-white/35 blur-md" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-4 gap-1 px-1">
                                                        {HOME_STAGE_TIMELINE_META.map((item, index) => {
                                                            const stageDates = scheduleStages[item.key] || {};
                                                            const isDone = timelineActiveIndex > index;
                                                            const isActive = timelineActiveIndex === index;
                                                            const isUpcoming = !isDone && !isActive;
                                                            const labelClass = isUpcoming ? 'text-slate-400' : item.textClass;

                                                            let startLabel = '...';
                                                            let endLabel = '...';
                                                            if (!isScheduleLoading) {
                                                                if (scheduleSummary?.hasError) {
                                                                    startLabel = '-';
                                                                    endLabel = '-';
                                                                } else {
                                                                    startLabel = formatYmdDot(stageDates.start);
                                                                    endLabel = formatYmdDot(stageDates.end);
                                                                }
                                                            }

                                                            return (
                                                                <div key={`timeline-meta-${project.id}-${item.key}`} className="min-w-0 text-center">
                                                                    <p className={cn('truncate text-[9px] font-extrabold leading-none tracking-wide', labelClass)}>
                                                                        {item.label}
                                                                    </p>
                                                                    <p className={cn(
                                                                        'mt-0.5 font-mono text-[9px] leading-none tabular-nums',
                                                                        isUpcoming ? 'text-slate-400' : 'text-slate-600'
                                                                    )}
                                                                    >
                                                                        {startLabel}
                                                                    </p>
                                                                    <p className={cn(
                                                                        'mt-0.5 font-mono text-[9px] leading-none tabular-nums',
                                                                        isUpcoming ? 'text-slate-400' : 'text-slate-600'
                                                                    )}
                                                                    >
                                                                        {endLabel}
                                                                    </p>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-200 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                                                        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50/70 p-1.5">
                                                            <div className="mb-1.5 flex items-center justify-between">
                                                                <div className="flex items-center gap-1.5">
                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">최신 안건</p>
                                                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold text-sky-600">
                                                                        {isAgendaLoading ? '...' : `${agendaCount}건`}
                                                                    </span>
                                                                </div>
                                                            <Link
                                                                to={`/project-management/projects/${project.id}/agenda`}
                                                                className="text-[10px] font-semibold text-sky-600 hover:underline"
                                                            >
                                                                보기
                                                            </Link>
                                                        </div>

                                                        <div className="space-y-1">
                                                            {isAgendaLoading && (
                                                                <div className="rounded-lg border border-slate-200 bg-white/80 px-2 py-2 text-[10px] font-medium text-slate-500">
                                                                    최신 안건을 불러오는 중입니다.
                                                                </div>
                                                            )}
                                                            {!isAgendaLoading && agendaItems.length === 0 && (
                                                                <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-2 text-[10px] font-medium text-slate-500">
                                                                    등록된 안건이 없습니다.
                                                                </div>
                                                            )}
                                                            {!isAgendaLoading && agendaItems.map((agendaItem, index) => {
                                                                const agendaTitle = agendaItem.latest_title
                                                                    || agendaItem.root_title
                                                                    || agendaItem.title
                                                                    || '제목 없음';
                                                                const agendaUpdatedDate = formatAgendaUpdatedDate(
                                                                    agendaItem.last_updated_at || agendaItem.updated_at || project.updated_at
                                                                );
                                                                const agendaDetailPath = agendaItem?.id
                                                                    ? `/project-management/projects/${project.id}/agenda/${agendaItem.id}`
                                                                    : `/project-management/projects/${project.id}/agenda`;
                                                                return (
                                                                    <Link
                                                                        key={`${project.id}-agenda-${agendaItem.id || index}`}
                                                                        to={agendaDetailPath}
                                                                        className={cn(
                                                                            'group relative block overflow-hidden rounded-lg border px-2 py-1 transition-all',
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
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className="min-w-0 truncate text-[10px] font-semibold text-slate-700">
                                                                                {agendaTitle}
                                                                            </p>
                                                                            <span className="shrink-0 text-[9px] font-mono text-slate-400">
                                                                                {agendaUpdatedDate}
                                                                            </span>
                                                                        </div>
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })
                            )}

                            {totalVisibleCount > TABLE_PAGE_SIZE && (
                                <div className="app-surface-soft flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                    <span className="text-[11px] font-semibold text-slate-500">
                                        페이지 {projectPage} / {totalProjectPages}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setProjectPage((prev) => Math.max(1, prev - 1))}
                                            disabled={projectPage <= 1}
                                            className={cn(
                                                'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
                                                projectPage <= 1
                                                    ? 'cursor-not-allowed border-border bg-background text-muted-foreground/40'
                                                    : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                            )}
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                            이전
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProjectPage((prev) => Math.min(totalProjectPages, prev + 1))}
                                            disabled={projectPage >= totalProjectPages}
                                            className={cn(
                                                'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
                                                projectPage >= totalProjectPages
                                                    ? 'cursor-not-allowed border-border bg-background text-muted-foreground/40'
                                                    : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground'
                                            )}
                                        >
                                            다음
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
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

                    {hasSearchQuery && !isLoading && !error && globalEntityResults.length === 0 && documentResults.length === 0 && (
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
