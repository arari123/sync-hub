import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import BudgetBreadcrumb from '../components/BudgetBreadcrumb';

const BudgetProjectCreate = () => {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [installationSite, setInstallationSite] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createProject = async (event) => {
        event.preventDefault();
        if (!name.trim()) {
            setError('프로젝트 이름을 입력해 주세요.');
            return;
        }

        setError('');
        setIsSubmitting(true);
        try {
            const created = await api.post('/budget/projects', {
                name: name.trim(),
                code: code.trim(),
                description: description.trim(),
                customer_name: customerName.trim(),
                installation_site: installationSite.trim(),
            });
            const projectId = created?.data?.id;
            if (!projectId) {
                throw new Error('project_id_missing');
            }

            await api.post(`/budget/projects/${projectId}/versions`, { stage: 'review' });
            navigate(`/budget-management/projects/${projectId}`);
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
                    { label: '예산관리', to: '/budget-management' },
                    { label: '프로젝트 생성' },
                ]}
            />

            <section className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">예산관리</p>
                        <h1 className="text-2xl font-bold">신규 프로젝트 생성</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            프로젝트를 생성하면 예산 요약 페이지로 이동합니다.
                        </p>
                    </div>
                    <Link
                        to="/budget-management"
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
                        {isSubmitting ? '생성 중...' : '생성 후 요약 페이지로 이동'}
                    </button>
                </form>
            </section>
        </div>
    );
};

export default BudgetProjectCreate;
