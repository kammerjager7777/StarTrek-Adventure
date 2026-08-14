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

echo "==> Deploy Cloud Run (no public invokers)"
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
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,XAI_MODEL=${XAI_MODEL:-grok-4.5}" \
  --set-secrets="XAI_API_KEY=XAI_API_KEY:latest" \
  --no-allow-unauthenticated \
  --iap \
  --ingress=all

# Only your account can invoke the service
gcloud run services add-iam-policy-binding "$SERVICE" \
  --region="$REGION" \
  --member="user:${ALLOWED_USER}" \
  --role="roles/run.invoker" \
  --quiet

# Also allow yourself as project owner is already enough for admin, but invoker is required for browser proxy patterns
URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo ""
echo "Deployed: $URL"
echo "Access is restricted to: $ALLOWED_USER"
echo ""
echo "Browser access options:"
echo "  1) gcloud run services proxy $SERVICE --region=$REGION --port=8080"
echo "     then open http://127.0.0.1:8080"
echo "  2) Enable IAP + Load Balancer for Google login (see deploy/gcp/README.md)"
echo ""
