#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-web}"
case "$MODE" in
  web|gpu) ;;
  *)
    echo "Usage: bash scripts/start_localhost.sh [web|gpu]"
    exit 1
    ;;
esac

if ! command -v docker-compose >/dev/null 2>&1; then
  echo "[start] docker-compose command not found."
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-synchub}"
export COMPOSE_IGNORE_ORPHANS="${COMPOSE_IGNORE_ORPHANS:-true}"

compose_files=(-f docker-compose.yml)
services=(db elasticsearch ollama web frontend)
if [[ "$MODE" == "gpu" ]]; then
  compose_files=(-f docker-compose.yml -f docker-compose.gpu.yml)
  services=(db elasticsearch ollama paddle-vlm-server ocr-worker web frontend)
fi

cleanup_stale_containers() {
  local stale=()
  local name
  local state
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if [[ "$name" =~ ^synchub_(db|es|ollama|web|frontend|ocr|paddle_vlm|sglang)$ || "$name" =~ _synchub_(db|es|ollama|web|frontend|ocr|paddle_vlm|sglang)$ ]]; then
      state="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)"
      if [[ -n "$state" && "$state" != "running" ]]; then
        stale+=("$name")
      fi
    fi
  done < <(docker ps -a --format '{{.Names}}')

  if (( ${#stale[@]} > 0 )); then
    echo "[start] Removing stale containers: ${stale[*]}"
    docker rm "${stale[@]}" >/dev/null
  fi
}

cleanup_legacy_prefixed_containers() {
  local legacy=()
  local name
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    if [[ "$name" =~ _synchub_(db|es|ollama|web|frontend|ocr|paddle_vlm|sglang)$ ]]; then
      legacy+=("$name")
    fi
  done < <(docker ps -a --format '{{.Names}}')

  if (( ${#legacy[@]} > 0 )); then
    echo "[start] Removing legacy prefixed containers: ${legacy[*]}"
    docker rm -f "${legacy[@]}" >/dev/null
  fi
}

cleanup_name_conflicts_from_output() {
  local output="$1"
  local candidate
  for candidate in synchub_db synchub_es synchub_ollama synchub_web synchub_frontend synchub_ocr synchub_paddle_vlm synchub_sglang; do
    if grep -q "The container name \"/${candidate}\" is already in use" <<<"$output"; then
      echo "[start] Removing name-conflict container: ${candidate}"
      docker rm -f "${candidate}" >/dev/null 2>&1 || true
    fi
  done
}

run_compose_up() {
  docker-compose "${compose_files[@]}" up -d "${services[@]}"
}

wait_http() {
  local url="$1"
  local label="$2"
  local timeout_seconds="${3:-120}"
  local start_ts="$SECONDS"
  while (( SECONDS - start_ts < timeout_seconds )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[ok] ${label}: ${url}"
      return 0
    fi
    sleep 2
  done
  echo "[warn] ${label} did not respond in ${timeout_seconds}s: ${url}"
  return 1
}

echo "[start] mode=${MODE} compose_project=${COMPOSE_PROJECT_NAME}"

cleanup_stale_containers

attempt=1
max_attempts=6
while true; do
  if up_output="$(run_compose_up 2>&1)"; then
    echo "$up_output"
    break
  fi

  echo "$up_output"
  if grep -qE 'ContainerConfig|Conflict\. The container name "/synchub_|port is already allocated' <<<"$up_output" && (( attempt < max_attempts )); then
    echo "[start] Recoverable compose issue detected (attempt ${attempt}/${max_attempts})."
    cleanup_name_conflicts_from_output "$up_output"
    cleanup_legacy_prefixed_containers
    cleanup_stale_containers
    ((attempt++))
    continue
  fi

  echo "[start] Compose up failed after ${attempt} attempt(s)."
  exit 1
done

wait_http "http://localhost:8001/health" "API health" 120 || true
wait_http "http://localhost:8000" "Frontend (primary)" 120 || true
wait_http "http://localhost:9000" "Frontend (fallback)" 120 || true

echo "[start] Ready."
echo "  - Frontend: http://localhost:8000"
echo "  - Frontend fallback: http://localhost:9000"
echo "  - API: http://localhost:8001"
