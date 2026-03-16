# Implementation Plan: Smart Pipeline Orchestration

## Overview

Transform the Content Storyteller Batch Mode pipeline from a rigid all-or-nothing executor into an intent-driven orchestration system. Implementation proceeds bottom-up: shared types first, then backend services (planner, worker pipeline, API routes), then frontend components, then tests and documentation. The shared package must be built after type changes so downstream consumers can import the new types.

## Tasks

- [x] 1. Add shared types and update exports
  - [x] 1.1 Add OutputIntent, StepMetadata, StepStatus, StepsMap, JobWarning, and OutputPreference types to `packages/shared/src/types/job.ts`
    - Add `OutputIntent` interface with all 9 boolean fields
    - Add `StepStatus` type union: `'queued' | 'running' | 'completed' | 'skipped' | 'failed'`
    - Add `StepMetadata` interface with `status`, optional `startedAt`, `completedAt`, `errorMessage`
    - Add `StepsMap` interface with keys for all 5 pipeline stages
    - Add `JobWarning` interface with `stage`, `message`, `timestamp`, `severity`
    - Add `OutputPreference` enum: `Auto`, `CopyOnly`, `CopyImage`, `CopyVideo`, `FullPackage`
    - Extend the existing `Job` interface with optional fields: `outputIntent`, `outputPreference`, `steps`, `requestedOutputs`, `completedOutputs`, `skippedOutputs`, `warnings`
    - _Requirements: 2.5, 3.2, 7.1, 7.2, 7.3, 7.5, 8.6_

  - [x] 1.2 Update `CreateJobRequest` and `StreamEventShape` in `packages/shared/src/types/api.ts`
    - Add optional `outputPreference` field to `CreateJobRequest`
    - Add `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, `warnings` to `StreamEventShape.data`
    - _Requirements: 5.3, 5.4, 6.7_

  - [x] 1.3 Update `packages/shared/src/index.ts` to export all new types
    - Export `OutputIntent`, `StepMetadata`, `StepStatus`, `StepsMap`, `JobWarning`, `OutputPreference` from `types/job`
    - _Requirements: 7.6_

  - [x] 1.4 Write property tests for shared types (`packages/shared/src/__tests__/pipeline-types.property.test.ts`)
    - **Property 4: Planner output structure completeness** — For any valid OutputIntent, all 9 boolean fields must be present
    - **Validates: Requirements 3.2**
    - **Property 12: Steps metadata structure after pipeline execution** — StepsMap has exactly 5 keys, each status is a valid StepStatus
    - **Validates: Requirements 2.5**
    - **Property 15: Warning structure validity** — Every JobWarning has required fields with correct types
    - **Validates: Requirements 8.6, 7.5**
    - **Property 16: Job serialization round-trip** — Serialize/deserialize Job with new fields produces equivalent object
    - **Validates: Requirements 7.7**

  - [x] 1.5 Write unit tests for shared types (`packages/shared/src/__tests__/pipeline-types.unit.test.ts`)
    - Test backward compatibility: Job objects without new fields are still valid
    - Test OutputPreference enum values match expected strings
    - Test StepStatus type covers all valid values
    - _Requirements: 2.1, 7.6_

- [x] 2. Checkpoint — Build shared package and verify exports
  - Run `npm run build` in `packages/shared` to compile new types
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement the Planner module (API service)
  - [x] 3.1 Create `apps/api/src/services/planner/output-intent.ts` with `resolveOutputIntent` function
    - Implement `PlannerInput` interface accepting `promptText`, `platform`, `tone`, `uploadedMediaPaths`, optional `outputPreference`, optional `trendContext`
    - Implement explicit outputPreference mapping: `copy_only` → wantsImage/wantsVideo false, `copy_image` → wantsImage true, etc.
    - Implement platform default rules: `instagram_reel` → video+image, `linkedin_launch_post` → copy-only, `x_twitter_thread` → thread, `general_promo_package` → full
    - Implement prompt keyword scanning for video/image keywords (case-insensitive)
    - Implement trend context override when `trendContext.desiredOutputType` is set
    - Ensure `wantsCopy` is always `true` regardless of input
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 4.6_

  - [x] 3.2 Write property tests for Planner (`apps/api/src/__tests__/output-intent.property.test.ts`)
    - **Property 1: Planner wantsCopy invariant** — For any valid PlannerInput, wantsCopy is always true
    - **Validates: Requirements 9.8, 4.6**
    - **Property 2: Planner platform defaults** — For non-keyword prompts with auto preference, intent matches platform default table
    - **Validates: Requirements 3.9, 3.10, 3.11, 9.7**
    - **Property 3: Explicit outputPreference overrides inference** — Explicit preference always wins over prompt keywords
    - **Validates: Requirements 3.13, 5.5**
    - **Property 5: Prompt keyword detection for video** — No video keywords + non-video platform + auto → wantsVideo false
    - **Validates: Requirements 3.4**
    - **Property 6: Backward compatibility without outputPreference** — Undefined/auto preference still produces valid intent
    - **Validates: Requirements 5.6**
    - **Property 19: Trend context respected by planner** — trendContext.desiredOutputType overrides platform defaults
    - **Validates: Requirements 3.12**

  - [x] 3.3 Write unit tests for Planner (`apps/api/src/__tests__/output-intent.unit.test.ts`)
    - Test LinkedIn post prompt → copy-only intent
    - Test Instagram reel prompt → video+image intent
    - Test prompt with "video" keyword overrides copy-only platform default
    - Test explicit `copy_only` preference ignores video keywords in prompt
    - Test trend context with desiredOutputType overrides platform defaults
    - _Requirements: 3.3, 3.5, 3.6, 3.7, 3.8, 5.1, 5.2_

- [x] 4. Checkpoint — Verify Planner module
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update Worker pipeline for conditional execution
  - [x] 5.1 Add new Firestore functions to `apps/worker/src/services/firestore.ts`
    - Implement `initializeStepsMetadata(jobId, steps)` to write initial steps map
    - Implement `updateStepMetadata(jobId, stepKey, metadata)` to update individual step status
    - Implement `updateJobWithWarnings(jobId, updates)` to write warnings, completedOutputs, skippedOutputs, state, errorMessage
    - _Requirements: 2.2, 2.3, 2.5, 2.6, 2.7, 8.5_

  - [x] 5.2 Update `apps/worker/src/pipeline/pipeline-runner.ts` with conditional execution
    - Add `StageConfig` interface with `stage`, `intentKey`, `critical` fields
    - Define `STAGE_CONFIGS` array mapping each stage to its intent key and criticality
    - Read `outputIntent` from Job document at pipeline start
    - Initialize steps metadata (all `queued`) at pipeline start via `initializeStepsMetadata`
    - For each stage: if intent flag is false, mark step as `skipped` and continue; otherwise execute
    - Update step metadata to `running` before execution, `completed`/`failed` after
    - On non-critical stage failure: add warning, continue pipeline
    - On critical stage failure: mark job as `failed`, stop pipeline
    - Track `completedOutputs` and `skippedOutputs` arrays
    - Write final job state with `completedOutputs`, `skippedOutputs`, `warnings` via `updateJobWithWarnings`
    - _Requirements: 1.2, 1.3, 1.8, 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 5.3 Update `apps/worker/src/index.ts` to pass outputIntent through pipeline context
    - Read `outputIntent` from the Job document after fetching from Firestore
    - Include `outputIntent` in the `PipelineContext` passed to `runPipeline`
    - _Requirements: 1.2, 4.7_

  - [x] 5.4 Write property tests for pipeline orchestration (`apps/worker/src/__tests__/pipeline-orchestration.property.test.ts`)
    - **Property 7: Skipped stages marked correctly** — Stages with false intent flags get status `skipped`; true/null flags never get `skipped`
    - **Validates: Requirements 4.1, 4.2, 2.6**
    - **Property 8: Pipeline reaches completed when all requested stages succeed** — All needed stages succeed → job completed
    - **Validates: Requirements 4.5, 4.3, 1.3**
    - **Property 9: Critical stage failure transitions job to failed** — ProcessInput or GenerateCopy failure → job failed with errorMessage
    - **Validates: Requirements 8.3, 1.6, 2.4**
    - **Property 10: Non-critical failure with critical success yields partial completion** — Optional stage fails, critical succeeds → completed with warnings
    - **Validates: Requirements 8.2**
    - **Property 11: State sequence correctness** — JobState transitions follow canonical order, skipping states for skipped stages
    - **Validates: Requirements 9.5, 1.8**
    - **Property 13: Output tracking consistency** — completedOutputs ∪ skippedOutputs covers all types; completedOutputs ⊆ requestedOutputs; no overlap
    - **Validates: Requirements 7.1, 7.2, 7.3**
    - **Property 14: Assets only from non-skipped stages** — No assets from skipped stages appear in the assets array
    - **Validates: Requirements 7.4, 4.4**

  - [x] 5.5 Write unit tests for pipeline orchestration (`apps/worker/src/__tests__/pipeline-orchestration.unit.test.ts`)
    - Test copy-only request skips GenerateImages and GenerateVideo, reaches completed
    - Test video request executes GenerateCopy and GenerateVideo, reaches completed
    - Test image-only request executes GenerateCopy and GenerateImages, skips GenerateVideo
    - Test full-package request executes all stages
    - Test optional stage failure with critical success → partial completion with warnings
    - Test global timeout enforcement
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 8.4_

- [x] 6. Checkpoint — Verify Worker pipeline changes
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7. Update API service (job creation, SSE stream)
  - [x] 7.1 Update `apps/api/src/services/firestore.ts` createJob to persist new fields
    - Accept optional `outputPreference`, `outputIntent`, `requestedOutputs`, `steps`, `warnings`, `completedOutputs`, `skippedOutputs` in createJob params
    - Persist all new fields on the Job document
    - _Requirements: 5.4, 4.7_

  - [x] 7.2 Update `apps/api/src/routes/jobs.ts` to accept outputPreference and invoke Planner
    - Import and call `resolveOutputIntent` with prompt, platform, tone, uploadedMediaPaths, outputPreference
    - Derive `requestedOutputs` array from the OutputIntent boolean flags
    - Initialize `steps` metadata with all stages set to `queued`
    - Pass `outputPreference`, `outputIntent`, `requestedOutputs`, `steps` to `createJob`
    - Validate `outputPreference` against `OutputPreference` enum if provided
    - _Requirements: 1.1, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.3 Update `apps/api/src/routes/stream.ts` to include new fields in SSE events and handle skipped stages
    - Include `outputIntent`, `steps`, `requestedOutputs`, `skippedOutputs`, `warnings` in `state_change` and terminal event data
    - Update `emitPartialResults` to skip reading assets for stages that are marked `skipped` in steps metadata
    - Handle state transitions that skip intermediate states (e.g., generating_copy → composing_package when images and video are skipped)
    - _Requirements: 1.4, 1.7, 6.4, 6.7_

- [x] 8. Checkpoint — Verify API service changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update Frontend components
  - [x] 9.1 Create `OutputPreferenceSelector` component and add to `apps/web/src/components/LandingPage.tsx`
    - Create `apps/web/src/components/OutputPreferenceSelector.tsx` with radio group or segmented control
    - Options: "Auto-detect" (default), "Copy only", "Copy + image", "Copy + video", "Full package"
    - Map selections to `OutputPreference` enum values
    - Add the selector to LandingPage Step 3 (Configure Output) section
    - _Requirements: 5.1, 5.2_

  - [x] 9.2 Update `apps/web/src/hooks/useJob.ts` to accept and pass outputPreference
    - Add `outputPreference` parameter to `startJob` function signature
    - Include `outputPreference` in the `CreateJobRequest` passed to `createJob`
    - _Requirements: 5.3_

  - [x] 9.3 Update `apps/web/src/components/GenerationTimeline.tsx` to show skipped stages
    - Accept optional `steps` prop (StepsMap) alongside `currentState`
    - Add `'skipped'` status to the `getStatus` function
    - When `steps[stageKey].status === 'skipped'`, render a gray "Skipped" indicator with a skip icon
    - Fall back to current behavior when `steps` prop is not provided (backward compat)
    - _Requirements: 6.6_

  - [x] 9.4 Update `apps/web/src/components/OutputDashboard.tsx` to hide skipped sections
    - Accept optional `skippedOutputs` and `requestedOutputs` props
    - Don't render skeleton placeholders for output types in `skippedOutputs`
    - Only render sections for output types in `requestedOutputs` that are not skipped
    - Fall back to current behavior when props are not provided
    - _Requirements: 6.4, 6.5, 6.7_

  - [x] 9.5 Wire new props through `apps/web/src/App.tsx`
    - Pass `outputPreference` from LandingPage through to `useJob.startJob`
    - Pass `steps`, `skippedOutputs`, `requestedOutputs` from SSE event data to GenerationTimeline and OutputDashboard
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 9.6 Write property tests for frontend components (`apps/web/src/__tests__/pipeline-ui.property.test.tsx`)
    - **Property 17: GenerationTimeline skipped indicator** — For any StepsMap with skipped stages, component renders "Skipped" indicator
    - **Validates: Requirements 6.6**
    - **Property 18: OutputDashboard conditional rendering** — For any requestedOutputs/skippedOutputs combo, only non-skipped requested sections render
    - **Validates: Requirements 6.5, 6.4**

  - [x] 9.7 Write unit tests for frontend components (`apps/web/src/__tests__/pipeline-ui.unit.test.tsx`)
    - Test OutputPreferenceSelector renders all options and defaults to Auto-detect
    - Test GenerationTimeline renders "Skipped" for skipped stages
    - Test OutputDashboard hides skeleton for skipped outputs
    - Test backward compat: components work without new props
    - _Requirements: 5.1, 5.2, 6.1_

- [x] 10. Checkpoint — Verify Frontend changes
  - Ensure all tests pass, ask the user if questions arise.

- [-] 11. Update documentation
  - [x] 11.1 Update `README.md` with output-intent inference section
    - Describe how the Planner determines requested outputs from prompt, platform, tone, and explicit preference
    - _Requirements: 10.1_

  - [x] 11.2 Update `docs/architecture.md` with conditional pipeline flow
    - Add description of conditional pipeline execution based on OutputIntent
    - Describe how skipped stages are represented in Job document and SSE events
    - _Requirements: 10.2, 10.3_

  - [x] 11.3 Update `docs/env.md` with any new environment variables
    - Document any new env vars introduced (if any)
    - _Requirements: 10.4_

  - [x] 11.4 Add troubleshooting section for stuck Batch Mode jobs
    - Cover Pub/Sub delivery verification, Firestore state inspection, SSE connection verification, common failure patterns
    - _Requirements: 10.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Run all test suites across packages/shared, apps/api, apps/worker, apps/web
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document (P1–P19)
- The shared package must be built (task 2) before downstream apps can use the new types
- Checkpoints ensure incremental validation at each layer boundary
