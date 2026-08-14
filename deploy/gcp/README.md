# GCP production deploy

Private Cloud Run deployment for **Star Trek Adventure**.

## Live environment

| | |
|--|--|
| **Project ID** | `star-trek-adventure-3524d3` |
| **Region** | `us-central1` |
| **Service** | `sta-bridge` |
| **URL** | `https://sta-bridge-ledmkjy2mq-uc.a.run.app` |
| **Allowed users** | `mrarcam00@gmail.com`, `michaelstephens2011@gmail.com`, `npgibbs@gmail.com` |
| **Secrets** | `XAI_API_KEY` in Secret Manager |

The service is **not public**. **Identity-Aware Proxy (IAP)** is enabled.

- Unauthenticated visitors → **302** to Google sign-in  
- Allowed Google accounts (IAP + Run invoker):
  - `mrarcam00@gmail.com`
  - `michaelstephens2011@gmail.com`
  - `npgibbs@gmail.com`
- IAP service agent is granted `roles/run.invoker` so the proxy can reach Cloud Run  

## Access the app (browser)

Open:

**https://sta-bridge-ledmkjy2mq-uc.a.run.app**

Sign in with an **allowed Gmail** above. Other Google accounts should be denied by IAP.

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
  --set-secrets=XAI_API_KEY=XAI_API_KEY:latest \
  --no-allow-unauthenticated
```

## Console links

- [Cloud Run service](https://console.cloud.google.com/run/detail/us-central1/sta-bridge?project=star-trek-adventure-3524d3)
- [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=star-trek-adventure-3524d3)
- [Cloud Build history](https://console.cloud.google.com/cloud-build/builds?project=star-trek-adventure-3524d3)

## IAP status

IAP is **on** (`run.googleapis.com/iap-enabled: true`). Verified:

| Check | Result |
|-------|--------|
| Unauthenticated `GET /` | HTTP **302** → `accounts.google.com` |
| IAP principals | `mrarcam00@gmail.com`, `michaelstephens2011@gmail.com`, `npgibbs@gmail.com` |
| Cloud Run invokers | those Gmails + IAP service agent |

To add another trusted user later:

```bash
gcloud iap web add-iam-policy-binding \
  --resource-type=cloud-run --service=sta-bridge --region=us-central1 \
  --member="user:OTHER@gmail.com" \
  --role="roles/iap.httpsResourceAccessor"
gcloud run services add-iam-policy-binding sta-bridge --region=us-central1 \
  --member="user:OTHER@gmail.com" --role="roles/run.invoker"
```

## Data note

Saves/media live on the **container filesystem** (ephemeral). New revisions may lose prior saves. Next hardening step: GCS-backed `data/saves` + `data/media`.

## Cost

- Cloud Run: scale-to-zero when idle  
- xAI API: billed to your xAI account (narrator, TTS, images)  
- Artifact Registry + Secret Manager: small storage fees  
