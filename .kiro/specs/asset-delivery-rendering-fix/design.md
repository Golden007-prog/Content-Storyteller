# Asset Delivery & Rendering Fix — Bugfix Design

## Overview

Three interconnected bugs prevent generated media from rendering correctly in the Content Storyteller frontend. JSON metadata files (image concepts, video briefs, GIF creative direction) are recorded with the same `AssetType` as their renderable counterparts, causing the SSE stream and frontend to treat JSON as displayable media. Video generation timeouts are silently swallowed as successes, and GIF generation makes invalid direct Veo API calls instead of converting from an existing video asset. The fix introduces distinct non-renderable asset types, corrects timeout propagation, and rewires GIF generation to use completed video assets.

## Glossary

- **Bug_Condition (C)**: The set of inputs/states where metadata JSON is misclassified as renderable media, video timeout is reported as success, or GIF generation makes a direct Veo call
- **Property (P)**: Metadata JSON uses non-renderable asset types, video timeout returns `success: false`, GIF generation converts from existing video
- **Preservation**: All existing behaviors for successful image/video/GIF generation, SSE delivery, fallback notices, pipeline runner non-critical handling, and OutputDashboard rendering must remain unchanged
- **AssetType enum** (`packages/shared/src/types/job.ts`): Discriminator used throughout the pipeline and frontend to classify persisted assets
- **GenerateImages** (`apps/worker/src/pipeline/generate-images.ts`): Pipeline stage that generates image concepts and optionally renders images
- **GenerateVideo** (`apps/worker/src/pipeline/generate-video.ts`): Pipeline stage that generates storyboard/video brief and optionally renders video via Veo
- **GenerateGif** (`apps/worker/src/pipeline/generate-gif.ts`): Pipeline stage that generates GIF from video or persists creative direction
- **GifGenerationCapability** (`apps/worker/src/capabilities/gif-generation.ts`): Capability that currently makes direct Veo API calls for GIF
- **OutputDashboard** (`apps/web/src/components/OutputDashboard.tsx`): Frontend component that renders all generated outputs
- **GenerationTimeline** (`apps/web/src/components/GenerationTimeline.tsx`): Frontend component showing pipeline stage progress

## Bug Details

### Bug Condition

The bugs manifest across three areas of the asset delivery pipeline. The common thread is that JSON metadata is stored with the same `AssetType` as renderable binary media, and downstream consumers (SSE stream, frontend) cannot distinguish metadata from actual media.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { stage: string, assetData: any, capabilityResult: any, jobState: any }
  OUTPUT: boolean

  // Bug A: metadata recorded as renderable asset type
  metadataMisclassified :=
    (input.stage == 'GenerateImages' AND input.assetData.isConceptJSON AND input.assetData.assetType == 'image')
    OR (input.stage == 'GenerateImages' AND input.capabilityResult.isTextNotBinary AND input.assetData.writtenAsPNG)
    OR (input.stage == 'GenerateVideo' AND input.assetData.isVideoBriefJSON AND input.assetData.assetType == 'video')
    OR (input.stage == 'GenerateGif' AND input.assetData.isCreativeDirectionJSON AND input.assetData.assetType == 'gif')

  // Bug B: timeout swallowed as success
  timeoutSwallowed :=
    (input.stage == 'GenerateVideo' AND input.capabilityResult.success == false AND input.stageResult.success == true)
    OR (input.stage == 'App.tsx' AND input.jobState.warnings != undefined AND input.propsPassedToOutputDashboard.warnings == undefined)
    OR (input.stage == 'GenerationTimeline' AND input.jobState.state == 'generating_gif' AND NOT stageExistsInTimeline('generating_gif'))

  // Bug C: GIF makes direct Veo call instead of video-to-GIF conversion
  gifDirectCall :=
    (input.stage == 'GenerateGif' AND input.capabilityResult.makesDirectVeoCall)
    OR (input.stage == 'GenerateGif' AND NOT input.checksForExistingVideoAsset)

  RETURN metadataMisclassified OR timeoutSwallowed OR gifDirectCall
END FUNCTION
```

### Examples

- **Image concept misclassification**: GenerateImages persists `image-concepts/abc.json` with `AssetType.Image`. SSE stream's `emitPartialResults` filters by `AssetType.Image` and finds this JSON file. Frontend VisualDirection renders text cards, not images. The JSON file is also signed and delivered as if it were a displayable image.

- **Text written as PNG**: `ImageGenerationCapability.generate()` calls `vertexai.getGenerativeModel().generateContent()` which returns text. `generate-images.ts` writes this text via `Buffer.from(assetData, 'utf-8')` with mime `image/png`. The resulting file is a text file with a `.png` extension that no browser can render.

- **VideoBrief matches videoUrl**: `generate-video.ts` records the video-brief JSON with `AssetType.Video`. In `App.tsx`, `videoUrl` is derived as `assets.find(a => a.assetType === AssetType.Video && ...)?.signedUrl`. This can match the JSON file instead of an actual MP4.

- **Video timeout returns success**: When `videoCapability.generate()` returns `{ success: false, metadata: { reason: 'timeout-or-no-video' } }`, the `GenerateVideo.execute()` method logs a warning and records a fallback notice but still returns `{ success: true, assets }` at the end of the method. The pipeline runner sees success and adds no warning.

- **Warnings not passed to OutputDashboard**: `App.tsx` renders `<OutputDashboard ... />` in both generating and results views but never passes the `warnings` prop. OutputDashboard's `videoStatus` derivation reads `warnings?.find(...)` which is always undefined, so status is always `'pending'`.

- **GeneratingGif missing from timeline**: `PIPELINE_STAGES` in `GenerationTimeline.tsx` lists 5 stages but omits `JobState.GeneratingGif`. When the pipeline enters this state, the timeline shows no active stage.

- **GIF direct Veo call**: `GifGenerationCapability.generate()` submits a `predictLongRunning` request to the Veo `videoFast` endpoint. This is a new video generation request, not a video-to-GIF conversion. The Veo API returns 400 errors for the GIF-oriented prompt.

- **No video check before GIF**: `GenerateGif.execute()` never checks `context.workingData` for a completed video asset. It always proceeds to classify the uploaded image and attempt GIF generation regardless.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- GenerateImages SHALL continue to persist ImageConcept JSON arrays to GCS and deliver them via SSE `partial_result` events
- Image generation capability unavailability SHALL continue to produce a fallback notice without failing the pipeline
- GenerateVideo SHALL continue to persist Storyboard and VideoBrief JSON to GCS and deliver them via SSE
- Successful Veo video generation SHALL continue to write MP4 files as `AssetType.Video`
- Video generation capability unavailability SHALL continue to produce a fallback notice
- Pipeline runner non-critical stage failure handling SHALL continue to add warnings and proceed
- OutputDashboard SHALL continue to show skipped notes and skeleton placeholders based on `requestedOutputs`/`skippedOutputs`
- GenerationTimeline SHALL continue to show completed/active/pending/skipped statuses for existing stages
- ComposePackage SHALL continue to include all assets and fallback notices in the bundle manifest
- SSE `state_change` events SHALL continue to include signed URLs, `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, and `warnings`

**Scope:**
All inputs that do NOT involve metadata asset type classification, video timeout result propagation, or GIF generation approach should be completely unaffected. This includes:
- Copy generation and delivery
- Storyboard generation and delivery
- Upload processing
- Job creation and polling
- Export/bundle download
- Live Agent and Trend Analyzer features

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing AssetType discriminators**: The `AssetType` enum has only 6 values (`Copy`, `Image`, `Video`, `Storyboard`, `VoiceoverScript`, `Gif`). There are no distinct types for metadata-only assets like image concepts, video brief metadata, or GIF creative direction. Pipeline stages reuse the renderable types for JSON metadata.

2. **ImageGenerationCapability returns text, not binary**: `ImageGenerationCapability` uses `vertexai.getGenerativeModel().generateContent()` which is a text generation API, not an image generation API (Imagen). The returned `responseText` is a text description, but `generate-images.ts` writes it as `Buffer.from(assetData, 'utf-8')` with mime `image/png`.

3. **GenerateVideo always returns success**: The `GenerateVideo.execute()` method has a single `return { success: true, assets }` at the end of the try block. Even when the video capability returns `success: false` or times out, the stage result is still `success: true` because the storyboard and video brief were persisted successfully. The pipeline runner never sees a failure.

4. **App.tsx omits warnings prop**: Both the generating view and results view render `<OutputDashboard>` without passing `warnings`. The SSE `state_change` handler stores warnings in state but they are never forwarded.

5. **GenerationTimeline missing GeneratingGif**: The `PIPELINE_STAGES` array and `STATE_ORDER` array in `GenerationTimeline.tsx` were not updated when the GIF pipeline stage was added.

6. **GifGenerationCapability makes direct Veo calls**: The capability was implemented as a standalone video generation request to the Veo `videoFast` model, rather than as a video-to-GIF conversion that uses the video asset from GenerateVideo.

7. **GenerateGif doesn't check for video**: The stage always runs its full classification → motion concept → storyboard → render flow without checking whether a video asset exists in `context.workingData`.

## Correctness Properties

Property 1: Bug Condition — Metadata Assets Use Non-Renderable Types

_For any_ pipeline execution where GenerateImages persists image-concept JSON, GenerateVideo persists video-brief JSON, or GenerateGif persists creative-direction JSON, the recorded `AssetReference.assetType` SHALL be a non-renderable type (`ImageConcept`, `VideoBriefMeta`, `GifCreativeDirection`) distinct from the renderable types (`Image`, `Video`, `Gif`), and the SSE stream and frontend SHALL NOT attempt to render these metadata assets as media.

**Validates: Requirements 2.1, 2.3, 2.4, 2.10**

Property 2: Bug Condition — Video Timeout Returns Failure

_For any_ pipeline execution where the video generation capability returns `success: false` or times out, the GenerateVideo stage SHALL return `{ success: false }` with an error message containing the timeout/failure reason, so the pipeline runner adds a warning to the job.

**Validates: Requirements 2.5, 2.6**

Property 3: Bug Condition — GIF Uses Existing Video Asset

_For any_ pipeline execution where GenerateGif runs, the stage SHALL check for a completed video asset in `context.workingData` before attempting GIF generation, and SHALL NOT make direct Veo API calls. If no video asset exists, the stage SHALL skip GIF rendering and record a fallback notice.

**Validates: Requirements 2.8, 2.9**

Property 4: Preservation — Existing Pipeline Behavior Unchanged

_For any_ pipeline execution where the bug conditions do NOT apply (successful image/video/GIF generation, capability unavailability, non-critical failures), the fixed code SHALL produce the same results as the original code, preserving all existing SSE delivery, fallback notice recording, asset persistence, and frontend rendering behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/shared/src/types/job.ts`

**Change**: Add new non-renderable AssetType enum values

**Specific Changes**:
1. Add `ImageConcept = 'image_concept'` to AssetType enum
2. Add `VideoBriefMeta = 'video_brief_meta'` to AssetType enum
3. Add `GifCreativeDirection = 'gif_creative_direction'` to AssetType enum

---

**File**: `apps/worker/src/pipeline/generate-images.ts`

**Function**: `GenerateImages.execute()`

**Specific Changes**:
1. Change the image-concepts JSON asset recording from `AssetType.Image` to `AssetType.ImageConcept`
2. When `ImageGenerationCapability.generate()` returns data, check if the data looks like text (not base64 binary). If text, record a fallback notice instead of writing as PNG
3. Only write as `image/png` if the data is valid base64-encoded binary image data

---

**File**: `apps/worker/src/pipeline/generate-video.ts`

**Function**: `GenerateVideo.execute()`

**Specific Changes**:
1. Change the video-brief JSON asset recording from `AssetType.Video` to `AssetType.VideoBriefMeta`
2. When the video capability returns `success: false` or no video assets, set a flag and return `{ success: false, error: reason }` instead of `{ success: true }`
3. Keep the storyboard and video brief persistence (they are still valuable), but the stage result should reflect the video generation outcome

---

**File**: `apps/worker/src/pipeline/generate-gif.ts`

**Function**: `GenerateGif.execute()`

**Specific Changes**:
1. At the start of the stage, check `context.workingData` for a completed video asset path (e.g., `context.workingData.videoAssetPath` or check for video assets in the job)
2. If no video asset exists, skip GIF rendering, record a fallback notice, and return success with no GIF assets
3. If a video asset exists, use it for GIF conversion instead of making a direct Veo call
4. Change creative direction JSON persistence from `AssetType.Gif` to `AssetType.GifCreativeDirection`

---

**File**: `apps/worker/src/capabilities/gif-generation.ts`

**Function**: `GifGenerationCapability.generate()`

**Specific Changes**:
1. Repurpose the capability to accept a video asset path/buffer and convert to GIF, rather than making a direct Veo `predictLongRunning` call
2. If the capability cannot perform video-to-GIF conversion (no ffmpeg, etc.), return `success: false` with reason

---

**File**: `apps/api/src/routes/stream.ts`

**Function**: `emitPartialResults()`

**Specific Changes**:
1. Update image concept asset filtering to use `AssetType.ImageConcept` instead of `AssetType.Image` with path heuristics
2. Update video brief asset lookup to use `AssetType.VideoBriefMeta` or continue using path-based lookup (path-based is already correct for video-brief)

---

**File**: `apps/web/src/App.tsx`

**Specific Changes**:
1. Pass `warnings` state to `<OutputDashboard>` in both the generating view and results view
2. Update `videoUrl` derivation to filter by storage path containing `/video/` to exclude video-brief JSON

---

**File**: `apps/web/src/components/GenerationTimeline.tsx`

**Specific Changes**:
1. Add `{ key: JobState.GeneratingGif, label: 'Generating GIF' }` to `PIPELINE_STAGES` array (between GeneratingVideo and ComposingPackage)
2. Add `JobState.GeneratingGif` to `STATE_ORDER` array (between GeneratingVideo and ComposingPackage)
3. Add `[JobState.GeneratingGif]: 'generateGif'` to `STAGE_TO_STEP_KEY` mapping

---

**File**: `apps/web/src/components/GifPreview.tsx`

**Specific Changes**:
1. Add a guard: if `gifAsset.url` is falsy or the asset appears to be JSON metadata, show a fallback message instead of rendering an `<img>` tag

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise the pipeline stages and frontend components with the current code to observe the misclassification, timeout swallowing, and direct Veo call behaviors.

**Test Cases**:
1. **Image Concept Misclassification Test**: Call `GenerateImages.execute()` with a mock context and verify the recorded asset type is `AssetType.Image` for the concepts JSON (will confirm bug on unfixed code)
2. **VideoBrief Misclassification Test**: Call `GenerateVideo.execute()` with a mock context and verify the video-brief JSON is recorded as `AssetType.Video` (will confirm bug on unfixed code)
3. **Video Timeout Returns Success Test**: Call `GenerateVideo.execute()` with a mock capability that returns `success: false` and verify the stage still returns `success: true` (will confirm bug on unfixed code)
4. **App.tsx Missing Warnings Test**: Render App.tsx with SSE warnings and verify OutputDashboard does not receive the `warnings` prop (will confirm bug on unfixed code)
5. **GeneratingGif Missing From Timeline Test**: Render GenerationTimeline with `currentState = JobState.GeneratingGif` and verify no stage shows as active (will confirm bug on unfixed code)
6. **GIF Creative Direction Misclassification Test**: Call `GenerateGif.execute()` with a mock context where GIF capability is unavailable and verify creative direction is recorded as `AssetType.Gif` (will confirm bug on unfixed code)

**Expected Counterexamples**:
- Image concept JSON recorded with `assetType: 'image'` instead of a metadata type
- Video brief JSON recorded with `assetType: 'video'` instead of a metadata type
- GenerateVideo returns `success: true` even when video capability fails
- OutputDashboard `warnings` prop is undefined despite warnings existing in SSE state

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedPipeline(input)
  ASSERT metadataAssetsUseNonRenderableTypes(result)
  ASSERT videoTimeoutReturnsFailure(result)
  ASSERT gifUsesExistingVideoOrSkips(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalPipeline(input) = fixedPipeline(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for successful generation paths, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Image Concept SSE Delivery Preservation**: Verify that image concepts are still delivered via SSE `partial_result` events after the asset type change
2. **Video Asset Persistence Preservation**: Verify that successful Veo video generation still writes MP4 files as `AssetType.Video` and they are correctly signed
3. **Fallback Notice Preservation**: Verify that capability unavailability still produces fallback notices with the same structure
4. **Pipeline Runner Non-Critical Handling Preservation**: Verify that non-critical stage failures still add warnings and continue
5. **OutputDashboard Rendering Preservation**: Verify that `skippedOutputs`, `requestedOutputs`, and skeleton placeholders still work correctly
6. **GenerationTimeline Existing Stages Preservation**: Verify that existing 5 stages still show correct completed/active/pending/skipped statuses

### Unit Tests

- Test `AssetType` enum has the new values (`ImageConcept`, `VideoBriefMeta`, `GifCreativeDirection`)
- Test `GenerateImages.execute()` records image-concept JSON with `AssetType.ImageConcept`
- Test `GenerateImages.execute()` detects text-not-binary from capability and records fallback
- Test `GenerateVideo.execute()` records video-brief JSON with `AssetType.VideoBriefMeta`
- Test `GenerateVideo.execute()` returns `success: false` when capability times out
- Test `GenerateGif.execute()` checks for video asset before attempting GIF generation
- Test `GenerateGif.execute()` skips GIF when no video asset exists
- Test `GenerateGif.execute()` records creative direction with `AssetType.GifCreativeDirection`
- Test `App.tsx` passes `warnings` to `OutputDashboard`
- Test `GenerationTimeline` includes `GeneratingGif` stage
- Test `GifPreview` handles missing/invalid `gifAsset.url` gracefully
- Test `App.tsx` `videoUrl` derivation filters by `/video/` path

### Property-Based Tests

- Generate random pipeline contexts with varying capability availability and verify metadata assets always use non-renderable types
- Generate random video capability results (success/failure/timeout) and verify GenerateVideo stage result correctly reflects the outcome
- Generate random job states and verify GenerationTimeline correctly positions all stages including GeneratingGif
- Generate random asset arrays with mixed types and verify `videoUrl` derivation never matches JSON metadata files
- Generate random SSE event sequences and verify warnings are always forwarded to OutputDashboard

### Integration Tests

- Test full pipeline flow with image capability unavailable: verify image concepts delivered via SSE, no broken image rendering
- Test full pipeline flow with video timeout: verify warning appears in OutputDashboard, video brief shown as fallback
- Test full pipeline flow with GIF stage and no video: verify GIF stage skips gracefully, fallback notice recorded
- Test SSE stream delivers correct partial results with new asset types
- Test OutputDashboard renders correctly with warnings for timeout/failure states
