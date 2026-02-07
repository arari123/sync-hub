import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';

const PROJECT_SORT_OPTIONS = [
    { value: 'updated_desc', label: '업데이트 내림차순' },
    { value: 'updated_asc', label: '업데이트 오름차순' },
    { value: 'name_desc', label: '이름 내림차순' },
    { value: 'name_asc', label: '이름 오름차순' },
];

const DEFAULT_PROJECT_SORT = 'updated_desc';

function formatAmount(value) {
    const number = Number(value || 0);
    return `${number.toLocaleString('ko-KR')}원`;
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
    const stages = Array.isArray(filters.stages) ? filters.stages.filter(Boolean) : [];
    const sortBy = (filters.sortBy || DEFAULT_PROJECT_SORT).trim();

    if (projectName) params.project_name = projectName;
    if (projectCode) params.project_code = projectCode;
    if (customerName) params.customer_name = customerName;
    if (managerName) params.manager_name = managerName;
    if (projectTypes.length) params.project_types = projectTypes.join(',');
    if (stages.length) params.stages = stages.join(',');
    if (sortBy) params.sort_by = sortBy;
    return params;
}

function stageBadgeClass(stage) {
    const base = 'px-3 py-1 rounded-full text-sm font-extrabold border transition-colors';
    // Simplified to use a uniform slate theme for all stages as requested
    return `${base} border-slate-200 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700`;
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
        onlyMine: true,
        projectTypes: [],
        stages: [],
        sortBy: DEFAULT_PROJECT_SORT,
    };

    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [draftFilters, setDraftFilters] = useState(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
    const [customerOptions, setCustomerOptions] = useState([]);

    const loadProjects = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const response = await api.get('/budget/projects', {
                params: {
                    ...buildProjectFilterParams(appliedFilters),
                    page: 1,
                    page_size: 200,
                },
            });
            const list = extractItems(response.data);
            setProjects(applyProjectTextFilters(list, appliedFilters));
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, [appliedFilters]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    useEffect(() => {
        const loadCustomerOptions = async () => {
            try {
                const response = await api.get('/budget/projects', {
                    params: { page: 1, page_size: 200 },
                });
                setCustomerOptions(extractCustomerOptions(extractItems(response.data)));
            } catch (_err) {
                setCustomerOptions([]);
            }
        };
        loadCustomerOptions();
    }, []);

    const applyFilters = (event) => {
        event.preventDefault();
        setAppliedFilters({ ...draftFilters });
    };

    const toggleOnlyMine = () => {
        setDraftFilters((prev) => {
            const next = { ...prev, onlyMine: !prev.onlyMine };
            setAppliedFilters(next);
            return next;
        });
    };

    const resetFilters = () => {
        setDraftFilters(emptyFilters);
        setAppliedFilters(emptyFilters);
    };

    const summary = projects.reduce(
        (acc, project) => {
            acc.projectCount += 1;
            if (project?.current_stage === 'fabrication' || project?.current_stage === 'progress') {
                acc.fabricationCount += 1;
            } else if (project?.current_stage === 'installation') {
                acc.installationCount += 1;
            } else if (project?.current_stage === 'warranty') {
                acc.warrantyCount += 1;
            } else if (project?.current_stage === 'closure') {
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

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <BudgetBreadcrumb items={[{ label: '프로젝트 관리' }]} />
                    <h1 className="text-3xl font-bold tracking-tight mt-2">프로젝트 관리</h1>
                    <p className="text-muted-foreground mt-1">실행 예산 통합 모니터링 및 프로젝트 진행 현황</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link to="/project-management/projects/new">
                        <Button className="gap-2">
                            <Plus size={18} />
                            프로젝트 생성
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryCard
                    label="전체"
                    count={summary.projectCount}
                    color="indigo"
                    isActive={appliedFilters.stages.length === 0}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: [] }))}
                />
                <SummaryCard
                    label="검토"
                    count={summary.reviewCount}
                    color="slate"
                    isActive={appliedFilters.stages.includes('review')}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: toggleMultiValue(p.stages, 'review') }))}
                />
                <SummaryCard
                    label="제작"
                    count={summary.fabricationCount}
                    color="orange"
                    isActive={appliedFilters.stages.includes('fabrication')}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: toggleMultiValue(p.stages, 'fabrication') }))}
                />
                <SummaryCard
                    label="설치"
                    count={summary.installationCount}
                    color="blue"
                    isActive={appliedFilters.stages.includes('installation')}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: toggleMultiValue(p.stages, 'installation') }))}
                />
                <SummaryCard
                    label="워런티"
                    count={summary.warrantyCount}
                    color="violet"
                    isActive={appliedFilters.stages.includes('warranty')}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: toggleMultiValue(p.stages, 'warranty') }))}
                />
                <SummaryCard
                    label="종료"
                    count={summary.closureCount}
                    color="emerald"
                    isActive={appliedFilters.stages.includes('closure')}
                    onClick={() => setAppliedFilters(p => ({ ...p, stages: toggleMultiValue(p.stages, 'closure') }))}
                />
            </div>

            {/* Filter Section */}
            <section className="bg-card border rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">상세 필터</h2>
                    <div className="flex gap-2">
                        <Button
                            variant={draftFilters.onlyMine ? 'outline' : 'default'}
                            size="sm"
                            className="h-8 text-xs px-3"
                            onClick={toggleOnlyMine}
                        >
                            {draftFilters.onlyMine ? '전체 프로젝트 보기' : '내 프로젝트만 보기'}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={resetFilters}>초기화</Button>
                        <Button size="sm" type="submit" form="budget-filter-form" className="h-8 text-xs px-3">필터 적용</Button>
                    </div>
                </div>
                <form id="budget-filter-form" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" onSubmit={applyFilters}>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 px-1">프로젝트 명</label>
                        <input
                            className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="이름 입력"
                            value={draftFilters.projectName}
                            onChange={(e) => setDraftFilters(p => ({ ...p, projectName: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 px-1">프로젝트 코드</label>
                        <input
                            className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="코드 입력"
                            value={draftFilters.projectCode}
                            onChange={(e) => setDraftFilters(p => ({ ...p, projectCode: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 px-1">고객사</label>
                        <input
                            list="budget-customer-options"
                            className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="고객사 선택/입력"
                            value={draftFilters.customerName}
                            onChange={(e) => setDraftFilters(p => ({ ...p, customerName: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 px-1">담당자</label>
                        <input
                            className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="성함 입력"
                            value={draftFilters.managerName}
                            onChange={(e) => setDraftFilters(p => ({ ...p, managerName: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground/80 px-1">정렬 기준</label>
                        <select
                            className="w-full h-9 rounded-lg border bg-background px-3 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none"
                            value={draftFilters.sortBy}
                            onChange={(e) => setDraftFilters(p => ({ ...p, sortBy: e.target.value }))}
                        >
                            {PROJECT_SORT_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </select>
                    </div>
                </form>
            </section>

            {/* Error Message */}
            {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    {error}
                </div>
            )}

            {/* Project List */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">프로젝트 모니터링</h2>
                    <span className="text-sm text-muted-foreground">총 {projects.length}개 검색됨</span>
                </div>

                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-2xl bg-muted animate-pulse" />)}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-12 text-center bg-card">
                        <p className="text-muted-foreground mb-4">등록된 프로젝트가 없습니다.</p>
                        <Link to="/project-management/projects/new">
                            <Button variant="outline">프로젝트 생성하기</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => (
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

const SummaryCard = ({ label, count, color, isActive, onClick }) => {
    // Standardized to Slate-based theme for all cards as requested
    const containerClasses = isActive
        ? 'bg-slate-700 text-white border-slate-700 shadow-md shadow-slate-200'
        : 'bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-200';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "p-3 rounded-xl border text-left transition-all duration-200",
                containerClasses
            )}
        >
            <p className={cn("text-[10px] font-bold uppercase tracking-tight mb-0.5", isActive ? "text-white/80" : "text-muted-foreground")}>{label}</p>
            <p className="text-xl font-extrabold tracking-tighter">{count}</p>
        </button>
    );
};

const ProjectCard = ({ project }) => {
    const confirmedBudget = Number(project?.monitoring?.confirmed_budget_total ?? project?.totals?.grand_total ?? 0);
    const actualSpent = Number(project?.monitoring?.actual_spent_total ?? 0);
    const progress = confirmedBudget > 0 ? Math.min((actualSpent / confirmedBudget) * 100, 100) : 0;

    return (
        <article className="group bg-card border rounded-2xl p-5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col h-full">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-base truncate group-hover:text-primary transition-colors">{project.name}</h3>
                        {project?.is_mine && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="내 프로젝트" />}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">#{project.code || 'NO-CODE'}</p>
                </div>
                <span className={stageBadgeClass(project.current_stage)}>
                    {project.current_stage_label}
                </span>
            </div>

            <div className="space-y-4 mb-6 flex-1">
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-secondary/30 p-2 rounded-lg">
                        <p className="text-[10px] text-muted-foreground font-medium mb-0.5">담당자</p>
                        <p className="text-xs font-semibold">{project.manager_name || '미지정'}</p>
                    </div>
                    <div className="bg-secondary/30 p-2 rounded-lg">
                        <p className="text-[10px] text-muted-foreground font-medium mb-0.5">고객사</p>
                        <p className="text-xs font-semibold truncate">{project.customer_name || '-'}</p>
                    </div>
                    <div className="bg-secondary/30 p-2 rounded-lg">
                        <p className="text-[10px] text-muted-foreground font-medium mb-0.5">프로젝트 종류</p>
                        <p className="text-xs font-semibold truncate">{project.project_type_label || '-'}</p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-muted-foreground">집행률</span>
                        <span className={progress > 90 ? 'text-destructive' : 'text-primary'}>{progress.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${progress > 90 ? 'bg-destructive' : 'bg-primary'}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-[10px] text-muted-foreground font-medium">총 실행 예산</p>
                        <p className="text-sm font-bold">{formatAmount(confirmedBudget)}</p>
                    </div>
                    <Link to={`/project-management/projects/${project.id}`}>
                        <Button size="sm" variant="ghost" className="h-8 text-[11px] gap-1 hover:bg-primary/10 hover:text-primary">
                            상세보기 <ArrowRight size={12} />
                        </Button>
                    </Link>
                </div>
            </div>
        </article>
    );
};

export default BudgetManagement;
