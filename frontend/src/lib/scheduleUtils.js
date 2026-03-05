export const SCHEDULE_SCHEMA_VERSION = 'wbs.v1';
export const STAGE_ORDER = ['design', 'fabrication', 'installation'];
export const STAGE_LABELS = {
    design: '설계',
    fabrication: '제작',
    installation: '설치',
};
export const ROOT_GROUP_IDS = {
    design: 'stage-design',
    fabrication: 'stage-fabrication',
    installation: 'stage-installation',
};
export const WEEKEND_MODES = {
    include: 'include',
    exclude: 'exclude',
};

const STAGE_ALIASES = {
    design: 'design',
    '설계': 'design',
    fabrication: 'fabrication',
    '제작': 'fabrication',
    installation: 'installation',
    install: 'installation',
    '설치': 'installation',
};

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function todayYmd() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function normalizeStage(value) {
    const key = String(value || '').trim().toLowerCase();
    return STAGE_ALIASES[key] || 'design';
}

export function normalizeWeekendMode(value) {
    const key = String(value || '').trim().toLowerCase();
    return key === WEEKEND_MODES.include ? WEEKEND_MODES.include : WEEKEND_MODES.exclude;
}

export function parseYmd(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [y, m, d] = text.split('-').map((item) => Number(item));
    const utc = new Date(Date.UTC(y, m - 1, d));
    if (
        utc.getUTCFullYear() !== y
        || utc.getUTCMonth() + 1 !== m
        || utc.getUTCDate() !== d
    ) {
        return null;
    }
    return utc;
}

export function formatYmd(dateObj) {
    if (!(dateObj instanceof Date)) return '';
    const yyyy = dateObj.getUTCFullYear();
    const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function isWeekend(dateObj) {
    const day = dateObj.getUTCDay();
    return day === 0 || day === 6;
}

function addCalendarDays(baseDate, delta) {
    const copied = new Date(baseDate.getTime());
    copied.setUTCDate(copied.getUTCDate() + delta);
    return copied;
}

export function addScheduleDays(baseDate, delta, weekendMode) {
    if (normalizeWeekendMode(weekendMode) === WEEKEND_MODES.include) {
        return addCalendarDays(baseDate, delta);
    }
    if (delta === 0) return new Date(baseDate.getTime());

    let remaining = Math.abs(delta);
    let cursor = new Date(baseDate.getTime());
    const direction = delta > 0 ? 1 : -1;
    while (remaining > 0) {
        cursor = addCalendarDays(cursor, direction);
        if (isWeekend(cursor)) continue;
        remaining -= 1;
    }
    return cursor;
}

export function nextStartDate(prevEndYmd, weekendMode) {
    const parsed = parseYmd(prevEndYmd);
    if (!parsed) return '';
    return formatYmd(addScheduleDays(parsed, 1, weekendMode));
}

export function durationFromRange(startYmd, endYmd, weekendMode) {
    const start = parseYmd(startYmd);
    const end = parseYmd(endYmd);
    if (!start || !end) return 1;

    if (end < start) return 1;
    if (normalizeWeekendMode(weekendMode) === WEEKEND_MODES.include) {
        return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    }

    let count = 0;
    let cursor = new Date(start.getTime());
    while (cursor <= end) {
        if (!isWeekend(cursor)) {
            count += 1;
        }
        cursor = addCalendarDays(cursor, 1);
    }
    return Math.max(1, count);
}

export function endDateFromDuration(startYmd, durationDays, weekendMode) {
    const start = parseYmd(startYmd);
    if (!start) return '';
    const duration = Math.max(1, Math.floor(toNumber(durationDays, 1)));
    return formatYmd(addScheduleDays(start, duration - 1, weekendMode));
}

function cloneGroup(group) {
    return {
        id: String(group?.id || '').trim(),
        name: String(group?.name || ''),
        stage: normalizeStage(group?.stage),
        parent_group_id: group?.parent_group_id ? String(group.parent_group_id).trim() : null,
        sort_order: Math.max(0, Math.floor(toNumber(group?.sort_order, 0))),
        is_system: Boolean(group?.is_system),
    };
}

function cloneRow(row) {
    return {
        id: String(row?.id || '').trim(),
        kind: String(row?.kind || '').trim().toLowerCase() === 'event' ? 'event' : 'task',
        name: String(row?.name || ''),
        stage: normalizeStage(row?.stage),
        parent_group_id: String(row?.parent_group_id || '').trim(),
        sort_order: Math.max(0, Math.floor(toNumber(row?.sort_order, 0))),
        duration_days: Math.floor(toNumber(row?.duration_days, 1)),
        start_date: String(row?.start_date || '').trim(),
        end_date: String(row?.end_date || '').trim(),
        note: String(row?.note || '').trim(),
    };
}

function ensureUniqueId(base, fallbackPrefix, usedIds, orderNo) {
    const normalized = String(base || '').trim() || `${fallbackPrefix}-${orderNo}`;
    if (!usedIds.has(normalized)) {
        usedIds.add(normalized);
        return normalized;
    }
    let suffix = 2;
    while (true) {
        const candidate = `${normalized}-${suffix}`;
        if (!usedIds.has(candidate)) {
            usedIds.add(candidate);
            return candidate;
        }
        suffix += 1;
    }
}

export function createDefaultSchedule(anchorDate = todayYmd()) {
    const safeAnchor = parseYmd(anchorDate) ? anchorDate : todayYmd();
    return {
        schema_version: SCHEDULE_SCHEMA_VERSION,
        weekend_mode: WEEKEND_MODES.exclude,
        anchor_date: safeAnchor,
        groups: STAGE_ORDER.map((stage, index) => ({
            id: ROOT_GROUP_IDS[stage],
            name: STAGE_LABELS[stage],
            stage,
            parent_group_id: null,
            sort_order: index,
            is_system: true,
        })),
        rows: [],
        updated_at: '',
    };
}

function buildGroupMap(groups) {
    return new Map((groups || []).map((group) => [group.id, group]));
}

function normalizeGroupSortOrders(groups) {
    const parentMap = new Map();
    (groups || []).forEach((group) => {
        if (group.is_system) return;
        const key = `${group.stage}::${group.parent_group_id || ''}`;
        const list = parentMap.get(key) || [];
        list.push(group);
        parentMap.set(key, list);
    });
    parentMap.forEach((siblings) => {
        siblings.sort((a, b) => {
            const diff = a.sort_order - b.sort_order;
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id, 'ko-KR');
        });
        siblings.forEach((item, index) => {
            item.sort_order = index;
        });
    });
}

function normalizeRowSortOrders(rows) {
    const parentMap = new Map();
    (rows || []).forEach((row) => {
        const key = `${row.stage}::${row.parent_group_id}`;
        const list = parentMap.get(key) || [];
        list.push(row);
        parentMap.set(key, list);
    });
    parentMap.forEach((siblings) => {
        siblings.sort((a, b) => {
            const diff = a.sort_order - b.sort_order;
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id, 'ko-KR');
        });
        siblings.forEach((item, index) => {
            item.sort_order = index;
        });
    });
}

export function normalizeSchedulePayload(raw) {
    const defaults = createDefaultSchedule(
        parseYmd(raw?.anchor_date) ? String(raw.anchor_date) : todayYmd(),
    );
    const usedGroupIds = new Set(defaults.groups.map((item) => item.id));
    const customGroups = [];
    (Array.isArray(raw?.groups) ? raw.groups : []).forEach((sourceGroup, index) => {
        const cloned = cloneGroup(sourceGroup);
        if (!cloned.id || Object.values(ROOT_GROUP_IDS).includes(cloned.id)) return;
        const stage = normalizeStage(cloned.stage);
        cloned.stage = stage;
        cloned.id = ensureUniqueId(cloned.id, `group-${stage}`, usedGroupIds, index + 1);
        cloned.name = cloned.name.trim() ? cloned.name : '그룹';
        customGroups.push(cloned);
    });

    const allGroups = [...defaults.groups, ...customGroups];
    const groupMap = buildGroupMap(allGroups);
    customGroups.forEach((group) => {
        const rootId = ROOT_GROUP_IDS[group.stage];
        const parentId = String(group.parent_group_id || '').trim();
        const parent = groupMap.get(parentId);
        if (!parent) {
            group.parent_group_id = rootId;
            return;
        }
        if (parent.stage !== group.stage) {
            group.parent_group_id = rootId;
            return;
        }
        group.parent_group_id = parent.id;
    });

    const customById = new Map(customGroups.map((group) => [group.id, group]));
    customGroups.forEach((group) => {
        const rootId = ROOT_GROUP_IDS[group.stage];
        const visited = new Set([group.id]);
        let cursor = group.parent_group_id;
        while (customById.has(cursor)) {
            if (visited.has(cursor)) {
                group.parent_group_id = rootId;
                break;
            }
            visited.add(cursor);
            cursor = customById.get(cursor)?.parent_group_id || '';
        }
    });
    normalizeGroupSortOrders(allGroups);

    const usedRowIds = new Set();
    const rows = [];
    (Array.isArray(raw?.rows) ? raw.rows : []).forEach((sourceRow, index) => {
        const cloned = cloneRow(sourceRow);
        cloned.id = ensureUniqueId(cloned.id, 'row', usedRowIds, index + 1);
        const parent = groupMap.get(cloned.parent_group_id);
        if (!parent) {
            cloned.parent_group_id = ROOT_GROUP_IDS[cloned.stage];
        } else {
            cloned.parent_group_id = parent.id;
            cloned.stage = parent.stage;
        }
        const start = parseYmd(cloned.start_date);
        const end = parseYmd(cloned.end_date);
        if (cloned.kind === 'event') {
            cloned.duration_days = 0;
            if (!start && !end) {
                cloned.start_date = defaults.anchor_date;
                cloned.end_date = defaults.anchor_date;
            } else {
                const point = start || end;
                cloned.start_date = formatYmd(point);
                cloned.end_date = formatYmd(point);
            }
        } else {
            cloned.duration_days = Math.max(1, Math.floor(toNumber(cloned.duration_days, 1)));
            if (start && end) {
                const normalizedEnd = end < start ? start : end;
                cloned.start_date = formatYmd(start);
                cloned.end_date = formatYmd(normalizedEnd);
                cloned.duration_days = durationFromRange(cloned.start_date, cloned.end_date, raw?.weekend_mode);
            } else if (start && !end) {
                cloned.start_date = formatYmd(start);
                cloned.end_date = cloned.start_date;
                cloned.duration_days = 1;
            } else if (!start && end) {
                cloned.start_date = formatYmd(end);
                cloned.end_date = cloned.start_date;
                cloned.duration_days = 1;
            } else {
                cloned.start_date = defaults.anchor_date;
                cloned.end_date = endDateFromDuration(cloned.start_date, cloned.duration_days, raw?.weekend_mode);
            }
        }
        rows.push(cloned);
    });
    normalizeRowSortOrders(rows);

    return {
        schema_version: SCHEDULE_SCHEMA_VERSION,
        weekend_mode: normalizeWeekendMode(raw?.weekend_mode),
        anchor_date: defaults.anchor_date,
        groups: allGroups,
        rows,
        updated_at: String(raw?.updated_at || ''),
    };
}

export function buildHierarchy(schedule) {
    const normalized = normalizeSchedulePayload(schedule);
    const groups = normalized.groups || [];
    const rows = normalized.rows || [];
    const rowsByParent = new Map();
    rows.forEach((row) => {
        const list = rowsByParent.get(row.parent_group_id) || [];
        list.push(row);
        rowsByParent.set(row.parent_group_id, list);
    });
    rowsByParent.forEach((list) => {
        list.sort((a, b) => {
            const diff = a.sort_order - b.sort_order;
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id, 'ko-KR');
        });
    });

    const groupsByParent = new Map();
    groups.forEach((group) => {
        const key = group.parent_group_id || '';
        const list = groupsByParent.get(key) || [];
        list.push(group);
        groupsByParent.set(key, list);
    });
    groupsByParent.forEach((list) => {
        list.sort((a, b) => {
            if (a.is_system && !b.is_system) return -1;
            if (!a.is_system && b.is_system) return 1;
            const diff = a.sort_order - b.sort_order;
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id, 'ko-KR');
        });
    });

    function buildGroupNode(group) {
        return {
            ...group,
            rows: [...(rowsByParent.get(group.id) || [])],
            children: (groupsByParent.get(group.id) || []).map((child) => buildGroupNode(child)),
        };
    }

    const stages = STAGE_ORDER.map((stage) => {
        const root = groups.find((item) => item.id === ROOT_GROUP_IDS[stage]) || {
            id: ROOT_GROUP_IDS[stage],
            stage,
            name: STAGE_LABELS[stage],
            sort_order: STAGE_ORDER.indexOf(stage),
            parent_group_id: null,
            is_system: true,
        };
        return {
            stage,
            label: STAGE_LABELS[stage],
            root: buildGroupNode(root),
        };
    });

    return {
        ...normalized,
        stages,
    };
}

export function orderedRows(schedule) {
    const hierarchy = buildHierarchy(schedule);
    const output = [];
    const walkGroup = (groupNode) => {
        (groupNode.rows || []).forEach((row) => output.push(row));
        (groupNode.children || []).forEach((child) => walkGroup(child));
    };
    hierarchy.stages.forEach((stageNode) => walkGroup(stageNode.root));
    return output;
}

export function orderedRowIds(schedule) {
    return orderedRows(schedule).map((row) => row.id);
}

export function findGlobalRowIndex(schedule, rowId) {
    return orderedRowIds(schedule).findIndex((id) => id === rowId);
}

export function cascadeRowsFrom(schedule, startIndex = 0) {
    const normalized = normalizeSchedulePayload(schedule);
    const order = orderedRowIds(normalized);
    if (!order.length) return normalized;
    if (startIndex < 0) return normalized;
    if (startIndex >= order.length) return normalized;

    const rowMap = new Map(normalized.rows.map((row) => [row.id, { ...row }]));
    const weekendMode = normalizeWeekendMode(normalized.weekend_mode);

    for (let index = startIndex; index < order.length; index += 1) {
        const rowId = order[index];
        const row = rowMap.get(rowId);
        if (!row) continue;

        const prevId = index > 0 ? order[index - 1] : '';
        const prevRow = prevId ? rowMap.get(prevId) : null;
        const baseStart = prevRow?.end_date
            ? nextStartDate(prevRow.end_date, weekendMode)
            : normalized.anchor_date;

        if (!parseYmd(row.start_date)) {
            row.start_date = baseStart;
        } else if (index > startIndex) {
            row.start_date = baseStart;
        }

        if (row.kind === 'event') {
            row.duration_days = 0;
            row.end_date = row.start_date;
        } else {
            row.duration_days = Math.max(1, Math.floor(toNumber(row.duration_days, 1)));
            row.end_date = endDateFromDuration(row.start_date, row.duration_days, weekendMode);
        }
    }

    normalized.rows = normalized.rows.map((row) => rowMap.get(row.id) || row);
    return normalized;
}

export function sanitizeEditedRow(row, editedField, schedule) {
    const weekendMode = normalizeWeekendMode(schedule?.weekend_mode);
    const cloned = { ...row };
    if (cloned.kind === 'event') {
        const start = parseYmd(cloned.start_date);
        const end = parseYmd(cloned.end_date);
        const point = start || end || parseYmd(schedule?.anchor_date) || parseYmd(todayYmd());
        cloned.start_date = formatYmd(point);
        cloned.end_date = formatYmd(point);
        cloned.duration_days = 0;
        return cloned;
    }

    cloned.duration_days = Math.max(1, Math.floor(toNumber(cloned.duration_days, 1)));
    const start = parseYmd(cloned.start_date);
    const end = parseYmd(cloned.end_date);

    if (editedField === 'duration_days') {
        if (start) {
            cloned.end_date = endDateFromDuration(formatYmd(start), cloned.duration_days, weekendMode);
        }
        return cloned;
    }

    if (editedField === 'start_date') {
        if (start && !end) {
            cloned.end_date = cloned.start_date;
            cloned.duration_days = 1;
            return cloned;
        }
        if (start && end) {
            const safeEnd = end < start ? start : end;
            cloned.end_date = formatYmd(safeEnd);
            cloned.duration_days = durationFromRange(cloned.start_date, cloned.end_date, weekendMode);
            return cloned;
        }
        return cloned;
    }

    if (editedField === 'end_date') {
        if (!start && end) {
            cloned.start_date = cloned.end_date;
            cloned.duration_days = 1;
            return cloned;
        }
        if (start && end) {
            const safeEnd = end < start ? start : end;
            cloned.end_date = formatYmd(safeEnd);
            cloned.duration_days = durationFromRange(cloned.start_date, cloned.end_date, weekendMode);
            return cloned;
        }
    }

    return cloned;
}

export function computeGroupStats(schedule) {
    const hierarchy = buildHierarchy(schedule);
    const statMap = new Map();

    const collect = (groupNode) => {
        const ownRows = groupNode.rows || [];
        const childResults = (groupNode.children || []).map((child) => collect(child));
        const allRows = [
            ...ownRows,
            ...childResults.flatMap((item) => item.rows),
        ];
        let totalDays = 0;
        let firstStart = '';
        let lastEnd = '';
        allRows.forEach((row) => {
            if (row.kind === 'event') return;
            totalDays += Math.max(1, Math.floor(toNumber(row.duration_days, 1)));
            if (!firstStart || (row.start_date && row.start_date < firstStart)) {
                firstStart = row.start_date || firstStart;
            }
            if (!lastEnd || (row.end_date && row.end_date > lastEnd)) {
                lastEnd = row.end_date || lastEnd;
            }
        });
        statMap.set(groupNode.id, {
            total_days: totalDays,
            first_start: firstStart,
            last_end: lastEnd,
            row_count: allRows.length,
        });
        return { rows: allRows };
    };

    hierarchy.stages.forEach((stageNode) => {
        collect(stageNode.root);
    });
    return statMap;
}

export function getScheduleBounds(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    let minDate = null;
    let maxDate = null;
    safeRows.forEach((row) => {
        const start = parseYmd(row?.start_date);
        const end = parseYmd(row?.end_date);
        if (!start || !end) return;
        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || end > maxDate) maxDate = end;
    });
    if (!minDate || !maxDate) return null;
    return {
        min: minDate,
        max: maxDate,
        days: Math.max(1, Math.floor((maxDate.getTime() - minDate.getTime()) / 86400000) + 1),
    };
}

export function pickAutoScale(rows) {
    const bounds = getScheduleBounds(rows);
    if (!bounds) return 'day';
    if (bounds.days <= 45) return 'day';
    if (bounds.days <= 240) return 'week';
    return 'month';
}

export function ganttPosition(row, bounds) {
    if (!bounds) return { left: 0, width: 0, isPoint: true };
    const start = parseYmd(row?.start_date);
    const end = parseYmd(row?.end_date);
    if (!start || !end) return { left: 0, width: 0, isPoint: true };

    const totalDays = Math.max(1, bounds.days);
    const startOffset = Math.max(0, Math.floor((start.getTime() - bounds.min.getTime()) / 86400000));
    const endOffset = Math.max(0, Math.floor((end.getTime() - bounds.min.getTime()) / 86400000));
    const spanDays = Math.max(1, endOffset - startOffset + 1);
    const left = (startOffset / totalDays) * 100;
    const width = row?.kind === 'event'
        ? 0
        : (spanDays / totalDays) * 100;
    return {
        left,
        width,
        isPoint: row?.kind === 'event',
    };
}

export function weekendBands(bounds) {
    if (!bounds) return [];
    const result = [];
    for (let dayIndex = 0; dayIndex < bounds.days; dayIndex += 1) {
        const target = addCalendarDays(bounds.min, dayIndex);
        if (!isWeekend(target)) continue;
        result.push({
            key: `${formatYmd(target)}-${dayIndex}`,
            left: (dayIndex / bounds.days) * 100,
            width: (1 / bounds.days) * 100,
        });
    }
    return result;
}
