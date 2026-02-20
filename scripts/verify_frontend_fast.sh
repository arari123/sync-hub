#!/bin/bash
# verify_frontend_fast.sh - Focused frontend lint for high-risk auth/editor paths

set -euo pipefail

ESLINT_TARGETS="src/components/GlobalTopBar.jsx src/pages/BudgetProjectEditor.jsx src/lib/api.js src/lib/session.js"

if command -v docker >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' | grep -q '^synchub_frontend$'; then
        echo "[frontend-lint] Running in frontend container..."
        docker exec synchub_frontend sh -lc "cd /app && npx eslint ${ESLINT_TARGETS}"
        exit 0
    fi
fi

if command -v npx >/dev/null 2>&1 && [ -d frontend ]; then
    echo "[frontend-lint] Running in local frontend workspace..."
    (
        cd frontend
        npx eslint ${ESLINT_TARGETS}
    )
    exit 0
fi

echo "[frontend-lint] SKIPPED: npx/docker frontend runtime not available in this environment."
exit 0
