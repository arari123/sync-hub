import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import AgendaSplitView from '../components/agenda/AgendaSplitView';
import { api, getErrorMessage } from '../lib/api';

export default function AgendaList() {
    const { projectId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadProject = async () => {
            if (!projectId) return;
            try {
                const response = await api.get(`/agenda/projects/${projectId}/meta`);
                setProject(response?.data?.project || null);
            } catch (err) {
                setError(getErrorMessage(err, '프로젝트 정보를 불러오지 못했습니다.'));
            }
        };

        loadProject();
    }, [projectId]);

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project?.id || projectId}
                projectName={project?.name || '프로젝트'}
                projectCode={project?.code || ''}
                pageLabel="안건 관리"
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project?.name || '프로젝트', to: `/project-management/projects/${projectId}` },
                    { label: '안건 관리' },
                ]}
                actions={(
                    <button
                        type="button"
                        onClick={() => navigate(`/project-management/projects/${projectId}/agenda/new`)}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700"
                    >
                        <Plus className="h-4 w-4" /> 안건 작성
                    </button>
                )}
            />

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}

            <AgendaSplitView
                mode="project"
                projectId={projectId}
            />
        </div>
    );
}
