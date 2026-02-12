import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    CircleDollarSign,
    CloudCog,
    Coins,
    Plus,
    Save,
    Search,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    UserRoundCog,
    Wallet,
    X,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';
import ProjectContextNav from '../components/ProjectContextNav';

function toNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function parseEquipmentNames(value) {
    const raw = String(value || '');
    return Array.from(
        new Set(
            raw
                .split(/\r?\n|,/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}

const EMPTY_EDIT_FORM = {
    name: '',
    code: '',
    project_type: 'equipment',
    current_stage: 'review',
    customer_name: '',
    installation_site: '',
    business_trip_distance_km: '',
    manager_user_id: '',
    description: '',
    cover_image_url: '',
};

const SECTION_ITEMS = [
    { id: 'general', label: '기본 설정', icon: SlidersHorizontal },
    { id: 'budget-rules', label: '예산 규칙', icon: Wallet },
    { id: 'personnel', label: '인력 관리', icon: UserRoundCog },
    { id: 'permissions', label: '권한 제어', icon: ShieldCheck },
    { id: 'unit-costs', label: '단가/옵션', icon: Coins },
    { id: 'integration', label: '시스템 연동', icon: CloudCog },
];

const BudgetProjectInfoEdit = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [managerOptions, setManagerOptions] = useState([]);
    const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
    const [equipmentNames, setEquipmentNames] = useState([]);
    const [equipmentDraft, setEquipmentDraft] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveError, setSaveError] = useState('');

    const [activeSection, setActiveSection] = useState('general');
    const [settingSearch, setSettingSearch] = useState('');
    const [initialSnapshot, setInitialSnapshot] = useState(null);

    const contentRef = useRef(null);
    const sectionRefs = useRef({});

    useEffect(() => {
        const load = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const versionsResp = await api.get(`/budget/projects/${projectId}/versions`);
                const payload = versionsResp?.data || {};
                const currentProject = payload.project || null;
                setProject(currentProject);
                const currentVersion = (payload.versions || []).find((item) => item.is_current) || (payload.versions || [])[0] || null;
                setVersion(currentVersion);

                let loadedEditForm = { ...EMPTY_EDIT_FORM };
                if (currentProject) {
                    loadedEditForm = {
                        name: currentProject.name || '',
                        code: currentProject.code || '',
                        project_type: currentProject.project_type || 'equipment',
                        current_stage: currentProject.current_stage || 'review',
                        customer_name: currentProject.customer_name || '',
                        installation_site: currentProject.installation_site || '',
                        business_trip_distance_km: String(toNumber(currentProject.business_trip_distance_km) || ''),
                        manager_user_id: currentProject.manager_user_id ? String(currentProject.manager_user_id) : '',
                        description: currentProject.description || '',
                        cover_image_url: currentProject.cover_image_url || '',
                    };
                    setEditForm(loadedEditForm);
                }

                let loadedEquipmentNames = [];
                if (currentVersion?.id) {
                    const equipmentResp = await api.get(`/budget/versions/${currentVersion.id}/equipments`);
                    const itemList = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
                    loadedEquipmentNames = itemList
                        .map((item) => String(item?.equipment_name || '').trim())
                        .filter(Boolean);
                    loadedEquipmentNames = Array.from(new Set(loadedEquipmentNames));
                    setEquipmentNames(loadedEquipmentNames);
                } else {
                    setEquipmentNames([]);
                }

                setInitialSnapshot({
                    editForm: loadedEditForm,
                    equipmentNames: loadedEquipmentNames,
                });
            } catch (err) {
                setError(getErrorMessage(err, '프로젝트 기본 정보를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [projectId]);

    useEffect(() => {
        if (!project?.can_edit) {
            setManagerOptions([]);
            return;
        }
        let mounted = true;
        const loadManagers = async () => {
            try {
                const response = await api.get('/auth/users');
                if (!mounted) return;
                const items = Array.isArray(response?.data) ? response.data : [];
                setManagerOptions(items);
            } catch (_err) {
                if (!mounted) return;
                setManagerOptions([]);
            }
        };
        loadManagers();
        return () => {
            mounted = false;
        };
    }, [project?.can_edit]);

    useEffect(() => {
        const container = contentRef.current;
        if (!container) return;

        const handleScroll = () => {
            let currentId = SECTION_ITEMS[0].id;
            SECTION_ITEMS.forEach((item) => {
                const target = sectionRefs.current[item.id];
                if (!target) return;
                if (container.scrollTop >= target.offsetTop - 120) {
                    currentId = item.id;
                }
            });
            setActiveSection(currentId);
        };

        container.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, [isLoading, project?.can_edit]);

    const baseProjectPath = project?.id ? `/project-management/projects/${project.id}` : '/project-management';
    const uniqueEquipmentNames = useMemo(
        () => Array.from(new Set((equipmentNames || []).map((name) => String(name || '').trim()).filter(Boolean))),
        [equipmentNames],
    );

    const updateField = (key, value) => {
        setEditForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const appendEquipmentNames = (rawValue) => {
        const parsed = parseEquipmentNames(rawValue);
        if (!parsed.length) return;
        setEquipmentNames((prev) => Array.from(new Set([...(prev || []), ...parsed])));
    };

    const addEquipment = () => {
        appendEquipmentNames(equipmentDraft);
        setEquipmentDraft('');
    };

    const removeEquipment = (targetName) => {
        setEquipmentNames((prev) => prev.filter((name) => name !== targetName));
    };

    const resetToLoaded = () => {
        if (!initialSnapshot) return;
        setEditForm(initialSnapshot.editForm);
        setEquipmentNames(initialSnapshot.equipmentNames);
        setEquipmentDraft('');
        setSaveError('');
    };

    const save = async (event) => {
        event.preventDefault();
        if (!project?.id) return;
        const name = (editForm.name || '').trim();
        if (!name) {
            setSaveError('프로젝트 이름을 입력해 주세요.');
            return;
        }

        const normalizedProjectType = editForm.project_type || 'equipment';
        if (normalizedProjectType === 'equipment' && !uniqueEquipmentNames.length) {
            setSaveError('설비 프로젝트는 설비를 최소 1개 이상 등록해야 합니다.');
            return;
        }

        setSaveError('');
        setIsSaving(true);
        try {
            await api.put(`/budget/projects/${project.id}`, {
                name,
                code: (editForm.code || '').trim(),
                project_type: normalizedProjectType,
                current_stage: editForm.current_stage || 'review',
                customer_name: (editForm.customer_name || '').trim(),
                installation_site: (editForm.installation_site || '').trim(),
                business_trip_distance_km: toNumber(editForm.business_trip_distance_km),
                manager_user_id: editForm.manager_user_id ? Number(editForm.manager_user_id) : undefined,
                description: (editForm.description || '').trim(),
                cover_image_url: (editForm.cover_image_url || '').trim(),
            });

            if (version?.id) {
                const equipmentItems = normalizedProjectType === 'equipment'
                    ? uniqueEquipmentNames.map((equipmentName) => ({ equipment_name: equipmentName }))
                    : [];
                await api.put(`/budget/versions/${version.id}/equipments`, {
                    items: equipmentItems,
                });
            }

            navigate(baseProjectPath);
        } catch (err) {
            setSaveError(getErrorMessage(err, '기본 정보 저장에 실패했습니다.'));
        } finally {
            setIsSaving(false);
        }
    };

    const jumpToSection = (sectionId) => {
        const container = contentRef.current;
        const target = sectionRefs.current[sectionId];
        if (!container || !target) return;
        container.scrollTo({
            top: target.offsetTop - 24,
            behavior: 'smooth',
        });
    };

    const onSearchSubmit = () => {
        const keyword = settingSearch.trim().toLowerCase();
        if (!keyword) return;
        const matched = SECTION_ITEMS.find((item) => item.label.toLowerCase().includes(keyword));
        if (matched) {
            jumpToSection(matched.id);
        }
    };

    if (isLoading) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                불러오는 중...
            </div>
        );
    }

    if (!project) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                프로젝트를 찾을 수 없습니다.
            </div>
        );
    }

    if (!project.can_edit) {
        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <BudgetBreadcrumb
                        items={[
                            { label: '프로젝트 관리', to: '/project-management' },
                            { label: project.name || '프로젝트', to: baseProjectPath },
                            { label: '프로젝트 설정' },
                        ]}
                    />
                    <ProjectContextNav projectId={project.id} />
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    이 프로젝트는 수정 권한이 없습니다.
                </div>
                <Link
                    to={baseProjectPath}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                    프로젝트 메인으로 돌아가기
                </Link>
            </div>
        );
    }

    return (
        <form
            onSubmit={save}
            className="mx-auto flex h-[calc(100vh-10rem)] w-full max-w-[1440px] flex-col [&_input]:border-slate-300 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-500 [&_input]:caret-slate-900 [&_input:focus]:border-primary [&_input:focus]:ring-primary/20 [&_select]:border-slate-300 [&_select]:text-slate-900 [&_select:focus]:border-primary [&_select:focus]:ring-primary/20 [&_textarea]:border-slate-300 [&_textarea]:text-slate-900 [&_textarea]:placeholder:text-slate-500 [&_textarea:focus]:border-primary [&_textarea:focus]:ring-primary/20"
        >
            <div className="mb-2 space-y-2">
                <BudgetBreadcrumb
                    items={[
                        { label: '프로젝트 관리', to: '/project-management' },
                        { label: project.name || '프로젝트', to: baseProjectPath },
                        { label: '프로젝트 설정' },
                    ]}
                />
                <ProjectContextNav projectId={project.id} />
            </div>

            <header className="mb-4 flex flex-shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                        <Settings2 className="h-6 w-6 text-primary" />
                        프로젝트 설정
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">프로젝트 기본정보 및 운영 규칙을 설정합니다.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={resetToLoaded}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        초기값 복원
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        <Save className="h-4 w-4" />
                        {isSaving ? '저장 중...' : '변경 저장'}
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {saveError && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {saveError}
                </div>
            )}

            <div className="flex min-h-0 flex-1 gap-6 overflow-hidden pb-4">
                <aside className="flex w-64 flex-shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">카테고리</div>
                    </div>
                    <nav className="space-y-1 overflow-y-auto p-2">
                        {SECTION_ITEMS.map((item) => {
                            const Icon = item.icon;
                            const active = activeSection === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => jumpToSection(item.id)}
                                    className={[
                                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                                        active
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-slate-600 hover:bg-slate-50',
                                    ].join(' ')}
                                >
                                    <Icon className={['h-4 w-4', active ? 'text-blue-700' : 'text-slate-400'].join(' ')} />
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="border-t border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center gap-3">
                            <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                                {String((project.name || 'P').charAt(0)).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-900">{project.name || '프로젝트'}</p>
                                <p className="truncate text-[10px] text-slate-500">{project.code || '코드 미지정'}</p>
                            </div>
                        </div>
                    </div>
                </aside>

                <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                className="block w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-10 pr-3 text-sm leading-5 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="설정 항목 검색 (예: 예산, 담당자, 단계)"
                                value={settingSearch}
                                onChange={(event) => setSettingSearch(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    onSearchSubmit();
                                }}
                            />
                        </div>
                    </div>

                    <div ref={contentRef} className="min-h-0 flex-1 space-y-16 overflow-y-auto p-6 md:p-10">
                        <div className="mx-auto w-full max-w-4xl space-y-16 pb-24">
                            <section
                                id="general"
                                ref={(node) => { sectionRefs.current.general = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="기본 설정" description="프로젝트를 식별하는 핵심 정보를 설정합니다." />
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <Field label="프로젝트 이름">
                                        <input
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.name}
                                            onChange={(event) => updateField('name', event.target.value)}
                                        />
                                    </Field>
                                    <Field label="원가센터 코드">
                                        <input
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.code}
                                            onChange={(event) => updateField('code', event.target.value)}
                                        />
                                    </Field>
                                    <Field label="고객사">
                                        <input
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.customer_name}
                                            onChange={(event) => updateField('customer_name', event.target.value)}
                                        />
                                    </Field>
                                    <Field label="설치 장소">
                                        <input
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.installation_site}
                                            onChange={(event) => updateField('installation_site', event.target.value)}
                                        />
                                    </Field>
                                    <Field label="프로젝트 설명" className="md:col-span-2">
                                        <textarea
                                            rows={4}
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.description}
                                            onChange={(event) => updateField('description', event.target.value)}
                                        />
                                    </Field>
                                </div>
                            </section>

                            <section
                                id="budget-rules"
                                ref={(node) => { sectionRefs.current['budget-rules'] = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="예산 규칙" description="프로젝트 진행 단계와 기본 예산 정책을 설정합니다." />
                                <div className="space-y-6">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-4 flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900">예산 초과 알림</h3>
                                                <p className="mt-1 text-xs text-slate-500">카테고리 예산 초과 시 관리자 알림을 사용합니다.</p>
                                            </div>
                                            <label className="relative inline-flex cursor-pointer items-center">
                                                <input defaultChecked type="checkbox" className="peer sr-only" />
                                                <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-primary" />
                                                <span className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                            <Field label="현재 진행 단계">
                                                <select
                                                    className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                                    value={editForm.current_stage}
                                                    onChange={(event) => updateField('current_stage', event.target.value)}
                                                >
                                                    <option value="review">검토</option>
                                                    <option value="fabrication">제작</option>
                                                    <option value="installation">설치</option>
                                                    <option value="warranty">AS</option>
                                                    <option value="closure">종료</option>
                                                </select>
                                            </Field>
                                            <Field label="출장 거리(km)">
                                                <input
                                                    className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                                    value={editForm.business_trip_distance_km}
                                                    onChange={(event) => updateField('business_trip_distance_km', event.target.value.replace(/[^0-9.]/g, ''))}
                                                    placeholder="편도 거리 입력"
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-slate-700">프로젝트 유형</label>
                                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                                            {[
                                                { key: 'equipment', label: '설비' },
                                                { key: 'parts', label: '파츠' },
                                                { key: 'as', label: 'AS' },
                                            ].map((type) => {
                                                const active = editForm.project_type === type.key;
                                                return (
                                                    <button
                                                        key={type.key}
                                                        type="button"
                                                        onClick={() => updateField('project_type', type.key)}
                                                        className={[
                                                            'rounded-md px-4 py-2 text-sm font-medium transition',
                                                            active
                                                                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                                                : 'text-slate-600 hover:bg-slate-50',
                                                        ].join(' ')}
                                                    >
                                                        {type.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section
                                id="personnel"
                                ref={(node) => { sectionRefs.current.personnel = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="인력 관리" description="담당자 및 설비 연결 리소스를 관리합니다." />
                                <div className="space-y-6">
                                    <Field label="프로젝트 담당자">
                                        <select
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            value={editForm.manager_user_id}
                                            onChange={(event) => updateField('manager_user_id', event.target.value)}
                                        >
                                            <option value="">담당자 선택</option>
                                            {managerOptions.map((user) => (
                                                <option key={user.id} value={String(user.id)}>
                                                    {(user.full_name || '').trim() || user.email}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    {editForm.project_type === 'equipment' ? (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-slate-900">설비 목록</h3>
                                                <span className="text-xs text-slate-500">총 {uniqueEquipmentNames.length}개</span>
                                            </div>

                                            {uniqueEquipmentNames.length > 0 ? (
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {uniqueEquipmentNames.map((equipmentName) => (
                                                        <span key={equipmentName} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                                            {equipmentName}
                                                            <button
                                                                type="button"
                                                                onClick={() => removeEquipment(equipmentName)}
                                                                className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                                aria-label={`${equipmentName} 삭제`}
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="mb-3 text-xs text-slate-500">등록된 설비가 없습니다.</p>
                                            )}

                                            <div className="flex items-center gap-2">
                                                <input
                                                    className="h-9 flex-1 rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                                    value={equipmentDraft}
                                                    onChange={(event) => setEquipmentDraft(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== 'Enter') return;
                                                        event.preventDefault();
                                                        addEquipment();
                                                    }}
                                                    placeholder="쉼표(,) 또는 줄바꿈으로 여러 설비 추가 가능"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addEquipment}
                                                    className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    추가
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                            파츠/AS 프로젝트는 설비 입력이 필요하지 않습니다.
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section
                                id="permissions"
                                ref={(node) => { sectionRefs.current.permissions = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="권한 제어" description="데이터 변경 방식 및 승인 정책을 지정합니다." />
                                <div className="space-y-3">
                                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                                        <input defaultChecked type="radio" name="permission-mode" className="text-primary focus:ring-primary" />
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">엄격 모드 (승인 필수)</p>
                                            <p className="text-xs text-slate-500">예산 변경 시 관리자 승인 이후 반영됩니다.</p>
                                        </div>
                                    </label>
                                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                                        <input type="radio" name="permission-mode" className="text-primary focus:ring-primary" />
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">유연 모드 (이력 추적)</p>
                                            <p className="text-xs text-slate-500">즉시 반영되며 변경 이력이 자동 저장됩니다.</p>
                                        </div>
                                    </label>
                                </div>
                            </section>

                            <section
                                id="unit-costs"
                                ref={(node) => { sectionRefs.current['unit-costs'] = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="단가/옵션" description="프로젝트 공통 설정과 기본 옵션을 관리합니다." />
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <Field label="대표 이미지 URL">
                                        <input
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                            placeholder="비워두면 자동 생성 이미지 사용"
                                            value={editForm.cover_image_url}
                                            onChange={(event) => updateField('cover_image_url', event.target.value)}
                                        />
                                    </Field>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
                                            <CircleDollarSign className="h-4 w-4 text-primary" />
                                            프로젝트 기준 통화
                                        </div>
                                        <p>현재 통화: KRW (원)</p>
                                    </div>
                                </div>
                            </section>

                            <section
                                id="integration"
                                ref={(node) => { sectionRefs.current.integration = node; }}
                                className="scroll-mt-8"
                            >
                                <SectionHeader title="시스템 연동" description="외부 시스템 연동 상태와 메타 정보를 확인합니다." />
                                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                                    <CloudCog className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                                    <p className="text-sm text-slate-600">ERP/SAP 연동 설정은 차기 버전에서 확장될 예정입니다.</p>
                                    <p className="mt-2 text-xs text-slate-500">프로젝트 ID: {project.id} / 버전 ID: {version?.id || '없음'}</p>
                                </div>
                            </section>
                        </div>
                    </div>
                </main>
            </div>
        </form>
    );
};

const SectionHeader = ({ title, description }) => (
    <>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
            {title}
            <span className="ml-2 h-px flex-1 bg-slate-200" />
        </h2>
        <p className="mb-6 text-sm text-slate-500">{description}</p>
    </>
);

const Field = ({ label, children, className = '' }) => (
    <label className={['block', className].join(' ')}>
        <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
        {children}
    </label>
);

export default BudgetProjectInfoEdit;
