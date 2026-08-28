# GCP production deploy

Private Cloud Run deployment for **Star Trek Adventure**.

## Live environment

| | |
|--|--|
| **Project ID** | `star-trek-adventure-3524d3` |
| **Region** | `us-central1` |
| **Service** | `sta-bridge` |
| **URL** | `https://sta-bridge-ledmkjy2mq-uc.a.run.app` |
| **Allowed users** | Any Google account (`ALLOWED_USERS=*`) |
| **Secrets** | `XAI_API_KEY` in Secret Manager |

The HTML access page is public. Game APIs require a Google account on the allow-list.

- Unauthenticated visitors → LCARS **Sign in** page  
- Any Google account → sign in and play (saves are private to that account)  
- Set `ALLOWED_USERS` to a comma-separated list to lock it back to specific Gmail addresses

## Access the app (browser)

Open:

**https://sta-bridge-ledmkjy2mq-uc.a.run.app**

Sign in with any **Google account**.

Alternate URL (same service):  
https://sta-bridge-1036417382463.us-central1.run.app

### Optional: local authenticated proxy

```bash
./deploy/gcp/proxy.sh
# → http://127.0.0.1:8080
```

## Redeploy

```bash
export PROJECT_ID=star-trek-adventure-3524d3
export REGION=us-central1
export ALLOWED_USER=mrarcam00@gmail.com
# optional: refresh secret from env
export XAI_API_KEY=...   # or leave unset to keep existing secret
./deploy/gcp/deploy.sh
```

Or:

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/star-trek-adventure-3524d3/sta/sta-bridge:latest .
gcloud run deploy sta-bridge \
  --image=us-central1-docker.pkg.dev/star-trek-adventure-3524d3/sta/sta-bridge:latest \
  --region=us-central1 \
  --set-secrets=XAI_API_KEY=XAI_API_KEY:latest,SESSION_SECRET=SESSION_SECRET:latest \
  --allow-unauthenticated
```

## Console links

- [Cloud Run service](https://console.cloud.google.com/run/detail/us-central1/sta-bridge?project=star-trek-adventure-3524d3)
- [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=star-trek-adventure-3524d3)
- [Cloud Build history](https://console.cloud.google.com/cloud-build/builds?project=star-trek-adventure-3524d3)

## Dev feedback inbox

The bridge **Feedback** button posts to `POST /api/feedback`. Production appends a row to a Google Sheet. Screenshots go to a private GCS bucket (`sta-feedback-3524d3`) and are served through `/api/feedback/shots/…` (service accounts have no Drive storage quota). Local `npm run dev` without Google env values saves under `data/feedback/` instead.

| | |
|--|--|
| Sheet ID | `FEEDBACK_SHEET_ID` |
| Screenshot bucket | `FEEDBACK_GCS_BUCKET` |
| Service account JSON | Secret Manager `GOOGLE_SA_JSON` |

Share the Sheet with `sta-feedback@star-trek-adventure-3524d3.iam.gserviceaccount.com` as **Editor**. The Drive folder is unused for screenshots.

The Sheet columns are: Time, From, Message, Screenshot, Theme, Phase, Run, Captain, Ship, URL, User-Agent.

## Access gate

Unauthenticated `GET /` serves the LCARS login page. APIs return `401 login_required` until Google Sign-In succeeds.

Production is open to any Google account (`ALLOWED_USERS=*`). To restrict it again, set `ALLOWED_USERS` to a comma-separated list in `deploy/gcp/project.env` and redeploy.

If Google itself shows “app is in testing / access blocked”, publish the OAuth consent screen (External → In production). Sign-in scopes are only email/profile/openid.

## Data note

Saves/media live on the **container filesystem** (ephemeral). New revisions may lose prior saves. Next hardening step: GCS-backed `data/saves` + `data/media`.

## Cost

- Cloud Run: scale-to-zero when idle  
- xAI API: billed to your xAI account (narrator, TTS, images)  
- Artifact Registry + Secret Manager: small storage fees  
