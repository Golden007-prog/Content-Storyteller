# Kiro Build Handoff — Content Storyteller

This document provides Kiro with full context to build application code on top of the provisioned GCP foundation. It covers repo structure, infrastructure, API contracts (referencing shared package types), frontend screen descriptions, backend endpoint specs, worker pipeline details, known TODOs, and operational commands.

---

## 1. Repository Structure

```
content-storyteller/
├── apps/
│   ├── web/                        # Frontend (Vite + React, TypeScript)
│   │   ├── src/                    # Application source (scaffold only)
│   │   ├── package.json
│   │   └── .env.example
│   ├── api/                        # API service (Express, TypeScript)
│   │   ├── src/
│   │   │   ├── routes/             # upload.ts, jobs.ts, stream.ts
│   │   │   ├── services/           # firestore.ts, pubsub.ts, storage.ts
│   │   │   ├── middleware/         # correlation-id.ts, error-handler.ts, logger.ts, upload-limiter.ts
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── .env.example
│   └── worker/                     # Async worker service (Express, TypeScript)
│       ├── src/
│       │   ├── pipeline/           # pipeline-runner.ts, process-input.ts, generate-copy.ts, generate-images.ts, generate-video.ts, compose-package.ts
│       │   ├── services/           # firestore.ts, storage.ts
│       │   ├── capabilities/       # capability-registry.ts, image-generation.ts, video-generation.ts
│       │   ├── middleware/         # logger.ts
│       │   └── index.ts
│       ├── Dockerfile
│       ├── package.json
│       └── .env.example
├── packages/
│   └── shared/                     # Shared types, schemas, enums
│       ├── src/
│       │   ├── types/              # api.ts, job.ts, messages.ts
│       │   ├── schemas/            # creative-brief.ts, asset-bundle.ts, generation.ts
│       │   └── index.ts            # Barrel export
│       └── package.json
├── infra/terraform/                # All Terraform IaC
├── scripts/                        # bootstrap.sh, build.sh, deploy.sh, dev.sh
├── docs/                           # Architecture, IAM, env, demo, deployment proof, this file
├── cloudbuild.yaml
├── Makefile
└── package.json                    # Workspace root
```

---

## 2. Provisioned GCP Services and Resource Names

All resources are created via Terraform in `infra/terraform/`. Bucket names use the pattern `${project_id}-{purpose}`.

| GCP Service | Resource | Terraform Resource Name | Naming Pattern |
|---|---|---|---|
| Cloud Storage | Uploads bucket | `google_storage_bucket.uploads` | `${project_id}-uploads` |
| Cloud Storage | Assets bucket | `google_storage_bucket.assets` | `${project_id}-assets` |
| Cloud Storage | Temp bucket | `google_storage_bucket.temp` | `${project_id}-temp` (7-day lifecycle delete) |
| Firestore | Database (Native mode) | `google_firestore_database.main` | `(default)` |
| Pub/Sub | Topic | `google_pubsub_topic.content_generation_jobs` | `content-generation-jobs` |
| Pub/Sub | Subscription | `google_pubsub_subscription.content_generation_jobs_sub` | `content-generation-jobs-sub` (ack 600s, backoff 10s–600s) |
| Pub/Sub | Dead-letter topic | `google_pubsub_topic.content_generation_jobs_dead_letter` | `content-generation-jobs-dead-letter` |
| Artifact Registry | Docker repo | `google_artifact_registry_repository.content_storyteller` | `content-storyteller` |
| Cloud Run | API service | `google_cloud_run_v2_service.api` | `api-service` (1 CPU, 512Mi, concurrency 80) |
| Cloud Run | Worker service | `google_cloud_run_v2_service.worker` | `worker-service` (2 CPU, 1Gi, concurrency 1, timeout 600s) |
| Secret Manager | API keys | `google_secret_manager_secret.api_keys` | `api-keys` |
| Secret Manager | App config | `google_secret_manager_secret.app_config` | `app-config` |
| Secret Manager | Vertex AI config | `google_secret_manager_secret.vertex_ai_config` | `vertex-ai-config` |
| IAM | API service account | `google_service_account.api_sa` | `api-sa` |
| IAM | Worker service account | `google_service_account.worker_sa` | `worker-sa` |
| IAM | CI/CD service account | `google_service_account.cicd_sa` | `cicd-sa` |
| Vertex AI | Gemini models | (API enabled) | `gemini-2.0-flash` used in worker pipeline |


---

## 3. Cloud Run Environment Variables

Every environment variable injected into Cloud Run containers via `infra/terraform/cloudrun.tf`, with its source.

### API Service (`api-service`)

| Variable | Value / Reference | Source |
|---|---|---|
| `GCP_PROJECT_ID` | `var.project_id` | Terraform variable |
| `GCP_REGION` | `var.region` | Terraform variable |
| `UPLOADS_BUCKET` | `google_storage_bucket.uploads.name` | Terraform output (storage.tf) |
| `ASSETS_BUCKET` | `google_storage_bucket.assets.name` | Terraform output (storage.tf) |
| `FIRESTORE_DATABASE` | `google_firestore_database.main.name` | Terraform output (firestore.tf) |
| `PUBSUB_TOPIC` | `google_pubsub_topic.content_generation_jobs.name` | Terraform output (pubsub.tf) |
| `PORT` | `"8080"` | Static config |

### Worker Service (`worker-service`)

| Variable | Value / Reference | Source |
|---|---|---|
| `GCP_PROJECT_ID` | `var.project_id` | Terraform variable |
| `GCP_REGION` | `var.region` | Terraform variable |
| `UPLOADS_BUCKET` | `google_storage_bucket.uploads.name` | Terraform output (storage.tf) |
| `ASSETS_BUCKET` | `google_storage_bucket.assets.name` | Terraform output (storage.tf) |
| `TEMP_BUCKET` | `google_storage_bucket.temp.name` | Terraform output (storage.tf) |
| `FIRESTORE_DATABASE` | `google_firestore_database.main.name` | Terraform output (firestore.tf) |
| `PUBSUB_SUBSCRIPTION` | `google_pubsub_subscription.content_generation_jobs_sub.name` | Terraform output (pubsub.tf) |
| `PORT` | `"8080"` | Static config |

### Secret Manager Secrets (available but not injected as env vars)

These secrets are provisioned as placeholders. Application code should read them at runtime via the Secret Manager SDK if needed:

| Secret | Secret ID | Purpose |
|---|---|---|
| API Keys | `api-keys` | Third-party API keys |
| App Config | `app-config` | Application configuration values |
| Vertex AI Config | `vertex-ai-config` | Vertex AI-specific settings |

---

## 4. API Contracts (Shared Package Types)

All request/response types are defined in `packages/shared/src/` and exported from `packages/shared/src/index.ts`. Import via `@content-storyteller/shared`.

### 4.1 Types — `packages/shared/src/types/api.ts`

| Type | Fields | Used By |
|---|---|---|
| `UploadMediaRequest` | `file: Uint8Array`, `fileName: string`, `contentType: string` | Web → API |
| `UploadMediaResponse` | `uploadPath: string`, `fileName: string`, `contentType: string`, `size: number` | API → Web |
| `CreateJobRequest` | `uploadedMediaPaths: string[]`, `idempotencyKey: string` | Web → API |
| `CreateJobResponse` | `jobId: string`, `state: JobState`, `createdAt: Date` | API → Web |
| `PollJobStatusResponse` | `jobId: string`, `state: JobState`, `assets: AssetReference[]`, `errorMessage?: string`, `updatedAt: Date` | API → Web |
| `RetrieveAssetsResponse` | `bundle: AssetBundle` | API → Web |
| `StreamEventShape` | `event: string`, `data: { jobId, state, assets?, errorMessage?, timestamp }` | API → Web (SSE) |
| `ErrorResponse` | `error: { code: string, message: string, correlationId: string }` | API → Web |

### 4.2 Types — `packages/shared/src/types/job.ts`

| Type | Description |
|---|---|
| `JobState` (enum) | `queued`, `processing_input`, `generating_copy`, `generating_images`, `generating_video`, `composing_package`, `completed`, `failed` |
| `AssetType` (enum) | `copy`, `image`, `video`, `storyboard`, `voiceover_script` |
| `AssetReference` | `assetId`, `jobId`, `assetType: AssetType`, `storagePath`, `generationTimestamp: Date`, `status: 'pending' \| 'completed' \| 'skipped'` |
| `FallbackNotice` | `capability: string`, `reason: string`, `timestamp: Date`, `stage: JobState` |
| `Job` | `id`, `correlationId`, `idempotencyKey`, `state: JobState`, `uploadedMediaPaths: string[]`, `creativeBrief?: CreativeBrief`, `assets: AssetReference[]`, `fallbackNotices: FallbackNotice[]`, `errorMessage?: string`, `createdAt`, `updatedAt` |

### 4.3 Types — `packages/shared/src/types/messages.ts`

| Type | Fields | Used By |
|---|---|---|
| `GenerationTaskMessage` | `jobId: string`, `idempotencyKey: string` | API → Pub/Sub → Worker |

### 4.4 Schemas — `packages/shared/src/schemas/creative-brief.ts`

| Type | Fields |
|---|---|
| `CreativeBrief` | `targetAudience: string`, `tone: string`, `keyMessages: string[]`, `visualDirection: string`, `brandGuidelines?: string`, `inputSummary: string` |

### 4.5 Schemas — `packages/shared/src/schemas/asset-bundle.ts`

| Type | Fields |
|---|---|
| `AssetBundle` | `jobId: string`, `completedAt: Date`, `assets: AssetReference[]`, `creativeBrief: CreativeBrief`, `fallbackNotices: FallbackNotice[]` |

### 4.6 Schemas — `packages/shared/src/schemas/generation.ts`

| Type | Description |
|---|---|
| `GenerationInput` | `jobId: string`, `data: Record<string, unknown>` |
| `GenerationOutput` | `success: boolean`, `assets: string[]`, `metadata?: Record<string, unknown>` |
| `GenerationCapability` | Interface: `name: string`, `isAvailable(): Promise<boolean>`, `generate(input): Promise<GenerationOutput>` |
| `StageResult` | `success: boolean`, `assets: string[]`, `error?: string` |
| `PipelineContext` | `jobId: string`, `correlationId: string`, `uploadedMediaPaths: string[]`, `workingData: Record<string, unknown>` |
| `PipelineStage` | Interface: `name: string`, `jobState: JobState`, `execute(context): Promise<StageResult>` |

---

## 5. Backend Endpoint Specifications

### API Service (Express, `apps/api/src/index.ts`)

Middleware stack (applied in order): `correlationId` → `requestLogger` → `uploadLimiter` → `express.json` → routes → `errorHandler`.

| Method | Path | Handler File | Description | Request | Response Type |
|---|---|---|---|---|---|
| `GET` | `/api/v1/health` | `index.ts` | Health check | — | `{ status, timestamp }` |
| `POST` | `/api/v1/upload` | `routes/upload.ts` | Upload media (multipart, max 50MB, up to 10 files) | `multipart/form-data` field `files` | `{ uploads: UploadMediaResponse[] }` |
| `POST` | `/api/v1/jobs` | `routes/jobs.ts` | Create generation job | `CreateJobRequest` JSON body | `CreateJobResponse` (201) |
| `GET` | `/api/v1/jobs/:jobId` | `routes/jobs.ts` | Poll job status | — | `PollJobStatusResponse` |
| `GET` | `/api/v1/jobs/:jobId/assets` | `routes/jobs.ts` | Retrieve completed asset bundle | — | `RetrieveAssetsResponse` (409 if not completed) |
| `GET` | `/api/v1/jobs/:jobId/stream` | `routes/stream.ts` | SSE stream of job state changes | — | `StreamEventShape` events (2s poll interval) |

Error responses use `ErrorResponse` type: `{ error: { code, message, correlationId } }`.

### Worker Service (Express, `apps/worker/src/index.ts`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/` | Pub/Sub push endpoint — receives base64-encoded `GenerationTaskMessage`, runs pipeline |

---

## 6. Worker Pipeline Step Details

The pipeline runner (`apps/worker/src/pipeline/pipeline-runner.ts`) executes stages sequentially with a 10-minute timeout. Each stage implements `PipelineStage` from the shared package.

| # | Stage Class | File | JobState Transition | What It Does |
|---|---|---|---|---|
| 1 | `ProcessInput` | `process-input.ts` | → `processing_input` | Reads uploaded media from GCS, sends to Vertex AI (Gemini 2.0 Flash) for multimodal analysis, produces `CreativeBrief`, stores brief on Job document and in `context.workingData` |
| 2 | `GenerateCopy` | `generate-copy.ts` | → `generating_copy` | Takes `CreativeBrief` from working data, prompts Gemini for headline, tagline, body copy, CTA, social captions. Writes JSON asset to `{jobId}/copy/{assetId}.json` in assets bucket. Records `AssetReference` (type `copy`) |
| 3 | `GenerateImages` | `generate-images.ts` | → `generating_images` | Checks `image_generation` capability via registry. If available: generates 3 image prompts via Gemini, then calls capability's `generate()`. If unavailable: records `FallbackNotice`, continues. Assets written to `{jobId}/images/{assetId}.png` |
| 4 | `GenerateVideo` | `generate-video.ts` | → `generating_video` | Checks `video_generation` capability via registry. If available: generates video via capability. Always generates storyboard (`{jobId}/storyboard/{id}.json`, type `storyboard`) and voiceover script (`{jobId}/voiceover/{id}.json`, type `voiceover_script`) via Gemini. If unavailable: records `FallbackNotice` |
| 5 | `ComposePackage` | `compose-package.ts` | → `composing_package` → `completed` | Reads current Job from Firestore, assembles `AssetBundle` (all assets + creative brief + fallback notices), writes bundle manifest to `{jobId}/bundle/{id}.json`, marks Job `completed` |

Pipeline error handling:
- If any stage returns `{ success: false }`, the job is marked `failed` and no subsequent stages run.
- If the 10-minute timeout is exceeded, the job is marked `failed` with a timeout message.
- Capability fallbacks (image/video unavailable) do NOT fail the pipeline — they record a `FallbackNotice` and continue.

Capability registry: `apps/worker/src/capabilities/capability-registry.ts` holds `image_generation` and `video_generation` capabilities. Each implements `GenerationCapability.isAvailable()` which is called before `generate()`.


---

## 7. Frontend Screen Descriptions (Web App — `apps/web/`)

The web app has not been built yet. It should be a Vite + React TypeScript SPA that communicates with the API service. Below are the screens to implement, with the shared types each screen consumes.

### 7.1 Upload Screen (Home)

- File drop zone / file picker accepting images, screenshots, text files, voice notes
- Max 50MB per file, up to 10 files
- On submit: `POST /api/v1/upload` (multipart) → receives `UploadMediaResponse[]`
- Then: `POST /api/v1/jobs` with `CreateJobRequest { uploadedMediaPaths, idempotencyKey }` → receives `CreateJobResponse`
- Navigates to Job Progress screen on success

### 7.2 Job Progress Screen

- Displays current `JobState` from `PollJobStatusResponse` (poll via `GET /api/v1/jobs/:jobId` or connect to SSE via `GET /api/v1/jobs/:jobId/stream`)
- Shows a step indicator for the pipeline stages: `queued` → `processing_input` → `generating_copy` → `generating_images` → `generating_video` → `composing_package` → `completed`
- Displays partial results (assets) as they become available
- Shows `FallbackNotice` items if any capabilities were unavailable
- On `completed`: navigates to or reveals the Asset Bundle screen
- On `failed`: shows `errorMessage` from the Job

### 7.3 Asset Bundle Screen

- Fetches `GET /api/v1/jobs/:jobId/assets` → `RetrieveAssetsResponse { bundle: AssetBundle }`
- Displays the `CreativeBrief` summary (target audience, tone, key messages, visual direction)
- Lists all `AssetReference` items grouped by `AssetType`:
  - **Copy** — rendered marketing copy (headline, tagline, body, CTA, social captions)
  - **Images** — generated marketing visuals (display inline or as downloadable links)
  - **Video** — generated promo video (embedded player or download link)
  - **Storyboard** — scene-by-scene storyboard (rendered from JSON)
  - **Voiceover Script** — script text with duration and speaker notes
- Shows any `FallbackNotice` items explaining skipped capabilities
- Download all / download individual asset buttons

### 7.4 Error / Not Found Screen

- Displayed when a Job ID is invalid or not found (404 from API)
- Uses `ErrorResponse` type for structured error display

---

## 8. Firestore Data Model

Collection: `jobs`

Each document follows the `Job` interface from `packages/shared/src/types/job.ts`:

```
{
  id: string,                       // Document ID
  correlationId: string,            // From API request X-Correlation-ID header
  idempotencyKey: string,           // Client-provided dedup key
  state: JobState,                  // Current pipeline state
  uploadedMediaPaths: string[],     // GCS paths in uploads bucket
  creativeBrief?: CreativeBrief,    // Set after ProcessInput stage
  assets: AssetReference[],         // Accumulated across pipeline stages
  fallbackNotices: FallbackNotice[],// Capabilities that were unavailable
  errorMessage?: string,            // Set when state is 'failed'
  createdAt: Date,
  updatedAt: Date
}
```

---

## 9. GCS Asset Path Conventions

All generated assets are stored in the assets bucket (`${project_id}-assets`) under the job ID:

| Asset Type | Path Pattern | Content Type |
|---|---|---|
| Copy | `{jobId}/copy/{assetId}.json` | `application/json` |
| Images | `{jobId}/images/{assetId}.png` | `image/png` |
| Video | `{jobId}/video/{assetId}.mp4` | `video/mp4` |
| Storyboard | `{jobId}/storyboard/{assetId}.json` | `application/json` |
| Voiceover Script | `{jobId}/voiceover/{assetId}.json` | `application/json` |
| Bundle Manifest | `{jobId}/bundle/{assetId}.json` | `application/json` |

Uploads are stored in the uploads bucket (`${project_id}-uploads`) under `{uploadId}/{originalFilename}`.

---

## 10. Known TODOs

| Area | TODO | Priority |
|---|---|---|
| Web App | Build the full React frontend (`apps/web/src/`) — currently scaffold only | High |
| Web App | Implement all 4 screens described in Section 7 | High |
| Auth | No authentication layer yet — add Firebase Auth or API key middleware | Medium |
| Secret Manager | Populate actual secret values (currently placeholder secrets with no versions) | Medium |
| Pub/Sub | Configure push subscription endpoint to worker Cloud Run URL (currently pull-based in code) | Medium |
| Tests | Property-based tests and unit tests for shared package, API, and worker (tasks 1.3, 1.4, 3.10, 5.5, 5.6, 7.5, 7.6, 11.3) | Medium |
| Image Generation | `image-generation.ts` capability needs real Vertex AI Imagen integration | Medium |
| Video Generation | `video-generation.ts` capability needs real Vertex AI video model integration | Medium |
| CORS | Add CORS middleware to API service for web app origin | High |
| SSE | SSE stream uses polling (2s interval) — consider Firestore real-time listeners for true push | Low |
| CI/CD | `cloudbuild.yaml` defined but not yet connected to a Cloud Build trigger | Low |
| Monitoring | No alerting or dashboards configured — add Cloud Monitoring alerts | Low |

---

## 11. Operational Commands

### Makefile Targets

```bash
make bootstrap     # Init GCP project, authenticate, terraform apply
make build         # Docker build + push API and Worker images to Artifact Registry
make deploy        # Deploy latest images to Cloud Run
make dev           # Start local dev servers (web, api, worker)
make tf-plan       # Preview Terraform changes
make tf-apply      # Apply Terraform configuration
make tf-destroy    # Destroy all Terraform-managed resources
```

### Direct Script Usage

```bash
bash scripts/bootstrap.sh   # Full project bootstrap
bash scripts/build.sh       # Build and push Docker images
bash scripts/deploy.sh      # Deploy to Cloud Run
bash scripts/dev.sh         # Local development servers
```

### Terraform

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
terraform output              # View all output values (bucket names, URLs, etc.)
terraform output -json        # Machine-readable outputs
```

### Docker (Local)

```bash
# Build API image
docker build -t api-service -f apps/api/Dockerfile .

# Build Worker image
docker build -t worker-service -f apps/worker/Dockerfile .
```

### GCloud

```bash
# Authenticate
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project <PROJECT_ID>

# View deployed services
gcloud run services list --region us-central1

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50 --format json
```
