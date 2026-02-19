import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowRightLeft,
    ChevronDown,
    ChevronRight,
    DraftingCompass,
    Download,
    Edit3,
    File,
    FileArchive,
    FileSpreadsheet,
    FileText,
    Folder,
    FolderOpen,
    FolderPlus,
    Loader2,
    MoreHorizontal,
    Presentation,
    Search,
    Trash2,
    UploadCloud,
    X,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { api, getErrorMessage, POLLING_INTERVAL_MS } from '../lib/api';
import { downloadFromApi } from '../lib/download';
import { cn } from '../lib/utils';

const ROOT_FOLDER_LABEL = '기본 폴더';
const FILE_PAGE_SIZE = 30;
const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xlsm', '.xltx', '.xltm', '.csv'];
const TERMINAL_FILE_STATUSES = new Set(['completed', 'failed']);

function flattenFolderTree(nodes, depth = 0, parentPath = '') {
    if (!Array.isArray(nodes)) return [];
    const output = [];
    nodes.forEach((node) => {
        const folderId = Number(node?.id || 0);
        if (!folderId) return;
        const folderName = String(node?.name || '').trim() || '폴더';
        const pathLabel = parentPath ? `${parentPath}/${folderName}` : folderName;
        output.push({
            ...node,
            id: folderId,
            depth: Number(depth),
            pathLabel,
        });
        const children = flattenFolderTree(node?.children || [], depth + 1, pathLabel);
        output.push(...children);
    });
    return output;
}

function formatDateTime(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
        return text.slice(0, 16).replace('T', ' ');
    }
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(parsed);
}

function resolveFileVisual(extension) {
    const ext = String(extension || '').trim().toLowerCase();
    if (['.ppt', '.pptx'].includes(ext)) {
        return { Icon: Presentation, className: 'text-orange-500' };
    }
    if (['.xlsx', '.xlsm', '.xltx', '.xltm', '.csv'].includes(ext)) {
        return { Icon: FileSpreadsheet, className: 'text-emerald-600' };
    }
    if (['.dwg', '.dxf'].includes(ext)) {
        return { Icon: DraftingCompass, className: 'text-amber-600' };
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
        return { Icon: FileArchive, className: 'text-violet-600' };
    }
    if (ext === '.pdf') {
        return { Icon: FileText, className: 'text-rose-600' };
    }
    if (['.doc', '.docx'].includes(ext)) {
        return { Icon: FileText, className: 'text-sky-600' };
    }
    return { Icon: File, className: 'text-muted-foreground' };
}

function isAllowedFile(file) {
    const filename = String(file?.name || '').trim().toLowerCase();
    if (!filename) return false;
    return ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

function normalizeFilename(filename) {
    return String(filename || '').trim();
}

const MenuActionButton = ({ label, onClick, danger = false, icon = null, disabled = false }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors',
            disabled
                ? 'cursor-not-allowed text-slate-300'
                : danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-slate-700 hover:bg-slate-100'
        )}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export default function BudgetProjectData() {
    const { projectId } = useParams();

    const [project, setProject] = useState(null);
    const [isProjectLoading, setIsProjectLoading] = useState(true);
    const [isFolderLoading, setIsFolderLoading] = useState(false);
    const [isFileLoading, setIsFileLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');

    const [folderTree, setFolderTree] = useState([]);
    const [rootFolderId, setRootFolderId] = useState(null);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [collapsedFolderMap, setCollapsedFolderMap] = useState({});

    const [files, setFiles] = useState([]);
    const [totalFiles, setTotalFiles] = useState(0);
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [filePage, setFilePage] = useState(1);
    const [queryInput, setQueryInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [dragOverUpload, setDragOverUpload] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadComment, setUploadComment] = useState('');

    const [contextMenu, setContextMenu] = useState(null);
    const [moveDialog, setMoveDialog] = useState({ open: false, file: null, targetFolderId: null });

    const selectedFolderIdRef = useRef(null);
    useEffect(() => {
        selectedFolderIdRef.current = selectedFolderId;
    }, [selectedFolderId]);

    const flatFolders = useMemo(() => flattenFolderTree(folderTree), [folderTree]);
    const folderMap = useMemo(() => {
        const next = new Map();
        flatFolders.forEach((item) => {
            next.set(Number(item.id), item);
        });
        return next;
    }, [flatFolders]);
    const selectedFolder = folderMap.get(Number(selectedFolderId || 0)) || null;
    const totalPages = Math.max(1, Math.ceil((totalFiles || 0) / FILE_PAGE_SIZE));
    const hasProcessingFile = useMemo(
        () => files.some((item) => !TERMINAL_FILE_STATUSES.has(String(item?.status || '').toLowerCase())),
        [files]
    );

    const loadProject = useCallback(async () => {
        if (!projectId) return;
        setIsProjectLoading(true);
        try {
            const response = await api.get(`/budget/projects/${projectId}/versions`);
            setProject(response?.data?.project || null);
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 정보를 불러오지 못했습니다.'));
            setProject(null);
        } finally {
            setIsProjectLoading(false);
        }
    }, [projectId]);

    const loadFolders = useCallback(async ({ preferredFolderId = null } = {}) => {
        if (!projectId) return null;
        setIsFolderLoading(true);
        try {
            const response = await api.get(`/budget/projects/${projectId}/data/folders`);
            const items = Array.isArray(response?.data?.items) ? response.data.items : [];
            const nextRootFolderId = Number(response?.data?.root_folder_id || 0) || null;
            const flattened = flattenFolderTree(items);
            const idSet = new Set(flattened.map((item) => Number(item.id)));
            let nextSelected = preferredFolderId ?? selectedFolderIdRef.current;
            if (!nextSelected || !idSet.has(Number(nextSelected))) {
                nextSelected = nextRootFolderId || flattened[0]?.id || null;
            }

            setFolderTree(items);
            setRootFolderId(nextRootFolderId);
            setSelectedFolderId(nextSelected ? Number(nextSelected) : null);
            selectedFolderIdRef.current = nextSelected ? Number(nextSelected) : null;
            return nextSelected ? Number(nextSelected) : null;
        } catch (err) {
            setError(getErrorMessage(err, '폴더 정보를 불러오지 못했습니다.'));
            return null;
        } finally {
            setIsFolderLoading(false);
        }
    }, [projectId]);

    const loadFiles = useCallback(async ({ folderId, query, page }) => {
        if (!projectId) return;
        const normalizedFolderId = Number(folderId || 0);
        const normalizedQuery = String(query || '').trim();
        const normalizedPage = Math.max(1, Number(page || 1));
        if (!normalizedFolderId) return;

        setIsFileLoading(true);
        try {
            const params = {
                folder_id: normalizedFolderId,
                page: normalizedPage,
                page_size: FILE_PAGE_SIZE,
            };
            if (normalizedQuery) {
                params.q = normalizedQuery;
            }

            const response = await api.get(`/budget/projects/${projectId}/data/files`, { params });
            const payload = response?.data || {};
            const nextItems = Array.isArray(payload?.items) ? payload.items : [];

            setFiles(nextItems);
            setTotalFiles(Number(payload?.total || 0));
            setIsSearchMode(Boolean(payload?.search_mode));
        } catch (err) {
            setError(getErrorMessage(err, '파일 목록을 불러오지 못했습니다.'));
        } finally {
            setIsFileLoading(false);
        }
    }, [projectId]);

    const refreshCurrentFiles = useCallback(async ({ page = filePage, folderId = null } = {}) => {
        const nextFolderId = Number(folderId || selectedFolderIdRef.current || rootFolderId || 0);
        if (!nextFolderId) return;
        await loadFiles({ folderId: nextFolderId, query: searchQuery, page });
    }, [filePage, loadFiles, rootFolderId, searchQuery]);

    useEffect(() => {
        if (!projectId) return;
        setError('');
        setFiles([]);
        setTotalFiles(0);
        setSearchQuery('');
        setQueryInput('');
        setFilePage(1);
        setUploadFile(null);
        setUploadComment('');

        const bootstrap = async () => {
            await loadProject();
            await loadFolders();
        };
        bootstrap();
    }, [projectId, loadFolders, loadProject]);

    useEffect(() => {
        const activeFolderId = Number(selectedFolderId || 0);
        if (!projectId || !activeFolderId) return;
        loadFiles({
            folderId: activeFolderId,
            query: searchQuery,
            page: filePage,
        });
    }, [projectId, selectedFolderId, searchQuery, filePage, loadFiles]);

    useEffect(() => {
        if (!hasProcessingFile) return;
        const interval = window.setInterval(() => {
            const activeFolderId = Number(selectedFolderIdRef.current || 0);
            if (!activeFolderId) return;
            loadFiles({
                folderId: activeFolderId,
                query: searchQuery,
                page: filePage,
            });
        }, POLLING_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [hasProcessingFile, loadFiles, searchQuery, filePage]);

    useEffect(() => {
        if (!contextMenu) return undefined;
        const close = () => setContextMenu(null);
        const closeByEscape = (event) => {
            if (event.key === 'Escape') close();
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', closeByEscape);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', closeByEscape);
        };
    }, [contextMenu]);

    useEffect(() => {
        if (filePage <= totalPages) return;
        setFilePage(totalPages);
    }, [filePage, totalPages]);

    const requestFolderName = (message, initialValue = '') => {
        const input = window.prompt(message, initialValue);
        if (input == null) return null;
        const normalized = String(input || '').trim();
        if (!normalized) {
            setError('폴더 이름을 입력해 주세요.');
            return null;
        }
        return normalized;
    };

    const handleCreateFolder = async (parentFolderId = null) => {
        const targetParentId = Number(parentFolderId || selectedFolderIdRef.current || rootFolderId || 0);
        if (!targetParentId) {
            setError('상위 폴더를 선택해 주세요.');
            return;
        }
        const name = requestFolderName('새 폴더 이름을 입력해 주세요.');
        if (!name) return;

        setError('');
        try {
            const response = await api.post(`/budget/projects/${projectId}/data/folders`, {
                parent_folder_id: targetParentId,
                name,
            });
            const createdFolderId = Number(response?.data?.id || 0) || null;
            const nextSelected = await loadFolders({ preferredFolderId: createdFolderId });
            setFilePage(1);
            await refreshCurrentFiles({ page: 1, folderId: nextSelected || targetParentId });
        } catch (err) {
            setError(getErrorMessage(err, '폴더를 생성하지 못했습니다.'));
        }
    };

    const handleRenameFolder = async (folder) => {
        const folderId = Number(folder?.id || 0);
        if (!folderId) return;
        const name = requestFolderName('변경할 폴더 이름을 입력해 주세요.', folder?.name || '');
        if (!name) return;

        setError('');
        try {
            await api.patch(`/budget/projects/${projectId}/data/folders/${folderId}`, {
                name,
            });
            await loadFolders({ preferredFolderId: folderId });
            await refreshCurrentFiles();
        } catch (err) {
            setError(getErrorMessage(err, '폴더 이름을 변경하지 못했습니다.'));
        }
    };

    const handleDeleteFolder = async (folder) => {
        const folderId = Number(folder?.id || 0);
        if (!folderId) return;
        const folderName = String(folder?.name || '폴더').trim();
        if (!window.confirm(`'${folderName}' 폴더와 하위 폴더/파일을 모두 삭제합니다. 계속할까요?`)) {
            return;
        }

        setError('');
        try {
            await api.delete(`/budget/projects/${projectId}/data/folders/${folderId}`);
            const fallbackFolderId = Number(folder?.parent_folder_id || rootFolderId || 0) || null;
            const nextSelected = await loadFolders({ preferredFolderId: fallbackFolderId });
            setFilePage(1);
            await refreshCurrentFiles({ page: 1, folderId: nextSelected || fallbackFolderId });
        } catch (err) {
            setError(getErrorMessage(err, '폴더를 삭제하지 못했습니다.'));
        }
    };

    const handleRenameFile = async (fileItem) => {
        const docId = Number(fileItem?.doc_id || 0);
        if (!docId) return;
        const input = window.prompt('변경할 파일 이름을 입력해 주세요.', fileItem?.filename || '');
        if (input == null) return;
        const filename = normalizeFilename(input);
        if (!filename) {
            setError('파일 이름을 입력해 주세요.');
            return;
        }

        setError('');
        try {
            await api.patch(`/budget/projects/${projectId}/data/files/${docId}`, { filename });
            await refreshCurrentFiles();
        } catch (err) {
            setError(getErrorMessage(err, '파일 이름을 변경하지 못했습니다.'));
        }
    };

    const handleDeleteFile = async (fileItem) => {
        const docId = Number(fileItem?.doc_id || 0);
        if (!docId) return;
        const fileName = String(fileItem?.filename || '파일').trim();
        if (!window.confirm(`'${fileName}' 파일을 삭제할까요?`)) return;

        setError('');
        try {
            await api.delete(`/budget/projects/${projectId}/data/files/${docId}`);
            await loadFolders({ preferredFolderId: selectedFolderIdRef.current });
            await refreshCurrentFiles();
        } catch (err) {
            setError(getErrorMessage(err, '파일을 삭제하지 못했습니다.'));
        }
    };

    const handleDownloadFile = async (fileItem) => {
        const docId = Number(fileItem?.doc_id || 0);
        if (!docId) return;
        setError('');
        try {
            await downloadFromApi(`/documents/${docId}/download`, fileItem?.filename || `document-${docId}`);
        } catch (err) {
            setError(getErrorMessage(err, '파일 다운로드에 실패했습니다.'));
        }
    };

    const openMoveDialog = (fileItem) => {
        const fallbackFolderId = Number(fileItem?.folder_id || selectedFolderIdRef.current || rootFolderId || 0) || null;
        setMoveDialog({
            open: true,
            file: fileItem,
            targetFolderId: fallbackFolderId,
        });
    };

    const closeMoveDialog = () => {
        setMoveDialog({ open: false, file: null, targetFolderId: null });
    };

    const handleMoveFile = async () => {
        const docId = Number(moveDialog?.file?.doc_id || 0);
        const targetFolderId = Number(moveDialog?.targetFolderId || 0);
        if (!docId || !targetFolderId) {
            setError('이동할 폴더를 선택해 주세요.');
            return;
        }

        setError('');
        try {
            await api.patch(`/budget/projects/${projectId}/data/files/${docId}`, {
                folder_id: targetFolderId,
            });
            closeMoveDialog();
            await loadFolders({ preferredFolderId: selectedFolderIdRef.current });
            await refreshCurrentFiles();
        } catch (err) {
            setError(getErrorMessage(err, '파일 이동에 실패했습니다.'));
        }
    };

    const handleUploadSubmit = async () => {
        if (!uploadFile) {
            setError('업로드할 파일을 선택해 주세요.');
            return;
        }
        if (!isAllowedFile(uploadFile)) {
            setError('PDF/Excel/CSV 파일만 업로드할 수 있습니다.');
            return;
        }
        const comment = String(uploadComment || '').trim();
        if (!comment) {
            setError('코멘트는 필수 입력입니다.');
            return;
        }

        const targetFolderId = Number(selectedFolderIdRef.current || rootFolderId || 0);
        if (!targetFolderId) {
            setError('업로드할 폴더를 선택해 주세요.');
            return;
        }

        setError('');
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('folder_id', String(targetFolderId));
            formData.append('comment', comment);

            await api.post(`/budget/projects/${projectId}/data/files/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadFile(null);
            setUploadComment('');
            setFilePage(1);
            await loadFolders({ preferredFolderId: targetFolderId });
            await refreshCurrentFiles({ page: 1, folderId: targetFolderId });
        } catch (err) {
            setError(getErrorMessage(err, '파일 업로드에 실패했습니다.'));
        } finally {
            setIsUploading(false);
        }
    };

    const handleSearchSubmit = (event) => {
        event.preventDefault();
        const normalizedQuery = String(queryInput || '').trim();
        setFilePage(1);
        setSearchQuery(normalizedQuery);
    };

    const clearSearch = () => {
        setQueryInput('');
        setSearchQuery('');
        setFilePage(1);
    };

    const toggleFolderCollapse = (folderId) => {
        const normalizedFolderId = Number(folderId || 0);
        if (!normalizedFolderId) return;
        setCollapsedFolderMap((prev) => ({
            ...prev,
            [normalizedFolderId]: !prev[normalizedFolderId],
        }));
    };

    const openFolderContextMenu = (event, folder) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            type: 'folder',
            target: folder,
            x: event.clientX,
            y: event.clientY,
        });
    };

    const openFileContextMenu = (event, fileItem) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu({
            type: 'file',
            target: fileItem,
            x: event.clientX,
            y: event.clientY,
        });
    };

    const openContextMenuFromButton = (event, type, target) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setContextMenu({
            type,
            target,
            x: rect.left + rect.width - 6,
            y: rect.bottom + 6,
        });
    };

    const runFolderMenuAction = async (action) => {
        const target = contextMenu?.target;
        setContextMenu(null);
        if (!target) return;
        if (action === 'create-child') {
            await handleCreateFolder(Number(target.id));
            return;
        }
        if (action === 'rename') {
            await handleRenameFolder(target);
            return;
        }
        if (action === 'delete') {
            await handleDeleteFolder(target);
        }
    };

    const runFileMenuAction = async (action) => {
        const target = contextMenu?.target;
        setContextMenu(null);
        if (!target) return;
        if (action === 'rename') {
            await handleRenameFile(target);
            return;
        }
        if (action === 'delete') {
            await handleDeleteFile(target);
            return;
        }
        if (action === 'move') {
            openMoveDialog(target);
        }
    };

    const renderFolderNode = (node, depth = 0) => {
        const folderId = Number(node?.id || 0);
        if (!folderId) return null;

        const children = Array.isArray(node?.children) ? node.children : [];
        const hasChildren = children.length > 0;
        const isCollapsed = Boolean(collapsedFolderMap[folderId]);
        const isActive = Number(selectedFolderId || 0) === folderId;

        return (
            <div key={folderId}>
                <div
                    role="button"
                    tabIndex={0}
                    style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
                    className={cn(
                        'group flex h-9 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
                        isActive
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-transparent bg-card text-foreground hover:border-border hover:bg-secondary/70'
                    )}
                    onClick={() => {
                        setSelectedFolderId(folderId);
                        selectedFolderIdRef.current = folderId;
                        setFilePage(1);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setSelectedFolderId(folderId);
                        selectedFolderIdRef.current = folderId;
                        setFilePage(1);
                    }}
                    onContextMenu={(event) => openFolderContextMenu(event, node)}
                >
                    {hasChildren ? (
                        <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleFolderCollapse(folderId);
                            }}
                            aria-label={isCollapsed ? '폴더 펼치기' : '폴더 접기'}
                        >
                            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                    ) : (
                        <span className="inline-block h-5 w-5 shrink-0" />
                    )}

                    {isActive ? <FolderOpen className="h-4 w-4 shrink-0" /> : <Folder className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{node?.name || '폴더'}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {Number(node?.file_count || 0)}
                    </span>
                    <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={(event) => openContextMenuFromButton(event, 'folder', node)}
                        aria-label="폴더 메뉴"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                </div>
                {hasChildren && !isCollapsed && (
                    <div className="mt-1 space-y-1">
                        {children.map((child) => renderFolderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (isProjectLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                데이터 관리 페이지를 불러오는 중입니다.
            </div>
        );
    }

    if (!project) {
        return <p className="text-sm text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>;
    }

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project?.id || projectId}
                projectName={project?.name || '프로젝트'}
                projectCode={project?.code || ''}
                pageLabel="데이터 관리"
                canEdit={project?.can_edit}
                breadcrumbItems={[
                    { label: '메인 페이지', to: '/project-management' },
                    { label: project?.name || '프로젝트', to: `/project-management/projects/${projectId}` },
                    { label: '데이터 관리' },
                ]}
            />

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </div>
            )}

            <section className="overflow-x-auto">
                <div className="grid min-w-[1240px] grid-cols-[260px_minmax(0,1fr)] items-stretch gap-4">
                    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-3">
                        <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
                            <div className="min-w-0">
                                <p className="text-xs font-extrabold tracking-tight text-foreground">폴더 트리</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                    현재 선택: {selectedFolder?.name || ROOT_FOLDER_LABEL}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                    onClick={() => handleCreateFolder()}
                                    title="선택 폴더 하위 폴더 만들기"
                                >
                                    <FolderPlus className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    onClick={() => handleDeleteFolder(selectedFolder)}
                                    title="선택 폴더 삭제"
                                    disabled={!selectedFolder || Boolean(selectedFolder?.is_system_root)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {isFolderLoading ? (
                            <div className="flex min-h-[180px] flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-8 text-xs text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                폴더를 불러오는 중입니다.
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
                                {folderTree.length ? (
                                    folderTree.map((node) => renderFolderNode(node, 0))
                                ) : (
                                    <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                                        폴더가 없습니다.
                                    </div>
                                )}
                            </div>
                        )}
                    </aside>

                    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card min-w-0">
                        <div className="border-b border-border p-4">
                            <div className="overflow-x-auto">
                                <div className="grid min-w-[860px] grid-cols-[minmax(0,3fr)_minmax(360px,4fr)] items-stretch gap-4">
                                    <div
                                        className={cn(
                                            'min-w-0 rounded-xl border-2 border-dashed px-3 py-2.5 transition-colors',
                                            dragOverUpload ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
                                        )}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            setDragOverUpload(true);
                                        }}
                                        onDragLeave={() => setDragOverUpload(false)}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            setDragOverUpload(false);
                                            const nextFile = event.dataTransfer?.files?.[0];
                                            if (nextFile) setUploadFile(nextFile);
                                        }}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <div className="mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary">
                                                <UploadCloud className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <p className="text-[13px] font-bold leading-none text-foreground">파일 업로드</p>
                                                    <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                                        {ALLOWED_EXTENSIONS.join(', ')}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    드래그 앤 드롭 또는 파일 선택으로 업로드하세요.
                                                </p>
                                                {uploadFile && (
                                                    <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-card px-2 py-1.5 text-xs">
                                                        <span className="truncate pr-2">{uploadFile.name}</span>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            onClick={() => setUploadFile(null)}
                                                            aria-label="선택 파일 제거"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                            <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
                                                파일 선택
                                                <input
                                                    type="file"
                                                    hidden
                                                    accept={ALLOWED_EXTENSIONS.join(',')}
                                                    onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                                                />
                                            </label>
                                            <span className="rounded-md border border-border/80 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
                                                업로드 위치: {selectedFolder?.pathLabel || selectedFolder?.name || ROOT_FOLDER_LABEL}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="w-full rounded-xl border border-border bg-background p-3.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-bold text-foreground">코멘트</p>
                                            <span className="text-[10px] font-semibold text-rose-600">필수</span>
                                        </div>
                                        <textarea
                                            value={uploadComment}
                                            onChange={(event) => setUploadComment(event.target.value)}
                                            className="mt-2 h-24 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                                            placeholder="업로드 목적이나 참고사항을 입력해 주세요."
                                        />
                                        <button
                                            type="button"
                                            onClick={handleUploadSubmit}
                                            disabled={isUploading}
                                            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-primary/80 bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                            업로드
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-b border-border px-4 py-3">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                <form className="flex w-full items-center gap-2 lg:max-w-[760px]" onSubmit={handleSearchSubmit}>
                                    <label className="flex h-9 flex-1 items-center rounded-md border border-input bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
                                        <span className="inline-flex h-full w-9 shrink-0 items-center justify-center border-r border-border/70 text-muted-foreground">
                                            <Search className="h-4 w-4" />
                                        </span>
                                        <input
                                            value={queryInput}
                                            onChange={(event) => setQueryInput(event.target.value)}
                                            placeholder="프로젝트 자료실 검색 (단어 매칭)"
                                            className="h-full w-full border-0 bg-transparent px-2.5 text-sm text-foreground focus:outline-none"
                                        />
                                    </label>
                                    <button
                                        type="submit"
                                        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                                    >
                                        검색
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearSearch}
                                        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                    >
                                        초기화
                                    </button>
                                </form>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>{isSearchMode ? `검색 결과 ${totalFiles}건` : `폴더 파일 ${totalFiles}건`}</span>
                                    <span>페이지 {filePage}/{totalPages}</span>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <div className="min-w-[680px]">
                                <div className="grid grid-cols-[minmax(220px,1fr)_140px_150px_44px] border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-bold text-muted-foreground">
                                    <span>파일</span>
                                    <span>업로드한 사람</span>
                                    <span>업로드 날짜</span>
                                    <span className="text-right">메뉴</span>
                                </div>

                                {isFileLoading ? (
                                    <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        파일 목록을 불러오는 중입니다.
                                    </div>
                                ) : files.length === 0 ? (
                                    <div className="px-4 py-14 text-center text-sm text-muted-foreground">
                                        {searchQuery ? '검색 결과가 없습니다.' : '이 폴더에는 파일이 없습니다.'}
                                    </div>
                                ) : (
                                    <div>
                                        {files.map((item) => {
                                            const { Icon: FileIcon, className: fileIconClassName } = resolveFileVisual(item?.extension);
                                            return (
                                                <div
                                                    key={item.doc_id}
                                                    className="border-b border-border/70 px-4 py-2.5 text-xs text-foreground transition-colors hover:bg-secondary/40"
                                                    onContextMenu={(event) => openFileContextMenu(event, item)}
                                                >
                                                    <div className="grid grid-cols-[minmax(220px,1fr)_140px_150px_44px] items-center">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <FileIcon className={cn('h-4 w-4 shrink-0', fileIconClassName)} />
                                                                <button
                                                                    type="button"
                                                                    className="truncate text-left text-[13px] font-semibold text-foreground hover:underline"
                                                                    onClick={() => handleDownloadFile(item)}
                                                                    title="파일 다운로드"
                                                                >
                                                                    {item.filename || `문서 ${item.doc_id}`}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    onClick={() => handleDownloadFile(item)}
                                                                    title="다운로드"
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <span className="truncate text-[12px]">{item?.uploaded_by_name || '-'}</span>
                                                        <span className="text-[12px] text-muted-foreground">{formatDateTime(item?.created_at)}</span>
                                                        <div className="flex justify-end">
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                                onClick={(event) => openContextMenuFromButton(event, 'file', item)}
                                                                aria-label="파일 메뉴"
                                                            >
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="mt-1.5 grid grid-cols-[minmax(220px,1fr)_140px_150px_44px]">
                                                        <div className="min-w-0 pl-6 text-[11px] text-muted-foreground">
                                                            <p className="truncate">
                                                                코멘트: {String(item?.upload_comment || '').trim() || '-'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs">
                            <span className="text-muted-foreground">
                                {selectedFolder?.pathLabel || selectedFolder?.name || ROOT_FOLDER_LABEL}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFilePage((prev) => Math.max(1, prev - 1))}
                                    disabled={filePage <= 1 || isFileLoading}
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    이전
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilePage((prev) => Math.min(totalPages, prev + 1))}
                                    disabled={filePage >= totalPages || isFileLoading}
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 font-semibold text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    다음
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {contextMenu && (
                <div
                    className="fixed z-50 min-w-[170px] rounded-lg border border-border bg-card p-1 shadow-2xl"
                    style={{
                        left: `${Math.max(8, Number(contextMenu.x || 0))}px`,
                        top: `${Math.max(8, Number(contextMenu.y || 0))}px`,
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {contextMenu.type === 'folder' && (
                        <>
                            <MenuActionButton
                                label="하위 폴더 만들기"
                                icon={<FolderPlus className="h-3.5 w-3.5" />}
                                onClick={() => runFolderMenuAction('create-child')}
                            />
                            <MenuActionButton
                                label="이름 변경"
                                icon={<Edit3 className="h-3.5 w-3.5" />}
                                disabled={Boolean(contextMenu?.target?.is_system_root)}
                                onClick={() => runFolderMenuAction('rename')}
                            />
                            <MenuActionButton
                                label="삭제"
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                danger
                                disabled={Boolean(contextMenu?.target?.is_system_root)}
                                onClick={() => runFolderMenuAction('delete')}
                            />
                        </>
                    )}
                    {contextMenu.type === 'file' && (
                        <>
                            <MenuActionButton
                                label="파일 이름 변경"
                                icon={<Edit3 className="h-3.5 w-3.5" />}
                                onClick={() => runFileMenuAction('rename')}
                            />
                            <MenuActionButton
                                label="폴더 이동"
                                icon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                                onClick={() => runFileMenuAction('move')}
                            />
                            <MenuActionButton
                                label="삭제"
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                danger
                                onClick={() => runFileMenuAction('delete')}
                            />
                        </>
                    )}
                </div>
            )}

            {moveDialog.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
                    <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl">
                        <div className="mb-3">
                            <h2 className="text-sm font-bold text-foreground">파일 폴더 이동</h2>
                            <p className="truncate text-xs text-muted-foreground">
                                {moveDialog?.file?.filename || ''}
                            </p>
                        </div>

                        <label className="text-xs font-semibold text-muted-foreground">대상 폴더</label>
                        <select
                            className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                            value={String(moveDialog.targetFolderId || '')}
                            onChange={(event) => setMoveDialog((prev) => ({
                                ...prev,
                                targetFolderId: Number(event.target.value || 0) || null,
                            }))}
                        >
                            <option value="">폴더 선택</option>
                            {flatFolders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                    {`${' '.repeat(Math.max(0, folder.depth) * 2)}${folder.pathLabel || folder.name}`}
                                </option>
                            ))}
                        </select>

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-secondary"
                                onClick={closeMoveDialog}
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                className="inline-flex h-9 items-center justify-center rounded-md border border-primary/80 bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                                onClick={handleMoveFile}
                            >
                                이동
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
