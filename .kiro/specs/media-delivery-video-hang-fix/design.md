# Media Delivery & Video Hang Bugfix Design

## Overview

This bugfix addresses three related issues in the Content Storyteller media delivery pipeline:

1. **SSE Asset Delivery**: The SSE streaming endpoint (`stream.ts`) emits `state_change` events containing raw GCS `storagePath` values in the `assets` array. The frontend cannot load these paths directly (AccessDenied). The fix applies `generateSignedUrl()` to all asset references in SSE events before sending them to the client, matching the behavior already used by the `/api/v1/jobs/:jobId/assets` endpoint.

2. **Video Generation Hang**: The `VideoGenerationCapability.pollForCompletion()` loop runs silently for up to 10 minutes with no logging. When it times out and returns `null`, the `GenerateVideo` stage records a fallback notice but provides no diagnostic visibility. The fix adds per-poll logging (poll count, elapsed time, operation status) and surfaces a structured `video-generation-timeout` reason. The frontend is updated to show an explicit timeout/failure message instead of an endless skeleton.

3. **Local Worker Log Noise**: `forwardToLocalWorker()` in `pubsub.ts` logs `console.error` on every failure. The fix switches to a single info-level log on first failure and suppresses subsequent repeated messages.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each bug — (1) SSE events with raw storagePaths, (2) video poll timeout with no logging, (3) repeated local worker error logs
- **Property (P)**: The desired behavior — (1) SSE events contain signed/proxy URLs, (2) video polling is instrumented and timeout is surfaced, (3) local worker logs once on failure
- **Preservation**: Existing behaviors that must remain unchanged — assets endpoint signed URL generation, pipeline stage execution order, Pub/Sub delivery, progressive SSE rendering
- **`generateSignedUrl()`**: Function in `apps/api/src/services/storage.ts` that produces signed URLs (cloud) or proxy URLs (local dev) for GCS assets
- **`pollForCompletion()`**: Private method in `VideoGenerationCapability` that polls the Veo long-running operation endpoint
- **`forwardToLocalWorker()`**: Function in `apps/api/src/services/pubsub.ts` that sends a direct HTTP POST to the local worker service
- **`emitPartialResults()`**: Function in `apps/api/src/routes/stream.ts` that reads assets from GCS and sends `partial_result` SSE events
- **SSE `state_change`**: Server-Sent Event emitted on every job state transition, includes `assets`, `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, `warnings`

## Bug Details

### Bug Condition

The bugs manifest across three independent conditions:

**Bug 1 — SSE Asset Delivery**: When the SSE stream emits a `state_change` event, the `assets` array is copied directly from `currentJob.assets` which contains raw `storagePath` values (e.g., `{jobId}/images/{uuid}.png`). The frontend's `assets` state is only populated with signed URLs on job completion via `getAssets()`. During streaming, any asset references are unusable.

**Bug 2 — Video Hang**: When `pollForCompletion()` runs its polling loop (up to 40 iterations at 15s intervals over 10 minutes), it emits zero log messages. When it returns `null` (timeout), the `GenerateVideo` stage records a fallback notice but the pipeline has already consumed most of its 10-minute global timeout. The frontend shows an endless skeleton because no warning/status is surfaced via SSE.

**Bug 3 — Local Worker Noise**: `forwardToLocalWorker()` uses `console.error` for every failure. Since it's called fire-and-forget on every job dispatch, the error appears repeatedly when the local worker is down.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { eventType: string, assets: AssetReference[], pollState: PollState, localWorkerCall: boolean }
  OUTPUT: boolean

  // Bug 1: SSE event contains assets with raw storagePaths and no signedUrl
  IF input.eventType IN ['state_change', 'complete', 'failed']
     AND input.assets.length > 0
     AND ANY asset IN input.assets WHERE asset.signedUrl IS UNDEFINED
  THEN RETURN true

  // Bug 2: Video poll loop running with no per-iteration logging
  IF input.pollState.isPolling
     AND input.pollState.logCount == 0
  THEN RETURN true

  // Bug 3: Local worker failure logged at error level repeatedly
  IF input.localWorkerCall
     AND input.localWorkerCall.failureCount > 1
     AND input.localWorkerCall.errorLogCount > 1
  THEN RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **Bug 1 Example**: SSE emits `state_change` with `assets: [{ storagePath: "abc/images/123.png", assetType: "image", status: "completed" }]`. Frontend receives this and has no `signedUrl` to render. Expected: `assets: [{ ..., signedUrl: "https://storage.googleapis.com/..." }]`
- **Bug 1 Example (local dev)**: Same scenario but `signedUrl` should be `http://localhost:8080/api/v1/assets/abc%2Fimages%2F123.png`
- **Bug 2 Example**: Veo API poll runs 40 iterations over 10 minutes. Console shows zero poll-related log lines. Stage returns `{ success: false }` with no reason. Expected: Each poll logs `{ pollCount: N, elapsedMs: X, status: 'pending' }` and timeout returns `{ success: false, error: 'video-generation-timeout' }`
- **Bug 2 Example (frontend)**: Video section shows skeleton indefinitely after pipeline completes. Expected: Shows "Video rendering timed out" message
- **Bug 3 Example**: 5 jobs dispatched while local worker is down → 5 `console.error` lines. Expected: 1 info-level log on first failure, subsequent failures silent

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The `/api/v1/jobs/:jobId/assets` endpoint must continue to generate signed URLs for all completed assets exactly as today
- Non-critical pipeline stage failures (images, video, GIF) must continue to record warnings and allow the pipeline to proceed
- Critical pipeline stage failures (ProcessInput, GenerateCopy, ComposePackage) must continue to mark the job as failed
- Successful Veo API video results must continue to be processed (base64 decode → GCS write → asset reference) identically
- SSE `state_change` events must continue to include all metadata fields: `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, `warnings`
- Frontend progressive rendering of `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts` must continue unchanged
- Pub/Sub job delivery must continue to work regardless of local worker availability
- `generateSignedUrl()` must continue to re-throw errors in cloud environments (not silently swallow)
- The asset proxy endpoint `/api/v1/assets/:path(*)` must continue to stream files with correct content-type headers

**Scope:**
All inputs that do NOT involve (1) SSE event asset serialization, (2) video poll loop execution, or (3) local worker direct-call failure handling should be completely unaffected by this fix. This includes:
- REST API endpoints (job creation, polling, upload)
- Pipeline stage execution logic (ProcessInput, GenerateCopy, GenerateImages, ComposePackage)
- Frontend form submission, platform/tone selection, output preference handling
- Live Agent Mode and Trend Analyzer features
- GCS read/write operations in the worker

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing URL Signing in SSE Path**: The `poll()` function in `stream.ts` (line ~290) directly serializes `currentJob.assets` into the `state_change` event without transforming `storagePath` values into signed URLs. The `/api/v1/jobs/:jobId/assets` endpoint in `jobs.ts` does call `generateSignedUrl()` via `Promise.all(assets.map(...))`, but this logic was never replicated in the SSE path. The `emitPartialResults()` function reads asset data from GCS (the JSON content) but does not sign the asset references themselves.

2. **Silent Polling Loop**: `pollForCompletion()` in `video-generation.ts` has a `while (Date.now() < deadline)` loop that calls `fetch` and `sleep` but never logs the iteration count, elapsed time, or response status. When the loop exits via timeout (falling through the while condition), it returns `null` with no structured metadata. The `GenerateVideo` stage handles `null` via the `if (!videoData)` path which records a fallback notice, but the notice reason is generic (`'timeout-or-no-video'`) and no SSE warning is emitted for the frontend.

3. **Unconditional console.error**: `forwardToLocalWorker()` catches fetch errors and calls `console.error` unconditionally. There is no deduplication, rate limiting, or level downgrade. Since `publishGenerationTask()` calls this fire-and-forget on every job in non-cloud mode, the error repeats for every dispatch.

4. **Frontend Has No Video Status Path**: `VideoBriefView` shows either a `VideoPlayer` (if `videoUrl` exists) or a static "Video generation not available" fallback. There is no intermediate state for "timed out" or "failed" — the component has no access to warnings from the SSE stream. `OutputDashboard` shows a `SkeletonSection` while waiting for `videoBrief` data, but once `videoBrief` arrives (the JSON brief, not the actual video), it renders `VideoBriefView` with no `videoUrl`, showing the generic fallback.

## Correctness Properties

Property 1: Bug Condition - SSE Asset References Include Signed URLs

_For any_ SSE `state_change`, `complete`, or `failed` event where the job has one or more completed asset references, the event payload's `assets` array SHALL contain a `signedUrl` field on every asset, and no raw `storagePath` value shall be exposed without an accompanying signed URL.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Video Poll Loop Instrumentation

_For any_ execution of `pollForCompletion()` that performs N poll iterations (N >= 1), the function SHALL emit N structured log entries each containing `{ pollCount, elapsedMs, operationStatus }`, and if the loop exits via timeout, the function SHALL return metadata including reason `'video-generation-timeout'` with the final poll count and elapsed time.

**Validates: Requirements 2.4, 2.6**

Property 3: Bug Condition - Local Worker Single-Log Deduplication

_For any_ sequence of K consecutive `forwardToLocalWorker()` failures (K >= 1), the system SHALL emit at most 1 log message at info level on the first failure, and SHALL suppress all subsequent log messages for the same error condition.

**Validates: Requirements 2.7**

Property 4: Preservation - Existing Asset Endpoint and Pipeline Behavior

_For any_ input where the bug conditions do NOT hold (successful video generation, REST API asset retrieval, pipeline stage execution for non-SSE paths), the fixed code SHALL produce exactly the same behavior as the original code, preserving signed URL generation in the assets endpoint, pipeline stage ordering, Pub/Sub delivery, and progressive SSE rendering of partial results.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/api/src/routes/stream.ts`

**Function**: `poll()` (SSE polling loop)

**Specific Changes**:
1. **Add `signAssetsForSSE()` helper**: Create an async function that takes an `AssetReference[]` and returns `AssetReferenceWithUrl[]` by calling `generateSignedUrl()` for each asset. Handle errors gracefully (log warning, set `signedUrl: ''` on failure — matching the pattern in `jobs.ts`).
2. **Transform assets in `state_change` events**: Before emitting `state_change`, call `signAssetsForSSE()` on `currentJob.assets` and include the result in the event payload.
3. **Transform assets in terminal events**: Apply the same transformation to `complete` and `failed` event payloads.

---

**File**: `apps/worker/src/capabilities/video-generation.ts`

**Function**: `pollForCompletion()`

**Specific Changes**:
1. **Add poll counter and start time**: Track `pollCount` and `startTime` at the beginning of the method.
2. **Log each poll iteration**: After each fetch response, log `{ pollCount, elapsedMs, operationName, status: 'pending'|'done'|'error'|'transient-error' }`.
3. **Log on timeout exit**: When the while loop exits without returning, log a structured warning with final `pollCount`, `elapsedMs`, and `operationName`.
4. **Return structured metadata on timeout**: Instead of bare `null`, return metadata that the caller can use to set a specific reason.

---

**File**: `apps/worker/src/pipeline/generate-video.ts`

**Function**: `GenerateVideo.execute()`

**Specific Changes**:
1. **Surface timeout reason**: When `videoCapability.generate()` returns `{ success: false }` with reason `'timeout-or-no-video'`, use the more specific `'video-generation-timeout'` reason in the fallback notice and log.
2. **Add stage-level timing**: Log elapsed time for the video generation attempt.

---

**File**: `apps/api/src/services/pubsub.ts`

**Function**: `forwardToLocalWorker()`

**Specific Changes**:
1. **Add module-level flag**: `let localWorkerFailureLogged = false;`
2. **Log once on first failure**: On first failure, log at info level with structured message. Set flag to `true`.
3. **Suppress subsequent failures**: On subsequent failures, skip logging entirely.
4. **Replace `console.error` with structured logger**: Use the existing `logger` from middleware instead of `console.error`.

---

**File**: `apps/web/src/components/OutputDashboard.tsx`

**Specific Changes**:
1. **Accept `warnings` prop**: Add optional `warnings` array to `OutputDashboardProps`.
2. **Detect video timeout/failure**: Check if warnings contain a video-related warning and pass status info to `VideoBriefView`.

---

**File**: `apps/web/src/components/VideoBriefView.tsx`

**Specific Changes**:
1. **Accept `videoStatus` prop**: Add optional prop for `'pending' | 'timeout' | 'failed' | 'unavailable'`.
2. **Render status-specific messages**: Show "Video rendering timed out" for timeout, "Video generation failed" for failure, instead of the generic fallback.

---

**File**: `apps/web/src/App.tsx`

**Specific Changes**:
1. **Track warnings from SSE**: Extract `warnings` from `state_change` events and pass to `OutputDashboard`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate SSE event emission, video polling, and local worker forwarding on the UNFIXED code to observe the defective behavior.

**Test Cases**:
1. **SSE Asset Signing Test**: Simulate a `state_change` event for a job with completed assets. Assert that the emitted event contains `signedUrl` on each asset. (Will fail on unfixed code — assets have no `signedUrl`)
2. **Video Poll Logging Test**: Mock the Veo API to return pending status for several iterations then timeout. Assert that log output contains per-poll entries. (Will fail on unfixed code — no logs emitted)
3. **Video Timeout Reason Test**: Mock video generation to timeout. Assert that the stage result includes reason `'video-generation-timeout'`. (Will fail on unfixed code — reason is generic)
4. **Local Worker Log Dedup Test**: Call `forwardToLocalWorker()` 3 times with a failing endpoint. Assert that at most 1 log message is emitted. (Will fail on unfixed code — 3 console.error calls)

**Expected Counterexamples**:
- SSE events contain `assets` with `storagePath` but no `signedUrl`
- Video poll loop produces zero log entries during 10-minute execution
- Local worker failure produces N error logs for N failures

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

Specifically:
- For any job with N assets (N >= 1), the SSE `state_change` event SHALL include `signedUrl` on all N assets
- For any video poll sequence of K iterations, K structured log entries SHALL be emitted
- For any sequence of M local worker failures, at most 1 log message SHALL be emitted

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug-condition inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Assets Endpoint Preservation**: Verify that `/api/v1/jobs/:jobId/assets` continues to generate signed URLs for completed jobs identically to before
2. **SSE Metadata Preservation**: Verify that `state_change` events continue to include `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, `warnings` fields
3. **Partial Result Preservation**: Verify that `partial_result` events for `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts` continue to be emitted on correct state transitions
4. **Pipeline Stage Order Preservation**: Verify that non-critical stage failures still produce warnings and allow pipeline continuation
5. **Successful Video Flow Preservation**: Verify that when Veo API returns a successful result, the base64 → GCS → asset reference flow is unchanged
6. **Pub/Sub Delivery Preservation**: Verify that `publishGenerationTask()` still publishes to Pub/Sub regardless of local worker status

### Unit Tests

- Test `signAssetsForSSE()` with various asset arrays (empty, single, multiple, mixed status)
- Test `pollForCompletion()` logging output with mocked fetch responses
- Test `forwardToLocalWorker()` log deduplication across multiple calls
- Test `VideoBriefView` rendering for each video status variant (pending, timeout, failed, unavailable, success)
- Test `OutputDashboard` warning propagation to child components

### Property-Based Tests

- Generate random `AssetReference[]` arrays and verify all SSE-emitted assets have `signedUrl` fields
- Generate random poll iteration counts and verify log entry count matches poll count
- Generate random sequences of local worker success/failure calls and verify at most 1 failure log
- Generate random job states and verify SSE metadata fields are always present (preservation)
- Generate random pipeline configurations and verify stage execution order is unchanged (preservation)

### Integration Tests

- Test full SSE stream for a job lifecycle: queued → processing → generating → completed, verify all `state_change` events have signed asset URLs
- Test video generation timeout scenario end-to-end: submit job → video stage times out → pipeline completes with warning → frontend shows timeout message
- Test local worker unavailable scenario: dispatch multiple jobs → verify single log message → verify all jobs still process via Pub/Sub
