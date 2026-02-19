#!/usr/bin/env bash

set -euo pipefail

GCLOUD_BIN="${GCLOUD_BIN:-}"
if [[ -z "${GCLOUD_BIN}" ]]; then
  if command -v gcloud >/dev/null 2>&1; then
    GCLOUD_BIN="gcloud"
  elif [[ -x "${HOME}/google-cloud-sdk/bin/gcloud" ]]; then
    GCLOUD_BIN="${HOME}/google-cloud-sdk/bin/gcloud"
  elif [[ -x "/home/arari123/google-cloud-sdk/bin/gcloud" ]]; then
    GCLOUD_BIN="/home/arari123/google-cloud-sdk/bin/gcloud"
  fi
fi

if [[ -z "${GCLOUD_BIN}" ]]; then
  echo "[ERROR] gcloud CLI is required."
  echo "[HINT] Install Google Cloud SDK or set GCLOUD_BIN=/path/to/gcloud"
  exit 1
fi

PROJECT_ID="${GCP_PROJECT_ID:-$("${GCLOUD_BIN}" config get-value core/project 2>/dev/null || true)}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-sync-hub-backend}"
SERVICE_PORT="${SERVICE_PORT:-8000}"
CLOUD_RUN_MEMORY="${CLOUD_RUN_MEMORY:-1Gi}"
CLOUD_RUN_CPU="${CLOUD_RUN_CPU:-1}"
CLOUD_RUN_MIN_INSTANCES="${CLOUD_RUN_MIN_INSTANCES:-0}"
CLOUD_RUN_MAX_INSTANCES="${CLOUD_RUN_MAX_INSTANCES:-3}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
DEPLOY_MODE="${DEPLOY_MODE:-image}" # image|source
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-cloud-run-source-deploy}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
IMAGE_OVERRIDE="${IMAGE_OVERRIDE:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "[ERROR] GCP project is not set. Set GCP_PROJECT_ID or run: gcloud config set project <project-id>"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] python3 is required."
  exit 1
fi

ACTIVE_ACCOUNT="$("${GCLOUD_BIN}" auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "[ERROR] No active gcloud account. Run: gcloud auth login"
  exit 1
fi

if [[ ! -f "Dockerfile" ]]; then
  echo "[ERROR] Run this script at repository root where Dockerfile exists."
  exit 1
fi

CURRENT_SERVICE_JSON=""
if CURRENT_SERVICE_JSON="$("${GCLOUD_BIN}" run services describe "${SERVICE_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format=json 2>/dev/null)"; then
  :
else
  CURRENT_SERVICE_JSON=""
fi

get_current_env_var() {
  local var_name="$1"
  if [[ -z "${CURRENT_SERVICE_JSON}" ]]; then
    return 0
  fi
  printf '%s' "${CURRENT_SERVICE_JSON}" | python3 - "${var_name}" <<'PY'
import json
import sys

target = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:  # noqa: BLE001
    raise SystemExit(0)

containers = (((payload.get("spec") or {}).get("template") or {}).get("spec") or {}).get("containers") or []
if not containers:
    raise SystemExit(0)

for env in containers[0].get("env") or []:
    if env.get("name") == target and env.get("value") is not None:
        print(str(env.get("value")))
        break
PY
}

get_current_env_secret() {
  local var_name="$1"
  if [[ -z "${CURRENT_SERVICE_JSON}" ]]; then
    return 0
  fi
  printf '%s' "${CURRENT_SERVICE_JSON}" | python3 - "${var_name}" <<'PY'
import json
import sys

target = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:  # noqa: BLE001
    raise SystemExit(0)

containers = (((payload.get("spec") or {}).get("template") or {}).get("spec") or {}).get("containers") or []
if not containers:
    raise SystemExit(0)

for env in containers[0].get("env") or []:
    if env.get("name") != target:
        continue
    value_from = env.get("valueFrom") or {}
    secret_ref = value_from.get("secretKeyRef") or {}
    secret_name = secret_ref.get("name")
    if secret_name:
        print(str(secret_name))
        break
PY
}

get_current_annotation() {
  local annotation_key="$1"
  if [[ -z "${CURRENT_SERVICE_JSON}" ]]; then
    return 0
  fi
  printf '%s' "${CURRENT_SERVICE_JSON}" | python3 - "${annotation_key}" <<'PY'
import json
import sys

target = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:  # noqa: BLE001
    raise SystemExit(0)

annotations = (((payload.get("spec") or {}).get("template") or {}).get("metadata") or {}).get("annotations") or {}
value = annotations.get(target)
if value:
    print(str(value))
PY
}

FIREBASE_SITE="${FIREBASE_SITE:-${PROJECT_ID}}"
FRONTEND_BASE_URL="${AUTH_FRONTEND_BASE_URL:-https://${FIREBASE_SITE}.web.app}"
CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-https://${FIREBASE_SITE}.web.app,https://${FIREBASE_SITE}.firebaseapp.com}"
CURRENT_DATABASE_URL="$(get_current_env_var DATABASE_URL)"
CURRENT_DATABASE_URL_SECRET="$(get_current_env_secret DATABASE_URL)"
CURRENT_AUTH_ALLOWED_EMAIL_DOMAINS="$(get_current_env_var AUTH_ALLOWED_EMAIL_DOMAINS)"
CURRENT_CLOUD_SQL_INSTANCE_CONNECTION="$(get_current_annotation run.googleapis.com/cloudsql-instances)"
CURRENT_DATA_HUB_AI_ENABLED="$(get_current_env_var DATA_HUB_AI_ENABLED)"
CURRENT_GEMINI_API_KEY_SECRET="$(get_current_env_secret GEMINI_API_KEY)"
CURRENT_GEMINI_MODEL="$(get_current_env_var GEMINI_MODEL)"
CURRENT_GEMINI_BASE_URL="$(get_current_env_var GEMINI_BASE_URL)"
CURRENT_GEMINI_TIMEOUT_SECONDS="$(get_current_env_var GEMINI_TIMEOUT_SECONDS)"
CURRENT_GEMINI_MAX_OUTPUT_TOKENS="$(get_current_env_var GEMINI_MAX_OUTPUT_TOKENS)"

DATABASE_URL_INPUT="${DATABASE_URL:-}"
DATABASE_URL_SECRET_NAME_INPUT="${DATABASE_URL_SECRET_NAME:-}"
AUTH_ALLOWED_EMAIL_DOMAINS_INPUT="${AUTH_ALLOWED_EMAIL_DOMAINS:-}"
CLOUD_SQL_INSTANCE_CONNECTION_INPUT="${CLOUD_SQL_INSTANCE_CONNECTION:-}"
ALLOW_EPHEMERAL_DATABASE="${ALLOW_EPHEMERAL_DATABASE:-false}"
DATA_HUB_AI_ENABLED_INPUT="${DATA_HUB_AI_ENABLED:-}"
GEMINI_API_KEY_INPUT="${GEMINI_API_KEY:-}"
GEMINI_API_KEY_SECRET_NAME_INPUT="${GEMINI_API_KEY_SECRET_NAME:-}"
GEMINI_MODEL_INPUT="${GEMINI_MODEL:-}"
GEMINI_BASE_URL_INPUT="${GEMINI_BASE_URL:-}"
GEMINI_TIMEOUT_SECONDS_INPUT="${GEMINI_TIMEOUT_SECONDS:-}"
GEMINI_MAX_OUTPUT_TOKENS_INPUT="${GEMINI_MAX_OUTPUT_TOKENS:-}"

DATABASE_URL="${DATABASE_URL_INPUT:-${CURRENT_DATABASE_URL:-}}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME_INPUT:-${CURRENT_DATABASE_URL_SECRET:-}}"
ES_HOST="${ES_HOST:-http://localhost:9200}"
OCR_WORKER_URL="${OCR_WORKER_URL:-http://localhost:8100/ocr}"
OCR_TIMEOUT_SECONDS="${OCR_TIMEOUT_SECONDS:-30}"
AUTH_ALLOWED_EMAIL_DOMAINS="${AUTH_ALLOWED_EMAIL_DOMAINS_INPUT:-${CURRENT_AUTH_ALLOWED_EMAIL_DOMAINS:-gmail.com}}"
AUTH_EMAIL_DEBUG_LINK="${AUTH_EMAIL_DEBUG_LINK:-true}"
CLOUD_SQL_INSTANCE_CONNECTION="${CLOUD_SQL_INSTANCE_CONNECTION_INPUT:-${CURRENT_CLOUD_SQL_INSTANCE_CONNECTION:-}}"
DATA_HUB_AI_ENABLED="${DATA_HUB_AI_ENABLED_INPUT:-${CURRENT_DATA_HUB_AI_ENABLED:-true}}"
GEMINI_API_KEY_SECRET_NAME="${GEMINI_API_KEY_SECRET_NAME_INPUT:-${CURRENT_GEMINI_API_KEY_SECRET:-}}"
GEMINI_MODEL="${GEMINI_MODEL_INPUT:-${CURRENT_GEMINI_MODEL:-gemini-2.5-flash-lite}}"
GEMINI_BASE_URL="${GEMINI_BASE_URL_INPUT:-${CURRENT_GEMINI_BASE_URL:-}}"
GEMINI_TIMEOUT_SECONDS="${GEMINI_TIMEOUT_SECONDS_INPUT:-${CURRENT_GEMINI_TIMEOUT_SECONDS:-20}}"
GEMINI_MAX_OUTPUT_TOKENS="${GEMINI_MAX_OUTPUT_TOKENS_INPUT:-${CURRENT_GEMINI_MAX_OUTPUT_TOKENS:-600}}"

if [[ -z "${GEMINI_API_KEY_SECRET_NAME}" ]]; then
  GEMINI_API_KEY="${GEMINI_API_KEY_INPUT:-}"
else
  GEMINI_API_KEY=""
fi

if [[ -z "${DATABASE_URL_SECRET_NAME}" && -z "${DATABASE_URL}" ]]; then
  echo "[ERROR] DATABASE_URL source is required."
  echo "[ACTION] Set DATABASE_URL_SECRET_NAME (recommended) or DATABASE_URL."
  echo "[EXAMPLE] DATABASE_URL_SECRET_NAME=sync-hub-database-url bash scripts/deploy_backend_cloudrun.sh"
  echo "[EXAMPLE] DATABASE_URL='postgresql+psycopg2://<user>:<pass>@/<db>?host=/cloudsql/<project>:<region>:<instance>' bash scripts/deploy_backend_cloudrun.sh"
  exit 3
fi

if [[ -z "${DATABASE_URL_SECRET_NAME}" && "${DATABASE_URL}" == sqlite:////tmp/* && "${ALLOW_EPHEMERAL_DATABASE}" != "true" ]]; then
  echo "[ERROR] Refusing ephemeral DATABASE_URL (${DATABASE_URL})."
  echo "[ACTION] Use DATABASE_URL_SECRET_NAME (recommended) or a persistent DATABASE_URL."
  echo "[ACTION] To force ephemeral mode explicitly, set ALLOW_EPHEMERAL_DATABASE=true."
  exit 4
fi

if [[ -n "${DATABASE_URL_SECRET_NAME}" ]]; then
  if ! "${GCLOUD_BIN}" secrets describe "${DATABASE_URL_SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    echo "[ERROR] Secret not found: ${DATABASE_URL_SECRET_NAME}"
    echo "[ACTION] Create the secret and add a DATABASE_URL value as latest version."
    exit 5
  fi
fi

if [[ -n "${GEMINI_API_KEY_SECRET_NAME}" ]]; then
  if ! "${GCLOUD_BIN}" secrets describe "${GEMINI_API_KEY_SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    echo "[ERROR] Secret not found: ${GEMINI_API_KEY_SECRET_NAME}"
    echo "[ACTION] Create the secret and add a GEMINI_API_KEY value as latest version."
    exit 6
  fi
fi

ENV_VARS_ARG="^##^ES_HOST=${ES_HOST}##OCR_WORKER_URL=${OCR_WORKER_URL}##OCR_TIMEOUT_SECONDS=${OCR_TIMEOUT_SECONDS}##CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS}##AUTH_FRONTEND_BASE_URL=${FRONTEND_BASE_URL}##AUTH_ALLOWED_EMAIL_DOMAINS=${AUTH_ALLOWED_EMAIL_DOMAINS}##AUTH_EMAIL_DEBUG_LINK=${AUTH_EMAIL_DEBUG_LINK}##DATA_HUB_AI_ENABLED=${DATA_HUB_AI_ENABLED}##GEMINI_MODEL=${GEMINI_MODEL}##GEMINI_BASE_URL=${GEMINI_BASE_URL}##GEMINI_TIMEOUT_SECONDS=${GEMINI_TIMEOUT_SECONDS}##GEMINI_MAX_OUTPUT_TOKENS=${GEMINI_MAX_OUTPUT_TOKENS}"
if [[ -z "${DATABASE_URL_SECRET_NAME}" ]]; then
  ENV_VARS_ARG="${ENV_VARS_ARG}##DATABASE_URL=${DATABASE_URL}"
fi
if [[ -z "${GEMINI_API_KEY_SECRET_NAME}" && -n "${GEMINI_API_KEY}" ]]; then
  ENV_VARS_ARG="${ENV_VARS_ARG}##GEMINI_API_KEY=${GEMINI_API_KEY}"
fi

BILLING_ENABLED="$("${GCLOUD_BIN}" beta billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)' 2>/dev/null || echo false)"
if [[ "${BILLING_ENABLED}" != "True" && "${BILLING_ENABLED}" != "true" ]]; then
  BILLING_ACCOUNT_NAME="$("${GCLOUD_BIN}" beta billing projects describe "${PROJECT_ID}" --format='value(billingAccountName)' 2>/dev/null || true)"
  BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_NAME##*/}"
  BILLING_OPEN="false"
  if [[ -n "${BILLING_ACCOUNT_ID}" ]]; then
    BILLING_OPEN="$("${GCLOUD_BIN}" billing accounts describe "${BILLING_ACCOUNT_ID}" --format='value(open)' 2>/dev/null || echo false)"
  fi

  echo "[ERROR] Billing is not enabled for project: ${PROJECT_ID}"
  if [[ -n "${BILLING_ACCOUNT_ID}" ]]; then
    echo "[INFO] Linked billing account: ${BILLING_ACCOUNT_ID} (open=${BILLING_OPEN})"
  fi
  echo "[ACTION] Enable/reopen billing first, then rerun this script."
  exit 2
fi

echo "[INFO] Project: ${PROJECT_ID}"
echo "[INFO] Region: ${REGION}"
echo "[INFO] Service: ${SERVICE_NAME}"
echo "[INFO] Active account: ${ACTIVE_ACCOUNT}"
echo "[INFO] Deploy mode: ${DEPLOY_MODE}"
if [[ -z "${DATABASE_URL_INPUT}" && -n "${CURRENT_DATABASE_URL}" && -z "${DATABASE_URL_SECRET_NAME}" ]]; then
  echo "[INFO] DATABASE_URL not provided; reusing current Cloud Run value."
fi
if [[ -z "${DATABASE_URL_SECRET_NAME_INPUT}" && -n "${CURRENT_DATABASE_URL_SECRET}" ]]; then
  echo "[INFO] DATABASE_URL_SECRET_NAME not provided; reusing current Cloud Run secret reference."
fi
if [[ -n "${DATABASE_URL_SECRET_NAME}" ]]; then
  echo "[INFO] DATABASE_URL source: Secret Manager (${DATABASE_URL_SECRET_NAME})"
fi
if [[ -n "${GEMINI_API_KEY_SECRET_NAME}" ]]; then
  echo "[INFO] GEMINI_API_KEY source: Secret Manager (${GEMINI_API_KEY_SECRET_NAME})"
elif [[ -n "${GEMINI_API_KEY}" ]]; then
  echo "[INFO] GEMINI_API_KEY source: env var input"
else
  echo "[INFO] GEMINI_API_KEY source: not set (AI disabled)"
fi
echo "[INFO] DATA_HUB_AI_ENABLED: ${DATA_HUB_AI_ENABLED}"
echo "[INFO] GEMINI_MODEL: ${GEMINI_MODEL}"
if [[ -z "${AUTH_ALLOWED_EMAIL_DOMAINS_INPUT}" && -n "${CURRENT_AUTH_ALLOWED_EMAIL_DOMAINS}" ]]; then
  echo "[INFO] AUTH_ALLOWED_EMAIL_DOMAINS not provided; reusing current Cloud Run value."
fi
if [[ -n "${CLOUD_SQL_INSTANCE_CONNECTION}" ]]; then
  echo "[INFO] Cloud SQL binding: ${CLOUD_SQL_INSTANCE_CONNECTION}"
fi

echo "[STEP] Enabling required APIs"
"${GCLOUD_BIN}" services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "${PROJECT_ID}"

DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --platform managed
  --port "${SERVICE_PORT}"
  --memory "${CLOUD_RUN_MEMORY}"
  --cpu "${CLOUD_RUN_CPU}"
  --min-instances "${CLOUD_RUN_MIN_INSTANCES}"
  --max-instances "${CLOUD_RUN_MAX_INSTANCES}"
  "--set-env-vars=${ENV_VARS_ARG}"
)
SECRETS_ARG_ITEMS=()
if [[ -n "${DATABASE_URL_SECRET_NAME}" ]]; then
  SECRETS_ARG_ITEMS+=("DATABASE_URL=${DATABASE_URL_SECRET_NAME}:latest")
fi
if [[ -n "${GEMINI_API_KEY_SECRET_NAME}" ]]; then
  SECRETS_ARG_ITEMS+=("GEMINI_API_KEY=${GEMINI_API_KEY_SECRET_NAME}:latest")
fi
if (( ${#SECRETS_ARG_ITEMS[@]} > 0 )); then
  SECRETS_ARG="$(IFS=, ; echo "${SECRETS_ARG_ITEMS[*]}")"
  DEPLOY_ARGS+=("--set-secrets=${SECRETS_ARG}")
fi

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

if [[ -n "${CLOUD_SQL_INSTANCE_CONNECTION}" ]]; then
  DEPLOY_ARGS+=(--add-cloudsql-instances "${CLOUD_SQL_INSTANCE_CONNECTION}")
fi

DEPLOYED_IMAGE=""
if [[ "${DEPLOY_MODE}" == "source" ]]; then
  echo "[STEP] Deploying backend from source"
  DEPLOY_ARGS+=(--source .)
elif [[ "${DEPLOY_MODE}" == "image" ]]; then
  if [[ -n "${IMAGE_OVERRIDE}" ]]; then
    DEPLOYED_IMAGE="${IMAGE_OVERRIDE}"
    echo "[STEP] Deploying backend with provided image"
    echo "[INFO] Image: ${DEPLOYED_IMAGE}"
  else
    if ! command -v docker >/dev/null 2>&1; then
      echo "[ERROR] docker CLI is required for DEPLOY_MODE=image."
      exit 1
    fi

    if ! "${GCLOUD_BIN}" artifacts repositories describe "${IMAGE_REPOSITORY}" --location "${REGION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
      echo "[STEP] Creating Artifact Registry repository: ${IMAGE_REPOSITORY}"
      "${GCLOUD_BIN}" artifacts repositories create "${IMAGE_REPOSITORY}" \
        --repository-format=docker \
        --location "${REGION}" \
        --project "${PROJECT_ID}" \
        --description "Cloud Run container images"
    fi

    "${GCLOUD_BIN}" auth configure-docker "${REGION}-docker.pkg.dev" --quiet

    DEPLOYED_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_REPOSITORY}/${SERVICE_NAME}:${IMAGE_TAG}"
    echo "[STEP] Building backend image"
    echo "[INFO] Image: ${DEPLOYED_IMAGE}"
    docker build -t "${DEPLOYED_IMAGE}" .

    echo "[STEP] Pushing backend image"
    docker push "${DEPLOYED_IMAGE}"
  fi

  DEPLOY_ARGS+=(--image "${DEPLOYED_IMAGE}")
else
  echo "[ERROR] Unsupported DEPLOY_MODE: ${DEPLOY_MODE} (allowed: image, source)"
  exit 1
fi

"${GCLOUD_BIN}" "${DEPLOY_ARGS[@]}"

SERVICE_URL="$("${GCLOUD_BIN}" run services describe "${SERVICE_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"

echo "[STEP] Health check"
curl --silent --show-error --fail "${SERVICE_URL}/health"
echo
curl --silent --show-error --fail "${SERVICE_URL}/health/detail"
echo

echo "[DONE] Cloud Run backend deployed"
echo "[INFO] Service URL: ${SERVICE_URL}"
if [[ -n "${DEPLOYED_IMAGE}" ]]; then
  echo "[INFO] Image: ${DEPLOYED_IMAGE}"
fi

echo
echo "[NEXT] Firebase API rewrite serviceId should be: ${SERVICE_NAME}"
