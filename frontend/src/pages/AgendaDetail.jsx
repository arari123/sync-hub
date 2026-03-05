import { useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    Copy,
    MessageCircle,
    Paperclip,
    Reply,
    Send,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import RichTextEditor from '../components/agenda/RichTextEditor';
import { api, getErrorMessage } from '../lib/api';
import { markAgendaEntrySeen, markAgendaThreadSeen } from '../lib/agendaSeen';
import { downloadFromApi } from '../lib/download';
import { cn } from '../lib/utils';
import { INPUT_COMMON_CLASS } from '../components/ui/Input';

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

function resolveReportSection(reportSections, key) {
    const sections = reportSections && typeof reportSections === 'object' ? reportSections : {};
    const storedPlain = String(sections?.[`${key}_plain`] || '').trim();
    const rawValue = sections?.[key];

    if (rawValue && typeof rawValue === 'object') {
        const htmlValue = String(rawValue?.html || '').trim();
        const plainValue = String(rawValue?.plain || '').trim();
        return {
            html: htmlValue,
            plain: plainValue || storedPlain || stripHtmlText(htmlValue),
        };
    }

    const htmlValue = String(rawValue || '').trim();
    return {
        html: htmlValue,
        plain: storedPlain || stripHtmlText(htmlValue),
    };
}

function WorkReportSectionsPanel({ reportSections }) {
    const sectionItems = [
        { key: 'symptom', label: '현상' },
        { key: 'cause', label: '원인' },
        { key: 'interim_action', label: '조치사항 (중간)' },
        { key: 'final_action', label: '조치사항 (최종)' },
    ];

    return (
        <div className="mt-4 grid grid-cols-1 gap-3">
            {sectionItems.map((item) => {
                const section = resolveReportSection(reportSections, item.key);
                return (
                    <section key={`report-section-${item.key}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <h4 className="text-xs font-black text-slate-700">{item.label}</h4>
                        <div className="prose prose-slate mt-2 max-w-none rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                            {section.html
                                ? <div dangerouslySetInnerHTML={{ __html: section.html }} />
                                : <p className="whitespace-pre-wrap text-sm text-slate-600">{section.plain || '-'}</p>}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function EntryPanel({ entry, label, tone = 'slate', threadKind = '' }) {
    if (!entry) return null;

    const toneClass = tone === 'cyan'
        ? 'border-cyan-200 bg-cyan-50/30'
        : tone === 'amber'
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-slate-200 bg-white';

    return (
        <article className={cn('rounded-xl border p-4 shadow-sm', toneClass)}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                {label && (
                    <span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600">
                        {label}
                    </span>
                )}
                <span className="text-[11px] text-slate-500">{entry.created_at?.slice(0, 16).replace('T', ' ')}</span>
            </div>

            <h3 className="text-lg font-bold text-slate-900">{entry.title}</h3>

            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                <p><span className="font-semibold text-slate-500">작성자</span> {entry.author_name || '-'}</p>
                <p><span className="font-semibold text-slate-500">요청자</span> {entry.requester_name || '-'}{entry.requester_org ? ` (${entry.requester_org})` : ''}</p>
                <p><span className="font-semibold text-slate-500">답변자</span> {entry.responder_name || '-'}{entry.responder_org ? ` (${entry.responder_org})` : ''}</p>
                <p><span className="font-semibold text-slate-500">첨부</span> {entry.attachment_count || 0}건</p>
            </div>

            {threadKind === 'work_report' ? (
                <WorkReportSectionsPanel reportSections={entry?.payload?.report_sections} />
            ) : (
                <div className="prose mt-4 max-w-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
                    {entry.content_html
                        ? <div dangerouslySetInnerHTML={{ __html: entry.content_html }} />
                        : <p>{entry.content_plain || '-'}</p>}
                </div>
            )}

            {(entry.attachments || []).length > 0 && (
                <div className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Paperclip className="h-3.5 w-3.5" /> 첨부 파일</p>
                    {(entry.attachments || []).map((attachment) => (
                        <button
                            key={`att-${attachment.id}`}
                            type="button"
                            onClick={() => downloadFromApi(attachment.download_url, attachment.original_filename)}
                            className="block truncate text-xs text-slate-700 underline-offset-2 hover:underline"
                        >
                            {attachment.original_filename}
                        </button>
                    ))}
                </div>
            )}
        </article>
    );
}

export default function AgendaDetail() {
    const { projectId, agendaId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [project, setProject] = useState(null);
    const [detail, setDetail] = useState(null);
    const [expandedEntryIds, setExpandedEntryIds] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isReplySubmitting, setIsReplySubmitting] = useState(false);
    const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
    const [isStatusSubmitting, setIsStatusSubmitting] = useState(false);

    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [commentText, setCommentText] = useState('');
    const [isReplyOpen, setIsReplyOpen] = useState(false);
    const [replyFiles, setReplyFiles] = useState([]);
    const [replyForm, setReplyForm] = useState({
        title: '',
        content_html: '',
        content_plain: '',
        requester_name: '',
        requester_org: '',
        responder_name: '',
        responder_org: '',
        request_date: '',
        work_date_start: '',
        work_date_end: '',
        work_location: '',
        target_equipments: [],
        workers: [{ worker_name: '', worker_affiliation: '', work_hours: 0 }],
        parts: [{ part_name: '', manufacturer: '', model_name: '', quantity: 1 }],
        report_sections: {
            symptom: '',
            cause: '',
            interim_action: '',
            final_action: '',
        },
    });

    const thread = detail?.thread || null;
    const rootEntry = detail?.root_entry || null;
    const latestEntry = detail?.latest_entry || null;
    const middleEntries = Array.isArray(detail?.middle_entries) ? detail.middle_entries : [];
    const comments = Array.isArray(detail?.comments) ? detail.comments : [];

    const isWorkReport = thread?.thread_kind === 'work_report';

    const latestIsDistinct = useMemo(() => {
        if (!latestEntry || !rootEntry) return false;
        return Number(latestEntry.id) !== Number(rootEntry.id);
    }, [latestEntry, rootEntry]);
    const openReplyByQuery = String(searchParams.get('reply') || '') === '1';

    const loadDetail = async ({ keepReplyForm = false } = {}) => {
        if (!agendaId || !projectId) return;
        setIsLoading(true);
        setError('');
        try {
            const [metaResponse, detailResponse] = await Promise.all([
                api.get(`/agenda/projects/${projectId}/meta`),
                api.get(`/agenda/threads/${agendaId}`),
            ]);
            setProject(metaResponse?.data?.project || null);
            const payload = detailResponse?.data || null;
            setDetail(payload);
            try {
                const threadId = Number(payload?.thread?.id || agendaId || 0);
                const lastUpdatedAt = String(payload?.thread?.last_updated_at || payload?.thread?.updated_at || '').trim();
                markAgendaThreadSeen(threadId, lastUpdatedAt);
                const entries = [];
                if (payload?.root_entry) entries.push(payload.root_entry);
                if (Array.isArray(payload?.middle_entries)) entries.push(...payload.middle_entries);
                if (payload?.latest_entry) entries.push(payload.latest_entry);
                const dedup = new Map();
                for (const item of entries) {
                    const entryId = Number(item?.id || 0);
                    if (!entryId || dedup.has(entryId)) continue;
                    dedup.set(entryId, item);
                }
                dedup.forEach((entry) => {
                    const entryId = Number(entry?.id || 0);
                    const entryUpdatedAt = String(entry?.updated_at || '').trim();
                    markAgendaEntrySeen(entryId, entryUpdatedAt);
                });
            } catch (error) {
                // ignore
            }

            if (!keepReplyForm) {
                const latest = payload?.latest_entry || {};
                const threadPayload = payload?.thread || {};
                const latestPayload = latest?.payload || {};

                setReplyForm((prev) => ({
                    ...prev,
                    title: latest.title ? `${latest.title} 답변` : '',
                    requester_name: latest.requester_name || threadPayload.requester_name || '',
                    requester_org: latest.requester_org || threadPayload.requester_org || '',
                    responder_name: '',
                    responder_org: '',
                    request_date: latestPayload.request_date || '',
                    work_date_start: latestPayload.work_date_start || '',
                    work_date_end: latestPayload.work_date_end || '',
                    work_location: latestPayload.work_location || '',
                    target_equipments: Array.isArray(latestPayload.target_equipments) ? latestPayload.target_equipments : [],
                    workers: Array.isArray(latestPayload.workers) && latestPayload.workers.length > 0
                        ? latestPayload.workers
                        : [{ worker_name: '', worker_affiliation: '', work_hours: 0 }],
                    parts: Array.isArray(latestPayload.parts) && latestPayload.parts.length > 0
                        ? latestPayload.parts
                        : [{ part_name: '', manufacturer: '', model_name: '', quantity: 1 }],
                    report_sections: {
                        symptom: resolveReportSection(latestPayload.report_sections, 'symptom').html,
                        cause: resolveReportSection(latestPayload.report_sections, 'cause').html,
                        interim_action: resolveReportSection(latestPayload.report_sections, 'interim_action').html,
                        final_action: resolveReportSection(latestPayload.report_sections, 'final_action').html,
                    },
                    content_html: '',
                    content_plain: '',
                }));
                setReplyFiles([]);
            }
        } catch (err) {
            setError(getErrorMessage(err, '안건 상세 정보를 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agendaId, projectId]);

    useEffect(() => {
        if (!openReplyByQuery) return;
        if (!detail?.can_reply) return;
        setIsReplyOpen(true);
    }, [detail?.can_reply, openReplyByQuery]);

    const toggleAllMiddle = () => {
        if (!middleEntries.length) return;
        const allIds = middleEntries.map((item) => Number(item.id));
        const expandedSet = new Set(expandedEntryIds);
        const isAllExpanded = allIds.every((id) => expandedSet.has(id));
        if (isAllExpanded) {
            setExpandedEntryIds([]);
            return;
        }
        setExpandedEntryIds(allIds);
    };

    const toggleMiddleEntry = (entryId) => {
        const id = Number(entryId);
        setExpandedEntryIds((prev) => {
            const hasId = prev.includes(id);
            if (hasId) {
                return prev.filter((item) => item !== id);
            }
            return [...prev, id];
        });
    };

    const handleStatusToggle = async () => {
        if (!thread || !detail?.can_change_status) return;
        const nextStatus = thread.progress_status === 'in_progress' ? 'completed' : 'in_progress';

        setIsStatusSubmitting(true);
        setError('');
        setNotice('');
        try {
            await api.patch(`/agenda/threads/${agendaId}/status`, { progress_status: nextStatus });
            setDetail((prev) => {
                if (!prev?.thread) return prev;
                return {
                    ...prev,
                    thread: {
                        ...prev.thread,
                        progress_status: nextStatus,
                    },
                };
            });
            setNotice('안건 상태가 변경되었습니다.');
        } catch (err) {
            setError(getErrorMessage(err, '안건 상태를 변경하지 못했습니다.'));
        } finally {
            setIsStatusSubmitting(false);
        }
    };

    const handleCommentSubmit = async () => {
        const body = commentText.trim();
        if (!body) return;

        setIsCommentSubmitting(true);
        setError('');
        try {
            const response = await api.post(`/agenda/threads/${agendaId}/comments`, { body });
            const created = response?.data || null;
            if (created) {
                setDetail((prev) => {
                    if (!prev) return prev;
                    const currentComments = Array.isArray(prev.comments) ? prev.comments : [];
                    const nextComments = [created, ...currentComments];
                    return {
                        ...prev,
                        comments: nextComments,
                        thread: {
                            ...prev.thread,
                            comment_count: (Number(prev.thread?.comment_count || 0) + 1),
                        },
                    };
                });
            }
            setCommentText('');
        } catch (err) {
            setError(getErrorMessage(err, '코멘트를 등록하지 못했습니다.'));
        } finally {
            setIsCommentSubmitting(false);
        }
    };

    const setReplyField = (field, value) => {
        setReplyForm((prev) => ({ ...prev, [field]: value }));
    };

    const setReplyReportSection = (field, value) => {
        setReplyForm((prev) => ({
            ...prev,
            report_sections: {
                ...prev.report_sections,
                [field]: value,
            },
        }));
    };

    const updateReplyWorker = (index, field, value) => {
        setReplyForm((prev) => ({
            ...prev,
            workers: prev.workers.map((worker, workerIndex) => (
                workerIndex === index
                    ? { ...worker, [field]: field === 'work_hours' ? numberValue(value, 0) : value }
                    : worker
            )),
        }));
    };

    const addReplyWorker = () => {
        setReplyForm((prev) => ({
            ...prev,
            workers: [...prev.workers, { worker_name: '', worker_affiliation: '', work_hours: prev.workers?.[0]?.work_hours || 0 }],
        }));
    };

    const removeReplyWorker = (index) => {
        setReplyForm((prev) => {
            const next = prev.workers.filter((_, workerIndex) => workerIndex !== index);
            return { ...prev, workers: next.length > 0 ? next : [{ worker_name: '', worker_affiliation: '', work_hours: 0 }] };
        });
    };

    const updateReplyPart = (index, field, value) => {
        setReplyForm((prev) => ({
            ...prev,
            parts: prev.parts.map((item, itemIndex) => (
                itemIndex === index
                    ? { ...item, [field]: field === 'quantity' ? numberValue(value, 0) : value }
                    : item
            )),
        }));
    };

    const addReplyPart = () => {
        setReplyForm((prev) => ({
            ...prev,
            parts: [...prev.parts, { part_name: '', manufacturer: '', model_name: '', quantity: 1 }],
        }));
    };

    const removeReplyPart = (index) => {
        setReplyForm((prev) => {
            const next = prev.parts.filter((_, partIndex) => partIndex !== index);
            return { ...prev, parts: next.length > 0 ? next : [{ part_name: '', manufacturer: '', model_name: '', quantity: 1 }] };
        });
    };

    const handleReplyFileAttach = (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        setReplyFiles((prev) => [...prev, ...files]);
        event.target.value = '';
    };

    const removeReplyFile = (index) => {
        setReplyFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
    };

    const handleReplySubmit = async () => {
        if (!thread) return;
        const title = replyForm.title.trim();
        if (!title) {
            setError('답변 제목을 입력해 주세요.');
            return;
        }

        if (isWorkReport) {
            const symptomPlain = stripHtmlText(replyForm.report_sections.symptom);
            const finalActionPlain = stripHtmlText(replyForm.report_sections.final_action);
            if (!symptomPlain) {
                setError('작업보고서 답변의 현상은 필수입니다.');
                return;
            }
            if (!finalActionPlain) {
                setError('작업보고서 답변의 최종 조치사항은 필수입니다.');
                return;
            }
        }

        const payload = {
            entry_kind: isWorkReport ? 'additional_work' : 'reply',
            title,
            content_html: isWorkReport ? '' : replyForm.content_html,
            content_plain: isWorkReport ? '' : replyForm.content_plain,
            requester_name: replyForm.requester_name,
            requester_org: replyForm.requester_org,
            responder_name: replyForm.responder_name,
            responder_org: replyForm.responder_org,
            request_date: replyForm.request_date,
            work_date_start: replyForm.work_date_start,
            work_date_end: replyForm.work_date_end,
            work_location: replyForm.work_location,
            target_equipments: replyForm.target_equipments,
            workers: replyForm.workers,
            parts: replyForm.parts,
            report_sections: replyForm.report_sections,
        };

        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));
        replyFiles.forEach((file) => formData.append('files', file));

        setIsReplySubmitting(true);
        setError('');
        setNotice('');
        try {
            await api.post(`/agenda/threads/${agendaId}/replies`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setNotice('답변 안건이 등록되었습니다.');
            setIsReplyOpen(false);
            await loadDetail({ keepReplyForm: false });
        } catch (err) {
            setError(getErrorMessage(err, '답변 안건을 등록하지 못했습니다.'));
        } finally {
            setIsReplySubmitting(false);
        }
    };

    if (isLoading) {
        return <p className="text-sm text-slate-500">안건 상세를 불러오는 중...</p>;
    }

    if (!thread) {
        return <p className="text-sm text-slate-500">안건 정보를 찾을 수 없습니다.</p>;
    }

    const inputClass = cn(INPUT_COMMON_CLASS, 'rounded-lg');

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project?.id || projectId}
                projectName={project?.name || '프로젝트'}
                projectCode={project?.code || ''}
                pageLabel="안건 상세"
                breadcrumbItems={[
                    { label: '메인 페이지', to: '/project-management' },
                    { label: project?.name || '프로젝트', to: `/project-management/projects/${projectId}` },
                    { label: '안건 관리', to: `/project-management/projects/${projectId}/agenda` },
                    { label: thread.agenda_code || `안건 #${agendaId}` },
                ]}
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => navigate(`/project-management/projects/${projectId}/agenda`)}
                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            목록으로
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(`/project-management/projects/${projectId}/agenda/new?reregister=${agendaId}`)}
                            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <Copy className="h-4 w-4" /> 재등록
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsReplyOpen((prev) => !prev)}
                            disabled={!detail?.can_reply}
                            className="inline-flex h-9 items-center gap-1 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Reply className="h-4 w-4" /> 답변 작성
                        </button>
                    </>
                )}
            />

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                        'inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold',
                        thread.progress_status === 'in_progress'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600',
                    )}
                    >
                        {thread.progress_status === 'in_progress' ? '진행 중' : '완료'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{thread.agenda_code}</span>
                    <span className="text-xs text-slate-400">업데이트 {thread.last_updated_at?.slice(0, 16).replace('T', ' ')}</span>
                    {detail?.can_change_status && (
                        <button
                            type="button"
                            onClick={handleStatusToggle}
                            disabled={isStatusSubmitting}
                            className="ml-auto inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            상태 변경
                        </button>
                    )}
                </div>
                <h2 className="mt-2 text-xl font-black text-slate-900">{thread.root_title || thread.title}</h2>
                {latestIsDistinct && (
                    <p className="mt-1 text-sm font-medium text-slate-600">최신 답변: {thread.latest_title}</p>
                )}
            </section>

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

            {isReplyOpen && detail?.can_reply && (
                <section className="space-y-3 rounded-xl border border-cyan-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-bold text-cyan-700">{thread.root_title} 안건에 대한 답변 작성</h3>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">제목</span>
                            <input
                                value={replyForm.title}
                                onChange={(event) => setReplyField('title', event.target.value)}
                                className={inputClass}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">답변자</span>
                            <input
                                value={replyForm.responder_name}
                                onChange={(event) => setReplyField('responder_name', event.target.value)}
                                className={inputClass}
                                placeholder="공백이면 작성자가 답변자로 저장"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">요청자</span>
                            <input
                                value={replyForm.requester_name}
                                onChange={(event) => setReplyField('requester_name', event.target.value)}
                                className={inputClass}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">요청자 소속</span>
                            <input
                                value={replyForm.requester_org}
                                onChange={(event) => setReplyField('requester_org', event.target.value)}
                                className={inputClass}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-sm font-semibold text-slate-700">답변자 소속</span>
                            <input
                                value={replyForm.responder_org}
                                onChange={(event) => setReplyField('responder_org', event.target.value)}
                                className={inputClass}
                            />
                        </label>
                    </div>

                    {isWorkReport && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">요청일</span>
                                    <input type="date" value={replyForm.request_date} onChange={(event) => setReplyField('request_date', event.target.value)} className={inputClass} />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">작업 시작일</span>
                                    <input type="date" value={replyForm.work_date_start} onChange={(event) => setReplyField('work_date_start', event.target.value)} className={inputClass} />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">작업 종료일</span>
                                    <input type="date" value={replyForm.work_date_end} onChange={(event) => setReplyField('work_date_end', event.target.value)} className={inputClass} />
                                </label>
                            </div>

                            <label className="space-y-1">
                                <span className="text-xs font-semibold text-slate-600">작업 장소</span>
                                <input value={replyForm.work_location} onChange={(event) => setReplyField('work_location', event.target.value)} className={inputClass} />
                            </label>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-600">작업자/작업시간</p>
                                    <button
                                        type="button"
                                        onClick={addReplyWorker}
                                        className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        추가
                                    </button>
                                </div>
                                {replyForm.workers.map((worker, index) => (
                                    <div key={`reply-worker-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_110px_40px]">
                                        <input value={worker.worker_name || ''} onChange={(event) => updateReplyWorker(index, 'worker_name', event.target.value)} className={inputClass} placeholder="작업자" />
                                        <input value={worker.worker_affiliation || ''} onChange={(event) => updateReplyWorker(index, 'worker_affiliation', event.target.value)} className={inputClass} placeholder="소속" />
                                        <input type="number" value={worker.work_hours ?? 0} onChange={(event) => updateReplyWorker(index, 'work_hours', event.target.value)} className={inputClass} placeholder="시간" />
                                        <button type="button" onClick={() => removeReplyWorker(index)} className="rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">삭제</button>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-600">사용 파츠</p>
                                    <button
                                        type="button"
                                        onClick={addReplyPart}
                                        className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                    >
                                        추가
                                    </button>
                                </div>
                                {replyForm.parts.map((part, index) => (
                                    <div key={`reply-part-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_90px_40px]">
                                        <input value={part.part_name || ''} onChange={(event) => updateReplyPart(index, 'part_name', event.target.value)} className={inputClass} placeholder="명칭" />
                                        <input value={part.manufacturer || ''} onChange={(event) => updateReplyPart(index, 'manufacturer', event.target.value)} className={inputClass} placeholder="제조사" />
                                        <input value={part.model_name || ''} onChange={(event) => updateReplyPart(index, 'model_name', event.target.value)} className={inputClass} placeholder="모델" />
                                        <input type="number" value={part.quantity ?? 1} onChange={(event) => updateReplyPart(index, 'quantity', event.target.value)} className={inputClass} placeholder="수량" />
                                        <button type="button" onClick={() => removeReplyPart(index)} className="rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">삭제</button>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">현상 (필수)</span>
                                    <RichTextEditor
                                        value={replyForm.report_sections.symptom}
                                        onChange={(htmlValue) => setReplyReportSection('symptom', htmlValue)}
                                        placeholder="현상을 입력하세요."
                                        minHeight={180}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">원인</span>
                                    <RichTextEditor
                                        value={replyForm.report_sections.cause}
                                        onChange={(htmlValue) => setReplyReportSection('cause', htmlValue)}
                                        placeholder="원인을 입력하세요."
                                        minHeight={180}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">조치사항 (중간)</span>
                                    <RichTextEditor
                                        value={replyForm.report_sections.interim_action}
                                        onChange={(htmlValue) => setReplyReportSection('interim_action', htmlValue)}
                                        placeholder="중간 조치사항을 입력하세요."
                                        minHeight={180}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs font-semibold text-slate-600">조치사항 (최종, 필수)</span>
                                    <RichTextEditor
                                        value={replyForm.report_sections.final_action}
                                        onChange={(htmlValue) => setReplyReportSection('final_action', htmlValue)}
                                        placeholder="최종 조치사항을 입력하세요."
                                        minHeight={180}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {!isWorkReport && (
                        <RichTextEditor
                            value={replyForm.content_html}
                            onChange={(htmlValue, plainValue) => {
                                setReplyField('content_html', htmlValue);
                                setReplyField('content_plain', plainValue);
                            }}
                            placeholder="답변 내용을 입력하세요."
                            minHeight={220}
                        />
                    )}

                    <div className="space-y-2">
                        <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            첨부파일 추가
                            <input type="file" multiple className="hidden" onChange={handleReplyFileAttach} />
                        </label>
                        {replyFiles.length > 0 && (
                            <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
                                {replyFiles.map((file, index) => (
                                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                                        <span className="truncate">{file.name}</span>
                                        <button type="button" onClick={() => removeReplyFile(index)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">제거</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsReplyOpen(false)}
                            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            닫기
                        </button>
                        <button
                            type="button"
                            onClick={handleReplySubmit}
                            disabled={isReplySubmitting}
                            className="inline-flex h-9 items-center gap-1 rounded-md bg-cyan-600 px-3 text-sm font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Send className="h-4 w-4" /> 답변 등록
                        </button>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4">
                    {latestIsDistinct && (
                        <EntryPanel entry={latestEntry} label="최신 답변" tone="cyan" threadKind={thread.thread_kind} />
                    )}

                    {middleEntries.length > 0 && (
                        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-slate-800">중간 답변 {middleEntries.length}건</p>
                                <button
                                    type="button"
                                    onClick={toggleAllMiddle}
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                    {middleEntries.every((entry) => expandedEntryIds.includes(Number(entry.id))) ? '모두 접기' : '모두 펼치기'}
                                </button>
                            </div>

                            {middleEntries.map((entry) => {
                                const isExpanded = expandedEntryIds.includes(Number(entry.id));
                                return (
                                    <div key={`middle-entry-${entry.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                        <button
                                            type="button"
                                            onClick={() => toggleMiddleEntry(entry.id)}
                                            className="flex w-full items-center justify-between gap-2 text-left"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-800">{entry.title}</p>
                                                <p className="text-[11px] text-slate-500">{entry.author_name} · {entry.created_at?.slice(0, 16).replace('T', ' ')}</p>
                                            </div>
                                            {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                                        </button>
                                        {isExpanded && (
                                            <div className="mt-2">
                                                <EntryPanel entry={entry} tone="amber" threadKind={thread.thread_kind} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    <EntryPanel entry={rootEntry} label="최초 등록 안건" tone="slate" threadKind={thread.thread_kind} />
                </div>

                <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-4 xl:h-fit">
                    <h3 className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
                        <MessageCircle className="h-4 w-4" /> 코멘트 ({thread.comment_count || 0})
                    </h3>

                    <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                        {comments.length <= 0 && (
                            <p className="text-xs text-slate-500">등록된 코멘트가 없습니다.</p>
                        )}
                        {comments.map((comment) => (
                            <div key={`comment-${comment.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-slate-700">{comment.author_name}</p>
                                    <p className="text-[11px] text-slate-400">{comment.created_at?.slice(0, 16).replace('T', ' ')}</p>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-xs text-slate-700">{comment.body}</p>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2 border-t border-slate-200 pt-2">
                        <textarea
                            value={commentText}
                            onChange={(event) => setCommentText(event.target.value)}
                            placeholder="코멘트를 입력하세요."
                            className={cn(
                                INPUT_COMMON_CLASS,
                                'min-h-[90px] rounded-lg px-2 text-xs'
                            )}
                        />
                        <button
                            type="button"
                            onClick={handleCommentSubmit}
                            disabled={isCommentSubmitting || !commentText.trim()}
                            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md bg-cyan-600 px-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <Send className="h-3.5 w-3.5" /> 코멘트 등록
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
}
