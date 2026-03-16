# Implementation Plan: Content Storyteller GCP Foundation

## Overview

Incremental build of the Content Storyteller monorepo: start with project scaffolding and shared types, then Terraform infrastructure, then API service, worker service, deployment scripts, documentation, and finally wiring everything together. Each task builds on the previous and ends with runnable/verifiable code.

## Tasks

- [x] 1. Scaffold monorepo structure and shared package
  - [x] 1.1 Create root workspace configuration and directory skeleton
    - Create root `package.json` with pnpm/npm workspaces referencing `apps/web`, `apps/api`, `apps/worker`, `packages/shared`
    - Create `.env.example` at root with all required environment variables (GCP_PROJECT_ID, GCP_REGION, UPLOADS_BUCKET, ASSETS_BUCKET, TEMP_BUCKET, FIRESTORE_DATABASE, PUBSUB_TOPIC, PUBSUB_SUBSCRIPTION, PORT)
    - Create directory structure: `apps/web/src`, `apps/api/src/routes`, `apps/api/src/services`, `apps/api/src/middleware`, `apps/worker/src/pipeline`, `apps/worker/src/services`, `apps/worker/src/capabilities`, `packages/shared/src/types`, `packages/shared/src/schemas`, `infra/terraform`, `scripts`, `docs`
    - Create `package.json` files for each app and package with TypeScript and Vitest dev dependencies
    - Create `.env.example` files in `apps/web`, `apps/api`, `apps/worker`
    - _Requirements: 1.1, 1.2, 1.3, 12.1, 19.1, 19.2, 19.3_

  - [x] 1.2 Implement shared package types, schemas, and enums
    - Create `packages/shared/src/types/job.ts` with `Job`, `JobState` enum (`queued`, `processing_input`, `generating_copy`, `generating_images`, `generating_video`, `composing_package`, `completed`, `failed`), `AssetReference`, `AssetType`, `FallbackNotice`
    - Create `packages/shared/src/types/api.ts` with request/response interfaces: `UploadMediaRequest`, `UploadMediaResponse`, `CreateJobRequest`, `CreateJobResponse`, `PollJobStatusResponse`, `RetrieveAssetsResponse`, `StreamEventShape`, `ErrorResponse`
    - Create `packages/shared/src/types/messages.ts` with `GenerationTaskMessage` interface (`jobId`, `idempotencyKey`)
    - Create `packages/shared/src/schemas/creative-brief.ts` with `CreativeBrief` interface
    - Create `packages/shared/src/schemas/asset-bundle.ts` with `AssetBundle` interface
    - Create `packages/shared/src/schemas/generation.ts` with `GenerationCapability` interface (`name`, `isAvailable()`, `generate()`), `GenerationInput`, `GenerationOutput`, `StageResult`, `PipelineStage` interface, `PipelineContext`
    - Create `packages/shared/src/index.ts` barrel export
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 18.4, 19.4, 19.5_

  - [x]* 1.3 Write property tests for shared package
    - **Property 21: Naming conventions enforced** — Verify kebab-case file names, PascalCase types/interfaces, camelCase functions/variables across shared package source files
    - **Validates: Requirements 19.4**

  - [x]* 1.4 Write unit tests for shared package
    - Verify `JobState` enum contains all required values
    - Verify `AssetType` contains all required values (copy, image, video, storyboard, voiceover_script)
    - Verify all types and schemas are importable from barrel export
    - _Requirements: 13.4, 13.5_

- [x] 2. Checkpoint — Ensure shared package compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Terraform infrastructure
  - [x] 3.1 Create Terraform provider config and API enablement (`main.tf`, `variables.tf`)
    - Create `infra/terraform/variables.tf` with `project_id` (no default) and `region` (default `us-central1`) variables
    - Create `infra/terraform/main.tf` with Google provider config and `google_project_service` resources for all 11 required APIs (Vertex AI, Cloud Run, Artifact Registry, Secret Manager, Cloud Build, Cloud Storage, Firestore, Cloud Tasks, Pub/Sub, IAM, Cloud Logging) with `disable_on_destroy = false`
    - Create `infra/terraform/terraform.tfvars.example` with placeholder values
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 Create Cloud Storage buckets (`storage.tf`)
    - Create `infra/terraform/storage.tf` with three `google_storage_bucket` resources: `${var.project_id}-uploads`, `${var.project_id}-assets`, `${var.project_id}-temp`
    - Configure `uniform_bucket_level_access = true` on all buckets
    - Configure lifecycle rule on temp bucket: delete objects older than 7 days
    - All buckets in `var.region`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 15.8_

  - [x] 3.3 Create Firestore database (`firestore.tf`)
    - Create `infra/terraform/firestore.tf` with `google_firestore_database` resource in Native mode, location `var.region`
    - _Requirements: 5.1, 5.2_

  - [x] 3.4 Create Pub/Sub topic and subscription (`pubsub.tf`)
    - Create `infra/terraform/pubsub.tf` with topic `content-generation-jobs`, subscription `content-generation-jobs-sub`
    - Configure `ack_deadline_seconds = 600`, retry policy with `minimum_backoff = "10s"`, `maximum_backoff = "600s"`
    - Create dead-letter topic for failed messages
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.5 Create Artifact Registry (`registry.tf`)
    - Create `infra/terraform/registry.tf` with Docker-format repository `content-storyteller` in `var.region`
    - _Requirements: 3.1, 3.2_

  - [x] 3.6 Create Secret Manager placeholders (`secrets.tf`)
    - Create `infra/terraform/secrets.tf` with `google_secret_manager_secret` resources (no secret versions with actual values)
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.7 Create IAM service accounts and role bindings (`iam.tf`)
    - Create `infra/terraform/iam.tf` with three service accounts: `api-sa`, `worker-sa`, `cicd-sa`
    - Assign roles per design: api-sa gets storage, datastore, pubsub publisher, secret accessor, logging, vertex AI user; worker-sa gets storage (all buckets), datastore, secret accessor, logging, vertex AI user, pubsub subscriber; cicd-sa gets artifact registry writer, run admin, cloud build editor, service account user
    - No `roles/owner` or `roles/editor` assigned
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 3.8 Create Cloud Run service definitions (`cloudrun.tf`)
    - Create `infra/terraform/cloudrun.tf` with two `google_cloud_run_v2_service` resources
    - API service: concurrency 80, 1 CPU / 512Mi, uses `api-sa`, env vars (GCP_PROJECT_ID, GCP_REGION, UPLOADS_BUCKET, ASSETS_BUCKET, FIRESTORE_DATABASE, PUBSUB_TOPIC, PORT)
    - Worker service: concurrency 1, 2 CPU / 1Gi, timeout 600s, uses `worker-sa`, env vars (GCP_PROJECT_ID, GCP_REGION, UPLOADS_BUCKET, ASSETS_BUCKET, TEMP_BUCKET, FIRESTORE_DATABASE, PUBSUB_SUBSCRIPTION, PORT)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 3.9 Create Terraform outputs (`outputs.tf`)
    - Create `infra/terraform/outputs.tf` with all required outputs: project_id, region, artifact registry path, all bucket names, firestore database name, pubsub topic and subscription names, all service account emails, cloud run service URLs, secret resource names
    - All outputs with descriptive `description` attributes
    - _Requirements: 10.1, 10.2_

  - [x]* 3.10 Write property tests for Terraform configuration
    - **Property 1: No hardcoded sensitive values in Terraform** — Parse all .tf files and verify no hardcoded project IDs, region strings (outside variable defaults), bucket name literals, or secret values
    - **Validates: Requirements 2.4, 7.2**
    - **Property 2: Bucket names use project ID prefix** — Verify all google_storage_bucket resources reference var.project_id in name
    - **Validates: Requirements 4.2**
    - **Property 3: Uniform bucket-level access on all buckets** — Verify all google_storage_bucket resources set uniform_bucket_level_access = true
    - **Validates: Requirements 4.5**
    - **Property 6: No owner/editor roles on service accounts** — Verify no IAM binding uses roles/owner or roles/editor
    - **Validates: Requirements 9.5**
    - **Property 7: All outputs have descriptions** — Verify every output block has a non-empty description
    - **Validates: Requirements 10.2**

- [x] 4. Checkpoint — Ensure Terraform validates (`terraform validate`) and all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement API Service
  - [x] 5.1 Create API service entry point and middleware stack
    - Create `apps/api/src/middleware/correlation-id.ts` — generates or propagates `X-Correlation-ID` header, attaches to request context
    - Create `apps/api/src/middleware/error-handler.ts` — catches unhandled errors, returns structured `ErrorResponse` JSON
    - Create `apps/api/src/middleware/upload-limiter.ts` — rejects requests exceeding 50MB
    - Create `apps/api/src/middleware/logger.ts` — structured JSON logger with correlation ID, timestamp, severity
    - Create `apps/api/src/index.ts` — Express/Fastify app setup, middleware registration, route mounting, health check at `/api/v1/health`
    - _Requirements: 15.1, 15.3, 15.5, 19.2_

  - [x] 5.2 Implement API service client wrappers (GCS, Firestore, Pub/Sub)
    - Create `apps/api/src/services/storage.ts` — upload file to GCS uploads bucket, read from assets bucket
    - Create `apps/api/src/services/firestore.ts` — create Job document, read Job, update Job, query assets
    - Create `apps/api/src/services/pubsub.ts` — publish GenerationTaskMessage with correlationId in attributes
    - _Requirements: 14.1, 14.2, 14.7_

  - [x] 5.3 Implement API route handlers
    - Create `apps/api/src/routes/upload.ts` — `POST /api/v1/upload`: accept multipart/form-data, store in uploads bucket, return upload paths
    - Create `apps/api/src/routes/jobs.ts` — `POST /api/v1/jobs`: create Job in Firestore (state `queued`), publish Pub/Sub message, return job ID; `GET /api/v1/jobs/:jobId`: poll job status and partial results; `GET /api/v1/jobs/:jobId/assets`: retrieve completed asset bundle
    - Create `apps/api/src/routes/stream.ts` — `GET /api/v1/jobs/:jobId/stream`: SSE endpoint emitting job state changes and partial results
    - _Requirements: 14.1, 14.2, 14.7, 14.8, 13.1_

  - [x] 5.4 Create API service Dockerfile
    - Create `apps/api/Dockerfile` — multi-stage build, TypeScript compile, production image
    - _Requirements: 8.1_

  - [x]* 5.5 Write property tests for API service
    - **Property 8: Upload creates storage object and Job document** — For valid uploads ≤50MB, verify file stored in uploads bucket and Job created in Firestore with state `queued`
    - **Validates: Requirements 14.1**
    - **Property 9: Job creation publishes Pub/Sub message** — For each Job created, verify Pub/Sub message published with jobId, idempotencyKey, and correlationId in attributes
    - **Validates: Requirements 14.2**
    - **Property 14: Correlation ID propagated via Pub/Sub** — Verify correlationId in message attributes matches originating request
    - **Validates: Requirements 15.1**
    - **Property 15: Structured JSON logs with required fields** — Verify all log entries contain severity, message, timestamp; worker entries also contain correlationId and jobId
    - **Validates: Requirements 15.2, 15.3, 15.4**
    - **Property 16: Upload size limit enforced** — For uploads >50MB, verify rejection with 413 status, no file stored, no Job created
    - **Validates: Requirements 15.5**

  - [x]* 5.6 Write unit tests for API service
    - Test upload endpoint accepts valid files and rejects oversized/invalid files
    - Test job creation returns correct response shape
    - Test polling endpoint returns current job state
    - Test health check returns 200
    - Test error handler returns structured ErrorResponse
    - _Requirements: 14.1, 14.7, 15.5_

- [x] 6. Checkpoint — Ensure API service compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Worker Service
  - [x] 7.1 Create Worker service entry point and Pub/Sub message handler
    - Create `apps/worker/src/index.ts` — HTTP server for Pub/Sub push or pull-based message consumption, message parsing, idempotency check, pipeline orchestration
    - Create `apps/worker/src/services/firestore.ts` — read/update Job documents, record asset references, record fallback notices
    - Create `apps/worker/src/services/storage.ts` — read from uploads bucket, write to assets bucket, write to temp bucket
    - Create `apps/worker/src/middleware/logger.ts` — structured JSON logger with correlationId and jobId in every entry
    - _Requirements: 14.3, 15.2, 15.4, 15.7_

  - [x] 7.2 Implement pipeline stages
    - Create `apps/worker/src/pipeline/pipeline-runner.ts` — sequential stage executor with state transitions, timeout enforcement (10 min), error handling (catch → mark failed)
    - Create `apps/worker/src/pipeline/process-input.ts` — `ProcessInput` stage: analyze uploaded media via Vertex AI, produce Creative Brief, update Job state to `processing_input`
    - Create `apps/worker/src/pipeline/generate-copy.ts` — `GenerateCopy` stage: generate marketing copy from Creative Brief, update Job state to `generating_copy`
    - Create `apps/worker/src/pipeline/generate-images.ts` — `GenerateImages` stage: capability check, generate images or record fallback, update Job state to `generating_images`
    - Create `apps/worker/src/pipeline/generate-video.ts` — `GenerateVideo` stage: capability check, generate video or record fallback, update Job state to `generating_video`
    - Create `apps/worker/src/pipeline/compose-package.ts` — `ComposePackage` stage: assemble Asset Bundle, update Job state to `composing_package` then `completed`
    - All stages implement the `PipelineStage` interface from shared package
    - _Requirements: 14.3, 14.4, 14.5, 14.6, 15.6_

  - [x] 7.3 Implement capability detection and fallback logic
    - Create `apps/worker/src/capabilities/image-generation.ts` — implements `GenerationCapability` interface, checks Vertex AI image generation availability, handles access-denied gracefully
    - Create `apps/worker/src/capabilities/video-generation.ts` — implements `GenerationCapability` interface, checks Vertex AI video generation availability, handles access-denied gracefully
    - Create `apps/worker/src/capabilities/capability-registry.ts` — registry of all capabilities, used by pipeline stages to check availability before API calls
    - No mock data produced — fallback records `FallbackNotice` with capability name and reason
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 7.4 Create Worker service Dockerfile
    - Create `apps/worker/Dockerfile` — multi-stage build, TypeScript compile, production image
    - _Requirements: 8.2_

  - [x]* 7.5 Write property tests for Worker service
    - **Property 10: Task message receipt transitions Job to processing_input** — For valid messages referencing queued Jobs, verify state transitions to processing_input
    - **Validates: Requirements 14.3**
    - **Property 11: Job state transitions follow sequential order** — For completed Jobs, verify state sequence is a subsequence of the defined order, never reordered
    - **Validates: Requirements 14.4**
    - **Property 12: Unrecoverable error transitions Job to failed** — For pipeline errors, verify Job state becomes failed with non-empty errorMessage, no subsequent stages run
    - **Validates: Requirements 14.5**
    - **Property 13: Completed stages persist assets and update Job** — For successful stages, verify assets exist in GCS and Job.assets contains matching AssetReference entries
    - **Validates: Requirements 14.6**
    - **Property 17: Worker processing timeout enforced** — For Jobs exceeding 10 min processing, verify state becomes failed with timeout message
    - **Validates: Requirements 15.6**
    - **Property 18: Idempotent message processing** — For duplicate idempotencyKey messages, verify Job remains unchanged after second processing
    - **Validates: Requirements 15.7**
    - **Property 19: Capability check before AI API calls** — For image/video generation stages, verify isAvailable() called before generate()
    - **Validates: Requirements 18.1**
    - **Property 20: Unavailable capabilities produce fallback notices without mock data** — For unavailable capabilities, verify FallbackNotice recorded, no mock assets, pipeline continues
    - **Validates: Requirements 18.2, 18.3, 18.5**

  - [x]* 7.6 Write unit tests for Worker service
    - Test pipeline stage execution order
    - Test individual stage output validation
    - Test error handling for each failure mode (missing jobId, job not found, duplicate idempotency key)
    - Test capability detection returns correct availability status
    - Test fallback notice creation
    - _Requirements: 14.3, 14.4, 14.5, 18.1, 18.2, 18.3_

- [x] 8. Checkpoint — Ensure Worker service compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create deployment scripts and CI/CD configuration
  - [x] 9.1 Create bootstrap, build, deploy, and dev scripts
    - Create `scripts/bootstrap.sh` — check for gcloud, terraform, docker CLI tools; authenticate; set project; run terraform init + apply
    - Create `scripts/build.sh` — read AR path from terraform output; docker build API and Worker images; docker push to Artifact Registry
    - Create `scripts/deploy.sh` — read Cloud Run service names and image paths from terraform output; gcloud run deploy both services
    - Create `scripts/dev.sh` — load .env files; start web, api, worker dev servers concurrently
    - Make all scripts executable
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

  - [x] 9.2 Create Makefile and Cloud Build configuration
    - Create `Makefile` with targets: bootstrap, build, deploy, dev, tf-plan, tf-apply, tf-destroy
    - Create `cloudbuild.yaml` — CI/CD pipeline: install deps, run tests, build images, push to AR, deploy to Cloud Run
    - _Requirements: 11.5, 11.7_

- [x] 10. Create documentation
  - [x] 10.1 Create hackathon documentation files
    - Create `docs/architecture.md` — Mermaid diagram showing all services, data flows, GCP resources; service descriptions
    - Create `docs/deployment-proof.md` — instructions and evidence placeholders for live deployment demonstration
    - Create `docs/iam.md` — all service accounts, assigned roles, justification for each role
    - Create `docs/env.md` — all environment variables across all services, how to obtain each value, ADC authentication instructions
    - Create `docs/demo-flow.md` — end-to-end demo scenario from upload to final asset delivery
    - Create `docs/submission-checklist.md` — checkboxes for: Gemini model usage, Google GenAI SDK/ADK usage, Google Cloud service usage, multimodal I/O, real-time interaction, live deployment
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 12.2, 12.3_

  - [x] 10.2 Create Kiro build handoff document
    - Create `docs/kiro-build-handoff.md` — repo structure, provisioned GCP services and bucket names, environment variables, API contracts (referencing shared package types), frontend screen descriptions, backend endpoint specs, worker pipeline step details, known TODOs, operational commands
    - Reference shared package types for all API contracts
    - List every Cloud Run environment variable and its source (Terraform output, Secret Manager, or static config)
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 10.3 Create root README.md
    - Create `README.md` with sections: project overview, architecture summary (with Mermaid diagram), quickstart, deployment instructions, hackathon criteria compliance
    - _Requirements: 1.4, 16.7_

- [x] 11. Wire everything together and create Web App scaffold
  - [x] 11.1 Create Web App scaffold
    - Create `apps/web/src/index.ts` — minimal Vite + React (or plain TypeScript) entry point
    - Create `apps/web/Dockerfile`
    - Create `apps/web/package.json` with dependency on `packages/shared`
    - Ensure web app imports types from shared package
    - _Requirements: 19.1, 19.5_

  - [x] 11.2 Verify cross-service integration and shared package consumption
    - Ensure `apps/api` imports types from `packages/shared`
    - Ensure `apps/worker` imports types from `packages/shared`
    - Ensure `apps/web` imports types from `packages/shared`
    - Verify all three services reference shared types (Job, AssetReference, API request/response types)
    - _Requirements: 13.5, 19.5_

  - [x]* 11.3 Write property test for shared package consumption
    - **Property 22: Shared package exports consumed by multiple services** — Verify each export from packages/shared is imported by at least 2 of the 3 services
    - **Validates: Requirements 19.5**

- [x] 12. Final checkpoint — Ensure all code compiles, all tests pass, all documentation is complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major component
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript; Vitest + fast-check for testing
- This is a hackathon project — tasks are ordered for maximum incremental buildability
