import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';
import { Button } from '../components/ui/Button';

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

                if (currentProject) {
                    setEditForm({
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
                    });
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

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    if (!project.can_edit) {
        return (
            <div className="space-y-4">
                <BudgetBreadcrumb
                    items={[
                        { label: '프로젝트 관리', to: '/project-management' },
                        { label: project.name || '프로젝트', to: baseProjectPath },
                        { label: '상세 정보 수정' },
                    ]}
                />
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    이 프로젝트는 수정 권한이 없습니다.
                </div>
                <Link to={baseProjectPath}>
                    <Button size="sm" variant="outline">프로젝트 상세로 돌아가기</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-10">
            <div className="space-y-2">
                <BudgetBreadcrumb
                    items={[
                        { label: '프로젝트 관리', to: '/project-management' },
                        { label: project.name || '프로젝트', to: baseProjectPath },
                        { label: '상세 정보 수정' },
                    ]}
                />
                <h1 className="text-xl font-black tracking-tight text-slate-900">프로젝트 상세 정보 수정</h1>
            </div>

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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="프로젝트 이름" required>
                        <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.name}
                            onChange={(event) => updateField('name', event.target.value)}
                        />
                    </Field>
                    <Field label="프로젝트 코드">
                        <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.code}
                            onChange={(event) => updateField('code', event.target.value)}
                        />
                    </Field>
                    <Field label="프로젝트 종류">
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.project_type}
                            onChange={(event) => updateField('project_type', event.target.value)}
                        >
                            <option value="equipment">설비</option>
                            <option value="parts">파츠</option>
                            <option value="as">AS</option>
                        </select>
                    </Field>
                    <Field label="현재 진행 단계">
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                        <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.customer_name}
                            onChange={(event) => updateField('customer_name', event.target.value)}
                        />
                    </Field>
                    <Field label="설치 장소">
                        <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={editForm.installation_site}
                            onChange={(event) => updateField('installation_site', event.target.value)}
                        />
                    </Field>
                    <Field label="출장 거리(km)">
                        <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
                                <input
                                    className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
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

                <Field label="대표 이미지 URL">
                    <input
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        placeholder="비워두면 자동 생성 이미지 사용"
                        value={editForm.cover_image_url}
                        onChange={(event) => updateField('cover_image_url', event.target.value)}
                    />
                </Field>

                <div className="flex items-center justify-end gap-2 pt-1">
                    <Link to={baseProjectPath}>
                        <Button type="button" variant="outline" size="sm" disabled={isSaving}>
                            취소
                        </Button>
                    </Link>
                    <Button type="submit" size="sm" isLoading={isSaving}>
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
