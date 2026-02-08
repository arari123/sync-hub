import React, { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { api, getErrorMessage } from '../lib/api';

const ProjectPlaceholderPage = ({ title = '준비 중', description = '이 페이지는 준비 중입니다.' }) => {
    const { projectId } = useParams();
    const [project, setProject] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const load = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const versionsResp = await api.get(`/budget/projects/${projectId}/versions`);
                const payload = versionsResp?.data || {};
                setProject(payload.project || null);
            } catch (err) {
                setError(getErrorMessage(err, '프로젝트 정보를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [projectId]);

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel={title}
                canEdit={project.can_edit}
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                    { label: title },
                ]}
            />

            {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">
                    {error}
                </div>
            )}

            <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 shadow-sm">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wrench className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </section>
        </div>
    );
};

export default ProjectPlaceholderPage;
