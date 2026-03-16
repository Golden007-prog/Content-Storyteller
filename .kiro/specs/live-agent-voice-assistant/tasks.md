# Implementation Plan: Live Agent Voice Assistant

## Overview

Upgrade the Live Agent Mode from keyword-based trend detection to Vertex AI function calling with native audio output, browser speech recognition, and an animated audio equalizer. Implementation proceeds bottom-up: shared types → backend tool declaration and execution loop → audio output → frontend speech input → audio playback → equalizer component → wiring.

## Tasks

- [x] 1. Update shared types and constants
  - [x] 1.1 Add `audioBase64` field to `LiveInputResponse` in `packages/shared/src/types/live-session.ts`
    - Add `audioBase64: string | null` to the `LiveInputResponse` interface
    - _Requirements: 4.4, 4.5_

- [x] 2. Implement backend function calling and tool execution loop
  - [x] 2.1 Add `FETCH_TRENDS_TOOL` constant and `LIVE_AGENT_SYSTEM_INSTRUCTION` to `apps/api/src/services/live-session.ts`
    - Define the Vertex AI function declaration with `fetch_platform_trends` name, required `platform` parameter, and description
    - Define the system instruction constant with the AI Creative Director directive
    - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2_

  - [x] 2.2 Rewrite `generateAgentResponse` in `apps/api/src/services/live-session.ts` to use tool-calling loop
    - Send conversation with `tools: [FETCH_TRENDS_TOOL]`, `systemInstruction`, and `generationConfig: { responseModalities: ['AUDIO', 'TEXT'] }`
    - Check response for `functionCall` parts; if present, extract `platform` argument, call `analyzeTrends`, feed result back as `functionResponse`
    - Extract final text and optional base64 audio from Gemini response
    - Return `{ agentText: string; audioBase64: string | null }`
    - Record tool invocations via `recordToolInvocation` with tool name `'fetch_platform_trends'`
    - On `analyzeTrends` failure, feed error message as `functionResponse` to Gemini for graceful fallback
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 4.1, 4.2, 4.3_

  - [x] 2.3 Update `processLiveInput` to remove keyword-detection heuristic and delegate to updated `generateAgentResponse`
    - Remove `detectTrendKeywords` call and inline trend-fetching logic
    - Pass `audioBase64` through in the return value `{ agentText, audioBase64, transcript }`
    - _Requirements: 2.1, 4.4_

  - [x] 2.4 Write property test: Tool declaration is always present (Property 1)
    - **Property 1: Tool declaration is always present**
    - **Validates: Requirements 1.1**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.5 Write property test: Tool argument forwarding (Property 2)
    - **Property 2: Tool argument forwarding**
    - **Validates: Requirements 2.1, 2.2**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.6 Write property test: Tool execution round-trip (Property 3)
    - **Property 3: Tool execution round-trip**
    - **Validates: Requirements 2.3, 2.4**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.7 Write property test: Tool invocation recording (Property 4)
    - **Property 4: Tool invocation recording**
    - **Validates: Requirements 2.6**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.8 Write property test: System instruction invariant (Property 5)
    - **Property 5: System instruction invariant**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.9 Write property test: Audio modality in request configuration (Property 6)
    - **Property 6: Audio modality in request configuration**
    - **Validates: Requirements 4.1**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

  - [x] 2.10 Write property test: Audio extraction and response shape (Property 7)
    - **Property 7: Audio extraction and response shape**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - File: `apps/api/src/__tests__/live-voice-assistant.property.test.ts`

- [x] 3. Update live route to pass audioBase64
  - [x] 3.1 Update `/input` endpoint in `apps/api/src/routes/live.ts` to include `audioBase64` in `LiveInputResponse`
    - Destructure `audioBase64` from `processLiveInput` result
    - Include `audioBase64` in the response JSON
    - _Requirements: 4.4, 4.5_

  - [x] 3.2 Write unit tests for live route audioBase64 handling
    - Test that non-null audioBase64 is forwarded in response
    - Test that null audioBase64 is returned when Gemini provides no audio
    - File: `apps/api/src/__tests__/live-voice-assistant.unit.test.ts`
    - _Requirements: 4.4, 4.5_

- [x] 4. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Create AudioEqualizer component
  - [x] 5.1 Create `apps/web/src/components/AudioEqualizer.tsx`
    - Render 4–5 vertical `div` bars with CSS `@keyframes equalizerBounce` animation
    - Accept `active: boolean` prop; toggle `animation-play-state` between `running` and `paused`
    - Stagger `animation-delay` per bar for independent movement
    - Use brand palette colors (`brand-500`, `brand-400`)
    - Compact size: ~24–32px height
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.4, 8.5_

  - [x] 5.2 Write property test: Equalizer bars have distinct animation delays (Property 10)
    - **Property 10: Equalizer bars have distinct animation delays**
    - **Validates: Requirements 7.3**
    - File: `apps/web/src/__tests__/live-voice-assistant.property.test.tsx`

  - [x] 5.3 Write property test: Equalizer active prop controls animation state (Property 11)
    - **Property 11: Equalizer active prop controls animation state**
    - **Validates: Requirements 7.4, 7.5, 8.3**
    - File: `apps/web/src/__tests__/live-voice-assistant.property.test.tsx`

- [x] 6. Update LiveAgentPanel with voice input, audio playback, and equalizer
  - [x] 6.1 Add SpeechRecognition integration to `apps/web/src/components/LiveAgentPanel.tsx`
    - Detect `SpeechRecognition` / `webkitSpeechRecognition` support on mount, set `speechSupported` state
    - Rewire mic button to start/stop `SpeechRecognition`; pipe interim results to `inputText`, final result replaces `inputText`
    - Show info message when speech recognition is not supported
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.2 Add audio playback with `isSpeaking` state tracking to `apps/web/src/components/LiveAgentPanel.tsx`
    - On receiving non-null `audioBase64`, create `Audio` from data URI, call `.play()`, set `isSpeaking=true`
    - Listen for `onended` to set `isSpeaking=false`
    - Catch `.play()` rejection (autoplay policy), set `isSpeaking=false`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.3 Render `AudioEqualizer` in agent chat bubbles in `apps/web/src/components/LiveAgentPanel.tsx`
    - Import and render `<AudioEqualizer active={isSpeaking} />` inside/adjacent to the latest agent chat bubble
    - Pass `isSpeaking` as the `active` prop
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.4 Write property test: Speech recognition updates input field (Property 8)
    - **Property 8: Speech recognition updates input field**
    - **Validates: Requirements 5.2, 5.3**
    - File: `apps/web/src/__tests__/live-voice-assistant.property.test.tsx`

  - [x] 6.5 Write property test: isSpeaking tracks audio lifecycle (Property 9)
    - **Property 9: isSpeaking tracks audio lifecycle**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    - File: `apps/web/src/__tests__/live-voice-assistant.property.test.tsx`

  - [x] 6.6 Write unit tests for LiveAgentPanel voice features
    - Test mic button starts/stops SpeechRecognition (Req 5.1, 5.4)
    - Test browser without SpeechRecognition shows fallback message (Req 5.5)
    - Test AudioEqualizer is rendered inside agent chat bubble (Req 8.1)
    - Test AudioEqualizer receives `isSpeaking` as `active` prop (Req 8.2)
    - Test audio playback failure sets `isSpeaking=false` (Req 6.4)
    - File: `apps/web/src/__tests__/live-voice-assistant.unit.test.tsx`
    - _Requirements: 5.1, 5.4, 5.5, 6.4, 8.1, 8.2_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout; backend tests mock `@google/genai` SDK, frontend tests mock `SpeechRecognition` and `Audio`
