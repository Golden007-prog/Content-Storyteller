# Output Intent & Asset Delivery Bugfix Design

## Overview

Five interrelated defects prevent the output-intent pipeline from working end-to-end. The user's explicit `OutputPreference` is silently dropped in `App.tsx`, the `CopyGif` label is missing from the UI, the `OutputDashboard` never receives skip/request metadata (causing endless skeleton placeholders), the prompt inference regex patterns miss common media phrases, and `generateSignedUrl` crashes in local dev with user ADC. The fix targets each defect at its source with minimal, surgical changes.

## Glossary

- **Bug_Condition (C)**: The union of five conditions that trigger incorrect behavior across the output-intent and asset-delivery flow
- **Property (P)**: The desired behavior — output preference is forwarded, labels are complete, skipped outputs are handled gracefully, prompt inference catches common phrases, and signed URLs degrade gracefully in local dev
- **Preservation**: Existing behavior for `CopyOnly` preference, platform defaults, cloud signed URLs, mouse/keyboard interactions, and progressive reveal animations must remain unchanged
- **handleStartJob**: The callback in `App.tsx` that wraps `startJob` — currently drops the 5th `outputPreference` parameter
- **OUTPUT_PREFERENCE_LABELS**: The `Record<string, string>` in `LandingPage.tsx` mapping `OutputPreference` enum values to display labels
- **OutputDashboard**: The React component rendering progressive content sections — currently has no awareness of skipped/requested outputs from SSE
- **resolveOutputIntent**: The function in `output-intent.ts` that maps prompt keywords, platform defaults, and explicit preferences to an `OutputIntent` struct
- **generateSignedUrl**: The function in `storage.ts` that calls `file.getSignedUrl()` — fails with `SigningError` when using user ADC locally
- **isCloud**: Boolean flag from `gcp.ts` indicating whether the app runs in Cloud Run/GKE

## Bug Details

### Bug Condition

The bug manifests across five distinct code paths that collectively break the output-intent and asset-delivery pipeline. The conditions are:

1. `handleStartJob` in `App.tsx` accepts only 4 parameters (files, promptText, platform, tone), dropping `outputPreference`
2. `OUTPUT_PREFERENCE_LABELS` is missing the `CopyGif` key
3. `OutputDashboard` is rendered without `skippedOutputs`/`requestedOutputs` props in both generating and results views
4. Prompt regex patterns in `resolveOutputIntent` miss phrases like "create an image", "generate a visual", "short video", "cinematic video", "animate this", etc.
5. `generateSignedUrl` has no try/catch fallback when `file.getSignedUrl()` throws `SigningError` in non-cloud environments

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action, context }
  OUTPUT: boolean

  // Defect 1: outputPreference dropped
  IF input.action == 'startJob'
     AND input.context.outputPreference != undefined
     AND input.context.outputPreference != 'auto'
     RETURN TRUE

  // Defect 2: CopyGif label missing
  IF input.action == 'displayLabel'
     AND input.context.outputPreference == 'copy_gif'
     RETURN TRUE

  // Defect 3: skippedOutputs not passed to dashboard
  IF input.action == 'renderDashboard'
     AND input.context.skippedOutputs.length > 0
     RETURN TRUE

  // Defect 4: prompt inference too narrow
  IF input.action == 'resolveIntent'
     AND input.context.outputPreference == 'auto'
     AND input.context.promptText MATCHES_ANY [
       'create an image', 'generate a visual', 'make a graphic',
       'create a post image', 'include a visual',
       'short video', 'cinematic video',
       'animated explainer', 'looping animation', 'animate this'
     ]
     RETURN TRUE

  // Defect 5: signed URL in local dev
  IF input.action == 'generateSignedUrl'
     AND input.context.isCloud == FALSE
     RETURN TRUE

  RETURN FALSE
END FUNCTION
```

### Examples

- User selects `CopyImage`, submits job → API receives `outputPreference: 'auto'` instead of `'copy_image'` (Defect 1)
- User selects `CopyGif` → UI shows raw enum value `copy_gif` instead of "Copy + GIF" (Defect 2)
- Pipeline skips image/video stages → `OutputDashboard` shows 4 skeleton blocks indefinitely (Defect 3)
- User types "create an image for my product launch" with Auto preference → `wantsImage` stays `false` (Defect 4)
- Developer runs API locally → `GET /api/v1/jobs/:id/assets` returns 500 due to `SigningError` (Defect 5)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `OutputPreference.CopyOnly` continues to produce copy-only output with no media generation
- `OutputPreference.Auto` with no media keywords continues to rely on platform defaults
- Cloud environments continue to use `file.getSignedUrl()` for signed URL generation
- `OutputDashboard` continues to render progressive reveal animations for actual content
- Platform defaults for `InstagramReel` continue to set `wantsVideo=true`, `wantsImage=true`, `wantsStoryboard=true`, `wantsVoiceover=true`
- "copy only" / "text only" keywords continue to override image/video flags to false
- Mouse clicks, form submissions, and all non-affected UI interactions remain unchanged

**Scope:**
All inputs that do NOT match any of the five bug conditions should be completely unaffected. This includes:
- Jobs submitted with `OutputPreference.Auto` and no media keywords
- Label lookups for `Auto`, `CopyOnly`, `CopyImage`, `CopyVideo`, `FullPackage`
- Dashboard rendering when no outputs are skipped
- Prompt inference for already-covered keywords ("video", "reel", "image", "photo")
- Signed URL generation in cloud environments with service account credentials

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **handleStartJob parameter omission**: `handleStartJob` in `App.tsx` (line ~128) destructures only 4 parameters `(files, promptText, platform, tone)` and calls `startJob(files, promptText, platform, tone)` without forwarding `outputPreference`. The `useJob.startJob` function already accepts a 5th `outputPreference?` parameter, so the fix is purely in the callback signature and call site.

2. **Missing CopyGif label entry**: `OUTPUT_PREFERENCE_LABELS` in `LandingPage.tsx` has entries for `Auto`, `CopyOnly`, `CopyImage`, `CopyVideo`, `FullPackage` but omits `[OutputPreference.CopyGif]: 'Copy + GIF'`. The `outputPreferenceLabel` function falls back to the raw enum value.

3. **OutputDashboard props not wired**: In `App.tsx`, both the generating view (line ~230) and results view (line ~250) render `<OutputDashboard>` without passing `skippedOutputs` or `requestedOutputs`. The SSE stream already sends these fields in `state_change` events, but `App.tsx` never extracts them from the SSE data into state variables.

4. **Narrow regex patterns**: The prompt keyword scanning in `output-intent.ts` uses patterns like `/\b(video|reel|teaser|promo clip)\b/` and `/\b(image|photo|picture|visual|hero image)\b/` which are single-word or specific compound phrases. Multi-word phrases like "create an image", "generate a visual", "short video", "cinematic video", "animate this" don't match because the regex requires exact word boundaries around the listed terms, not the surrounding verb phrases.

5. **No signed URL fallback**: `generateSignedUrl` in `storage.ts` calls `file.getSignedUrl()` directly with no error handling. In local dev with user ADC (not a service account), the GCS client throws a `SigningError` because it cannot sign URLs without service account private keys. The `isCloud` flag in `gcp.ts` already exists to detect the environment but is not used by `storage.ts`.

## Correctness Properties

Property 1: Bug Condition - OutputPreference Forwarding

_For any_ job submission where the user selects an explicit `OutputPreference` (not Auto), the fixed `handleStartJob` SHALL forward the `outputPreference` parameter to `startJob`, and the API SHALL receive and apply the user's selection in the created job document.

**Validates: Requirements 2.1**

Property 2: Bug Condition - CopyGif Label Display

_For any_ UI rendering where `OutputPreference.CopyGif` is the selected preference, the fixed `outputPreferenceLabel` function SHALL return `"Copy + GIF"` as the human-readable label.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Skipped Output Dashboard Handling

_For any_ job where the pipeline skips one or more output stages, the fixed `OutputDashboard` SHALL NOT show skeleton placeholders for skipped outputs, and SHALL display a compact informational note for skipped media types.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Expanded Prompt Inference

_For any_ prompt containing media-related phrases ("create an image", "generate a visual", "make a graphic", "create a post image", "include a visual", "short video", "cinematic video", "animated explainer", "looping animation", "animate this") with `OutputPreference.Auto`, the fixed `resolveOutputIntent` SHALL set the corresponding media intent flags to `true`.

**Validates: Requirements 2.4**

Property 5: Bug Condition - Signed URL Local Dev Fallback

_For any_ call to `generateSignedUrl` in a non-cloud environment where `file.getSignedUrl()` throws a `SigningError`, the fixed function SHALL fall back to constructing a public GCS URL or returning an empty string with a warning log, instead of throwing an unhandled error.

**Validates: Requirements 2.5**

Property 6: Preservation - Existing Behavior Unchanged

_For any_ input where none of the five bug conditions hold (Auto preference with no new media keywords, non-CopyGif labels, no skipped outputs, cloud environment signed URLs, already-matched prompt keywords), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/web/src/App.tsx`

**Function**: `handleStartJob`

**Specific Changes**:
1. **Add outputPreference parameter**: Update the `handleStartJob` callback signature to accept a 5th `outputPreference` parameter and forward it to `startJob`
2. **Add skippedOutputs/requestedOutputs state**: Add `useState` hooks for `skippedOutputs` and `requestedOutputs`, extract them from SSE `state_change` events in `handleStateChange`, and pass them as props to both `OutputDashboard` instances (generating and results views)
3. **Reset skippedOutputs/requestedOutputs**: Clear these in `resetPartialState`

---

**File**: `apps/web/src/components/LandingPage.tsx`

**Constant**: `OUTPUT_PREFERENCE_LABELS`

**Specific Changes**:
4. **Add CopyGif entry**: Add `[OutputPreference.CopyGif]: 'Copy + GIF'` to the `OUTPUT_PREFERENCE_LABELS` record

---

**File**: `apps/web/src/components/OutputDashboard.tsx`

**Function**: `OutputDashboard`

**Specific Changes**:
5. **Handle skipped outputs in empty state**: When `!hasAnyContent` and `skippedOutputs`/`requestedOutputs` are provided, only show skeleton sections for outputs that are actually requested and not skipped. Show a compact note for skipped media types instead of skeleton blocks.

---

**File**: `apps/api/src/services/planner/output-intent.ts`

**Function**: `resolveOutputIntent` (prompt keyword scanning section)

**Specific Changes**:
6. **Expand video regex**: Add patterns for "short video", "cinematic video", "video ad", "video clip"
7. **Expand image regex**: Add patterns for "create an image", "generate a visual", "make a graphic", "create a post image", "include a visual", "design a visual"
8. **Expand GIF regex**: Add patterns for "animate this", "create a gif", "make a gif", "animated gif"

---

**File**: `apps/api/src/services/storage.ts`

**Function**: `generateSignedUrl`

**Specific Changes**:
9. **Add try/catch with isCloud check**: Import `getGcpConfig` (already imported), wrap `file.getSignedUrl()` in a try/catch. In the catch block, if `!isCloud`, construct a public GCS URL (`https://storage.googleapis.com/${bucket}/${path}`) or return empty string with a warning log. In cloud, re-throw the error.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise each of the five defect paths on the unfixed code to observe failures and confirm root causes.

**Test Cases**:
1. **OutputPreference Forwarding Test**: Call `handleStartJob` with `CopyImage` preference, assert `startJob` receives it (will fail on unfixed code — 5th param is dropped)
2. **CopyGif Label Test**: Call `outputPreferenceLabel(OutputPreference.CopyGif)`, assert returns "Copy + GIF" (will fail on unfixed code — returns raw enum)
3. **Skipped Output Dashboard Test**: Render `OutputDashboard` with `skippedOutputs=['image','video']` and no content, assert no skeleton for image/video (will fail on unfixed code — props not passed)
4. **Prompt Inference Test**: Call `resolveOutputIntent` with prompt "create an image for my launch" and Auto preference, assert `wantsImage=true` (will fail on unfixed code — regex misses it)
5. **Signed URL Fallback Test**: Mock `file.getSignedUrl()` to throw `SigningError`, call `generateSignedUrl` with `isCloud=false`, assert no throw (will fail on unfixed code — error propagates)

**Expected Counterexamples**:
- `handleStartJob` ignores outputPreference parameter entirely
- `outputPreferenceLabel` returns `'copy_gif'` instead of `'Copy + GIF'`
- `OutputDashboard` renders skeleton blocks for skipped outputs
- `resolveOutputIntent` returns `wantsImage=false` for "create an image" prompts
- `generateSignedUrl` throws `SigningError` in local dev

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **CopyOnly Preservation**: Verify `resolveOutputIntent` with `CopyOnly` preference continues to produce copy-only output with no media flags
2. **Platform Default Preservation**: Verify `resolveOutputIntent` with Auto preference and no media keywords continues to use platform defaults (e.g., InstagramReel → wantsVideo=true)
3. **Cloud Signed URL Preservation**: Verify `generateSignedUrl` in cloud environment continues to call `file.getSignedUrl()` and return the signed URL
4. **Existing Keyword Preservation**: Verify prompts with already-covered keywords ("video", "reel", "image", "photo") continue to set correct flags
5. **Copy-Only Override Preservation**: Verify "copy only" / "text only" keywords continue to override image/video flags to false
6. **Dashboard Content Rendering Preservation**: Verify `OutputDashboard` with actual content data continues to render progressive reveal sections

### Unit Tests

- Test `handleStartJob` forwards all 5 parameters to `startJob`
- Test `OUTPUT_PREFERENCE_LABELS` has entries for all `OutputPreference` enum values
- Test `OutputDashboard` renders compact note for skipped outputs instead of skeletons
- Test `resolveOutputIntent` with each new prompt phrase sets correct intent flags
- Test `generateSignedUrl` returns fallback URL in non-cloud environment on `SigningError`
- Test `generateSignedUrl` re-throws errors in cloud environment

### Property-Based Tests

- Generate random `OutputPreference` values and verify `outputPreferenceLabel` always returns a non-raw-enum string
- Generate random prompt strings containing media phrases and verify `resolveOutputIntent` sets appropriate flags
- Generate random prompt strings WITHOUT media phrases and verify `resolveOutputIntent` produces identical results to the original function (preservation)
- Generate random `skippedOutputs`/`requestedOutputs` arrays and verify `OutputDashboard` never shows skeletons for skipped types

### Integration Tests

- Test full job creation flow with explicit `OutputPreference` from UI through API to Firestore document
- Test SSE stream delivers `skippedOutputs`/`requestedOutputs` and dashboard renders correctly
- Test local dev asset retrieval returns fallback URLs instead of 500 errors
