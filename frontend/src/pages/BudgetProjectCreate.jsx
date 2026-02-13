import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Building2,
    Check,
    CirclePlus,
    ImagePlus,
    MapPin,
    QrCode,
    Save,
    Search,
    Trash2,
    UserRound,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import { Input } from '../components/ui/Input';

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

function emptyContact() {
    return {
        name: '',
        department: '',
        email: '',
        phone: '',
    };
}

const DRAFT_KEY = 'budget_project_create_draft_v1';

const BudgetProjectCreate = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [projectType, setProjectType] = useState('equipment');
    const [equipmentInput, setEquipmentInput] = useState('');
    const [description, setDescription] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [installationSite, setInstallationSite] = useState('');
    const [businessTripDistanceKm, setBusinessTripDistanceKm] = useState('');
    const [managerUserId, setManagerUserId] = useState('');
    const [managerOptions, setManagerOptions] = useState([]);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [draftMessage, setDraftMessage] = useState('');

    const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
    const [coverFileName, setCoverFileName] = useState('');
    const [equipmentMode, setEquipmentMode] = useState('registered');
    const [clientContacts, setClientContacts] = useState([emptyContact()]);

    useEffect(() => {
        const currentUser = getCurrentUser();

        const rawDraft = window.localStorage.getItem(DRAFT_KEY);
        if (rawDraft) {
            try {
                const draft = JSON.parse(rawDraft);
                setName(String(draft?.name || ''));
                setCode(String(draft?.code || ''));
                setProjectType(String(draft?.projectType || 'equipment'));
                setEquipmentInput(String(draft?.equipmentInput || ''));
                setDescription(String(draft?.description || ''));
                setCustomerName(String(draft?.customerName || ''));
                setInstallationSite(String(draft?.installationSite || ''));
                setBusinessTripDistanceKm(String(draft?.businessTripDistanceKm || ''));
                setManagerUserId(String(draft?.managerUserId || ''));
                const draftContacts = Array.isArray(draft?.clientContacts) ? draft.clientContacts : null;
                if (draftContacts?.length) {
                    setClientContacts(draftContacts.map((item) => ({
                        name: String(item?.name || ''),
                        department: String(item?.department || ''),
                        email: String(item?.email || ''),
                        phone: String(item?.phone || ''),
                    })));
                }
            } catch (_err) {
                window.localStorage.removeItem(DRAFT_KEY);
            }
        } else if (currentUser?.id) {
            setManagerUserId(String(currentUser.id));
        }

        let mounted = true;
        const loadManagers = async () => {
            try {
                const response = await api.get('/auth/users');
                const options = Array.isArray(response.data) ? response.data : [];
                if (!mounted) return;
                setManagerOptions(options);

                if (!options.length) return;
                if (!managerUserId) {
                    const preferred = currentUser?.id
                        ? options.find((item) => Number(item?.id) === Number(currentUser.id))
                        : null;
                    setManagerUserId(String((preferred || options[0])?.id || ''));
                }
            } catch (_err) {
                if (!mounted) return;
                setManagerOptions([]);
            }
        };

        loadManagers();
        return () => {
            mounted = false;
        };
    }, []);

    const projectTypeButtons = useMemo(() => ([
        { key: 'equipment', label: '설비' },
        { key: 'parts', label: '파츠' },
        { key: 'as', label: 'AS' },
    ]), []);

    const saveDraft = () => {
        const payload = {
            name,
            code,
            projectType,
            equipmentInput,
            description,
            customerName,
            installationSite,
            businessTripDistanceKm,
            managerUserId,
            clientContacts,
            savedAt: Date.now(),
        };
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        setDraftMessage('임시 저장되었습니다.');
        window.setTimeout(() => setDraftMessage(''), 2500);
    };

    const onCoverFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (coverPreviewUrl) {
            URL.revokeObjectURL(coverPreviewUrl);
        }
        const previewUrl = URL.createObjectURL(file);
        setCoverPreviewUrl(previewUrl);
        setCoverFileName(file.name || '');
    };

    useEffect(() => {
        return () => {
            if (coverPreviewUrl) {
                URL.revokeObjectURL(coverPreviewUrl);
            }
        };
    }, [coverPreviewUrl]);

    const updateContactField = (index, key, value) => {
        setClientContacts((prev) => prev.map((item, itemIndex) => (
            itemIndex === index ? { ...item, [key]: value } : item
        )));
    };

    const addContact = () => {
        setClientContacts((prev) => [...prev, emptyContact()]);
    };

    const removeContact = (index) => {
        setClientContacts((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((_, itemIndex) => itemIndex !== index);
        });
    };

    const createProject = async (event) => {
        event.preventDefault();
        if (!name.trim()) {
            setError('프로젝트 이름을 입력해 주세요.');
            return;
        }
        const equipmentNames = parseEquipmentNames(equipmentInput);
        if (projectType === 'equipment' && !equipmentNames.length) {
            setError('설비 프로젝트는 설비를 최소 1개 이상 입력해 주세요.');
            return;
        }
        if (!managerUserId) {
            setError('담당자를 선택해 주세요.');
            return;
        }

        setError('');
        setIsSubmitting(true);
        try {
            const created = await api.post('/budget/projects', {
                name: name.trim(),
                code: code.trim(),
                project_type: projectType,
                description: description.trim(),
                customer_name: customerName.trim(),
                installation_site: installationSite.trim(),
                business_trip_distance_km: Number(String(businessTripDistanceKm || '0').replace(/,/g, '')) || 0,
                manager_user_id: Number(managerUserId),
            });
            const projectId = created?.data?.id;
            if (!projectId) {
                throw new Error('project_id_missing');
            }

            const createdVersion = await api.post(`/budget/projects/${projectId}/versions`, { stage: 'review' });
            const versionId = createdVersion?.data?.id;
            if (projectType === 'equipment' && versionId) {
                await api.put(`/budget/versions/${versionId}/equipments`, {
                    items: equipmentNames.map((equipmentName) => ({ equipment_name: equipmentName })),
                });
            }

            window.localStorage.removeItem(DRAFT_KEY);
            navigate(`/project-management/projects/${projectId}`);
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 생성에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mx-auto flex h-[calc(100vh-10rem)] w-full max-w-7xl flex-col">
            <header className="mb-5 flex flex-shrink-0 flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                        <CirclePlus className="h-7 w-7 text-primary" />
                        프로젝트 생성
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">새 프로젝트를 생성하고 예산 관리 워크플로우를 시작합니다.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={saveDraft}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        <Save className="h-4 w-4" />
                        임시 저장
                    </button>
                    <Link
                        to="/project-management"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        취소
                    </Link>
                    <button
                        type="submit"
                        form="project-create-form"
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        <Check className="h-4 w-4" />
                        {isSubmitting ? '생성 중...' : '프로젝트 생성'}
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {draftMessage && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {draftMessage}
                </div>
            )}

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="form-scroll min-h-0 flex-1 overflow-y-auto p-6 md:p-10">
                    <form
                        id="project-create-form"
                        onSubmit={createProject}
                        className="mx-auto max-w-5xl space-y-10 pb-12 [&_input]:border-input [&_input]:bg-card [&_input]:text-foreground [&_input]:placeholder:text-muted-foreground/90 [&_input]:caret-foreground [&_input:focus-visible]:border-primary [&_input:focus-visible]:ring-ring/30 [&_select]:border-input [&_select]:bg-card [&_select]:text-foreground [&_select:focus-visible]:border-primary [&_select:focus-visible]:ring-ring/30 [&_textarea]:border-input [&_textarea]:bg-card [&_textarea]:text-foreground [&_textarea]:placeholder:text-muted-foreground/90 [&_textarea:focus-visible]:border-primary [&_textarea:focus-visible]:ring-ring/30"
                    >
                        <section>
                            <h2 className="mb-6 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900">
                                프로젝트 핵심 정보
                            </h2>
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                                <div className="md:col-span-4 lg:col-span-3">
                                    <label className="mb-2 block text-sm font-medium text-slate-700">프로젝트 이미지</label>
                                    <label className="group relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:bg-slate-100">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            onChange={onCoverFileChange}
                                        />
                                        {coverPreviewUrl ? (
                                            <img src={coverPreviewUrl} alt="미리보기" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="p-4 text-center">
                                                <ImagePlus className="mx-auto mb-2 h-10 w-10 text-slate-400 transition group-hover:text-primary" />
                                                <p className="text-xs font-medium text-slate-500">클릭 또는 드래그로 업로드</p>
                                                <p className="mt-1 text-[10px] text-slate-400">JPG, PNG / 최대 5MB</p>
                                            </div>
                                        )}
                                    </label>
                                    {coverFileName && (
                                        <p className="mt-2 truncate text-[11px] text-slate-500">{coverFileName}</p>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 gap-6 md:col-span-8 lg:col-span-9 md:grid-cols-2">
                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-slate-700">
                                            프로젝트명 <span className="text-rose-500">*</span>
                                        </label>
                                        <Input
                                            className="w-full text-sm"
                                            placeholder="예: 2차전지 조립 자동화 라인 A1"
                                            value={name}
                                            onChange={(event) => setName(event.target.value)}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-slate-700">
                                            ERP 프로젝트 코드 <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <QrCode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                            <Input
                                                className="w-full pl-10 font-mono text-sm uppercase"
                                                placeholder="PRJ-2026-XXXX"
                                                value={code}
                                                onChange={(event) => setCode(event.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="mb-2 block text-sm font-medium text-slate-700">개요 / 설명</label>
                                        <textarea
                                            rows={4}
                                            className="w-full rounded-md border-slate-300 bg-white text-sm shadow-sm transition placeholder:text-slate-400 focus:border-primary focus:ring-primary/20"
                                            placeholder="프로젝트 범위와 목표를 입력하세요."
                                            value={description}
                                            onChange={(event) => setDescription(event.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="mb-6 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900">
                                고객사 및 설치 정보
                            </h2>
                            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">고객사</label>
                                    <div className="relative">
                                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            className="w-full pl-10 text-sm"
                                            placeholder="고객사 검색 또는 입력"
                                            value={customerName}
                                            onChange={(event) => setCustomerName(event.target.value)}
                                        />
                                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">설치 장소</label>
                                    <div className="relative">
                                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            className="w-full pl-10 text-sm"
                                            placeholder="도시 또는 국가 입력"
                                            value={installationSite}
                                            onChange={(event) => setInstallationSite(event.target.value)}
                                        />
                                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">담당자</label>
                                    <div className="relative">
                                        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <select
                                            className="w-full rounded-md border-slate-300 bg-white pl-10 text-sm shadow-sm transition focus:border-primary focus:ring-primary/20"
                                            value={managerUserId}
                                            onChange={(event) => setManagerUserId(event.target.value)}
                                        >
                                            <option value="">담당자 선택</option>
                                            {managerOptions.map((user) => (
                                                <option key={user.id} value={String(user.id)}>
                                                    {(user.full_name || '').trim() || user.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-700">출장 거리(편도, km)</label>
                                    <div className="relative">
                                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            className="w-full pl-10 text-sm"
                                            placeholder="예: 15"
                                            value={businessTripDistanceKm}
                                            onChange={(event) => setBusinessTripDistanceKm(event.target.value.replace(/[^0-9.]/g, ''))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-slate-900">고객사 연락처</h3>
                                    <button
                                        type="button"
                                        onClick={addContact}
                                        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-blue-600"
                                    >
                                        <CirclePlus className="h-4 w-4" />
                                        연락처 추가
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {clientContacts.map((contact, index) => (
                                        <div key={`contact-${index}`} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-12">
                                            <div className="sm:col-span-3">
                                                <Input
                                                    className="w-full text-sm"
                                                    placeholder="이름"
                                                    value={contact.name}
                                                    onChange={(event) => updateContactField(index, 'name', event.target.value)}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Input
                                                    className="w-full text-sm"
                                                    placeholder="부서"
                                                    value={contact.department}
                                                    onChange={(event) => updateContactField(index, 'department', event.target.value)}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Input
                                                    type="email"
                                                    className="w-full text-sm"
                                                    placeholder="이메일"
                                                    value={contact.email}
                                                    onChange={(event) => updateContactField(index, 'email', event.target.value)}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        className="w-full text-sm"
                                                        placeholder="전화번호"
                                                        value={contact.phone}
                                                        onChange={(event) => updateContactField(index, 'phone', event.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeContact(index)}
                                                        className="rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                        aria-label="연락처 삭제"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="mb-6 border-b border-slate-100 pb-2 text-lg font-bold text-slate-900">
                                설정 및 범위
                            </h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="mb-3 block text-sm font-medium text-slate-700">프로젝트 유형</label>
                                    <div className="flex rounded-md shadow-sm">
                                        {projectTypeButtons.map((item, index) => {
                                            const isActive = projectType === item.key;
                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => setProjectType(item.key)}
                                                    className={[
                                                        'flex-1 border px-4 py-2.5 text-sm font-medium transition',
                                                        index === 0 ? 'rounded-l-lg' : '',
                                                        index === projectTypeButtons.length - 1 ? 'rounded-r-lg' : '',
                                                        isActive
                                                            ? 'z-10 border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                                                    ].join(' ')}
                                                >
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                    <div className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:flex-row md:items-center">
                                        <div className="flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-primary" />
                                            <span className="text-sm font-semibold text-slate-900">주요 설비 연동</span>
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
                                            <button
                                                type="button"
                                                onClick={() => setEquipmentMode('registered')}
                                                className={[
                                                    'rounded-md px-3 py-1.5 text-xs font-medium transition',
                                                    equipmentMode === 'registered'
                                                        ? 'bg-white text-primary shadow-sm'
                                                        : 'text-slate-600 hover:text-primary',
                                                ].join(' ')}
                                            >
                                                등록 설비 선택
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEquipmentMode('new')}
                                                className={[
                                                    'rounded-md px-3 py-1.5 text-xs font-medium transition',
                                                    equipmentMode === 'new'
                                                        ? 'bg-white text-primary shadow-sm'
                                                        : 'text-slate-600 hover:text-primary',
                                                ].join(' ')}
                                            >
                                                신규 설비 등록
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-3 p-6">
                                        {projectType === 'equipment' ? (
                                            <>
                                                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                                                    {equipmentMode === 'registered' ? '등록 설비 검색/입력' : '신규 설비 입력'}
                                                </label>
                                                <textarea
                                                    rows={4}
                                                    className="w-full rounded-lg border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-primary/20"
                                                    placeholder="설비명을 쉼표(,) 또는 줄바꿈으로 구분해 입력하세요. 예: Laser Cutter X-24, Robot Arm R2"
                                                    value={equipmentInput}
                                                    onChange={(event) => setEquipmentInput(event.target.value)}
                                                />
                                                <div className="flex items-start gap-2 text-xs text-slate-500">
                                                    <Search className="mt-0.5 h-4 w-4 text-blue-500" />
                                                    <p>생성 시 입력한 설비명으로 초기 설비 목록이 자동 등록됩니다.</p>
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-sm text-slate-500">파츠/AS 프로젝트는 설비 입력이 필요하지 않습니다.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="pt-2">
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={saveDraft}
                                    className="rounded-lg px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                                >
                                    임시 저장
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isSubmitting ? '생성 중...' : '프로젝트 생성'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default BudgetProjectCreate;
