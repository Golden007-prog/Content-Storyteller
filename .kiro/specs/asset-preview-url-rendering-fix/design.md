# Asset Preview URL & Rendering Fix — Bugfix Design

## Overview

After the previous asset-delivery-rendering-fix (which corrected AssetType enum misclassification, video timeout propagation, and GIF generation approach), assets are now correctly generated and persisted — the Export Assets panel shows Image, Video, and GIF rows. However, the preview/media section still shows empty skeleton placeholders because: (a) signed URL generation fails with AccessDenied in cloud environments with no proxy fallback, (b) App.tsx discards signed asset arrays from SSE `state_change` events, (c) `partialGifAsset` from SSE is never extracted or stored, (d) no `gifAsset` state variable exists in App.tsx, (e) actual `AssetType.Image` files have no `<img>` rendering path, (f) `handleComplete` stores assets for ExportPanel but never extracts renderable media for preview, (g) empty signed URLs produce broken download/copy links, (h) video timeout fallback may not render if `videoBrief` is also missing, (i) `GifAssetMetadata.url` contains raw GCS paths instead of signed/proxy URLs, and (j) no frontend media normalization layer maps renderable assets to preview components.

## Glossary

- **Bug_Condition (C)**: The set of inputs/states where renderable assets exist but cannot be displayed in the preview gallery due to URL generation failures, missing SSE extraction, absent state wiring, or missing rendering paths
- **Property (P)**: Every renderable asset (Image, Video, GIF) has a usable display URL and is mapped to the correct preview component
- **Preservation**: Existing SSE delivery of `requestedOutputs`, `skippedOutputs`, `warnings`, partial results (copy, storyboard, videoBrief, imageConcepts), ExportPanel download/copy for valid URLs, GenerationTimeline, and pipeline runner behavior must remain unchanged
- **generateSignedUrl** (`apps/api/src/services/storage.ts`): Generates signed GCS URLs; falls back to proxy only in local dev (`!cfg.isCloud`), re-throws in cloud
- **signAssetsForSSE** (`apps/api/src/routes/stream.ts`): Signs all asset references for SSE delivery; sets `signedUrl: ''` on individual failures
- **handleStateChange** (`apps/web/src/App.tsx`): SSE callback that extracts `state`, `requestedOutputs`, `skippedOutputs`, `warnings` but discards `assets`
- **handlePartialResult** (`apps/web/src/App.tsx`): SSE callback that extracts `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts`, `creativeBrief` but ignores `partialGifAsset`
- **handleComplete** (`apps/web/src/App.tsx`): Fetches final assets via `getAssets(jobId)`, stores in `assets` state for ExportPanel, but never extracts renderable media URLs for preview components
- **OutputDashboard** (`apps/web/src/components/OutputDashboard.tsx`): Renders preview sections; accepts `gifAsset`, `videoUrl`, `imageConcepts` props but receives no actual image URLs or GIF metadata from App.tsx
- **GifAssetMetadata** (`packages/shared/src/types/gif.ts`): Contains `url`, `width`, `height`, `durationMs` etc. — the `url` field is populated with raw GCS storage path, not a signed/proxy URL

## Bug Details

### Bug Condition

The bugs manifest when renderable assets (Image, Video, GIF) exist in a completed or in-progress job but the frontend cannot display them. The root cause spans the backend URL generation, SSE event handling, and frontend state wiring.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { context: string, assetData: any, sseEvent: any, appState: any }
  OUTPUT: boolean

  // Bug 1: Signed URL fails in cloud with no proxy fallback
  signedUrlFailsInCloud :=
    input.context == 'generateSignedUrl'
    AND input.assetData.isCloud == true
    AND input.assetData.signingFails == true
    AND input.assetData.fallbackToProxy == false

  // Bug 2: SSE state_change assets discarded by App.tsx
  sseAssetsDiscarded :=
    input.context == 'handleStateChange'
    AND input.sseEvent.assets != undefined
    AND input.sseEvent.assets.length > 0
    AND input.appState.assetsStoredFromSSE == false

  // Bug 3: partialGifAsset never extracted from SSE
  gifAssetNotExtracted :=
    input.context == 'handlePartialResult'
    AND input.sseEvent.partialGifAsset != undefined
    AND input.appState.gifAssetStored == false

  // Bug 4: No gifAsset state variable in App.tsx
  noGifAssetState :=
    input.context == 'App.tsx'
    AND input.appState.gifAssetStateExists == false

  // Bug 5: No <img> rendering path for AssetType.Image
  noImageRendering :=
    input.context == 'OutputDashboard'
    AND input.assetData.hasImageAssets == true
    AND input.assetData.imageRenderingPathExists == false

  // Bug 6: handleComplete doesn't extract renderable media for preview
  noPreviewExtraction :=
    input.context == 'handleComplete'
    AND input.assetData.renderableAssetsExist == true
    AND input.appState.previewMediaExtracted == false

  // Bug 7: Empty signed URLs produce broken links
  brokenEmptyUrls :=
    input.context == 'ExportPanel'
    AND input.assetData.signedUrl == ''
    AND input.assetData.showsDisabledState == false

  // Bug 8: Video timeout fallback may not render
  videoTimeoutNoFallback :=
    input.context == 'VideoBriefView'
    AND input.appState.videoStatus == 'timeout'
    AND input.appState.videoBrief == null
    AND input.appState.fallbackMessageRendered == false

  // Bug 9: GifAssetMetadata url is raw GCS path
  gifUrlRawPath :=
    input.context == 'GifAssetMetadata'
    AND input.assetData.url.startsWith('gs://')
    OR (NOT input.assetData.url.startsWith('http'))

  // Bug 10: No media normalization layer
  noMediaNormalization :=
    input.context == 'OutputDashboard'
    AND input.assetData.renderableAssetsExist == true
    AND input.appState.mediaNormalizationApplied == false

  RETURN signedUrlFailsInCloud OR sseAssetsDiscarded OR gifAssetNotExtracted
         OR noGifAssetState OR noImageRendering OR noPreviewExtraction
         OR brokenEmptyUrls OR videoTimeoutNoFallback OR gifUrlRawPath
         OR noMediaNormalization
END FUNCTION
```

### Examples

- **Signed URL AccessDenied in cloud**: `generateSignedUrl('job-123/images/abc.png')` throws `AccessDenied` because the Cloud Run service account lacks `iam.serviceAccounts.signBlob`. In local dev, the catch block falls back to `http://localhost:8080/api/v1/assets/...`, but in cloud (`cfg.isCloud == true`) the error is re-thrown. `signAssetsForSSE` catches it and sets `signedUrl: ''`. The frontend receives an empty URL.

- **SSE assets discarded**: The SSE `state_change` event carries `{ state: 'generating_images', assets: [{ assetType: 'image', signedUrl: 'https://...' }], ... }`. `handleStateChange` extracts `state`, `requestedOutputs`, `skippedOutputs`, `warnings` but never reads `data.assets`. The signed image URLs are lost.

- **partialGifAsset ignored**: SSE emits `partial_result` with `{ partialGifAsset: { url: '...', width: 320, height: 240, ... } }`. `handlePartialResult` checks for `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts`, `creativeBrief` but has no check for `partialGifAsset`. The GIF metadata is discarded.

- **No gifAsset state**: App.tsx has `useState` for `copyPackage`, `storyboard`, `videoBrief`, `imageConcepts`, `creativeBrief`, `assets` but no `gifAsset` state. OutputDashboard accepts `gifAsset?: GifAssetMetadata | null` but App.tsx never passes it.

- **Image files have no preview**: `AssetType.Image` assets with valid signed URLs exist in the `assets` array. VisualDirection only renders text concept cards (`conceptName`, `visualDirection`, `style`). There is no `<img>` tag rendering path for actual image binary assets.

- **handleComplete stores but doesn't extract**: `handleComplete` calls `getAssets(jobId)`, maps results to `assetsWithUrls`, and calls `setAssets(assetsWithUrls)`. ExportPanel receives these. But no code extracts image signed URLs or GIF metadata from the assets array to populate preview state (`imageConcepts` with URLs, `gifAsset`, etc.).

- **Empty URL broken links**: ExportPanel renders `<a href="" download>Download</a>` and `<CopyToClipboardButton url="" />` for assets with `signedUrl: ''`. The download link navigates to the current page. The copy button fetches `""` which resolves to the current page HTML.

- **GIF url is raw GCS path**: `emitPartialResults` in stream.ts reads the GIF asset from GCS and emits `partialGifAsset` with the parsed JSON. But the GIF asset's `storagePath` is `job-123/gifs/abc.gif` — a raw GCS path, not a URL. The `GifAssetMetadata.url` field would contain this raw path, and `GifPreview`'s `<img src={gifAsset.url}>` would fail to load.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- SSE `state_change` events SHALL CONTINUE TO deliver `requestedOutputs`, `skippedOutputs`, `warnings`, `outputIntent`, and `steps` fields correctly
- SSE `partial_result` events for copy, storyboard, video brief, and image concepts SHALL CONTINUE TO deliver these partial results and the frontend SHALL CONTINUE TO render them progressively
- ExportPanel SHALL CONTINUE TO render download links and copy-to-clipboard buttons that work correctly for assets with valid signed URLs
- OutputDashboard SHALL CONTINUE TO show SkippedNote for skipped output types and skeleton placeholders for pending output types
- GenerationTimeline SHALL CONTINUE TO correctly show completed, active, pending, and skipped statuses for all pipeline stages
- The backend proxy endpoint `/api/v1/assets/{path}` SHALL CONTINUE TO stream files from GCS with the correct Content-Type header
- The pipeline runner SHALL CONTINUE TO add warnings and proceed to the next stage for non-critical failures
- ComposePackage SHALL CONTINUE TO include all recorded assets and fallback notices in the bundle manifest
- `handleComplete` SHALL CONTINUE TO call `setPhase('completed')` and `refreshJob()` to transition the UI to the results view
- JSON metadata assets (ImageConcept, VideoBriefMeta, GifCreativeDirection) SHALL CONTINUE TO appear in ExportPanel for download but SHALL NOT be rendered as inline media

**Scope:**
All inputs that do NOT involve renderable asset URL generation, SSE asset extraction, frontend media normalization, or GIF metadata URL resolution should be completely unaffected. This includes:
- Copy generation and SSE delivery
- Storyboard generation and SSE delivery
- Upload processing and job creation
- Live Agent and Trend Analyzer features
- Pipeline stage orchestration and non-critical failure handling

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Cloud proxy fallback missing**: `generateSignedUrl()` in `storage.ts` only falls back to the proxy URL when `!cfg.isCloud`. In cloud environments where the service account lacks `iam.serviceAccounts.signBlob` permission, the error is re-thrown. `signAssetsForSSE` catches it and sets `signedUrl: ''`. The fix should also fall back to the proxy endpoint in cloud, using the API's own base URL (e.g., from `process.env.API_BASE_URL` or the request origin) instead of `localhost`.

2. **handleStateChange ignores assets**: In App.tsx, `handleStateChange` reads `data.state`, `data.requestedOutputs`, `data.skippedOutputs`, `data.warnings` but never reads `data.assets`. The signed asset array from every `state_change` event is discarded.

3. **handlePartialResult ignores partialGifAsset**: The callback checks for `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts`, `creativeBrief` but has no branch for `data.partialGifAsset`.

4. **No gifAsset state in App.tsx**: There is no `const [gifAsset, setGifAsset] = React.useState<GifAssetMetadata | null>(null)` and no prop passing `gifAsset={gifAsset}` to OutputDashboard.

5. **VisualDirection only renders text cards**: The component receives `ImageConcept[]` which contains `conceptName`, `visualDirection`, `style` — text-only fields. There is no mechanism to receive or render actual image URLs from `AssetType.Image` assets.

6. **handleComplete doesn't extract preview media**: After fetching assets, `handleComplete` stores them in `assets` state for ExportPanel but never filters for renderable types and populates preview state (image URLs, GIF metadata).

7. **ExportPanel doesn't guard empty URLs**: `AssetRow` renders `<a href={asset.signedUrl} download>` and `<CopyToClipboardButton url={asset.signedUrl} />` without checking if `signedUrl` is empty or invalid.

8. **VideoBriefView fallback gap**: When `videoStatus === 'timeout'` but `videoBrief` is also null/undefined (because SSE partial_result for video brief wasn't received), the component shows "No video brief available yet" instead of the timeout message, because `hasContent` is false and the status message block is rendered but followed by the empty-state text.

9. **GIF metadata URL is raw storage path**: In `stream.ts`, `emitPartialResults` reads the GIF asset file from GCS and parses it as `GifAssetMetadata`. But the GIF file stored by `generate-gif.ts` is a binary `.gif` file, not a JSON metadata file. The `readJsonAsset` call on a binary GIF file returns null. Even if metadata were stored separately, the `url` field would contain the raw `storagePath`, not a signed/proxy URL.

10. **No media normalization layer**: The frontend has no utility that takes the `assets` array, filters by renderable types (`Image`, `Video`, `Gif`), and maps each to the appropriate preview component with working display URLs.

## Correctness Properties

Property 1: Bug Condition — Signed URL Cloud Proxy Fallback

_For any_ asset where `generateSignedUrl` fails in a cloud environment (signing permission error), the function SHALL fall back to the backend proxy endpoint URL (`/api/v1/assets/{storagePath}`) instead of re-throwing, ensuring every renderable asset has a usable display URL.

**Validates: Requirements 2.1**

Property 2: Bug Condition — SSE Asset Extraction and GIF Wiring

_For any_ SSE `state_change` event containing signed assets, and any `partial_result` event containing `partialGifAsset`, App.tsx SHALL extract and store these in state, and SHALL pass `gifAsset` to OutputDashboard, so that renderable media URLs are available for inline preview during the generating view.

**Validates: Requirements 2.2, 2.3, 2.4**

Property 3: Bug Condition — Frontend Media Normalization

_For any_ completed job with renderable assets (AssetType.Image, AssetType.Video, AssetType.Gif), the frontend SHALL filter assets by renderable types, extract display URLs, and map each to the appropriate preview component (`<img>` for images, `<video>` for video, `<img>` for GIF), replacing skeleton placeholders with actual content.

**Validates: Requirements 2.5, 2.6, 2.10**

Property 4: Bug Condition — Broken URL Handling and Fallback Rendering

_For any_ asset with an empty or invalid signed URL, ExportPanel SHALL show a disabled state or error indicator instead of broken links. For video timeout with missing videoBrief, VideoBriefView SHALL display the timeout message clearly. For GIF metadata, the `url` field SHALL contain a signed/proxy URL, not a raw GCS path.

**Validates: Requirements 2.7, 2.8, 2.9**

Property 5: Preservation — Existing SSE and Rendering Behavior

_For any_ input where the bug conditions do NOT apply (valid signed URLs, non-renderable metadata assets, successful partial result delivery), the fixed code SHALL produce the same results as the original code, preserving all existing SSE delivery, ExportPanel rendering, OutputDashboard skeleton/skipped behavior, and pipeline runner handling.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/api/src/services/storage.ts`

**Function**: `generateSignedUrl()`

**Specific Changes**:
1. **Cloud proxy fallback**: When signing fails in cloud environments (`cfg.isCloud == true`), instead of re-throwing, fall back to a proxy URL using `process.env.API_BASE_URL` or a constructed Cloud Run URL. The proxy endpoint `/api/v1/assets/{storagePath}` already exists and streams files using server credentials.
2. The fallback URL pattern: `${apiBaseUrl}/api/v1/assets/${encodeURIComponent(storagePath)}`

---

**File**: `apps/api/src/routes/stream.ts`

**Function**: `emitPartialResults()` — GIF metadata emission

**Specific Changes**:
1. **Fix GIF metadata emission**: Currently reads the GIF asset file (binary `.gif`) via `readJsonAsset<GifAssetMetadata>` which returns null for binary files. Instead, when a `AssetType.Gif` asset exists, construct a `GifAssetMetadata` object with a signed/proxy URL from `generateSignedUrl(gifAsset.storagePath)` and reasonable defaults for width/height/duration.
2. This ensures `partialGifAsset` carries a usable URL, not a raw GCS path.

---

**File**: `apps/web/src/App.tsx`

**Specific Changes**:
1. **Add `gifAsset` state**: `const [gifAsset, setGifAsset] = React.useState<GifAssetMetadata | null>(null)`
2. **Add `imageUrls` state**: `const [imageUrls, setImageUrls] = React.useState<string[]>([])` for actual rendered image URLs
3. **Update `handleStateChange`**: Extract `data.assets` and store signed asset references. From these, derive renderable media: filter `AssetType.Image` assets for image URLs, `AssetType.Video` for video URL, `AssetType.Gif` for GIF URL.
4. **Update `handlePartialResult`**: Add extraction of `data.partialGifAsset` → `setGifAsset(data.partialGifAsset)`
5. **Update `handleComplete`**: After fetching final assets, extract renderable media — filter for `AssetType.Image` with valid `signedUrl` to populate `imageUrls`, filter for `AssetType.Gif` to construct/update `gifAsset` with signed URL
6. **Pass new props to OutputDashboard**: `gifAsset={gifAsset}`, `imageUrls={imageUrls}`
7. **Reset new state in `resetPartialState`**: Reset `gifAsset` and `imageUrls`

---

**File**: `apps/web/src/components/OutputDashboard.tsx`

**Specific Changes**:
1. **Add `imageUrls` prop**: `imageUrls?: string[]` to receive actual image display URLs
2. **Pass `imageUrls` to VisualDirection** or render a dedicated image gallery section when `imageUrls` has entries
3. **Derive `hasImages`** from `imageUrls.length > 0` in addition to `hasImageConcepts`

---

**File**: `apps/web/src/components/VisualDirection.tsx`

**Specific Changes**:
1. **Add `imageUrls` prop**: `imageUrls?: string[]`
2. **Render `<img>` tags**: When `imageUrls` has entries, render them as `<img>` elements above or alongside the text concept cards
3. **Fallback**: Continue showing text concept cards when no actual image URLs are available

---

**File**: `apps/web/src/components/ExportPanel.tsx`

**Specific Changes**:
1. **Guard empty URLs in AssetRow**: Check if `asset.signedUrl` is empty or falsy. If so, render the download link as disabled (e.g., `<span>` with muted styling and "Unavailable" text) and hide the CopyToClipboardButton
2. **Guard empty URL in CopyToClipboardButton**: Early-return or disable if `url` is empty

---

**File**: `apps/web/src/components/VideoBriefView.tsx`

**Specific Changes**:
1. **Render timeout/failed message even when videoBrief is empty**: Move the `statusMessage` rendering above the `hasContent` check, or ensure the status message block is always visible when `videoStatus` is `'timeout'` or `'failed'`, regardless of whether `videoBrief` data is present

---

**File**: `apps/web/src/components/GifPreview.tsx`

**Specific Changes**:
1. **Already has `isNonRenderableUrl` guard** — no changes needed for the rendering guard
2. Ensure the `gifAsset.url` received from App.tsx is a signed/proxy URL (this is fixed upstream in stream.ts and App.tsx)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise the signed URL generation, SSE event handling, and frontend component rendering with the current code to observe the failures.

**Test Cases**:
1. **Cloud Signed URL Failure Test**: Mock `generateSignedUrl` in a cloud environment where signing throws AccessDenied — verify it re-throws instead of falling back to proxy (will confirm bug on unfixed code)
2. **SSE Assets Discarded Test**: Simulate SSE `state_change` event with `assets` array containing signed image URLs — verify App.tsx `handleStateChange` does not store them (will confirm bug on unfixed code)
3. **partialGifAsset Ignored Test**: Simulate SSE `partial_result` event with `partialGifAsset` — verify App.tsx `handlePartialResult` does not extract it (will confirm bug on unfixed code)
4. **No gifAsset Prop Test**: Render OutputDashboard from App.tsx — verify `gifAsset` prop is undefined even when GIF metadata exists (will confirm bug on unfixed code)
5. **Image Files No Preview Test**: Provide `AssetType.Image` assets with valid signed URLs — verify VisualDirection renders only text cards, no `<img>` tags (will confirm bug on unfixed code)
6. **handleComplete No Preview Extraction Test**: Mock `getAssets` returning renderable assets — verify `handleComplete` stores them in `assets` but does not populate image URLs or GIF metadata for preview (will confirm bug on unfixed code)
7. **Empty URL Broken Links Test**: Render ExportPanel with an asset having `signedUrl: ''` — verify download link has `href=""` and CopyToClipboardButton attempts to fetch empty URL (will confirm bug on unfixed code)

**Expected Counterexamples**:
- `generateSignedUrl` throws in cloud instead of falling back to proxy
- `handleStateChange` discards `data.assets` — no signed URLs stored for preview
- `handlePartialResult` ignores `data.partialGifAsset` — GIF metadata lost
- OutputDashboard `gifAsset` prop is always undefined
- VisualDirection renders zero `<img>` tags even when image assets exist
- ExportPanel renders `<a href="">Download</a>` for assets with empty signed URLs

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT signedUrlOrProxyUrlExists(result)
  ASSERT sseAssetsStoredInState(result)
  ASSERT gifAssetExtractedAndPassed(result)
  ASSERT renderableAssetsMapToPreviewComponents(result)
  ASSERT emptyUrlsShowDisabledState(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid signed URLs, successful SSE delivery, and ExportPanel rendering, then write property-based tests capturing that behavior.

**Test Cases**:
1. **SSE Partial Result Delivery Preservation**: Verify that `partialCopy`, `partialStoryboard`, `partialVideoBrief`, `partialImageConcepts`, `creativeBrief` continue to be extracted and rendered correctly after the fix
2. **ExportPanel Valid URL Preservation**: Verify that assets with valid signed URLs continue to render working download links and copy-to-clipboard buttons
3. **OutputDashboard Skeleton/Skipped Preservation**: Verify that `skippedOutputs`, `requestedOutputs`, and skeleton placeholders continue to work correctly
4. **GenerationTimeline Preservation**: Verify that all pipeline stages continue to show correct completed/active/pending/skipped statuses
5. **Metadata Asset Non-Rendering Preservation**: Verify that JSON metadata assets (ImageConcept, VideoBriefMeta, GifCreativeDirection) continue to appear in ExportPanel but are NOT rendered as inline media

### Unit Tests

- Test `generateSignedUrl` falls back to proxy URL in cloud when signing fails
- Test `generateSignedUrl` continues to fall back to localhost proxy in local dev
- Test `generateSignedUrl` returns signed URL when signing succeeds (both cloud and local)
- Test App.tsx `handleStateChange` stores `data.assets` in state
- Test App.tsx `handlePartialResult` extracts `data.partialGifAsset` into `gifAsset` state
- Test App.tsx passes `gifAsset` prop to OutputDashboard
- Test App.tsx `handleComplete` extracts renderable image URLs and GIF metadata from fetched assets
- Test VisualDirection renders `<img>` tags when `imageUrls` prop has entries
- Test VisualDirection continues to render text concept cards when no `imageUrls`
- Test ExportPanel disables download/copy for assets with empty `signedUrl`
- Test ExportPanel renders working download/copy for assets with valid `signedUrl`
- Test VideoBriefView shows timeout message even when `videoBrief` data is missing
- Test GIF metadata emission in stream.ts constructs signed URL for GIF assets
- Test OutputDashboard renders image gallery when `imageUrls` provided
- Test OutputDashboard renders GifPreview when `gifAsset` provided

### Property-Based Tests

- Generate random asset arrays with mixed types and valid/empty signed URLs — verify renderable assets always have usable display URLs after the fix
- Generate random SSE event sequences with varying `assets`, `partialGifAsset` fields — verify all renderable data is extracted and stored in state
- Generate random `signedUrl` values (empty, valid, malformed) — verify ExportPanel never renders broken `href=""` links
- Generate random job states with varying `warnings` and `videoBrief` presence — verify VideoBriefView always shows appropriate fallback content
- Generate random asset arrays — verify metadata assets (ImageConcept, VideoBriefMeta, GifCreativeDirection) are never rendered as inline media

### Integration Tests

- Test full SSE flow: state_change with assets → handleStateChange stores them → OutputDashboard receives renderable media
- Test full completion flow: handleComplete fetches assets → extracts image URLs and GIF metadata → preview sections render actual content
- Test cloud signed URL failure → proxy fallback → frontend receives working URL → preview renders
- Test GIF pipeline: generate-gif produces GIF → stream.ts emits partialGifAsset with signed URL → App.tsx stores gifAsset → GifPreview renders `<img>`
- Test ExportPanel with mixed valid/empty URLs: valid assets show download links, empty-URL assets show disabled state
