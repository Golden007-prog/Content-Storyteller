# Bugfix Requirements Document

## Introduction

Three interconnected bugs prevent the Content Storyteller application from functioning correctly end-to-end. The worker consumes mock/test Pub/Sub messages that pollute logs, the user's output preference (e.g. CopyImage, CopyVideo) is silently dropped before reaching the API so media stages are always skipped, and the OutputDashboard shows infinite skeleton placeholders for outputs that were never requested. Together these bugs mean that media generation never runs for real jobs and the UI never resolves to a finished state.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the worker receives a Pub/Sub message referencing a job ID that does not exist in Firestore (e.g. mock/test messages with jobId "mock-doc-1") THEN the system logs an error on every delivery attempt, flooding logs with repeated "Job not found in Firestore" messages that mask real debugging information.

1.2 WHEN the user selects an outputPreference (e.g. CopyImage, CopyVideo, CopyGif, FullPackage) in the OutputPreferenceSelector UI and submits the form THEN the system drops the outputPreference value because `handleStartJob` in App.tsx does not forward the `outputPreference` parameter to the `startJob` hook, causing the API to receive `undefined` and default to `OutputPreference.Auto`.

1.3 WHEN outputPreference is lost (defaulting to Auto) and the platform is LinkedIn or X/Twitter THEN the output intent resolver produces `wantsImage=false`, `wantsVideo=false`, `wantsGif=false` because the platform defaults for those platforms do not enable media, so all media pipeline stages are skipped.

1.4 WHEN the SSE stream emits `state_change` events containing `requestedOutputs` and `skippedOutputs` fields THEN the App.tsx `handleStateChange` callback ignores those fields and does not store them in component state, so they are never available to child components.

1.5 WHEN the OutputDashboard is rendered during the generating view or results view THEN the system never receives `requestedOutputs` or `skippedOutputs` props because App.tsx does not pass them, causing the dashboard to show endless skeleton loading placeholders for media sections (image, video, gif) that were skipped or never requested.

1.6 WHEN the PollJobStatusResponse is returned from `GET /api/v1/jobs/:jobId` THEN the response does not include `requestedOutputs`, `skippedOutputs`, or `outputIntent` fields, so any fallback polling path also lacks the data needed to render the dashboard correctly.

### Expected Behavior (Correct)

2.1 WHEN the worker receives a Pub/Sub message referencing a job ID that does not exist in Firestore THEN the system SHALL acknowledge the message immediately and log a single concise warning (not an error) including the jobId, then discard the message without retrying.

2.2 WHEN the user selects an outputPreference in the UI and submits the form THEN the system SHALL forward the outputPreference value through the full chain: LandingPage → App.tsx handleStartJob → useJob startJob → API createJob request body, so the API receives the user's explicit selection.

2.3 WHEN an explicit outputPreference (not Auto) is provided to the output intent resolver THEN the system SHALL produce an OutputIntent that correctly reflects the user's selection (e.g. CopyImage → wantsImage=true, CopyVideo → wantsVideo=true, etc.) and media pipeline stages SHALL execute accordingly.

2.4 WHEN the SSE stream emits `state_change` or `complete` events containing `requestedOutputs`, `skippedOutputs`, and `outputIntent` fields THEN the App.tsx SSE callbacks SHALL extract and store those fields in component state so they are available for rendering.

2.5 WHEN the OutputDashboard receives `requestedOutputs` and `skippedOutputs` props THEN the system SHALL show skeleton placeholders only for outputs that are both requested and not yet completed, show a compact "Not requested" indicator for outputs that were skipped or not requested, and show nothing for output types that are irrelevant.

2.6 WHEN the PollJobStatusResponse is returned from `GET /api/v1/jobs/:jobId` THEN the response SHALL include `requestedOutputs`, `skippedOutputs`, and `outputIntent` fields from the job document so that polling-based clients also have the data needed to render correctly.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the worker receives a valid Pub/Sub message referencing an existing job in Firestore THEN the system SHALL CONTINUE TO process the job through the full pipeline with correct state transitions and asset generation.

3.2 WHEN the user selects OutputPreference.Auto (the default) THEN the system SHALL CONTINUE TO resolve output intent using the existing precedence chain (platform defaults → prompt keyword scanning) without any change in behavior.

3.3 WHEN the output intent resolver determines that a media stage should be skipped (wantsImage=false, wantsVideo=false, etc.) THEN the pipeline runner SHALL CONTINUE TO skip those stages and record them in skippedOutputs as it does today.

3.4 WHEN the OutputDashboard receives actual content data (copyPackage, storyboard, videoBrief, imageConcepts, gifAsset) THEN the system SHALL CONTINUE TO render those sections with the existing progressive reveal animation behavior.

3.5 WHEN the SSE stream emits `partial_result` events with partial copy, storyboard, video brief, or image concept data THEN the system SHALL CONTINUE TO update the corresponding state and render partial results progressively.

3.6 WHEN a job completes successfully THEN the ExportPanel and asset download functionality SHALL CONTINUE TO work as before with signed URLs and ZIP bundle generation.
