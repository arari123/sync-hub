const AGENDA_THREAD_SEEN_STORAGE_KEY = 'synchub:agenda-thread-seen-baselines:v1';

export function loadAgendaThreadSeenBaselines() {
    try {
        const raw = window.localStorage.getItem(AGENDA_THREAD_SEEN_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch (error) {
        return {};
    }
}

export function saveAgendaThreadSeenBaselines(value) {
    try {
        window.localStorage.setItem(AGENDA_THREAD_SEEN_STORAGE_KEY, JSON.stringify(value || {}));
    } catch (error) {
        // ignore
    }
}

export function getAgendaThreadLastSeenUpdatedAt(threadId) {
    const id = Number(threadId || 0);
    if (!Number.isFinite(id) || id <= 0) return '';

    const baselines = loadAgendaThreadSeenBaselines();
    const entry = baselines[String(Math.floor(id))];
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && typeof entry.last_seen_updated_at === 'string') {
        return entry.last_seen_updated_at;
    }
    return '';
}

export function markAgendaThreadSeen(threadId, lastUpdatedAt) {
    const id = Number(threadId || 0);
    if (!Number.isFinite(id) || id <= 0) return;

    const updatedAt = String(lastUpdatedAt || '').trim();
    if (!updatedAt) return;

    const key = String(Math.floor(id));
    const current = loadAgendaThreadSeenBaselines();
    const prevValue = current[key];
    const prevUpdatedAt = typeof prevValue === 'string'
        ? prevValue
        : prevValue && typeof prevValue === 'object' && typeof prevValue.last_seen_updated_at === 'string'
            ? prevValue.last_seen_updated_at
            : '';

    if (prevUpdatedAt && prevUpdatedAt >= updatedAt) {
        return;
    }

    const next = { ...(current || {}), [key]: updatedAt };
    saveAgendaThreadSeenBaselines(next);
}

export function isAgendaThreadUnread(threadId, lastUpdatedAt) {
    const updatedAt = String(lastUpdatedAt || '').trim();
    if (!updatedAt) return false;
    const lastSeen = getAgendaThreadLastSeenUpdatedAt(threadId);
    if (!lastSeen) return true;
    return updatedAt > lastSeen;
}

