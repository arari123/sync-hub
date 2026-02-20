import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api, getErrorMessage, resolveApiAssetUrl } from '../lib/api';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

function extractItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
}

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

function normalizeBudgetStage(value) {
    const stage = String(value || '').trim().toLowerCase();
    if (stage === 'progress') return 'fabrication';
    if (stage === 'as' || stage === 'a/s') return 'warranty';
    if (stage === 'closed') return 'closure';
    return stage || 'review';
}

const EMPTY_EDIT_FORM = {
    name: '',
    code: '',
    project_type: 'equipment',
    parent_project_id: '',
    current_stage: 'review',
    customer_name: '',
    installation_site: '',
    business_trip_distance_km: '',
    manager_user_id: '',
    description: '',
    cover_image_url: '',
};

const BudgetProjectInfoEdit = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [version, setVersion] = useState(null);
    const [managerOptions, setManagerOptions] = useState([]);
    const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
    const [equipmentNames, setEquipmentNames] = useState([]);
    const [equipmentDraft, setEquipmentDraft] = useState('');
    const [equipmentProjects, setEquipmentProjects] = useState([]);
    const [equipmentProjectQuery, setEquipmentProjectQuery] = useState('');
    const [isEquipmentProjectLoading, setIsEquipmentProjectLoading] = useState(false);
    const [equipmentProjectError, setEquipmentProjectError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [coverError, setCoverError] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [coverFile, setCoverFile] = useState(null);
    const [coverFileName, setCoverFileName] = useState('');
    const [coverPreviewUrl, setCoverPreviewUrl] = useState('');

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
                const versionPool = Array.isArray(payload.versions) ? payload.versions : [];
                const currentStage = normalizeBudgetStage(currentProject?.current_stage || '');
                const currentVersion = versionPool.find((item) => item.is_current && normalizeBudgetStage(item?.stage) === currentStage)
                    || versionPool.find((item) => item.is_current)
                    || versionPool[0]
                    || null;
                setVersion(currentVersion);

                if (currentProject) {
                    const existingCoverUrl = resolveApiAssetUrl(
                        currentProject.cover_image_display_url
                        || currentProject.cover_image_fallback_url
                        || currentProject.cover_image_url
                        || ''
                    );
                    setEditForm({
                        name: currentProject.name || '',
                        code: currentProject.code || '',
                        project_type: currentProject.project_type || 'equipment',
                        parent_project_id: currentProject.parent_project_id ? String(currentProject.parent_project_id) : '',
                        current_stage: currentProject.current_stage || 'review',
                        customer_name: currentProject.customer_name || '',
                        installation_site: currentProject.installation_site || '',
                        business_trip_distance_km: String(toNumber(currentProject.business_trip_distance_km) || ''),
                        manager_user_id: currentProject.manager_user_id ? String(currentProject.manager_user_id) : '',
                        description: currentProject.description || '',
                        cover_image_url: currentProject.cover_image_url || '',
                    });
                    setCoverPreviewUrl(existingCoverUrl);
                    setCoverFile(null);
                    setCoverFileName('');
                    setCoverError('');
                }

                if (currentVersion?.id) {
                    const equipmentResp = await api.get(`/budget/versions/${currentVersion.id}/equipments`);
                    const itemList = Array.isArray(equipmentResp?.data?.items) ? equipmentResp.data.items : [];
                    const names = itemList
                        .map((item) => String(item?.equipment_name || '').trim())
                        .filter(Boolean);
                    setEquipmentNames(Array.from(new Set(names)));
                } else {
                    setEquipmentNames([]);
                }
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
        if (editForm.project_type !== 'as') return undefined;
        if (equipmentProjects.length > 0) return undefined;

        let mounted = true;
        const controller = new AbortController();

        const loadEquipmentProjects = async () => {
            setIsEquipmentProjectLoading(true);
            setEquipmentProjectError('');
            try {
                const response = await api.get('/budget/projects', {
                    params: {
                        page: 1,
                        page_size: 200,
                        sort_by: 'updated_desc',
                        project_types: 'equipment',
                    },
                    signal: controller.signal,
                });
                const items = extractItems(response?.data);
                if (!mounted) return;
                setEquipmentProjects(items);
            } catch (err) {
                if (!mounted || err?.code === 'ERR_CANCELED') return;
                setEquipmentProjects([]);
                setEquipmentProjectError(getErrorMessage(err, '설비 프로젝트 목록을 불러오지 못했습니다.'));
            } finally {
                if (!mounted) return;
                setIsEquipmentProjectLoading(false);
            }
        };

        loadEquipmentProjects();
        return () => {
            mounted = false;
            controller.abort();
        };
    }, [editForm.project_type, equipmentProjects.length]);

    const baseProjectPath = project?.id ? `/project-management/projects/${project.id}` : '/project-management';
    const uniqueEquipmentNames = useMemo(
        () => Array.from(new Set((equipmentNames || []).map((name) => String(name || '').trim()).filter(Boolean))),
        [equipmentNames],
    );
    const filteredEquipmentProjects = useMemo(() => {
        const keyword = equipmentProjectQuery.trim().toLowerCase();
        const list = Array.isArray(equipmentProjects) ? equipmentProjects : [];
        const filtered = list.filter((candidate) => String(candidate?.id || '') !== String(project?.id || ''));
        if (!keyword) return filtered;
        return filtered.filter((candidate) => {
            const haystack = [
                candidate?.name,
                candidate?.code,
                candidate?.customer_name,
                candidate?.installation_site,
            ].join(' ').toLowerCase();
            return haystack.includes(keyword);
        });
    }, [equipmentProjectQuery, equipmentProjects, project?.id]);

    const updateField = (key, value) => {
        setEditForm((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    useEffect(() => () => {
        if (coverPreviewUrl && coverPreviewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(coverPreviewUrl);
        }
    }, [coverPreviewUrl]);

    const onCoverFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const mimeType = String(file.type || '').toLowerCase();
        if (!mimeType.startsWith('image/')) {
            setCoverError('이미지 파일만 업로드할 수 있습니다.');
            setCoverFile(null);
            setCoverFileName('');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setCoverError('대표 이미지는 최대 5MB까지 업로드할 수 있습니다.');
            setCoverFile(null);
            setCoverFileName('');
            return;
        }

        setCoverError('');
        setCoverFile(file);
        setCoverFileName(file.name || '');
        setCoverPreviewUrl((prev) => {
            if (prev && prev.startsWith('blob:')) {
                URL.revokeObjectURL(prev);
            }
            return URL.createObjectURL(file);
        });
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

    const save = async (event) => {
        event.preventDefault();
        if (!project?.id) return;
        const name = (editForm.name || '').trim();
        if (!name) {
            setSaveError('프로젝트 이름을 입력해 주세요.');
            return;
        }

        const normalizedProjectType = editForm.project_type || 'equipment';
        if (normalizedProjectType === 'as' && !String(editForm.parent_project_id || '').trim()) {
            setSaveError('AS 프로젝트는 소속 설비 프로젝트를 선택해야 합니다.');
            return;
        }
        if (normalizedProjectType === 'equipment' && !uniqueEquipmentNames.length) {
            setSaveError('설비 프로젝트는 설비를 최소 1개 이상 등록해야 합니다.');
            return;
        }

        setSaveError('');
        setCoverError('');
        setIsSaving(true);
        try {
            let coverImageUrl = (editForm.cover_image_url || '').trim();
            if (coverFile) {
                const formData = new FormData();
                formData.append('file', coverFile);
                const coverUploadResponse = await api.post('/budget/project-covers/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                coverImageUrl = String(coverUploadResponse?.data?.cover_image_url || '').trim();
                if (!coverImageUrl) {
                    throw new Error('cover_image_upload_failed');
                }
            }

            await api.put(`/budget/projects/${project.id}`, {
                name,
                code: (editForm.code || '').trim(),
                project_type: normalizedProjectType,
                parent_project_id: normalizedProjectType === 'as' ? Number(editForm.parent_project_id) : undefined,
                current_stage: editForm.current_stage || 'review',
                customer_name: (editForm.customer_name || '').trim(),
                installation_site: (editForm.installation_site || '').trim(),
                business_trip_distance_km: toNumber(editForm.business_trip_distance_km),
                manager_user_id: editForm.manager_user_id ? Number(editForm.manager_user_id) : undefined,
                description: (editForm.description || '').trim(),
                cover_image_url: coverImageUrl || undefined,
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

    const removeProject = async () => {
        if (!project?.id || isDeleting) return;
        const projectName = (project.name || '').trim() || `#${project.id}`;
        const shouldDelete = window.confirm(
            `'${projectName}' 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
        );
        if (!shouldDelete) return;

        setDeleteError('');
        setIsDeleting(true);
        try {
            await api.delete(`/budget/projects/${project.id}`);
            navigate('/project-management');
        } catch (err) {
            setDeleteError(getErrorMessage(err, '프로젝트 삭제에 실패했습니다.'));
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    if (!project.can_edit) {
        return (
            <div className="space-y-4">
                <ProjectPageHeader
                    projectId={project.id}
                    projectName={project.name || '프로젝트'}
                    projectCode={project.code || ''}
                    pageLabel="프로젝트 정보 수정"
                    canEdit={project.can_edit}
                    breadcrumbItems={[
                        { label: '메인 페이지', to: '/project-management' },
                        { label: project.name || '프로젝트', to: baseProjectPath },
                        { label: '상세 정보 수정' },
                    ]}
                />
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    이 프로젝트는 수정 권한이 없습니다.
                </div>
                <Link to={baseProjectPath}>
                    <Button size="sm" variant="outline">프로젝트 메인으로 돌아가기</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-10">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="프로젝트 정보 수정"
                canEdit={project.can_edit}
                breadcrumbItems={[
                    { label: '메인 페이지', to: '/project-management' },
                    { label: project.name || '프로젝트', to: baseProjectPath },
                    { label: '상세 정보 수정' },
                ]}
            />

            {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">
                    {error}
                </div>
            )}

            <form onSubmit={save} className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
                {saveError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {saveError}
                    </div>
                )}
                {deleteError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {deleteError}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="프로젝트 이름" required>
                        <Input
                            className="h-9 w-full"
                            value={editForm.name}
                            onChange={(event) => updateField('name', event.target.value)}
                        />
                    </Field>
                    <Field label="프로젝트 코드">
                        <Input
                            className="h-9 w-full"
                            value={editForm.code}
                            onChange={(event) => updateField('code', event.target.value)}
                        />
                    </Field>
                    <Field label="프로젝트 종류">
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.project_type}
                            onChange={(event) => {
                                const nextType = event.target.value;
                                setEditForm((prev) => ({
                                    ...prev,
                                    project_type: nextType,
                                    parent_project_id: nextType === 'as' ? prev.parent_project_id : '',
                                }));
                            }}
                        >
                            <option value="equipment">설비</option>
                            <option value="parts">파츠</option>
                            <option value="as">AS</option>
                        </select>
                    </Field>
                    {editForm.project_type === 'as' && (
                        <div className="sm:col-span-2">
                            <Field label="소속 설비 프로젝트" required>
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                                    <div className="md:col-span-5">
                                        <Input
                                            className="h-9 w-full"
                                            value={equipmentProjectQuery}
                                            onChange={(event) => setEquipmentProjectQuery(event.target.value)}
                                            placeholder="프로젝트명/코드/고객사로 검색"
                                        />
                                    </div>
                                    <div className="md:col-span-7">
                                        <select
                                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                            value={editForm.parent_project_id}
                                            onChange={(event) => updateField('parent_project_id', event.target.value)}
                                        >
                                            <option value="">설비 프로젝트 선택</option>
                                            {filteredEquipmentProjects.map((candidate) => {
                                                const label = `${candidate.code ? `${candidate.code} · ` : ''}${candidate.name || `#${candidate.id}`}`;
                                                return (
                                                    <option key={`equipment-project-${candidate.id}`} value={String(candidate.id)}>
                                                        {label}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                </div>
                                {isEquipmentProjectLoading && (
                                    <p className="mt-1 text-[11px] text-slate-500">설비 프로젝트 목록을 불러오는 중...</p>
                                )}
                                {equipmentProjectError && (
                                    <p className="mt-1 text-[11px] text-rose-600">{equipmentProjectError}</p>
                                )}
                                {!isEquipmentProjectLoading && !equipmentProjectError && equipmentProjects.length <= 0 && (
                                    <p className="mt-1 text-[11px] text-slate-500">선택 가능한 설비 프로젝트가 없습니다.</p>
                                )}
                                <p className="mt-1 text-[11px] text-slate-500">AS 프로젝트는 소속 설비 프로젝트에 종속됩니다.</p>
                            </Field>
                        </div>
                    )}
                    <Field label="현재 진행 단계">
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.current_stage}
                            onChange={(event) => updateField('current_stage', event.target.value)}
                        >
                            <option value="review">검토</option>
                            <option value="design">설계</option>
                            <option value="fabrication">제작</option>
                            <option value="installation">설치</option>
                            <option value="warranty">워런티</option>
                            <option value="closure">종료</option>
                        </select>
                    </Field>
                    <Field label="담당자">
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                    <Field label="고객사">
                        <Input
                            className="h-9 w-full"
                            value={editForm.customer_name}
                            onChange={(event) => updateField('customer_name', event.target.value)}
                        />
                    </Field>
                    <Field label="설치 장소">
                        <Input
                            className="h-9 w-full"
                            value={editForm.installation_site}
                            onChange={(event) => updateField('installation_site', event.target.value)}
                        />
                    </Field>
                    <Field label="출장 거리(km)">
                        <Input
                            className="h-9 w-full"
                            value={editForm.business_trip_distance_km}
                            onChange={(event) => updateField('business_trip_distance_km', event.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="편도 거리 입력"
                        />
                    </Field>
                </div>

                <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                        설비 목록
                        {editForm.project_type === 'equipment' ? ' *' : ''}
                    </span>
                    {editForm.project_type === 'equipment' ? (
                        <div className="space-y-2.5">
                            <div className="rounded-md border bg-slate-50 p-2.5">
                                <div className="mb-2 text-[11px] font-semibold text-slate-600">
                                    현재 등록 설비 {uniqueEquipmentNames.length}개
                                </div>
                                {uniqueEquipmentNames.length ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {uniqueEquipmentNames.map((equipmentName) => (
                                            <span key={equipmentName} className="inline-flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
                                                {equipmentName}
                                                <button
                                                    type="button"
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        removeEquipment(equipmentName);
                                                    }}
                                                    className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                    aria-label={`${equipmentName} 삭제`}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-slate-500">등록된 설비가 없습니다.</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    className="h-9 flex-1"
                                    value={equipmentDraft}
                                    onChange={(event) => setEquipmentDraft(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter') return;
                                        event.preventDefault();
                                        addEquipment();
                                    }}
                                    placeholder="추가할 설비명 입력 후 Enter 또는 추가 클릭"
                                />
                                <Button type="button" size="sm" variant="outline" onClick={addEquipment}>
                                    <Plus size={14} className="mr-1" />
                                    추가
                                </Button>
                            </div>
                            <p className="text-[11px] text-slate-500">여러 설비를 한 번에 입력하려면 쉼표(,) 또는 줄바꿈으로 구분해 추가할 수 있습니다.</p>
                        </div>
                    ) : (
                        <p className="text-[11px] text-slate-500">파츠/AS 프로젝트는 설비 입력이 필요하지 않습니다.</p>
                    )}
                </div>

                <Field label="개요">
                    <textarea
                        className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={editForm.description}
                        onChange={(event) => updateField('description', event.target.value)}
                    />
                </Field>

                <Field label="대표 이미지">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
                        <label className="group relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:bg-slate-100">
                            <input
                                type="file"
                                accept="image/*"
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                onChange={onCoverFileChange}
                            />
                            {coverPreviewUrl ? (
                                <img src={coverPreviewUrl} alt="대표 이미지 미리보기" className="h-full w-full object-cover" />
                            ) : (
                                <div className="p-3 text-center">
                                    <p className="text-xs font-semibold text-slate-600">이미지 업로드</p>
                                    <p className="mt-1 text-[11px] text-slate-400">JPG/PNG/WEBP/GIF · 최대 5MB</p>
                                </div>
                            )}
                        </label>
                        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-xs font-semibold text-slate-700">
                                {coverFileName ? `선택 파일: ${coverFileName}` : '새 이미지를 선택하면 대표 이미지가 교체됩니다.'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                                대표 이미지를 선택하지 않으면 기존 이미지(또는 자동 생성 이미지)를 유지합니다.
                            </p>
                            {coverError && (
                                <p className="text-[11px] font-semibold text-rose-600">{coverError}</p>
                            )}
                        </div>
                    </div>
                </Field>

                <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mr-auto border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        onClick={removeProject}
                        isLoading={isDeleting}
                        disabled={isSaving}
                    >
                        프로젝트 삭제
                    </Button>
                    <Link to={baseProjectPath}>
                        <Button type="button" variant="outline" size="sm" disabled={isSaving || isDeleting}>
                            취소
                        </Button>
                    </Link>
                    <Button type="submit" size="sm" isLoading={isSaving} disabled={isDeleting}>
                        저장
                    </Button>
                </div>
            </form>
        </div>
    );
};

const Field = ({ label, children, required = false }) => (
    <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
            {label}
            {required ? ' *' : ''}
        </span>
        {children}
    </label>
);

export default BudgetProjectInfoEdit;
