# Bugfix Requirements Document

## Introduction

The Content Storyteller application has two confirmed bugs that prevent successful end-to-end content delivery, plus a minor noise issue:

1. **Image Asset Delivery Failure**: Generated image assets are invisible in the browser because the SSE streaming pipeline emits raw GCS storage paths without signed URLs. The frontend attempts to load these raw paths, receiving `AccessDenied` errors from GCS. The `generateSignedUrl()` function exists but is only used in the `/api/v1/jobs/:jobId/assets` endpoint, not in the SSE `partial_result` event flow.

2. **Video Generation Stage Hang**: The `GenerateVideo` stage starts but never completes when the Veo API polling in `VideoGenerationCapability.pollForCompletion()` returns `null` on timeout. The stage does not properly surface this timeout to the pipeline, causing the UI to hang indefinitely with no status feedback. Missing instrumentation makes it impossible to diagnose where the hang occurs.

3. **Local Worker Direct-Call Noise** (minor): `[LocalWorker] Failed to reach local worker: fetch failed` log messages appear repeatedly when the local worker is unavailable, even though Pub/Sub delivery works. This creates diagnostic noise.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the SSE stream emits `partial_result` events containing image asset data (e.g., `partialImageConcepts`) THEN the system returns raw GCS storage paths (e.g., `{jobId}/image-concepts/{uuid}.json`) without signed or proxy URLs, causing the frontend to be unable to display image assets

1.2 WHEN the frontend receives asset references from SSE `state_change` or `partial_result` events THEN the system provides only raw `storagePath` values that result in `AccessDenied` errors when the browser attempts anonymous GCS access

1.3 WHEN the `/api/v1/jobs/:jobId/assets` endpoint generates signed URLs for completed assets THEN the SSE streaming pipeline (`stream.ts`) does NOT apply the same signed URL generation, creating an inconsistency where assets are only accessible after job completion via the assets endpoint

1.4 WHEN the Veo API polling in `VideoGenerationCapability.pollForCompletion()` reaches its 10-minute timeout and returns `null` THEN the `GenerateVideo` stage records a fallback notice but the overall stage execution path does not emit sufficient logging to diagnose at which step the hang occurs

1.5 WHEN video generation times out or fails silently THEN the frontend UI shows an endless skeleton/loading state for the video section with no status message, leaving the user with no indication of what happened

1.6 WHEN the `GenerateVideo` stage is executing and the Veo API poll loop is running THEN the system emits no intermediate polling status logs (poll count, elapsed time, operation status), making it impossible to diagnose whether the hang is in API submission, polling, or post-processing

1.7 WHEN the local worker direct-call endpoint is unreachable THEN the system logs repeated `[LocalWorker] Failed to reach local worker: fetch failed` warnings on every job dispatch attempt, creating diagnostic noise even though Pub/Sub delivery succeeds

### Expected Behavior (Correct)

2.1 WHEN the SSE stream emits `partial_result` events containing asset references THEN the system SHALL generate signed URLs (in cloud) or proxy URLs (in local dev) for each asset before including them in the event payload, so the frontend can display assets immediately

2.2 WHEN the frontend receives asset references from any SSE event THEN the system SHALL provide only usable URLs (signed URLs or proxy URLs), never raw GCS storage paths that would cause `AccessDenied` errors

2.3 WHEN the SSE streaming pipeline emits asset data THEN the system SHALL apply the same `generateSignedUrl()` logic used by the `/api/v1/jobs/:jobId/assets` endpoint, ensuring consistent URL generation across all delivery paths

2.4 WHEN the Veo API polling reaches its timeout and returns `null` THEN the `GenerateVideo` stage SHALL log a structured warning with the operation name, elapsed time, and poll count, and SHALL return a clear `{ success: false }` result with reason `'video-generation-timeout'` so the pipeline can continue to the next stage

2.5 WHEN video generation times out or fails THEN the frontend SHALL display a compact status message (e.g., "Video rendering timed out" or "Video generation failed") instead of an endless skeleton, and the pipeline SHALL continue composing the package with available copy and image assets

2.6 WHEN the `GenerateVideo` stage is executing and the Veo API poll loop is running THEN the system SHALL log each poll attempt with poll count, elapsed time, and operation status (pending/done/error), providing full visibility into the polling lifecycle

2.7 WHEN the local worker direct-call endpoint is unreachable THEN the system SHALL log a single structured info-level message on first failure and suppress subsequent repeated warnings, falling back to Pub/Sub silently

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `/api/v1/jobs/:jobId/assets` endpoint is called for a completed job THEN the system SHALL CONTINUE TO generate signed URLs for all completed assets exactly as it does today

3.2 WHEN the pipeline executes non-critical stages (images, video, GIF) that fail THEN the system SHALL CONTINUE TO record warnings and continue to the next stage without failing the entire job

3.3 WHEN the pipeline executes critical stages (ProcessInput, GenerateCopy, ComposePackage) that fail THEN the system SHALL CONTINUE TO mark the job as failed and stop the pipeline

3.4 WHEN the Veo API returns a successful video result within the timeout period THEN the system SHALL CONTINUE TO process the base64-encoded video data, write it to GCS, and record the asset reference exactly as it does today

3.5 WHEN the SSE stream emits `state_change` events with job metadata (outputIntent, steps, requestedOutputs, skippedOutputs, warnings) THEN the system SHALL CONTINUE TO include all existing metadata fields in the event payload

3.6 WHEN the frontend receives `partial_result` events with `partialCopy`, `partialStoryboard`, `partialVideoBrief`, or `partialImageConcepts` THEN the system SHALL CONTINUE TO progressively render these sections in the OutputDashboard as they arrive

3.7 WHEN the local worker receives a job via Pub/Sub push THEN the system SHALL CONTINUE TO process the job through the full pipeline regardless of whether the direct-call endpoint is available

3.8 WHEN the `generateSignedUrl()` function fails in cloud environments THEN the system SHALL CONTINUE TO re-throw the error rather than silently falling back to unusable URLs

3.9 WHEN the asset proxy endpoint `/api/v1/assets/:path(*)` receives a request THEN the system SHALL CONTINUE TO stream the asset from GCS with correct content-type headers for local dev fallback
