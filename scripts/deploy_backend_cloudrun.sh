#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value core/project 2>/dev/null || true)}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-sync-hub-backend}"
SERVICE_PORT="${SERVICE_PORT:-8000}"
CLOUD_RUN_MEMORY="${CLOUD_RUN_MEMORY:-1Gi}"
CLOUD_RUN_CPU="${CLOUD_RUN_CPU:-1}"
CLOUD_RUN_MIN_INSTANCES="${CLOUD_RUN_MIN_INSTANCES:-0}"
CLOUD_RUN_MAX_INSTANCES="${CLOUD_RUN_MAX_INSTANCES:-3}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "[ERROR] GCP project is not set. Set GCP_PROJECT_ID or run: gcloud config set project <project-id>"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[ERROR] gcloud CLI is required."
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "[ERROR] No active gcloud account. Run: gcloud auth login"
  exit 1
fi

if [[ ! -f "Dockerfile" ]]; then
  echo "[ERROR] Run this script at repository root where Dockerfile exists."
  exit 1
fi

FIREBASE_SITE="${FIREBASE_SITE:-${PROJECT_ID}}"
FRONTEND_BASE_URL="${AUTH_FRONTEND_BASE_URL:-https://${FIREBASE_SITE}.web.app}"
CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-https://${FIREBASE_SITE}.web.app,https://${FIREBASE_SITE}.firebaseapp.com}"
DATABASE_URL="${DATABASE_URL:-sqlite:////tmp/sync-hub.db}"
ES_HOST="${ES_HOST:-http://localhost:9200}"
OCR_WORKER_URL="${OCR_WORKER_URL:-http://localhost:8100/ocr}"
OCR_TIMEOUT_SECONDS="${OCR_TIMEOUT_SECONDS:-30}"
AUTH_ALLOWED_EMAIL_DOMAINS="${AUTH_ALLOWED_EMAIL_DOMAINS:-gmail.com}"
AUTH_EMAIL_DEBUG_LINK="${AUTH_EMAIL_DEBUG_LINK:-true}"

CORS_ALLOW_ORIGINS_ESCAPED="${CORS_ALLOW_ORIGINS//,/\\,}"
AUTH_ALLOWED_EMAIL_DOMAINS_ESCAPED="${AUTH_ALLOWED_EMAIL_DOMAINS//,/\\,}"

BILLING_ENABLED="$(gcloud beta billing projects describe "${PROJECT_ID}" --format='value(billingEnabled)' 2>/dev/null || echo false)"
if [[ "${BILLING_ENABLED}" != "True" && "${BILLING_ENABLED}" != "true" ]]; then
  BILLING_ACCOUNT_NAME="$(gcloud beta billing projects describe "${PROJECT_ID}" --format='value(billingAccountName)' 2>/dev/null || true)"
  BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_NAME##*/}"
  BILLING_OPEN="false"
  if [[ -n "${BILLING_ACCOUNT_ID}" ]]; then
    BILLING_OPEN="$(gcloud billing accounts describe "${BILLING_ACCOUNT_ID}" --format='value(open)' 2>/dev/null || echo false)"
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

echo "[STEP] Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project "${PROJECT_ID}"

echo "[STEP] Deploying backend to Cloud Run"
DEPLOY_ARGS=(
  run deploy "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --platform managed
  --source .
  --port "${SERVICE_PORT}"
  --memory "${CLOUD_RUN_MEMORY}"
  --cpu "${CLOUD_RUN_CPU}"
  --min-instances "${CLOUD_RUN_MIN_INSTANCES}"
  --max-instances "${CLOUD_RUN_MAX_INSTANCES}"
  --set-env-vars "DATABASE_URL=${DATABASE_URL}"
  --set-env-vars "ES_HOST=${ES_HOST}"
  --set-env-vars "OCR_WORKER_URL=${OCR_WORKER_URL}"
  --set-env-vars "OCR_TIMEOUT_SECONDS=${OCR_TIMEOUT_SECONDS}"
  --set-env-vars "CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS_ESCAPED}"
  --set-env-vars "AUTH_FRONTEND_BASE_URL=${FRONTEND_BASE_URL}"
  --set-env-vars "AUTH_ALLOWED_EMAIL_DOMAINS=${AUTH_ALLOWED_EMAIL_DOMAINS_ESCAPED}"
  --set-env-vars "AUTH_EMAIL_DEBUG_LINK=${AUTH_EMAIL_DEBUG_LINK}"
)

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"

echo "[STEP] Health check"
curl --silent --show-error --fail "${SERVICE_URL}/health"
echo
curl --silent --show-error --fail "${SERVICE_URL}/health/detail"
echo

echo "[DONE] Cloud Run backend deployed"
echo "[INFO] Service URL: ${SERVICE_URL}"
echo

echo "[NEXT] Firebase API rewrite serviceId should be: ${SERVICE_NAME}"
