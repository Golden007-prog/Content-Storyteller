# Requirements Document

## Introduction

The Content Storyteller Batch Mode pipeline currently hangs after job creation — the frontend gets stuck on the progress skeleton and never advances to results. This feature addresses the root cause of the stuck pipeline, then introduces smarter output control so the worker only generates assets the user actually requested. The scope covers: end-to-end pipeline debugging, reliable state transitions, output-intent detection, conditional pipeline execution, explicit output selectors, frontend completion/render fixes, result schema updates, error handling with partial completion, tests, and documentation.

## Glossary

- **Pipeline**: The sequential worker process that transforms a job from `queued` to `completed` by executing stages (ProcessInput → GenerateCopy → GenerateImages → GenerateVideo → ComposePackage).
- **Worker**: The Express service (`apps/worker`) that receives Pub/Sub push messages and runs the Pipeline.
- **API_Service**: The Express service (`apps/api`) that creates jobs, publishes Pub/Sub messages, serves SSE streams, and returns assets.
- **Frontend**: The React application (`apps/web`) that submits jobs, subscribes to SSE, and renders results.
- **Job**: A Firestore document representing a content generation request, identified by a unique `jobId`.
- **JobState**: An enum of valid pipeline states: `queued`, `processing_input`, `generating_copy`, `generating_images`, `generating_video`, `composing_package`, `completed`, `failed`.
- **SSE_Stream**: The Server-Sent Events endpoint (`/api/v1/jobs/:jobId/stream`) that emits `state_change`, `partial_result`, `complete`, and `failed` events.
- **Output_Intent**: A normalized object describing which asset types the user actually wants generated (e.g., `wantsCopy`, `wantsImage`, `wantsVideo`).
- **Planner**: A module (`apps/api/src/services/planner/output-intent.ts`) that infers the Output_Intent from user prompt, platform, tone, uploaded assets, and optional explicit flags.
- **Stage**: A single step in the Pipeline (e.g., GenerateCopy, GenerateImages) that performs one category of generation work.
- **Partial_Completion**: A terminal state where some requested outputs succeeded and others failed, returned with warnings rather than a blanket failure.
- **Output_Preference**: An optional explicit selector in Batch Mode allowing the user to choose: Copy only, Copy + image, Copy + video, or Full package.
- **Result_Schema**: The JSON shape of the final job result document stored in Firestore and returned to the Frontend.

## Requirements

### Requirement 1: End-to-End Batch Mode Pipeline Fix

**User Story:** As a user, I want Batch Mode jobs to complete successfully so that I see generated results instead of a stuck progress skeleton.

#### Acceptance Criteria

1. WHEN a Batch Mode job is created via `POST /api/v1/jobs`, THE API_Service SHALL publish a Pub/Sub message containing the `jobId` and `idempotencyKey` to the configured topic within 5 seconds.
2. WHEN the Worker receives a Pub/Sub push message with a valid `jobId`, THE Worker SHALL retrieve the Job from Firestore and begin pipeline execution by transitioning the Job state from `queued` to `processing_input`.
3. WHEN the Pipeline completes all stages without error, THE Worker SHALL transition the Job state to `completed` and persist the final asset bundle in Firestore.
4. WHEN the Job state transitions to `completed`, THE SSE_Stream SHALL emit a `complete` event containing the `jobId`, final state, and asset references.
5. WHEN the Frontend receives a `complete` event from the SSE_Stream, THE Frontend SHALL stop displaying the progress skeleton and render the results view.
6. IF the Worker fails to consume the Pub/Sub message or fails to update Firestore, THEN THE Worker SHALL write the Job state to `failed` with a structured `errorMessage` describing the failure point.
7. IF the Job state transitions to `failed`, THEN THE SSE_Stream SHALL emit a `failed` event and THE Frontend SHALL display the error message to the user.
8. WHEN the Pipeline executes, THE Worker SHALL write an explicit JobState update to Firestore before and after each Stage executes, ensuring the SSE_Stream can detect every transition.

### Requirement 2: Reliable Pipeline State Transitions

**User Story:** As a developer, I want every pipeline stage to write explicit state transitions so that no job silently hangs without a clear status.

#### Acceptance Criteria

1. THE Pipeline SHALL support the following ordered JobState values: `queued`, `processing_input`, `generating_copy`, `generating_images`, `generating_video`, `composing_package`, `completed`, `failed`.
2. WHEN a Stage begins execution, THE Worker SHALL write the corresponding JobState to Firestore with an `updatedAt` timestamp before performing any generation work.
3. WHEN a Stage completes execution successfully, THE Worker SHALL update the Job document with the stage result assets before the next Stage begins.
4. IF a Stage encounters an error, THEN THE Worker SHALL write the Job state to `failed` with a structured error object containing `errorMessage`, `failedStage`, and `updatedAt`.
5. THE Job document SHALL include a `steps` metadata object with keys for each stage (`processInput`, `generateCopy`, `generateImages`, `generateVideo`, `composePackage`), each having a status of `queued`, `running`, `completed`, `skipped`, or `failed`.
6. WHEN a Stage is intentionally skipped based on the Output_Intent, THE Worker SHALL set that stage's status to `skipped` in the `steps` metadata rather than leaving it unset.
7. THE Worker SHALL write an `updatedAt` timestamp on every Firestore update to the Job document.

### Requirement 3: Output-Intent Detection

**User Story:** As a user, I want the system to infer what outputs I actually need from my prompt and settings so that unnecessary generation steps are skipped.

#### Acceptance Criteria

1. THE Planner SHALL accept as input: user prompt text, selected platform, selected tone, selected output format, list of uploaded media paths, and optional explicit output flags from the Frontend.
2. THE Planner SHALL produce a normalized Output_Intent object with boolean fields: `wantsCopy`, `wantsHashtags`, `wantsImage`, `wantsVideo`, `wantsStoryboard`, `wantsVoiceover`, `wantsCarousel`, `wantsThread`, `wantsLinkedInPost`.
3. WHEN the user prompt requests only a LinkedIn post with hashtags and description, THE Planner SHALL set `wantsCopy` and `wantsHashtags` to true and `wantsImage` and `wantsVideo` to false.
4. THE Planner SHALL set `wantsVideo` to true only WHEN the user prompt explicitly mentions video, reel, teaser, or promo clip.
5. WHEN the user prompt requests only text-based output from an uploaded image, THE Planner SHALL set `wantsImage` to false.
6. WHEN the user prompt requests only an image, THE Planner SHALL set `wantsVideo` to false.
7. WHEN the user prompt requests only copy, THE Planner SHALL set `wantsImage` and `wantsVideo` to false.
8. WHEN the user prompt requests a "complete package", THE Planner SHALL set `wantsCopy`, `wantsImage`, and `wantsVideo` to true, adjusted by platform defaults.
9. WHEN the selected platform is `linkedin_launch_post` and no explicit visual request is present, THE Planner SHALL default to copy-only output.
10. WHEN the selected platform is `instagram_reel`, THE Planner SHALL default to video-oriented output with `wantsVideo` set to true.
11. WHEN the selected platform is `x_twitter_thread`, THE Planner SHALL default to copy and thread output with `wantsThread` set to true.
12. WHEN a trend is passed from the Trend Analyzer via "Use in Content Storyteller", THE Planner SHALL respect the user's selected desired output type from the trend context.
13. WHEN explicit output flags are provided by the Frontend, THE Planner SHALL use the explicit flags and override prompt-based inference.

### Requirement 4: Conditional Pipeline Execution

**User Story:** As a user, I want the pipeline to skip stages I don't need so that my job completes faster and doesn't block on unnecessary generation.

#### Acceptance Criteria

1. WHEN the Output_Intent indicates `wantsImage` is false, THE Pipeline SHALL skip the GenerateImages stage and mark it as `skipped` in the `steps` metadata.
2. WHEN the Output_Intent indicates `wantsVideo` is false, THE Pipeline SHALL skip the GenerateVideo stage and mark it as `skipped` in the `steps` metadata.
3. WHEN one or more stages are skipped, THE Pipeline SHALL proceed to the next non-skipped stage without blocking or failing.
4. THE ComposePackage stage SHALL assemble only the assets that were actually generated, omitting placeholders for skipped stages.
5. WHEN all requested stages complete, THE Pipeline SHALL transition the Job to `completed` regardless of how many stages were skipped.
6. THE Pipeline SHALL always execute the ProcessInput and GenerateCopy stages, as copy generation is the minimum output for every job.
7. THE Output_Intent object SHALL be persisted on the Job document so the SSE_Stream and Frontend can read which stages were planned.

### Requirement 5: Explicit Output Preference Selectors

**User Story:** As a user, I want to optionally choose my desired output type in Batch Mode so that I have direct control over what gets generated.

#### Acceptance Criteria

1. THE Frontend SHALL display an optional output preference control in Batch Mode with options: "Copy only", "Copy + image", "Copy + video", "Full package".
2. THE Frontend SHALL default the output preference to "Auto-detect from prompt" when no explicit selection is made.
3. WHEN the user selects an explicit output preference, THE Frontend SHALL include the selection in the `CreateJobRequest` payload as an `outputPreference` field.
4. THE API_Service SHALL accept the optional `outputPreference` field in `CreateJobRequest` and persist it on the Job document.
5. WHEN `outputPreference` is present on the Job, THE Planner SHALL use the explicit preference to override prompt-based inference.
6. THE output preference control SHALL be backward compatible — existing requests without `outputPreference` SHALL continue to work using prompt-based inference.

### Requirement 6: Frontend Completion and Render Logic

**User Story:** As a user, I want the frontend to correctly show results when my job completes and show errors when it fails, without waiting for assets that were skipped.

#### Acceptance Criteria

1. THE Frontend SHALL poll the correct `jobId` returned from `POST /api/v1/jobs` when subscribing to the SSE_Stream.
2. WHEN the SSE_Stream emits a `complete` event, THE Frontend SHALL stop the progress skeleton and transition to the results view.
3. WHEN the SSE_Stream emits a `failed` event, THE Frontend SHALL stop the progress skeleton and display the `errorMessage` from the event data.
4. THE Frontend SHALL not wait for image or video partial results when the Output_Intent indicates those stages were skipped.
5. THE OutputDashboard component SHALL render only the asset sections for which data is available, hiding skeleton placeholders for skipped output types.
6. WHEN the Job document includes `steps` metadata, THE GenerationTimeline component SHALL display skipped stages with a "Skipped" indicator instead of a pending state.
7. THE Frontend SHALL read the `requestedOutputs` field from the result to determine which asset sections to render.

### Requirement 7: Result Schema Update

**User Story:** As a developer, I want the result schema to clearly describe what was requested, what was generated, and what was skipped so that consumers can render results correctly.

#### Acceptance Criteria

1. THE Job document SHALL include a `requestedOutputs` field listing the output types that were planned based on the Output_Intent.
2. THE Job document SHALL include a `completedOutputs` field listing the output types that were successfully generated.
3. THE Job document SHALL include a `skippedOutputs` field listing the output types that were intentionally skipped.
4. THE Job document SHALL include an `assets` array containing only the assets that were actually generated.
5. THE Job document SHALL include a `warnings` array containing structured warning objects for any non-fatal issues encountered during generation.
6. THE Result_Schema update SHALL be backward compatible — existing Job documents without the new fields SHALL continue to be readable by the Frontend and API_Service.
7. FOR ALL Job documents, serializing the Job to JSON and deserializing it back SHALL produce an equivalent object (round-trip property).

### Requirement 8: Error Handling and Timeouts

**User Story:** As a user, I want the pipeline to handle errors gracefully so that I get partial results when possible instead of losing everything to a single failure.

#### Acceptance Criteria

1. WHEN a Stage exceeds its individual timeout, THE Pipeline SHALL mark that Stage as `failed` in the `steps` metadata and proceed to evaluate whether partial completion is possible.
2. IF a non-critical Stage (GenerateImages or GenerateVideo) fails but the critical Stage (GenerateCopy) succeeded and the failed stage was optional per the Output_Intent, THEN THE Pipeline SHALL mark the Job as `completed` with a `warnings` entry describing the partial failure.
3. IF a critical Stage (ProcessInput or GenerateCopy) fails, THEN THE Pipeline SHALL mark the Job as `failed` with a structured error.
4. THE Pipeline SHALL enforce a global timeout of 10 minutes, after which the Job transitions to `failed` with a timeout error message.
5. WHEN a Stage fails, THE Worker SHALL write a structured error object to the `steps` metadata containing `errorMessage`, `failedAt` timestamp, and `stage` name.
6. THE `warnings` array on the Job document SHALL contain objects with fields: `stage`, `message`, `timestamp`, and `severity` (either `info` or `warning`).

### Requirement 9: Tests

**User Story:** As a developer, I want comprehensive tests covering the pipeline orchestration changes so that regressions are caught early.

#### Acceptance Criteria

1. THE test suite SHALL include a test verifying that a copy-only request skips GenerateImages and GenerateVideo stages and reaches `completed`.
2. THE test suite SHALL include a test verifying that a video request executes GenerateCopy and GenerateVideo stages and reaches `completed`.
3. THE test suite SHALL include a test verifying that an image-only request executes GenerateCopy and GenerateImages stages, skips GenerateVideo, and reaches `completed`.
4. THE test suite SHALL include a test verifying that a full-package request executes all stages and reaches `completed`.
5. THE test suite SHALL include a test verifying that pipeline state progresses through the correct sequence of JobState values for a given Output_Intent.
6. THE test suite SHALL include a test verifying that a failure in an optional stage results in partial completion with warnings when the critical stages succeeded.
7. THE test suite SHALL include a test verifying that the Output_Intent Planner produces correct intent objects for each platform default.
8. FOR ALL valid Output_Intent objects, the Planner SHALL produce an intent where `wantsCopy` is always true (invariant property).

### Requirement 10: Documentation

**User Story:** As a developer, I want updated documentation so that the team understands the output-intent inference, conditional pipeline, and debugging approach.

#### Acceptance Criteria

1. THE README.md SHALL include a section describing the output-intent inference system and how the Planner determines requested outputs.
2. THE `docs/architecture.md` SHALL include a diagram or description of the conditional pipeline execution flow, showing which stages run based on Output_Intent.
3. THE `docs/architecture.md` SHALL describe how skipped stages are represented in the Job document and SSE_Stream events.
4. THE `docs/env.md` SHALL document any new environment variables introduced by the output-intent or conditional pipeline features.
5. THE documentation SHALL include a troubleshooting section for debugging stuck Batch Mode jobs, covering: Pub/Sub delivery verification, Firestore state inspection, SSE_Stream connection verification, and common failure patterns.
