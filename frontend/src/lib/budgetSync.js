const BUDGET_DATA_UPDATED_EVENT = 'sync-hub:budget-data-updated';

function safeProjectId(projectId) {
    if (projectId === null || projectId === undefined) return '';
    const normalized = String(projectId).trim();
    return normalized;
}

export function emitBudgetDataUpdated(payload = {}) {
    if (typeof window === 'undefined') return;
    const detail = {
        projectId: safeProjectId(payload.projectId),
        versionId: payload.versionId ?? null,
        reason: String(payload.reason || 'updated'),
        updatedAt: Date.now(),
    };
    window.dispatchEvent(new CustomEvent(BUDGET_DATA_UPDATED_EVENT, { detail }));
}

export function subscribeBudgetDataUpdated(listener) {
    if (typeof window === 'undefined' || typeof listener !== 'function') {
        return () => {};
    }

    const handleEvent = (event) => {
        const detail = event?.detail || {};
        listener(detail);
    };

    window.addEventListener(BUDGET_DATA_UPDATED_EVENT, handleEvent);
    return () => {
        window.removeEventListener(BUDGET_DATA_UPDATED_EVENT, handleEvent);
    };
}
