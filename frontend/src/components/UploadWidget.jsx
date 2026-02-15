import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, CircleDashed, FileWarning, FileSearch } from 'lucide-react';
import { api, getErrorMessage, POLLING_INTERVAL_MS } from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';

const TERMINAL_STATUSES = new Set(['completed', 'failed']);
const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xlsm', '.xltx', '.xltm', '.csv'];

const STATUS_META = {
    uploading: { label: '업로드 중', color: 'text-blue-500' },
    pending: { label: '대기', color: 'text-gray-500' },
    processing: { label: '처리 중', color: 'text-orange-500' },
    completed: { label: '완료', color: 'text-green-500' },
    failed: { label: '실패', color: 'text-red-500' },
};

function getStatusMeta(status) {
    return STATUS_META[status] || { label: status || '알 수 없음', color: 'text-gray-400' };
}

const UploadWidget = () => {
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [uploadJobs, setUploadJobs] = useState([]);

    const updateUploadJob = (id, updater) => {
        setUploadJobs((prev) => prev.map((job) => (job.id === id ? updater(job) : job)));
    };

    const uploadFile = async (file) => {
        if (!file) return;

        const lowered = file.name.toLowerCase();
        const isAllowed = ALLOWED_EXTENSIONS.some((extension) => lowered.endsWith(extension));
        if (!isAllowed) {
            setUploadError('PDF/Excel/CSV 파일만 업로드할 수 있습니다.');
            return;
        }

        const temporaryId = `temp-${Date.now()}`;
        setUploadError('');
        setUploadJobs((prev) => [
            { id: temporaryId, filename: file.name, status: 'uploading', createdAt: new Date().toISOString() },
            ...prev,
        ]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setUploadJobs((prev) =>
                prev.map((job) =>
                    job.id === temporaryId
                        ? { ...job, id: response.data.id, status: response.data.status || 'pending' }
                        : job
                )
            );
        } catch (error) {
            updateUploadJob(temporaryId, (job) => ({
                ...job,
                status: 'failed',
                error: getErrorMessage(error, '업로드 실패'),
            }));
            setUploadError(getErrorMessage(error, '파일을 업로드할 수 없습니다.'));
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        uploadFile(file);
    };

    useEffect(() => {
        const activeJobs = uploadJobs.filter(
            (job) => typeof job.id === 'number' && !TERMINAL_STATUSES.has(job.status)
        );

        if (!activeJobs.length) return;

        const pollStatuses = async () => {
            const responses = await Promise.allSettled(
                activeJobs.map(async (job) => {
                    const response = await api.get(`/documents/${job.id}`);
                    return { id: job.id, payload: response.data };
                })
            );

            const nextById = new Map();
            responses.forEach((result) => {
                if (result.status === 'fulfilled') {
                    nextById.set(result.value.id, result.value.payload);
                }
            });

            if (!nextById.size) return;

            setUploadJobs((prev) => {
                let changed = false;
                const nextJobs = prev.map((job) => {
                    const nextItem = nextById.get(job.id);
                    if (!nextItem) return job;
                    const nextStatus = nextItem.status || job.status;
                    if (nextStatus === job.status) return job; // strict equality check might need expansion if other fields change
                    changed = true;
                    return { ...job, status: nextStatus };
                });
                return changed ? nextJobs : prev;
            });
        };

        pollStatuses();
        const interval = setInterval(pollStatuses, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [uploadJobs]);

    return (
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">문서 업로드</h3>
            </div>

            <div
                className={cn(
                    "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-card/80 hover:border-primary/40 hover:bg-accent/40",
                    isDragOver ? "border-primary bg-primary/10" : "border-border"
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <UploadCloud className="h-8 w-8 text-primary mb-2" />
                <p className="text-sm text-foreground font-medium">PDF/Excel 파일을 끌어오거나 아래 버튼을 클릭하세요</p>
                <Button
                    type="button"
                    size="sm"
                    className="mt-3 shadow-sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                    }}
                >
                    문서 파일 선택
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.xlsx,.xlsm,.xltx,.xltm,.csv"
                    hidden
                    onChange={(e) => uploadFile(e.target.files?.[0])}
                />
            </div>

            {uploadError && <p className="text-xs text-destructive mt-2">{uploadError}</p>}

            {uploadJobs.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {uploadJobs.map((job) => {
                        const statusMeta = getStatusMeta(job.status);
                        return (
                            <li key={job.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {job.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                    {job.status === 'processing' && <CircleDashed className="h-3 w-3 animate-spin text-orange-500" />}
                                    {job.status === 'failed' && <FileWarning className="h-3 w-3 text-red-500" />}
                                    {job.status === 'pending' && <FileSearch className="h-3 w-3 text-gray-400" />}
                                    <span className="truncate max-w-[150px]" title={job.filename}>{job.filename}</span>
                                </div>
                                <span className={cn("font-medium", statusMeta.color)}>{statusMeta.label}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default UploadWidget;
