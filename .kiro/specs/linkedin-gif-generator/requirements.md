# Requirements Document

## Introduction

The LinkedIn GIF Generator extends Content Storyteller with a new output type: animated GIF explainer assets optimized for LinkedIn. Users upload an image (workflow diagram, product architecture, process chart, UI screenshot, or feature visual) and receive LinkedIn-ready post copy, hashtags, and a short looping animated GIF. The feature integrates cleanly into the existing Batch Mode / output-intent pipeline without redesigning the app or breaking existing API contracts.

## Glossary

- **Output_Intent_Planner**: The module at `apps/api/src/services/planner/output-intent.ts` that resolves which pipeline stages to execute based on user preferences, platform defaults, and prompt keywords.
- **Pipeline_Runner**: The sequential stage executor at `apps/worker/src/pipeline/pipeline-runner.ts` that runs pipeline stages conditionally based on the resolved OutputIntent.
- **GIF_Pipeline_Stage**: A new pipeline stage in the worker that analyzes an uploaded image, generates a short motion concept, builds a storyboard of 3–6 beats, renders a short animated asset, and exports the final GIF.
- **GIF_Asset**: A looping animated GIF file returned as a completed output, with metadata including url, mimeType, width, height, durationMs, loop flag, and optional posterImageUrl.
- **GIF_Style_Preset**: A named animation style (e.g., "workflow_step_highlight", "feature_spotlight", "text_callout_animation") that controls the motion behavior applied during GIF generation.
- **Output_Preference_Selector**: The frontend component at `apps/web/src/components/OutputPreferenceSelector.tsx` that lets users choose their desired output combination in Batch Mode.
- **Model_Router**: The centralized routing layer at `packages/shared/src/ai/model-router.ts` that maps AI capability slots to Vertex AI models.
- **Copy_Generator**: The pipeline stage at `apps/worker/src/pipeline/generate-copy.ts` that produces structured CopyPackage output including hook, caption, CTA, hashtags, and voiceover script.
- **Result_Schema**: The shared type definitions in `packages/shared/src/types/job.ts` that define Job, OutputIntent, AssetReference, and related structures.
- **Capability_Registry**: The registry at `apps/worker/src/capabilities/capability-registry.ts` that manages available generation capabilities (image, video, GIF).

## Requirements

### Requirement 1: GIF Intent Detection in Output-Intent Planner

**User Story:** As a user, I want the system to detect when I request a GIF output, so that the pipeline generates an animated GIF without producing unnecessary video or image assets.

#### Acceptance Criteria

1. THE Output_Intent_Planner SHALL expose a `wantsGif` boolean field on the OutputIntent interface.
2. WHEN the user prompt contains any of the keywords "gif", "looping animation", "animated explainer", "linkedin gif", "motion graphic", or "animated workflow" (case-insensitive), THE Output_Intent_Planner SHALL set `wantsGif` to true.
3. WHEN the user selects the "Copy + GIF" output preference, THE Output_Intent_Planner SHALL set `wantsGif` to true, `wantsVideo` to false, and `wantsImage` to false.
4. WHEN the user selects the "Full Package" output preference, THE Output_Intent_Planner SHALL set `wantsGif` to true in addition to all other existing intent flags.
5. WHEN `wantsGif` is true and `wantsVideo` is false, THE Pipeline_Runner SHALL execute the GIF_Pipeline_Stage and skip the GenerateVideo stage.
6. WHEN `wantsGif` is true and `wantsImage` is false, THE Pipeline_Runner SHALL skip the GenerateImages stage unless the GIF_Pipeline_Stage requires an intermediate image asset.
7. THE Output_Intent_Planner SHALL NOT set `wantsVideo` to true when only a GIF is requested and no explicit video keywords are present in the prompt.

### Requirement 2: GIF Generation Pipeline Stage

**User Story:** As a user, I want the system to generate a short animated GIF from my uploaded image, so that I can use it as a LinkedIn explainer visual.

#### Acceptance Criteria

1. THE GIF_Pipeline_Stage SHALL analyze the uploaded image to extract key visual regions using the multimodal model capability slot.
2. THE GIF_Pipeline_Stage SHALL generate a short motion concept describing the animation approach using the text model capability slot.
3. THE GIF_Pipeline_Stage SHALL build a storyboard containing between 3 and 6 beats (inclusive) for the animation sequence.
4. THE GIF_Pipeline_Stage SHALL render a short animated asset using the videoFast model capability slot.
5. THE GIF_Pipeline_Stage SHALL convert the rendered video to GIF format as the final output.
6. THE GIF_Pipeline_Stage SHALL persist the completed GIF_Asset to Cloud Storage under the path `{jobId}/gifs/{assetId}.gif`.
7. THE GIF_Pipeline_Stage SHALL record an AssetReference with assetType `gif` in the job's asset list upon successful completion.
8. IF the GIF export fails but the intermediate MP4 render succeeds, THEN THE GIF_Pipeline_Stage SHALL return the MP4 asset with a warning, mark the GIF export as failed in the FallbackNotice, and continue pipeline execution without hanging.
9. THE GIF_Pipeline_Stage SHALL optimize the output for short duration (under 10 seconds), small file size (under 5 MB), and loop-friendly animation.

### Requirement 3: GIF Style Presets

**User Story:** As a user, I want the system to automatically select an appropriate animation style based on my uploaded image type, so that the GIF looks natural and relevant.

#### Acceptance Criteria

1. THE GIF_Pipeline_Stage SHALL support the following GIF_Style_Presets: "diagram_pulse", "workflow_step_highlight", "zoom_pan_explainer", "feature_spotlight", "text_callout_animation", "process_flow_reveal", and "before_after_comparison".
2. WHEN the uploaded image is classified as a diagram or workflow, THE GIF_Pipeline_Stage SHALL default to the "workflow_step_highlight" preset.
3. WHEN the uploaded image is classified as a UI screenshot, THE GIF_Pipeline_Stage SHALL default to the "feature_spotlight" preset.
4. WHEN the uploaded image is classified as a chart or infographic, THE GIF_Pipeline_Stage SHALL default to the "text_callout_animation" preset.
5. WHEN the image classification does not match any specific category, THE GIF_Pipeline_Stage SHALL default to the "zoom_pan_explainer" preset.

### Requirement 4: Output Preference Selector Extension

**User Story:** As a user, I want to select "Copy + GIF" as an output preference in Batch Mode, so that I can explicitly request a GIF without getting a full video.

#### Acceptance Criteria

1. THE Output_Preference_Selector SHALL display a "Copy + GIF" option with the label "Copy + GIF" and description "Text with animated GIF explainer".
2. THE Output_Preference_Selector SHALL maintain all existing options: Auto-detect, Copy only, Copy + Image, Copy + Video, and Full Package.
3. WHEN the user selects "Copy + GIF", THE Output_Preference_Selector SHALL emit the value `copy_gif` as the OutputPreference.
4. THE Output_Preference_Selector SHALL render the "Copy + GIF" option with a consistent visual style matching the existing premium layout.

### Requirement 5: Result Schema Extension for GIF Assets

**User Story:** As a developer, I want the result schema to support GIF assets alongside images and videos, so that the frontend and API can handle GIF outputs correctly.

#### Acceptance Criteria

1. THE Result_Schema SHALL include a `gif` value in the AssetType enum.
2. THE Result_Schema SHALL include `wantsGif` as a boolean field on the OutputIntent interface.
3. THE Result_Schema SHALL include a `generateGif` step in the StepsMap interface with the same StepMetadata structure as existing steps.
4. THE Result_Schema SHALL include a `GeneratingGif` value in the JobState enum with the string value "generating_gif".
5. WHEN a GIF_Asset is completed, THE Result_Schema SHALL represent the asset with the fields: assetId, jobId, assetType ("gif"), storagePath, generationTimestamp, and status.
6. THE Result_Schema SHALL support `requestedOutputs`, `completedOutputs`, and `skippedOutputs` arrays that include "gif" as a valid output type string.

### Requirement 6: Conditional Generation Behavior

**User Story:** As a user, I want the pipeline to generate only the outputs I requested, so that I do not receive unnecessary assets or wait for unneeded processing.

#### Acceptance Criteria

1. WHEN `wantsGif` is true and `wantsVideo` is false, THE Pipeline_Runner SHALL execute the GIF_Pipeline_Stage and skip the GenerateVideo stage.
2. WHEN `wantsGif` is true and `wantsImage` is false, THE Pipeline_Runner SHALL skip the GenerateImages stage unless the GIF_Pipeline_Stage requires an intermediate image.
3. WHEN `wantsGif` is true and the platform is LinkedInLaunchPost, THE Copy_Generator SHALL generate LinkedIn post copy, hashtags, and optional CTA alongside the GIF without generating unnecessary standalone image or video assets.
4. THE Pipeline_Runner SHALL treat the GIF_Pipeline_Stage as a non-critical stage, meaning a GIF generation failure SHALL result in a warning and partial completion rather than a full job failure.

### Requirement 7: LinkedIn-Optimized Copy Generation for GIF Posts

**User Story:** As a user, I want the system to generate LinkedIn-ready post copy tailored to accompany my GIF, so that I can publish a complete LinkedIn post.

#### Acceptance Criteria

1. WHEN `wantsGif` is true and the platform is LinkedInLaunchPost, THE Copy_Generator SHALL produce a headline or hook line.
2. WHEN `wantsGif` is true and the platform is LinkedInLaunchPost, THE Copy_Generator SHALL produce a short LinkedIn post body text (50–200 words).
3. WHEN `wantsGif` is true, THE Copy_Generator SHALL produce between 3 and 8 hashtags (inclusive).
4. WHEN `wantsGif` is true, THE Copy_Generator SHALL produce an optional CTA string.
5. WHEN `wantsGif` is true, THE Copy_Generator SHALL produce an optional alt-text accessibility description for the GIF asset.
6. THE Copy_Generator SHALL default to a professional, clear, insight-driven, and slightly punchy tone for LinkedIn GIF posts when no explicit tone is selected.

### Requirement 8: Frontend GIF Preview and Result Display

**User Story:** As a user, I want to see a preview of my generated GIF alongside the post copy and hashtags in the result dashboard, so that I can review the complete output before exporting.

#### Acceptance Criteria

1. WHEN a GIF_Asset is present in the job results, THE OutputDashboard SHALL render an inline GIF preview that plays the animation in a loop.
2. WHEN a GIF_Asset is present, THE OutputDashboard SHALL display the associated post copy, hashtags, and CTA text alongside the GIF preview.
3. WHEN the "gif" output type is in the skippedOutputs array, THE OutputDashboard SHALL NOT render a skeleton placeholder for the GIF section.
4. THE ExportPanel SHALL include the GIF_Asset in the downloadable asset list with a "GIF" label and a download link.
5. THE OutputDashboard SHALL display the GIF preview section with a consistent visual style matching the existing premium layout components.

### Requirement 9: GIF Generation Capability Registration

**User Story:** As a developer, I want the GIF generation capability to be registered in the Capability_Registry, so that the pipeline can check availability and generate GIFs using the same pattern as image and video capabilities.

#### Acceptance Criteria

1. THE Capability_Registry SHALL register a "gif_generation" capability following the same GenerationCapability interface used by image_generation and video_generation.
2. THE "gif_generation" capability SHALL implement an `isAvailable()` method that checks for valid GCP credentials and Veo API access.
3. THE "gif_generation" capability SHALL implement a `generate()` method that accepts a GenerationInput containing the uploaded image, motion concept, and storyboard data.
4. IF the "gif_generation" capability is unavailable, THEN THE GIF_Pipeline_Stage SHALL record a FallbackNotice and persist the motion concept and storyboard as creative direction assets.

### Requirement 10: Pipeline Runner Extension for GIF Stage

**User Story:** As a developer, I want the pipeline runner to support the GIF generation stage in the correct execution order, so that GIF generation runs after copy generation and before package composition.

#### Acceptance Criteria

1. THE Pipeline_Runner SHALL execute the GIF_Pipeline_Stage after the GenerateCopy stage and before the ComposePackage stage.
2. THE Pipeline_Runner SHALL evaluate the `wantsGif` flag from the OutputIntent to determine whether to execute or skip the GIF_Pipeline_Stage.
3. WHEN the GIF_Pipeline_Stage is skipped, THE Pipeline_Runner SHALL record the step status as "skipped" in the StepsMap and include "GenerateGif" in the skippedOutputs array.
4. THE Pipeline_Runner SHALL enforce the existing 10-minute global timeout across all stages including the GIF_Pipeline_Stage.
5. THE SSE stream SHALL include the GIF_Pipeline_Stage state transitions ("generating_gif") in state_change events with the same metadata structure as existing stages.
