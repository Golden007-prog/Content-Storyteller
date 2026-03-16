# Implementation Plan: Vertex AI Model Router

## Overview

Introduce a centralized model routing layer in `packages/shared` that maps each AI capability slot to the optimal Vertex AI model, with environment-variable overrides, startup availability checks, and ordered fallback chains. Refactor all existing GenAI call sites across the API and Worker services to use the router instead of hardcoded model references. Preserve all existing API contracts and frontend flows.

## Tasks

- [x] 1. Create shared model configuration module
  - [x] 1.1 Create `packages/shared/src/ai/model-config.ts`
    - Define `CapabilitySlot` type union: `text | textFallback | reasoning | image | imageHQ | videoFast | videoFinal | live`
    - Define `ModelConfigValues` interface with `projectId`, `location`, and `slots: Record<CapabilitySlot, string>`
    - Export `MODEL_DEFAULTS` constant with all 8 slot defaults per Requirement 1.11
    - Export `SLOT_ENV_VARS` mapping each slot to its `VERTEX_*` env var name
    - Implement `getModelConfig()` that reads env vars and applies overrides over defaults
    - Implement `_resetConfigForTesting()` for test isolation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [x] 1.2 Write property test for environment variable overrides (P1)
    - **Property 1: Environment variable override applies to any capability slot**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10**
    - Test file: `packages/shared/src/__tests__/model-config.property.test.ts`

  - [x] 1.3 Write unit tests for model config defaults
    - Verify all 8 slots return correct defaults when no env vars are set
    - Verify `projectId` and `location` resolution from env vars
    - Test file: `packages/shared/src/__tests__/model-config.unit.test.ts`
    - _Requirements: 1.1, 1.2, 1.11_

- [x] 2. Create shared model router module
  - [x] 2.1 Create `packages/shared/src/ai/model-router.ts`
    - Define `SlotStatus`, `ResolvedSlot`, `ResolvedModelMap` types
    - Export `FALLBACK_CHAINS` for text, imageHQ, and videoFinal slots
    - Define `RouterNotInitializedError` and `ModelUnavailableError` error classes
    - Implement `initModelRouter(options?)` that performs availability checks, walks fallback chains, and caches the immutable resolved map
    - Implement `getModel(slot)` that returns the resolved model or throws for uninitialized/unavailable slots
    - Implement `getSlotInfo(slot)` and `getResolvedModels()` for health endpoints
    - Implement `_resetRouterForTesting()` for test isolation
    - When env override is set for a slot, skip availability check and use override directly
    - When live model is unavailable, mark slot as `'unavailable'` and throw `ModelUnavailableError` from `getModel('live')`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 10.3_

  - [x] 2.2 Export model router and model config from `packages/shared/src/index.ts`
    - Export `CapabilitySlot`, `ModelConfigValues`, `MODEL_DEFAULTS`, `SLOT_ENV_VARS`, `getModelConfig`, `_resetConfigForTesting` from `ai/model-config`
    - Export `SlotStatus`, `ResolvedSlot`, `ResolvedModelMap`, `FALLBACK_CHAINS`, `initModelRouter`, `getModel`, `getSlotInfo`, `getResolvedModels`, `RouterNotInitializedError`, `ModelUnavailableError`, `_resetRouterForTesting` from `ai/model-router`
    - _Requirements: 2.4_

  - [x] 2.3 Write property tests for model router (P2, P3, P7)
    - **Property 2: Fallback chain selects the first available model**
    - **Validates: Requirements 2.3, 3.2, 3.3, 3.4**
    - **Property 3: All-unavailable fallback chain marks slot as degraded**
    - **Validates: Requirements 3.8**
    - **Property 7: Environment override skips availability check for that slot**
    - **Validates: Requirements 10.3**
    - Test file: `packages/shared/src/__tests__/model-router.property.test.ts`

  - [x] 2.4 Write unit tests for model router
    - Test `initModelRouter` with all models available → all slots primary, status = available
    - Test `getModel('live')` throws `ModelUnavailableError` when live is down
    - Test `getModel()` before `initModelRouter()` throws `RouterNotInitializedError`
    - Test fallback chain resolution for text, imageHQ, videoFinal
    - Test file: `packages/shared/src/__tests__/model-router.unit.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 3.2, 3.3, 3.4, 3.5, 3.8_

- [x] 3. Checkpoint - Shared module complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor GenAI services to accept explicit model parameter
  - [x] 4.1 Refactor `apps/api/src/services/genai.ts`
    - Change `generateContent(prompt)` signature to `generateContent(prompt, model)`
    - Remove `getGeminiModel()` function and `GENAI_MODEL` constant
    - Pass `model` parameter to the SDK `generateContent` call instead of reading from GcpConfig
    - Keep `getGenAI()` singleton unchanged (handles SDK init with ADC or API key)
    - _Requirements: 7.1_

  - [x] 4.2 Refactor `apps/worker/src/services/genai.ts`
    - Change `generateContent(prompt)` signature to `generateContent(prompt, model)`
    - Change `generateContentMultimodal(parts)` signature to `generateContentMultimodal(parts, model)`
    - Remove `getGeminiModel()` function and `GENAI_MODEL` constant
    - Pass `model` parameter to the SDK calls instead of reading from GcpConfig
    - _Requirements: 7.2_

  - [x] 4.3 Write property test for model forwarding (P4)
    - **Property 4: generateContent forwards the provided model identifier**
    - **Validates: Requirements 7.1, 7.2**
    - Test file: `apps/api/src/__tests__/genai.property.test.ts`

- [x] 5. Remove geminiModel from GcpConfig
  - [x] 5.1 Update `apps/api/src/config/gcp.ts`
    - Remove `geminiModel` field from `GcpConfig` interface
    - Remove `geminiModel: 'gemini-2.5-flash'` assignment from config object
    - Remove `geminiModel` from `logGcpConfig()` output
    - _Requirements: 7.6_

  - [x] 5.2 Update `apps/worker/src/config/gcp.ts`
    - Remove `geminiModel` field from `GcpConfig` interface
    - Remove `geminiModel: 'gemini-2.5-flash'` assignment from config object
    - Remove `geminiModel` from `logGcpConfig()` output
    - _Requirements: 7.7_

- [x] 6. Update pipeline stages to use model router
  - [x] 6.1 Update `apps/worker/src/pipeline/process-input.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('text'))`
    - _Requirements: 4.1_

  - [x] 6.2 Update `apps/worker/src/pipeline/generate-copy.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('text'))`
    - _Requirements: 4.2_

  - [x] 6.3 Update `apps/worker/src/pipeline/generate-images.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('text'))` for concept generation
    - _Requirements: 4.3_

  - [x] 6.4 Update `apps/worker/src/pipeline/generate-video.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('reasoning'))` for storyboard/video brief generation
    - _Requirements: 4.6_

  - [x] 6.5 Write unit tests for pipeline stage routing
    - Verify ProcessInput calls `getModel('text')`
    - Verify GenerateCopy calls `getModel('text')`
    - Verify GenerateImages calls `getModel('text')` for concepts
    - Verify GenerateVideo calls `getModel('reasoning')` for storyboard
    - Test file: `apps/worker/src/__tests__/pipeline-routing.unit.test.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

- [x] 7. Update capability modules to use model router
  - [x] 7.1 Update `apps/worker/src/capabilities/image-generation.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Replace `cfg.geminiModel` with `getModel('image')` in `isAvailable()` and `generate()`
    - _Requirements: 4.4, 7.5_

  - [x] 7.2 Update `apps/worker/src/capabilities/video-generation.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Remove `VEO_MODEL` constant
    - Replace `VEO_MODEL` with `getModel('videoFinal')` in `generate()` method
    - _Requirements: 4.8, 7.5_

- [x] 8. Checkpoint - Worker service refactoring complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update Live Agent to use model router
  - [x] 9.1 Update `apps/api/src/services/live-session.ts`
    - Import `getModel` and `ModelUnavailableError` from `@content-storyteller/shared`
    - In `generateAgentResponse()`, use `getModel('live')` and pass to `generateContent(prompt, model)`
    - In `extractCreativeDirection()`, use `getModel('text')` and pass to `generateContent(prompt, model)`
    - In `processLiveInput()`, catch `ModelUnavailableError` and re-throw for route-level handling
    - _Requirements: 5.1, 5.2, 7.3_

  - [x] 9.2 Update `apps/api/src/routes/live.ts` for ModelUnavailableError handling
    - Import `ModelUnavailableError` from `@content-storyteller/shared`
    - In POST `/start` and POST `/input` handlers, catch `ModelUnavailableError`
    - Return 503 with `{ error: { code: 'LIVE_MODE_UNAVAILABLE', message: '...' } }`
    - _Requirements: 5.4_

  - [x] 9.3 Write unit tests for live session routing
    - Verify conversation uses `getModel('live')`
    - Verify extraction uses `getModel('text')`
    - Verify 503 response when live model is unavailable
    - Test file: `apps/api/src/__tests__/live-routing.unit.test.ts`
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 10. Update Trend Analyzer to use model router
  - [x] 10.1 Update `apps/api/src/services/trends/analyzer.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('text'))` for synthesis
    - _Requirements: 6.1, 6.2, 7.4_

  - [x] 10.2 Update `apps/api/src/services/trends/providers/gemini-provider.ts`
    - Import `getModel` from `@content-storyteller/shared`
    - Change `generateContent(prompt)` to `generateContent(prompt, getModel('text'))` for signal collection
    - _Requirements: 6.1, 7.4_

  - [x] 10.3 Write unit tests for trend analyzer routing
    - Verify analyzer uses `getModel('text')` for synthesis
    - Verify gemini-provider uses `getModel('text')` for signal collection
    - Test file: `apps/api/src/__tests__/trend-routing.unit.test.ts`
    - _Requirements: 6.1, 6.2_

- [x] 11. Integrate model router at startup and update health endpoints
  - [x] 11.1 Update `apps/api/src/index.ts`
    - Import `initModelRouter` and `getResolvedModels` from `@content-storyteller/shared`
    - Call `await initModelRouter()` at startup before `app.listen()`
    - Add `models` field to `/api/v1/health` response with slot → `{ model, status, fallbackUsed }` mapping
    - Add full `ResolvedModelMap` to `/api/v1/debug/gcp-config` response
    - _Requirements: 3.1, 3.6, 8.1, 8.2, 8.3, 8.5_

  - [x] 11.2 Update `apps/worker/src/index.ts`
    - Import `initModelRouter` and `getResolvedModels` from `@content-storyteller/shared`
    - Call `await initModelRouter()` at startup before `app.listen()`
    - Add `models` field to `/health` response with slot → `{ model, status, fallbackUsed }` mapping
    - _Requirements: 3.1, 3.6, 8.1, 8.2, 8.3_

  - [x] 11.3 Write property test for health endpoint security (P6)
    - **Property 6: Health endpoint response contains no secrets**
    - **Validates: Requirements 8.4**
    - Test file: `apps/api/src/__tests__/health.property.test.ts`

- [x] 12. Checkpoint - All routing and integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Update environment files and documentation
  - [x] 13.1 Update `.env.example` files
    - Add all `VERTEX_*` environment variables with defaults to `apps/api/.env.example`
    - Add all `VERTEX_*` environment variables with defaults to `apps/worker/.env.example`
    - _Requirements: 10.4_

  - [x] 13.2 Update `docs/env.md`
    - Document all `VERTEX_*` environment variables, their defaults, and their purpose
    - _Requirements: 12.1_

  - [x] 13.3 Update `docs/architecture.md`
    - Add a section describing the Model Router, Capability Slots, and Fallback Chains
    - _Requirements: 12.2_

  - [x] 13.4 Update `README.md`
    - Reference model routing configuration in setup instructions
    - _Requirements: 12.3_

  - [x] 13.5 Update `docs/deployment-proof.md`
    - Add verification steps for confirming model routing is active in production
    - _Requirements: 12.4_

- [x] 14. Verify no hardcoded model strings remain
  - [x] 14.1 Write property test for no hardcoded model strings (P5)
    - **Property 5: No hardcoded model name strings in source files**
    - **Validates: Requirements 7.8**
    - Test file: `packages/shared/src/__tests__/model-config.property.test.ts`

- [x] 15. Final checkpoint - All tests pass and feature complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout, matching the existing codebase
- `initModelRouter()` accepts an optional `checkAvailability` function for dependency injection in tests
