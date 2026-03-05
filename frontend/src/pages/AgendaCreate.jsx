import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Send, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import RichTextEditor from '../components/agenda/RichTextEditor';
import { api, getErrorMessage } from '../lib/api';
import { markAgendaEntrySeen, markAgendaThreadSeen } from '../lib/agendaSeen';
import { downloadFromApi } from '../lib/download';
import { cn } from '../lib/utils';
import { INPUT_COMMON_CLASS } from '../components/ui/Input';

const TAB_GENERAL = 'general';
const TAB_REPORT = 'work_report';
const REPORT_WIZARD_STEPS = [
    { index: 1, label: '기본 정보' },
    { index: 2, label: '대상/자원' },
    { index: 3, label: '조치 내용' },
    { index: 4, label: '첨부/검토' },
];

function emptyWorker() {
    return { worker_name: '', worker_affiliation: '', work_hours: 0 };
}

function emptyPart() {
    return { part_name: '', manufacturer: '', model_name: '', quantity: 1 };
}

function emptyForm() {
    return {
        title: '',
        content_html: '',
        content_plain: '',
        requester_name: '',
        requester_org: '',
        responder_name: '',
        responder_org: '',
        progress_status: 'in_progress',
        request_date: '',
        work_date_start: '',
        work_date_end: '',
        work_location: '',
        target_equipments: [],
        workers: [emptyWorker()],
        parts: [emptyPart()],
        report_sections: {
            symptom: '',
            cause: '',
            interim_action: '',
            final_action: '',
        },
    };
}

function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function stripHtmlText(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (typeof window === 'undefined') {
        return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const node = document.createElement('div');
    node.innerHTML = raw;
    return (node.textContent || node.innerText || '').replace(/\s+/g, ' ').trim();
}

function resolveReportSectionHtml(reportSections, key) {
    const sections = reportSections && typeof reportSections === 'object' ? reportSections : {};
    const raw = sections?.[key];
    if (raw && typeof raw === 'object') {
        return String(raw?.html || '').trim();
    }
    return String(raw || '').trim();
}

export default function AgendaCreate() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const searchKey = searchParams.toString();

    const [project, setProject] = useState(null);
    const [meta, setMeta] = useState({ users: [], equipments: [], current_user: null });
    const [activeTab, setActiveTab] = useState(TAB_GENERAL);
    const [reportWizardStep, setReportWizardStep] = useState(1);
    const [form, setForm] = useState(emptyForm());
    const [draftThreadId, setDraftThreadId] = useState(null);
    const [existingAttachments, setExistingAttachments] = useState([]);
    const [newFiles, setNewFiles] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');

    const isEditDraft = useMemo(() => Boolean(draftThreadId), [draftThreadId]);
    const isReportMode = activeTab === TAB_REPORT;

    useEffect(() => {
        const loadMeta = async () => {
            if (!projectId) return;
            setIsLoading(true);
            setError('');
            try {
                const response = await api.get(`/agenda/projects/${projectId}/meta`);
                const payload = response?.data || {};
                setProject(payload.project || null);
                setMeta({
                    users: Array.isArray(payload.users) ? payload.users : [],
                    equipments: Array.isArray(payload.equipments) ? payload.equipments : [],
                    current_user: payload.current_user || null,
                });
            } catch (err) {
                setError(getErrorMessage(err, '안건 작성 기본 정보를 불러오지 못했습니다.'));
            } finally {
                setIsLoading(false);
            }
        };

        loadMeta();
    }, [projectId]);

    useEffect(() => {
        if (!project && !meta?.current_user) {
            return;
        }

        const draftId = Number(searchParams.get('draft') || 0);
        const reregisterId = Number(searchParams.get('reregister') || 0);

        const loadFromDraft = async () => {
            if (!draftId || draftId <= 0) return false;
            try {
                setIsLoading(true);
                const response = await api.get(`/agenda/threads/${draftId}`);
                const payload = response?.data || {};
                const thread = payload.thread || {};
                const root = payload.root_entry || {};
                const rootPayload = root.payload || {};

                try {
                    const lastUpdatedAt = String(thread?.last_updated_at || thread?.updated_at || '').trim();
                    markAgendaThreadSeen(draftId, lastUpdatedAt);
                    const rootEntryId = Number(root?.id || 0);
                    const rootUpdatedAt = String(root?.updated_at || '').trim();
                    markAgendaEntrySeen(rootEntryId, rootUpdatedAt);
                } catch (error) {
                    // ignore
                }

                setDraftThreadId(draftId);
                setActiveTab(thread.thread_kind === TAB_REPORT ? TAB_REPORT : TAB_GENERAL);
                setExistingAttachments(Array.isArray(root.attachments) ? root.attachments : []);
                setForm({
                    title: root.title || '',
                    content_html: root.content_html || '',
                    content_plain: root.content_plain || '',
                    requester_name: root.requester_name || '',
                    requester_org: root.requester_org || '',
                    responder_name: root.responder_name || '',
                    responder_org: root.responder_org || '',
                    progress_status: thread.progress_status || 'in_progress',
                    request_date: rootPayload.request_date || '',
                    work_date_start: rootPayload.work_date_start || '',
                    work_date_end: rootPayload.work_date_end || '',
                    work_location: rootPayload.work_location || '',
                    target_equipments: Array.isArray(rootPayload.target_equipments) ? rootPayload.target_equipments : [],
                    workers: Array.isArray(rootPayload.workers) && rootPayload.workers.length > 0
                        ? rootPayload.workers
                        : [emptyWorker()],
                    parts: Array.isArray(rootPayload.parts) && rootPayload.parts.length > 0
                        ? rootPayload.parts
                        : [emptyPart()],
                    report_sections: {
                        symptom: resolveReportSectionHtml(rootPayload.report_sections, 'symptom'),
                        cause: resolveReportSectionHtml(rootPayload.report_sections, 'cause'),
                        interim_action: resolveReportSectionHtml(rootPayload.report_sections, 'interim_action'),
                        final_action: resolveReportSectionHtml(rootPayload.report_sections, 'final_action'),
                    },
                });
                setNotice('임시 저장 안건을 불러왔습니다.');
                return true;
            } catch (err) {
                setError(getErrorMessage(err, '임시 저장 안건을 불러오지 못했습니다.'));
                return false;
            } finally {
                setIsLoading(false);
            }
        };

        const loadFromReregister = async () => {
            if (!reregisterId || reregisterId <= 0) return false;
            try {
                setIsLoading(true);
                const response = await api.get(`/agenda/threads/${reregisterId}/reregister-payload`);
                const payload = response?.data || {};
                const reportPayload = payload.report_payload || {};

                setDraftThreadId(null);
                setExistingAttachments([]);
                setActiveTab(payload.thread_kind === TAB_REPORT ? TAB_REPORT : TAB_GENERAL);
                setForm((prev) => ({
                    ...prev,
                    title: payload.title || '',
                    content_html: payload.content_html || '',
                    content_plain: payload.content_plain || '',
                    requester_name: payload.requester_name || '',
                    requester_org: payload.requester_org || '',
                    responder_name: payload.responder_name || '',
                    responder_org: payload.responder_org || '',
                    progress_status: payload.progress_status || 'in_progress',
                    request_date: reportPayload.request_date || '',
                    work_date_start: reportPayload.work_date_start || '',
                    work_date_end: reportPayload.work_date_end || '',
                    work_location: reportPayload.work_location || '',
                    target_equipments: Array.isArray(reportPayload.target_equipments) ? reportPayload.target_equipments : [],
                    workers: Array.isArray(reportPayload.workers) && reportPayload.workers.length > 0
                        ? reportPayload.workers
                        : [emptyWorker()],
                    parts: Array.isArray(reportPayload.parts) && reportPayload.parts.length > 0
                        ? reportPayload.parts
                        : [emptyPart()],
                    report_sections: {
                        symptom: resolveReportSectionHtml(reportPayload.report_sections, 'symptom'),
                        cause: resolveReportSectionHtml(reportPayload.report_sections, 'cause'),
                        interim_action: resolveReportSectionHtml(reportPayload.report_sections, 'interim_action'),
                        final_action: resolveReportSectionHtml(reportPayload.report_sections, 'final_action'),
                    },
                }));
                setNotice('기존 안건 내용이 재등록 템플릿으로 채워졌습니다.');
                return true;
            } catch (err) {
                setError(getErrorMessage(err, '재등록 데이터를 불러오지 못했습니다.'));
                return false;
            } finally {
                setIsLoading(false);
            }
        };

        if (draftId > 0) {
            loadFromDraft();
            return;
        }

        if (reregisterId > 0) {
            loadFromReregister();
            return;
        }

        setDraftThreadId(null);
        setExistingAttachments([]);
        setForm((prev) => ({
            ...prev,
            requester_name: prev.requester_name || '',
            requester_org: prev.requester_org || '',
        }));
    }, [project, meta?.current_user, searchKey]);

    useEffect(() => {
        if (!project) return;
        setForm((prev) => {
            if (activeTab !== TAB_REPORT) return prev;
            if (prev.requester_name || prev.work_location) return prev;
            return {
                ...prev,
                requester_name: project.customer_name || '',
                requester_org: project.customer_name || '',
                work_location: project.installation_site || '',
            };
        });
    }, [activeTab, project]);

    useEffect(() => {
        if (activeTab !== TAB_REPORT) return;
        setReportWizardStep(1);
    }, [activeTab]);

    const inputClass = cn(INPUT_COMMON_CLASS, 'rounded-lg');

    const setField = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const setReportSection = (field, value) => {
        setForm((prev) => ({
            ...prev,
            report_sections: {
                ...prev.report_sections,
                [field]: value,
            },
        }));
    };

    const validateReportStep = (stepIndex) => {
        if (stepIndex === 1) {
            if (!form.title.trim()) return '작업보고서 제목을 입력해 주세요.';
            if (!form.requester_name.trim()) return '작업보고서 요청자는 필수입니다.';
            return '';
        }
        if (stepIndex === 3) {
            const symptomPlain = stripHtmlText(form.report_sections.symptom);
            const finalActionPlain = stripHtmlText(form.report_sections.final_action);
            if (!symptomPlain) return '작업보고서 현상은 필수입니다.';
            if (!finalActionPlain) return '작업보고서 최종 조치사항은 필수입니다.';
            return '';
        }
        return '';
    };

    const moveReportWizardStep = (direction) => {
        if (activeTab !== TAB_REPORT) return;
        if (direction > 0) {
            const errorMessage = validateReportStep(reportWizardStep);
            if (errorMessage) {
                setError(errorMessage);
                return;
            }
            setError('');
            setReportWizardStep((prev) => Math.min(4, prev + 1));
            return;
        }
        setError('');
        setReportWizardStep((prev) => Math.max(1, prev - 1));
    };

    const updateWorker = (index, field, value) => {
        setForm((prev) => {
            const nextWorkers = prev.workers.map((worker, workerIndex) => (
                workerIndex === index
                    ? { ...worker, [field]: field === 'work_hours' ? numberValue(value, 0) : value }
                    : worker
            ));
            return { ...prev, workers: nextWorkers };
        });
    };

    const addWorker = () => {
        setForm((prev) => {
            const defaultHours = prev.workers[0]?.work_hours || 0;
            return {
                ...prev,
                workers: [...prev.workers, { ...emptyWorker(), work_hours: defaultHours }],
            };
        });
    };

    const removeWorker = (index) => {
        setForm((prev) => {
            const next = prev.workers.filter((_, workerIndex) => workerIndex !== index);
            return { ...prev, workers: next.length > 0 ? next : [emptyWorker()] };
        });
    };

    const updatePart = (index, field, value) => {
        setForm((prev) => {
            const next = prev.parts.map((item, itemIndex) => (
                itemIndex === index
                    ? { ...item, [field]: field === 'quantity' ? numberValue(value, 0) : value }
                    : item
            ));
            return { ...prev, parts: next };
        });
    };

    const addPart = () => {
        setForm((prev) => ({ ...prev, parts: [...prev.parts, emptyPart()] }));
    };

    const removePart = (index) => {
        setForm((prev) => {
            const next = prev.parts.filter((_, partIndex) => partIndex !== index);
            return { ...prev, parts: next.length > 0 ? next : [emptyPart()] };
        });
    };

    const handleEquipmentChange = (event) => {
        const selected = Array.from(event.target.selectedOptions || []).map((option) => option.value);
        setField('target_equipments', selected);
    };

    const handleAttachFiles = (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        setNewFiles((prev) => [...prev, ...files]);
        event.target.value = '';
    };

    const removeNewFile = (fileIndex) => {
        setNewFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    };

    const buildPayload = (saveMode) => {
        const threadKind = activeTab === TAB_REPORT ? TAB_REPORT : TAB_GENERAL;
        const isReportThread = threadKind === TAB_REPORT;
        return {
            thread_kind: threadKind,
            save_mode: saveMode,
            title: form.title,
            content_html: isReportThread ? '' : form.content_html,
            content_plain: isReportThread ? '' : form.content_plain,
            requester_name: form.requester_name,
            requester_org: form.requester_org,
            responder_name: form.responder_name,
            responder_org: form.responder_org,
            progress_status: form.progress_status,
            request_date: form.request_date,
            work_date_start: form.work_date_start,
            work_date_end: form.work_date_end,
            work_location: form.work_location,
            target_equipments: form.target_equipments,
            workers: form.workers,
            parts: form.parts,
            report_sections: form.report_sections,
        };
    };

    const handleSubmit = async (saveMode) => {
        if (!projectId) return;
        setError('');
        setNotice('');

        if (!form.title.trim()) {
            setError('제목을 입력해 주세요.');
            return;
        }

        if (activeTab === TAB_REPORT) {
            if (!form.requester_name.trim()) {
                setError('작업보고서 요청자는 필수입니다.');
                return;
            }
            if (!stripHtmlText(form.report_sections.symptom)) {
                setError('작업보고서 현상은 필수입니다.');
                return;
            }
            if (!stripHtmlText(form.report_sections.final_action)) {
                setError('작업보고서 최종 조치사항은 필수입니다.');
                return;
            }
        }

        const formData = new FormData();
        formData.append('payload', JSON.stringify(buildPayload(saveMode)));
        newFiles.forEach((file) => formData.append('files', file));

        setIsSubmitting(true);
        try {
            const response = draftThreadId
                ? await api.put(`/agenda/threads/${draftThreadId}/draft`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                : await api.post(`/agenda/projects/${projectId}/threads`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

            const payload = response?.data || {};
            const nextThreadId = payload.thread_id;
            const nextStatus = payload.record_status;

            if (nextThreadId) {
                setDraftThreadId(nextThreadId);
            }

            if (nextStatus === 'published') {
                navigate(`/project-management/projects/${projectId}/agenda/${nextThreadId}`);
                return;
            }

            setNotice(payload.message || '임시 저장되었습니다.');
            setNewFiles([]);
            if (nextThreadId) {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('draft', String(nextThreadId));
                nextParams.delete('reregister');
                setSearchParams(nextParams, { replace: true });
            }
        } catch (err) {
            setError(getErrorMessage(err, '안건 저장에 실패했습니다.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <p className="text-sm text-slate-500">안건 작성 정보를 불러오는 중...</p>;
    }

    if (!project) {
        return <p className="text-sm text-slate-500">프로젝트 정보를 찾을 수 없습니다.</p>;
    }

    const reportSymptomFilled = Boolean(stripHtmlText(form.report_sections.symptom));
    const reportFinalActionFilled = Boolean(stripHtmlText(form.report_sections.final_action));
    const reportReadyToPublish = Boolean(form.title.trim() && form.requester_name.trim() && reportSymptomFilled && reportFinalActionFilled);

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="안건 작성"
                breadcrumbItems={[
                    { label: '메인 페이지', to: '/project-management' },
                    { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                    { label: '안건 관리', to: `/project-management/projects/${project.id}/agenda` },
                    { label: '안건 작성' },
                ]}
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => navigate(`/project-management/projects/${project.id}/agenda`)}
                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            목록으로
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit('draft')}
                            disabled={isSubmitting}
                            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Save className="h-4 w-4" /> 임시 저장
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSubmit('published')}
                            disabled={isSubmitting}
                            className="inline-flex h-9 items-center gap-1 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Send className="h-4 w-4" /> 등록
                        </button>
                    </>
                )}
            />

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}
            {notice && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {notice}
                </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab(TAB_GENERAL)}
                        className={cn(
                            'inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold',
                            activeTab === TAB_GENERAL
                                ? 'border-cyan-600 bg-cyan-50 text-cyan-700'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                    >
                        일반 안건
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab(TAB_REPORT);
                            setReportWizardStep(1);
                        }}
                        className={cn(
                            'inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold',
                            activeTab === TAB_REPORT
                                ? 'border-cyan-600 bg-cyan-50 text-cyan-700'
                                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                    >
                        작업보고서
                    </button>

                    <span className="ml-auto text-xs text-slate-500">
                        작성자: {meta.current_user?.name || '-'}
                        {isEditDraft ? ' · 임시 저장 편집 중' : ''}
                    </span>
                </div>
            </section>

            {isReportMode && (
                <section className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        {REPORT_WIZARD_STEPS.map((step) => (
                            <button
                                key={`report-wizard-step-${step.index}`}
                                type="button"
                                onClick={() => {
                                    if (step.index > reportWizardStep) return;
                                    setReportWizardStep(step.index);
                                    setError('');
                                }}
                                disabled={step.index > reportWizardStep}
                                className={cn(
                                    'inline-flex h-8 items-center rounded-md border px-3 text-xs font-bold',
                                    reportWizardStep === step.index
                                        ? 'border-cyan-600 bg-cyan-600 text-white'
                                        : 'border-cyan-200 bg-white text-cyan-700',
                                    step.index > reportWizardStep && 'cursor-not-allowed opacity-60',
                                )}
                            >
                                {step.index}. {step.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs font-medium text-cyan-800">
                        단계별 입력으로 누락을 줄입니다. 현재 단계: {reportWizardStep} / {REPORT_WIZARD_STEPS.length}
                    </p>
                </section>
            )}

            {(!isReportMode || reportWizardStep === 1) && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">제목</span>
                        <input
                            value={form.title}
                            onChange={(event) => setField('title', event.target.value)}
                            className={inputClass}
                            placeholder="안건 제목을 입력하세요."
                        />
                    </label>

                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">상태</span>
                        <select
                            value={form.progress_status}
                            onChange={(event) => setField('progress_status', event.target.value)}
                            className={inputClass}
                        >
                            <option value="in_progress">진행 중</option>
                            <option value="completed">완료</option>
                        </select>
                    </label>

                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">요청자</span>
                        <input
                            value={form.requester_name}
                            onChange={(event) => setField('requester_name', event.target.value)}
                            className={inputClass}
                            placeholder="요청자 이름"
                        />
                    </label>

                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">요청자 소속</span>
                        <input
                            value={form.requester_org}
                            onChange={(event) => setField('requester_org', event.target.value)}
                            className={inputClass}
                            placeholder="자사 / 고객사 / 협력사"
                        />
                    </label>

                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">답변자</span>
                        <input
                            value={form.responder_name}
                            onChange={(event) => setField('responder_name', event.target.value)}
                            className={inputClass}
                            placeholder="답변자 이름 (선택)"
                        />
                    </label>

                    <label className="space-y-1">
                        <span className="text-sm font-semibold text-slate-700">답변자 소속</span>
                        <input
                            value={form.responder_org}
                            onChange={(event) => setField('responder_org', event.target.value)}
                            className={inputClass}
                            placeholder="자사 / 고객사 / 협력사"
                        />
                    </label>
                </div>
                </section>
            )}

            {activeTab === TAB_REPORT && (
                <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800">
                        작업보고서 항목
                        <span className="ml-2 text-xs font-semibold text-slate-500">({reportWizardStep}/4 단계)</span>
                    </h3>

                    {reportWizardStep === 1 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">요청일</span>
                                    <input
                                        type="date"
                                        value={form.request_date}
                                        onChange={(event) => setField('request_date', event.target.value)}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">작업 시작일</span>
                                    <input
                                        type="date"
                                        value={form.work_date_start}
                                        onChange={(event) => setField('work_date_start', event.target.value)}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-sm font-semibold text-slate-700">작업 종료일</span>
                                    <input
                                        type="date"
                                        value={form.work_date_end}
                                        onChange={(event) => setField('work_date_end', event.target.value)}
                                        className={inputClass}
                                    />
                                </label>
                            </div>

                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">작업 장소</span>
                                <input
                                    value={form.work_location}
                                    onChange={(event) => setField('work_location', event.target.value)}
                                    className={inputClass}
                                    placeholder="작업 장소"
                                />
                            </label>
                        </div>
                    )}

                    {reportWizardStep === 2 && (
                        <div className="space-y-4">
                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">대상 설비 (복수 선택)</span>
                                <select
                                    multiple
                                    value={form.target_equipments}
                                    onChange={handleEquipmentChange}
                                    className={`${inputClass} min-h-[110px]`}
                                >
                                    {(meta.equipments || []).map((equipment) => (
                                        <option key={equipment} value={equipment}>{equipment}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500">Ctrl/Cmd를 누른 채 복수 선택할 수 있습니다.</p>
                            </label>

                            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-slate-700">작업자 및 작업시간</h4>
                                    <button
                                        type="button"
                                        onClick={addWorker}
                                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> 작업자 추가
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {form.workers.map((worker, index) => (
                                        <div key={`worker-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[1fr_1fr_120px_40px]">
                                            <input
                                                value={worker.worker_name || ''}
                                                onChange={(event) => updateWorker(index, 'worker_name', event.target.value)}
                                                className={inputClass}
                                                placeholder="작업자"
                                            />
                                            <input
                                                value={worker.worker_affiliation || ''}
                                                onChange={(event) => updateWorker(index, 'worker_affiliation', event.target.value)}
                                                className={inputClass}
                                                placeholder="소속 (공백 시 자사)"
                                            />
                                            <input
                                                type="number"
                                                value={worker.work_hours ?? 0}
                                                onChange={(event) => updateWorker(index, 'work_hours', event.target.value)}
                                                className={inputClass}
                                                placeholder="작업시간"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeWorker(index)}
                                                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-slate-700">사용 파츠</h4>
                                    <button
                                        type="button"
                                        onClick={addPart}
                                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> 파츠 추가
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {form.parts.map((part, index) => (
                                        <div key={`part-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[1fr_1fr_1fr_100px_40px]">
                                            <input
                                                value={part.part_name || ''}
                                                onChange={(event) => updatePart(index, 'part_name', event.target.value)}
                                                className={inputClass}
                                                placeholder="명칭"
                                            />
                                            <input
                                                value={part.manufacturer || ''}
                                                onChange={(event) => updatePart(index, 'manufacturer', event.target.value)}
                                                className={inputClass}
                                                placeholder="제조사"
                                            />
                                            <input
                                                value={part.model_name || ''}
                                                onChange={(event) => updatePart(index, 'model_name', event.target.value)}
                                                className={inputClass}
                                                placeholder="모델"
                                            />
                                            <input
                                                type="number"
                                                value={part.quantity ?? 1}
                                                onChange={(event) => updatePart(index, 'quantity', event.target.value)}
                                                className={inputClass}
                                                placeholder="수량"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removePart(index)}
                                                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {reportWizardStep === 3 && (
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <div className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">현상 (필수)</span>
                                <RichTextEditor
                                    value={form.report_sections.symptom}
                                    onChange={(htmlValue) => setReportSection('symptom', htmlValue)}
                                    placeholder="현상을 입력하세요."
                                    minHeight={220}
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">원인</span>
                                <RichTextEditor
                                    value={form.report_sections.cause}
                                    onChange={(htmlValue) => setReportSection('cause', htmlValue)}
                                    placeholder="원인을 입력하세요."
                                    minHeight={220}
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">조치사항 (중간)</span>
                                <RichTextEditor
                                    value={form.report_sections.interim_action}
                                    onChange={(htmlValue) => setReportSection('interim_action', htmlValue)}
                                    placeholder="중간 조치사항을 입력하세요."
                                    minHeight={220}
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm font-semibold text-slate-700">조치사항 (최종, 필수)</span>
                                <RichTextEditor
                                    value={form.report_sections.final_action}
                                    onChange={(htmlValue) => setReportSection('final_action', htmlValue)}
                                    placeholder="최종 조치사항을 입력하세요."
                                    minHeight={220}
                                />
                            </div>
                        </div>
                    )}

                    {reportWizardStep === 4 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <h4 className="text-sm font-semibold text-slate-800">등록 전 점검</h4>
                            <ul className="mt-2 space-y-1 text-xs text-slate-600">
                                <li>제목: {form.title.trim() ? '입력됨' : '미입력'}</li>
                                <li>요청자: {form.requester_name.trim() ? '입력됨' : '미입력'}</li>
                                <li>현상: {reportSymptomFilled ? '입력됨' : '미입력'}</li>
                                <li>최종 조치사항: {reportFinalActionFilled ? '입력됨' : '미입력'}</li>
                                <li>첨부파일: {newFiles.length > 0 ? `${newFiles.length}개 선택` : '선택 안 함'}</li>
                            </ul>
                            <p className={cn(
                                'mt-3 text-xs font-semibold',
                                reportReadyToPublish ? 'text-emerald-700' : 'text-amber-700',
                            )}
                            >
                                {reportReadyToPublish
                                    ? '필수 항목이 입력되어 바로 등록할 수 있습니다.'
                                    : '필수 항목(제목, 요청자, 현상, 최종 조치사항)을 확인해 주세요.'}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                        <button
                            type="button"
                            onClick={() => moveReportWizardStep(-1)}
                            disabled={reportWizardStep <= 1}
                            className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            이전 단계
                        </button>
                        <button
                            type="button"
                            onClick={() => moveReportWizardStep(1)}
                            disabled={reportWizardStep >= REPORT_WIZARD_STEPS.length}
                            className="inline-flex h-8 items-center rounded-md bg-cyan-600 px-3 text-xs font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            다음 단계
                        </button>
                    </div>
                </section>
            )}

            {activeTab !== TAB_REPORT && (
                <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800">본문</h3>
                    <RichTextEditor
                        value={form.content_html}
                        onChange={(htmlValue, plainValue) => {
                            setField('content_html', htmlValue);
                            setField('content_plain', plainValue);
                        }}
                        placeholder="안건 본문을 입력하세요. 이미지 붙여넣기를 지원합니다."
                        minHeight={300}
                    />
                </section>
            )}

            {(!isReportMode || reportWizardStep === 4) && (
                <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800">자료 첨부</h3>
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    파일 추가
                    <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleAttachFiles}
                    />
                </label>

                {existingAttachments.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold text-slate-600">기존 첨부파일</p>
                        {existingAttachments.map((item) => (
                            <button
                                key={`existing-${item.id}`}
                                type="button"
                                onClick={() => downloadFromApi(item.download_url, item.original_filename)}
                                className="block text-xs text-slate-700 underline-offset-2 hover:underline"
                            >
                                {item.original_filename}
                            </button>
                        ))}
                        <p className="text-[11px] text-slate-500">
                            새 파일을 선택하고 저장하면 기존 파일은 새 선택 파일로 교체됩니다.
                        </p>
                    </div>
                )}

                {newFiles.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                        <p className="text-xs font-semibold text-cyan-700">이번 저장에 포함될 파일</p>
                        {newFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs text-cyan-900">
                                <span className="truncate">{file.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeNewFile(index)}
                                    className="rounded border border-cyan-300 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100"
                                >
                                    제거
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                </section>
            )}
        </div>
    );
}
