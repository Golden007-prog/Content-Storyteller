# Environment Variables

## Authentication (Local Development)

Before running services locally, authenticate with Google Cloud using Application Default Credentials (ADC):

```bash
# Login to Google Cloud
gcloud auth login

# Set up Application Default Credentials for local development
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

ADC allows the Google Cloud client libraries to automatically authenticate without service account key files.

## GCP Configuration Module

Both the API and Worker services use a shared GCP config module (`apps/*/src/config/gcp.ts`) as the single source of truth for all Google Cloud settings. No service file reads GCP env vars directly — everything goes through `getGcpConfig()`.

### Project ID Resolution Order

The config module resolves the project ID in this order:

1. `GCP_PROJECT_ID` — canonical, always set this
2. `GOOGLE_CLOUD_PROJECT` — automatic on Cloud Run
3. `GCLOUD_PROJECT` — legacy fallback

If none are set, the service fails fast at startup with a clear error.

### Auth Strategy

| Environment | Auth Mode | How It Works |
|---|---|---|
| Cloud Run (production) | `adc-service-account` | Automatic via service account metadata |
| Local dev (default) | `adc-user` | `gcloud auth application-default login` |
| Local dev (optional) | `api-key-fallback` | Set `GEMINI_API_KEY` for AI Studio |

Vertex AI is the primary path. `GEMINI_API_KEY` is an optional convenience for local development only.

### Diagnostic Endpoints

| Endpoint | Service | Purpose |
|---|---|---|
| `GET /api/v1/health` | API | Returns `projectId`, `location`, `authMode` |
| `GET /api/v1/debug/gcp-config` | API | Full config (blocked in production) |
| `GET /health` | Worker | Returns `projectId`, `location`, `authMode` |

## Variables by Service

### API Service (`apps/api/.env`)

| Variable | Description | How to Obtain |
|---|---|---|
| `GCP_PROJECT_ID` | Google Cloud project ID (required) | `gcloud config get-value project` or GCP Console |
| `GCP_REGION` | GCP region for resources | Default: `us-central1` |
| `UPLOADS_BUCKET` | Cloud Storage bucket for raw uploads | `terraform output uploads_bucket_name` |
| `ASSETS_BUCKET` | Cloud Storage bucket for generated assets | `terraform output assets_bucket_name` |
| `FIRESTORE_DATABASE` | Firestore database name | `terraform output firestore_database_name` (default: `(default)`) |
| `PUBSUB_TOPIC` | Pub/Sub topic for job dispatch | `terraform output pubsub_topic_name` |
| `CORS_ORIGIN` | Allowed CORS origin | `*` for dev, GitHub Pages URL for prod |
| `GEMINI_API_KEY` | Optional Gemini API key (local dev only) | [AI Studio](https://aistudio.google.com/apikey) |
| `PORT` | HTTP server port | Static: `8080` |

### Worker Service (`apps/worker/.env`)

| Variable | Description | How to Obtain |
|---|---|---|
| `GCP_PROJECT_ID` | Google Cloud project ID (required) | `gcloud config get-value project` or GCP Console |
| `GCP_REGION` | GCP region for resources | Default: `us-central1` |
| `UPLOADS_BUCKET` | Cloud Storage bucket for raw uploads | `terraform output uploads_bucket_name` |
| `ASSETS_BUCKET` | Cloud Storage bucket for generated assets | `terraform output assets_bucket_name` |
| `TEMP_BUCKET` | Cloud Storage bucket for temp processing | `terraform output temp_bucket_name` |
| `FIRESTORE_DATABASE` | Firestore database name | `terraform output firestore_database_name` (default: `(default)`) |
| `PUBSUB_SUBSCRIPTION` | Pub/Sub subscription for consuming messages | `terraform output pubsub_subscription_name` |
| `GEMINI_API_KEY` | Optional Gemini API key (local dev only) | [AI Studio](https://aistudio.google.com/apikey) |
| `PORT` | HTTP server port | Static: `8081` (local), `8080` (Cloud Run) |

### Web App (`apps/web/.env`)

| Variable | Description | How to Obtain |
|---|---|---|
| `VITE_API_URL` | URL of the API service | Local: leave empty (Vite proxy), Deployed: Cloud Run API URL |
| `VITE_BASE_PATH` | Base path for GitHub Pages | Local: `/`, GitHub Pages: `/<repo-name>/` |
| `PORT` | Dev server port | Static: `3000` |

### Vertex AI Model Router (`VERTEX_*`)

The model router maps each AI capability to the optimal Vertex AI model. All variables are optional — defaults are used when not set. Set these to override the default model for a specific capability slot.

| Variable | Capability Slot | Default | Purpose |
|---|---|---|---|
| `VERTEX_TEXT_MODEL` | text | `gemini-3.1-flash` | General text generation (copy, briefs, prompts) |
| `VERTEX_TEXT_FALLBACK_MODEL` | textFallback | `gemini-3-flash-preview` | Fallback for text generation when primary is unavailable |
| `VERTEX_REASONING_MODEL` | reasoning | `gemini-3.1-pro-preview` | Complex reasoning tasks (storyboards, video briefs) |
| `VERTEX_IMAGE_MODEL` | image | `gemini-3.1-flash-image-preview` | Standard image generation |
| `VERTEX_IMAGE_HQ_MODEL` | imageHQ | `gemini-3-pro-image-preview` | High-quality image generation |
| `VERTEX_VIDEO_FAST_MODEL` | videoFast | `veo-3.1-fast-generate-001` | Fast video generation (teasers) |
| `VERTEX_VIDEO_FINAL_MODEL` | videoFinal | `veo-3.1-generate-001` | Final video generation (full quality) |
| `VERTEX_LIVE_MODEL` | live | `gemini-live-2.5-flash-native-audio` | Real-time live agent conversation |

The router performs startup availability checks and walks fallback chains when a primary model is unavailable:
- **text**: gemini-3.1-flash → gemini-3-flash-preview → gemini-3.1-flash-lite-preview
- **imageHQ**: gemini-3-pro-image-preview → gemini-3.1-flash-image-preview
- **videoFinal**: veo-3.1-generate-001 → veo-3.1-fast-generate-001

When a `VERTEX_*` env var is set, the override is used directly without an availability check.

## Quick Setup

> **Note:** The Smart Pipeline Orchestration feature (output-intent inference, conditional pipeline execution, partial completion) uses no additional environment variables beyond the existing ones listed above. The Planner module is a pure function that derives intent from the prompt, platform, tone, and optional `outputPreference` field — all passed at runtime via the API request, not via env vars.

```bash
# 1. Run Terraform to provision infrastructure
cd infra/terraform
terraform init
terraform apply

# 2. Copy example env files
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env

# 3. Fill in values from Terraform outputs
terraform output  # Shows all resource identifiers

# 4. Authenticate for local development
gcloud auth application-default login
```

## Cloud Run (Deployed)

When deployed to Cloud Run, environment variables are injected automatically by Terraform via the `cloudrun.tf` configuration. No manual `.env` files are needed — values come directly from Terraform resource references.
