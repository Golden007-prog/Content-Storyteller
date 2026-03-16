# Implementation Plan: Trend Analyzer

## Overview

This plan adds a trend discovery feature to Content Storyteller. Tasks follow a phased approach: shared types first, then backend API with validation, trend provider architecture, AI analysis layer, frontend components, CTA integration with existing generation flow, and tests. Each task builds incrementally on previous steps and references specific requirements and design properties.

## Tasks

- [x] 1. Shared package — Trend types
  - [x] 1.1 Create TrendPlatform enum and TrendDomain types
    - Create `packages/shared/src/types/trends.ts` with `TrendPlatform` enum (`InstagramReels`, `XTwitter`, `LinkedIn`, `AllPlatforms`), `TrendDomainPreset` type (7 preset values), and `TrendDomain` type (preset or custom string)
    - Export all from `packages/shared/src/index.ts`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [x] 1.2 Create TrendRegion, TrendQuery, FreshnessLabel, TrendItem, and TrendAnalysisResult interfaces
    - Add to `packages/shared/src/types/trends.ts`: `TrendRegion` interface (scope, optional country, optional stateProvince), `TrendQuery` interface (platform, domain, region, optional timeWindow, optional language), `FreshnessLabel` type, `TrendItem` interface (all fields per design), `TrendAnalysisResult` interface (queryId, platform, domain, region, timeWindow, language, generatedAt, summary, trends)
    - Export all from `packages/shared/src/index.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 6.3_

  - [x] 1.3 Write property tests for shared trend types
    - **Property 1: TrendPlatform and TrendDomainPreset completeness**
    - **Validates: Requirements 1.1, 2.1, 21.3, 21.4**
    - **Property 2: Trend type interface field completeness**
    - **Validates: Requirements 3.1, 4.1, 5.1, 6.1, 21.1**
    - **Property 3: TrendAnalysisResult JSON round-trip**
    - **Validates: Requirements 6.3, 21.2**
    - Add tests to `packages/shared/src/__tests__/trend-types.property.test.ts`

  - [x] 1.4 Write unit tests for shared trend types
    - Verify barrel exports include all new trend types (TrendPlatform, TrendDomainPreset, TrendDomain, TrendRegion, TrendQuery, FreshnessLabel, TrendItem, TrendAnalysisResult)
    - Verify TrendPlatform enum string values match expected patterns
    - Verify FreshnessLabel accepts exactly 4 values
    - Add tests to `packages/shared/src/__tests__/trend-types.unit.test.ts`
    - _Requirements: 1.1, 1.2, 2.1, 5.1, 6.1_

- [x] 2. Checkpoint — Shared package builds and tests pass
  - Ensure `npm run build --workspace=packages/shared` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Backend API — Trend routes and validation
  - [x] 3.1 Create trend analysis endpoint with input validation
    - Create `apps/api/src/routes/trends.ts` with `POST /api/v1/trends/analyze` handler
    - Validate `platform` against TrendPlatform enum → 400 `INVALID_TREND_PLATFORM`
    - Validate `domain` is non-empty string → 400 `MISSING_DOMAIN`
    - Validate `region.scope` is valid, and required fields present for scope → 400 `INVALID_REGION`
    - Validate optional `timeWindow` is one of `24h`, `7d`, `30d` → 400 `INVALID_TIME_WINDOW`
    - On valid input, call `analyzeTrends(query)` (stubbed initially), persist result in Firestore, return `TrendAnalysisResult` with HTTP 200
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 3.2 Create trend result retrieval endpoint
    - Add `GET /api/v1/trends/:queryId` handler to `apps/api/src/routes/trends.ts`
    - Read from Firestore `trendQueries` collection by document ID
    - Return `TrendAnalysisResult` with HTTP 200, or 404 with `TREND_QUERY_NOT_FOUND`
    - _Requirements: 8.1, 8.2_

  - [x] 3.3 Add Firestore helpers for trend queries
    - Add `createTrendQuery(result: TrendAnalysisResult): Promise<string>` to `apps/api/src/services/firestore.ts`
    - Add `getTrendQuery(queryId: string): Promise<TrendAnalysisResult | null>` to `apps/api/src/services/firestore.ts`
    - _Requirements: 7.6, 8.1_

  - [x] 3.4 Register trend routes in API service
    - Import `trendsRouter` in `apps/api/src/index.ts`
    - Add `app.use('/api/v1/trends', trendsRouter)`
    - _Requirements: 7.1_

  - [x] 3.5 Write property tests for trend API validation
    - **Property 4: Invalid TrendQuery rejection**
    - **Validates: Requirements 3.3, 3.4, 7.2, 7.3, 7.4, 7.5, 20.1, 20.2, 20.3, 20.4**
    - **Property 5: Valid TrendQuery acceptance**
    - **Validates: Requirements 7.1, 20.5**
    - **Property 7: Non-existent queryId returns 404**
    - **Validates: Requirements 8.2**
    - **Property 17: Domain presets and custom strings accepted**
    - **Validates: Requirements 2.2, 18.2, 18.3**
    - Add tests to `apps/api/src/__tests__/trend-api.property.test.ts`

  - [x] 3.6 Write unit tests for trend API
    - Test specific validation error messages and codes
    - Test Firestore persistence and retrieval round-trip
    - Test 503 response when Gemini is unavailable
    - Test correlation ID present on error responses
    - Add tests to `apps/api/src/__tests__/trend-api.unit.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 19.2, 19.4_

- [x] 4. Checkpoint — API trend routes build and tests pass
  - Ensure `npm run build --workspace=apps/api` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Trend provider architecture
  - [x] 5.1 Create provider types and interface
    - Create `apps/api/src/services/trends/types.ts` with `RawTrendSignal` interface and `TrendProvider` interface (name, fetchSignals method)
    - _Requirements: 9.1, 9.2_

  - [x] 5.2 Implement normalization and scoring
    - Create `apps/api/src/services/trends/normalize.ts` with `NormalizedSignal` interface and `normalizeSignals()` function that standardizes region labels, applies scoring, and deduplicates by title similarity
    - Create `apps/api/src/services/trends/scoring.ts` with `computeMomentumScore()` (0–100, clamped) and `computeRelevanceScore()` (0–100, clamped) functions
    - _Requirements: 11.1, 11.2, 11.3, 18.1_

  - [x] 5.3 Implement Gemini trend provider
    - Create `apps/api/src/services/trends/providers/gemini-provider.ts` implementing `TrendProvider` interface
    - Uses Gemini to generate raw trend signals based on query platform, domain, region context
    - Labels signals with `isInferred: true` and `sourceName: 'gemini'`
    - _Requirements: 9.2, 9.5, 10.1, 10.2, 10.3, 10.4_

  - [x] 5.4 Create provider registry
    - Create `apps/api/src/services/trends/registry.ts` with `getProviders()` returning array of registered `TrendProvider` instances
    - Currently returns `[GeminiTrendProvider]`; extensible for future providers
    - _Requirements: 9.2, 9.4_

  - [x] 5.5 Write property tests for normalization and scoring
    - **Property 8: Normalization produces complete common format**
    - **Validates: Requirements 9.3, 11.1, 22.1**
    - **Property 9: Momentum and relevance scores bounded 0–100**
    - **Validates: Requirements 11.2, 11.3, 22.2, 22.3**
    - **Property 18: Inferred signals labeled correctly**
    - **Validates: Requirements 9.5**
    - Add tests to `apps/api/src/__tests__/trend-provider.property.test.ts`

  - [x] 5.6 Write unit tests for provider architecture
    - Test provider registry returns expected providers
    - Test scoring edge cases (null rawScore, extreme values)
    - Test normalization deduplication
    - Test provider failure logging and graceful degradation
    - Add tests to `apps/api/src/__tests__/trend-provider.unit.test.ts`
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 11.1, 11.2, 11.3, 22.4_

- [x] 6. Checkpoint — Provider architecture builds and tests pass
  - Ensure `npm run build --workspace=apps/api` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. AI analysis layer — Gemini integration
  - [x] 7.1 Create API service GenAI client
    - Create `apps/api/src/services/genai.ts` initializing `@google/genai` with `GEMINI_API_KEY` env var (same pattern as `apps/worker/src/services/genai.ts`)
    - Export `generateContent` wrapper using `gemini-2.0-flash` model
    - Update `apps/api/.env.example` with `GEMINI_API_KEY`
    - _Requirements: 12.1_

  - [x] 7.2 Implement trend analyzer orchestrator
    - Create `apps/api/src/services/trends/analyzer.ts` with `analyzeTrends(query: TrendQuery): Promise<TrendAnalysisResult>`
    - Orchestration: get providers → `Promise.allSettled` on `fetchSignals` → collect results, log failures → normalize signals → pass to Gemini for consolidation, clustering, ranking, content generation → return structured `TrendAnalysisResult`
    - Handle graceful degradation: if all providers fail, Gemini generates from knowledge with `inferred` labels
    - Handle Gemini failure: throw error caught by route handler, return 503 `ANALYSIS_UNAVAILABLE`
    - _Requirements: 9.3, 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 17.1, 17.2, 17.5, 19.1, 19.2, 19.3_

  - [x] 7.3 Wire analyzer into trend route
    - Update `apps/api/src/routes/trends.ts` POST handler to call `analyzeTrends(query)` instead of stub
    - Add try/catch for Gemini failures → 503 `ANALYSIS_UNAVAILABLE`
    - _Requirements: 7.1, 19.2_

- [x] 8. Checkpoint — Full backend builds and tests pass
  - Ensure `npm run build --workspace=apps/api` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend — Trend Analyzer components
  - [x] 9.1 Add API client functions for trends
    - Add `analyzeTrends(query: TrendQuery): Promise<TrendAnalysisResult>` to `apps/web/src/api/client.ts`
    - Add `getTrendResult(queryId: string): Promise<TrendAnalysisResult>` to `apps/web/src/api/client.ts`
    - _Requirements: 7.1, 8.1_

  - [x] 9.2 Create TrendFilters component
    - Create `apps/web/src/components/TrendFilters.tsx` with platform selector (4 TrendPlatform options), domain selector (7 presets + custom text input), region selector (scope dropdown with conditional country/stateProvince inputs), optional time window dropdown (24h, 7d, 30d), optional language text input, "Analyze Trends" submit button
    - Client-side validation: require platform and domain before submission
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x] 9.3 Create TrendSummary component
    - Create `apps/web/src/components/TrendSummary.tsx` displaying the overall `summary` narrative from `TrendAnalysisResult` in a styled card
    - _Requirements: 15.1_

  - [x] 9.4 Create TrendCard component
    - Create `apps/web/src/components/TrendCard.tsx` displaying: title, keyword, description, suggestedHook, suggestedHashtags (as badges), suggestedContentAngle, platform label, region label, freshnessLabel badge (colored: green=Fresh, blue=Rising Fast, gray=Established, orange=Fading), momentumScore indicator (progress bar or numeric badge), "Use in Content Storyteller" CTA button
    - _Requirements: 15.3, 15.4, 16.1, 17.2, 17.3, 17.4_

  - [x] 9.5 Create TrendResults component
    - Create `apps/web/src/components/TrendResults.tsx` rendering: loading state with skeleton placeholders, empty state message, `TrendSummary` component, grid of `TrendCard` components (one per TrendItem)
    - _Requirements: 15.1, 15.2, 15.5, 15.6_

  - [x] 9.6 Create TrendAnalyzerPage container
    - Create `apps/web/src/components/TrendAnalyzerPage.tsx` managing: `trendQuery` state, `analysisResult` state, `isLoading` state, `error` state
    - On form submit, call `analyzeTrends()` API, pass results to `TrendResults`
    - _Requirements: 13.2_

  - [x] 9.7 Integrate TrendAnalyzerPage into App.tsx
    - Add `'trends'` to `AppMode` type in `apps/web/src/App.tsx`
    - Add "📊 Trend Analyzer" button to the header mode toggle alongside Batch Mode and Live Agent
    - Render `<TrendAnalyzerPage />` when mode is `'trends'`
    - Maintain existing batch and live agent navigation unchanged
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 10. Frontend — "Use in Content Storyteller" CTA integration
  - [x] 10.1 Implement CTA click handler and platform mapping
    - In `TrendCard.tsx`: on CTA click, build prompt string from trend data (title, description, suggestedHook, suggestedContentAngle, suggestedHashtags)
    - Map `TrendPlatform` to `Platform` enum: InstagramReels→InstagramReel, XTwitter→XTwitterThread, LinkedIn→LinkedInLaunchPost, AllPlatforms→GeneralPromoPackage
    - Switch `AppMode` to `'batch'` and pass pre-filled prompt + platform to `LandingPage`
    - _Requirements: 16.2, 16.3, 16.4, 16.5_

  - [x] 10.2 Update LandingPage to accept pre-filled values
    - Modify `apps/web/src/components/LandingPage.tsx` to accept optional `initialPrompt` and `initialPlatform` props
    - Pre-fill form fields when props are provided; values remain editable
    - _Requirements: 16.3, 16.4, 16.5_

  - [x] 10.3 Wire CTA through App.tsx state
    - Add state in `App.tsx` for pre-filled trend data (prompt, platform)
    - Pass callback from `App.tsx` → `TrendAnalyzerPage` → `TrendCard` for CTA clicks
    - On CTA click: set pre-fill state, switch mode to `'batch'`, render `LandingPage` with pre-filled values
    - _Requirements: 16.2, 16.3, 16.4, 16.5_

- [x] 11. Checkpoint — Frontend builds and tests pass
  - Ensure `npm run build --workspace=apps/web` succeeds
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend and integration tests
  - [x] 12.1 Write property tests for frontend trend components
    - **Property 12: Platform selector renders all TrendPlatform options**
    - **Validates: Requirements 14.1, 23.5**
    - **Property 13: Filter validation prevents submission without required fields**
    - **Validates: Requirements 14.7, 14.8**
    - **Property 14: TrendResults renders one TrendCard per TrendItem**
    - **Validates: Requirements 15.2, 23.2**
    - **Property 15: TrendCard renders all required fields**
    - **Validates: Requirements 15.3, 15.4, 16.1, 17.3, 17.4**
    - **Property 16: CTA pre-fills prompt and maps platform correctly**
    - **Validates: Requirements 16.3, 16.4**
    - Add tests to `apps/web/src/__tests__/trend-analyzer.property.test.tsx`

  - [x] 12.2 Write unit tests for frontend trend components
    - Test TrendFilters renders all platform, domain, and region options
    - Test loading state renders skeleton placeholders
    - Test empty state renders when no trends returned
    - Test TrendSummary renders summary text
    - Test freshness label badge colors (green, blue, gray, orange)
    - Test momentum score indicator rendering
    - Test "Use in Content Storyteller" button triggers mode switch with pre-filled values
    - Test existing batch mode and live agent mode still work after adding trends mode
    - Add tests to `apps/web/src/__tests__/trend-analyzer.unit.test.tsx`
    - _Requirements: 13.3, 15.1, 15.5, 15.6, 16.1, 17.3, 17.4, 23.1, 23.2, 23.3, 23.4_

- [x] 13. Documentation updates
  - [x] 13.1 Update project documentation
    - Update `README.md` to mention Trend Analyzer in the feature list
    - Update `docs/architecture.md` with Trend Analyzer data flow and component descriptions
    - Update `docs/demo-script.md` with Trend Analyzer demo section (filter selection → trend discovery → "Use in Content Storyteller" CTA)
    - Update `docs/judge-checklist.md` with Trend Analyzer evidence entries mapping to code files
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

- [x] 14. Final checkpoint — Full build and integration verification
  - Ensure `npm run build` succeeds across all workspaces
  - Ensure all tests pass across all workspaces
  - Verify trend analysis works with all 4 platform values and all 7 domain presets plus a custom domain
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major milestone
- Property tests validate the 18 correctness properties from the design document
- All tasks extend existing code — no foundation files are recreated
- The trend analyzer runs synchronously in the API service (no worker/Pub/Sub needed)
- The "Use in Content Storyteller" CTA reuses the existing generation flow without modification to the pipeline
- Region and domain support is built into phases 1, 3, 5, and 7 rather than as a separate phase
- Result quality and scoring is built into phases 5 and 7 rather than as a separate phase
