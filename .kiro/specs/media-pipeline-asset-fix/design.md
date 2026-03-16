# Media Pipeline Asset Fix — Bugfix Design

## Overview

The Content Storyteller media pipeline produces correct text-based outputs (copy, storyboard, voiceover, hashtags) but fails to deliver real binary media assets (images, video, GIF). Eight interconnected defects span the worker capabilities, API asset endpoints, frontend rendering, and Live Agent integration. Additionally, the storage architecture must be upgraded to a three-tier model: AlloyDB for structured relational data, Firestore for real-time app state, and Cloud Storage for actual file payloads. Download behavior must produce real media files in ZIP bundles, API responses must include signed/preview/download URLs, the frontend must render actual media previews, and a migration layer must preserve backward compatibility.

## Glossary

- **Bug_Condition (C)**: The composite condition across 8 original defects plus storage/download/rendering defects that causes the media pipeline to produce only metadata/fallback assets instead of real binary media
- **Property (P)**: The desired behavior — real binary images, video, and GIF files are generated, persisted to Cloud Storage, tracked in AlloyDB, served with signed URLs, and rendered in the frontend
- **Preservation**: Existing text-based outputs, fallback behavior, output intent planning, model router resolution, Trend Analyzer standalone functionality, and existing Firestore data must remain unchanged
- **AlloyDB**: Google Cloud AlloyDB PostgreSQL-compatible database for structured relational data
- **Three-Tier Storage**: Cloud Storage (file payloads) + AlloyDB (relational metadata) + Firestore (real-time app state)
- **ImageGenerationCapability**: Class in `apps/worker/src/capabilities/image-generation.ts` — currently calls a text model instead of Imagen
- **VideoGenerationCapability**: Class in `apps/worker/src/capabilities/video-generation.ts` — currently uses fixed 15s polling with no backoff
- **GifGenerationCapability**: Class in `apps/worker/src/capabilities/gif-generation.ts` — currently a stub returning `null`
- **GenerateVideo**: Pipeline stage in `apps/worker/src/pipeline/generate-video.ts` — does not propagate `videoAssetPath` to working data
- **isFallback**: A boolean flag to distinguish metadata/creative-direction assets from final deliverable assets

## Three-Tier Storage Architecture

### Cloud Storage (File Payloads)

Stores all actual binary files:
- Generated images (.png, .jpg)
- Generated videos (.mp4)
- Generated GIFs (.gif) and MP4 loops
- Uploaded user assets
- Packaged ZIP downloads
- Downloadable TXT/JSON/subtitle/storyboard files

**Path Strategy:**
```
{bucket}/
  {project_id}/
    {job_id}/
      images/        → image-{uuid}.png
      video/         → {uuid}.mp4
      gif/           → {uuid}.gif, {uuid}-loop.mp4
      copy/          → copy-package.txt, caption.txt, hashtags.txt, call-to-action.txt
      voiceover/     → voiceover-script.txt, on-screen-text.txt
      storyboard/    → storyboard.txt, storyboard.json
      package/       → content-package-{job_id}.zip
      metadata/      → image-concept.json, video-brief.json, gif-direction.json
  uploads/
    {user_id}/       → uploaded user assets
```

### AlloyDB (Structured Relational Data)

Stores durable business data with relational integrity:

**Core Schema:**

```sql
-- Users and Projects
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs
CREATE TABLE jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id),
  user_id UUID REFERENCES users(user_id),
  correlation_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  state VARCHAR(50) NOT NULL DEFAULT 'queued',
  platform VARCHAR(50),
  tone VARCHAR(50),
  output_preference VARCHAR(50) DEFAULT 'auto',
  prompt_text TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets (core table)
CREATE TABLE assets (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id),
  job_id UUID REFERENCES jobs(job_id) NOT NULL,
  asset_type VARCHAR(50) NOT NULL, -- copy, image, video, gif, storyboard, txt, zip, voiceover, thumbnail
  mime_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  signed_url TEXT,
  public_url TEXT,
  preview_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, completed, failed, skipped
  source_model VARCHAR(100),
  generation_prompt TEXT,
  derived_from_asset_id UUID REFERENCES assets(asset_id),
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC(10,2),
  file_size_bytes BIGINT,
  checksum VARCHAR(128),
  is_fallback BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_job_id ON assets(job_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_status ON assets(status);

-- Asset Versions (for re-generation tracking)
CREATE TABLE asset_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(asset_id) NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  checksum VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packages
CREATE TABLE packages (
  package_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(job_id) NOT NULL,
  storage_path TEXT, -- path to ZIP in Cloud Storage
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE package_assets (
  package_id UUID REFERENCES packages(package_id),
  asset_id UUID REFERENCES assets(asset_id),
  filename_in_zip VARCHAR(255),
  PRIMARY KEY (package_id, asset_id)
);

-- Trend Reports
CREATE TABLE trend_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT,
  platform VARCHAR(50),
  domain VARCHAR(100),
  region VARCHAR(50),
  results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Live Agent Sessions (durable records)
CREATE TABLE live_agent_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  extracted_direction JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE live_agent_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_agent_sessions(session_id) NOT NULL,
  role VARCHAR(20) NOT NULL, -- user, agent
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generation Events (audit trail)
CREATE TABLE generation_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(job_id),
  stage VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- started, completed, failed, timeout, fallback
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tool Invocations (Live Agent tool usage)
CREATE TABLE tool_invocations (
  invocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES live_agent_sessions(session_id),
  tool_name VARCHAR(100) NOT NULL,
  input_params JSONB,
  output_result JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Firestore (Real-Time App State)

Keeps existing collections for real-time UI needs:
- `jobs` — active job progress state, pipeline status display, SSE event sourcing
- `liveSessions` — active live session state, streaming UI updates, temporary conversational status
- `trendQueries` — trend analyzer result cache for UI, fast frontend reads

**Storage Policy:** Firestore = real-time app state and lightweight documents. AlloyDB = durable structured business data and relationships. Cloud Storage = actual file payloads. Raw image/video/GIF binaries MUST NOT be stored in AlloyDB.

## Bug Details

### Bug Condition

The bug manifests across 8 interconnected defects in the media pipeline plus storage architecture, download behavior, and rendering gaps. The system generates text-based outputs correctly but fails to produce, serve, or render any binary media.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PipelineExecution
  OUTPUT: boolean

  // Defect 1: Image generation uses text model instead of Imagen API
  LET imageUsesTextModel = input.imageCapability.generate() calls
      VertexAI.getGenerativeModel().generateContent() with text-only prompt
      AND returns text string instead of base64 binary data

  // Defect 2: Video polling has no exponential backoff
  LET videoPollingNoBackoff = input.videoCapability.pollForCompletion()
      uses fixed VIDEO_POLL_INTERVAL_MS = 15000
      AND does NOT increase interval on transient errors

  // Defect 3: videoAssetPath never set in working data
  LET videoPathMissing = input.generateVideoStage completes successfully
      AND context.workingData.videoAssetPath IS undefined

  // Defect 4: GIF conversion is a stub
  LET gifConversionStub = input.gifCapability.convertVideoToGif()
      ALWAYS returns null

  // Defect 5: Assets endpoint lacks previewUrl/downloadUrl and isFallback
  LET assetsEndpointIncomplete = input.assetsResponse contains
      metadata types WITHOUT isFallback flag AND WITHOUT previewUrl/downloadUrl

  // Defect 6: ZIP contains only JSON metadata
  LET zipOnlyMetadata = input.bundleEndpoint produces ZIP
      WHERE ALL files are .json metadata AND NO binary media files exist

  // Defect 7: Frontend cannot render media
  LET frontendNoMedia = input.outputDashboard.imageUrls IS empty
      AND input.outputDashboard.videoUrl IS undefined

  // Defect 8: Live Agent is a generic echo agent
  LET liveAgentGeneric = input.liveSession.processLiveInput()
      does NOT query TrendAnalyzer

  // Defect 9: No relational storage for asset metadata
  LET noRelationalStorage = input.assetMetadata stored ONLY in Firestore
      WITHOUT AlloyDB relational schema

  // Defect 10: ZIP missing real files
  LET zipMissingRealFiles = input.zipBundle contains ONLY JSON
      AND does NOT contain real .png/.mp4/.gif files

  RETURN imageUsesTextModel OR videoPollingNoBackoff OR videoPathMissing
         OR gifConversionStub OR assetsEndpointIncomplete OR zipOnlyMetadata
         OR frontendNoMedia OR liveAgentGeneric OR noRelationalStorage
         OR zipMissingRealFiles
END FUNCTION
```

### Examples

- **Defect 1**: `ImageGenerationCapability.generate()` calls `vertexAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' }).generateContent()` which returns text like "A vibrant marketing image showing...". No real PNG/JPG is produced.

- **Defect 2**: Veo API returns 503 on poll #3. System waits exactly 15s and retries. After 20 polls (5 min), it times out. With exponential backoff, retries would space out intelligently.

- **Defect 3**: `GenerateVideo.execute()` writes video to `${jobId}/video/${videoAssetId}.mp4` but never sets `context.workingData.videoAssetPath`. Downstream `GenerateGif` finds `undefined` and skips.

- **Defect 4**: `GifGenerationCapability.convertVideoToGif()` always returns `null` — the ffmpeg logic is a placeholder stub.

- **Defect 5**: `GET /api/v1/jobs/:jobId/assets` returns all assets with only `signedUrl`. No `isFallback`, `previewUrl`, or `downloadUrl`.

- **Defect 6**: ZIP bundle contains only `.json` metadata files because no real binary media was generated.

- **Defect 7**: `OutputDashboard` receives empty `imageUrls` and undefined `videoUrl` because SSE events don't resolve signed URLs.

- **Defect 8**: `processLiveInput()` uses a generic Creative Director prompt without querying Trend Analyzer.

- **Storage Gap**: All asset metadata lives in Firestore job documents. No relational schema exists for cross-job queries, asset versioning, or generation audit trails.

- **Download Gap**: ZIP produces JSON-only bundles. Expected: copy-package.txt, images, video.mp4, loop.gif, storyboard files, and a supplemental manifest.json.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Text-based outputs (copy, storyboard text, voiceover script, hashtags) must continue to be generated, persisted as JSON, and displayed in CopyCards, StoryboardView, and VoiceoverView
- Creative Brief extraction from user input during ProcessInput must continue to work correctly
- Fallback behavior when capabilities are genuinely unavailable must continue to persist metadata and record FallbackNotice
- Output intent planner must continue to correctly determine which pipeline stages to run/skip
- Job poll endpoint must continue to return current state, creative brief, platform, tone, requested/skipped outputs
- Trend Analyzer standalone queries must continue to work without changes
- Model router initialization, fallback chain walking, and availability caching must remain unchanged
- Existing Firestore data must remain readable and functional during and after migration
- JSON manifest mode (no ?format=zip) must continue to work identically
- Existing `signedUrl` field must continue to be provided for backward compatibility

**Scope:**
All inputs that do NOT involve binary media generation, asset URL resolution, ZIP bundling of media, frontend media rendering, Live Agent trend integration, or AlloyDB storage should be completely unaffected.

## Hypothesized Root Cause

1. **ImageGenerationCapability uses wrong API**: `generate()` calls `vertexAI.getGenerativeModel().generateContent()` — a text generation API, not Imagen. Imagen requires `predict` on an Imagen model and returns `bytesBase64Encoded`.

2. **VideoGenerationCapability fixed polling**: `pollForCompletion()` uses constant `VIDEO_POLL_INTERVAL_MS = 15_000` with no backoff on transient errors.

3. **GenerateVideo missing videoAssetPath**: After writing video to GCS, only `storyboardAssetPath` and `videoBriefAssetPath` are set. `videoAssetPath` is never assigned.

4. **GifGenerationCapability stub**: `convertVideoToGif()` returns `null` unconditionally. The ffmpeg command is described in comments but never executed.

5. **Assets endpoint missing fields**: `GET /:jobId/assets` maps assets to `AssetReferenceWithUrl` with only `signedUrl`. No `previewUrl`, `downloadUrl`, or `isFallback`.

6. **ZIP bundle indiscriminate**: Fetches all completed assets. Since only JSON metadata exists, ZIP contains only JSON files.

7. **Frontend no media URL resolution**: `OutputDashboard` accepts `imageUrls` and `videoUrl` props but the parent never extracts signed URLs from asset references.

8. **Live Agent lacks Trend Analyzer**: `generateAgentResponse()` uses a static system prompt without trend data.

9. **No relational storage layer**: All metadata lives in Firestore documents without relational integrity, JOINs, or cross-entity queries.

10. **No real file persistence in downloads**: The pipeline doesn't consistently persist actual media files to Cloud Storage with proper filenames for ZIP packaging.

## Correctness Properties

Property 1: Bug Condition — Image Generation Produces Real Binary Data
_For any_ pipeline execution where image generation is requested and the Imagen API is accessible, the fixed `ImageGenerationCapability.generate()` SHALL invoke the Vertex AI Imagen API, receive base64-encoded binary image data, and return it as a successful `GenerationOutput`.
**Validates: Requirements 2.1**

Property 2: Bug Condition — Video Polling Uses Exponential Backoff
_For any_ video generation poll sequence where transient errors occur, the fixed `pollForCompletion()` SHALL increase the polling interval exponentially (15s → 30s → 60s → 120s, capped at 120s) after each transient error.
**Validates: Requirements 2.2**

Property 3: Bug Condition — GenerateVideo Sets videoAssetPath
_For any_ pipeline execution where video generation succeeds, the fixed `GenerateVideo.execute()` SHALL set `context.workingData.videoAssetPath` to the Cloud Storage path of the first completed `.mp4` file.
**Validates: Requirements 2.3**

Property 4: Bug Condition — GIF Conversion Produces Real GIF Data
_For any_ GIF generation request where a valid video buffer is provided and ffmpeg is available, the fixed `convertVideoToGif()` SHALL execute ffmpeg and return base64-encoded GIF data.
**Validates: Requirements 2.4**

Property 5: Bug Condition — Assets Endpoint Returns Enriched References
_For any_ completed job with assets, the fixed assets endpoint SHALL return each asset with `previewUrl`, `downloadUrl`, and `isFallback` fields.
**Validates: Requirements 2.5, 11.2, 14.1**

Property 6: Bug Condition — ZIP Bundle Contains Real Binary Media
_For any_ completed job where real binary media assets exist, the fixed bundle endpoint SHALL produce a ZIP containing binary media files alongside text deliverables plus manifest.json.
**Validates: Requirements 2.6, 8.5, 8.6**

Property 7: Bug Condition — Frontend Renders Media with Signed URLs
_For any_ completed job with image, video, or GIF assets, the fixed frontend SHALL render images with `<img>` tags, videos with `<video controls>`, and GIFs as animated `<img>` elements.
**Validates: Requirements 2.7, 17.1, 17.2, 17.3**

Property 8: Bug Condition — Live Agent Integrates Trend Analyzer
_For any_ Live Agent session where the user discusses content creation, the fixed `processLiveInput()` SHALL query the Trend Analyzer and include trend data in responses.
**Validates: Requirements 2.8**

Property 9: Bug Condition — AlloyDB Asset Records Created
_For any_ completed media generation, the system SHALL create an asset record in AlloyDB with all required fields (asset_id, job_id, asset_type, mime_type, storage_path, status, etc.) and SHALL NOT store binary file data in AlloyDB.
**Validates: Requirements 5.1, 5.4, 5.6**

Property 10: Bug Condition — Download ZIP Contains Real Files
_For any_ full package download, the ZIP SHALL contain actual files (copy-package.txt, images, video.mp4, loop.gif, storyboard files) and manifest.json SHALL be supplemental only.
**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**

Property 11: Bug Condition — API Response Shape for Media Assets
_For any_ asset returned by the API, the response SHALL include id, type, title, mimeType, previewUrl, downloadUrl, status, sourceModel, fileSize, and dimension/duration fields where applicable.
**Validates: Requirements 11.2**

Property 12: Bug Condition — Signed URL Fallback Handling
_For any_ signed URL generation failure, the system SHALL log the error and surface a fallback message — it SHALL NOT silently downgrade to JSON-only artifacts.
**Validates: Requirements 14.2**

Property 13: Preservation — Text Outputs Unchanged
_For any_ pipeline execution that generates text-based outputs, the fixed code SHALL produce the same text content and display it unchanged.
**Validates: Requirements 3.1, 3.2, 18.1**

Property 14: Preservation — Fallback Behavior Unchanged
_For any_ pipeline execution where a media capability is genuinely unavailable, the fixed code SHALL continue to fall back gracefully.
**Validates: Requirements 3.3, 3.4, 3.5**

Property 15: Preservation — Pipeline Orchestration Unchanged
_For any_ job creation with output preferences, the fixed code SHALL continue to resolve output intent correctly.
**Validates: Requirements 3.6, 3.7, 12.1**

Property 16: Preservation — Trend Analyzer Standalone Unchanged
_For any_ standalone Trend Analyzer query, the fixed code SHALL produce identical results.
**Validates: Requirements 3.8, 3.9**

Property 17: Preservation — Existing Firestore Data Readable
_For any_ existing job or session in Firestore, the system SHALL continue to read and return data correctly.
**Validates: Requirements 6.1, 6.2, 21.1, 24.1**

Property 18: Preservation — JSON Manifest Unchanged
_For any_ bundle request without ?format=zip, the system SHALL return the JSON manifest identically.
**Validates: Requirements 9.1**

## Fix Implementation

### Changes Required

**File**: `apps/worker/src/capabilities/image-generation.ts`
**Function**: `ImageGenerationCapability.generate()`
**Changes (Defect 1)**: Replace text model call with Imagen REST API. Use `google-auth-library` for auth. Send `{ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "1:1" } }` to Imagen predict endpoint. Parse `predictions[0].bytesBase64Encoded`. Preserve fallback on 403/401.
**Requirements**: 2.1, 3.3

---

**File**: `apps/worker/src/capabilities/video-generation.ts`
**Function**: `VideoGenerationCapability.pollForCompletion()`
**Changes (Defect 2)**: Replace fixed `sleep(VIDEO_POLL_INTERVAL_MS)` with dynamic interval. Start at 15s, double after transient errors, cap at 120s. Reset on success. Add structured per-poll logging. Make timeout configurable via env var. Track consecutive transient errors.
**Requirements**: 2.2, 3.4

---

**File**: `apps/worker/src/pipeline/generate-video.ts`
**Function**: `GenerateVideo.execute()`
**Changes (Defect 3)**: Add `context.workingData.videoAssetPath = videoStoragePath` after successful video write. Guard with `if (!context.workingData.videoAssetPath)`.
**Requirements**: 2.3, 3.4

---

**File**: `apps/worker/src/capabilities/gif-generation.ts`
**Function**: `GifGenerationCapability.convertVideoToGif()`
**Changes (Defect 4)**: Implement actual ffmpeg conversion. Write video to temp file, run `ffmpeg -i input.mp4 -vf "fps=10,scale=480:-1" -loop 0 output.gif`, read output, return base64. 60s timeout. Cleanup in finally block.
**Requirements**: 2.4, 3.5

---

**File**: `apps/api/src/routes/jobs.ts`
**Function**: `GET /:jobId/assets` handler
**Changes (Defect 5)**: Add `isFallback`, `previewUrl`, `downloadUrl` fields. Define fallback types set. Define renderable media types set. Update `AssetReferenceWithUrl` type in shared package.
**Requirements**: 2.5, 11.2, 14.1, 3.7

---

**File**: `apps/api/src/routes/jobs.ts`
**Function**: `GET /:jobId/bundle` handler (ZIP mode)
**Changes (Defect 6)**: Filter deliverables vs metadata. Use descriptive filenames (image-1.png, video.mp4, etc.). Place metadata in `metadata/` subdirectory. Generate manifest.json. Include real text files (copy-package.txt, caption.txt, etc.).
**Requirements**: 2.6, 8.1-8.6, 9.1

---

**File**: `apps/web/src/hooks/useSSE.ts` and `apps/web/src/components/OutputDashboard.tsx`
**Changes (Defect 7)**: Extract media URLs from SSE asset references. Filter by assetType for image/video/gif. Pass resolved URLs to OutputDashboard. Render `<img>` for images with click-to-enlarge, `<video controls>` for video with poster, animated `<img>` for GIF with format indicator.
**Requirements**: 2.7, 17.1, 17.2, 17.3, 18.1

---

**File**: `apps/api/src/services/live-session.ts`
**Changes (Defect 8)**: Import `analyzeTrends`. Query trends when platform/domain keywords detected. Include trends in system prompt. Guide structured creative direction gathering. Trend-aware responses with hashtag suggestions.
**Requirements**: 2.8, 3.8

---

**New File**: `apps/api/src/services/alloydb.ts`
**Changes (Storage Architecture)**: Create AlloyDB connection pool using `pg` library. Implement CRUD operations for assets, jobs, sessions, events. Provide migration-safe layer that reads from Firestore for legacy data and writes to both AlloyDB and Firestore during transition.
**Requirements**: 5.1-5.6, 6.1, 6.2, 20.1, 20.2, 21.1

---

**New File**: `apps/api/src/services/alloydb-schema.sql`
**Changes**: SQL schema file with all AlloyDB table definitions as specified in the Three-Tier Storage Architecture section.
**Requirements**: 5.4, 5.5

---

**File**: `packages/shared/src/types/api.ts`
**Changes**: Extend `AssetReferenceWithUrl` with `isFallback?: boolean`, `previewUrl?: string`, `downloadUrl?: string`, `title?: string`, `mimeType?: string`, `fileSize?: number`, `width?: number`, `height?: number`, `durationSeconds?: number`, `sourceModel?: string`.
**Requirements**: 11.2, 14.1

---

**File**: `apps/api/src/services/firestore.ts`
**Changes (Migration Layer)**: Add dual-write logic: when creating/updating jobs and assets, write to both Firestore (for real-time) and AlloyDB (for relational). Add read-through: try AlloyDB first for relational queries, fall back to Firestore for legacy data.
**Requirements**: 20.1, 20.2, 6.1, 24.1

---

**File**: `apps/api/src/services/live-session.ts`
**Changes (Live Agent Persistence)**: After session ends, persist conversation history, tool usage, and extracted direction to AlloyDB. Keep active session state in Firestore for real-time updates.
**Requirements**: 23.1, 23.2, 24.1

## API Response Shape for Media Assets

After the fix, each asset returned by the API will have this shape:

```typescript
interface EnrichedAssetReference extends AssetReference {
  signedUrl: string;        // backward compat
  previewUrl: string;       // for rendering in cards (empty for non-renderable)
  downloadUrl: string;      // for download buttons (empty for fallback assets)
  isFallback: boolean;      // true for image_concept, video_brief_meta, gif_creative_direction
  title: string;            // human-readable label
  mimeType: string;         // e.g. image/png, video/mp4, image/gif
  fileSize: number;         // bytes
  sourceModel: string;      // e.g. imagen-3.0-generate-001
  width?: number;           // for image/video
  height?: number;          // for image/video
  durationSeconds?: number; // for video/gif
}
```

## ZIP Package Contents

For a full package download, the ZIP will contain:

```
content-package-{jobId}.zip
├── copy-package.txt
├── caption.txt
├── hashtags.txt
├── call-to-action.txt
├── voiceover-script.txt
├── on-screen-text.txt
├── storyboard.txt
├── storyboard.json
├── image-1.png
├── image-2.png
├── image-3.png
├── final-video.mp4
├── loop.gif (or loop.mp4)
├── package-manifest.json
└── metadata/
    ├── image-concept.json
    ├── video-brief.json
    └── gif-direction.json
```

## Migration Strategy

1. **Phase 1 — Schema Creation**: Deploy AlloyDB schema (tables, indexes). No data migration yet.
2. **Phase 2 — Dual Write**: New jobs/assets write to both Firestore and AlloyDB. Reads still from Firestore.
3. **Phase 3 — Read Migration**: Switch relational queries (asset lookups, cross-job queries) to AlloyDB. Keep Firestore for real-time UI state.
4. **Phase 4 — Legacy Backfill**: Backfill existing Firestore records to AlloyDB. Mark legacy records without real media as `metadata-only`.
5. **Backward Compatibility**: Legacy records without real media files are marked with `is_fallback = true` and `status = 'legacy'` in AlloyDB.

## Testing Strategy

### Validation Approach

Two-phase approach: surface counterexamples on unfixed code, then verify fixes and preservation.

### Exploratory Bug Condition Checking

Write tests that exercise each defect on current (unfixed) code. Expected to FAIL, confirming bugs exist.

### Fix Checking

For all inputs where bug condition holds, verify fixed function produces expected behavior:
- Image: returns base64 binary data (valid PNG/JPEG)
- Video: poll intervals increase after transient errors
- videoAssetPath: defined after video success
- GIF: returns base64 GIF data (starts with "GIF89a"/"GIF87a")
- Assets: every asset has isFallback, previewUrl, downloadUrl
- ZIP: contains real binary files + manifest.json
- Frontend: imageUrls/videoUrl populated, media elements rendered
- Live Agent: response references trend data
- AlloyDB: asset records created with correct schema
- Download: ZIP contains real files per expected contents list

### Preservation Checking

For all inputs where bug condition does NOT hold, verify fixed function produces same result as original:
- Text outputs identical
- Fallback behavior unchanged
- Output intent resolution unchanged
- Job poll response unchanged
- Trend Analyzer standalone unchanged
- Model router unchanged
- Existing Firestore data readable
- JSON manifest unchanged

### Manual Verification Steps

1. **Image Preview**: Submit a job requesting images → verify thumbnails appear in OutputDashboard → click to enlarge → download saves real .png/.jpg
2. **Video Preview**: Submit a job requesting video → verify HTML5 video player appears → play video → download saves real .mp4
3. **GIF Preview**: Submit a job requesting GIF → verify inline GIF preview → verify both .gif and .mp4 loop available → download button shows file type
4. **Full Package Download**: Submit a full package job → click "Download All" → verify ZIP contains: copy-package.txt, caption.txt, hashtags.txt, call-to-action.txt, voiceover-script.txt, on-screen-text.txt, storyboard.txt, storyboard.json, image files, video.mp4, loop.gif, package-manifest.json
5. **AlloyDB Verification**: After job completion → query AlloyDB assets table → verify asset records exist with correct fields → verify no binary data in AlloyDB → verify Cloud Storage paths are valid
6. **Migration Verification**: Query a legacy job → verify data returns from Firestore → verify new job data writes to both Firestore and AlloyDB
