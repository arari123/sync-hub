import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { getCurrentUser } from '../lib/session';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';

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

const BudgetProjectCreate = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [projectType, setProjectType] = useState('equipment');
    const [equipmentInput, setEquipmentInput] = useState('');
    const [description, setDescription] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [installationSite, setInstallationSite] = useState('');
    const [managerUserId, setManagerUserId] = useState('');
    const [managerOptions, setManagerOptions] = useState([]);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const currentUser = getCurrentUser();
        if (currentUser?.id) {
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
                if (!currentUser?.id) {
                    setManagerUserId(String(options[0].id));
                    return;
                }
                const exists = options.some((item) => Number(item?.id) === Number(currentUser.id));
                if (!exists) {
                    setManagerUserId(String(options[0].id));
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
            navigate(`/project-management/projects/${projectId}`);
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 생성에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-5">
            <BudgetBreadcrumb
                items={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: '프로젝트 생성' },
                ]}
            />

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">프로젝트 관리</p>
                        <h1 className="text-2xl font-bold">신규 프로젝트 생성</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            프로젝트를 생성하면 프로젝트 상세 페이지로 이동합니다.
                        </p>
                    </div>
                    <Link
                        to="/project-management"
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        목록으로
                    </Link>
                </div>
            </section>

            {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">기본 정보</h2>
                <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={createProject}>
                    <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="프로젝트 이름"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="프로젝트 코드(선택)"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                    />
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={projectType}
                        onChange={(event) => setProjectType(event.target.value)}
                    >
                        <option value="equipment">설비</option>
                        <option value="parts">파츠</option>
                        <option value="as">AS</option>
                    </select>
                    <textarea
                        className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={projectType === 'equipment'
                            ? '설비명 입력 (필수)\n예: 설비1'
                            : '설비 입력 불필요'}
                        value={equipmentInput}
                        onChange={(event) => setEquipmentInput(event.target.value)}
                        disabled={projectType !== 'equipment'}
                    />
                    <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="고객사(선택)"
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                    />
                    <input
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        placeholder="설치 장소(선택)"
                        value={installationSite}
                        onChange={(event) => setInstallationSite(event.target.value)}
                    />
                    <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
                    <textarea
                        className="min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
                        placeholder="개요(선택)"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
                    >
                        <Plus className="h-4 w-4" />
                        {isSubmitting ? '생성 중...' : '생성 후 프로젝트 상세로 이동'}
                    </button>
                </form>
            </section>
        </div>
    );
};

export default BudgetProjectCreate;
