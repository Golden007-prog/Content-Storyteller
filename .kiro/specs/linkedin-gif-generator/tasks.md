# Implementation Plan: LinkedIn GIF Generator

## Overview

Extend Content Storyteller with animated GIF output support for LinkedIn. Implementation proceeds bottom-up: shared types first, then API planner, worker pipeline/capability, and finally frontend components. Each task builds incrementally on the previous, wiring everything together at the end.

## Tasks

- [x] 1. Extend shared types for GIF support
  - [x] 1.1 Add GIF enums and interface fields to `packages/shared/src/types/job.ts`
    - Add `AssetType.Gif = 'gif'` to the AssetType enum
    - Add `JobState.GeneratingGif = 'generating_gif'` to the JobState enum
    - Add `OutputPreference.CopyGif = 'copy_gif'` to the OutputPreference enum
    - Add `wantsGif: boolean` to the OutputIntent interface
    - Add `generateGif: StepMetadata` to the StepsMap interface
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 1.1_

  - [x] 1.2 Write unit tests for GIF shared types
    - Verify `AssetType.Gif`, `JobState.GeneratingGif`, `OutputPreference.CopyGif` enum values exist
    - Verify `wantsGif` field is present on OutputIntent
    - Verify `generateGif` step exists in StepsMap
    - Test file: `packages/shared/src/__tests__/gif-types.unit.test.ts`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.3 Create GIF style preset types at `packages/shared/src/types/gif.ts`
    - Define `GifStylePreset` union type with 7 presets
    - Define `ImageClassification` union type
    - Define `GifMotionConcept`, `GifStoryboardBeat`, `GifStoryboard`, `GifAssetMetadata` interfaces
    - Export all types from the shared package barrel
    - _Requirements: 3.1, 2.3_

  - [x] 1.4 Write property tests for GIF type constraints
    - **Property 5: GIF style preset validity** — verify any selected preset is one of the 7 valid values
    - **Validates: Requirements 3.1**
    - **Property 8: GIF storage path format** — verify path matches `{jobId}/gifs/{assetId}.gif` pattern for any jobId/assetId
    - **Validates: Requirements 2.6**
    - Test file: `packages/shared/src/__tests__/gif-types.property.test.ts`

- [x] 2. Checkpoint - Ensure all shared type tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Extend Output-Intent Planner for GIF detection
  - [x] 3.1 Update `apps/api/src/services/planner/output-intent.ts`
    - Add `wantsGif: false` to `createBaseIntent()`
    - Handle `OutputPreference.CopyGif`: set `wantsGif = true`, `wantsVideo = false`, `wantsImage = false`
    - In `FullPackage` case, also set `wantsGif = true`
    - Add GIF keyword regex: `/\b(gif|looping animation|animated explainer|linkedin gif|motion graphic|animated workflow)\b/i`
    - When GIF keywords match, set `wantsGif = true`; do NOT set `wantsVideo = true` unless explicit video keywords also present
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [x] 3.2 Write unit tests for GIF intent detection
    - Test "make me a gif" → `wantsGif = true`
    - Test `CopyGif` preference → `wantsGif = true`, `wantsVideo = false`, `wantsImage = false`
    - Test `FullPackage` preference → `wantsGif = true`, `wantsImage = true`, `wantsVideo = true`
    - Test prompt with GIF keywords but no video keywords → `wantsVideo = false`
    - Test file: `apps/api/src/__tests__/gif-intent.unit.test.ts`
    - _Requirements: 1.2, 1.3, 1.4, 1.7_

  - [x] 3.3 Write property tests for GIF intent planner
    - **Property 1: GIF keyword detection sets correct intent flags** — for any prompt with GIF keywords but no video keywords, `wantsGif === true` and `wantsVideo === false`
    - **Validates: Requirements 1.2, 1.7**
    - **Property 2: Output preference to intent mapping** — for any `PlannerInput` with `CopyGif`, verify `wantsGif = true`, `wantsVideo = false`, `wantsImage = false`; for `FullPackage`, verify `wantsGif = true` with `wantsImage = true` and `wantsVideo = true`
    - **Validates: Requirements 1.3, 1.4**
    - Test file: `apps/api/src/__tests__/gif-intent.property.test.ts`

- [x] 4. Implement GIF generation capability and pipeline stage
  - [x] 4.1 Create GIF generation capability at `apps/worker/src/capabilities/gif-generation.ts`
    - Implement `GifGenerationCapability` class following `GenerationCapability` interface
    - `name = 'gif_generation'`
    - `isAvailable()`: check GCP credentials and Veo API access (same pattern as `VideoGenerationCapability`)
    - `generate(input)`: accept uploaded image path, motion concept, storyboard; call `videoFast` model slot; convert MP4 to GIF
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.2 Register GIF capability in `apps/worker/src/capabilities/capability-registry.ts`
    - Import `GifGenerationCapability`
    - Add `this.register(new GifGenerationCapability())` in the `init()` method
    - _Requirements: 9.1_

  - [x] 4.3 Create GIF pipeline stage at `apps/worker/src/pipeline/generate-gif.ts`
    - Implement `GenerateGif` class following `PipelineStage` interface
    - `name = 'GenerateGif'`, `jobState = JobState.GeneratingGif`
    - `execute(context)`:
      - Analyze uploaded image via multimodal model to classify image type and extract focus regions
      - Select `GifStylePreset` based on classification mapping (diagram/workflow → `workflow_step_highlight`, ui_screenshot → `feature_spotlight`, chart/infographic → `text_callout_animation`, other → `zoom_pan_explainer`)
      - Generate motion concept using text model
      - Build storyboard of 3–6 beats, clamp if out of range
      - Check `gif_generation` capability availability
      - If available: render via `videoFast`, convert to GIF, persist to `{jobId}/gifs/{assetId}.gif`, record `AssetReference` with `AssetType.Gif`
      - If unavailable: record `FallbackNotice`, persist motion concept + storyboard as JSON
      - If GIF conversion fails but MP4 succeeds: persist MP4 with warning
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.2, 3.3, 3.4, 3.5, 9.4_

  - [x] 4.4 Extend pipeline runner at `apps/worker/src/pipeline/pipeline-runner.ts`
    - Import `GenerateGif` from `./generate-gif`
    - Add `StageConfig` entry: `{ stage: new GenerateGif(), stepsKey: 'generateGif', intentKey: 'wantsGif', critical: false }`
    - Insert after `GenerateVideo` and before `ComposePackage` in `STAGE_CONFIGS`
    - Add `generateGif: { status: 'queued' }` to `createInitialSteps()`
    - Add `wantsGif: true` to `defaultOutputIntent()`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 6.1, 6.2, 6.4_

  - [x] 4.5 Write unit tests for GIF pipeline stage and runner
    - Test stage ordering: `GenerateGif` after `GenerateVideo`, before `ComposePackage`
    - Test non-critical failure handling: GIF failure → warning, pipeline continues
    - Test fallback behavior when capability is unavailable
    - Test MP4 fallback when GIF conversion fails
    - Test image classification defaults to `'other'` / `'zoom_pan_explainer'` on failure
    - Test storyboard beat count clamping (< 3 pads, > 6 truncates)
    - Test file: `apps/worker/src/__tests__/gif-pipeline.unit.test.ts`
    - _Requirements: 2.3, 2.8, 6.4, 9.4, 10.1_

  - [x] 4.6 Write property tests for GIF pipeline logic
    - **Property 3: Conditional stage execution based on OutputIntent** — for any OutputIntent, `GenerateGif` executes iff `wantsGif === true`; when `wantsGif === true` and `wantsVideo === false`, `GenerateVideo` is skipped
    - **Validates: Requirements 1.5, 1.6, 6.1, 6.2, 10.2, 10.3**
    - **Property 4: Image classification to GIF style preset mapping** — for any classification, verify correct preset selection per mapping
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
    - **Property 6: GIF storyboard beat count invariant** — for any storyboard, beat count is between 3 and 6 inclusive after validation
    - **Validates: Requirements 2.3**
    - **Property 7: GIF output duration and size constraints** — for any completed GIF, duration < 10000ms and size < 5242880 bytes
    - **Validates: Requirements 2.9**
    - Test file: `apps/worker/src/__tests__/gif-pipeline.property.test.ts`

- [x] 5. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extend SSE stream for GIF state transitions
  - [x] 6.1 Update `apps/api/src/routes/stream.ts`
    - Add partial result emission for `GeneratingGif → ComposingPackage` transition
    - Read GIF asset metadata from storage and send via `partial_result` event
    - Import `GifAssetMetadata` from shared types
    - The existing `state_change` event will automatically include `generating_gif` once the enum value exists
    - _Requirements: 10.5, 5.4_

- [x] 7. Extend frontend components for GIF support
  - [x] 7.1 Add "Copy + GIF" option to `apps/web/src/components/OutputPreferenceSelector.tsx`
    - Add new entry to `OUTPUT_PREFERENCE_OPTIONS` with value `OutputPreference.CopyGif`, label "Copy + GIF", description "Text with animated GIF explainer", and an appropriate SVG icon
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.2 Create GIF preview component at `apps/web/src/components/GifPreview.tsx`
    - Render inline `<img>` tag for GIF (auto-loops natively)
    - Display associated copy, hashtags, and CTA alongside the preview
    - Accept `GifAssetMetadata` and optional copy data as props
    - Style consistently with existing premium layout components
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 7.3 Extend `apps/web/src/components/OutputDashboard.tsx`
    - Add `gifAsset?: GifAssetMetadata | null` to `OutputDashboardProps`
    - Render `GifPreview` component when a GIF asset is present
    - Skip GIF skeleton when `"gif"` is in `skippedOutputs`
    - Add `shouldShow('gif')` logic following existing pattern
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 7.4 Extend `apps/web/src/components/ExportPanel.tsx`
    - Add `'gif': 'GIF'` to the `assetLabel` labels map in the `assetLabel()` function
    - _Requirements: 8.4_

  - [x] 7.5 Write unit tests for frontend GIF components
    - Verify `OutputPreferenceSelector` renders "Copy + GIF" option
    - Verify `OutputDashboard` renders `GifPreview` when GIF asset is present
    - Verify `OutputDashboard` hides GIF section when `"gif"` is in `skippedOutputs`
    - Verify `ExportPanel` includes GIF in asset list with "GIF" label
    - Test file: `apps/web/src/__tests__/gif-frontend.unit.test.tsx`
    - _Requirements: 4.1, 4.2, 8.1, 8.3, 8.4_

  - [x] 7.6 Write property tests for frontend GIF copy display
    - **Property 9: LinkedIn GIF copy structure** — for any copy when `wantsGif === true` and platform is `LinkedInLaunchPost`, hook is non-empty and caption word count is between 50 and 200
    - **Validates: Requirements 7.1, 7.2**
    - **Property 10: GIF hashtag count bounds** — for any copy when `wantsGif === true`, hashtags array has between 3 and 8 elements
    - **Validates: Requirements 7.3**
    - **Property 11: LinkedIn GIF copy includes required output fields** — for any pipeline execution with `wantsGif === true` and `LinkedInLaunchPost`, copy includes hook, caption, CTA, and hashtags
    - **Validates: Requirements 6.3**
    - Test file: `apps/web/src/__tests__/gif-frontend.property.test.tsx`

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The GIF pipeline stage is non-critical — failures produce warnings, not job failures
