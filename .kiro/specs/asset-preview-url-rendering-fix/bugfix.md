# Bugfix Requirements Document

## Introduction

After the previous asset-delivery-rendering-fix (which corrected AssetType enum misclassification, video timeout propagation, and GIF generation approach), assets are now correctly generated and persisted — the Export Assets panel shows Image, Video, and GIF rows. However, the preview/media section still shows empty skeleton placeholders and assets do not render inline. The root cause is a broken URL rendering contract between the backend (signed URL generation) and frontend (media normalization and preview components). Specifically: (a) signed URLs fail with GCS AccessDenied errors because the service account may lack signing permissions, (b) the frontend never populates renderable media URLs from SSE events or the final assets fetch into the preview components, (c) GIF asset metadata is never wired from App.tsx to OutputDashboard, (d) actual generated images (AssetType.Image) have no preview rendering path — only text concept cards are shown, and (e) video/image signed URLs from SSE state_change events are discarded instead of being stored for inline preview.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the API generates a signed URL for an asset in a cloud environment where the service account lacks `iam.serviceAccounts.signBlob` permission THEN the system throws an unhandled error and the signed URL is set to an empty string, causing the frontend to receive broken download/preview links

1.2 WHEN the SSE stream emits `state_change` events containing signed asset references (via `signAssetsForSSE`) THEN App.tsx extracts `requestedOutputs`, `skippedOutputs`, and `warnings` from the event data but discards the `assets` array, so no signed URLs are available for inline preview during the generating view

1.3 WHEN the SSE stream emits `partial_result` events containing `partialGifAsset` metadata THEN App.tsx `handlePartialResult` callback does not extract or store the GIF asset metadata, so `gifAsset` is never set and OutputDashboard never receives it

1.4 WHEN App.tsx renders OutputDashboard in both generating and results views THEN it never passes a `gifAsset` prop because there is no `gifAsset` state variable in App.tsx, causing the GIF preview section to always show a skeleton placeholder or be absent

1.5 WHEN actual image files exist as `AssetType.Image` assets with valid signed URLs THEN the frontend has no component or rendering path to display them as `<img>` tags — VisualDirection only renders text concept cards (conceptName, visualDirection, style) and ignores actual image binary assets

1.6 WHEN the `handleComplete` callback fetches final assets via `getAssets(jobId)` THEN it stores them in the `assets` state for ExportPanel but does not extract renderable media URLs (image signed URLs, GIF metadata with signed URL) for the preview components, so preview sections remain as skeletons even after job completion

1.7 WHEN an asset's signed URL is an empty string (due to signing failure) THEN ExportPanel renders download links with `href=""` and CopyToClipboardButton attempts to fetch an empty URL, both of which fail silently with no user feedback

1.8 WHEN video generation times out and the pipeline records a warning THEN the `videoUrl` derivation in App.tsx correctly returns undefined, but the OutputDashboard skeleton for the video section persists because `videoStatus` resolves to `'timeout'` only if `warnings` is passed — which it now is after the previous fix, but the fallback message in VideoBriefView may not render if `videoBrief` data is also missing from SSE partial results

1.9 WHEN the GIF generation stage produces a real GIF file (AssetType.Gif with a valid storagePath ending in `.gif`) THEN the SSE stream emits `partialGifAsset` with the GifAssetMetadata, but the `url` field in GifAssetMetadata contains the raw GCS storage path (not a signed URL or proxy URL), causing the GifPreview `<img>` tag to attempt loading a raw bucket URL that returns AccessDenied

1.10 WHEN renderable media assets (images, video, GIF) exist in the completed job THEN the preview gallery continues to show skeleton placeholders because the frontend media normalization layer does not filter completed assets by renderable types and map them to preview components with working display URLs

### Expected Behavior (Correct)

2.1 WHEN the API generates a signed URL for an asset and signing fails in cloud environments THEN the system SHALL fall back to the backend proxy endpoint (`/api/v1/assets/{storagePath}`) that streams the file using server credentials, ensuring every renderable asset has a usable display URL

2.2 WHEN the SSE stream emits `state_change` events containing signed asset references THEN App.tsx SHALL store the signed assets array in state so that renderable media URLs are available for inline preview during the generating view

2.3 WHEN the SSE stream emits `partial_result` events containing `partialGifAsset` metadata THEN App.tsx SHALL extract and store the GIF asset metadata in a `gifAsset` state variable and pass it to OutputDashboard

2.4 WHEN App.tsx renders OutputDashboard THEN it SHALL pass the `gifAsset` prop containing GIF metadata with a working display URL (signed URL or proxy URL), so the GIF preview section renders the actual GIF image when available

2.5 WHEN actual image files exist as `AssetType.Image` assets with valid signed URLs THEN the frontend SHALL render them as `<img>` tags in the preview gallery, either within VisualDirection or in a dedicated image preview section, so users can see the generated images inline

2.6 WHEN the `handleComplete` callback fetches final assets THEN it SHALL extract renderable media (images, video, GIF) from the assets array and populate the corresponding preview state (image URLs, GIF metadata with signed URL) so preview sections display actual content instead of skeletons

2.7 WHEN an asset's signed URL is an empty string or invalid THEN ExportPanel SHALL show a disabled state or error indicator for that asset's download/copy actions instead of rendering broken links

2.8 WHEN video generation times out THEN the VideoBriefView SHALL display the timeout message clearly and the skeleton placeholder SHALL be replaced with the fallback content (video brief details), not left as an empty skeleton

2.9 WHEN the GIF generation stage produces a real GIF file THEN the GifAssetMetadata `url` field SHALL contain a signed URL or proxy URL (not a raw GCS storage path), so the GifPreview `<img>` tag can load and display the GIF

2.10 WHEN renderable media assets exist in the completed job THEN the preview gallery SHALL filter assets by renderable types (AssetType.Image, AssetType.Video, AssetType.Gif), map each to the appropriate preview component (`<img>`, `<video>`, `<img>` for GIF), and skeleton placeholders SHALL disappear once renderable content is available

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the SSE stream emits `state_change` events THEN the system SHALL CONTINUE TO deliver `requestedOutputs`, `skippedOutputs`, `warnings`, `outputIntent`, and `steps` fields correctly

3.2 WHEN the SSE stream emits `partial_result` events for copy, storyboard, video brief, and image concepts THEN the system SHALL CONTINUE TO deliver these partial results and the frontend SHALL CONTINUE TO render them progressively (CopyCards, StoryboardView, VideoBriefView, VisualDirection)

3.3 WHEN ExportPanel receives assets with valid signed URLs THEN it SHALL CONTINUE TO render download links and copy-to-clipboard buttons that work correctly

3.4 WHEN OutputDashboard receives `skippedOutputs` and `requestedOutputs` THEN it SHALL CONTINUE TO show SkippedNote for skipped output types and skeleton placeholders for pending output types

3.5 WHEN GenerationTimeline receives `currentState` and `steps` THEN it SHALL CONTINUE TO correctly show completed, active, pending, and skipped statuses for all pipeline stages including GeneratingGif

3.6 WHEN the backend proxy endpoint `/api/v1/assets/{path}` receives a request THEN it SHALL CONTINUE TO stream the file from GCS with the correct Content-Type header

3.7 WHEN the pipeline runner encounters non-critical stage failures THEN it SHALL CONTINUE TO add warnings and proceed to the next stage without failing the entire job

3.8 WHEN ComposePackage assembles the final asset bundle THEN it SHALL CONTINUE TO include all recorded assets (renderable and metadata) and fallback notices in the bundle manifest

3.9 WHEN the `handleComplete` callback runs THEN it SHALL CONTINUE TO call `setPhase('completed')` and `refreshJob()` to transition the UI to the results view

3.10 WHEN JSON metadata assets (AssetType.ImageConcept, AssetType.VideoBriefMeta, AssetType.GifCreativeDirection) are in the assets array THEN they SHALL CONTINUE TO appear in ExportPanel for download but SHALL NOT be rendered as inline media in the preview gallery
