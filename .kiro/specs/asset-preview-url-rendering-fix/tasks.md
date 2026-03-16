# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Asset Preview URL & Rendering Failures
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 10 bugs exist across backend URL generation, SSE event handling, and frontend rendering
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug condition
  - Backend tests (`apps/api/src/__tests__/asset-preview-exploration.property.test.ts`):
    - Test `generateSignedUrl` in cloud environment (`cfg.isCloud == true`) where signing throws AccessDenied — assert it falls back to proxy URL instead of re-throwing (will FAIL on unfixed code, confirming Bug 1)
    - Test `emitPartialResults` for GeneratingGif → ComposingPackage transition — assert `partialGifAsset` carries a signed/proxy URL (not raw GCS path) for binary `.gif` assets (will FAIL on unfixed code, confirming Bug 9)
  - Frontend tests (`apps/web/src/__tests__/asset-preview-exploration.property.test.tsx`):
    - Test `handleStateChange` with SSE `state_change` event containing `assets` array — assert assets are stored in state (will FAIL on unfixed code, confirming Bug 2)
    - Test `handlePartialResult` with SSE `partial_result` event containing `partialGifAsset` — assert gifAsset state is populated (will FAIL on unfixed code, confirming Bug 3)
    - Test App.tsx passes `gifAsset` prop to OutputDashboard — assert prop is defined when GIF metadata exists (will FAIL on unfixed code, confirming Bug 4)
    - Test VisualDirection with `imageUrls` prop — assert `<img>` tags are rendered for actual image URLs (will FAIL on unfixed code, confirming Bug 5)
    - Test `handleComplete` extracts renderable image URLs and GIF metadata from fetched assets for preview (will FAIL on unfixed code, confirming Bug 6)
    - Test ExportPanel with `signedUrl: ''` — assert download link is disabled, not `href=""` (will FAIL on unfixed code, confirming Bug 7)
    - Test VideoBriefView with `videoStatus='timeout'` and no `videoBrief` data — assert timeout message renders (will FAIL on unfixed code, confirming Bug 8)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing SSE and Rendering Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Backend preservation tests (`apps/api/src/__tests__/asset-preview-preservation.property.test.ts`):
    - Observe: `generateSignedUrl` returns signed URL when signing succeeds (both cloud and local) on unfixed code
    - Observe: `signAssetsForSSE` correctly signs assets with valid credentials on unfixed code
    - Observe: `emitPartialResults` correctly emits `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts` on unfixed code
    - Write property: for all assets where signing succeeds, `generateSignedUrl` returns a valid `https://` URL
    - Write property: for all SSE partial_result emissions of copy/storyboard/videoBrief/imageConcepts, the data is correctly read from GCS and emitted
  - Frontend preservation tests (`apps/web/src/__tests__/asset-preview-preservation.property.test.tsx`):
    - Observe: `handlePartialResult` correctly extracts `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts`, `creativeBrief` on unfixed code
    - Observe: `handleStateChange` correctly extracts `requestedOutputs`, `skippedOutputs`, `warnings` on unfixed code
    - Observe: ExportPanel renders working download links for assets with valid `signedUrl` on unfixed code
    - Observe: OutputDashboard shows SkippedNote for skipped outputs and skeleton for pending outputs on unfixed code
    - Write property: for all SSE partial_result events with `partialCopy`/`partialStoryboard`/`partialVideoBrief`/`partialImageConcepts`, the corresponding state is updated
    - Write property: for all assets with valid non-empty `signedUrl`, ExportPanel renders `<a>` with correct `href` and CopyToClipboardButton
    - Write property: for all `skippedOutputs` entries, OutputDashboard renders SkippedNote; for pending outputs, renders skeleton
    - Write property: JSON metadata assets (ImageConcept, VideoBriefMeta, GifCreativeDirection) appear in ExportPanel but are NOT rendered as inline media
  - Verify all preservation tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix asset preview URL rendering bugs

  - [x] 3.1 Add cloud proxy fallback to `generateSignedUrl` in `apps/api/src/services/storage.ts`
    - When signing fails in cloud environments (`cfg.isCloud == true`), fall back to proxy URL using `process.env.API_BASE_URL` or constructed Cloud Run URL
    - Fallback URL pattern: `${apiBaseUrl}/api/v1/assets/${encodeURIComponent(storagePath)}`
    - Keep existing local dev fallback (`!cfg.isCloud`) unchanged
    - _Bug_Condition: isBugCondition(input) where context == 'generateSignedUrl' AND isCloud == true AND signingFails == true_
    - _Expected_Behavior: Returns proxy URL instead of re-throwing_
    - _Preservation: Existing local dev fallback and successful signing behavior unchanged_
    - _Requirements: 2.1_

  - [x] 3.2 Fix GIF metadata emission in `apps/api/src/routes/stream.ts`
    - In `emitPartialResults` for GeneratingGif → ComposingPackage transition, the current code calls `readJsonAsset<GifAssetMetadata>` on a binary `.gif` file which returns null
    - Instead: when `AssetType.Gif` asset exists, construct `GifAssetMetadata` with a signed/proxy URL from `generateSignedUrl(gifAsset.storagePath)` and reasonable defaults for width/height/duration
    - Ensure `partialGifAsset.url` is a signed/proxy URL, not a raw GCS path
    - _Bug_Condition: isBugCondition(input) where context == 'GifAssetMetadata' AND url does not start with 'http'_
    - _Expected_Behavior: GifAssetMetadata.url contains signed/proxy URL_
    - _Preservation: Other emitPartialResults transitions unchanged_
    - _Requirements: 2.9_

  - [x] 3.3 Add `gifAsset` and `imageUrls` state, update SSE handlers in `apps/web/src/App.tsx`
    - Add `const [gifAsset, setGifAsset] = React.useState<GifAssetMetadata | null>(null)`
    - Add `const [imageUrls, setImageUrls] = React.useState<string[]>([])`
    - Update `handleStateChange`: extract `data.assets`, filter `AssetType.Image` for image URLs, `AssetType.Gif` for GIF metadata
    - Update `handlePartialResult`: add `if (data.partialGifAsset) setGifAsset(data.partialGifAsset)`
    - Update `handleComplete`: after fetching assets, extract renderable image URLs (`AssetType.Image` with valid `signedUrl`) into `imageUrls`, extract `AssetType.Gif` metadata into `gifAsset`
    - Update `resetPartialState`: reset `gifAsset` and `imageUrls`
    - Pass `gifAsset={gifAsset}` and `imageUrls={imageUrls}` to OutputDashboard in both generating and results views
    - _Bug_Condition: isBugCondition(input) where context in ['handleStateChange', 'handlePartialResult', 'handleComplete', 'App.tsx'] AND assets/gifAsset not stored_
    - _Expected_Behavior: All renderable media URLs extracted and stored in state, passed to OutputDashboard_
    - _Preservation: Existing SSE extraction of requestedOutputs, skippedOutputs, warnings, partialCopy, partialStoryboard, partialVideoBrief, partialImageConcepts, creativeBrief unchanged_
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 3.4 Add `imageUrls` prop and image gallery rendering to `apps/web/src/components/OutputDashboard.tsx`
    - Add `imageUrls?: string[]` to `OutputDashboardProps`
    - Pass `imageUrls` to VisualDirection or render a dedicated image gallery section when `imageUrls` has entries
    - Derive `hasImages` from `imageUrls.length > 0` in addition to `hasImageConcepts`
    - _Bug_Condition: isBugCondition(input) where context == 'OutputDashboard' AND hasImageAssets == true AND imageRenderingPathExists == false_
    - _Expected_Behavior: Image gallery renders when imageUrls provided_
    - _Preservation: Existing skeleton/skipped behavior unchanged_
    - _Requirements: 2.5, 2.10_

  - [x] 3.5 Add `imageUrls` prop and `<img>` rendering to `apps/web/src/components/VisualDirection.tsx`
    - Add `imageUrls?: string[]` to `VisualDirectionProps`
    - When `imageUrls` has entries, render `<img>` elements above or alongside text concept cards
    - Continue showing text concept cards when no `imageUrls` available (fallback)
    - _Bug_Condition: isBugCondition(input) where context == 'OutputDashboard' AND hasImageAssets == true AND imageRenderingPathExists == false_
    - _Expected_Behavior: <img> tags rendered for actual image URLs_
    - _Preservation: Text concept card rendering unchanged_
    - _Requirements: 2.5_

  - [x] 3.6 Add empty URL guards to `apps/web/src/components/ExportPanel.tsx`
    - In `AssetRow`: check if `asset.signedUrl` is empty/falsy; if so, render download link as disabled (`<span>` with muted styling and "Unavailable" text) and hide CopyToClipboardButton
    - In `CopyToClipboardButton`: early-return or disable if `url` is empty
    - _Bug_Condition: isBugCondition(input) where context == 'ExportPanel' AND signedUrl == '' AND showsDisabledState == false_
    - _Expected_Behavior: Disabled state shown for empty URLs instead of broken links_
    - _Preservation: Assets with valid signedUrl continue to render working download/copy buttons_
    - _Requirements: 2.7_

  - [x] 3.7 Fix timeout fallback gap in `apps/web/src/components/VideoBriefView.tsx`
    - Ensure timeout/failed message renders even when `videoBrief` data is missing (no `hasContent`)
    - Move status message rendering above the `hasContent` check, or ensure the status message block is always visible when `videoStatus` is 'timeout' or 'failed' regardless of videoBrief presence
    - _Bug_Condition: isBugCondition(input) where context == 'VideoBriefView' AND videoStatus == 'timeout' AND videoBrief == null AND fallbackMessageRendered == false_
    - _Expected_Behavior: Timeout message renders clearly even without videoBrief data_
    - _Preservation: Normal video brief rendering unchanged_
    - _Requirements: 2.8_

  - [x] 3.8 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Asset Preview URL & Rendering Fixed
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms all 10 bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing SSE and Rendering Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions to SSE delivery, ExportPanel valid URLs, OutputDashboard skeleton/skipped, GenerationTimeline, metadata asset handling)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to ensure no regressions
  - Verify exploration tests (task 1) now pass — confirming all bugs are fixed
  - Verify preservation tests (task 2) still pass — confirming no regressions
  - Ensure all existing tests in `apps/api/src/__tests__/` and `apps/web/src/__tests__/` continue to pass
  - Ask the user if questions arise
