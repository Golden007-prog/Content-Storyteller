# Requirements Document

## Introduction

Content Storyteller MVP is the product experience layer built on top of the existing GCP foundation (monorepo, Terraform infrastructure, API service, worker service, deployment tooling). This spec covers the enhanced shared types (platform, tone, copy package, storyboard, video brief, image concepts), the enriched API and worker pipeline (platform-aware and tone-aware Gemini prompts, Creative Director Agent logic, structured output schemas), the full React frontend (upload form, platform/tone selectors, streaming generation timeline, output dashboard with copy cards, storyboard, visual direction, voiceover, video brief, and export), hackathon compliance (Google GenAI SDK, Gemini model, multimodal input, Cloud Run deployment), a Live Agent Mode for real-time conversational creative direction via Gemini Live API or ADK, an explicit upload API with strict file validation, actual video generation pipeline integration, IAM/ADC-first authentication for production security, a Download All bundle endpoint, and submission-proof documentation for hackathon judging. The goal is a demo-ready, deployable MVP that transforms rough inputs into complete marketing packages.

## Glossary

- **Web_App**: The React + Vite + TailwindCSS frontend application served from `apps/web`
- **API_Service**: The Express API service at `apps/api` that handles HTTP requests, job creation, SSE streaming, and signed URL generation
- **Worker_Service**: The async worker at `apps/worker` that runs the generation pipeline stages
- **Shared_Package**: The `packages/shared` TypeScript package exporting all types, enums, and schemas consumed by two or more services
- **Platform**: The target social media or marketing platform for content generation (InstagramReel, LinkedInLaunchPost, XTwitterThread, GeneralPromoPackage)
- **Tone**: The creative tone applied to all generated content (Cinematic, Punchy, Sleek, Professional)
- **Creative_Director_Agent**: The logic within the ProcessInput pipeline stage that produces a platform-aware, tone-aware Creative Brief with campaign angle, pacing, and visual style
- **Copy_Package**: A structured output containing hook, caption, CTA, hashtags, thread/post copy, voiceover script, and on-screen text
- **Storyboard**: A structured output containing scenes with pacing, motion style, text overlay, and camera direction
- **Video_Brief**: A structured 15-30 second promo brief with scene pacing, motion style, text overlay style, camera and energy direction
- **Image_Concept**: A structured output containing visual concepts, directions, and prompts for image generation
- **Output_Dashboard**: The frontend section displaying all generated content organized into copy cards, storyboard scenes, visual direction, image assets, video status, voiceover script, and on-screen text
- **SSE_Stream**: Server-Sent Events connection from the Web_App to the API_Service for real-time job progress and partial results
- **Signed_URL**: A time-limited URL granting temporary read access to a GCS object without requiring authentication
- **GenAI_SDK**: The `@google/genai` npm package (Google GenAI SDK) used for Gemini API calls, required for hackathon compliance
- **Generation_Timeline**: A visual component in the Web_App showing pipeline stage progress with streaming status updates
- **Live_Session**: A bidirectional real-time session between the user and Gemini via the Gemini Live API or ADK, supporting mic input, camera/screen input, streaming responses, and interruption handling
- **Live_Agent_Mode**: A frontend toggle that switches the Web_App from batch generation mode to a live interactive session with the Creative Director Agent
- **ADC**: Application Default Credentials — the Google Cloud authentication mechanism preferred in production over explicit API keys
- **Upload_API**: A dedicated `/api/v1/upload` endpoint that accepts multipart file uploads, validates file type and size, persists to GCS, and returns structured metadata
- **Asset_Manifest**: A JSON document listing all generated assets for a job with their types, storage paths, and signed URLs, used for bulk download
- **Submission_Proof**: Documentation artifacts (deployment-proof.md, architecture diagram, demo-script.md, judge-checklist.md) that demonstrate GCP and Gemini usage for hackathon judging

## Requirements

### Requirement 1: Enhanced Shared Types — Platform and Tone Enums

**User Story:** As a developer, I want Platform and Tone enums in the shared package, so that all services use consistent values for platform targeting and creative tone.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `Platform` enum with values: `InstagramReel`, `LinkedInLaunchPost`, `XTwitterThread`, `GeneralPromoPackage`
2. THE Shared_Package SHALL export a `Tone` enum with values: `Cinematic`, `Punchy`, `Sleek`, `Professional`
3. THE Shared_Package SHALL export both enums from the barrel `index.ts` file

### Requirement 2: Enhanced Shared Types — CreateJobRequest and CreativeBrief

**User Story:** As a developer, I want the CreateJobRequest and CreativeBrief interfaces extended with platform, tone, and prompt fields, so that the API and worker can produce platform-aware, tone-aware content.

#### Acceptance Criteria

1. THE Shared_Package SHALL extend the `CreateJobRequest` interface to include: `promptText` (string), `platform` (Platform enum), `tone` (Tone enum), and `uploadedMediaPaths` (string array)
2. THE Shared_Package SHALL extend the `CreativeBrief` interface to include: `platform` (Platform enum), `tone` (Tone enum), `campaignAngle` (string), `pacing` (string), and `visualStyle` (string)
3. THE Shared_Package SHALL extend the `Job` interface to include: `promptText` (optional string), `platform` (optional Platform enum), and `tone` (optional Tone enum)
4. THE Shared_Package SHALL maintain backward compatibility with existing fields on all extended interfaces

### Requirement 3: Enhanced Shared Types — Copy Package Schema

**User Story:** As a developer, I want a structured Copy Package schema, so that generated marketing copy is organized into distinct components for display and export.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `CopyPackage` interface with fields: `hook` (string), `caption` (string), `cta` (string), `hashtags` (string array), `threadCopy` (string array for multi-post threads), `voiceoverScript` (string), and `onScreenText` (string array)
2. THE Shared_Package SHALL export the `CopyPackage` interface from the barrel `index.ts` file

### Requirement 4: Enhanced Shared Types — Storyboard and Video Brief Schemas

**User Story:** As a developer, I want structured Storyboard and Video Brief schemas, so that generated video direction is organized into scenes with pacing and motion details.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `StoryboardScene` interface with fields: `sceneNumber` (number), `description` (string), `duration` (string), `motionStyle` (string), `textOverlay` (string), `cameraDirection` (string)
2. THE Shared_Package SHALL export a `Storyboard` interface with fields: `scenes` (StoryboardScene array), `totalDuration` (string), `pacing` (string)
3. THE Shared_Package SHALL export a `VideoBrief` interface with fields: `scenes` (StoryboardScene array), `totalDuration` (string), `motionStyle` (string), `textOverlayStyle` (string), `cameraDirection` (string), `energyDirection` (string)
4. THE Shared_Package SHALL export all storyboard and video brief interfaces from the barrel `index.ts` file

### Requirement 5: Enhanced Shared Types — Image Concept Schema

**User Story:** As a developer, I want a structured Image Concept schema, so that image generation direction is organized into visual concepts with prompts.

#### Acceptance Criteria

1. THE Shared_Package SHALL export an `ImageConcept` interface with fields: `conceptName` (string), `visualDirection` (string), `generationPrompt` (string), `style` (string)
2. THE Shared_Package SHALL export the `ImageConcept` interface from the barrel `index.ts` file

### Requirement 6: Enhanced Shared Types — SSE Stream Event Enhancement

**User Story:** As a developer, I want the SSE stream event shape extended to carry partial results, so that the frontend can progressively display generated content as it becomes available.

#### Acceptance Criteria

1. THE Shared_Package SHALL extend the `StreamEventShape` data field to include optional `partialCopy` (Partial CopyPackage), optional `partialStoryboard` (Partial Storyboard), optional `partialVideoBrief` (Partial VideoBrief), and optional `partialImageConcepts` (ImageConcept array)
2. THE Shared_Package SHALL extend the `StreamEventShape` data field to include optional `creativeBrief` (CreativeBrief)

### Requirement 7: API Service — Enhanced Job Creation Endpoint

**User Story:** As a frontend developer, I want the job creation endpoint to accept prompt text, platform, and tone alongside uploaded media paths, so that the worker pipeline receives all creative direction inputs.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/v1/jobs` with `promptText`, `platform`, `tone`, and `uploadedMediaPaths`, THE API_Service SHALL create a Job document in Firestore with all provided fields and state `queued`
2. WHEN a POST request is sent to `/api/v1/jobs` without a `promptText` field, THE API_Service SHALL reject the request with a 400 status and descriptive error message
3. WHEN a POST request is sent to `/api/v1/jobs` with an invalid `platform` or `tone` value, THE API_Service SHALL reject the request with a 400 status and descriptive error message
4. THE API_Service SHALL include `promptText`, `platform`, and `tone` in the Pub/Sub message payload or in the Job document accessible to the Worker_Service

### Requirement 8: API Service — Signed URL Generation for Asset Downloads

**User Story:** As a frontend developer, I want signed URLs for generated assets, so that the Web_App can display and download images, videos, and other assets directly from GCS without backend proxying.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/jobs/:jobId/assets`, THE API_Service SHALL include a `signedUrl` field on each asset reference in the response
2. THE API_Service SHALL generate signed URLs with a validity period of 60 minutes
3. THE API_Service SHALL generate signed URLs for all asset types (copy, image, video, storyboard, voiceover_script)

### Requirement 9: API Service — Enhanced SSE Streaming

**User Story:** As a frontend developer, I want the SSE stream to emit richer partial results, so that the Web_App can progressively display copy, storyboard scenes, and image concepts as they are generated.

#### Acceptance Criteria

1. WHEN the Worker_Service completes the GenerateCopy stage, THE API_Service SSE stream SHALL emit a `partial_result` event containing the generated Copy_Package data
2. WHEN the Worker_Service completes the GenerateVideo stage, THE API_Service SSE stream SHALL emit a `partial_result` event containing the generated Storyboard and Video_Brief data
3. WHEN the Worker_Service completes the GenerateImages stage, THE API_Service SSE stream SHALL emit a `partial_result` event containing the generated Image_Concept data
4. THE API_Service SSE stream SHALL continue to emit `state_change` events for each pipeline stage transition

### Requirement 10: API Service — CORS Support

**User Story:** As a frontend developer, I want CORS headers on the API, so that the Web_App served from a different origin can make requests to the API_Service.

#### Acceptance Criteria

1. THE API_Service SHALL respond to preflight OPTIONS requests with appropriate CORS headers (Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers)
2. THE API_Service SHALL include CORS headers on all API responses
3. THE API_Service SHALL allow configuring the allowed origin via an environment variable `CORS_ORIGIN`

### Requirement 11: Worker Pipeline — Creative Director Agent in ProcessInput

**User Story:** As a content creator, I want the system to act as a creative director that produces a platform-aware, tone-aware Creative Brief, so that all downstream generation is tailored to the selected platform and tone.

#### Acceptance Criteria

1. WHEN the ProcessInput stage executes, THE Worker_Service SHALL read the `promptText`, `platform`, and `tone` fields from the Job document
2. WHEN the ProcessInput stage generates a Creative Brief via Gemini, THE Worker_Service SHALL include platform-specific structure guidance (reel format for InstagramReel, professional format for LinkedInLaunchPost, thread format for XTwitterThread, general format for GeneralPromoPackage)
3. THE Worker_Service SHALL populate the Creative Brief with `campaignAngle`, `pacing`, and `visualStyle` fields derived from the platform and tone inputs
4. THE Worker_Service SHALL use the `@google/genai` SDK (Google GenAI SDK) for all Gemini API calls instead of the Vertex AI SDK

### Requirement 12: Worker Pipeline — Enhanced GenerateCopy Stage

**User Story:** As a content creator, I want the copy generation stage to produce a full Copy Package with hook, caption, CTA, hashtags, thread copy, voiceover script, and on-screen text, so that all text content for the marketing package is generated in one stage.

#### Acceptance Criteria

1. WHEN the GenerateCopy stage executes, THE Worker_Service SHALL generate a complete Copy_Package containing: hook, caption, cta, hashtags, threadCopy, voiceoverScript, and onScreenText
2. THE Worker_Service SHALL tailor the Copy_Package content to the selected Platform (thread copy for XTwitterThread, reel captions for InstagramReel, professional copy for LinkedInLaunchPost)
3. THE Worker_Service SHALL tailor the Copy_Package tone to the selected Tone (cinematic language for Cinematic, punchy short-form for Punchy, sleek minimal for Sleek, formal for Professional)
4. THE Worker_Service SHALL persist the Copy_Package as a JSON asset in the assets bucket and record an AssetReference on the Job document

### Requirement 13: Worker Pipeline — Enhanced GenerateImages Stage

**User Story:** As a content creator, I want the image generation stage to produce structured image concepts with visual directions and generation prompts, so that the output includes actionable image direction even when image generation APIs are unavailable.

#### Acceptance Criteria

1. WHEN the GenerateImages stage executes, THE Worker_Service SHALL generate Image_Concept objects containing conceptName, visualDirection, generationPrompt, and style
2. THE Worker_Service SHALL persist the Image_Concept array as a JSON asset in the assets bucket and record an AssetReference on the Job document
3. WHEN image generation capability is available, THE Worker_Service SHALL attempt to generate images using the Image_Concept generation prompts
4. WHEN image generation capability is unavailable, THE Worker_Service SHALL still produce and persist Image_Concept objects as creative direction output

### Requirement 14: Worker Pipeline — Enhanced GenerateVideo Stage

**User Story:** As a content creator, I want the video generation stage to produce a structured Video Brief and Storyboard with scene pacing, motion style, text overlay, and camera direction, so that the output includes actionable video direction.

#### Acceptance Criteria

1. WHEN the GenerateVideo stage executes, THE Worker_Service SHALL generate a Storyboard with scenes containing sceneNumber, description, duration, motionStyle, textOverlay, and cameraDirection
2. WHEN the GenerateVideo stage executes, THE Worker_Service SHALL generate a Video_Brief with totalDuration, motionStyle, textOverlayStyle, cameraDirection, and energyDirection
3. THE Worker_Service SHALL tailor the Storyboard and Video_Brief to the selected Platform (15-second reel for InstagramReel, 30-second professional for LinkedInLaunchPost, thread-visual sequence for XTwitterThread)
4. THE Worker_Service SHALL persist the Storyboard and Video_Brief as JSON assets in the assets bucket and record AssetReferences on the Job document

### Requirement 15: Worker Pipeline — Google GenAI SDK Migration

**User Story:** As a hackathon participant, I want all Gemini API calls to use the `@google/genai` SDK, so that the project meets the hackathon requirement of using the Google GenAI SDK.

#### Acceptance Criteria

1. THE Worker_Service SHALL use the `@google/genai` npm package for all Gemini model calls in all pipeline stages (ProcessInput, GenerateCopy, GenerateImages, GenerateVideo)
2. THE Worker_Service SHALL configure the GenAI SDK with the `GEMINI_API_KEY` environment variable or Application Default Credentials
3. THE Worker_Service SHALL use the `gemini-2.0-flash` model for all generation calls
4. THE Worker_Service SHALL remove the `@google-cloud/vertexai` dependency after migration

### Requirement 16: Frontend — Landing Page and Upload Form

**User Story:** As a content creator, I want a landing page with a drag-and-drop upload form, text prompt input, platform selector, and tone selector, so that I can provide all inputs needed to generate a marketing package.

#### Acceptance Criteria

1. THE Web_App SHALL display a landing page with a hero section describing the product
2. THE Web_App SHALL display a drag-and-drop file upload area accepting images, screenshots, and audio files
3. THE Web_App SHALL display a text prompt input field for describing the marketing content
4. THE Web_App SHALL display a Platform selector with options: Instagram Reel, LinkedIn Launch Post, X/Twitter Thread, General Promo Package
5. THE Web_App SHALL display a Tone selector with options: Cinematic, Punchy, Sleek, Professional
6. THE Web_App SHALL display a "Generate" button that submits the form data to the API_Service
7. WHEN the user clicks "Generate" without providing a text prompt, THE Web_App SHALL display a validation message requiring a text prompt
8. THE Web_App SHALL upload files to the `/api/v1/upload` endpoint before creating a job

### Requirement 17: Frontend — Generation Timeline and Streaming Status

**User Story:** As a content creator, I want to see real-time progress of my content generation, so that I know which stage the pipeline is in and can see partial results as they become available.

#### Acceptance Criteria

1. WHEN a job is created, THE Web_App SHALL establish an SSE connection to `/api/v1/jobs/:jobId/stream`
2. THE Web_App SHALL display a Generation_Timeline showing all pipeline stages (Processing Input, Generating Copy, Generating Images, Generating Video, Composing Package) with visual indicators for pending, active, and completed states
3. WHEN a `state_change` event is received, THE Web_App SHALL update the Generation_Timeline to reflect the current stage
4. WHEN a `partial_result` event is received, THE Web_App SHALL progressively reveal the corresponding content section in the Output_Dashboard
5. THE Web_App SHALL display loading animations during active generation stages

### Requirement 18: Frontend — Output Dashboard

**User Story:** As a content creator, I want a comprehensive output dashboard displaying all generated content, so that I can review and use the complete marketing package.

#### Acceptance Criteria

1. THE Web_App SHALL display copy cards showing the hook, caption, CTA, and hashtags from the Copy_Package
2. THE Web_App SHALL display a storyboard section with scene cards showing scene number, description, duration, motion style, and camera direction
3. THE Web_App SHALL display a visual direction section showing Image_Concept cards with concept name, visual direction, and style
4. THE Web_App SHALL display image asset cards with thumbnails when generated images are available
5. THE Web_App SHALL display a video status area showing the Video_Brief details (motion style, text overlay style, camera direction, energy direction)
6. THE Web_App SHALL display the voiceover script from the Copy_Package
7. THE Web_App SHALL display the on-screen text items from the Copy_Package
8. THE Web_App SHALL display the Creative Brief summary (campaign angle, platform, tone, pacing, visual style)

### Requirement 19: Frontend — Export and Download

**User Story:** As a content creator, I want to download generated assets and copy the generated text, so that I can use the marketing package in my campaigns.

#### Acceptance Criteria

1. THE Web_App SHALL provide download buttons for each generated asset (images, video, JSON bundles) using signed URLs from the API_Service
2. THE Web_App SHALL provide copy-to-clipboard buttons for text content (hook, caption, CTA, hashtags, voiceover script, on-screen text)
3. THE Web_App SHALL provide a "Download All" button that downloads the complete asset bundle

### Requirement 20: Frontend — UI Quality and Responsiveness

**User Story:** As a demo viewer, I want a premium, modern, demo-friendly UI with strong loading states and mobile responsiveness, so that the product makes a compelling impression.

#### Acceptance Criteria

1. THE Web_App SHALL use TailwindCSS for styling with a modern, premium visual design
2. THE Web_App SHALL be responsive and usable on mobile devices (viewport width 375px and above)
3. THE Web_App SHALL display skeleton loading states for content sections before data is available
4. THE Web_App SHALL use progressive reveal animations when content sections become available
5. THE Web_App SHALL use a consistent color scheme and typography throughout all pages

### Requirement 21: Frontend — React and Vite Setup

**User Story:** As a developer, I want the Web_App built with React, Vite, and TailwindCSS, so that the frontend uses modern tooling with fast build times.

#### Acceptance Criteria

1. THE Web_App SHALL be built using React 18 or later with TypeScript
2. THE Web_App SHALL use Vite as the build tool and development server
3. THE Web_App SHALL use TailwindCSS for utility-first CSS styling
4. THE Web_App SHALL import types from the Shared_Package (`@content-storyteller/shared`)
5. THE Web_App SHALL configure the API base URL via a `VITE_API_URL` environment variable

### Requirement 22: Deployment — Web App Docker Build and Deployment

**User Story:** As a developer, I want the Web_App containerized and deployable to Cloud Run, so that the full product is accessible via a public URL.

#### Acceptance Criteria

1. THE Web_App SHALL have a Dockerfile that builds the Vite production bundle and serves it via a lightweight HTTP server (nginx or similar)
2. THE `scripts/build.sh` SHALL build and push the Web_App Docker image alongside the API and Worker images
3. THE `scripts/deploy.sh` SHALL deploy the Web_App to Cloud Run alongside the API and Worker services

### Requirement 23: Hackathon Compliance

**User Story:** As a hackathon participant, I want the MVP to meet all hackathon judging criteria, so that the submission is eligible and competitive.

#### Acceptance Criteria

1. THE Worker_Service SHALL use the Gemini model (`gemini-2.0-flash`) for all AI generation
2. THE Worker_Service SHALL use the Google GenAI SDK (`@google/genai`) for Gemini API calls
3. THE system SHALL use Google Cloud services (Cloud Run, GCS, Firestore, Pub/Sub) for infrastructure
4. THE system SHALL run on Google Cloud via Cloud Run
5. THE system SHALL accept multimodal input (text prompts, images, screenshots, audio files)
6. THE Web_App SHALL provide real-time interaction via SSE streaming of generation progress

### Requirement 24: API Service — PollJobStatus Enhancement

**User Story:** As a frontend developer, I want the poll job status response to include the Creative Brief and partial generated content, so that the Web_App can display rich content even without SSE.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/jobs/:jobId`, THE API_Service SHALL include the `creativeBrief` field in the response when available
2. WHEN a GET request is sent to `/api/v1/jobs/:jobId`, THE API_Service SHALL include `platform` and `tone` fields in the response

### Requirement 25: Live Agent Mode — Gemini Live API / ADK Integration

**User Story:** As a content creator, I want a live interactive mode where I can speak to the Creative Director Agent in real time via microphone and optionally share my camera or screen, so that I can brainstorm and refine creative direction conversationally before or during generation.

#### Acceptance Criteria

1. THE Worker_Service or a dedicated live-session backend SHALL support bidirectional streaming sessions using the Gemini Live API or Google ADK
2. THE API_Service SHALL expose endpoints to start (`POST /api/v1/live/start`), send input to (`POST /api/v1/live/input`), and stop (`POST /api/v1/live/stop`) a live session, returning a `sessionId`
3. THE live session SHALL accept audio (microphone) input and optionally camera or screen-share frames as multimodal input to Gemini
4. THE live session SHALL stream Gemini responses back to the client in near-real-time via SSE or WebSocket
5. THE live session SHALL handle user interruptions gracefully (new input cancels in-progress response generation)
6. THE Web_App SHALL provide a toggle to switch between batch generation mode and Live Agent Mode
7. THE Web_App SHALL display a live session panel with mic controls, optional camera/screen-share controls, and a streaming transcript of the conversation
8. THE API_Service SHALL persist live session state (transcript, extracted creative direction) so it can seed a subsequent batch generation job

### Requirement 26: Explicit Upload API

**User Story:** As a frontend developer, I want a dedicated upload endpoint with strict validation, so that uploaded files are validated for type, size, and MIME before being persisted to GCS.

#### Acceptance Criteria

1. THE API_Service SHALL expose a `POST /api/v1/upload` endpoint that accepts `multipart/form-data` with one or more files
2. THE API_Service SHALL validate uploaded file MIME types against an allowlist (image/png, image/jpeg, image/webp, image/gif, audio/mpeg, audio/wav, audio/webm, video/mp4, video/webm, application/pdf)
3. THE API_Service SHALL reject any single file larger than 50 MB with a 413 status and descriptive error
4. THE API_Service SHALL persist each accepted file to GCS under a deterministic path: `uploads/{correlationId}/{originalFilename}`
5. THE API_Service SHALL return a JSON response array with `uploadPath`, `fileName`, `contentType`, `size`, and `storageBucket` for each accepted file
6. THE API_Service SHALL return a 400 status with error code `UNSUPPORTED_FILE_TYPE` when a file fails MIME validation
7. THE API_Service SHALL store content-type and original filename as GCS object metadata on each uploaded file

### Requirement 27: Actual Video Generation Pipeline

**User Story:** As a content creator, I want the system to generate an actual short promo video (not just a storyboard JSON), so that I receive a playable mp4 asset as part of my marketing package.

#### Acceptance Criteria

1. WHEN video generation capability is available, THE Worker_Service SHALL submit a video generation job to the Vertex AI video generation API (or Veo via GenAI SDK) using the Storyboard and Video_Brief as input
2. THE Worker_Service SHALL track the async video generation job status by polling until completion or timeout (max 10 minutes)
3. WHEN the video generation job completes, THE Worker_Service SHALL persist the resulting mp4 file to GCS at `{jobId}/video/{assetId}.mp4` and record an AssetReference with status `completed`
4. THE Web_App SHALL display a video player component for completed video assets using signed URLs
5. WHEN video generation is unavailable or fails, THE Worker_Service SHALL still produce the Storyboard and Video_Brief JSON assets and record a FallbackNotice, leaving the user with actionable creative direction
6. THE Web_App SHALL display a clear fallback message when video generation was skipped, showing the storyboard and video brief instead

### Requirement 28: IAM / ADC-First Authentication

**User Story:** As a DevOps engineer, I want the system to prefer Application Default Credentials and service accounts in production, so that API keys are only used as a local-dev fallback and the deployed system follows Google Cloud security best practices.

#### Acceptance Criteria

1. THE Worker_Service SHALL initialize the GenAI SDK with ADC (no explicit key) when the `GEMINI_API_KEY` environment variable is not set, falling back to the API key only when it is explicitly provided
2. THE API_Service SHALL use ADC for all Google Cloud client libraries (Storage, Firestore, Pub/Sub) without requiring explicit service account key files
3. THE system SHALL document the recommended IAM roles for each service account (API, Worker) in `docs/iam.md`
4. THE `.env.example` files SHALL clearly mark `GEMINI_API_KEY` as optional with a comment indicating it is only needed for local development outside of GCP

### Requirement 29: Download All Backend Support

**User Story:** As a content creator, I want a single endpoint that returns all generated assets for a job, so that I can download everything at once instead of clicking each asset individually.

#### Acceptance Criteria

1. THE API_Service SHALL expose a `GET /api/v1/jobs/:jobId/bundle` endpoint that returns an Asset_Manifest JSON listing all completed assets with their signed URLs, types, and filenames
2. THE API_Service SHALL optionally support a `?format=zip` query parameter that streams a ZIP archive of all completed assets to the client
3. THE Web_App SHALL wire the "Download All" button to the `/bundle` endpoint, defaulting to the ZIP format when available and falling back to the manifest JSON
4. THE Asset_Manifest SHALL include a `generatedAt` timestamp and the job's `platform` and `tone` for context

### Requirement 30: Submission-Proof Documentation

**User Story:** As a hackathon participant, I want comprehensive submission-proof documentation, so that judges can quickly verify GCP deployment, Gemini usage, architecture, and demo flow.

#### Acceptance Criteria

1. THE repository SHALL include a `docs/deployment-proof.md` documenting Cloud Run service URLs, GCS bucket names, Firestore database, and Pub/Sub topic with timestamps of last successful deployment
2. THE repository SHALL include a `docs/architecture-diagram.md` (or inline in `docs/architecture.md`) with a Mermaid or ASCII system diagram showing all services, data flows, and GCP resources
3. THE repository SHALL include a `docs/demo-script.md` with a step-by-step script for a sub-4-minute live demo covering upload, generation, streaming progress, output review, and download
4. THE repository SHALL include a `docs/judge-checklist.md` mapping each hackathon requirement (Gemini model, GenAI SDK, GCP service, multimodal, deployable) to specific code files and deployment evidence
5. THE `docs/deployment-proof.md` SHALL include evidence of Gemini API usage (model name in code, sample log entry or API call trace)
6. WHEN Live Agent Mode is implemented, THE `docs/demo-script.md` SHALL include a section demonstrating live multimodal interaction
