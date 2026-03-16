# Bugfix Requirements Document

## Introduction

The Content Storyteller application has two related bugs that prevent media generation from working correctly and cause asset delivery failures:

1. **Output intent not reaching the pipeline**: The user's explicit `OutputPreference` selection from the UI is dropped before reaching the API because `App.tsx` doesn't forward the `outputPreference` parameter. Additionally, the `LandingPage.tsx` label map is missing the `CopyGif` entry, and the `OutputDashboard` never receives `skippedOutputs`/`requestedOutputs` props, causing endless skeleton placeholders for skipped media types.

2. **Prompt inference too narrow**: When `OutputPreference.Auto` is used, the prompt keyword scanning regex patterns in the output-intent planner miss common media-related phrases, so users who describe media intent in natural language don't get media generation.

3. **Signed URL generation fails in local dev**: The `generateSignedUrl` function uses `file.getSignedUrl()` which requires service account credentials. In local development with user ADC, this always throws a `SigningError` with no fallback, breaking asset delivery.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user selects an explicit OutputPreference (e.g., CopyImage, CopyVideo, CopyGif, FullPackage) in the UI and submits a job THEN the system drops the `outputPreference` parameter because `App.tsx`'s `handleStartJob` callback does not forward it to `startJob`, causing all jobs to use `OutputPreference.Auto` regardless of user selection

1.2 WHEN a user selects `CopyGif` as the output preference THEN the system displays the raw enum value instead of a human-readable label because `OUTPUT_PREFERENCE_LABELS` in `LandingPage.tsx` is missing the `CopyGif` entry

1.3 WHEN media generation stages (image, video, gif) are skipped by the pipeline THEN the `OutputDashboard` shows endless skeleton placeholder blocks because `App.tsx` does not pass `skippedOutputs` or `requestedOutputs` props to the `OutputDashboard` component

1.4 WHEN `OutputPreference.Auto` is used and the user's prompt contains common media phrases like "create an image", "generate a visual", "make a graphic", "create a post image", "short video", "cinematic video", "animated explainer", or "looping animation" THEN the system does not detect media intent because the prompt keyword scanning regex patterns are too narrow

1.5 WHEN the API attempts to generate a signed URL for an asset in local development (non-cloud environment with user ADC) THEN the system throws a `SigningError` because `file.getSignedUrl()` requires service account credentials which are unavailable with user ADC

### Expected Behavior (Correct)

2.1 WHEN a user selects an explicit OutputPreference in the UI and submits a job THEN the system SHALL forward the `outputPreference` parameter through `handleStartJob` to `startJob` so the API receives and applies the user's selection

2.2 WHEN a user selects `CopyGif` as the output preference THEN the system SHALL display "Copy + GIF" as the human-readable label in the UI

2.3 WHEN media generation stages are skipped by the pipeline THEN the `OutputDashboard` SHALL NOT show skeleton placeholders for skipped outputs, and SHALL display a compact informational note indicating that media generation was not requested

2.4 WHEN `OutputPreference.Auto` is used and the user's prompt contains media-related phrases THEN the system SHALL detect media intent using expanded regex patterns that cover: "create an image", "generate a visual", "make a graphic", "create a post image", "include a visual" for images; "short video", "cinematic video" for video; "animated explainer", "looping animation", "animate this" for GIF

2.5 WHEN signed URL generation fails in local development (non-cloud environment) THEN the system SHALL fall back to constructing a public GCS URL or returning an empty string with a warning log, instead of throwing an unhandled error

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `OutputPreference.CopyOnly` is explicitly selected THEN the system SHALL CONTINUE TO produce copy-only output with no media generation stages

3.2 WHEN `OutputPreference.Auto` is used with a prompt that contains no media keywords (e.g., "create a LinkedIn post", "write a caption", "give me hashtags") THEN the system SHALL CONTINUE TO rely on platform defaults without adding unwanted media flags

3.3 WHEN the application runs in a cloud environment (Cloud Run, GKE) with service account credentials THEN the system SHALL CONTINUE TO generate signed URLs using `file.getSignedUrl()` as before

3.4 WHEN `OutputPreference.Auto` is used with `Platform.InstagramReel` THEN the system SHALL CONTINUE TO set `wantsVideo=true`, `wantsImage=true`, `wantsStoryboard=true`, `wantsVoiceover=true` via platform defaults

3.5 WHEN a prompt contains "copy only" or "text only" keywords THEN the system SHALL CONTINUE TO override image/video flags back to false

3.6 WHEN the `OutputDashboard` receives actual content data (copyPackage, storyboard, videoBrief, imageConcepts, gifAsset) THEN the system SHALL CONTINUE TO render those sections with progressive reveal animations as before
