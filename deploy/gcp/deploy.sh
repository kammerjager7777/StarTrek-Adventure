#!/usr/bin/env bash
# Deploy Star Trek Adventure to Cloud Run (private — your Gmail only via IAP/IAM).
# Usage:
#   export PROJECT_ID=...
#   export REGION=us-central1
#   export ALLOWED_USER=you@gmail.com
#   ./deploy/gcp/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-sta-bridge}"
REPO="${REPO:-sta}"
ALLOWED_USER="${ALLOWED_USER:?Set ALLOWED_USER to your Gmail}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

echo "==> Project=$PROJECT_ID Region=$REGION Service=$SERVICE"
gcloud config set project "$PROJECT_ID"

echo "==> Ensure Artifact Registry repo"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$REPO" \
       --repository-format=docker \
       --location="$REGION" \
       --description="Star Trek Adventure images"

echo "==> Configure Docker auth"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "==> Build image (Cloud Build)"
gcloud builds submit --tag "$IMAGE" .

echo "==> Ensure XAI secret"
if ! gcloud secrets describe XAI_API_KEY >/dev/null 2>&1; then
  if [[ -z "${XAI_API_KEY:-}" ]]; then
    echo "Create secret: export XAI_API_KEY=... or gcloud secrets create XAI_API_KEY --data-file=-"
    exit 1
  fi
  printf '%s' "$XAI_API_KEY" | gcloud secrets create XAI_API_KEY --data-file=-
else
  if [[ -n "${XAI_API_KEY:-}" ]]; then
    printf '%s' "$XAI_API_KEY" | gcloud secrets versions add XAI_API_KEY --data-file=-
  fi
fi

# Allow Cloud Run runtime SA to read secret
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud secrets add-iam-policy-binding XAI_API_KEY \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

if ! gcloud secrets describe SESSION_SECRET >/dev/null 2>&1; then
  echo "==> Create SESSION_SECRET"
  openssl rand -hex 32 | gcloud secrets create SESSION_SECRET --data-file=-
fi
gcloud secrets add-iam-policy-binding SESSION_SECRET \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

ALLOWED_USERS="${ALLOWED_USERS:-$ALLOWED_USER}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
ACCESS_CONTACT_EMAIL="${ACCESS_CONTACT_EMAIL:-michaelstephens2011@gmail.com}"
FEEDBACK_SHEET_ID="${FEEDBACK_SHEET_ID:-}"
FEEDBACK_DRIVE_FOLDER_ID="${FEEDBACK_DRIVE_FOLDER_ID:-}"
FEEDBACK_SHEET_TAB="${FEEDBACK_SHEET_TAB:-Sheet1}"

if gcloud secrets describe GOOGLE_SA_JSON >/dev/null 2>&1; then
  echo "==> Bind GOOGLE_SA_JSON secret"
  gcloud secrets add-iam-policy-binding GOOGLE_SA_JSON \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  SECRETS="XAI_API_KEY=XAI_API_KEY:latest,SESSION_SECRET=SESSION_SECRET:latest,GOOGLE_SA_JSON=GOOGLE_SA_JSON:latest"
else
  SECRETS="XAI_API_KEY=XAI_API_KEY:latest,SESSION_SECRET=SESSION_SECRET:latest"
fi

echo "==> Deploy Cloud Run (public HTML + app-level Google allow-list)"
# ^|^ delimiter so ALLOWED_USERS may contain commas
DEPLOY_ENV="^|^NODE_ENV=production|HOST=0.0.0.0|XAI_MODEL=${XAI_MODEL:-grok-4.5}|ALLOWED_USERS=${ALLOWED_USERS}|ACCESS_CONTACT_EMAIL=${ACCESS_CONTACT_EMAIL}"
if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  DEPLOY_ENV="${DEPLOY_ENV}|GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
fi
if [[ -n "$FEEDBACK_SHEET_ID" ]]; then
  DEPLOY_ENV="${DEPLOY_ENV}|FEEDBACK_SHEET_ID=${FEEDBACK_SHEET_ID}"
fi
if [[ -n "$FEEDBACK_DRIVE_FOLDER_ID" ]]; then
  DEPLOY_ENV="${DEPLOY_ENV}|FEEDBACK_DRIVE_FOLDER_ID=${FEEDBACK_DRIVE_FOLDER_ID}"
fi
if [[ -n "$FEEDBACK_SHEET_TAB" ]]; then
  DEPLOY_ENV="${DEPLOY_ENV}|FEEDBACK_SHEET_TAB=${FEEDBACK_SHEET_TAB}"
fi

gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --concurrency=20 \
  --min-instances=0 \
  --max-instances=3 \
  --cpu-boost \
  --set-env-vars="$DEPLOY_ENV" \
  --set-secrets="$SECRETS" \
  --allow-unauthenticated \
  --no-iap \
  --ingress=all

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: $URL"
echo "Sign-in is the LCARS access page. Allowed: $ALLOWED_USERS"
echo ""
