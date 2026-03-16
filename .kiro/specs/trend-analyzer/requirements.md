# Requirements Document

## Introduction

Trend Analyzer is a new feature for the Content Storyteller application that enables users to discover trending topics, keywords, hashtags, and content angles across Instagram Reels, X/Twitter, LinkedIn, and an optional combined "All Platforms" mode. Users select a platform, domain/category, region, and optional time window and language filters, then receive AI-analyzed trend results with confidence and freshness indicators. Each trend result can be used to pre-fill the existing Content Storyteller campaign generation flow via a "Use in Content Storyteller" CTA. The feature extends the existing monorepo cleanly — adding shared types, a backend API, a provider-based trend collection architecture, a Gemini-powered AI analysis layer, frontend components, and integration with the existing generation flow — without modifying or breaking existing content generation behavior.

## Glossary

- **Trend_Analyzer**: The new feature module encompassing the frontend page, backend API, trend providers, and AI analysis layer that discovers and presents platform-specific trends
- **Web_App**: The existing React + Vite + TailwindCSS frontend application served from `apps/web`
- **API_Service**: The existing Express API service at `apps/api` that handles HTTP requests, job creation, SSE streaming, and signed URL generation
- **Worker_Service**: The existing async worker at `apps/worker` that runs the generation pipeline stages
- **Shared_Package**: The `packages/shared` TypeScript package exporting all types, enums, and schemas consumed by two or more services
- **TrendPlatform**: An enum representing the social platform to analyze trends for (InstagramReels, XTwitter, LinkedIn, AllPlatforms)
- **TrendDomain**: A type representing the content domain/category for trend filtering (tech, fashion, finance, fitness, education, gaming, startup, or a custom string)
- **TrendRegion**: A structured type representing the geographic scope of trend analysis (global, country-level, or state/province-level)
- **TrendQuery**: The input parameters for a trend analysis request: platform, domain, region, optional time window, optional language
- **TrendItem**: A single trend result containing title, keyword, description, scores, suggested content, source labels, region, platform, and freshness label
- **TrendAnalysisResult**: The complete response from a trend analysis containing platform, domain, region, time window, generation timestamp, summary, and an array of TrendItem objects
- **Trend_Provider**: An abstraction in the backend that collects raw trend signals from public feeds, search-based signals, social trend APIs, or internal fallback logic
- **AI_Analysis_Layer**: The Gemini-powered processing step that consolidates raw trend signals, clusters similar topics, ranks trends, and generates summaries, hooks, hashtags, and content angle suggestions
- **Momentum_Score**: A numeric indicator (0–100) representing how rapidly a trend is gaining traction
- **Relevance_Score**: A numeric indicator (0–100) representing how well a trend matches the selected domain and platform
- **Freshness_Label**: A categorical label (Fresh, Rising Fast, Established, Fading) indicating the recency and trajectory of a trend
- **Campaign_Generation_Flow**: The existing Content Storyteller batch generation pipeline that accepts prompt text, platform, tone, and uploaded media to produce marketing packages

## Requirements

### Requirement 1: Shared Types — TrendPlatform Enum

**User Story:** As a developer, I want a TrendPlatform enum in the shared package, so that all services use consistent values for trend analysis platform targeting.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendPlatform` enum with values: `InstagramReels`, `XTwitter`, `LinkedIn`, `AllPlatforms`
2. THE Shared_Package SHALL export the `TrendPlatform` enum from the barrel `index.ts` file

### Requirement 2: Shared Types — TrendDomain Type

**User Story:** As a developer, I want a TrendDomain type in the shared package, so that all services use consistent domain/category values for trend filtering.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendDomainPreset` type with fixed values: `tech`, `fashion`, `finance`, `fitness`, `education`, `gaming`, `startup`
2. THE Shared_Package SHALL export a `TrendDomain` type that accepts any `TrendDomainPreset` value or a custom string
3. THE Shared_Package SHALL export both types from the barrel `index.ts` file

### Requirement 3: Shared Types — TrendRegion Type

**User Story:** As a developer, I want a TrendRegion type in the shared package, so that all services use consistent geographic scope values for trend analysis.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendRegion` interface with fields: `scope` (one of `global`, `country`, `state_province`), `country` (optional string), `stateProvince` (optional string)
2. WHEN `scope` is `global`, THE TrendRegion SHALL require no additional fields
3. WHEN `scope` is `country`, THE TrendRegion SHALL require a non-empty `country` field
4. WHEN `scope` is `state_province`, THE TrendRegion SHALL require non-empty `country` and `stateProvince` fields
5. THE Shared_Package SHALL export the `TrendRegion` interface from the barrel `index.ts` file

### Requirement 4: Shared Types — TrendQuery Interface

**User Story:** As a developer, I want a TrendQuery interface in the shared package, so that trend analysis requests have a consistent shape across frontend and backend.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendQuery` interface with fields: `platform` (TrendPlatform), `domain` (TrendDomain), `region` (TrendRegion), `timeWindow` (optional, one of `24h`, `7d`, `30d`), `language` (optional string)
2. THE Shared_Package SHALL export the `TrendQuery` interface from the barrel `index.ts` file

### Requirement 5: Shared Types — TrendItem Interface

**User Story:** As a developer, I want a TrendItem interface in the shared package, so that individual trend results have a consistent structure for display and processing.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendItem` interface with fields: `title` (string), `keyword` (string), `description` (string), `momentumScore` (number, 0–100), `relevanceScore` (number, 0–100), `suggestedHashtags` (string array), `suggestedHook` (string), `suggestedContentAngle` (string), `sourceLabels` (string array), `region` (TrendRegion), `platform` (TrendPlatform), `freshnessLabel` (one of `Fresh`, `Rising Fast`, `Established`, `Fading`)
2. THE Shared_Package SHALL export the `TrendItem` interface from the barrel `index.ts` file

### Requirement 6: Shared Types — TrendAnalysisResult Interface

**User Story:** As a developer, I want a TrendAnalysisResult interface in the shared package, so that the complete trend analysis response has a consistent structure.

#### Acceptance Criteria

1. THE Shared_Package SHALL export a `TrendAnalysisResult` interface with fields: `platform` (TrendPlatform), `domain` (TrendDomain), `region` (TrendRegion), `timeWindow` (optional string), `language` (optional string), `generatedAt` (string, ISO 8601 timestamp), `summary` (string), `trends` (TrendItem array)
2. THE Shared_Package SHALL export the `TrendAnalysisResult` interface from the barrel `index.ts` file
3. FOR ALL valid TrendAnalysisResult objects, serializing to JSON then parsing back SHALL produce an equivalent object (round-trip property)

### Requirement 7: Backend API — Trend Analysis Endpoint

**User Story:** As a frontend developer, I want a POST endpoint to submit trend analysis queries, so that the Web_App can request trend data for a given platform, domain, and region.

#### Acceptance Criteria

1. WHEN a POST request is sent to `/api/v1/trends/analyze` with a valid TrendQuery body (platform, domain, region, optional timeWindow, optional language), THE API_Service SHALL accept the request and return a TrendAnalysisResult with HTTP 200 status
2. WHEN a POST request is sent to `/api/v1/trends/analyze` with an invalid `platform` value, THE API_Service SHALL reject the request with HTTP 400 status and error code `INVALID_TREND_PLATFORM`
3. WHEN a POST request is sent to `/api/v1/trends/analyze` with an empty or missing `domain` field, THE API_Service SHALL reject the request with HTTP 400 status and error code `MISSING_DOMAIN`
4. WHEN a POST request is sent to `/api/v1/trends/analyze` with an invalid `region` (missing required fields for the given scope), THE API_Service SHALL reject the request with HTTP 400 status and error code `INVALID_REGION`
5. WHEN a POST request is sent to `/api/v1/trends/analyze` with an unsupported `timeWindow` value, THE API_Service SHALL reject the request with HTTP 400 status and error code `INVALID_TIME_WINDOW`
6. THE API_Service SHALL persist each TrendAnalysisResult in Firestore with a unique `queryId` for later retrieval

### Requirement 8: Backend API — Trend Result Retrieval Endpoint

**User Story:** As a frontend developer, I want a GET endpoint to retrieve a previously generated trend analysis by query ID, so that results can be cached and revisited.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/v1/trends/:queryId`, THE API_Service SHALL return the stored TrendAnalysisResult with HTTP 200 status
2. WHEN a GET request is sent to `/api/v1/trends/:queryId` with a non-existent queryId, THE API_Service SHALL return HTTP 404 status with error code `TREND_QUERY_NOT_FOUND`

### Requirement 9: Trend Provider Architecture — Provider Abstraction

**User Story:** As a developer, I want a provider-based architecture for trend data collection, so that trend sources can be added, removed, or swapped without changing the analysis pipeline.

#### Acceptance Criteria

1. THE API_Service SHALL implement a `TrendProvider` interface with a method that accepts a TrendQuery and returns an array of raw trend signals
2. THE API_Service SHALL support multiple concurrent TrendProvider implementations (public trend feeds, search-based signals, social trend APIs, internal fallback logic)
3. THE API_Service SHALL normalize raw trend signals from all providers into a common intermediate format before passing to the AI_Analysis_Layer
4. IF a TrendProvider fails or is unavailable, THEN THE API_Service SHALL continue processing with remaining available providers and log a warning
5. THE API_Service SHALL label trend signals that are estimated or inferred rather than directly observed from source data

### Requirement 10: Trend Provider Architecture — Platform, Region, and Domain Awareness

**User Story:** As a developer, I want trend providers to be aware of platform, region, and domain context, so that collected signals are relevant to the user's query.

#### Acceptance Criteria

1. WHEN a TrendQuery specifies a platform, THE Trend_Provider SHALL filter or weight signals relevant to that platform
2. WHEN a TrendQuery specifies a region with scope `country` or `state_province`, THE Trend_Provider SHALL filter or weight signals relevant to that geographic area
3. WHEN a TrendQuery specifies a domain, THE Trend_Provider SHALL filter or weight signals relevant to that content category
4. WHEN a TrendQuery specifies `AllPlatforms`, THE Trend_Provider SHALL collect signals across all supported platforms and merge results

### Requirement 11: Trend Provider Architecture — Normalization and Scoring

**User Story:** As a developer, I want raw trend signals normalized and scored consistently, so that the AI analysis layer receives uniform input regardless of source.

#### Acceptance Criteria

1. THE API_Service SHALL normalize all raw trend signals into a common format containing: raw title, raw description, source name, platform, region, raw score (if available), and collection timestamp
2. THE API_Service SHALL compute a preliminary momentum score (0–100) for each normalized signal based on available velocity and volume indicators
3. THE API_Service SHALL compute a preliminary relevance score (0–100) for each normalized signal based on domain keyword matching and platform alignment

### Requirement 12: AI Analysis Layer — Gemini-Powered Trend Consolidation

**User Story:** As a content creator, I want AI-powered analysis of raw trend signals, so that I receive clustered, ranked, and actionable trend insights rather than raw data.

#### Acceptance Criteria

1. WHEN normalized trend signals are available, THE AI_Analysis_Layer SHALL use Gemini (`gemini-2.0-flash` via `@google/genai` SDK) to consolidate and cluster similar topics
2. THE AI_Analysis_Layer SHALL rank trends by platform fit, domain relevance, momentum, region match, and freshness
3. THE AI_Analysis_Layer SHALL generate for each TrendItem: a human-readable `description` explaining why the trend matters, a `suggestedHook` tailored to the selected platform, `suggestedHashtags` relevant to the trend and domain, a `suggestedContentAngle` for content creation, and a `freshnessLabel`
4. THE AI_Analysis_Layer SHALL generate a `summary` field on the TrendAnalysisResult providing an overall narrative of the trend landscape for the selected platform and domain
5. THE AI_Analysis_Layer SHALL tailor analysis and suggestions based on the selected TrendDomain (domain-specific language, angles, and hashtag conventions)
6. IF raw trend signal data is thin or unavailable, THEN THE AI_Analysis_Layer SHALL generate trend insights based on Gemini's knowledge with signals labeled as `inferred`

### Requirement 13: Frontend — Trend Analyzer Page and Navigation

**User Story:** As a content creator, I want a dedicated Trend Analyzer section in the app, so that I can discover trends without leaving the Content Storyteller experience.

#### Acceptance Criteria

1. THE Web_App SHALL display a "Trend Analyzer" tab or navigation element in the header alongside existing navigation
2. WHEN the user clicks the "Trend Analyzer" navigation element, THE Web_App SHALL display the TrendAnalyzerPage component
3. THE Web_App SHALL maintain the existing batch mode and live agent mode navigation without modification
4. THE TrendAnalyzerPage SHALL feel visually consistent with the existing Web_App design (same color scheme, typography, spacing, and component patterns)

### Requirement 14: Frontend — Trend Filters Component

**User Story:** As a content creator, I want filter controls for platform, domain, region, time window, and language, so that I can customize my trend analysis query.

#### Acceptance Criteria

1. THE TrendFilters component SHALL display a platform selector with options: Instagram Reels, X/Twitter, LinkedIn, All Platforms
2. THE TrendFilters component SHALL display a domain selector with preset options (Tech, Fashion, Finance, Fitness, Education, Gaming, Startup) and a custom text input option
3. THE TrendFilters component SHALL display a region selector with scope options (Global, Country, State/Province) and conditional country and state/province text inputs
4. THE TrendFilters component SHALL display an optional time window selector with options: 24 hours, 7 days, 30 days
5. THE TrendFilters component SHALL display an optional language text input
6. THE TrendFilters component SHALL display an "Analyze Trends" button that submits the selected filters
7. WHEN the user clicks "Analyze Trends" without selecting a platform, THE TrendFilters component SHALL display a validation message requiring platform selection
8. WHEN the user clicks "Analyze Trends" without selecting a domain, THE TrendFilters component SHALL display a validation message requiring domain selection

### Requirement 15: Frontend — Trend Results Display

**User Story:** As a content creator, I want to see trend analysis results in a clear, scannable layout, so that I can quickly identify relevant trends and take action.

#### Acceptance Criteria

1. WHEN trend analysis results are returned, THE TrendResults component SHALL display a summary section showing the overall trend landscape narrative from the TrendAnalysisResult `summary` field
2. WHEN trend analysis results are returned, THE TrendResults component SHALL display a grid of TrendCard components, one per TrendItem
3. THE TrendCard component SHALL display: title, keyword, description (why it matters), suggestedHook, suggestedHashtags, suggestedContentAngle, platform, region label, freshnessLabel badge, and momentumScore indicator
4. THE TrendResults component SHALL display confidence/freshness badges on each TrendCard using the `freshnessLabel` and `momentumScore` values
5. THE TrendResults component SHALL display a loading state with skeleton placeholders while trend analysis is in progress
6. WHEN no trends are returned, THE TrendResults component SHALL display an empty state message suggesting the user adjust filters

### Requirement 16: Frontend — "Use in Content Storyteller" Integration

**User Story:** As a content creator, I want to use a discovered trend to pre-fill the existing campaign generation flow, so that I can seamlessly create content based on trending topics.

#### Acceptance Criteria

1. THE TrendCard component SHALL display a "Use in Content Storyteller" button on each trend result
2. WHEN the user clicks "Use in Content Storyteller" on a TrendCard, THE Web_App SHALL navigate to the existing Campaign_Generation_Flow landing page
3. WHEN navigating from a TrendCard, THE Web_App SHALL pre-fill the prompt text field with the trend title, summary, suggested hook, suggested content angle, and suggested hashtags
4. WHEN navigating from a TrendCard, THE Web_App SHALL pre-fill the platform selector with the corresponding Platform enum value mapped from the TrendPlatform (InstagramReels → InstagramReel, XTwitter → XTwitterThread, LinkedIn → LinkedInLaunchPost, AllPlatforms → GeneralPromoPackage)
5. THE Web_App SHALL preserve the existing Campaign_Generation_Flow behavior — pre-filled values are editable and the generation process remains unchanged

### Requirement 17: Result Quality and Scoring

**User Story:** As a content creator, I want trends ranked and labeled by quality indicators, so that I can prioritize the most actionable and timely trends.

#### Acceptance Criteria

1. THE AI_Analysis_Layer SHALL rank TrendItems by a composite score derived from: momentum score, domain relevance score, platform relevance, region match, and freshness
2. THE AI_Analysis_Layer SHALL assign each TrendItem a `freshnessLabel` from the set: `Fresh`, `Rising Fast`, `Established`, `Fading`
3. THE TrendCard component SHALL display a visual momentum indicator (progress bar or numeric badge) for the `momentumScore` value
4. THE TrendCard component SHALL display a colored badge for the `freshnessLabel` value (distinct colors for each label)
5. THE TrendAnalysisResult `trends` array SHALL be sorted in descending order by composite ranking score

### Requirement 18: Region and Domain Support

**User Story:** As a content creator, I want trend analysis tailored to my geographic region and content domain, so that results are relevant to my audience and niche.

#### Acceptance Criteria

1. THE API_Service SHALL normalize region labels to a consistent format (country names in English, state/province names in their common English form)
2. THE API_Service SHALL support the fixed domain presets: tech, fashion, finance, fitness, education, gaming, startup
3. WHEN a custom domain string is provided, THE API_Service SHALL accept the custom domain and pass it to the AI_Analysis_Layer for domain-aware analysis
4. THE AI_Analysis_Layer SHALL tailor trend descriptions, hooks, hashtags, and content angles based on the selected domain
5. THE AI_Analysis_Layer SHALL tailor trend analysis based on the selected region, prioritizing region-specific signals when available

### Requirement 19: Graceful Degradation and Error Handling

**User Story:** As a content creator, I want the Trend Analyzer to handle errors gracefully, so that I always receive useful output even when data sources are limited.

#### Acceptance Criteria

1. IF all Trend_Providers fail or return no data, THEN THE API_Service SHALL still return a TrendAnalysisResult with AI-inferred trends and a summary noting that results are based on general knowledge rather than live signals
2. IF the Gemini API call fails during trend analysis, THEN THE API_Service SHALL return HTTP 503 status with error code `ANALYSIS_UNAVAILABLE` and a descriptive message
3. IF a TrendQuery contains a valid but unsupported language, THEN THE API_Service SHALL proceed with analysis in the default language (English) and include a notice in the summary
4. THE API_Service SHALL log all provider failures and Gemini API errors with correlation IDs for debugging
5. THE Trend_Analyzer feature SHALL not affect the stability or availability of the existing Campaign_Generation_Flow

### Requirement 20: Tests — Trend Query Validation

**User Story:** As a developer, I want comprehensive tests for trend query validation, so that invalid inputs are reliably rejected.

#### Acceptance Criteria

1. THE test suite SHALL verify that invalid TrendPlatform values are rejected with HTTP 400
2. THE test suite SHALL verify that missing domain fields are rejected with HTTP 400
3. THE test suite SHALL verify that invalid region configurations (missing country for country scope, missing stateProvince for state_province scope) are rejected with HTTP 400
4. THE test suite SHALL verify that unsupported timeWindow values are rejected with HTTP 400
5. THE test suite SHALL verify that valid TrendQuery inputs are accepted and return HTTP 200

### Requirement 21: Tests — Schema Completeness and Round-Trip

**User Story:** As a developer, I want property-based tests for trend schemas, so that type definitions are verified to be complete and serialization is reliable.

#### Acceptance Criteria

1. FOR ALL randomly generated TrendItem instances, the object SHALL contain all required fields with correct types
2. FOR ALL randomly generated TrendAnalysisResult instances, serializing to JSON then parsing back SHALL produce an equivalent object
3. FOR ALL TrendPlatform enum values, the enum SHALL contain exactly the expected values and no extras
4. FOR ALL TrendDomainPreset values, the type SHALL contain exactly the expected preset strings

### Requirement 22: Tests — Provider Normalization and Scoring

**User Story:** As a developer, I want tests for the provider normalization and scoring logic, so that raw signals are consistently transformed regardless of source.

#### Acceptance Criteria

1. FOR ALL raw trend signals from any provider, normalization SHALL produce an object with all required common format fields
2. FOR ALL normalized signals, the momentum score SHALL be a number between 0 and 100 inclusive
3. FOR ALL normalized signals, the relevance score SHALL be a number between 0 and 100 inclusive
4. THE test suite SHALL verify that provider failures result in graceful degradation rather than errors

### Requirement 23: Tests — Frontend Components

**User Story:** As a developer, I want tests for the Trend Analyzer frontend components, so that filter rendering, result display, and integration CTA work correctly.

#### Acceptance Criteria

1. THE test suite SHALL verify that TrendFilters renders all platform, domain, and region options
2. THE test suite SHALL verify that TrendResults renders a TrendCard for each TrendItem in the results
3. THE test suite SHALL verify that the "Use in Content Storyteller" button triggers navigation with pre-filled values
4. THE test suite SHALL verify that loading and empty states render correctly
5. FOR ALL TrendPlatform enum values, the platform selector SHALL render a corresponding selectable option

### Requirement 24: Documentation Updates

**User Story:** As a developer and hackathon judge, I want documentation updated to reflect the Trend Analyzer feature, so that the feature is discoverable and its architecture is clear.

#### Acceptance Criteria

1. THE `README.md` SHALL be updated to mention the Trend Analyzer feature in the feature list
2. THE `docs/architecture.md` SHALL be updated with the Trend Analyzer data flow and component descriptions
3. THE `docs/demo-script.md` SHALL be updated with a Trend Analyzer demo section showing the user flow from filter selection through trend discovery to "Use in Content Storyteller"
4. THE `docs/judge-checklist.md` SHALL be updated with Trend Analyzer evidence entries mapping to relevant code files
