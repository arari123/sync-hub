import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    CalendarDays,
    CalendarRange,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    Loader2,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import ProjectPageHeader from '../components/ProjectPageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { api, getErrorMessage } from '../lib/api';
import { cn } from '../lib/utils';
import {
    ROOT_GROUP_IDS,
    STAGE_LABELS,
    STAGE_ORDER,
    WEEKEND_MODES,
    buildHierarchy,
    cascadeRowsFrom,
    computeGroupStats,
    createDefaultSchedule,
    findGlobalRowIndex,
    ganttPosition,
    getScheduleBounds,
    normalizeSchedulePayload,
    normalizeWeekendMode,
    nextStartDate,
    orderedRowIds,
    orderedRows,
    parseYmd,
    pickAutoScale,
    sanitizeEditedRow,
    weekendBands,
} from '../lib/scheduleUtils';

function makeClientId(prefix) {
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${stamp}-${random}`;
}

function formatRangeDate(value) {
    const text = String(value || '').trim();
    if (!text) return '-';
    const parsed = parseYmd(text);
    if (!parsed) return '-';
    return `${String(parsed.getUTCMonth() + 1).padStart(2, '0')}.${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function formatDateObject(value) {
    if (!(value instanceof Date)) return '-';
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function buildTickItems(bounds, scale) {
    if (!bounds) return [];
    const items = [];
    const dayMs = 86400000;
    const totalDays = Math.max(1, bounds.days);
    if (scale === 'day') {
        const step = Math.max(1, Math.ceil(totalDays / 16));
        for (let offset = 0; offset < totalDays; offset += step) {
            const date = new Date(bounds.min.getTime() + (offset * dayMs));
            items.push({
                key: `d-${offset}`,
                left: (offset / totalDays) * 100,
                label: `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`,
            });
        }
        return items;
    }

    if (scale === 'week') {
        let cursor = new Date(bounds.min.getTime());
        const day = cursor.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        cursor.setUTCDate(cursor.getUTCDate() + mondayOffset);
        while (cursor <= bounds.max) {
            const offset = Math.floor((cursor.getTime() - bounds.min.getTime()) / dayMs);
            if (offset >= 0) {
                items.push({
                    key: `w-${offset}`,
                    left: (offset / totalDays) * 100,
                    label: `${String(cursor.getUTCMonth() + 1).padStart(2, '0')}월 ${String(cursor.getUTCDate()).padStart(2, '0')}일`,
                });
            }
            cursor.setUTCDate(cursor.getUTCDate() + 7);
        }
        return items;
    }

    let cursor = new Date(Date.UTC(bounds.min.getUTCFullYear(), bounds.min.getUTCMonth(), 1));
    while (cursor <= bounds.max) {
        const offset = Math.floor((cursor.getTime() - bounds.min.getTime()) / dayMs);
        if (offset >= 0) {
            items.push({
                key: `m-${offset}`,
                left: (offset / totalDays) * 100,
                label: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
            });
        }
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return items;
}

function collectDescendantGroupIds(groupNode) {
    const output = [];
    const walk = (node) => {
        (node.children || []).forEach((child) => {
            output.push(child.id);
            walk(child);
        });
    };
    walk(groupNode);
    return output;
}

function reorderSiblingItems(list, sourceId, targetId, placeAfter = false) {
    const sourceIndex = list.findIndex((item) => item.id === sourceId);
    const targetIndex = list.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return list;
    const copied = [...list];
    const [moved] = copied.splice(sourceIndex, 1);
    let nextTargetIndex = copied.findIndex((item) => item.id === targetId);
    if (nextTargetIndex < 0) {
        copied.push(moved);
        return copied;
    }
    if (placeAfter) {
        nextTargetIndex += 1;
    }
    copied.splice(nextTargetIndex, 0, moved);
    return copied;
}

function GroupStatBadge({ value, label }) {
    return (
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            {label} {value}
        </span>
    );
}

function ImportScheduleModal({
    open,
    loading,
    query,
    onQueryChange,
    onSearch,
    candidates,
    selectedProjectId,
    onSelect,
    onClose,
    onApply,
}) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <h3 className="text-sm font-bold text-slate-800">다른 프로젝트 일정 불러오기</h3>
                    <button type="button" className="text-xs text-slate-500 hover:text-slate-700" onClick={onClose}>닫기</button>
                </div>
                <div className="space-y-3 p-4">
                    <div className="flex items-center gap-2">
                        <Input
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder="프로젝트명 또는 코드 검색"
                        />
                        <Button type="button" variant="outline" onClick={onSearch} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            조회
                        </Button>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
                        {candidates.length === 0 && (
                            <div className="px-3 py-6 text-center text-xs text-slate-500">조회된 프로젝트가 없습니다.</div>
                        )}
                        {candidates.map((candidate) => {
                            const isActive = String(selectedProjectId) === String(candidate.id);
                            return (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => onSelect(candidate.id)}
                                    className={cn(
                                        'flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50',
                                        isActive && 'bg-blue-50 text-blue-700',
                                    )}
                                >
                                    <span className="font-semibold">{candidate.name || '프로젝트'}</span>
                                    <span className="text-[11px] text-slate-500">{candidate.code || `#${candidate.id}`}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
                    <Button type="button" variant="outline" onClick={onClose}>취소</Button>
                    <Button type="button" onClick={onApply} disabled={!selectedProjectId}>불러오기 적용</Button>
                </div>
            </div>
        </div>
    );
}

const BudgetProjectSchedule = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [schedule, setSchedule] = useState(() => createDefaultSchedule());
    const [expandedGroupIds, setExpandedGroupIds] = useState(new Set(Object.values(ROOT_GROUP_IDS)));
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dragState, setDragState] = useState(null);

    const [importOpen, setImportOpen] = useState(false);
    const [importQuery, setImportQuery] = useState('');
    const [importLoading, setImportLoading] = useState(false);
    const [importCandidates, setImportCandidates] = useState([]);
    const [selectedImportProjectId, setSelectedImportProjectId] = useState('');

    const canEdit = project?.can_edit !== false;

    const hierarchy = useMemo(() => buildHierarchy(schedule), [schedule]);
    const groupStats = useMemo(() => computeGroupStats(schedule), [schedule]);
    const flatRows = useMemo(() => orderedRows(schedule), [schedule]);
    const bounds = useMemo(() => getScheduleBounds(flatRows), [flatRows]);
    const scale = useMemo(() => pickAutoScale(flatRows), [flatRows]);
    const tickItems = useMemo(() => buildTickItems(bounds, scale), [bounds, scale]);
    const weekendOverlays = useMemo(
        () => (schedule.weekend_mode === WEEKEND_MODES.exclude ? weekendBands(bounds) : []),
        [bounds, schedule.weekend_mode],
    );

    const loadSchedule = useCallback(async () => {
        if (!projectId) return;
        setIsLoading(true);
        setError('');
        try {
            const response = await api.get(`/budget/projects/${projectId}/schedule`);
            const payload = response?.data || {};
            const loadedProject = payload.project || null;
            const loadedSchedule = normalizeSchedulePayload(payload.schedule || createDefaultSchedule());
            setProject(loadedProject);
            setSchedule(loadedSchedule);
            setExpandedGroupIds(new Set(loadedSchedule.groups.map((group) => group.id)));
        } catch (err) {
            setError(getErrorMessage(err, '일정 데이터를 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadSchedule();
    }, [loadSchedule]);

    const updateScheduleState = useCallback((updater) => {
        setSchedule((prev) => {
            const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
            return normalizeSchedulePayload(nextRaw);
        });
    }, []);

    const cascadeFromRow = useCallback((rawSchedule, rowId) => {
        const index = findGlobalRowIndex(rawSchedule, rowId);
        if (index < 0) return normalizeSchedulePayload(rawSchedule);
        return cascadeRowsFrom(rawSchedule, index);
    }, []);

    const handleAnchorDateChange = useCallback((value) => {
        setSchedule((prev) => ({
            ...prev,
            anchor_date: value,
        }));
    }, []);

    const handleWeekendModeChange = useCallback((mode) => {
        updateScheduleState((prev) => {
            const next = {
                ...prev,
                weekend_mode: normalizeWeekendMode(mode),
            };
            return cascadeRowsFrom(next, 0);
        });
    }, [updateScheduleState]);

    const toggleGroupExpanded = useCallback((groupId) => {
        setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    const handleExpandAll = useCallback(() => {
        setExpandedGroupIds(new Set((schedule.groups || []).map((group) => group.id)));
    }, [schedule.groups]);

    const handleCollapseAll = useCallback(() => {
        setExpandedGroupIds(new Set(Object.values(ROOT_GROUP_IDS)));
    }, []);

    const handleAddGroup = useCallback((parentGroup) => {
        if (!canEdit) return;
        updateScheduleState((prev) => {
            const parentId = parentGroup?.id || ROOT_GROUP_IDS.design;
            const parent = (prev.groups || []).find((group) => group.id === parentId);
            if (!parent) return prev;
            const stage = parent.stage;
            const siblings = (prev.groups || []).filter((group) => (
                !group.is_system
                && group.stage === stage
                && group.parent_group_id === parent.id
            ));
            const newGroup = {
                id: makeClientId('group'),
                name: '신규 그룹',
                stage,
                parent_group_id: parent.id,
                sort_order: siblings.length,
                is_system: false,
            };
            return {
                ...prev,
                groups: [...(prev.groups || []), newGroup],
            };
        });
        setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            if (parentGroup?.id) next.add(parentGroup.id);
            return next;
        });
    }, [canEdit, updateScheduleState]);

    const handleRenameGroup = useCallback((groupId, name) => {
        if (!canEdit) return;
        updateScheduleState((prev) => ({
            ...prev,
            groups: (prev.groups || []).map((group) => (
                group.id === groupId
                    ? { ...group, name }
                    : group
            )),
        }));
    }, [canEdit, updateScheduleState]);

    const handleDeleteGroup = useCallback((groupNode) => {
        if (!canEdit || !groupNode || groupNode.is_system) return;
        const descendants = collectDescendantGroupIds(groupNode);
        const removeSet = new Set([groupNode.id, ...descendants]);
        updateScheduleState((prev) => {
            const next = {
                ...prev,
                groups: (prev.groups || []).filter((group) => !removeSet.has(group.id)),
                rows: (prev.rows || []).filter((row) => !removeSet.has(row.parent_group_id)),
            };
            return cascadeRowsFrom(next, 0);
        });
    }, [canEdit, updateScheduleState]);

    const handleMoveGroup = useCallback((groupNode, direction) => {
        if (!canEdit || !groupNode || groupNode.is_system) return;
        updateScheduleState((prev) => {
            const siblings = (prev.groups || []).filter((group) => (
                group.stage === groupNode.stage
                && (group.parent_group_id || '') === (groupNode.parent_group_id || '')
                && !group.is_system
            )).sort((a, b) => a.sort_order - b.sort_order);
            const currentIndex = siblings.findIndex((item) => item.id === groupNode.id);
            if (currentIndex < 0) return prev;
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= siblings.length) return prev;
            const target = siblings[targetIndex];
            const reordered = reorderSiblingItems(siblings, groupNode.id, target.id, false);
            const orderMap = new Map(reordered.map((item, index) => [item.id, index]));
            return {
                ...prev,
                groups: (prev.groups || []).map((group) => (
                    orderMap.has(group.id)
                        ? { ...group, sort_order: orderMap.get(group.id) }
                        : group
                )),
            };
        });
    }, [canEdit, updateScheduleState]);

    const handleAddRow = useCallback((groupNode, kind = 'task') => {
        if (!canEdit || !groupNode) return;
        updateScheduleState((prev) => {
            const siblings = (prev.rows || []).filter((row) => row.parent_group_id === groupNode.id);
            const order = orderedRowIds(prev);
            const lastRow = order.length > 0
                ? (prev.rows || []).find((row) => row.id === order[order.length - 1])
                : null;
            const baseStart = lastRow?.end_date
                ? (nextStartDate(lastRow.end_date, prev.weekend_mode) || prev.anchor_date)
                : prev.anchor_date;
            const newRow = {
                id: makeClientId('row'),
                kind,
                name: kind === 'event' ? '신규 이벤트' : '신규 일정',
                stage: groupNode.stage,
                parent_group_id: groupNode.id,
                sort_order: siblings.length,
                duration_days: kind === 'event' ? 0 : 1,
                start_date: baseStart,
                end_date: baseStart,
                note: '',
            };
            return cascadeRowsFrom(
                {
                    ...prev,
                    rows: [...(prev.rows || []), newRow],
                },
                Math.max(0, order.length),
            );
        });
        setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            next.add(groupNode.id);
            return next;
        });
    }, [canEdit, updateScheduleState]);

    const handleDeleteRow = useCallback((rowId) => {
        if (!canEdit) return;
        updateScheduleState((prev) => {
            const index = findGlobalRowIndex(prev, rowId);
            const nextRows = (prev.rows || []).filter((row) => row.id !== rowId);
            return cascadeRowsFrom({ ...prev, rows: nextRows }, Math.max(0, index - 1));
        });
    }, [canEdit, updateScheduleState]);

    const handleMoveRow = useCallback((row, direction) => {
        if (!canEdit || !row) return;
        updateScheduleState((prev) => {
            const siblings = (prev.rows || []).filter((item) => (
                item.parent_group_id === row.parent_group_id
                && item.stage === row.stage
            )).sort((a, b) => a.sort_order - b.sort_order);
            const currentIndex = siblings.findIndex((item) => item.id === row.id);
            if (currentIndex < 0) return prev;
            const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= siblings.length) return prev;
            const target = siblings[targetIndex];
            const reordered = reorderSiblingItems(siblings, row.id, target.id, false);
            const orderMap = new Map(reordered.map((item, index) => [item.id, index]));
            return cascadeRowsFrom(
                {
                    ...prev,
                    rows: (prev.rows || []).map((item) => (
                        orderMap.has(item.id)
                            ? { ...item, sort_order: orderMap.get(item.id) }
                            : item
                    )),
                },
                0,
            );
        });
    }, [canEdit, updateScheduleState]);

    const handleEditRowField = useCallback((rowId, field, value) => {
        if (!canEdit) return;
        updateScheduleState((prev) => {
            const next = {
                ...prev,
                rows: (prev.rows || []).map((item) => (
                    item.id === rowId
                        ? {
                            ...item,
                            [field]: field === 'duration_days' ? Math.floor(Number(value || 0)) : value,
                        }
                        : item
                )),
            };
            const row = (next.rows || []).find((item) => item.id === rowId);
            if (!row) return prev;
            const sanitized = sanitizeEditedRow(row, field, next);
            next.rows = (next.rows || []).map((item) => (item.id === rowId ? sanitized : item));
            if (field === 'name' || field === 'note') return next;
            if (field === 'kind') {
                return cascadeRowsFrom(next, Math.max(0, findGlobalRowIndex(next, rowId)));
            }
            if (field === 'start_date' || field === 'end_date' || field === 'duration_days') {
                if (!parseYmd(next.anchor_date)) {
                    setError('기준 시작일(anchor_date)을 먼저 입력해야 자동 계산이 가능합니다.');
                    return next;
                }
                return cascadeFromRow(next, rowId);
            }
            return next;
        });
    }, [canEdit, cascadeFromRow, updateScheduleState]);

    const moveRowToGroup = useCallback((rowId, targetGroupId) => {
        updateScheduleState((prev) => {
            const targetGroup = (prev.groups || []).find((group) => group.id === targetGroupId);
            if (!targetGroup) return prev;
            const nextRows = (prev.rows || []).map((row) => (
                row.id === rowId
                    ? {
                        ...row,
                        parent_group_id: targetGroup.id,
                        stage: targetGroup.stage,
                    }
                    : row
            ));
            return cascadeRowsFrom({ ...prev, rows: nextRows }, 0);
        });
    }, [updateScheduleState]);

    const handleDragStart = useCallback((event, payload) => {
        if (!canEdit) return;
        setDragState(payload);
        event.dataTransfer.effectAllowed = 'move';
        try {
            event.dataTransfer.setData('text/plain', JSON.stringify(payload));
        } catch (_error) {
            // noop
        }
    }, [canEdit]);

    const handleDropOnGroup = useCallback((event, groupNode) => {
        event.preventDefault();
        if (!dragState || !canEdit) return;

        if (dragState.type === 'row') {
            moveRowToGroup(dragState.id, groupNode.id);
            setDragState(null);
            return;
        }

        if (dragState.type === 'group') {
            updateScheduleState((prev) => {
                const source = (prev.groups || []).find((group) => group.id === dragState.id);
                const target = (prev.groups || []).find((group) => group.id === groupNode.id);
                if (!source || !target || source.is_system) return prev;
                if (source.stage !== target.stage) return prev;
                if (source.id === target.id) return prev;
                const childrenMap = new Map();
                (prev.groups || []).forEach((group) => {
                    const key = String(group.parent_group_id || '');
                    const list = childrenMap.get(key) || [];
                    list.push(group.id);
                    childrenMap.set(key, list);
                });
                const descendants = new Set();
                const stack = [source.id];
                while (stack.length > 0) {
                    const current = stack.pop();
                    (childrenMap.get(String(current || '')) || []).forEach((childId) => {
                        if (descendants.has(childId)) return;
                        descendants.add(childId);
                        stack.push(childId);
                    });
                }
                if (descendants.has(target.id)) return prev;

                const childCount = (prev.groups || []).filter((group) => (
                    !group.is_system
                    && group.stage === source.stage
                    && group.parent_group_id === target.id
                )).length;
                return {
                    ...prev,
                    groups: (prev.groups || []).map((group) => {
                        if (group.id === source.id) {
                            return {
                                ...group,
                                parent_group_id: target.id,
                                sort_order: childCount,
                            };
                        }
                        return group;
                    }),
                };
            });
            setDragState(null);
        }
    }, [canEdit, dragState, moveRowToGroup, updateScheduleState]);

    const handleDropOnRow = useCallback((event, row) => {
        event.preventDefault();
        if (!dragState || !canEdit) return;
        if (dragState.type !== 'row') return;
        updateScheduleState((prev) => {
            const source = (prev.rows || []).find((item) => item.id === dragState.id);
            const target = (prev.rows || []).find((item) => item.id === row.id);
            if (!source || !target || source.id === target.id) return prev;
            const targetGroup = source.stage === target.stage
                ? target.parent_group_id
                : target.parent_group_id;
            const siblings = (prev.rows || []).filter((item) => (
                item.parent_group_id === targetGroup
                && item.stage === target.stage
            )).sort((a, b) => a.sort_order - b.sort_order);
            const existingSourceIndex = siblings.findIndex((item) => item.id === source.id);
            const sourceCandidate = existingSourceIndex >= 0
                ? siblings
                : [{ ...source, parent_group_id: targetGroup, stage: target.stage, sort_order: siblings.length }, ...siblings];
            const reordered = reorderSiblingItems(sourceCandidate, source.id, target.id, false);
            const orderMap = new Map(reordered.map((item, index) => [item.id, index]));
            return cascadeRowsFrom(
                {
                    ...prev,
                    rows: (prev.rows || []).map((item) => {
                        if (item.id === source.id) {
                            return {
                                ...item,
                                stage: target.stage,
                                parent_group_id: targetGroup,
                                sort_order: orderMap.get(item.id) ?? item.sort_order,
                            };
                        }
                        if (orderMap.has(item.id)) {
                            return { ...item, sort_order: orderMap.get(item.id) };
                        }
                        return item;
                    }),
                },
                0,
            );
        });
        setDragState(null);
    }, [canEdit, dragState, updateScheduleState]);

    const handleSave = useCallback(async () => {
        if (!projectId) return;
        setIsSaving(true);
        setError('');
        setNotice('');
        try {
            if (!parseYmd(schedule.anchor_date)) {
                throw new Error('기준 시작일(anchor_date)은 YYYY-MM-DD 형식으로 입력해야 합니다.');
            }
            const payload = normalizeSchedulePayload(schedule);
            const response = await api.put(`/budget/projects/${projectId}/schedule`, payload);
            const saved = normalizeSchedulePayload(response?.data?.schedule || payload);
            setSchedule(saved);
            setNotice('일정이 저장되었습니다.');
        } catch (err) {
            setError(getErrorMessage(err, err?.message || '일정을 저장하지 못했습니다.'));
        } finally {
            setIsSaving(false);
        }
    }, [projectId, schedule]);

    const loadImportCandidates = useCallback(async (queryText = '') => {
        setImportLoading(true);
        try {
            if (queryText.trim()) {
                const searchResp = await api.get('/budget/projects/search', {
                    params: { q: queryText.trim(), limit: 20 },
                });
                const items = Array.isArray(searchResp?.data) ? searchResp.data : [];
                const mapped = items.map((item) => ({
                    id: item.project_id,
                    name: item.name || '프로젝트',
                    code: item.code || '',
                })).filter((item) => item.id);
                setImportCandidates(mapped);
                return;
            }
            const listResp = await api.get('/budget/projects', {
                params: { page: 1, page_size: 20, sort_by: 'updated_desc' },
            });
            const items = Array.isArray(listResp?.data?.items) ? listResp.data.items : [];
            setImportCandidates(items.map((item) => ({
                id: item.id,
                name: item.name || '프로젝트',
                code: item.code || '',
            })));
        } catch (err) {
            setError(getErrorMessage(err, '프로젝트 목록을 불러오지 못했습니다.'));
        } finally {
            setImportLoading(false);
        }
    }, []);

    const handleOpenImport = useCallback(async () => {
        setImportOpen(true);
        setSelectedImportProjectId('');
        await loadImportCandidates('');
    }, [loadImportCandidates]);

    const handleApplyImport = useCallback(async () => {
        if (!selectedImportProjectId) return;
        setImportLoading(true);
        try {
            const response = await api.get(`/budget/projects/${selectedImportProjectId}/schedule`);
            const sourceSchedule = normalizeSchedulePayload(response?.data?.schedule || createDefaultSchedule());
            setSchedule(sourceSchedule);
            setExpandedGroupIds(new Set(sourceSchedule.groups.map((group) => group.id)));
            setImportOpen(false);
            setNotice('일정을 불러왔습니다. 저장 버튼으로 현재 프로젝트에 확정하세요.');
        } catch (err) {
            setError(getErrorMessage(err, '선택한 프로젝트 일정을 불러오지 못했습니다.'));
        } finally {
            setImportLoading(false);
        }
    }, [selectedImportProjectId]);

    const headerActions = (
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/project-management/projects/${project?.id || projectId}/schedule`)}>
                일정 관리 보기
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleCollapseAll}>모두 접기</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleExpandAll}>모두 펼치기</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenImport} disabled={!canEdit}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                일정 불러오기
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!canEdit || isSaving}>
                {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                저장
            </Button>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                일정 데이터를 불러오는 중입니다.
            </div>
        );
    }

    if (!project) {
        return <p className="text-sm text-slate-500">프로젝트를 찾을 수 없습니다.</p>;
    }

    const projectTypeKey = String(project?.project_type || '').trim().toLowerCase();
    const isAsProject = projectTypeKey === 'as';
    const parentProject = project?.parent_project || null;

    if (isAsProject) {
        return (
            <div className="space-y-5">
                <ProjectPageHeader
                    projectId={project.id}
                    projectName={project.name || '프로젝트'}
                    projectCode={project.code || ''}
                    pageLabel="일정 작성"
                    canEdit={false}
                    breadcrumbItems={[
                        { label: '프로젝트 관리', to: '/project-management' },
                        { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                        { label: '일정 관리', to: `/project-management/projects/${project.id}/schedule` },
                        { label: '일정 작성' },
                    ]}
                    actions={parentProject?.id ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/project-management/projects/${parentProject.id}/schedule`)}
                        >
                            소속 설비 일정 보기
                        </Button>
                    ) : null}
                />

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-semibold">AS 프로젝트는 일정 입력이 필요하지 않습니다.</p>
                    {parentProject?.id ? (
                        <p className="mt-2 text-xs text-amber-900/80">
                            소속 설비 프로젝트에서 일정을 관리해 주세요.
                        </p>
                    ) : (
                        <p className="mt-2 text-xs text-amber-900/80">
                            소속 설비 프로젝트가 지정되어 있지 않습니다. 프로젝트 정보에서 소속 설비를 선택해 주세요.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    const renderGroupNode = (groupNode, depth = 0) => {
        const isExpanded = expandedGroupIds.has(groupNode.id);
        const stats = groupStats.get(groupNode.id) || {
            total_days: 0,
            first_start: '',
            last_end: '',
            row_count: 0,
        };
        const rows = groupNode.rows || [];
        const children = groupNode.children || [];
        return (
            <React.Fragment key={groupNode.id}>
                <tr
                    className={cn('bg-slate-100/70', depth === 0 && 'bg-slate-200/70')}
                    draggable={canEdit && !groupNode.is_system}
                    onDragStart={(event) => handleDragStart(event, { type: 'group', id: groupNode.id })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDropOnGroup(event, groupNode)}
                >
                    <td className="px-2 py-2">
                        <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                            onClick={() => toggleGroupExpanded(groupNode.id)}
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </td>
                    <td className="px-2 py-2 text-xs font-semibold text-slate-600">{STAGE_LABELS[groupNode.stage]}</td>
                    <td className="px-2 py-2 text-xs">
                        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 14}px` }}>
                            <Input
                                value={groupNode.name}
                                onChange={(event) => handleRenameGroup(groupNode.id, event.target.value)}
                                className="h-8 min-w-[180px]"
                                disabled={!canEdit || groupNode.is_system}
                            />
                            <GroupStatBadge label="행" value={stats.row_count} />
                            <GroupStatBadge label="총작업일" value={stats.total_days} />
                            <GroupStatBadge label="시작" value={formatRangeDate(stats.first_start)} />
                            <GroupStatBadge label="종료" value={formatRangeDate(stats.last_end)} />
                        </div>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-slate-600">-</td>
                    <td className="px-2 py-2 text-right text-xs text-slate-600">-</td>
                    <td className="px-2 py-2 text-right text-xs text-slate-600">-</td>
                    <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                            <Button type="button" variant="outline" size="icon" onClick={() => handleAddGroup(groupNode)} disabled={!canEdit}>
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleAddRow(groupNode, 'task')} disabled={!canEdit}>
                                <CalendarRange className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleAddRow(groupNode, 'event')} disabled={!canEdit}>
                                <CalendarDays className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleMoveGroup(groupNode, 'up')} disabled={!canEdit || groupNode.is_system}>
                                <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleMoveGroup(groupNode, 'down')} disabled={!canEdit || groupNode.is_system}>
                                <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => handleDeleteGroup(groupNode)} disabled={!canEdit || groupNode.is_system}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </td>
                </tr>
                {isExpanded && rows.map((row) => (
                    <tr
                        key={row.id}
                        className={cn(
                            'text-xs',
                            row.kind === 'event' ? 'bg-amber-50/80' : 'bg-white',
                        )}
                        draggable={canEdit}
                        onDragStart={(event) => handleDragStart(event, { type: 'row', id: row.id })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDropOnRow(event, row)}
                    >
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2 text-slate-600">{STAGE_LABELS[row.stage]}</td>
                        <td className="px-2 py-2">
                            <div className="flex items-center gap-2" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
                                <select
                                    value={row.kind}
                                    onChange={(event) => handleEditRowField(row.id, 'kind', event.target.value)}
                                    className="h-8 rounded border border-slate-300 bg-white px-2 text-[11px]"
                                    disabled={!canEdit}
                                >
                                    <option value="task">일정</option>
                                    <option value="event">이벤트</option>
                                </select>
                                <Input
                                    value={row.name}
                                    onChange={(event) => handleEditRowField(row.id, 'name', event.target.value)}
                                    className="h-8"
                                    disabled={!canEdit}
                                />
                            </div>
                        </td>
                        <td className="px-2 py-2">
                            <Input
                                type="date"
                                value={row.start_date || ''}
                                onChange={(event) => handleEditRowField(row.id, 'start_date', event.target.value)}
                                className="h-8"
                                disabled={!canEdit}
                            />
                        </td>
                        <td className="px-2 py-2">
                            <Input
                                type="date"
                                value={row.end_date || ''}
                                onChange={(event) => handleEditRowField(row.id, 'end_date', event.target.value)}
                                className="h-8"
                                disabled={!canEdit}
                            />
                        </td>
                        <td className="px-2 py-2">
                            <Input
                                type="number"
                                value={row.kind === 'event' ? 0 : row.duration_days}
                                onChange={(event) => handleEditRowField(row.id, 'duration_days', event.target.value)}
                                className="h-8 text-right"
                                disabled={!canEdit || row.kind === 'event'}
                            />
                        </td>
                        <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                                <Button type="button" variant="outline" size="icon" onClick={() => handleMoveRow(row, 'up')} disabled={!canEdit}>
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" variant="outline" size="icon" onClick={() => handleMoveRow(row, 'down')} disabled={!canEdit}>
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" variant="outline" size="icon" onClick={() => handleDeleteRow(row.id)} disabled={!canEdit}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                ))}
                {isExpanded && children.map((childNode) => renderGroupNode(childNode, depth + 1))}
            </React.Fragment>
        );
    };

    return (
        <div className="space-y-5">
            <ProjectPageHeader
                projectId={project.id}
                projectName={project.name || '프로젝트'}
                projectCode={project.code || ''}
                pageLabel="일정 작성"
                canEdit={canEdit}
                breadcrumbItems={[
                    { label: '프로젝트 관리', to: '/project-management' },
                    { label: project.name || '프로젝트', to: `/project-management/projects/${project.id}` },
                    { label: '일정 관리', to: `/project-management/projects/${project.id}/schedule` },
                    { label: '일정 작성' },
                ]}
                actions={headerActions}
            />

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                    <div>
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">기준 시작일</p>
                        <Input
                            type="date"
                            value={schedule.anchor_date || ''}
                            onChange={(event) => handleAnchorDateChange(event.target.value)}
                            disabled={!canEdit}
                        />
                    </div>
                    <div>
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">작업일 계산</p>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant={schedule.weekend_mode === WEEKEND_MODES.exclude ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleWeekendModeChange(WEEKEND_MODES.exclude)}
                                disabled={!canEdit}
                            >
                                주말 제외
                            </Button>
                            <Button
                                type="button"
                                variant={schedule.weekend_mode === WEEKEND_MODES.include ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleWeekendModeChange(WEEKEND_MODES.include)}
                                disabled={!canEdit}
                            >
                                주말 포함
                            </Button>
                        </div>
                    </div>
                    <div>
                        <p className="mb-1 text-[11px] font-semibold text-slate-500">간트 자동 단위</p>
                        <div className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
                            {scale === 'day' ? '일 단위' : scale === 'week' ? '주 단위' : '월 단위'}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] table-fixed text-left">
                        <colgroup>
                            <col className="w-[52px]" />
                            <col className="w-[90px]" />
                            <col />
                            <col className="w-[165px]" />
                            <col className="w-[165px]" />
                            <col className="w-[100px]" />
                            <col className="w-[210px]" />
                        </colgroup>
                        <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                                <th className="px-2 py-3 text-center">펼침</th>
                                <th className="px-2 py-3">단계</th>
                                <th className="px-2 py-3">명칭 / 그룹</th>
                                <th className="px-2 py-3">시작일</th>
                                <th className="px-2 py-3">종료일</th>
                                <th className="px-2 py-3 text-right">작업일</th>
                                <th className="px-2 py-3 text-right">동작</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {hierarchy.stages.map((stageNode) => renderGroupNode(stageNode.root, 0))}
                            {flatRows.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                                        일정이 없습니다. 각 그룹에서 일정 또는 이벤트를 추가하세요.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <h3 className="text-sm font-bold text-slate-800">간트 차트 (자동 단위: {scale === 'day' ? '일' : scale === 'week' ? '주' : '월'})</h3>
                </div>
                <div className="space-y-3 p-4">
                    {!bounds && (
                        <p className="text-sm text-slate-500">표시할 일정 범위가 없습니다.</p>
                    )}
                    {bounds && (
                        <>
                            <div className="text-xs text-slate-500">
                                표시 범위: {formatDateObject(bounds.min)} ~ {formatDateObject(bounds.max)}
                            </div>
                            <div className="rounded border border-slate-200">
                                <div className="relative border-b border-slate-200 bg-slate-50 py-3">
                                    {tickItems.map((tick) => (
                                        <div
                                            key={tick.key}
                                            className="absolute top-1/2 -translate-y-1/2 border-l border-slate-300 pl-1 text-[10px] text-slate-500"
                                            style={{ left: `${tick.left}%` }}
                                        >
                                            {tick.label}
                                        </div>
                                    ))}
                                </div>
                                <div className="relative">
                                    {weekendOverlays.map((overlay) => (
                                        <div
                                            key={overlay.key}
                                            className="pointer-events-none absolute inset-y-0 bg-slate-200/35"
                                            style={{ left: `${overlay.left}%`, width: `${overlay.width}%` }}
                                        />
                                    ))}
                                    {flatRows.map((row) => {
                                        const position = ganttPosition(row, bounds);
                                        return (
                                            <div key={`gantt-${row.id}`} className="relative flex h-9 items-center border-b border-slate-100 px-3">
                                                <div className="w-64 shrink-0 truncate pr-3 text-xs text-slate-600">{row.name}</div>
                                                <div className="relative h-4 flex-1 rounded bg-slate-100">
                                                    {position.isPoint ? (
                                                        <span
                                                            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white bg-amber-500"
                                                            style={{ left: `calc(${position.left}% - 6px)` }}
                                                        />
                                                    ) : (
                                                        <span
                                                            className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-blue-500"
                                                            style={{ left: `${position.left}%`, width: `${Math.max(position.width, 0.8)}%` }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {error && (
                <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                </div>
            )}
            {notice && (
                <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {notice}
                </div>
            )}

            <ImportScheduleModal
                open={importOpen}
                loading={importLoading}
                query={importQuery}
                onQueryChange={setImportQuery}
                onSearch={() => loadImportCandidates(importQuery)}
                candidates={importCandidates}
                selectedProjectId={selectedImportProjectId}
                onSelect={setSelectedImportProjectId}
                onClose={() => setImportOpen(false)}
                onApply={handleApplyImport}
            />
        </div>
    );
};

export default BudgetProjectSchedule;
