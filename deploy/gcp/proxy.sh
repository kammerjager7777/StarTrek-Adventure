#!/usr/bin/env bash
# Authenticated local proxy to the private Cloud Run service.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/gcp/project.env"
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:${PATH}"

PORT="${PORT:-8080}"
gcloud config set project "$PROJECT_ID" >/dev/null
echo "Proxying $SERVICE ($REGION) → http://127.0.0.1:${PORT}"
echo "Logged in as: $(gcloud config get-value account 2>/dev/null)"
echo "Open http://127.0.0.1:${PORT}  (Ctrl+C to stop)"
exec gcloud run services proxy "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --port="$PORT"
