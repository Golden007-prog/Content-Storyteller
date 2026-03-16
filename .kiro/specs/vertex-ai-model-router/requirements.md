# Requirements Document

## Introduction

Content Storyteller currently uses a single hardcoded Gemini model (`gemini-2.5-flash`) for all AI operations across Batch Mode, Live Agent Mode, and Trend Analyzer Mode. This feature introduces a shared model router that maps each AI task to the optimal Google Vertex AI model based on capability (text, reasoning, image, video, live), with environment-variable overrides, startup availability checks, and ordered fallback chains. The refactoring replaces all hardcoded model references while preserving existing API contracts and frontend flows.

## Glossary

- **Model_Router**: The central module (`apps/api/src/services/ai/model-router.ts`) that resolves, validates, and serves the correct Vertex AI model identifier for each AI capability
- **Model_Config**: The configuration module (`apps/api/src/config/models.ts`) that reads environment variables and defines default model identifiers for each capability slot
- **Capability_Slot**: A named category of AI work (text, reasoning, image, imageHQ, videoFast, videoFinal, live) that maps to a specific Vertex AI model
- **Fallback_Chain**: An ordered list of alternative model identifiers that the Model_Router tries when the primary model for a Capability_Slot is unavailable
- **Availability_Check**: A lightweight probe performed at startup to verify that a resolved model can accept requests on Vertex AI
- **Batch_Pipeline**: The worker service pipeline (`apps/worker/src/pipeline/`) that processes jobs through ProcessInput, GenerateCopy, GenerateImages, and GenerateVideo stages
- **Live_Agent**: The real-time conversational mode (`apps/api/src/services/live-session.ts`) that handles user-agent dialogue and creative direction extraction
- **Trend_Analyzer**: The trend analysis mode (`apps/api/src/services/trends/`) that collects signals, clusters topics, and generates content recommendations
- **GenAI_Service**: The existing shared helper (`apps/api/src/services/genai.ts` and `apps/worker/src/services/genai.ts`) that wraps the Google GenAI SDK
- **Health_Endpoint**: An API route that exposes resolved model selections, fallback status, and availability without revealing secrets

## Requirements

### Requirement 1: Centralized Model Configuration

**User Story:** As a developer, I want all Vertex AI model identifiers and their defaults defined in a single configuration module, so that model selections are consistent and easy to change.

#### Acceptance Criteria

1. THE Model_Config SHALL export the following Capability_Slot identifiers: textModel, textFallbackModel, reasoningModel, imageModel, imageHQModel, videoFastModel, videoFinalModel, liveModel
2. THE Model_Config SHALL export projectId and location values resolved from GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables respectively
3. WHEN a VERTEX_TEXT_MODEL environment variable is set, THE Model_Config SHALL use its value as the textModel identifier instead of the default
4. WHEN a VERTEX_TEXT_FALLBACK_MODEL environment variable is set, THE Model_Config SHALL use its value as the textFallbackModel identifier instead of the default
5. WHEN a VERTEX_REASONING_MODEL environment variable is set, THE Model_Config SHALL use its value as the reasoningModel identifier instead of the default
6. WHEN a VERTEX_IMAGE_MODEL environment variable is set, THE Model_Config SHALL use its value as the imageModel identifier instead of the default
7. WHEN a VERTEX_IMAGE_HQ_MODEL environment variable is set, THE Model_Config SHALL use its value as the imageHQModel identifier instead of the default
8. WHEN a VERTEX_VIDEO_FAST_MODEL environment variable is set, THE Model_Config SHALL use its value as the videoFastModel identifier instead of the default
9. WHEN a VERTEX_VIDEO_FINAL_MODEL environment variable is set, THE Model_Config SHALL use its value as the videoFinalModel identifier instead of the default
10. WHEN a VERTEX_LIVE_MODEL environment variable is set, THE Model_Config SHALL use its value as the liveModel identifier instead of the default
11. WHEN no environment override is provided for a Capability_Slot, THE Model_Config SHALL use these defaults: textModel=gemini-3.1-flash, textFallbackModel=gemini-3-flash-preview, reasoningModel=gemini-3.1-pro-preview, imageModel=gemini-3.1-flash-image-preview, imageHQModel=gemini-3-pro-image-preview, videoFastModel=veo-3.1-fast-generate-001, videoFinalModel=veo-3.1-generate-001, liveModel=gemini-live-2.5-flash-native-audio

### Requirement 2: Model Router with Capability-Based Resolution

**User Story:** As a developer, I want a model router that resolves the correct Vertex AI model for each AI task by capability, so that each mode uses the optimal model for its job.

#### Acceptance Criteria

1. THE Model_Router SHALL expose a function that accepts a Capability_Slot name and returns the resolved model identifier for that slot
2. THE Model_Router SHALL resolve models for all defined Capability_Slots: text, textFallback, reasoning, image, imageHQ, videoFast, videoFinal, live
3. WHEN the Model_Router resolves a model for a Capability_Slot, THE Model_Router SHALL return the availability-validated model identifier or the first available fallback
4. THE Model_Router SHALL be importable by both the API service and the Worker service without code duplication

### Requirement 3: Startup Availability Checks and Fallback Chains

**User Story:** As a platform operator, I want the system to verify model availability at startup and fall back to alternatives automatically, so that the application starts reliably even when a preferred model is unavailable.

#### Acceptance Criteria

1. WHEN the application starts, THE Model_Router SHALL perform an Availability_Check for each primary model in every Capability_Slot
2. WHEN the primary textModel is unavailable, THE Model_Router SHALL fall back through the chain: gemini-3.1-flash → gemini-3-flash-preview → gemini-3.1-flash-lite-preview
3. WHEN the primary imageHQModel is unavailable, THE Model_Router SHALL fall back through the chain: gemini-3-pro-image-preview → gemini-3.1-flash-image-preview
4. WHEN the primary videoFinalModel is unavailable, THE Model_Router SHALL fall back through the chain: veo-3.1-generate-001 → veo-3.1-fast-generate-001
5. WHEN the liveModel is unavailable, THE Model_Router SHALL return a structured error indicating live mode is not available instead of substituting a non-live model
6. THE Model_Router SHALL log the resolved model identifier for each Capability_Slot at startup
7. WHEN a fallback model is selected, THE Model_Router SHALL log a warning indicating the primary model was unavailable and which fallback was chosen
8. IF all models in a Fallback_Chain are unavailable, THEN THE Model_Router SHALL log an error for that Capability_Slot and mark the slot as degraded without crashing the application

### Requirement 4: Batch Pipeline Model Routing

**User Story:** As a content creator using Batch Mode, I want each pipeline stage to use the optimal model for its task, so that text, images, and videos are generated with the highest quality model available.

#### Acceptance Criteria

1. WHEN the ProcessInput stage generates a Creative Brief, THE Batch_Pipeline SHALL use the textModel from the Model_Router
2. WHEN the GenerateCopy stage generates marketing copy, THE Batch_Pipeline SHALL use the textModel from the Model_Router
3. WHEN the GenerateImages stage generates image concepts, THE Batch_Pipeline SHALL use the textModel from the Model_Router for prompt generation
4. WHEN the GenerateImages stage generates actual images, THE Batch_Pipeline SHALL use the imageModel from the Model_Router
5. WHEN a high-quality image is requested, THE Batch_Pipeline SHALL use the imageHQModel from the Model_Router
6. WHEN the GenerateVideo stage generates storyboard and video brief text, THE Batch_Pipeline SHALL use the reasoningModel from the Model_Router
7. WHEN the GenerateVideo stage generates a teaser video, THE Batch_Pipeline SHALL use the videoFastModel from the Model_Router
8. WHEN the GenerateVideo stage generates a final video, THE Batch_Pipeline SHALL use the videoFinalModel from the Model_Router
9. WHEN the compose-package stage assembles the final bundle, THE Batch_Pipeline SHALL use the textModel from the Model_Router

### Requirement 5: Live Agent Model Routing

**User Story:** As a content creator using Live Agent Mode, I want real-time conversation to use the native live model and post-session tasks to use the appropriate text or reasoning model, so that the experience is responsive and summaries are high quality.

#### Acceptance Criteria

1. WHEN a live conversation session is active, THE Live_Agent SHALL use the liveModel from the Model_Router for real-time dialogue
2. WHEN a live session ends and creative direction is extracted, THE Live_Agent SHALL use the textModel or reasoningModel from the Model_Router for summarization
3. WHEN a live session hands off to the Batch_Pipeline for package generation, THE Live_Agent SHALL pass the job to the Batch_Pipeline which uses its own model routing
4. IF the liveModel is unavailable, THEN THE Live_Agent SHALL return a structured error to the client indicating live mode is not available

### Requirement 6: Trend Analyzer Model Routing

**User Story:** As a content creator using Trend Analyzer Mode, I want trend analysis to use the text model for synthesis and the reasoning model for deeper strategy, so that trend insights are fast and strategic recommendations are thorough.

#### Acceptance Criteria

1. WHEN the Trend_Analyzer performs query understanding and signal collection, THE Trend_Analyzer SHALL use the textModel from the Model_Router
2. WHEN the Trend_Analyzer performs clustering, ranking, and hook generation, THE Trend_Analyzer SHALL use the textModel from the Model_Router
3. WHEN the Trend_Analyzer generates deeper strategic recommendations, THE Trend_Analyzer SHALL use the reasoningModel from the Model_Router
4. WHEN the Trend_Analyzer generates optional image concepts from selected trends, THE Trend_Analyzer SHALL use the imageModel from the Model_Router
5. WHEN the Trend_Analyzer generates optional video teasers from selected trends, THE Trend_Analyzer SHALL use the videoFastModel or videoFinalModel from the Model_Router

### Requirement 7: Removal of Hardcoded Model References

**User Story:** As a developer, I want all hardcoded model name strings removed from the codebase, so that model selection is controlled exclusively through the Model_Router and Model_Config.

#### Acceptance Criteria

1. THE GenAI_Service in apps/api/src/services/genai.ts SHALL accept a model identifier parameter instead of reading a hardcoded model from GcpConfig
2. THE GenAI_Service in apps/worker/src/services/genai.ts SHALL accept a model identifier parameter instead of reading a hardcoded model from GcpConfig
3. THE Live_Agent SHALL obtain its model identifier from the Model_Router instead of using the shared GenAI_Service default
4. THE Trend_Analyzer SHALL obtain its model identifier from the Model_Router instead of using the shared GenAI_Service default
5. THE VideoGenerationCapability SHALL obtain its video model identifier from the Model_Router instead of using the hardcoded VEO_MODEL constant
6. THE GcpConfig in apps/api/src/config/gcp.ts SHALL remove the geminiModel field after migration to Model_Config
7. THE GcpConfig in apps/worker/src/config/gcp.ts SHALL remove the geminiModel field after migration to Model_Config
8. WHEN a text search is performed across the codebase for literal model name strings (gemini-2.5-flash, veo-2.0-generate-001), THE codebase SHALL contain zero matches outside of Model_Config defaults and test fixtures


### Requirement 8: Health and Debug Visibility

**User Story:** As a platform operator, I want API endpoints that show which models are resolved for each capability slot and whether any fallbacks are active, so that I can diagnose model routing issues in production without exposing secrets.

#### Acceptance Criteria

1. THE Health_Endpoint SHALL return the resolved model identifier for each Capability_Slot
2. THE Health_Endpoint SHALL indicate whether each Capability_Slot is using its primary model or a fallback
3. THE Health_Endpoint SHALL include the availability status (available, degraded, unavailable) for each Capability_Slot
4. THE Health_Endpoint SHALL NOT include API keys, service account credentials, or access tokens in the response
5. WHEN a Capability_Slot is using a fallback model, THE Health_Endpoint SHALL include the name of the unavailable primary model and the selected fallback model

### Requirement 9: Backward Compatibility and Contract Preservation

**User Story:** As a frontend developer, I want the existing API contracts and frontend flows to remain unchanged after the model routing refactor, so that the web application continues to work without modification.

#### Acceptance Criteria

1. THE API service SHALL preserve all existing REST endpoint paths, request schemas, and response schemas after the refactor
2. THE API service SHALL preserve the existing SSE streaming contract for job progress updates
3. THE Batch_Pipeline SHALL preserve the existing Pub/Sub message format for job submission
4. THE Live_Agent SHALL preserve the existing session creation, message, and end-session API contracts
5. THE Trend_Analyzer SHALL preserve the existing trend query and trend result API contracts
6. WHEN the frontend sends a request to any existing endpoint, THE API service SHALL return a response with the same structure as before the refactor

### Requirement 10: Environment Override and Local Development Support

**User Story:** As a developer, I want to override any model selection via environment variables and have local development work without changes, so that I can test with different models or run locally with API key fallback.

#### Acceptance Criteria

1. WHEN GEMINI_API_KEY is set and Vertex AI ADC is not available, THE GenAI_Service SHALL fall back to Google AI Studio API key authentication for local development
2. THE Model_Config SHALL read all VERTEX_* environment variables at startup and apply overrides before Availability_Checks run
3. WHEN a developer sets a VERTEX_* environment variable to a custom model name, THE Model_Router SHALL use that model without performing an Availability_Check against the default
4. THE .env.example files for apps/api and apps/worker SHALL document all VERTEX_* environment variables with their defaults

### Requirement 11: Test Coverage for Model Routing

**User Story:** As a developer, I want comprehensive tests for the model router, fallback behavior, and mode-specific routing, so that regressions in model selection are caught before deployment.

#### Acceptance Criteria

1. THE test suite SHALL verify that Model_Config returns correct defaults when no environment overrides are set
2. THE test suite SHALL verify that each VERTEX_* environment variable correctly overrides its corresponding Capability_Slot
3. THE test suite SHALL verify that the Model_Router selects the first available fallback when the primary model is unavailable
4. THE test suite SHALL verify that the Model_Router marks a Capability_Slot as degraded when all models in its Fallback_Chain are unavailable
5. THE test suite SHALL verify that no source file outside Model_Config defaults and test fixtures contains hardcoded model name strings
6. THE test suite SHALL verify that each Batch_Pipeline stage requests the correct Capability_Slot from the Model_Router
7. THE test suite SHALL verify that the Live_Agent requests the liveModel Capability_Slot for real-time conversation
8. THE test suite SHALL verify that the Trend_Analyzer requests the textModel Capability_Slot for synthesis and the reasoningModel Capability_Slot for strategy

### Requirement 12: Documentation Updates

**User Story:** As a developer or operator, I want updated documentation reflecting the new model routing architecture, environment variables, and deployment configuration, so that the team can onboard and operate the system correctly.

#### Acceptance Criteria

1. THE docs/env.md file SHALL document all VERTEX_* environment variables, their defaults, and their purpose
2. THE docs/architecture.md file SHALL include a section describing the Model_Router, Capability_Slots, and Fallback_Chains
3. THE README.md file SHALL reference the model routing configuration in its setup instructions
4. THE docs/deployment-proof.md file SHALL include verification steps for confirming model routing is active in production
