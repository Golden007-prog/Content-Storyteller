# Media Routing & Worker Hygiene Bugfix Design

## Overview

Four interconnected defects prevent the Content Storyteller pipeline from delivering media outputs end-to-end. The worker logs spurious errors for stale/test Pub/Sub messages, `App.tsx` silently drops the user's `outputPreference` before it reaches the API, SSE state events carrying `requestedOutputs`/`skippedOutputs` are ignored by the frontend, and the polling endpoint omits those same fields from its response. The fix targets each break point with minimal, surgical changes across six files.

## Glossary

- **Bug_Condition (C)**: The set of inputs/states that trigger one of the four defects — a missing-job Pub/Sub message logged at ERROR, an `outputPreference` argument silently dropped, SSE metadata fields ignored, or poll response fields omitted.
- **Property (P)**: The desired correct behavior — warn-level logging for missing jobs, full `outputPreference` forwarding, SSE metadata extraction into React state, and complete poll responses.
- **Preservation**: Existing behaviors that must remain unchanged — valid job processing, Auto preference resolution, pipeline stage skipping, progressive reveal rendering, partial_result SSE handling, and export/download functionality.
- **handleStartJob**: The callback in `apps/web/src/App.tsx` that bridges `LandingPage.onStartJob` to `useJob.startJob`. Currently accepts 4 parameters; should accept 5.
- **OutputDashboard**: The component in `apps/web/src/components/OutputDashboard.tsx` that already accepts `requestedOutputs` and `skippedOutputs` props but never receives them from `App.tsx`.
- **PollJobStatusResponse**: The TypeScript interface in `packages/shared/src/types/api.ts` defining the shape of `GET /api/v1/jobs/:jobId` responses.

## Bug Details

### Bug Condition

The bug manifests across four distinct code paths that together prevent media generation from working end-to-end. The worker misclassifies expected missing-job messages as errors, the frontend drops the user's output preference, SSE metadata is ignored, and the polling fallback omits critical fields.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type AppInteraction
  OUTPUT: boolean

  // Defect 1: Worker error-logs missing jobs
  IF input.type == "pubsub_message" AND NOT firestoreJobExists(input.jobId)
    RETURN workerLogsAtErrorLevel(input.jobId)

  // Defect 2: outputPreference dropped in App.tsx
  IF input.type == "form_submit" AND input.outputPreference != undefined
    RETURN handleStartJob_doesNotForward(input.outputPreference)

  // Defect 3: SSE metadata ignored
  IF input.type == "sse_event" AND input.eventName IN ["state_change", "complete"]
    AND (input.data.requestedOutputs != undefined OR input.data.skippedOutputs != undefined)
    RETURN appState_doesNotStore(input.data.requestedOutputs, input.data.skippedOutputs)

  // Defect 4: Poll response missing fields
  IF input.type == "poll_request" AND firestoreJobExists(input.jobId)
    AND firestoreJob(input.jobId).requestedOutputs != undefined
    RETURN pollResponse_omitsFields(input.jobId)

  RETURN false
END FUNCTION
```

### Examples

- **Defect 1**: Worker receives Pub/Sub message with `jobId: "mock-doc-1"`. Job does not exist in Firestore. Worker logs `jobLogger.error('Job not found in Firestore')` and acks. Expected: `jobLogger.warn(...)` instead.
- **Defect 2**: User selects `OutputPreference.CopyImage` and submits. `LandingPage` calls `onStartJob(files, prompt, platform, tone, "copy_image")`. `handleStartJob` in App.tsx only destructures 4 params — the 5th is silently ignored. `startJob` is called without `outputPreference`, API receives `undefined`, defaults to `Auto`, and LinkedIn/X platforms produce `wantsImage=false`.
- **Defect 3**: SSE emits `state_change` with `{ state: "generating_images", requestedOutputs: ["copy","image"], skippedOutputs: ["video"] }`. `handleStateChange` only reads `data.state` — `requestedOutputs` and `skippedOutputs` are discarded. `OutputDashboard` never receives them, shows infinite skeleton for video.
- **Defect 4**: `GET /api/v1/jobs/abc123` returns `{ jobId, state, assets, ... }` but omits `requestedOutputs`, `skippedOutputs`, `outputIntent` even though the Firestore document has them.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Valid Pub/Sub messages referencing existing Firestore jobs must continue to trigger the full pipeline with correct state transitions and asset generation.
- `OutputPreference.Auto` (the default) must continue to resolve output intent using the existing precedence chain: platform defaults → prompt keyword scanning.
- Pipeline runner must continue to skip stages when `OutputIntent` flags are false, recording them in `skippedOutputs`.
- `OutputDashboard` must continue to render content data (copyPackage, storyboard, videoBrief, imageConcepts, gifAsset) with progressive reveal animations when those props are provided.
- SSE `partial_result` events must continue to update `copyPackage`, `storyboard`, `videoBrief`, `imageConcepts`, and `creativeBrief` state.
- `ExportPanel` and asset download (signed URLs, ZIP bundle) must continue to work as before.

**Scope:**
All inputs that do NOT involve the four defect conditions should be completely unaffected by this fix. This includes:
- Valid job processing through the worker pipeline
- Auto output preference resolution
- Mouse/keyboard interactions unrelated to form submission
- SSE `partial_result` and `failed` event handling
- Asset retrieval and bundle download endpoints

## Hypothesized Root Cause

Based on code analysis, the root causes are confirmed:

1. **Worker log level misclassification** (`apps/worker/src/index.ts` line ~97): `jobLogger.error('Job not found in Firestore')` uses ERROR level for an expected condition (stale/test messages). Should be WARN with the jobId included for traceability.

2. **handleStartJob parameter omission** (`apps/web/src/App.tsx` line ~100): The callback signature is `async (files, promptText, platform, tone) => { ... }` — it does not accept `outputPreference` as a 5th parameter. `LandingPage` passes 5 arguments but the 5th is silently ignored by JavaScript. The call to `startJob(files, promptText, platform, tone)` also omits it.

3. **SSE callback field extraction gaps** (`apps/web/src/App.tsx`):
   - `handleStateChange` only reads `data.state` — ignores `requestedOutputs`, `skippedOutputs`.
   - `handleComplete` only reads `data.state` and `data.creativeBrief` — ignores `requestedOutputs`, `skippedOutputs`.
   - No React state variables exist for `requestedOutputs` or `skippedOutputs`.
   - `OutputDashboard` is rendered without those props in both generating and results views.

4. **PollJobStatusResponse incomplete** (`packages/shared/src/types/api.ts` + `apps/api/src/routes/jobs.ts`):
   - The `PollJobStatusResponse` interface lacks `requestedOutputs`, `skippedOutputs`, and `outputIntent` fields.
   - The GET `/:jobId` handler constructs the response object without those fields even though the Job document contains them.

## Correctness Properties

Property 1: Bug Condition - outputPreference Forwarding

_For any_ form submission where the user selects an `outputPreference` value (Auto, CopyOnly, CopyImage, CopyVideo, CopyGif, FullPackage), the fixed `handleStartJob` callback SHALL forward that value through to `useJob.startJob`, which passes it to the API's `createJob` endpoint, so the output intent resolver receives the user's explicit selection.

**Validates: Requirements 2.2, 2.3**

Property 2: Bug Condition - SSE Metadata Extraction

_For any_ SSE `state_change` or `complete` event containing `requestedOutputs` and/or `skippedOutputs` fields, the fixed App.tsx callbacks SHALL extract those fields and store them in React state, and SHALL pass them as props to `OutputDashboard` in both generating and results views.

**Validates: Requirements 2.4, 2.5**

Property 3: Bug Condition - Poll Response Completeness

_For any_ `GET /api/v1/jobs/:jobId` request where the Firestore Job document contains `requestedOutputs`, `skippedOutputs`, and `outputIntent`, the fixed response SHALL include all three fields.

**Validates: Requirements 2.6**

Property 4: Bug Condition - Worker Log Level

_For any_ Pub/Sub message where the referenced jobId does not exist in Firestore, the fixed worker SHALL log at WARN level (not ERROR) and acknowledge the message.

**Validates: Requirements 2.1**

Property 5: Preservation - Auto Preference Resolution

_For any_ job submission where `outputPreference` is `Auto` or `undefined`, the fixed code SHALL produce the same `OutputIntent` as the original code, preserving the existing platform-defaults → prompt-keyword-scanning precedence chain.

**Validates: Requirements 3.2, 3.3**

Property 6: Preservation - Valid Job Processing

_For any_ Pub/Sub message referencing an existing Firestore job in `queued` state, the fixed worker SHALL process it through the full pipeline identically to the original code, preserving all state transitions and asset generation.

**Validates: Requirements 3.1, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File 1**: `apps/web/src/App.tsx`

**Function**: `handleStartJob`, `handleStateChange`, `handleComplete`, `resetPartialState`, and JSX rendering

**Specific Changes**:
1. **Add outputPreference parameter to handleStartJob**: Change the callback signature from `(files, promptText, platform, tone)` to `(files, promptText, platform, tone, outputPreference?)` and forward it to `startJob(files, promptText, platform, tone, outputPreference)`.
2. **Add React state for requestedOutputs and skippedOutputs**: Add `const [requestedOutputs, setRequestedOutputs] = React.useState<string[]>([])` and `const [skippedOutputs, setSkippedOutputs] = React.useState<string[]>([])`.
3. **Extract SSE metadata in handleStateChange**: After setting `currentState`, also extract `data.requestedOutputs` and `data.skippedOutputs` if present.
4. **Extract SSE metadata in handleComplete**: After setting `currentState` and `creativeBrief`, also extract `data.requestedOutputs` and `data.skippedOutputs` if present.
5. **Reset new state in resetPartialState**: Add `setRequestedOutputs([])` and `setSkippedOutputs([])`.
6. **Pass props to OutputDashboard**: In both generating and results views, add `requestedOutputs={requestedOutputs}` and `skippedOutputs={skippedOutputs}` props.

**File 2**: `apps/worker/src/index.ts`

**Function**: Pub/Sub POST handler, job-not-found branch

**Specific Changes**:
1. **Downgrade log level**: Change `jobLogger.error('Job not found in Firestore')` to `jobLogger.warn('Job not found in Firestore — acknowledging and discarding', { jobId })`.

**File 3**: `packages/shared/src/types/api.ts`

**Interface**: `PollJobStatusResponse`

**Specific Changes**:
1. **Add missing fields**: Add `requestedOutputs?: string[]`, `skippedOutputs?: string[]`, and `outputIntent?: OutputIntent` to the interface.

**File 4**: `apps/api/src/routes/jobs.ts`

**Function**: GET `/:jobId` handler

**Specific Changes**:
1. **Include new fields in response**: Add `requestedOutputs: job.requestedOutputs`, `skippedOutputs: job.skippedOutputs`, and `outputIntent: job.outputIntent` to the response object.

**File 5**: `apps/api/src/routes/jobs.ts` (POST handler)

**Specific Changes**:
1. **Add structured logging**: After resolving outputIntent, log the resolved intent and outputPreference for debugging: `logger.info('Output intent resolved', { outputPreference: validatedOutputPreference, outputIntent, requestedOutputs })`.

**File 6**: `apps/worker/src/pipeline/pipeline-runner.ts`

**Function**: `runPipeline`

**Specific Changes**:
1. **Add structured logging at pipeline start**: After reading the job's outputIntent, log it for debugging: `log.info('Pipeline outputIntent resolved', { outputIntent })`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise each defect path on the UNFIXED code to observe failures and confirm root causes.

**Test Cases**:
1. **outputPreference Drop Test**: Render App, simulate form submission with `OutputPreference.CopyImage`, assert that `startJob` is called with the outputPreference argument (will fail on unfixed code — 5th arg is dropped).
2. **SSE Metadata Ignored Test**: Simulate an SSE `state_change` event with `requestedOutputs: ["copy","image"]` and `skippedOutputs: ["video"]`, assert that `OutputDashboard` receives those props (will fail on unfixed code — fields are ignored).
3. **Poll Response Missing Fields Test**: Call `GET /api/v1/jobs/:jobId` for a job with `requestedOutputs` in Firestore, assert response includes `requestedOutputs` (will fail on unfixed code — field is omitted).
4. **Worker Error Level Test**: Send a Pub/Sub message with a non-existent jobId, assert the log call uses `warn` not `error` (will fail on unfixed code).

**Expected Counterexamples**:
- `handleStartJob` is called with 5 arguments but only destructures 4 — the 5th is silently dropped
- `handleStateChange` reads `data.state` but ignores `data.requestedOutputs` and `data.skippedOutputs`
- `PollJobStatusResponse` object literal does not include `requestedOutputs`, `skippedOutputs`, or `outputIntent`
- `jobLogger.error` is called instead of `jobLogger.warn` for missing jobs

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (all OutputPreference values, all Platform/Tone combinations)
- It catches edge cases that manual unit tests might miss (e.g., undefined vs Auto preference)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for Auto preference resolution and valid job processing, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Auto Preference Preservation**: For any Platform × Tone × prompt combination with `OutputPreference.Auto`, verify the resolved `OutputIntent` is identical before and after the fix.
2. **Valid Job Processing Preservation**: For any valid Pub/Sub message referencing an existing job, verify the worker processes it identically (same pipeline stages, same state transitions).
3. **SSE partial_result Preservation**: For any SSE `partial_result` event, verify the existing state update logic (copyPackage, storyboard, etc.) continues to work identically.
4. **OutputDashboard Rendering Preservation**: For any combination of content props (copyPackage, storyboard, etc.) without requestedOutputs/skippedOutputs, verify the dashboard renders identically (backward compatibility).

### Unit Tests

- Test `handleStartJob` forwards all 5 parameters including `outputPreference`
- Test `handleStateChange` extracts `requestedOutputs` and `skippedOutputs` from SSE data
- Test `handleComplete` extracts `requestedOutputs` and `skippedOutputs` from SSE data
- Test `PollJobStatusResponse` includes `requestedOutputs`, `skippedOutputs`, `outputIntent`
- Test worker logs at WARN level for missing Firestore jobs
- Test `OutputDashboard` receives and uses `requestedOutputs`/`skippedOutputs` props from App.tsx

### Property-Based Tests

- Generate random `OutputPreference` values and verify they are forwarded through `handleStartJob` → `startJob` → `createJob`
- Generate random SSE event payloads with varying combinations of `requestedOutputs`/`skippedOutputs` and verify App.tsx state is updated correctly
- Generate random `Platform × Tone × OutputPreference.Auto` combinations and verify `resolveOutputIntent` produces identical results before and after the fix (preservation)
- Generate random job documents with/without `requestedOutputs` fields and verify the poll endpoint includes them when present

### Integration Tests

- Test full form submission flow: select CopyImage preference → submit → verify API receives `outputPreference: "copy_image"` → verify `OutputIntent.wantsImage === true`
- Test SSE flow: start job → receive state_change with requestedOutputs → verify OutputDashboard shows correct skeleton/skipped states
- Test polling fallback: start job → poll status → verify response includes requestedOutputs and skippedOutputs
- Test worker end-to-end: send Pub/Sub message for missing job → verify WARN log and 204 ack
