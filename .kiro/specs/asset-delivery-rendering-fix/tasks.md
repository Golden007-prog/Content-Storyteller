# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Metadata Assets Misclassified as Renderable & Video Timeout Swallowed
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the three interconnected bugs
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for reproducibility
  - Test A — Image concept misclassification: Call `GenerateImages.execute()` with a mock context and mock GenAI. Assert the image-concepts JSON asset is recorded with a type OTHER than `AssetType.Image` (e.g., `AssetType.ImageConcept`). On unfixed code, this will FAIL because it uses `AssetType.Image`.
  - Test B — VideoBrief misclassification: Call `GenerateVideo.execute()` with a mock context and mock GenAI. Assert the video-brief JSON asset is recorded with a type OTHER than `AssetType.Video` (e.g., `AssetType.VideoBriefMeta`). On unfixed code, this will FAIL because it uses `AssetType.Video`.
  - Test C — Video timeout returns success: Call `GenerateVideo.execute()` with a mock capability returning `{ success: false, metadata: { reason: 'timeout-or-no-video' } }`. Assert the stage returns `{ success: false }`. On unfixed code, this will FAIL because the stage returns `{ success: true }`.
  - Test D — GIF creative direction misclassification: Call `GenerateGif.execute()` with GIF capability unavailable. Assert creative direction JSON is recorded with a type OTHER than `AssetType.Gif` (e.g., `AssetType.GifCreativeDirection`). On unfixed code, this will FAIL because it uses `AssetType.Gif`.
  - Test E — GeneratingGif missing from timeline: Render `GenerationTimeline` with `currentState = JobState.GeneratingGif`. Assert a stage shows as active. On unfixed code, this will FAIL because `GeneratingGif` is not in `PIPELINE_STAGES`.
  - Test F — App.tsx missing warnings: Render App in results view with warnings in SSE state. Assert `OutputDashboard` receives `warnings` prop. On unfixed code, this will FAIL because warnings are not passed.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.10_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Pipeline Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
  - Observe: `GenerateImages.execute()` persists ImageConcept JSON to GCS and returns `{ success: true }` with the asset path
  - Observe: `GenerateVideo.execute()` persists Storyboard as `AssetType.Storyboard` and VideoBrief JSON to GCS, returns `{ success: true }` when Veo returns actual video
  - Observe: Successful Veo video generation writes MP4 files as `AssetType.Video` with storage path containing `/video/`
  - Observe: Capability unavailability records a fallback notice with `{ capability, reason, timestamp, stage }` structure
  - Observe: Pipeline runner non-critical stage failure adds a warning with `{ stage, message, timestamp, severity: 'warning' }` and continues
  - Observe: `OutputDashboard` renders skeleton placeholders when no content, shows `SkippedNote` for skipped outputs
  - Observe: `GenerationTimeline` shows completed/active/pending/skipped for existing 5 stages based on `STATE_ORDER` index comparison
  - **Write property-based tests capturing observed behavior**:
  - Property: For all pipeline contexts with successful GenAI responses, `GenerateImages.execute()` always persists an ImageConcept JSON array and returns `success: true`
  - Property: For all pipeline contexts with successful GenAI + successful Veo, `GenerateVideo.execute()` persists Storyboard as `AssetType.Storyboard` and returns `success: true` with MP4 assets
  - Property: For all capability unavailability scenarios, a fallback notice is recorded and the stage does not throw
  - Property: For all `GenerationTimeline` renders with states in `[ProcessingInput, GeneratingCopy, GeneratingImages, GeneratingVideo, ComposingPackage]`, exactly one stage shows as active and all prior stages show as completed
  - Property: For all `OutputDashboard` renders with `skippedOutputs` containing a type, a `SkippedNote` is rendered for that type
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix for asset delivery rendering bugs

  - [x] 3.1 Add new AssetType enum values
    - Add `ImageConcept = 'image_concept'` to `AssetType` enum in `packages/shared/src/types/job.ts`
    - Add `VideoBriefMeta = 'video_brief_meta'` to `AssetType` enum
    - Add `GifCreativeDirection = 'gif_creative_direction'` to `AssetType` enum
    - _Bug_Condition: isBugCondition(input) where metadata JSON is recorded with renderable AssetType_
    - _Expected_Behavior: Metadata assets use non-renderable types distinct from Image, Video, Gif_
    - _Preservation: Existing AssetType values (Copy, Image, Video, Storyboard, VoiceoverScript, Gif) remain unchanged_
    - _Requirements: 2.1, 2.4, 2.10_

  - [x] 3.2 Fix GenerateImages to use AssetType.ImageConcept for concept JSON
    - In `apps/worker/src/pipeline/generate-images.ts`, change `recordAssetReference` for image-concepts JSON from `AssetType.Image` to `AssetType.ImageConcept`
    - Add text-vs-binary detection: when `ImageGenerationCapability.generate()` returns data, check if it looks like base64 binary; if text, record a fallback notice instead of writing as PNG
    - _Bug_Condition: isBugCondition(input) where input.stage == 'GenerateImages' AND input.assetData.isConceptJSON AND input.assetData.assetType == 'image'_
    - _Expected_Behavior: Concept JSON recorded as AssetType.ImageConcept; text data not written as PNG_
    - _Preservation: ImageConcept JSON still persisted to GCS, still available for SSE delivery_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 3.3 Fix GenerateVideo to use AssetType.VideoBriefMeta and return failure on timeout
    - In `apps/worker/src/pipeline/generate-video.ts`, change `recordAssetReference` for video-brief JSON from `AssetType.Video` to `AssetType.VideoBriefMeta`
    - When video capability returns `success: false` or times out, return `{ success: false, error: reason }` instead of `{ success: true }`
    - Keep storyboard and video brief persistence (they are still valuable creative direction)
    - _Bug_Condition: isBugCondition(input) where input.stage == 'GenerateVideo' AND (videoBrief assetType == 'video' OR capabilityResult.success == false AND stageResult.success == true)_
    - _Expected_Behavior: VideoBrief recorded as AssetType.VideoBriefMeta; timeout returns success:false_
    - _Preservation: Storyboard still recorded as AssetType.Storyboard; successful Veo MP4 still recorded as AssetType.Video_
    - _Requirements: 2.4, 2.5, 3.3, 3.4, 3.5_

  - [x] 3.4 Fix GenerateGif to check for video asset and use AssetType.GifCreativeDirection
    - In `apps/worker/src/pipeline/generate-gif.ts`, at the start of `execute()`, check `context.workingData` for a completed video asset path
    - If no video asset exists, skip GIF rendering, record a fallback notice, and return `{ success: true, assets: [] }`
    - If a video asset exists, pass it to the GIF capability for video-to-GIF conversion
    - Change creative direction JSON persistence from `AssetType.Gif` to `AssetType.GifCreativeDirection`
    - _Bug_Condition: isBugCondition(input) where input.stage == 'GenerateGif' AND (NOT checksForExistingVideoAsset OR creativeDirection assetType == 'gif')_
    - _Expected_Behavior: GIF stage checks for video asset first; creative direction uses GifCreativeDirection type_
    - _Preservation: GIF creative direction still persisted to GCS when capability unavailable_
    - _Requirements: 2.8, 2.9, 2.10_

  - [x] 3.5 Repurpose GifGenerationCapability for video-to-GIF conversion
    - In `apps/worker/src/capabilities/gif-generation.ts`, change `generate()` to accept a video asset buffer/path and convert to GIF
    - Remove the direct Veo `predictLongRunning` call
    - If video-to-GIF conversion is not possible (no ffmpeg, etc.), return `{ success: false, reason: 'conversion-unavailable' }`
    - _Bug_Condition: isBugCondition(input) where GifGenerationCapability makes direct Veo API call_
    - _Expected_Behavior: Capability converts existing video to GIF instead of generating new video_
    - _Requirements: 2.8_

  - [x] 3.6 Update SSE stream asset type filters
    - In `apps/api/src/routes/stream.ts`, update `emitPartialResults()` image concept asset filtering to use `AssetType.ImageConcept` instead of `AssetType.Image` with path heuristics
    - Update video brief asset lookup to use `AssetType.VideoBriefMeta` or path-based lookup as appropriate
    - _Bug_Condition: SSE stream filters by AssetType.Image and finds JSON metadata_
    - _Expected_Behavior: SSE stream uses AssetType.ImageConcept for concept delivery_
    - _Preservation: SSE partial_result events still deliver image concepts and video briefs correctly_
    - _Requirements: 2.1, 2.2, 3.1, 3.3, 3.10_

  - [x] 3.7 Fix App.tsx to pass warnings and filter videoUrl
    - Pass `warnings` state to `<OutputDashboard>` in both generating and results views
    - Update `videoUrl` derivation to filter by storage path containing `/video/` to exclude video-brief JSON
    - _Bug_Condition: isBugCondition(input) where App.tsx warnings not passed OR videoUrl matches JSON_
    - _Expected_Behavior: OutputDashboard receives warnings; videoUrl only matches actual MP4 files_
    - _Preservation: All other OutputDashboard props unchanged_
    - _Requirements: 2.4, 2.6, 3.7_

  - [x] 3.8 Add GeneratingGif stage to GenerationTimeline
    - Add `{ key: JobState.GeneratingGif, label: 'Generating GIF' }` to `PIPELINE_STAGES` array between GeneratingVideo and ComposingPackage
    - Add `JobState.GeneratingGif` to `STATE_ORDER` array between GeneratingVideo and ComposingPackage
    - Add `[JobState.GeneratingGif]: 'generateGif'` to `STAGE_TO_STEP_KEY` mapping
    - _Bug_Condition: isBugCondition(input) where GeneratingGif not in PIPELINE_STAGES_
    - _Expected_Behavior: Timeline shows GIF generation progress_
    - _Preservation: Existing 5 stages still show correct completed/active/pending/skipped statuses_
    - _Requirements: 2.7, 3.8_

  - [x] 3.9 Handle missing/invalid gifAsset.url in GifPreview
    - In `apps/web/src/components/GifPreview.tsx`, add a guard: if `gifAsset.url` is falsy or appears to be JSON metadata, show a fallback message instead of rendering `<img>`
    - _Bug_Condition: isBugCondition(input) where gifAsset is JSON metadata rendered as image_
    - _Expected_Behavior: GifPreview shows fallback message for non-renderable assets_
    - _Requirements: 2.10_

  - [x] 3.10 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Metadata Assets Use Non-Renderable Types & Video Timeout Returns Failure
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.10_

  - [x] 3.11 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Pipeline Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
