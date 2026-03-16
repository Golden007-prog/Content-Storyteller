# Bugfix Requirements Document

## Introduction

The Content Storyteller media pipeline has a critical end-to-end asset generation bug. Text-based outputs (copy, storyboard, voiceover, hashtags) work correctly, but all binary media outputs — images, video, and GIF — fail to produce real deliverable files. The image generation capability returns text descriptions instead of binary image data. The video generation capability polls Veo but encounters transient errors and times out without producing an MP4. GIF generation depends on a completed video asset that never materializes. As a result, the "Download All" feature produces a ZIP of JSON metadata files instead of actual media, and the frontend cannot preview any images, videos, or GIFs because no real media URLs exist.

Additionally, the system's storage architecture needs to be upgraded to a three-tier model: AlloyDB for structured relational data, Firestore for real-time app state, and Cloud Storage for actual file payloads. The download behavior must be fixed so that ZIP bundles contain real media files instead of JSON-only artifacts. API responses must include signed URLs and preview/download URLs for all media assets. The frontend must render actual image thumbnails, HTML5 video players, and inline GIF previews. A migration layer must preserve backward compatibility with existing Firestore data. Live Agent and Trend Analyzer persistence must be updated to use AlloyDB for durable relational records while keeping Firestore for real-time session state.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the ImageGenerationCapability generates content THEN the system calls `generateContent` on a text model (Gemini) which returns a text description string, not binary image data, and the `isLikelyTextNotBinary` check correctly identifies it as text and records a fallback — but no actual image generation API (Imagen) is ever invoked, so no real `.png`/`.jpg` files are produced

1.2 WHEN the VideoGenerationCapability polls the Veo long-running operation THEN the system receives repeated transient errors (non-OK poll responses) and eventually times out after 5 minutes with `video-generation-timeout`, producing no `.mp4` file — the poll loop has no exponential backoff and uses a fixed 15-second interval regardless of error patterns

1.3 WHEN the GenerateGif stage checks for a completed video asset via `context.workingData.videoAssetPath` THEN the value is always undefined because the GenerateVideo stage never sets `videoAssetPath` in working data (it only sets `storyboardAssetPath` and `videoBriefAssetPath`), so GIF generation is always skipped with "No completed video asset found"

1.4 WHEN the GifGenerationCapability's `convertVideoToGif` method is called THEN it always returns `null` because the ffmpeg conversion logic is a placeholder stub with no actual implementation

1.5 WHEN the API `/jobs/:jobId/assets` endpoint returns asset references THEN it returns all asset types including metadata types (`image_concept`, `video_brief_meta`, `gif_creative_direction`) without distinguishing them from final deliverable types (`image`, `video`, `gif`), and the response lacks `previewUrl` or `downloadUrl` fields — only `signedUrl` is provided

1.6 WHEN the frontend ExportPanel triggers "Download All" via the `/jobs/:jobId/bundle?format=zip` endpoint THEN the ZIP contains only JSON metadata files (image concepts, video briefs, GIF creative direction) because no real binary media assets were ever written to Cloud Storage

1.7 WHEN the frontend OutputDashboard renders media sections THEN `imageUrls` and `videoUrl` are empty/undefined because the API poll response (`PollJobStatusResponse`) does not include signed URLs for media assets — the frontend has no mechanism to resolve asset references to renderable URLs

1.8 WHEN the Live Agent session processes user input THEN the system acts as a simple echo/prompt-response agent with a generic Creative Director persona, without integrating with Trend Analyzer data, without guiding users through structured creative direction gathering, and without the ability to hand off into generation flows with pre-populated parameters

### Expected Behavior (Correct)

2.1 WHEN the ImageGenerationCapability generates content THEN the system SHALL invoke the Vertex AI Imagen API (or equivalent image generation model from the model router's `image`/`imageHQ` slot) and capture actual binary image data (base64-encoded bytes or a file URI), persisting real `.png`/`.jpg` files to Cloud Storage with `AssetType.Image`

2.2 WHEN the VideoGenerationCapability polls the Veo long-running operation THEN the system SHALL use exponential backoff (starting at 15s, increasing to 30s, 60s, etc.) with configurable timeout, and SHALL log each poll iteration with structured metadata (pollCount, elapsedMs, status) to enable diagnosability of transient errors vs. permanent failures

2.3 WHEN the GenerateVideo stage successfully produces a video asset THEN the system SHALL set `context.workingData.videoAssetPath` to the Cloud Storage path of the completed `.mp4` file so that the downstream GenerateGif stage can find and convert it

2.4 WHEN the GifGenerationCapability converts a video to GIF THEN the system SHALL implement actual ffmpeg-based conversion (writing the video buffer to a temp file, running `ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" -loop 0 output.gif`, reading the output) and return real base64-encoded GIF data

2.5 WHEN the API `/jobs/:jobId/assets` endpoint returns asset references THEN the system SHALL include `previewUrl` and `downloadUrl` fields for each asset, SHALL distinguish final deliverable assets (`image`, `video`, `gif`, `copy`, `storyboard`, `voiceover_script`) from fallback metadata assets (`image_concept`, `video_brief_meta`, `gif_creative_direction`) with a `isFallback` flag, and SHALL NOT surface fallback metadata as downloadable media

2.6 WHEN the frontend ExportPanel triggers "Download All" THEN the system SHALL produce a ZIP containing real binary media files (`.png`, `.mp4`, `.gif`) alongside text deliverables (`.txt`/`.md`), plus a `manifest.json` for metadata — not a ZIP of only JSON files

2.7 WHEN the frontend OutputDashboard renders media sections THEN the system SHALL resolve asset references to signed URLs and render images with `<img>` tags, videos with `<video controls>` elements, and GIFs as animated `<img>` elements — showing actual media previews rather than empty placeholders

2.8 WHEN the Live Agent session processes user input THEN the system SHALL behave as a real AI Creative Director that can query Trend Analyzer for current trends, guide users conversationally through platform/tone/audience selection, and hand off into generation flows with the extracted creative direction pre-populated

### Unchanged Behavior (Regression Prevention)

3.1 WHEN text-based outputs (copy, storyboard text, voiceover script, hashtags) are generated THEN the system SHALL CONTINUE TO produce correct text content, persist it to Cloud Storage as JSON, and display it in the frontend CopyCards, StoryboardView, and VoiceoverView components

3.2 WHEN the Creative Brief is generated from user input during the ProcessInput stage THEN the system SHALL CONTINUE TO extract target audience, tone, key messages, visual direction, and campaign angle correctly

3.3 WHEN image generation capability is unavailable (access denied, model unavailable) THEN the system SHALL CONTINUE TO fall back gracefully by persisting ImageConcept metadata as `AssetType.ImageConcept` and recording a `FallbackNotice`

3.4 WHEN video generation capability is unavailable or times out THEN the system SHALL CONTINUE TO fall back gracefully by persisting Storyboard and VideoBrief metadata and recording a `FallbackNotice` with the specific reason

3.5 WHEN GIF generation capability is unavailable (no ffmpeg, no video input) THEN the system SHALL CONTINUE TO fall back gracefully by persisting GIF creative direction metadata and recording a `FallbackNotice`

3.6 WHEN the output intent planner resolves requested outputs based on platform, tone, and output preference THEN the system SHALL CONTINUE TO correctly determine which pipeline stages to run and which to skip

3.7 WHEN the API `/jobs/:jobId` poll endpoint is called THEN the system SHALL CONTINUE TO return the current job state, creative brief, platform, tone, requested/skipped outputs, and output intent

3.8 WHEN the Trend Analyzer is queried independently (outside Live Agent) THEN the system SHALL CONTINUE TO return trend analysis results via the `/api/v1/trends` endpoint without any changes to scoring, normalization, or provider logic

3.9 WHEN the model router initializes and resolves capability slots with fallback chains THEN the system SHALL CONTINUE TO walk fallback chains, cache availability, and surface degraded/unavailable status correctly

---

## Storage Architecture Requirements

### Current Behavior (Defect)

4.1 WHEN the system persists structured media records (asset metadata, job relationships, generation history) THEN it stores everything in Firestore as flat document collections, which lacks relational integrity, JOIN capability, and efficient cross-entity queries

4.2 WHEN the system stores generated media files (images, videos, GIFs) THEN there is no clear separation between metadata records and binary file payloads — asset references point to Cloud Storage paths but the metadata itself is embedded in Firestore job documents without a dedicated relational schema

### Expected Behavior (Correct)

5.1 WHEN the system persists structured media records THEN the system SHALL use AlloyDB for relational asset metadata including: asset records, media generation jobs, media output metadata, package composition records, prompt history, generation status history, asset-to-job relationships, job-to-user relationships, trend-to-package relationships, downloadable artifact registry, and retry/failure/timeout audit rows

5.2 WHEN the system stores generated media files THEN the system SHALL store actual binary file payloads (images, videos, GIFs, uploaded user assets, packaged ZIP downloads, downloadable TXT/JSON/subtitle/storyboard files) in Google Cloud Storage — NOT inside AlloyDB

5.3 WHEN the system manages real-time application state THEN the system SHALL use Firestore for: active job progress state, pipeline status display, live UI subscriptions, temporary session state, trend analyzer result cache for UI, live agent real-time conversation state, and fast frontend reads for in-progress jobs

5.4 WHEN the system creates an asset record in AlloyDB THEN the record SHALL include at minimum: asset_id, project_id, job_id, asset_type (copy, image, video, gif, storyboard, txt, zip, voiceover, thumbnail), mime_type, storage_path, signed_url, public_url, preview_url, status, source_model, generation_prompt, derived_from_asset_id, width, height, duration_seconds, file_size_bytes, checksum, created_at, updated_at

5.5 WHEN the system defines AlloyDB entities THEN the schema SHALL include tables for: users, projects, jobs, assets, asset_versions, packages, package_assets, trend_reports, live_agent_sessions, live_agent_messages, generation_events, tool_invocations

5.6 WHEN the system enforces the storage policy THEN the system SHALL follow: Firestore = real-time app state and lightweight documents, AlloyDB = durable structured business data and relationships, Cloud Storage = actual file payloads — and SHALL NOT store raw image files, raw video files, GIF binaries, or large media blobs directly inside AlloyDB

### Unchanged Behavior (Regression Prevention)

6.1 WHEN existing Firestore collections (jobs, trendQueries, liveSessions) contain data THEN the system SHALL CONTINUE TO read from Firestore for backward compatibility until migration is complete

6.2 WHEN the system reads job state for real-time UI updates THEN the system SHALL CONTINUE TO use Firestore for fast frontend reads and SSE event sourcing

---

## Download Behavior Requirements

### Current Behavior (Defect)

7.1 WHEN the user triggers "Download All" THEN the system produces a ZIP containing only JSON metadata files (image concepts, video briefs, GIF creative direction) because no real binary media assets exist in Cloud Storage

7.2 WHEN individual asset downloads are attempted THEN image and video outputs are not exposed as downloadable files — only JSON metadata is available

### Expected Behavior (Correct)

8.1 WHEN the system generates an image THEN the system SHALL save the real image file (.png/.jpg) to Cloud Storage and create a corresponding asset record with a downloadable URL

8.2 WHEN the system generates a video THEN the system SHALL save the real video file (.mp4) to Cloud Storage and create a corresponding asset record with a downloadable URL

8.3 WHEN the system generates a GIF THEN the system SHALL save the real GIF file (.gif) or MP4 loop asset to Cloud Storage and create a corresponding asset record with a downloadable URL

8.4 WHEN the system generates text assets THEN each text asset SHALL be exportable as .txt or .md where appropriate — storyboard as .txt and optionally .json, copy package as .txt or .md

8.5 WHEN the user triggers "Download All" for a full package THEN the ZIP SHALL contain actual files: copy-package.txt, caption.txt, hashtags.txt, call-to-action.txt, voiceover-script.txt, on-screen-text.txt, storyboard.txt, storyboard.json, image-1.png/jpg, image-2.png/jpg, image-3.png/jpg, final-video.mp4, loop.gif or loop.mp4, and package-manifest.json

8.6 WHEN the ZIP includes a package-manifest.json THEN the manifest SHALL be supplemental only — it SHALL NOT be the only meaningful downloadable output in the ZIP

### Unchanged Behavior (Regression Prevention)

9.1 WHEN the user requests a JSON manifest (no ?format=zip) THEN the system SHALL CONTINUE TO return the JSON manifest response unchanged

---

## API and Backend Media Output Requirements

### Current Behavior (Defect)

10.1 WHEN image/video/GIF generation completes THEN the system does not consistently persist actual output files to Cloud Storage, does not create proper asset rows with download/preview URLs, and does not publish lightweight UI state updates to Firestore

### Expected Behavior (Correct)

11.1 WHEN image/video/GIF generation completes THEN the system SHALL: (a) persist the actual output file to Cloud Storage, (b) create/update the asset row in AlloyDB, (c) publish lightweight UI state to Firestore, (d) expose download and preview URLs through the API

11.2 WHEN the frontend receives asset data for each asset THEN the API response SHALL include: id, type, title, mimeType, previewUrl, downloadUrl, signedUrl (if needed), status, sourceModel, fileSize, duration (if video/gif), width/height (if image/video)

### Unchanged Behavior (Regression Prevention)

12.1 WHEN the API returns job status via the poll endpoint THEN the system SHALL CONTINUE TO return all existing fields (jobId, state, assets, creativeBrief, platform, tone, requestedOutputs, skippedOutputs, outputIntent)

---

## Signed URL and Preview Handling Requirements

### Current Behavior (Defect)

13.1 WHEN the system generates signed URLs THEN it only provides a single `signedUrl` field without distinguishing between preview and download use cases, and when signed URL generation fails the error is not surfaced clearly to the frontend

### Expected Behavior (Correct)

14.1 WHEN the system serves private assets from Cloud Storage THEN the system SHALL generate signed URLs for each asset and provide both `previewUrl` (for rendering in cards) and `downloadUrl` (for download buttons)

14.2 WHEN signed URL generation fails THEN the system SHALL log the error clearly and surface a useful fallback message to the frontend — it SHALL NOT silently downgrade to JSON-only artifacts when a media file exists

### Unchanged Behavior (Regression Prevention)

15.1 WHEN the existing `signedUrl` field is used by current frontend code THEN the system SHALL CONTINUE TO provide the `signedUrl` field for backward compatibility

---

## Media Rendering Requirements

### Current Behavior (Defect)

16.1 WHEN the frontend renders image outputs THEN no image thumbnails are shown because `imageUrls` is empty — there is no click-to-enlarge preview and no real image file download

16.2 WHEN the frontend renders video outputs THEN no HTML5 video player is shown because `videoUrl` is undefined — there is no thumbnail/poster and no real .mp4 download

16.3 WHEN the frontend renders GIF outputs THEN no inline preview is shown — if the system internally generates MP4 first, it is not converted to GIF or exposed as both formats

### Expected Behavior (Correct)

17.1 WHEN the frontend renders image outputs THEN the system SHALL show image thumbnails directly in the result UI, clicking SHALL open a larger preview, and download SHALL save the real image file

17.2 WHEN the frontend renders video outputs THEN the system SHALL show an HTML5 video player in the result UI with thumbnail/poster if available, and download SHALL save the real .mp4 file

17.3 WHEN the frontend renders GIF outputs THEN the system SHALL show an inline preview, SHALL expose both loop.mp4 and loop.gif if the system generates MP4 first, and the download button SHALL clearly indicate the actual file type

### Unchanged Behavior (Regression Prevention)

18.1 WHEN the frontend renders text-based outputs (CopyCards, StoryboardView, VoiceoverView) THEN the system SHALL CONTINUE TO render these components identically with no visual or functional changes

---

## Migration and Implementation Requirements

### Current Behavior (Defect)

19.1 WHEN the current system stores asset records THEN it stores only JSON asset records in Firestore job documents without a dedicated relational schema, making it impossible to query assets across jobs or maintain relational integrity

### Expected Behavior (Correct)

20.1 WHEN the system introduces AlloyDB for relational asset metadata THEN the system SHALL NOT break existing Firestore data — it SHALL add a migration-safe layer that introduces AlloyDB alongside Firestore

20.2 WHEN the system migrates to AlloyDB THEN the system SHALL keep backward compatibility for existing jobs — for legacy records without real media files, the system SHALL clearly mark them as metadata-only legacy assets

### Unchanged Behavior (Regression Prevention)

21.1 WHEN existing jobs created before the migration are queried THEN the system SHALL CONTINUE TO return their data correctly from Firestore without errors

---

## Live Agent and Trend Analyzer Persistence Requirements

### Current Behavior (Defect)

22.1 WHEN the Live Agent stores conversation history and tool usage THEN it stores everything in Firestore liveSessions collection as flat documents, without relational structure for querying across sessions or linking to generation outcomes

22.2 WHEN the Trend Analyzer stores analysis results THEN it stores them in Firestore trendQueries collection without relational links to content recommendations, accepted/rejected suggestions, or generation handoff records

### Expected Behavior (Correct)

23.1 WHEN the system persists Live Agent data THEN the system SHALL store in AlloyDB: live agent conversation history, tool usage history, trend analysis records, content recommendation decisions, accepted/rejected suggestions, and generation handoff records

23.2 WHEN the system manages real-time Live Agent state THEN the system SHALL keep in Firestore: active live session state, in-progress tool status, streaming UI updates, and temporary conversational status

### Unchanged Behavior (Regression Prevention)

24.1 WHEN existing live sessions and trend queries are accessed THEN the system SHALL CONTINUE TO read from Firestore for backward compatibility until migration is complete

---

## Deliverables Requirements

### Expected Behavior (Correct)

25.1 WHEN the implementation is complete THEN the deliverables SHALL include: exact files changed, AlloyDB schema added, Firestore collections kept, Cloud Storage path strategy, API response shape for media assets, documentation of how actual images/videos/GIFs are persisted and downloaded, how ZIP packaging now includes real files instead of JSON-only assets, and manual verification steps for image preview, video preview, GIF preview, and full-package download
