import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, RotateCcw } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';

const PROJECT_SORT_OPTIONS = [
    { value: 'updated_desc', label: '업데이트 ↓' },
    { value: 'updated_asc', label: '업데이트 ↑' },
    { value: 'name_asc', label: '이름 ↑' },
    { value: 'name_desc', label: '이름 ↓' },
];

const PROJECT_TYPE_OPTIONS = [
    { value: 'equipment', label: '설비' },
    { value: 'parts', label: '파츠' },
    { value: 'as', label: 'AS' },
];

const STAGE_OPTIONS = [
    { value: 'review', label: '검토' },
    { value: 'fabrication', label: '제작' },
    { value: 'installation', label: '설치' },
    { value: 'warranty', label: '워런티' },
    { value: 'closure', label: '종료' },
];

const DEFAULT_PROJECT_SORT = 'updated_desc';

function normalizeStage(value) {
    const stage = String(value || '').trim().toLowerCase();
    if (stage === 'progress') return 'fabrication';
    return stage;
}

function stageLabel(value) {
    const normalized = normalizeStage(value);
    const matched = STAGE_OPTIONS.find((item) => item.value === normalized);
    return matched?.label || value || '-';
}

function formatAmount(value) {
    const parsed = Number(value || 0);
    const number = Number.isFinite(parsed) ? parsed : 0;
    const manwon = number >= 0 ? Math.floor(number / 10000) : Math.ceil(number / 10000);
    return `${manwon.toLocaleString('ko-KR')}만원`;
}

function extractCustomerOptions(projectList) {
    const options = new Set();
    for (const project of Array.isArray(projectList) ? projectList : []) {
        const name = String(project?.customer_name || '').trim();
        if (name) options.add(name);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

function extractItems(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (Array.isArray(payload?.items)) {
        return payload.items;
    }
    return [];
}

function applyProjectTextFilters(projectList, filters) {
    const list = Array.isArray(projectList) ? projectList : [];
    const nameFilter = String(filters?.projectName || '').trim().toLowerCase();
    const codeFilter = String(filters?.projectCode || '').trim().toLowerCase();
    const onlyMine = Boolean(filters?.onlyMine);

    if (!nameFilter && !codeFilter && !onlyMine) return list;
    return list.filter((project) => {
        const projectName = String(project?.name || '').toLowerCase();
        const projectCode = String(project?.code || '').toLowerCase();

        if (onlyMine && !project?.is_mine) return false;
        if (nameFilter && !projectName.includes(nameFilter)) return false;
        if (codeFilter && !projectCode.includes(codeFilter)) return false;
        return true;
    });
}

function buildProjectFilterParams(filters) {
    const params = {};
    const projectName = (filters.projectName || '').trim();
    const projectCode = (filters.projectCode || '').trim();
    const customerName = (filters.customerName || '').trim();
    const managerName = (filters.managerName || '').trim();
    const projectTypes = Array.isArray(filters.projectTypes) ? filters.projectTypes.filter(Boolean) : [];
    const sortBy = (filters.sortBy || DEFAULT_PROJECT_SORT).trim();

    if (projectName) params.project_name = projectName;
    if (projectCode) params.project_code = projectCode;
    if (customerName) params.customer_name = customerName;
    if (managerName) params.manager_name = managerName;
    if (projectTypes.length) params.project_types = projectTypes.join(',');
    if (sortBy) params.sort_by = sortBy;
    return params;
}

function toggleMultiValue(list, value) {
    const source = Array.isArray(list) ? list : [];
    if (source.includes(value)) {
        return source.filter((item) => item !== value);
    }
    return [...source, value];
}

const BudgetManagement = () => {
    const emptyFilters = {
        projectName: '',
        projectCode: '',
        customerName: '',
        managerName: '',
        showAllProjects: false,
        projectTypes: [],
        stages: [],
        sortBy: DEFAULT_PROJECT_SORT,
    };

    const [projectPool, setProjectPool] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState(emptyFilters);
    const [customerOptions, setCustomerOptions] = useState([]);

    const loadProjects = useCallback(async (signal) => {
        setIsLoading(true);
        setError('');

        const normalizedFilters = {
            ...filters,
            onlyMine: !filters.showAllProjects,
        };

        try {
            const response = await api.get('/budget/projects', {
                params: {
                    ...buildProjectFilterParams(normalizedFilters),
                    page: 1,
                    page_size: 200,
                },
                signal,
            });

            const list = extractItems(response.data);
            setProjectPool(applyProjectTextFilters(list, normalizedFilters));
        } catch (err) {
            if (err?.code === 'ERR_CANCELED') return;
            setProjectPool([]);
            setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            loadProjects(controller.signal);
        }, 180);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadProjects]);

    useEffect(() => {
        let mounted = true;
        const loadCustomerOptions = async () => {
            try {
                const response = await api.get('/budget/projects', {
                    params: { page: 1, page_size: 200 },
                });
                if (!mounted) return;
                setCustomerOptions(extractCustomerOptions(extractItems(response.data)));
            } catch (_err) {
                if (!mounted) return;
                setCustomerOptions([]);
            }
        };
        loadCustomerOptions();
        return () => {
            mounted = false;
        };
    }, []);

    const filteredProjects = useMemo(() => {
        if (!filters.stages.length) return projectPool;
        const selected = new Set(filters.stages);
        return projectPool.filter((project) => selected.has(normalizeStage(project?.current_stage)));
    }, [projectPool, filters.stages]);

    const summary = useMemo(() => {
        return projectPool.reduce(
            (acc, project) => {
                const stage = normalizeStage(project?.current_stage);
                acc.projectCount += 1;
                if (stage === 'fabrication') {
                    acc.fabricationCount += 1;
                } else if (stage === 'installation') {
                    acc.installationCount += 1;
                } else if (stage === 'warranty') {
                    acc.warrantyCount += 1;
                } else if (stage === 'closure') {
                    acc.closureCount += 1;
                } else {
                    acc.reviewCount += 1;
                }
                return acc;
            },
            {
                projectCount: 0,
                reviewCount: 0,
                fabricationCount: 0,
                installationCount: 0,
                warrantyCount: 0,
                closureCount: 0,
            }
        );
    }, [projectPool]);

    const resetFilters = () => {
        setFilters(emptyFilters);
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-300 pb-8">
            <section className="rounded-xl border bg-card/70 p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        className="h-8 w-[180px] px-2.5 text-xs"
                        placeholder="프로젝트명"
                        value={filters.projectName}
                        onChange={(e) => setFilters((prev) => ({ ...prev, projectName: e.target.value }))}
                    />
                    <Input
                        className="h-8 w-[150px] px-2.5 text-xs"
                        placeholder="코드"
                        value={filters.projectCode}
                        onChange={(e) => setFilters((prev) => ({ ...prev, projectCode: e.target.value }))}
                    />
                    <Input
                        list="budget-customer-options"
                        className="h-8 w-[150px] px-2.5 text-xs"
                        placeholder="고객사"
                        value={filters.customerName}
                        onChange={(e) => setFilters((prev) => ({ ...prev, customerName: e.target.value }))}
                    />
                    <Input
                        className="h-8 w-[130px] px-2.5 text-xs"
                        placeholder="담당자"
                        value={filters.managerName}
                        onChange={(e) => setFilters((prev) => ({ ...prev, managerName: e.target.value }))}
                    />

                    <div className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-1">
                        {PROJECT_TYPE_OPTIONS.map((item) => {
                            const isActive = filters.projectTypes.includes(item.value);
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={cn(
                                        'h-6 rounded px-2 text-[10px] font-semibold transition-colors',
                                        isActive
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-muted'
                                    )}
                                    onClick={() =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            projectTypes: toggleMultiValue(prev.projectTypes, item.value),
                                        }))
                                    }
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>

                    <select
                        className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                        value={filters.sortBy}
                        onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value }))}
                    >
                        {PROJECT_SORT_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={filters.showAllProjects}
                        onClick={() => setFilters((prev) => ({ ...prev, showAllProjects: !prev.showAllProjects }))}
                        className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-[11px] font-semibold"
                    >
                        <span className="text-muted-foreground">전체 프로젝트 보기</span>
                        <span
                            className={cn(
                                'relative inline-flex h-4 w-8 items-center rounded-full transition-colors',
                                filters.showAllProjects ? 'bg-primary' : 'bg-muted'
                            )}
                        >
                            <span
                                className={cn(
                                    'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                    filters.showAllProjects ? 'translate-x-4' : 'translate-x-0.5'
                                )}
                            />
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={resetFilters}
                        title="필터 초기화"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted"
                    >
                        <RotateCcw size={14} />
                    </button>

                    <Link to="/project-management/projects/new" className="ml-auto">
                        <Button size="sm" className="h-8 gap-1.5 px-2.5 text-xs font-semibold">
                            <Plus size={14} />
                            프로젝트 생성
                        </Button>
                    </Link>
                </div>
            </section>

            <section className="rounded-xl border bg-card/60 p-2.5 shadow-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip
                        label="전체"
                        count={summary.projectCount}
                        active={filters.stages.length === 0}
                        onClick={() => setFilters((prev) => ({ ...prev, stages: [] }))}
                    />
                    <StatusChip
                        label="검토"
                        count={summary.reviewCount}
                        active={filters.stages.includes('review')}
                        onClick={() =>
                            setFilters((prev) => ({
                                ...prev,
                                stages: toggleMultiValue(prev.stages, 'review'),
                            }))
                        }
                    />
                    <StatusChip
                        label="제작"
                        count={summary.fabricationCount}
                        active={filters.stages.includes('fabrication')}
                        onClick={() =>
                            setFilters((prev) => ({
                                ...prev,
                                stages: toggleMultiValue(prev.stages, 'fabrication'),
                            }))
                        }
                    />
                    <StatusChip
                        label="설치"
                        count={summary.installationCount}
                        active={filters.stages.includes('installation')}
                        onClick={() =>
                            setFilters((prev) => ({
                                ...prev,
                                stages: toggleMultiValue(prev.stages, 'installation'),
                            }))
                        }
                    />
                    <StatusChip
                        label="워런티"
                        count={summary.warrantyCount}
                        active={filters.stages.includes('warranty')}
                        onClick={() =>
                            setFilters((prev) => ({
                                ...prev,
                                stages: toggleMultiValue(prev.stages, 'warranty'),
                            }))
                        }
                    />
                    <StatusChip
                        label="종료"
                        count={summary.closureCount}
                        active={filters.stages.includes('closure')}
                        onClick={() =>
                            setFilters((prev) => ({
                                ...prev,
                                stages: toggleMultiValue(prev.stages, 'closure'),
                            }))
                        }
                    />

                    <span className="ml-auto text-xs text-muted-foreground">
                        총 {filteredProjects.length}개
                    </span>
                </div>
            </section>

            {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
                </div>
            )}

            <section>
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {[...Array.from({ length: 10 })].map((_, index) => (
                            <div key={index} className="h-56 rounded-xl border bg-muted/40 animate-pulse" />
                        ))}
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-5 py-10 text-center bg-card">
                        <p className="text-sm text-muted-foreground">조건에 맞는 프로젝트가 없습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                        {filteredProjects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}
            </section>

            <datalist id="budget-customer-options">
                {customerOptions.map((name) => (
                    <option key={name} value={name} />
                ))}
            </datalist>
        </div>
    );
};

const StatusChip = ({ label, count, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors',
            active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
        )}
    >
        <span>{label}</span>
        <span className={cn('rounded px-1 text-[10px]', active ? 'bg-white/20' : 'bg-muted')}>{count}</span>
    </button>
);

const STAGE_ORDER = ['review', 'fabrication', 'installation', 'warranty', 'closure'];

const ProjectCard = ({ project }) => {
    const confirmedBudget = Number(project?.monitoring?.confirmed_budget_total ?? project?.totals?.grand_total ?? 0);
    const spentByParts = (
        Number(project?.monitoring?.actual_spent_material ?? 0)
        + Number(project?.monitoring?.actual_spent_labor ?? 0)
        + Number(project?.monitoring?.actual_spent_expense ?? 0)
    );
    const actualSpent = Math.max(Number(project?.monitoring?.actual_spent_total ?? 0), spentByParts, 0);
    const remaining = confirmedBudget - actualSpent;
    const currentStage = normalizeStage(project?.current_stage);
    const currentStageIndex = Math.max(STAGE_ORDER.indexOf(currentStage), 0);

    return (
        <article className="rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <Link
                        to={`/project-management/projects/${project.id}`}
                        className="block truncate text-sm font-bold leading-tight hover:text-primary"
                        title={project.name}
                    >
                        {project.name}
                    </Link>
                    <p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground">
                        {project.code || 'NO-CODE'}
                    </p>
                </div>
                <Link
                    to={`/project-management/projects/${project.id}`}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-primary"
                >
                    상세보기
                    <ArrowRight size={12} />
                </Link>
            </div>

            <div className="mt-2 flex items-center gap-1">
                <span className="inline-flex h-5 items-center rounded-full border bg-muted px-2 text-[10px] font-semibold">
                    {project.project_type_label || '미분류'}
                </span>
                <span className="inline-flex h-5 items-center rounded-full border bg-background px-2 text-[10px] font-semibold">
                    {project.current_stage_label || stageLabel(project.current_stage)}
                </span>
                {project?.is_mine && <span className="ml-auto h-2 w-2 rounded-full bg-primary" title="내 프로젝트" />}
            </div>

            <div className="mt-2 rounded-md border bg-muted/20 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">단계 모니터링</span>
                    <span className="font-semibold">{stageLabel(currentStage)}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                    {STAGE_ORDER.map((stage, index) => {
                        const isCompleted = index < currentStageIndex;
                        const isCurrent = index === currentStageIndex;
                        return (
                            <span
                                key={stage}
                                className={cn(
                                    'h-1.5 rounded-full',
                                    isCurrent
                                        ? 'bg-primary'
                                        : isCompleted
                                            ? 'bg-emerald-400/90'
                                            : 'bg-slate-200'
                                )}
                                title={stageLabel(stage)}
                            />
                        );
                    })}
                </div>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <div className="truncate">
                    <dt className="text-muted-foreground">담당자</dt>
                    <dd className="truncate font-medium">{project.manager_name || '미지정'}</dd>
                </div>
                <div className="truncate">
                    <dt className="text-muted-foreground">고객사</dt>
                    <dd className="truncate font-medium">{project.customer_name || '-'}</dd>
                </div>
            </dl>

            <div className="mt-2 rounded-md border bg-background/80 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">프로젝트 개요</p>
                <p className="mt-0.5 max-h-10 overflow-hidden text-[11px] leading-5 text-foreground/85">
                    {(project.description || '').trim() || '프로젝트 개요가 없습니다.'}
                </p>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border bg-muted/15 p-2">
                <Metric label="총 실행 예산" value={formatAmount(confirmedBudget)} />
                <Metric label="총 집행 금액" value={formatAmount(actualSpent)} />
                <Metric
                    label="잔액"
                    value={formatAmount(remaining)}
                    emphasize={remaining < 0 ? 'danger' : 'normal'}
                />
            </div>
        </article>
    );
};

const Metric = ({ label, value, emphasize = 'normal' }) => (
    <div className="min-w-0">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p
            className={cn(
                'mt-0.5 truncate text-[11px] font-semibold',
                emphasize === 'danger' ? 'text-destructive' : 'text-foreground'
            )}
            title={value}
        >
            {value}
        </p>
    </div>
);

export default BudgetManagement;
