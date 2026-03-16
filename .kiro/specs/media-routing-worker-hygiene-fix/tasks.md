# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - outputPreference Drop, SSE Metadata Ignored, Poll Response Incomplete, Worker Error Level
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fixes when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all four defects exist
  - **Scoped PBT Approach**: Generate random OutputPreference values (CopyOnly, CopyImage, CopyVideo, CopyGif, FullPackage) and verify they are forwarded through handleStartJob → startJob; generate random SSE state_change payloads with requestedOutputs/skippedOutputs arrays and verify App.tsx stores them in state and passes them to OutputDashboard; generate random job documents with requestedOutputs/skippedOutputs/outputIntent and verify GET /:jobId response includes all three fields; verify worker logs at warn (not error) for missing-job Pub/Sub messages
  - Test 1a: Render App, simulate form submission with OutputPreference.CopyImage via LandingPage.onStartJob — assert startJob is called with outputPreference as 5th argument (will FAIL — handleStartJob only destructures 4 params, silently drops the 5th)
  - Test 1b: Simulate SSE state_change event with `{ state: "generating_images", requestedOutputs: ["copy","image"], skippedOutputs: ["video"] }` — assert OutputDashboard receives requestedOutputs and skippedOutputs props (will FAIL — handleStateChange only reads data.state, ignores metadata fields)
  - Test 1c: Mock Firestore getJob to return a job with requestedOutputs, skippedOutputs, outputIntent — call GET /:jobId — assert response body includes all three fields (will FAIL — PollJobStatusResponse object literal omits them)
  - Test 1d: Send Pub/Sub POST with a non-existent jobId — assert jobLogger.warn is called (not jobLogger.error) (will FAIL — current code uses jobLogger.error)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All four tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples: handleStartJob(files, prompt, platform, tone, "copy_image") drops 5th arg; handleStateChange reads data.state but ignores data.requestedOutputs/data.skippedOutputs; PollJobStatusResponse omits requestedOutputs/skippedOutputs/outputIntent; jobLogger.error called instead of jobLogger.warn
  - _Requirements: 1.2, 1.4, 1.6, 1.1_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Auto Preference Resolution, Valid Job Processing, SSE partial_result Handling, OutputDashboard Backward Compatibility
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: resolveOutputIntent({ outputPreference: Auto, platform: InstagramReel, ... }) produces wantsVideo=true, wantsImage=true; resolveOutputIntent({ outputPreference: undefined, platform: LinkedInLaunchPost, ... }) produces wantsLinkedInPost=true, wantsImage=false; SSE partial_result events with partialCopy/partialStoryboard/partialVideoBrief/partialImageConcepts update corresponding React state; OutputDashboard renders content sections when given copyPackage/storyboard/videoBrief/imageConcepts without requestedOutputs/skippedOutputs
  - Property 2a (Auto Preference Preservation): For all Platform × Tone × promptText combinations with outputPreference=Auto or undefined, verify resolveOutputIntent produces identical OutputIntent before and after fix — generate random Platform, Tone, and prompt strings via property-based testing
  - Property 2b (SSE partial_result Preservation): For any SSE partial_result event with partialCopy, partialStoryboard, partialVideoBrief, partialImageConcepts, or creativeBrief fields, verify the existing handlePartialResult callback updates the corresponding state identically
  - Property 2c (OutputDashboard Backward Compatibility): For any combination of content props (copyPackage, storyboard, videoBrief, imageConcepts, gifAsset) WITHOUT requestedOutputs/skippedOutputs, verify OutputDashboard renders all sections with progressive reveal (backward compat — shouldShow returns true when both are undefined)
  - Property 2d (Valid Job Processing Preservation): For any Pub/Sub message referencing an existing Firestore job in queued state, verify the worker calls runPipeline with the correct PipelineContext (unchanged behavior)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS (this confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for media routing and worker hygiene defects

  - [x] 3.1 Implement the fix in apps/web/src/App.tsx
    - Add `outputPreference` as 5th parameter to `handleStartJob` callback: change signature from `(files, promptText, platform, tone)` to `(files, promptText, platform, tone, outputPreference?)`
    - Forward `outputPreference` to `startJob(files, promptText, platform, tone, outputPreference)`
    - Add React state: `const [requestedOutputs, setRequestedOutputs] = useState<string[]>([])` and `const [skippedOutputs, setSkippedOutputs] = useState<string[]>([])`
    - In `handleStateChange`: after `setCurrentState(data.state)`, extract `data.requestedOutputs` and `data.skippedOutputs` if present and call setters
    - In `handleComplete`: after setting state and creativeBrief, extract `data.requestedOutputs` and `data.skippedOutputs` if present and call setters
    - In `resetPartialState`: add `setRequestedOutputs([])` and `setSkippedOutputs([])`
    - In generating view `<OutputDashboard>`: add `requestedOutputs={requestedOutputs} skippedOutputs={skippedOutputs}` props
    - In results view `<OutputDashboard>`: add `requestedOutputs={requestedOutputs} skippedOutputs={skippedOutputs}` props
    - _Bug_Condition: isBugCondition(input) where input.type == "form_submit" AND input.outputPreference != undefined → handleStartJob_doesNotForward; input.type == "sse_event" AND data.requestedOutputs/skippedOutputs present → appState_doesNotStore_
    - _Expected_Behavior: handleStartJob forwards outputPreference to startJob; SSE callbacks extract and store requestedOutputs/skippedOutputs; OutputDashboard receives both props_
    - _Preservation: Auto preference continues to work; partial_result SSE handling unchanged; OutputDashboard backward compat when requestedOutputs/skippedOutputs are undefined_
    - _Requirements: 1.2, 1.4, 1.5, 2.2, 2.4, 2.5_

  - [x] 3.2 Implement the fix in apps/worker/src/index.ts
    - Change `jobLogger.error('Job not found in Firestore')` to `jobLogger.warn('Job not found in Firestore — acknowledging and discarding', { jobId })`
    - _Bug_Condition: isBugCondition(input) where input.type == "pubsub_message" AND NOT firestoreJobExists(input.jobId) → workerLogsAtErrorLevel_
    - _Expected_Behavior: Worker logs at WARN level with jobId included, then acknowledges with 204_
    - _Preservation: Valid Pub/Sub messages for existing jobs continue to trigger full pipeline_
    - _Requirements: 1.1, 2.1_

  - [x] 3.3 Implement the fix in packages/shared/src/types/api.ts
    - Add `requestedOutputs?: string[]`, `skippedOutputs?: string[]`, and `outputIntent?: OutputIntent` to the `PollJobStatusResponse` interface
    - _Bug_Condition: isBugCondition(input) where input.type == "poll_request" → pollResponse_omitsFields_
    - _Expected_Behavior: PollJobStatusResponse type includes all three optional fields_
    - _Preservation: Existing fields (jobId, state, assets, errorMessage, updatedAt, creativeBrief, platform, tone) unchanged_
    - _Requirements: 1.6, 2.6_

  - [x] 3.4 Implement the fix in apps/api/src/routes/jobs.ts
    - In GET `/:jobId` handler: add `requestedOutputs: job.requestedOutputs`, `skippedOutputs: job.skippedOutputs`, `outputIntent: job.outputIntent` to the response object
    - In POST `/` handler: add debug logging after resolving outputIntent: `logger.info('Output intent resolved', { outputPreference: validatedOutputPreference, outputIntent, requestedOutputs, correlationId: req.correlationId })`
    - _Bug_Condition: isBugCondition(input) where input.type == "poll_request" AND firestoreJob has requestedOutputs → pollResponse_omitsFields_
    - _Expected_Behavior: GET response includes requestedOutputs, skippedOutputs, outputIntent from Firestore job document_
    - _Preservation: All other response fields and error handling unchanged_
    - _Requirements: 1.6, 2.6_

  - [x] 3.5 Implement the fix in apps/worker/src/pipeline/pipeline-runner.ts
    - After reading the job's outputIntent (line after `const outputIntent = ...`), add: `log.info('Pipeline outputIntent resolved', { outputIntent })`
    - _Preservation: Pipeline execution logic completely unchanged — this is debug logging only_
    - _Requirements: 2.1_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - outputPreference Forwarding, SSE Metadata Extraction, Poll Response Completeness, Worker Log Level
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all four defects
    - When this test passes, it confirms: outputPreference is forwarded, SSE metadata is extracted, poll response is complete, worker logs at warn
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all four bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.4, 2.6_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Auto Preference Resolution, Valid Job Processing, SSE partial_result Handling, OutputDashboard Backward Compatibility
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm Auto preference resolution unchanged, partial_result handling unchanged, OutputDashboard backward compat maintained, valid job processing unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify no regressions in existing test suites across apps/web, apps/api, apps/worker, and packages/shared
