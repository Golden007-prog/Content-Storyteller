# Deployment Proof

Evidence of a live Content Storyteller deployment on Google Cloud Platform.

## Deployed Services

| Service | Platform | URL | Notes |
|---------|----------|-----|-------|
| Web App | GitHub Pages | `https://golden007-prog.github.io/Content-Storyteller/` | Static SPA |
| API | Cloud Run | `https://api-service-828079020282.us-central1.run.app` | us-central1 |
| Worker | Cloud Run | `https://worker-service-828079020282.us-central1.run.app` | us-central1 |

## GCP Resources

| Resource | Type | Name / ID |
|----------|------|-----------|
| Uploads Bucket | Cloud Storage | `{PROJECT_ID}-uploads` |
| Assets Bucket | Cloud Storage | `{PROJECT_ID}-assets` |
| Temp Bucket | Cloud Storage | `{PROJECT_ID}-temp` |
| Firestore DB | Firestore Native | `(default)` |
| Job Topic | Pub/Sub | `content-generation-jobs` |
| Job Subscription | Pub/Sub | `content-generation-jobs-sub` |
| Dead Letter Topic | Pub/Sub | `content-generation-jobs-dead-letter` |
| Image Registry | Artifact Registry | `content-storyteller` |
| API SA | Service Account | `api-sa@{PROJECT_ID}.iam.gserviceaccount.com` |
| Worker SA | Service Account | `worker-sa@{PROJECT_ID}.iam.gserviceaccount.com` |

All resources are defined in `infra/terraform/*.tf` and managed via Terraform.

## Last Deployment

| Item | Value |
|------|-------|
| Deployment method | `scripts/deploy.sh` / Cloud Build (`cloudbuild.yaml`) |
| Last deployed | `2026-03-16 08:00 UTC` |
| Terraform apply | `2026-03-16 07:55 UTC` (infra pre-provisioned) |
| Docker images pushed | `api:latest`, `worker:latest`, `web:latest` |

## Gemini API Usage Evidence

### Model Router Configuration

The project uses a centralized **Model Router** (`packages/shared/src/ai/model-router.ts`) that maps each AI capability to the optimal Vertex AI model. The router is initialized at startup in both the API and Worker services via `initModelRouter()`, which performs availability checks and walks fallback chains.

**Source:** [`packages/shared/src/ai/model-config.ts`](../packages/shared/src/ai/model-config.ts)

Default model assignments:

| Capability Slot | Default Model |
|----------------|---------------|
| text | `gemini-3.1-flash` |
| textFallback | `gemini-3-flash-preview` |
| reasoning | `gemini-3.1-pro-preview` |
| image | `gemini-3.1-flash-image-preview` |
| imageHQ | `gemini-3-pro-image-preview` |
| videoFast | `veo-3.1-fast-generate-001` |
| videoFinal | `veo-3.1-generate-001` |
| live | `gemini-live-2.5-flash-native-audio` |

All models can be overridden via `VERTEX_*` environment variables. Overrides skip availability checks.

The SDK is initialized with ADC (Application Default Credentials) in production, falling back to `GEMINI_API_KEY` for local development:

```typescript
import { GoogleGenAI } from '@google/genai';

// Production: ADC via Vertex AI
genaiInstance = new GoogleGenAI({
  vertexai: true,
  project: GCP_PROJECT_ID,
  location: GCP_REGION,
});
```

### Pipeline Stages Using Model Router

| Stage | File | Model Slot | Gemini Usage |
|-------|------|-----------|-------------|
| ProcessInput | `apps/worker/src/pipeline/process-input.ts` | `text` | Creative Director — generates platform-aware Creative Brief |
| GenerateCopy | `apps/worker/src/pipeline/generate-copy.ts` | `text` | Generates structured CopyPackage (hook, caption, CTA, etc.) |
| GenerateImages | `apps/worker/src/pipeline/generate-images.ts` | `text` | Generates ImageConcept objects with visual direction |
| GenerateVideo | `apps/worker/src/pipeline/generate-video.ts` | `reasoning` | Generates Storyboard + VideoBrief with scene pacing |
| ImageGeneration | `apps/worker/src/capabilities/image-generation.ts` | `image` | Actual image generation via Vertex AI |
| VideoGeneration | `apps/worker/src/capabilities/video-generation.ts` | `videoFinal` | Video generation via Veo models |
| Live Agent | `apps/api/src/services/live-session.ts` | `live` / `text` | Real-time conversation / creative direction extraction |
| Trend Analyzer | `apps/api/src/services/trends/analyzer.ts` | `text` | Trend synthesis and signal collection |

### SDK Dependency

**Source:** [`apps/worker/package.json`](../apps/worker/package.json)

```json
"@google/genai": "^1.0.0"
```

### Sample Log Entry (Cloud Logging)

```json
{
  "severity": "INFO",
  "message": "Pipeline started",
  "correlationId": "abc-123-def",
  "jobId": "job_xyz",
  "stageCount": 5,
  "resource": {
    "type": "cloud_run_revision",
    "labels": {
      "service_name": "worker-service",
      "location": "us-central1"
    }
  }
}
```

> Paste actual log entries from `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=worker-service" --limit=5 --format=json` after deployment.

## Verification Commands

```bash
# List all Cloud Run services
gcloud run services list --region=us-central1

# Get service URLs
gcloud run services describe api-service --region=us-central1 --format='value(status.url)'
gcloud run services describe worker-service --region=us-central1 --format='value(status.url)'

# Health check (returns projectId, location, authMode, and resolved models)
curl $(gcloud run services describe api-service --region=us-central1 --format='value(status.url)')/api/v1/health

# Worker health check (also includes resolved models)
curl $(gcloud run services describe worker-service --region=us-central1 --format='value(status.url)')/health

# Verify model routing is active — the health response includes a "models" field
# showing each capability slot's resolved model, status, and fallback info:
#
# curl <API_URL>/api/v1/health
# {
#   "status": "ok",
#   "timestamp": "...",
#   "projectId": "your-project-id",
#   "location": "us-central1",
#   "authMode": "adc-service-account",
#   "models": {
#     "text": { "model": "gemini-3.1-flash", "status": "available", "fallbackUsed": null },
#     "textFallback": { "model": "gemini-3-flash-preview", "status": "available", "fallbackUsed": null },
#     "reasoning": { "model": "gemini-3.1-pro-preview", "status": "available", "fallbackUsed": null },
#     "image": { "model": "gemini-3.1-flash-image-preview", "status": "available", "fallbackUsed": null },
#     "imageHQ": { "model": "gemini-3-pro-image-preview", "status": "available", "fallbackUsed": null },
#     "videoFast": { "model": "veo-3.1-fast-generate-001", "status": "available", "fallbackUsed": null },
#     "videoFinal": { "model": "veo-3.1-generate-001", "status": "available", "fallbackUsed": null },
#     "live": { "model": "gemini-live-2.5-flash-native-audio", "status": "available", "fallbackUsed": null }
#   }
# }

# Debug GCP config (local dev only — returns 404 in production)
curl http://localhost:8080/api/v1/debug/gcp-config

# List GCS buckets
gsutil ls

# Verify Firestore
gcloud firestore databases list

# Verify Pub/Sub
gcloud pubsub topics list
gcloud pubsub subscriptions list

# Terraform outputs
cd infra/terraform && terraform output
```

## End-to-End Test

```bash
API_URL=$(gcloud run services describe api-service --region=us-central1 --format='value(status.url)')

# 1. Upload a test file
curl -X POST "$API_URL/api/v1/upload" -F "files=@test-image.png"

# 2. Create a generation job
curl -X POST "$API_URL/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadedMediaPaths": ["uploads/<correlationId>/test-image.png"],
    "idempotencyKey": "test-001",
    "promptText": "Create a product launch campaign",
    "platform": "instagram_reel",
    "tone": "cinematic"
  }'

# 3. Stream job progress
curl -N "$API_URL/api/v1/jobs/<jobId>/stream"

# 4. Retrieve assets
curl "$API_URL/api/v1/jobs/<jobId>/assets"
```

> Paste actual responses after running the end-to-end test.
