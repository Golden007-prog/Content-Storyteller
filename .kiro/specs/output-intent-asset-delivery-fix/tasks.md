# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Output Intent & Asset Delivery Defects
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate all five defects exist
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each defect
  - Test 1a: `handleStartJob` in `App.tsx` — call with 5 params including `OutputPreference.CopyImage`, assert `startJob` receives the 5th `outputPreference` param (Defect 1 — param is dropped)
  - Test 1b: `outputPreferenceLabel(OutputPreference.CopyGif)` — assert returns `"Copy + GIF"` not the raw enum `"copy_gif"` (Defect 2 — missing label entry)
  - Test 1c: `OutputDashboard` rendered with `skippedOutputs=['image','video']` and no content — assert no skeleton sections for image/video types (Defect 3 — props not wired)
  - Test 1d: `resolveOutputIntent` with prompt `"create an image for my product launch"` and `OutputPreference.Auto` — assert `wantsImage === true` (Defect 4 — regex too narrow)
  - Test 1e: `generateSignedUrl` with mocked `file.getSignedUrl()` throwing `SigningError` and `isCloud=false` — assert no unhandled throw, returns fallback (Defect 5 — no try/catch)
  - For Defect 4, generate random prompts containing phrases from the expanded set: "create an image", "generate a visual", "make a graphic", "create a post image", "include a visual", "short video", "cinematic video", "animated explainer", "looping animation", "animate this"
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Output Intent & Delivery Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code:
    - `resolveOutputIntent({ promptText: 'write a caption', platform: InstagramReel, tone: Cinematic, uploadedMediaPaths: [], outputPreference: OutputPreference.Auto })` → `wantsVideo=true, wantsImage=true, wantsStoryboard=true, wantsVoiceover=true` (platform defaults)
    - `resolveOutputIntent({ ..., outputPreference: OutputPreference.CopyOnly })` → `wantsImage=false, wantsVideo=false, wantsGif=false`
    - `resolveOutputIntent({ promptText: 'copy only content', ..., outputPreference: OutputPreference.Auto })` → `wantsImage=false, wantsVideo=false` (copy-only keyword override)
    - `resolveOutputIntent({ promptText: 'make a video reel', ..., outputPreference: OutputPreference.Auto })` → `wantsVideo=true` (existing keyword match)
    - `outputPreferenceLabel(OutputPreference.Auto)` → `"Auto-detect"`
    - `outputPreferenceLabel(OutputPreference.CopyOnly)` → `"Copy only"`
    - `outputPreferenceLabel(OutputPreference.CopyImage)` → `"Copy + Image"`
    - `outputPreferenceLabel(OutputPreference.CopyVideo)` → `"Copy + Video"`
    - `outputPreferenceLabel(OutputPreference.FullPackage)` → `"Full Package"`
    - `OutputDashboard` with actual `copyPackage` data and no `skippedOutputs` → renders CopyCards with progressive reveal
  - Write property-based tests:
    - For all `OutputPreference` values in `{Auto, CopyOnly, CopyImage, CopyVideo, FullPackage}`, `outputPreferenceLabel` returns the expected human-readable string (not raw enum)
    - For all prompts WITHOUT new media phrases and with `OutputPreference.CopyOnly`, `resolveOutputIntent` returns `wantsImage=false, wantsVideo=false, wantsGif=false`
    - For all prompts with `OutputPreference.Auto` and platform `InstagramReel` and no media keywords, `resolveOutputIntent` returns `wantsVideo=true, wantsImage=true, wantsStoryboard=true, wantsVoiceover=true`
    - For all prompts containing "copy only" or "text only", `resolveOutputIntent` returns `wantsImage=false, wantsVideo=false` regardless of platform
    - For all prompts with existing keywords ("video", "reel", "image", "photo"), `resolveOutputIntent` sets the corresponding flags to `true`
    - `OutputDashboard` with content data and no `skippedOutputs`/`requestedOutputs` renders all sections normally
    - `generateSignedUrl` in cloud environment (`isCloud=true`) calls `file.getSignedUrl()` and returns the signed URL
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for output intent & asset delivery defects

  - [x] 3.1 Fix `handleStartJob` to forward `outputPreference` parameter
    - In `apps/web/src/App.tsx`, update `handleStartJob` callback signature to accept 5th `outputPreference` parameter
    - Forward `outputPreference` to `startJob(files, promptText, platform, tone, outputPreference)`
    - The `useJob.startJob` already accepts `outputPreference?` as 5th param — only the wrapper callback needs updating
    - _Bug_Condition: isBugCondition(input) where input.action == 'startJob' AND input.context.outputPreference != undefined AND input.context.outputPreference != 'auto'_
    - _Expected_Behavior: startJob receives and forwards outputPreference to createJob API call_
    - _Preservation: All other handleStartJob behavior (resetPartialState, file upload, phase transitions) unchanged_
    - _Requirements: 2.1_

  - [x] 3.2 Add `skippedOutputs`/`requestedOutputs` state and pass to `OutputDashboard`
    - In `apps/web/src/App.tsx`, add `useState` hooks for `skippedOutputs: string[]` and `requestedOutputs: string[]`
    - Extract `skippedOutputs` and `requestedOutputs` from SSE `state_change` and `partial_result` event data in `handleStateChange` and `handlePartialResult` callbacks
    - Pass `skippedOutputs` and `requestedOutputs` as props to both `OutputDashboard` instances (generating view ~line 230 and results view ~line 250)
    - Clear `skippedOutputs` and `requestedOutputs` in `resetPartialState`
    - _Bug_Condition: isBugCondition(input) where input.action == 'renderDashboard' AND input.context.skippedOutputs.length > 0_
    - _Expected_Behavior: OutputDashboard receives skippedOutputs/requestedOutputs and hides skeletons for skipped types_
    - _Preservation: OutputDashboard rendering with no skipped outputs unchanged_
    - _Requirements: 2.3_

  - [x] 3.3 Add `CopyGif` entry to `OUTPUT_PREFERENCE_LABELS`
    - In `apps/web/src/components/LandingPage.tsx`, add `[OutputPreference.CopyGif]: 'Copy + GIF'` to the `OUTPUT_PREFERENCE_LABELS` record
    - _Bug_Condition: isBugCondition(input) where input.action == 'displayLabel' AND input.context.outputPreference == 'copy_gif'_
    - _Expected_Behavior: outputPreferenceLabel(OutputPreference.CopyGif) returns 'Copy + GIF'_
    - _Preservation: All other label lookups (Auto, CopyOnly, CopyImage, CopyVideo, FullPackage) unchanged_
    - _Requirements: 2.2_

  - [x] 3.4 Expand prompt inference regex patterns in `resolveOutputIntent`
    - In `apps/api/src/services/planner/output-intent.ts`, expand the video keyword regex to include: "short video", "cinematic video", "video ad", "video clip"
    - Expand the image keyword regex to include: "create an image", "generate a visual", "make a graphic", "create a post image", "include a visual", "design a visual"
    - Expand the GIF keyword regex to include: "animate this", "create a gif", "make a gif", "animated gif"
    - Keep explicit UI selection overriding prompt inference (outputPreference != Auto short-circuits before regex)
    - _Bug_Condition: isBugCondition(input) where input.action == 'resolveIntent' AND input.context.promptText MATCHES_ANY expanded phrases_
    - _Expected_Behavior: resolveOutputIntent sets wantsImage/wantsVideo/wantsGif to true for matching phrases_
    - _Preservation: Existing keywords ("video", "reel", "image", "photo", "copy only", "text only") continue to work identically_
    - _Requirements: 2.4_

  - [x] 3.5 Add try/catch fallback for `generateSignedUrl` in local dev
    - In `apps/api/src/services/storage.ts`, wrap `file.getSignedUrl()` in a try/catch block
    - Import `getGcpConfig` (already imported) and check `cfg.isCloud`
    - In catch: if `!cfg.isCloud`, log a warning and return a public GCS URL (`https://storage.googleapis.com/${bucketName}/${storagePath}`) or empty string
    - In catch: if `cfg.isCloud`, re-throw the error (cloud failures should not be silently swallowed)
    - _Bug_Condition: isBugCondition(input) where input.action == 'generateSignedUrl' AND input.context.isCloud == FALSE_
    - _Expected_Behavior: Returns fallback URL instead of throwing SigningError_
    - _Preservation: Cloud environment signed URL generation unchanged — errors re-thrown_
    - _Requirements: 2.5_

  - [x] 3.6 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Output Intent & Asset Delivery Defects Fixed
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior
    - When these tests pass, it confirms the expected behavior is satisfied for all five defects
    - Run bug condition exploration tests from step 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms all five bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Output Intent & Delivery Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix (no regressions to CopyOnly, platform defaults, cloud signed URLs, existing keywords, copy-only override, dashboard rendering)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
