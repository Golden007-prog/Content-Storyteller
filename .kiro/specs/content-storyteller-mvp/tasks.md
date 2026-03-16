# Implementation Plan: Content Storyteller MVP

## Overview

This plan extends the existing GCP foundation with enhanced shared types, enriched API and worker pipeline, a full React frontend, and deployment updates. Tasks are ordered for incremental buildability: shared types first, then API enhancements, worker pipeline enhancements, frontend build, deployment, and integration verification. Each task specifies which files to create or modify.

## Tasks

- [x] 1. Shared package type extensions
  - [x] 1.1 Create Platform and Tone enums
    - Create `packages/shared/src/types/enums.ts` with `Platform` enum (InstagramReel, LinkedInLaunchPost, XTwitterThread, GeneralPromoPackage) and `Tone` enum (Cinematic, Punchy, Sleek, Professional)
    - Export both enums from `packages/shared/src/index.ts`
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Create CopyPackage schema
    - Create `packages/shared/src/schemas/copy-package.ts` with `CopyPackage` interface (hook, caption, cta, hashtags, threadCopy, voiceoverScript, onScreenText)
    - Export from `packages/shared/src/index.ts`
    - _Requirements: 3.1, 3.2_

  - [x] 1.3 Create Storyboard and VideoBrief schemas
    - Create `packages/shared/src/schemas/storyboard.ts` with `StoryboardScene` and `Storyboard` interfaces
    - Create `packages/shared/src/schemas/video-brief.ts` with `VideoBrief` interface
    - Export all from `packages/shared/src/index.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.4 Create ImageConcept schema
    - Create `packages/shared/src/schemas/image-concept.ts` with `ImageConcept` interface (conceptName, visualDirection, generationPrompt, style)
    - Export from `packages/shared/src/index.ts`
    - _Requirements: 5.1, 5.2_

  - [x] 1.5 Extend existing interfaces for MVP fields
    - Modify `packages/shared/src/types/api.ts`: add `promptText`, `platform`, `tone` to `CreateJobRequest`; add `creativeBrief?`, `platform?`, `tone?` to `PollJobStatusResponse`; add `partialCopy?`, `partialStoryboard?`, `partialVideoBrief?`, `partialImageConcepts?`, `creativeBrief?` to `StreamEventShape.data`; add `AssetReferenceWithUrl` interface
    - Modify `packages/shared/src/types/job.ts`: add optional `promptText?`, `platform?`, `tone?` to `Job` interface
    - Modify `packages/shared/src/schemas/creative-brief.ts`: add optional `platform?`, `tone?`, `campaignAngle?`, `pacing?`, `visualStyle?` to `CreativeBrief`
    - Export new types from `packages/shared/src/index.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2_

  - [x] 1.6 Write property tests for shared type extensions
    - **Property 1: Platform and Tone enum completeness**
    - **Validates: Requirements 1.1, 1.2**
    - **Property 2: New schema interfaces have all required fields**
    - **Validates: Requirements 3.1, 4.1, 4.2, 4.3, 5.1**
    - **Property 3: Extended interfaces maintain backward compatibility**
    - **Validates: Requirements 2.4**
    - Add tests to `packages/shared/src/__tests__/mvp-types.property.test.ts`

  - [x] 1.7 Write unit tests for shared type extensions
    - Verify barrel exports include all new types (Platform, Tone, CopyPackage, Storyboard, VideoBrief, ImageConcept, AssetReferenceWithUrl)
    - Verify enum string values match expected patterns
    - Add tests to `packages/shared/src/__tests__/mvp-types.unit.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 4.4, 5.2_

- [x] 2. Checkpoint — Shared package builds and tests pass
  - Ensure `npm run build --workspace=packages/shared` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. API service enhancements
  - [x] 3.1 Add CORS middleware
    - Install `cors` package: add to `apps/api/package.json` dependencies
    - Create `apps/api/src/middleware/cors.ts` with configurable `CORS_ORIGIN` env var
    - Modify `apps/api/src/index.ts` to add CORS middleware before route handlers
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 3.2 Enhance job creation endpoint
    - Modify `apps/api/src/routes/jobs.ts` POST handler: validate `promptText` (non-empty, 400 MISSING_PROMPT), validate `platform` against Platform enum (400 INVALID_PLATFORM), validate `tone` against Tone enum (400 INVALID_TONE)
    - Modify `apps/api/src/services/firestore.ts` `createJob` function: accept and store `promptText`, `platform`, `tone` on Job document
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 3.3 Add signed URL generation for assets
    - Add `generateSignedUrl` function to `apps/api/src/services/storage.ts` using `@google-cloud/storage` `getSignedUrl()` with 60-minute expiry
    - Modify `apps/api/src/routes/jobs.ts` GET `/:jobId/assets` handler: generate signed URLs for each asset reference, return `AssetReferenceWithUrl[]`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 3.4 Enhance SSE streaming with partial results
    - Modify `apps/api/src/routes/stream.ts`: track last known asset count per type; on state transitions, read Job document and emit `partial_result` events with `creativeBrief` (after ProcessInput), `partialCopy` (after GenerateCopy), `partialImageConcepts` (after GenerateImages), `partialStoryboard` + `partialVideoBrief` (after GenerateVideo)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.5 Enhance poll endpoint with creative direction fields
    - Modify `apps/api/src/routes/jobs.ts` GET `/:jobId` handler: include `creativeBrief`, `platform`, `tone` in `PollJobStatusResponse`
    - _Requirements: 24.1, 24.2_

  - [x] 3.6 Write property tests for API enhancements
    - **Property 4: Job creation stores all creative direction fields**
    - **Validates: Requirements 7.1, 7.4**
    - **Property 5: Invalid enum values rejected on job creation**
    - **Validates: Requirements 7.3**
    - **Property 6: Signed URLs present on all asset references**
    - **Validates: Requirements 8.1, 8.3**
    - **Property 8: CORS headers on all API responses**
    - **Validates: Requirements 10.2**
    - **Property 19: Poll response includes creative direction fields**
    - **Validates: Requirements 24.1, 24.2**
    - Add tests to `apps/api/src/__tests__/mvp-api.property.test.ts`

  - [x] 3.7 Write unit tests for API enhancements
    - Test missing promptText returns 400
    - Test invalid platform/tone returns 400
    - Test valid job creation returns 201 with all fields
    - Test signed URL generation with mock GCS
    - Test CORS preflight OPTIONS response
    - Test SSE partial_result events emitted on state transitions
    - Test poll response includes creativeBrief, platform, tone
    - Add tests to `apps/api/src/__tests__/mvp-api.unit.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 10.1, 24.1_

- [x] 4. Checkpoint — API service builds and tests pass
  - Ensure `npm run build --workspace=apps/api` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Worker pipeline enhancements
  - [x] 5.1 Migrate to Google GenAI SDK
    - Update `apps/worker/package.json`: add `@google/genai` dependency, remove `@google-cloud/vertexai`
    - Create `apps/worker/src/services/genai.ts` helper: initialize `GoogleGenAI` with `GEMINI_API_KEY` env var, export a `generateContent` wrapper using `gemini-2.0-flash` model
    - Update `.env.example` files with `GEMINI_API_KEY` variable
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 5.2 Enhance ProcessInput as Creative Director Agent
    - Modify `apps/worker/src/pipeline/process-input.ts`: read `promptText`, `platform`, `tone` from Job document via Firestore; build platform-aware prompt with structure guidance per platform; include tone direction; use GenAI SDK instead of VertexAI; generate CreativeBrief with `campaignAngle`, `pacing`, `visualStyle` fields; persist enhanced brief on Job document
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 5.3 Enhance GenerateCopy stage
    - Modify `apps/worker/src/pipeline/generate-copy.ts`: use GenAI SDK; generate structured `CopyPackage` (hook, caption, cta, hashtags, threadCopy, voiceoverScript, onScreenText); include platform-specific and tone-specific prompt instructions; validate output against CopyPackage schema with fallback; persist as JSON asset
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 5.4 Enhance GenerateImages stage
    - Modify `apps/worker/src/pipeline/generate-images.ts`: use GenAI SDK; always generate `ImageConcept[]` objects (conceptName, visualDirection, generationPrompt, style); persist concepts as `{jobId}/image-concepts/{assetId}.json`; attempt image generation if capability available; persist concepts regardless of image generation availability
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 5.5 Enhance GenerateVideo stage
    - Modify `apps/worker/src/pipeline/generate-video.ts`: use GenAI SDK; generate structured `Storyboard` with scenes (sceneNumber, description, duration, motionStyle, textOverlay, cameraDirection); generate `VideoBrief` (totalDuration, motionStyle, textOverlayStyle, cameraDirection, energyDirection); platform-aware scene pacing; persist both as JSON assets
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 5.6 Write property tests for worker pipeline enhancements
    - **Property 9: Creative Director produces platform-aware, tone-aware brief**
    - **Validates: Requirements 11.1, 11.2, 11.3**
    - **Property 10: GenerateCopy produces complete CopyPackage**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**
    - **Property 11: GenerateImages produces ImageConcept objects**
    - **Validates: Requirements 13.1, 13.2**
    - **Property 12: GenerateVideo produces Storyboard and VideoBrief**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
    - **Property 13: Gemini model name consistency**
    - **Validates: Requirements 15.3, 23.1**
    - Add tests to `apps/worker/src/__tests__/mvp-worker.property.test.ts`

  - [x] 5.7 Write unit tests for worker pipeline enhancements
    - Test ProcessInput reads promptText/platform/tone from Job
    - Test GenerateCopy produces valid CopyPackage JSON
    - Test GenerateImages produces ImageConcept objects even when capability unavailable
    - Test GenerateVideo produces both Storyboard and VideoBrief
    - Test GenAI SDK initialization with API key
    - Test fallback JSON parsing when Gemini returns malformed output
    - Add tests to `apps/worker/src/__tests__/mvp-worker.unit.test.ts`
    - _Requirements: 11.1, 12.1, 13.1, 14.1, 15.1_

- [x] 6. Checkpoint — Worker pipeline builds and tests pass
  - Ensure `npm run build --workspace=apps/worker` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Frontend — React + Vite + TailwindCSS setup
  - [x] 7.1 Initialize Vite + React + TailwindCSS project
    - Replace `apps/web/package.json` with React 18, Vite, TailwindCSS, PostCSS, autoprefixer dependencies; keep `@content-storyteller/shared` workspace dependency
    - Create `apps/web/index.html` with root div and Vite script entry
    - Create `apps/web/vite.config.ts` with React plugin and proxy config for API
    - Create `apps/web/tailwind.config.js` with content paths
    - Create `apps/web/postcss.config.js` with TailwindCSS and autoprefixer plugins
    - Create `apps/web/src/index.css` with Tailwind directives (@tailwind base, components, utilities)
    - Create `apps/web/src/main.tsx` as React root render entry point
    - Remove old `apps/web/src/index.ts` placeholder
    - Update `apps/web/tsconfig.json` for JSX support
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [x] 7.2 Create API client and hooks
    - Create `apps/web/src/api/client.ts` with functions: `uploadFiles`, `createJob`, `pollJob`, `getAssets`, `createSSEConnection`; use `VITE_API_URL` env var for base URL
    - Create `apps/web/src/hooks/useJob.ts` with job creation and polling state management
    - Create `apps/web/src/hooks/useSSE.ts` with EventSource lifecycle management, event dispatching for state_change/partial_result/complete/failed, auto-cleanup on unmount
    - _Requirements: 16.6, 16.8, 17.1, 21.5_

  - [x] 7.3 Create App shell and LandingPage
    - Create `apps/web/src/App.tsx` with main layout and state-driven view switching (landing → generating → results)
    - Create `apps/web/src/components/LandingPage.tsx` with hero section, upload form integration, prompt input, platform selector, tone selector, and Generate button
    - _Requirements: 16.1, 16.2, 16.3, 16.6_

  - [x] 7.4 Create PlatformSelector and ToneSelector components
    - Create `apps/web/src/components/PlatformSelector.tsx` rendering all Platform enum values as selectable options (Instagram Reel, LinkedIn Launch Post, X/Twitter Thread, General Promo Package)
    - Create `apps/web/src/components/ToneSelector.tsx` rendering all Tone enum values as selectable options (Cinematic, Punchy, Sleek, Professional)
    - _Requirements: 16.4, 16.5_

  - [x] 7.5 Create UploadForm component
    - Create `apps/web/src/components/UploadForm.tsx` with drag-and-drop file upload area accepting images, screenshots, audio; file list display; upload to `/api/v1/upload` on form submit
    - Implement empty prompt validation (whitespace-only prevention with validation message)
    - _Requirements: 16.2, 16.7, 16.8_

  - [x] 7.6 Create GenerationTimeline component
    - Create `apps/web/src/components/GenerationTimeline.tsx` with vertical timeline showing 5 pipeline stages (Processing Input, Generating Copy, Generating Images, Generating Video, Composing Package); pending/active/completed visual indicators; pulse animation on active stage; loading animations
    - _Requirements: 17.2, 17.3, 17.5_

  - [x] 7.7 Create OutputDashboard and content display components
    - Create `apps/web/src/components/OutputDashboard.tsx` as container for all output sections with progressive reveal and skeleton loaders
    - Create `apps/web/src/components/CopyCards.tsx` displaying hook, caption, CTA, hashtags with copy-to-clipboard buttons
    - Create `apps/web/src/components/StoryboardView.tsx` displaying scene cards with sceneNumber, description, duration, motionStyle, cameraDirection
    - Create `apps/web/src/components/VisualDirection.tsx` displaying ImageConcept cards with conceptName, visualDirection, style
    - Create `apps/web/src/components/VideoBriefView.tsx` displaying VideoBrief details (motionStyle, textOverlayStyle, cameraDirection, energyDirection)
    - Create `apps/web/src/components/VoiceoverView.tsx` displaying voiceover script and on-screen text items from CopyPackage
    - _Requirements: 17.4, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 20.3, 20.4_

  - [x] 7.8 Create ExportPanel component
    - Create `apps/web/src/components/ExportPanel.tsx` with download buttons for each asset using signed URLs; copy-to-clipboard for text content; "Download All" button for complete asset bundle
    - _Requirements: 19.1, 19.2, 19.3_

  - [x] 7.9 Wire components together and apply styling
    - Connect all components in `App.tsx`: LandingPage → (upload + createJob) → GenerationTimeline + OutputDashboard → ExportPanel
    - Wire `useSSE` hook events to update GenerationTimeline and OutputDashboard state
    - Apply TailwindCSS styling for premium, modern, demo-friendly UI; responsive design (375px+); consistent color scheme and typography; progressive reveal animations
    - Display Creative Brief summary section (campaign angle, platform, tone, pacing, visual style)
    - _Requirements: 17.3, 17.4, 20.1, 20.2, 20.3, 20.4, 20.5, 18.8_

  - [x] 7.10 Write property tests for frontend components
    - **Property 14: Platform and Tone selectors render all options**
    - **Validates: Requirements 16.4, 16.5**
    - **Property 15: Empty prompt validation prevents submission**
    - **Validates: Requirements 16.7**
    - **Property 16: CopyPackage rendering completeness**
    - **Validates: Requirements 18.1, 18.6, 18.7**
    - **Property 17: Storyboard rendering completeness**
    - **Validates: Requirements 18.2**
    - **Property 18: SSE events update UI state**
    - **Validates: Requirements 17.3, 17.4**
    - **Property 20: Asset action buttons present**
    - **Validates: Requirements 19.1, 19.2**
    - Add tests to `apps/web/src/__tests__/mvp-frontend.property.test.ts`

  - [x] 7.11 Write unit tests for frontend components
    - Test LandingPage renders hero and form elements
    - Test UploadForm drag-and-drop interaction
    - Test GenerationTimeline stage indicators update correctly
    - Test OutputDashboard progressive reveal behavior
    - Test ExportPanel download all button
    - Test API client functions with mock fetch
    - Add tests to `apps/web/src/__tests__/mvp-frontend.unit.test.ts`
    - _Requirements: 16.1, 16.2, 17.2, 18.1, 19.3_

- [x] 8. Checkpoint — Frontend builds and tests pass
  - Ensure `npm run build --workspace=apps/web` succeeds (Vite build)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Deployment updates
  - [x] 9.1 Update web Dockerfile for Vite + nginx
    - Replace `apps/web/Dockerfile` with multi-stage build: Stage 1 (node:20-alpine) installs deps and runs `vite build`; Stage 2 (nginx:alpine) copies `dist/` to nginx html dir, serves on port 8080; add nginx config for SPA routing
    - Copy `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js` into build stage
    - _Requirements: 22.1_

  - [x] 9.2 Update build and deploy scripts
    - Modify `scripts/build.sh`: add web image build and push (`docker build -t "${AR_PATH}/web:latest" -f apps/web/Dockerfile .` and `docker push`)
    - Modify `scripts/deploy.sh`: add web service deployment (`gcloud run deploy web-service --image "$WEB_IMAGE"`) and print web service URL
    - _Requirements: 22.2, 22.3_

  - [x] 9.3 Update environment configuration
    - Update `apps/worker/.env.example` with `GEMINI_API_KEY`
    - Update `apps/api/.env.example` with `CORS_ORIGIN`
    - Create `apps/web/.env.example` with `VITE_API_URL`
    - _Requirements: 15.2, 10.3, 21.5_

- [x] 10. Final checkpoint — Full build and integration verification
  - Ensure `npm run build` succeeds across all workspaces
  - Ensure all tests pass across all workspaces
  - Verify Docker builds succeed for api, worker, and web
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

- [x] 11. Explicit Upload API hardening
  - [x] 11.1 Add MIME allowlist validation to upload route
    - Modify `apps/api/src/routes/upload.ts`: validate each file's MIME type against the allowlist (image/png, image/jpeg, image/webp, image/gif, audio/mpeg, audio/wav, audio/webm, video/mp4, video/webm, application/pdf); reject with 400 `UNSUPPORTED_FILE_TYPE` on mismatch
    - _Requirements: 26.2, 26.6_

  - [x] 11.2 Add file size enforcement
    - Modify `apps/api/src/middleware/upload-limiter.ts` or `apps/api/src/routes/upload.ts`: reject any single file larger than 50 MB with 413 status and descriptive error
    - _Requirements: 26.3_

  - [x] 11.3 Add deterministic GCS path and metadata storage
    - Modify `apps/api/src/routes/upload.ts`: persist files to `uploads/{correlationId}/{originalFilename}`; set `contentType` and `originalFilename` as GCS object metadata
    - Return response array with `uploadPath`, `fileName`, `contentType`, `size`, `storageBucket`
    - _Requirements: 26.1, 26.4, 26.5, 26.7_

  - [x] 11.4 Write property tests for upload validation
    - **Property 21: Only allowlisted MIME types accepted**
    - **Validates: Requirements 26.2, 26.6**
    - **Property 22: Files over 50 MB rejected with 413**
    - **Validates: Requirements 26.3**
    - Add tests to `apps/api/src/__tests__/upload-validation.property.test.ts`

- [x] 12. Actual video generation pipeline
  - [x] 12.1 Integrate real video generation API
    - Modify `apps/worker/src/pipeline/generate-video.ts`: when video capability is available, submit a video generation job to Vertex AI video API (or Veo via GenAI SDK) using the Storyboard and VideoBrief as input; poll for completion with a 10-minute timeout; persist resulting mp4 to `{jobId}/video/{assetId}.mp4`; record AssetReference with status `completed`
    - _Requirements: 27.1, 27.2, 27.3_

  - [x] 12.2 Add video player component to frontend
    - Create `apps/web/src/components/VideoPlayer.tsx`: render an HTML5 `<video>` element with signed URL source for completed video assets; show poster frame; include playback controls
    - Modify `apps/web/src/components/VideoBriefView.tsx`: conditionally render VideoPlayer when a video asset exists, otherwise show storyboard + video brief with a fallback message
    - _Requirements: 27.4, 27.5, 27.6_

  - [x] 12.3 Write property tests for video pipeline
    - **Property 23: Video fallback produces Storyboard and VideoBrief when generation unavailable**
    - **Validates: Requirements 27.5**
    - **Property 24: Completed video asset has mp4 content type and valid storage path**
    - **Validates: Requirements 27.3**
    - Add tests to `apps/worker/src/__tests__/video-pipeline.property.test.ts`

- [x] 13. IAM / ADC-first authentication
  - [x] 13.1 Update GenAI SDK initialization for ADC-first
    - Modify `apps/worker/src/services/genai.ts`: initialize `GoogleGenAI` with ADC when `GEMINI_API_KEY` is not set; fall back to API key only when explicitly provided
    - _Requirements: 28.1_

  - [x] 13.2 Verify ADC usage in API service
    - Audit `apps/api/src/services/storage.ts`, `apps/api/src/services/firestore.ts`, `apps/api/src/services/pubsub.ts`: confirm all Google Cloud client libraries are initialized without explicit key files (relying on ADC)
    - _Requirements: 28.2_

  - [x] 13.3 Update IAM documentation and env examples
    - Update `docs/iam.md` with recommended IAM roles for API and Worker service accounts
    - Update all `.env.example` files: mark `GEMINI_API_KEY` as optional with comment "Only needed for local development outside GCP"
    - _Requirements: 28.3, 28.4_

- [x] 14. Download All backend support
  - [x] 14.1 Create bundle endpoint
    - Create or modify `apps/api/src/routes/jobs.ts`: add `GET /api/v1/jobs/:jobId/bundle` handler that reads all completed AssetReferences for the job, generates signed URLs for each, and returns an Asset_Manifest JSON with `assets[]`, `generatedAt`, `platform`, `tone`
    - _Requirements: 29.1, 29.4_

  - [x] 14.2 Add optional ZIP streaming
    - Install `archiver` package in `apps/api`
    - Extend the `/bundle` endpoint: when `?format=zip` query param is present, stream a ZIP archive of all assets to the client using signed URL fetches piped through archiver
    - _Requirements: 29.2_

  - [x] 14.3 Wire frontend Download All button
    - Modify `apps/web/src/components/ExportPanel.tsx`: wire "Download All" button to `GET /api/v1/jobs/:jobId/bundle?format=zip`; fall back to manifest JSON download if ZIP is unavailable
    - _Requirements: 29.3_

  - [x] 14.4 Write property tests for bundle endpoint
    - **Property 25: Bundle manifest includes all completed assets with signed URLs**
    - **Validates: Requirements 29.1, 29.4**
    - Add tests to `apps/api/src/__tests__/bundle-endpoint.property.test.ts`

- [x] 15. Live Agent Mode — Gemini Live API / ADK
  - [x] 15.1 Create live session backend
    - Create `apps/api/src/routes/live.ts` with endpoints: `POST /api/v1/live/start` (create session, return sessionId), `POST /api/v1/live/input` (send audio/frame to Gemini Live session), `POST /api/v1/live/stop` (end session, persist transcript)
    - Create `apps/api/src/services/live-session.ts`: manage bidirectional Gemini Live API or ADK session lifecycle, handle streaming responses, handle interruption (cancel in-progress generation on new input)
    - Register live routes in `apps/api/src/index.ts`
    - _Requirements: 25.1, 25.2, 25.4, 25.5, 25.8_

  - [x] 15.2 Add live session state persistence
    - Modify `apps/api/src/services/firestore.ts`: add `LiveSession` document type with `sessionId`, `jobId` (optional), `transcript[]`, `extractedCreativeDirection`, `createdAt`, `endedAt`
    - On session stop, persist final transcript and extracted creative direction so it can seed a batch job
    - _Requirements: 25.8_

  - [x] 15.3 Create frontend Live Agent Mode panel
    - Create `apps/web/src/components/LiveAgentPanel.tsx`: mic toggle button (start/stop recording via MediaRecorder API), optional camera/screen-share toggle (getDisplayMedia / getUserMedia), streaming transcript display, session status indicator
    - Modify `apps/web/src/App.tsx`: add a toggle switch between batch mode and Live Agent Mode; conditionally render LiveAgentPanel or LandingPage
    - _Requirements: 25.3, 25.6, 25.7_

  - [x] 15.4 Write property tests for live session
    - **Property 26: Live session start returns valid sessionId**
    - **Validates: Requirements 25.2**
    - **Property 27: Live session transcript persisted on stop**
    - **Validates: Requirements 25.8**
    - Add tests to `apps/api/src/__tests__/live-session.property.test.ts`

- [x] 16. Submission-proof documentation
  - [x] 16.1 Create or update deployment-proof.md
    - Update `docs/deployment-proof.md` with Cloud Run service URLs, GCS bucket names, Firestore database, Pub/Sub topic, timestamps of last deployment, and evidence of Gemini API usage (model name in code, sample log entry or trace)
    - _Requirements: 30.1, 30.5_

  - [x] 16.2 Add architecture diagram
    - Update `docs/architecture.md` with a Mermaid system diagram showing all services (Web, API, Worker), data flows (upload → GCS, job → Firestore, message → Pub/Sub, generation → Gemini), and GCP resources
    - _Requirements: 30.2_

  - [x] 16.3 Create demo-script.md
    - Create `docs/demo-script.md` with a step-by-step sub-4-minute demo script: open app → upload assets → select platform/tone → click Generate → show streaming timeline → review outputs → download bundle
    - If Live Agent Mode is implemented, add a section demonstrating live multimodal interaction
    - _Requirements: 30.3, 30.6_

  - [x] 16.4 Create judge-checklist.md
    - Create `docs/judge-checklist.md` mapping each hackathon requirement to specific evidence: Gemini model → `apps/worker/src/services/genai.ts`, GenAI SDK → `package.json`, GCP services → `infra/terraform/*.tf`, multimodal → upload route + ProcessInput stage, deployable → Cloud Run URLs
    - _Requirements: 30.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major milestone
- Property tests validate universal correctness properties from the design document
- All tasks extend existing code — no foundation files are recreated
- The frontend (task 7) is the largest new piece, built from scratch in `apps/web`
- Task 15 (Live Agent Mode) is entirely optional — it depends on Gemini Live API / ADK availability and can be deferred post-MVP
- Tasks 11-14 and 16 are recommended for a competitive hackathon submission
- Task 12 (actual video generation) depends on Vertex AI video API availability; the fallback path is already covered by existing task 5.5
