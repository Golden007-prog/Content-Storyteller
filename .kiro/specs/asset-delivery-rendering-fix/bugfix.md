# Bugfix Requirements Document

## Introduction

The Content Storyteller app has three interconnected bugs in the asset delivery and rendering pipeline that prevent generated media (images, video, GIF) from being correctly displayed in the frontend. JSON metadata files are misclassified as renderable media assets, video generation timeouts are silently swallowed as successes leaving the UI stuck, and GIF generation makes invalid direct Veo API calls instead of converting from completed video assets. Together these bugs mean the user sees no actual images, an eternally-loading video state, and 400 errors from fake GIF requests.

## Bug Analysis

### Current Behavior (Defect)

**Bug A — Image rendering pipeline**

1.1 WHEN GenerateImages persists the image-concepts JSON file THEN the system records it with `assetType: AssetType.Image`, causing JSON metadata to be treated as a renderable image asset by the SSE stream and frontend

1.2 WHEN SSE emits `partial_result` events for image assets THEN the system sends only the parsed `ImageConcept[]` text objects (conceptName, visualDirection, style) and does NOT include any displayable image URLs, so the VisualDirection component renders text concept cards instead of actual images

1.3 WHEN `ImageGenerationCapability.generate()` returns asset data THEN the system writes it via `Buffer.from(assetData, 'utf-8')` with mime `image/png`, but the capability uses `vertexai.getGenerativeModel()` which returns text descriptions, not binary image data — the resulting file is a text file masquerading as a PNG

1.4 WHEN App.tsx derives `videoUrl` from assets THEN the system finds the first `AssetType.Video` asset with a signedUrl, but the VideoBrief JSON is also recorded as `AssetType.Video`, so it can match a JSON metadata file instead of an actual MP4 video

**Bug B — Video generation timeout handling**

1.5 WHEN video generation times out or the capability returns `success: false` THEN GenerateVideo stage still returns `{ success: true }` to the pipeline runner, preventing the runner from adding a warning or marking the stage as failed

1.6 WHEN OutputDashboard derives `videoStatus` THEN it reads from the `warnings` prop, but App.tsx never passes `warnings` to OutputDashboard — the prop is always undefined, so `videoStatus` always falls through to `'pending'`, leaving the UI stuck on "Generating Video" forever

1.7 WHEN the pipeline transitions to the GeneratingGif stage THEN GenerationTimeline shows no progress because `JobState.GeneratingGif` is missing from the `PIPELINE_STAGES` array

**Bug C — GIF generation approach**

1.8 WHEN GenerateGif stage runs THEN `GifGenerationCapability` submits a direct `predictLongRunning` call to the Veo `videoFast` model, which is a new video generation request rather than a video-to-GIF conversion, resulting in 400 errors

1.9 WHEN GenerateGif stage executes THEN it does NOT check whether a video asset was successfully generated in the preceding GenerateVideo stage — it always attempts GIF generation regardless of video availability

1.10 WHEN GIF generation fails THEN the system persists JSON creative direction (motion concept and storyboard) as `AssetType.Gif`, and the frontend's GifPreview component tries to render `gifAsset.url` as an `<img>` tag, but the asset is JSON, not a renderable GIF

### Expected Behavior (Correct)

**Bug A — Image rendering pipeline**

2.1 WHEN GenerateImages persists the image-concepts JSON file THEN the system SHALL record it with a distinct non-renderable asset type (e.g., `AssetType.ImageConcept` or a metadata marker) so that the SSE stream and frontend do not treat JSON metadata as image media

2.2 WHEN SSE emits `partial_result` events for image assets THEN the system SHALL include signed URLs for any actual generated image files, and the frontend SHALL render actual images when available or clearly indicate that only concept descriptions are available as fallback

2.3 WHEN `ImageGenerationCapability.generate()` returns asset data THEN the system SHALL correctly handle the data encoding — if the capability returns text descriptions rather than binary image data, the system SHALL NOT write them as `image/png` files, and SHALL record a fallback notice instead

2.4 WHEN App.tsx derives `videoUrl` from assets THEN the system SHALL filter to only match actual video files (e.g., by checking the storage path contains `/video/` or the mime type is `video/mp4`) and SHALL NOT match VideoBrief JSON metadata files

**Bug B — Video generation timeout handling**

2.5 WHEN video generation times out or the capability returns `success: false` THEN GenerateVideo stage SHALL return `{ success: false }` with an appropriate error message (including timeout indication) so the pipeline runner can add a warning and mark the step as failed

2.6 WHEN OutputDashboard renders THEN App.tsx SHALL pass the `warnings` array from SSE state_change events to OutputDashboard so that `videoStatus` correctly resolves to `'timeout'` or `'failed'` and the UI shows an explicit status message instead of a permanent loading state

2.7 WHEN the pipeline transitions to the GeneratingGif stage THEN GenerationTimeline SHALL include `JobState.GeneratingGif` in `PIPELINE_STAGES` so the timeline shows GIF generation progress

**Bug C — GIF generation approach**

2.8 WHEN GenerateGif stage runs THEN it SHALL check for an existing successfully-generated video asset from the GenerateVideo stage and convert that video to GIF format, rather than submitting a new direct Veo API video generation call

2.9 WHEN GenerateGif stage runs and no completed video asset exists THEN the stage SHALL skip GIF generation, record a fallback notice explaining that GIF requires a completed video, and return success with no GIF assets (or persist only the creative direction metadata with a non-renderable asset type)

2.10 WHEN GIF generation fails or only creative direction is available THEN the system SHALL NOT persist JSON metadata as `AssetType.Gif`, and the frontend SHALL show an appropriate fallback message instead of attempting to render JSON as an image

### Unchanged Behavior (Regression Prevention)

3.1 WHEN GenerateImages successfully generates image concepts via GenAI THEN the system SHALL CONTINUE TO persist the ImageConcept JSON array to GCS and make it available for SSE partial_result delivery

3.2 WHEN the image generation capability is unavailable THEN the system SHALL CONTINUE TO record a fallback notice and proceed without failing the pipeline

3.3 WHEN GenerateVideo successfully generates a Storyboard and VideoBrief via GenAI THEN the system SHALL CONTINUE TO persist both as JSON assets to GCS and deliver them via SSE partial_result events

3.4 WHEN the video generation capability is unavailable THEN the system SHALL CONTINUE TO record a fallback notice and proceed without failing the pipeline (GenerateVideo is non-critical)

3.5 WHEN GenerateVideo successfully receives base64-encoded MP4 data from Veo THEN the system SHALL CONTINUE TO write the video as a proper MP4 file and record it as `AssetType.Video`

3.6 WHEN the pipeline runner encounters a non-critical stage failure THEN it SHALL CONTINUE TO add a warning and proceed to the next stage without failing the entire job

3.7 WHEN OutputDashboard receives `skippedOutputs` and `requestedOutputs` THEN it SHALL CONTINUE TO show skipped notes and skeleton placeholders correctly based on output intent

3.8 WHEN GenerationTimeline receives `currentState` and `steps` THEN it SHALL CONTINUE TO correctly show completed, active, pending, and skipped statuses for all existing pipeline stages

3.9 WHEN ComposePackage assembles the final asset bundle THEN it SHALL CONTINUE TO include all recorded assets and fallback notices in the bundle manifest

3.10 WHEN the SSE stream emits `state_change` events THEN it SHALL CONTINUE TO include signed URLs for all completed assets and deliver `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, and `warnings` fields
