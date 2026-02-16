import {
    ClipboardList,
    MessageCircle,
    MessageSquare,
    Paperclip,
} from 'lucide-react';
import { cn } from '../../lib/utils';

function formatHours(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return '-';
    return `${number.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}시간`;
}

function PersonLine({ label, name, org }) {
    return (
        <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-500">{label}</span>
            {' '}
            <span className="font-semibold text-slate-800">{name || '-'}</span>
            {org ? <span className="text-slate-500"> ({org})</span> : null}
        </p>
    );
}

export default function AgendaThreadCard({ item, onClick, isUnread = false, showProject = false }) {
    const isReport = item.thread_kind === 'work_report';
    const isDraft = item.record_status === 'draft';
    const isInProgress = item.progress_status === 'in_progress';
    const shouldSplit = !isReport && !isDraft && Number(item.reply_count || 0) > 0;

    const projectName = showProject ? String(item?.project_name || '').trim() : '';
    const projectCode = showProject ? String(item?.project_code || '').trim() : '';
    const projectLabel = showProject && (projectName || projectCode)
        ? `${projectName || '프로젝트'}${projectCode ? ` · ${projectCode}` : ''}`
        : '';

    const formatDateTime = (value) => (value ? String(value).slice(0, 16).replace('T', ' ') : '');

    const containerClass = cn(
        'cursor-pointer rounded-xl border bg-white shadow-sm transition hover:shadow-md',
        isUnread
            ? 'border-amber-200 bg-amber-50/20'
            : isInProgress
                ? 'border-cyan-200'
                : 'border-slate-200',
    );

    const unreadBadge = isUnread ? (
        <span className="inline-flex h-6 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-700">
            미확인
        </span>
    ) : null;

    if (shouldSplit) {
        const rootTitle = item.root_title || item.title;
        const latestTitle = item.latest_title || item.title;
        const panelThumbnailUrl = item.thumbnail_url;

        return (
            <article onClick={onClick} className={cn(containerClass, 'overflow-hidden')}>
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <section className="bg-gradient-to-br from-white to-slate-50 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row">
                            <div className="h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:h-24 lg:w-40">
                                <img src={panelThumbnailUrl} alt="안건 썸네일" className="h-full w-full object-cover" loading="lazy" />
                            </div>

                            <div className="min-w-0 flex-1 space-y-3">
                                {projectLabel && (
                                    <p className="text-[11px] font-semibold text-slate-500">
                                        {projectLabel}
                                    </p>
                                )}

                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700">
                                                <ClipboardList className="h-3.5 w-3.5 text-slate-600" />
                                                최초 등록 안건
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400">{item.agenda_code}</span>
                                            {unreadBadge}
                                        </div>
                                        <h3 className="line-clamp-2 text-base font-bold text-slate-900">
                                            {rootTitle}
                                        </h3>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                    <PersonLine label="작성자" name={item.author_name} />
                                    <PersonLine label="요청자" name={item.requester_name} org={item.requester_org} />
                                    <PersonLine label="답변자" name={item.root_responder_name} org={item.root_responder_org} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="border-t border-slate-200 bg-gradient-to-br from-cyan-50/70 to-white p-4 md:border-t-0 md:border-l">
                        <div className="flex flex-col gap-4 lg:flex-row">
                            <div className="h-28 w-full overflow-hidden rounded-lg border border-cyan-200 bg-slate-100 lg:h-24 lg:w-40">
                                <img src={panelThumbnailUrl} alt="안건 썸네일" className="h-full w-full object-cover" loading="lazy" />
                            </div>

                            <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-200 bg-white px-2 text-[11px] font-bold text-cyan-700">
                                                <MessageSquare className="h-3.5 w-3.5 text-cyan-600" />
                                                최신 답변 안건
                                            </span>
                                            <span className={cn(
                                                'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-bold',
                                                isInProgress
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : 'border-slate-200 bg-slate-100 text-slate-600',
                                            )}
                                            >
                                                {isInProgress ? '진행 중' : '완료'}
                                            </span>
                                        </div>
                                        <h3 className="line-clamp-2 text-base font-bold text-slate-900">
                                            {latestTitle}
                                        </h3>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                    <PersonLine label="작성자" name={item.latest_author_name || item.author_name} />
                                    <PersonLine label="답변자" name={item.responder_name} org={item.responder_org} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-white px-4 pb-4 pt-2 text-xs text-slate-500 md:col-span-2">
                        <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 첨부 {item.attachment_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> 답변 {item.reply_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 코멘트 {item.comment_count || 0}</span>
                        <span className="ml-auto text-[11px] text-slate-400">업데이트 {formatDateTime(item.last_updated_at || item.updated_at)}</span>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article onClick={onClick} className={cn(containerClass, 'p-4')}>
            <div className="flex flex-col gap-4 lg:flex-row">
                <div className="h-28 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:h-24 lg:w-40">
                    <img src={item.thumbnail_url} alt="안건 썸네일" className="h-full w-full object-cover" loading="lazy" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    {projectLabel && (
                        <p className="text-[11px] font-semibold text-slate-500">
                            {projectLabel}
                        </p>
                    )}

                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={cn(
                                    'inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-bold',
                                    isReport
                                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                                        : 'border-cyan-200 bg-cyan-50 text-cyan-700',
                                )}
                                >
                                    {isReport ? '작업보고서' : '일반 안건'}
                                </span>
                                {isDraft && (
                                    <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700">
                                        임시 저장
                                    </span>
                                )}
                                <span className="text-xs font-semibold text-slate-400">{item.agenda_code}</span>
                                {unreadBadge}
                            </div>
                            <h3 className="line-clamp-2 text-base font-bold text-slate-900">
                                {item.root_title || item.title}
                            </h3>
                            {item.latest_title && item.latest_title !== item.root_title && (
                                <p className="line-clamp-1 text-sm font-medium text-slate-600">
                                    최근 답변: {item.latest_title}
                                </p>
                            )}
                        </div>

                        <span className={cn(
                            'inline-flex h-7 items-center rounded-full border px-3 text-xs font-bold',
                            isInProgress
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-slate-200 bg-slate-100 text-slate-600',
                        )}
                        >
                            {isInProgress ? '진행 중' : '완료'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                        {!isReport ? (
                            <>
                                <PersonLine label="작성자" name={item.author_name} />
                                <PersonLine label="요청자" name={item.requester_name} org={item.requester_org} />
                                <PersonLine label="답변자" name={item.responder_name} org={item.responder_org} />
                                <p className="text-xs text-slate-500">최종 작성자: {item.latest_author_name || '-'}</p>
                            </>
                        ) : (
                            <>
                                <PersonLine label="작성자" name={item.author_name} />
                                <PersonLine label="요청자" name={item.requester_name} org={item.requester_org} />
                                <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-500">작업자</span> <span className="font-semibold text-slate-800">{item.worker_summary || '-'}</span>
                                </p>
                                <p className="text-xs text-slate-600">
                                    <span className="font-semibold text-slate-500">작업일</span> {item.work_date_label || '-'}
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="font-semibold text-slate-500">합계</span> {formatHours(item.total_work_hours)}
                                </p>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 첨부 {item.attachment_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> 답변 {item.reply_count || 0}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 코멘트 {item.comment_count || 0}</span>
                        <span className="ml-auto text-[11px] text-slate-400">업데이트 {String(item.last_updated_at || '').slice(0, 16).replace('T', ' ')}</span>
                    </div>
                </div>
            </div>
        </article>
    );
}

