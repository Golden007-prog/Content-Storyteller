# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - SSE Asset Signing Missing, Video Poll Silent Timeout, Local Worker Log Noise
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fixes when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all three defects exist
  - **Scoped PBT Approach**: Generate random AssetReference arrays with storagePath values and verify SSE state_change events include signedUrl on each asset; generate random poll iteration counts and verify structured log entries are emitted per iteration; simulate multiple forwardToLocalWorker failures and verify at most 1 log message
  - Test 1a (SSE Asset Signing): Simulate a state_change SSE event for a job with completed assets containing storagePaths — assert the emitted event payload has `signedUrl` on every asset (will FAIL — poll() in stream.ts copies raw currentJob.assets without calling generateSignedUrl)
  - Test 1b (Video Poll Logging): Mock Veo API to return pending status for N iterations then timeout — assert that N structured log entries are emitted with `{ pollCount, elapsedMs, operationStatus }` (will FAIL — pollForCompletion emits zero log messages)
  - Test 1c (Video Timeout Reason): Mock video generation to timeout — assert stage result includes reason `'video-generation-timeout'` and isTimeout flag (will FAIL — reason is generic 'timeout-or-no-video')
  - Test 1d (Local Worker Dedup): Call forwardToLocalWorker 3 times with a failing endpoint — assert at most 1 info-level log message is emitted (will FAIL — 3 console.error calls produced)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All four tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples: SSE events contain assets with storagePath but no signedUrl; video poll loop produces zero log entries during execution; local worker failure produces N error logs for N failures; video timeout returns generic reason instead of 'video-generation-timeout'
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Assets Endpoint Signing, Pipeline Stage Order, SSE Metadata Fields, Partial Result Rendering, Successful Video Flow, PubSub Delivery
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: `/api/v1/jobs/:jobId/assets` generates signed URLs for completed assets; SSE state_change events include outputIntent, steps, requestedOutputs, skippedOutputs, warnings metadata; partial_result events for partialCopy/partialStoryboard/partialVideoBrief/partialImageConcepts update frontend state; non-critical stage failures (images, video, GIF) record warnings and pipeline continues; successful Veo API results are base64 decoded → written to GCS → asset reference recorded; publishGenerationTask publishes to Pub/Sub regardless of local worker status
  - Property 2a (Assets Endpoint Preservation): For any completed job with N assets (N >= 1), verify GET /api/v1/jobs/:jobId/assets returns signed URLs for all completed assets — generate random asset arrays with varying storagePath patterns and assetTypes
  - Property 2b (SSE Metadata Preservation): For any state_change event, verify the payload continues to include outputIntent, steps, requestedOutputs, skippedOutputs, warnings fields — generate random job state transitions with varying metadata combinations
  - Property 2c (Partial Result Preservation): For any partial_result event with partialCopy, partialStoryboard, partialVideoBrief, or partialImageConcepts, verify the frontend handlePartialResult callback updates corresponding state identically
  - Property 2d (Pipeline Stage Order Preservation): For any pipeline execution with non-critical stage failures, verify warnings are recorded and pipeline continues to next stage — generate random stage success/failure combinations
  - Property 2e (Successful Video Flow Preservation): For any Veo API response with done=true and valid base64 video data, verify the base64 → GCS write → asset reference flow produces identical results
  - Property 2f (PubSub Delivery Preservation): For any job dispatch, verify publishGenerationTask publishes to Pub/Sub topic regardless of local worker availability
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS (this confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Fix for media delivery SSE asset signing, video generation hang, and local worker log noise

  - [x] 3.1 Implement SSE asset signing in apps/api/src/routes/stream.ts
    - Add `signAssetsForSSE()` async helper that takes `AssetReference[]` and returns `AssetReferenceWithUrl[]` by calling `generateSignedUrl()` for each asset
    - Handle errors gracefully: log warning, set `signedUrl: ''` on failure (matching pattern in jobs.ts)
    - Wire `signAssetsForSSE()` into `poll()` for `state_change` events: transform `currentJob.assets` before emitting
    - Wire `signAssetsForSSE()` into terminal `complete` and `failed` event payloads
    - _Bug_Condition: isBugCondition(input) where input.eventType IN ['state_change', 'complete', 'failed'] AND input.assets.length > 0 AND ANY asset.signedUrl IS UNDEFINED_
    - _Expected_Behavior: All SSE events with assets include signedUrl on every asset reference_
    - _Preservation: emitPartialResults() unchanged; SSE metadata fields (outputIntent, steps, requestedOutputs, skippedOutputs, warnings) unchanged_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Implement video generation polling instrumentation in apps/worker/src/capabilities/video-generation.ts
    - Add `pollCount` counter initialized to 0 and `startTime = Date.now()` at the beginning of `pollForCompletion()`
    - After each fetch response, log structured JSON: `{ pollCount, elapsedMs: Date.now() - startTime, operationName, status: 'pending'|'done'|'error'|'transient-error' }`
    - On timeout exit (while loop falls through), log structured warning with final `pollCount`, `elapsedMs`, and `operationName`
    - Return structured metadata on timeout instead of bare `null` so caller can set specific reason
    - Reduce timeout from 10 minutes to 5 minutes for faster failure surfacing
    - _Bug_Condition: isBugCondition(input) where input.pollState.isPolling AND input.pollState.logCount == 0_
    - _Expected_Behavior: N poll iterations produce N structured log entries; timeout returns metadata with reason 'video-generation-timeout'_
    - _Preservation: Successful Veo API results continue to be processed identically (base64 decode → GCS write → asset reference)_
    - _Requirements: 2.4, 2.6_

  - [x] 3.3 Implement video stage timeout surfacing in apps/worker/src/pipeline/generate-video.ts
    - When `videoCapability.generate()` returns `{ success: false }` with timeout, surface `'video-generation-timeout'` reason in fallback notice and log
    - Add `isTimeout` flag to stage result metadata for downstream consumers
    - _Bug_Condition: isBugCondition(input) where video generation times out and reason is generic_
    - _Expected_Behavior: Stage result includes specific 'video-generation-timeout' reason; isTimeout flag is set_
    - _Preservation: Non-critical stage failure handling unchanged — warnings recorded, pipeline continues_
    - _Requirements: 2.4, 2.5_

  - [x] 3.4 Implement local worker log deduplication in apps/api/src/services/pubsub.ts
    - Add module-level flag: `let localWorkerFailureLogged = false`
    - Replace `console.error` with structured `logger.info` on first failure only
    - On subsequent failures, suppress logging entirely (check flag)
    - _Bug_Condition: isBugCondition(input) where input.localWorkerCall.failureCount > 1 AND input.localWorkerCall.errorLogCount > 1_
    - _Expected_Behavior: At most 1 info-level log on first failure; subsequent failures silent_
    - _Preservation: Pub/Sub delivery continues to work regardless of local worker availability_
    - _Requirements: 2.7_

  - [x] 3.5 Implement frontend video status display in apps/web/src/components/OutputDashboard.tsx and apps/web/src/components/VideoBriefView.tsx
    - OutputDashboard: Accept optional `warnings` prop (JobWarning[]), detect video-related warnings, pass `videoStatus` to VideoBriefView
    - VideoBriefView: Accept optional `videoStatus` prop ('pending' | 'timeout' | 'failed' | 'unavailable'), render status-specific messages: "Video rendering timed out" for timeout, "Video generation failed" for failure
    - _Bug_Condition: isBugCondition(input) where video generation times out/fails AND frontend shows endless skeleton_
    - _Expected_Behavior: Frontend displays compact status message instead of endless skeleton_
    - _Preservation: Progressive rendering of partialCopy, partialStoryboard, partialVideoBrief, partialImageConcepts unchanged_
    - _Requirements: 2.5_

  - [x] 3.6 Implement frontend warnings tracking in apps/web/src/App.tsx
    - Import JobWarning type, add `warnings` state via useState
    - Extract `warnings` from SSE `state_change` events in `handleStateChange` callback
    - Pass `warnings` prop to OutputDashboard in both generating and results views
    - _Bug_Condition: isBugCondition(input) where SSE state_change contains warnings but App.tsx does not track them_
    - _Expected_Behavior: App.tsx extracts warnings from SSE events and passes to OutputDashboard_
    - _Preservation: All other SSE event handling (partialCopy, partialStoryboard, etc.) unchanged_
    - _Requirements: 2.5_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - SSE Asset Signing, Video Poll Instrumentation, Video Timeout Reason, Local Worker Dedup
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all three bug conditions
    - When this test passes, it confirms: SSE events have signedUrl on all assets, video poll emits structured logs, video timeout returns specific reason, local worker logs at most once
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Assets Endpoint Signing, Pipeline Stage Order, SSE Metadata Fields, Partial Result Rendering, Successful Video Flow, PubSub Delivery
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm assets endpoint unchanged, pipeline stage order unchanged, SSE metadata fields preserved, partial result rendering unchanged, successful video flow unchanged, PubSub delivery unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no regressions in existing test suites across apps/web, apps/api, apps/worker, and packages/shared
