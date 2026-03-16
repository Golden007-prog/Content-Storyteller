# Implementation Plan

- [x] 1. Write bug condition exploration tests (BEFORE implementing fixes)
  - **Property 1: Bug Condition** - Media Pipeline Produces Only Metadata, No Real Binary Assets
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate all 8 original defects exist
  - Test file: `apps/worker/src/__tests__/media-pipeline-exploration.property.test.ts` (worker defects 1-4)
  - Test file: `apps/api/src/__tests__/media-pipeline-exploration.property.test.ts` (API defects 5-6)
  - Test file: `apps/web/src/__tests__/media-pipeline-exploration.property.test.tsx` (frontend defect 7)
  - **Defect 1 — Image Generation Returns Text Not Binary**: Mock VertexAI, call `ImageGenerationCapability.generate()`, assert assets[0] is valid base64 binary. Expect FAILURE.
  - **Defect 2 — Video Polling Uses Fixed Interval**: Instrument sleep durations, simulate transient errors, assert intervals increase. Expect FAILURE.
  - **Defect 3 — videoAssetPath Never Set**: Mock successful video capability, run `GenerateVideo.execute()`, assert `context.workingData.videoAssetPath` defined. Expect FAILURE.
  - **Defect 4 — GIF Conversion Stub Returns Null**: Call `convertVideoToGif()` with valid input, assert non-null. Expect FAILURE.
  - **Defect 5 — Assets Endpoint Missing isFallback/previewUrl/downloadUrl**: Mock completed job, call GET assets, assert enriched fields. Expect FAILURE.
  - **Defect 6 — ZIP Contains Only JSON Metadata**: Request ZIP bundle, assert manifest.json present. Expect FAILURE.
  - **Defect 7 — Frontend imageUrls/videoUrl Empty**: Render OutputDashboard with asset refs, assert media elements rendered. Expect FAILURE.
  - **Defect 8 — Live Agent No Trend Integration**: Call processLiveInput with trend question, assert trend data in response. Expect FAILURE.
  - Run tests on UNFIXED code — EXPECTED: all FAIL
  - _Requirements: 1.1-1.8_

- [x] 2. Write preservation property tests (BEFORE implementing fixes)
  - **Property 2: Preservation** - Text Outputs, Fallback Behavior, Pipeline Orchestration, Trend Analyzer, Model Router, Firestore Data Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `apps/worker/src/__tests__/media-pipeline-preservation.property.test.ts`
  - Test file: `apps/api/src/__tests__/media-pipeline-preservation.property.test.ts`
  - Test file: `apps/web/src/__tests__/media-pipeline-preservation.property.test.tsx`
  - **Preservation A — Text Output Generation**: Verify text-based outputs generated and persisted correctly
  - **Preservation B — Fallback Behavior**: Verify FallbackNotice recorded when capabilities unavailable
  - **Preservation C — Output Intent Resolution**: Verify resolveOutputIntent maps correctly for all Platform/Tone/OutputPreference combos
  - **Preservation D — Job Poll Endpoint**: Verify GET /jobs/:jobId returns all required fields
  - **Preservation E — Trend Analyzer Standalone**: Verify trend analysis returns correct results
  - **Preservation F — Model Router Resolution**: Verify getModel(slot) returns non-empty string for all slots
  - **Preservation G — Frontend Text Component Rendering**: Verify CopyCards, StoryboardView, VoiceoverView render correctly
  - Verify all preservation tests PASS on UNFIXED code
  - _Requirements: 3.1-3.9, 6.1, 6.2, 9.1, 12.1, 15.1, 18.1, 21.1, 24.1_

- [x] 3. Fix Defect 1 — ImageGenerationCapability uses Imagen API for real binary images
  - [x] 3.1 Implement Imagen API integration in `apps/worker/src/capabilities/image-generation.ts`
    - Replace `vertexAI.getGenerativeModel().generateContent()` with Vertex AI Imagen REST API call
    - Use `google-auth-library` GoogleAuth for access token
    - Build Imagen endpoint: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`
    - Send: `{ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }`
    - Parse: `predictions[0].bytesBase64Encoded`
    - Preserve fallback on 403/401
    - _Requirements: 2.1, 3.3_
  - [x] 3.2 Verify exploration test for Defect 1 now passes
    - Re-run SAME test from task 1 — EXPECTED: PASSES
    - _Requirements: 2.1_
  - [x] 3.3 Verify preservation tests still pass
    - Re-run SAME tests from task 2 — EXPECTED: PASSES

- [x] 4. Fix Defect 2 — VideoGenerationCapability polling with exponential backoff
  - [x] 4.1 Implement exponential backoff in `apps/worker/src/capabilities/video-generation.ts`
    - Replace fixed sleep with dynamic interval: 15s → 30s → 60s → 120s (cap) after transient errors
    - Reset to 15s after successful poll
    - Add structured per-poll logging: `{ pollCount, elapsedMs, currentIntervalMs, status }`
    - Make timeout configurable via `VIDEO_GENERATION_TIMEOUT_MS` env var
    - Track consecutive transient errors; warn if > 5
    - _Requirements: 2.2, 3.4_
  - [x] 4.2 Verify exploration test for Defect 2 now passes
    - _Requirements: 2.2_
  - [x] 4.3 Verify preservation tests still pass

- [x] 5. Fix Defect 3 — GenerateVideo sets videoAssetPath in working data
  - [x] 5.1 Add `context.workingData.videoAssetPath = videoStoragePath` in `apps/worker/src/pipeline/generate-video.ts`
    - Inside the `for (const assetData of genResult.assets)` loop after writeAsset and recordAssetReference
    - Guard with `if (!context.workingData.videoAssetPath)`
    - _Requirements: 2.3, 3.4_
  - [x] 5.2 Verify exploration test for Defect 3 now passes
    - _Requirements: 2.3_
  - [x] 5.3 Verify preservation tests still pass

- [x] 6. Fix Defect 4 — GifGenerationCapability implements real ffmpeg conversion
  - [x] 6.1 Implement `convertVideoToGif()` in `apps/worker/src/capabilities/gif-generation.ts`
    - Decode base64 video buffer → write to temp file
    - Or download from Cloud Storage if videoAssetPath provided
    - Run `ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" -loop 0 output.gif` with 60s timeout
    - Read output GIF → return base64 string
    - Cleanup temp files in finally block
    - Use `os.tmpdir()` and `crypto.randomUUID()` for temp paths
    - _Requirements: 2.4, 3.5_
  - [x] 6.2 Verify exploration test for Defect 4 now passes
    - _Requirements: 2.4_
  - [x] 6.3 Verify preservation tests still pass

- [x] 7. Fix Defect 5 — API assets endpoint with isFallback, previewUrl, downloadUrl
  - [x] 7.1 Implement enriched asset response in `apps/api/src/routes/jobs.ts`
    - Add `isFallback`, `previewUrl`, `downloadUrl` to each asset in GET /:jobId/assets
    - Define fallback types: `['image_concept', 'video_brief_meta', 'gif_creative_direction']`
    - Define renderable types: `['image', 'video', 'gif']`
    - _Requirements: 2.5, 11.2, 14.1, 3.7_
  - [x] 7.2 Update `AssetReferenceWithUrl` in `packages/shared/src/types/api.ts`
    - Add optional fields: `isFallback`, `previewUrl`, `downloadUrl`, `title`, `mimeType`, `fileSize`, `width`, `height`, `durationSeconds`, `sourceModel`
    - _Requirements: 11.2_
  - [x] 7.3 Verify exploration test for Defect 5 now passes
    - _Requirements: 2.5_
  - [x] 7.4 Verify preservation tests still pass

- [x] 8. Fix Defect 6 — ZIP bundle includes real binary media and manifest.json
  - [x] 8.1 Implement improved ZIP bundling in `apps/api/src/routes/jobs.ts`
    - Filter deliverables vs fallback metadata
    - Use descriptive filenames: image-1.png, video.mp4, animation.gif, copy-package.txt, etc.
    - Place fallback metadata in `metadata/` subdirectory
    - Generate manifest.json with asset metadata at ZIP root
    - Include text deliverables as .txt files: copy-package.txt, caption.txt, hashtags.txt, call-to-action.txt, voiceover-script.txt, on-screen-text.txt, storyboard.txt
    - Include storyboard.json alongside storyboard.txt
    - _Requirements: 2.6, 8.1-8.6, 9.1_
  - [x] 8.2 Verify exploration test for Defect 6 now passes
    - _Requirements: 2.6_
  - [x] 8.3 Verify preservation tests still pass

- [x] 9. Fix Defect 7 — Frontend media rendering with signed URLs
  - [x] 9.1 Implement media URL resolution in `apps/web/src/hooks/useSSE.ts` and parent components
    - Extract signedUrl from assets by assetType (image, video, gif)
    - Populate imageUrls, videoUrl, gifAsset from SSE event data
    - _Requirements: 2.7, 17.1, 17.2, 17.3_
  - [x] 9.2 Update `apps/web/src/components/OutputDashboard.tsx` and child components
    - VisualDirection: render `<img src={url}>` for images with click-to-enlarge
    - VideoBriefView: render `<video controls src={videoUrl}>` with poster
    - GifPreview: render `<img src={gifUrl}>` with format indicator on download button
    - _Requirements: 17.1, 17.2, 17.3, 18.1_
  - [x] 9.3 Verify exploration test for Defect 7 now passes
    - _Requirements: 2.7_
  - [x] 9.4 Verify preservation tests still pass

- [x] 10. Fix Defect 8 — Live Agent with Trend Analyzer integration
  - [x] 10.1 Implement Trend Analyzer integration in `apps/api/src/services/live-session.ts`
    - Import analyzeTrends, query when platform/domain keywords detected
    - Include top 3-5 trends in agent system prompt
    - Guide structured creative direction gathering
    - Trend-aware responses with hashtag suggestions
    - _Requirements: 2.8, 3.8_
  - [x] 10.2 Update `apps/web/src/components/LiveAgentPanel.tsx` for trend-aware UI
    - Visual indicators for trend references, "Explore Trends" quick action
    - _Requirements: 2.8_
  - [x] 10.3 Verify exploration test for Defect 8 now passes
    - _Requirements: 2.8_
  - [x] 10.4 Verify preservation tests still pass

- [x] 11. Implement AlloyDB storage layer and schema
  - [x] 11.1 Create AlloyDB schema file `apps/api/src/services/alloydb-schema.sql`
    - Define all tables: users, projects, jobs, assets, asset_versions, packages, package_assets, trend_reports, live_agent_sessions, live_agent_messages, generation_events, tool_invocations
    - Include indexes on assets(job_id), assets(asset_type), assets(status)
    - Asset table must include: asset_id, project_id, job_id, asset_type, mime_type, storage_path, signed_url, public_url, preview_url, status, source_model, generation_prompt, derived_from_asset_id, width, height, duration_seconds, file_size_bytes, checksum, is_fallback, created_at, updated_at
    - _Requirements: 5.4, 5.5_
  - [x] 11.2 Create AlloyDB service `apps/api/src/services/alloydb.ts`
    - Connection pool using `pg` library with AlloyDB connection string from env
    - CRUD operations: createAsset, getAssetsByJobId, updateAssetStatus, createGenerationEvent
    - Query helpers: getAssetsByType, getAssetWithVersions
    - _Requirements: 5.1, 5.6_
  - [x] 11.3 Add AlloyDB connection config to `apps/api/src/config/gcp.ts`
    - Add `alloydbConnectionString` to GCP config from `ALLOYDB_CONNECTION_STRING` env var
    - _Requirements: 5.1_

- [x] 12. Implement migration-safe dual-write layer
  - [x] 12.1 Update `apps/api/src/services/firestore.ts` with dual-write logic
    - On createJob/updateJob: write to both Firestore and AlloyDB
    - On asset creation: write asset record to AlloyDB, keep job-level asset array in Firestore for real-time
    - Read-through: AlloyDB for relational queries, Firestore for real-time UI state
    - _Requirements: 20.1, 20.2, 6.1, 6.2_
  - [x] 12.2 Add legacy record handling
    - For existing Firestore records without AlloyDB counterparts: read from Firestore, mark as legacy
    - For new records: dual-write to both stores
    - _Requirements: 20.2, 21.1_
  - [x] 12.3 Update worker `apps/worker/src/services/firestore.ts` with dual-write for asset recording
    - `recordAssetReference` should write to both Firestore (for SSE) and AlloyDB (for relational)
    - _Requirements: 5.1, 11.1_

- [x] 13. Update Live Agent and Trend Analyzer persistence
  - [x] 13.1 Update `apps/api/src/services/live-session.ts` for AlloyDB persistence
    - On session end: persist conversation history to AlloyDB live_agent_sessions and live_agent_messages tables
    - On tool invocation: record to AlloyDB tool_invocations table
    - Keep active session state in Firestore for real-time
    - _Requirements: 23.1, 23.2_
  - [x] 13.2 Update trend analysis to persist to AlloyDB
    - After trend analysis: write results to AlloyDB trend_reports table
    - Keep Firestore trendQueries for UI cache
    - _Requirements: 23.1, 24.1_

- [x] 14. Update Cloud Storage path strategy and file persistence
  - [x] 14.1 Update storage path conventions in worker pipeline stages
    - Images: `{project_id}/{job_id}/images/image-{uuid}.png`
    - Video: `{project_id}/{job_id}/video/{uuid}.mp4`
    - GIF: `{project_id}/{job_id}/gif/{uuid}.gif` and `{uuid}-loop.mp4`
    - Copy: `{project_id}/{job_id}/copy/copy-package.txt`, `caption.txt`, `hashtags.txt`, etc.
    - Voiceover: `{project_id}/{job_id}/voiceover/voiceover-script.txt`, `on-screen-text.txt`
    - Storyboard: `{project_id}/{job_id}/storyboard/storyboard.txt`, `storyboard.json`
    - _Requirements: 5.2, 8.1-8.4_
  - [x] 14.2 Ensure text assets are persisted as .txt files alongside JSON
    - Copy package → copy-package.txt (human-readable) + copy-package.json (structured)
    - Storyboard → storyboard.txt + storyboard.json
    - Voiceover → voiceover-script.txt
    - _Requirements: 8.4_

- [x] 15. Implement signed URL fallback and error handling
  - [x] 15.1 Update `apps/api/src/services/storage.ts` generateSignedUrl
    - On failure: log error with asset details, return fallback message URL or empty string
    - Never silently downgrade to JSON-only when media file exists
    - Surface error reason in API response metadata
    - _Requirements: 14.1, 14.2, 15.1_
  - [x] 15.2 Update asset endpoint to handle signed URL failures gracefully
    - If signedUrl generation fails for a media asset, include error metadata in response
    - Do not omit the asset — return it with empty URLs and error flag
    - _Requirements: 14.2_

- [x] 16. Checkpoint — Verify all original defect fixes
  - Run all exploration tests (task 1) — all should PASS after fixes
  - Run all preservation tests (task 2) — all should still PASS
  - Verify worker tests: `cd apps/worker && npx vitest --run`
  - Verify API tests: `cd apps/api && npx vitest --run`
  - Verify web tests: `cd apps/web && npx vitest --run`
  - Verify shared tests: `cd packages/shared && npx vitest --run`

- [x] 17. Write integration tests for new storage architecture
  - [x] 17.1 Write AlloyDB integration tests
    - Test asset CRUD operations against AlloyDB
    - Test dual-write: verify data appears in both Firestore and AlloyDB
    - Test legacy read: verify Firestore-only records still readable
    - Test asset query by job_id, asset_type, status
    - _Requirements: 5.1, 5.4, 20.1, 20.2, 21.1_
  - [x] 17.2 Write download/ZIP integration tests
    - Test full package ZIP contains expected files: copy-package.txt, images, video.mp4, loop.gif, storyboard files, manifest.json
    - Test manifest.json is supplemental (not the only file)
    - Test individual asset downloads return real files
    - _Requirements: 8.1-8.6_
  - [x] 17.3 Write media rendering integration tests
    - Test image preview: thumbnails render, click-to-enlarge works, download saves real file
    - Test video preview: HTML5 player renders, download saves .mp4
    - Test GIF preview: inline preview renders, format indicator on download
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 18. Final checkpoint — Full regression and verification
  - Run all test suites across all packages
  - Verify manual verification steps:
    1. Image preview: submit job → thumbnails appear → click enlarge → download real .png/.jpg
    2. Video preview: submit job → video player appears → play → download real .mp4
    3. GIF preview: submit job → inline GIF → both .gif and .mp4 available → download shows type
    4. Full package: submit job → Download All → ZIP contains all expected files
    5. AlloyDB: query assets table → records exist → no binary data in DB → Cloud Storage paths valid
    6. Migration: legacy job returns data from Firestore → new job writes to both stores
  - Document deliverables:
    - Exact files changed
    - AlloyDB schema added
    - Firestore collections kept
    - Cloud Storage path strategy
    - API response shape for media assets
    - How images/videos/GIFs are persisted and downloaded
    - How ZIP packaging includes real files
    - _Requirements: 25.1_
