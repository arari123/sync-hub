import React, { useEffect, useState } from 'react';
import { api, API_BASE_URL, getErrorMessage } from '../lib/api';
import { Loader2, File, Download, Tag } from 'lucide-react';

const DOCUMENT_TYPE_LABELS = {
    equipment_failure_report: '설비 장애 조치보고서',
    catalog: '카탈로그',
    manual: '설명서',
    datasheet: '데이터시트',
    unclassified: '미분류',
};

function normalizeDocumentTypes(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
    }

    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return [...new Set(parsed.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
            }
        } catch (error) {
            return [];
        }
    }

    return [...new Set(trimmed.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function toTypeLabel(type) {
    return DOCUMENT_TYPE_LABELS[type] || type;
}

function toStatusLabel(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'pending') return '대기';
    if (value === 'processing') return '처리 중';
    if (value === 'completed') return '완료';
    if (value === 'failed') return '실패';
    return '알 수 없음';
}

const DocumentDetail = ({ result }) => {
    const [docDetails, setDocDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const documentTypes = normalizeDocumentTypes(result?.document_types || docDetails?.document_types);
    const visibleDocumentTypes = documentTypes.length ? documentTypes : ['unclassified'];

    useEffect(() => {
        if (!result) return;

        const fetchDetails = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get(`/documents/${result.doc_id}`);
                setDocDetails(response.data);
            } catch (err) {
                setError(getErrorMessage(err, '문서 상세 정보를 불러오지 못했습니다.'));
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [result]);

    if (!result) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 border rounded-lg bg-muted/10">
                <File className="h-12 w-12 mb-4 opacity-20" />
                <p>문서를 선택하면 상세 정보를 볼 수 있습니다</p>
            </div>
        );
    }

    return (
        <div className="bg-card border rounded-lg shadow-sm h-fit sticky top-4">
            <div className="p-4 border-b bg-muted/30">
                <h2 className="font-semibold ml-1">문서 상세 정보</h2>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-primary">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>상세 정보를 불러오는 중...</span>
                    </div>
                ) : error ? (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
                        {error}
                    </div>
                ) : (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-1 gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">제목</span>
                            <p className="font-semibold break-all">{result.title || result.filename}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">파일명</span>
                            <p className="font-medium break-all">{result.filename}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID</span>
                                <p className="font-mono text-xs bg-muted p-1 rounded w-fit">{result.doc_id}</p>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">매칭 페이지</span>
                                <p className="font-mono text-xs bg-muted p-1 rounded w-fit">
                                    {typeof result.page === 'number' ? `p.${result.page}` : '-'}
                                </p>
                            </div>
                            <div className="grid gap-1">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">상태</span>
                                <p>{toStatusLabel(docDetails?.status)}</p>
                            </div>
                        </div>

                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">문서 요약</span>
                            <p className="text-sm leading-relaxed">{result.summary || '요약 정보가 없습니다.'}</p>
                        </div>

                        <div className="grid gap-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">문서 종류</span>
                            <div className="flex flex-wrap gap-2">
                                {visibleDocumentTypes.map((type) => (
                                    <span
                                        key={type}
                                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted px-2 py-1 text-xs text-foreground"
                                    >
                                        <Tag className="h-3 w-3" />
                                        {toTypeLabel(type)}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">파일 경로</span>
                            <p className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded break-all">
                                {docDetails?.file_path || '확인 불가'}
                            </p>
                        </div>

                        <div className="pt-1">
                            <a
                                href={`${API_BASE_URL}/documents/${result.doc_id}/download`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <Download className="h-3.5 w-3.5" />
                                파일 다운로드
                            </a>
                        </div>

                        {result.match_points && result.match_points.length > 0 && (
                            <div className="grid gap-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">매칭 키워드</span>
                                <div className="flex flex-wrap gap-2">
                                    {result.match_points.map((point, i) => (
                                        <span key={i} className="px-2 py-1 bg-accent/50 text-accent-foreground rounded-full text-xs">
                                            {point}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentDetail;
