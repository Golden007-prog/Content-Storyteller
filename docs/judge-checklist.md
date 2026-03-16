# Judge Checklist — Content Storyteller

Mapping of hackathon requirements to specific code, configuration, and deployment evidence.

---

## 1. Gemini Model Usage

| Requirement | Evidence | File |
|-------------|----------|------|
| Uses Gemini model | `gemini-2.0-flash` constant | [`apps/worker/src/services/genai.ts`](../apps/worker/src/services/genai.ts) |
| Creative Brief generation | ProcessInput calls `generateContent()` | [`apps/worker/src/pipeline/process-input.ts`](../apps/worker/src/pipeline/process-input.ts) |
| Copy generation | GenerateCopy calls `generateContent()` | [`apps/worker/src/pipeline/generate-copy.ts`](../apps/worker/src/pipeline/generate-copy.ts) |
| Image concept generation | GenerateImages calls `generateContent()` | [`apps/worker/src/pipeline/generate-images.ts`](../apps/worker/src/pipeline/generate-images.ts) |
| Video/storyboard generation | GenerateVideo calls `generateContent()` | [`apps/worker/src/pipeline/generate-video.ts`](../apps/worker/src/pipeline/generate-video.ts) |

## 2. Google GenAI SDK

| Requirement | Evidence | File |
|-------------|----------|------|
| SDK dependency | `"@google/genai": "^1.0.0"` | [`apps/worker/package.json`](../apps/worker/package.json) |
| SDK initialization | `new GoogleGenAI(...)` with ADC + API key fallback | [`apps/worker/src/services/genai.ts`](../apps/worker/src/services/genai.ts) |
| SDK import | `import { GoogleGenAI } from '@google/genai'` | [`apps/worker/src/services/genai.ts`](../apps/worker/src/services/genai.ts) |

## 3. Google Cloud Services

| GCP Service | Usage | Evidence |
|-------------|-------|----------|
| **Cloud Run** | 3 services: api, worker, web | [`infra/terraform/cloudrun.tf`](../infra/terraform/cloudrun.tf), [`scripts/deploy.sh`](../scripts/deploy.sh) |
| **Cloud Storage** | 3 buckets: uploads, assets, temp | [`infra/terraform/storage.tf`](../infra/terraform/storage.tf) |
| **Firestore** | Job state + live sessions | [`infra/terraform/firestore.tf`](../infra/terraform/firestore.tf), [`apps/api/src/services/firestore.ts`](../apps/api/src/services/firestore.ts), [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |
| **Pub/Sub** | Async job dispatch + dead-letter | [`infra/terraform/pubsub.tf`](../infra/terraform/pubsub.tf), [`apps/api/src/services/pubsub.ts`](../apps/api/src/services/pubsub.ts) |
| **Artifact Registry** | Docker image storage | [`infra/terraform/registry.tf`](../infra/terraform/registry.tf) |
| **Secret Manager** | Sensitive config | [`infra/terraform/secrets.tf`](../infra/terraform/secrets.tf) |
| **Cloud Build** | CI/CD pipeline | [`cloudbuild.yaml`](../cloudbuild.yaml) |
| **IAM** | Least-privilege service accounts | [`infra/terraform/iam.tf`](../infra/terraform/iam.tf) |
| **Cloud Logging** | Structured observability | [`apps/worker/src/middleware/logger.ts`](../apps/worker/src/middleware/logger.ts), [`apps/api/src/middleware/logger.ts`](../apps/api/src/middleware/logger.ts) |

## 4. Multimodal Input

| Capability | Evidence | File |
|------------|----------|------|
| File upload (images, audio, video, PDF) | Multipart upload with MIME validation | [`apps/api/src/routes/upload.ts`](../apps/api/src/routes/upload.ts) |
| Text prompt input | `promptText` field on job creation | [`apps/api/src/routes/jobs.ts`](../apps/api/src/routes/jobs.ts) |
| Multimodal Gemini input | `generateContentMultimodal()` with inline data | [`apps/worker/src/services/genai.ts`](../apps/worker/src/services/genai.ts) |
| ProcessInput reads uploads | Reads uploaded files from GCS for Gemini analysis | [`apps/worker/src/pipeline/process-input.ts`](../apps/worker/src/pipeline/process-input.ts) |
| Allowed MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `audio/mpeg`, `audio/wav`, `audio/webm`, `video/mp4`, `video/webm`, `application/pdf` | [`apps/api/src/routes/upload.ts`](../apps/api/src/routes/upload.ts) |

## 5. Deployable on GCP

| Requirement | Evidence | File |
|-------------|----------|------|
| Terraform IaC | All resources declaratively managed | [`infra/terraform/`](../infra/terraform/) |
| Dockerfiles | API, Worker, Web containerized | [`apps/api/Dockerfile`](../apps/api/Dockerfile), [`apps/worker/Dockerfile`](../apps/worker/Dockerfile), [`apps/web/Dockerfile`](../apps/web/Dockerfile) |
| Cloud Run deployment | 3 services deployed | [`scripts/deploy.sh`](../scripts/deploy.sh) |
| CI/CD pipeline | Cloud Build config | [`cloudbuild.yaml`](../cloudbuild.yaml) |
| One-command deploy | `make deploy` / `scripts/deploy.sh` | [`Makefile`](../Makefile) |
| Deployment proof | URLs, resources, verification commands | [`docs/deployment-proof.md`](./deployment-proof.md) |

## 6. Real-Time Interaction

| Capability | Evidence | File |
|------------|----------|------|
| SSE streaming | EventSource connection for live progress | [`apps/api/src/routes/stream.ts`](../apps/api/src/routes/stream.ts) |
| Partial results | Progressive content reveal via `partial_result` events | [`apps/api/src/routes/stream.ts`](../apps/api/src/routes/stream.ts) |
| Frontend SSE hook | `useSSE` manages EventSource lifecycle | [`apps/web/src/hooks/useSSE.ts`](../apps/web/src/hooks/useSSE.ts) |
| Generation timeline | Visual pipeline progress with animations | [`apps/web/src/components/GenerationTimeline.tsx`](../apps/web/src/components/GenerationTimeline.tsx) |
| Live Agent Mode | Conversational AI Creative Director with Gemini | [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |
| Live session API | Start/input/stop endpoints for live sessions | [`apps/api/src/routes/live.ts`](../apps/api/src/routes/live.ts) |
| Live session UI | Mic toggle, chat transcript, creative direction extraction | [`apps/web/src/components/LiveAgentPanel.tsx`](../apps/web/src/components/LiveAgentPanel.tsx) |
| Batch handoff | Live session creative direction seeds batch pipeline | [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) |

## 7. Architecture & Code Quality

| Aspect | Evidence |
|--------|----------|
| Monorepo | `package.json` workspaces: `apps/web`, `apps/api`, `apps/worker`, `packages/shared` |
| Shared types | [`packages/shared/src/`](../packages/shared/src/) — enums, schemas, types used across services |
| TypeScript | All services written in TypeScript with strict compilation |
| Testing | Unit tests + property-based tests (fast-check) across all packages |
| Architecture docs | [`docs/architecture.md`](./architecture.md) with Mermaid diagrams |
| IAM docs | [`docs/iam.md`](./iam.md) with service account roles |

---

## 8. Gemini Live / ADK Integration

| Capability | Evidence | File |
|------------|----------|------|
| Live session service | Bidirectional Gemini conversation with `generateAgentResponse()` | [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |
| Creative direction extraction | `extractCreativeDirection()` via Gemini analysis of transcript | [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |
| Session persistence | `liveSessions` Firestore collection with transcript history | [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |
| Live API routes | `POST /live/start`, `POST /live/input`, `POST /live/stop`, `GET /live/:sessionId` | [`apps/api/src/routes/live.ts`](../apps/api/src/routes/live.ts) |
| Frontend Live Agent panel | Mic toggle, text chat, streaming transcript, creative direction display | [`apps/web/src/components/LiveAgentPanel.tsx`](../apps/web/src/components/LiveAgentPanel.tsx) |
| Batch mode handoff | "Generate Content Package from This Direction" button | [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) |
| Property tests | Session start validation, transcript persistence on stop | [`apps/api/src/__tests__/live-session.property.test.ts`](../apps/api/src/__tests__/live-session.property.test.ts) |
| Graceful fallback | Works without Gemini API — fallback agent responses and direction extraction | [`apps/api/src/services/live-session.ts`](../apps/api/src/services/live-session.ts) |

---

## 9. Trend Analyzer

| Capability | Evidence | File |
|------------|----------|------|
| Trend API routes | POST /analyze, GET /:queryId with validation | [`apps/api/src/routes/trends.ts`](../apps/api/src/routes/trends.ts) |
| Trend provider architecture | Provider interface, normalization, scoring, registry | [`apps/api/src/services/trends/`](../apps/api/src/services/trends/) |
| Gemini trend provider | AI-powered raw signal generation | [`apps/api/src/services/trends/providers/gemini-provider.ts`](../apps/api/src/services/trends/providers/gemini-provider.ts) |
| Trend analyzer orchestrator | Provider → normalize → Gemini consolidation pipeline | [`apps/api/src/services/trends/analyzer.ts`](../apps/api/src/services/trends/analyzer.ts) |
| API GenAI client | `@google/genai` SDK for trend analysis | [`apps/api/src/services/genai.ts`](../apps/api/src/services/genai.ts) |
| Frontend — TrendFilters | Platform, domain, region, time, language selectors | [`apps/web/src/components/TrendFilters.tsx`](../apps/web/src/components/TrendFilters.tsx) |
| Frontend — TrendCard | Trend display with momentum, freshness, CTA | [`apps/web/src/components/TrendCard.tsx`](../apps/web/src/components/TrendCard.tsx) |
| Frontend — TrendResults | Results grid with summary and loading/empty states | [`apps/web/src/components/TrendResults.tsx`](../apps/web/src/components/TrendResults.tsx) |
| Frontend — TrendSummary | Overall trend landscape narrative | [`apps/web/src/components/TrendSummary.tsx`](../apps/web/src/components/TrendSummary.tsx) |
| Frontend — TrendAnalyzerPage | Container managing filters, results, loading, error | [`apps/web/src/components/TrendAnalyzerPage.tsx`](../apps/web/src/components/TrendAnalyzerPage.tsx) |
| CTA integration | handleUseTrend, mapTrendPlatform for batch mode handoff | [`apps/web/src/App.tsx`](../apps/web/src/App.tsx) |
| Shared types | TrendPlatform, TrendQuery, TrendItem, TrendAnalysisResult | [`packages/shared/src/types/trends.ts`](../packages/shared/src/types/trends.ts) |
| Property tests — providers | Normalization, scoring, inferred signals | [`apps/api/src/__tests__/trend-provider.property.test.ts`](../apps/api/src/__tests__/trend-provider.property.test.ts) |
| Property tests — API | Validation, acceptance, 404, domain presets | [`apps/api/src/__tests__/trend-api.property.test.ts`](../apps/api/src/__tests__/trend-api.property.test.ts) |
| Property tests — frontend | Filters, results, card fields, CTA mapping | [`apps/web/src/__tests__/trend-analyzer.property.test.tsx`](../apps/web/src/__tests__/trend-analyzer.property.test.tsx) |

---

## Quick Verification Commands

```bash
# Verify Gemini model in code
grep -r "gemini-2.0-flash" apps/worker/src/

# Verify GenAI SDK dependency
grep "@google/genai" apps/worker/package.json

# Verify GCP services in Terraform
ls infra/terraform/*.tf

# Verify Cloud Run services
gcloud run services list --region=us-central1

# Verify multimodal upload support
grep "ALLOWED_MIME_TYPES" apps/api/src/routes/upload.ts
```
