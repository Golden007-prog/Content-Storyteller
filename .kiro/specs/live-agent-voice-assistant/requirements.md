# Requirements Document

## Introduction

Upgrade the existing Live Agent Mode into a fully interactive voice assistant with backend function calling (Vertex AI tool use), native audio output from the `gemini-live-2.5-flash-native-audio` model, browser-based speech-to-text input, audio playback with speaking-state tracking, and a reactive audio equalizer component. The feature integrates the existing TrendAnalyzer service as a callable tool so Gemini can autonomously fetch and summarize platform trends during a conversation.

## Glossary

- **Live_Session_Service**: The backend service (`live-session.ts`) that manages live agent sessions, processes user input through Gemini, and returns agent responses.
- **Live_Route**: The Express route handler (`live.ts`) that exposes the Live Agent REST API endpoints.
- **Live_Agent_Panel**: The React frontend component (`LiveAgentPanel.tsx`) that renders the chat UI for the Live Agent Mode.
- **Trend_Analyzer**: The existing backend service (`analyzer.ts`) that collects, normalizes, and ranks platform trend data via provider signals and Gemini consolidation.
- **Function_Declaration**: A Vertex AI SDK tool definition that describes a callable function (name, description, parameters) so Gemini can decide to invoke it during generation.
- **Tool_Execution_Loop**: The backend logic that intercepts a Gemini function-call response, executes the corresponding local function, and feeds the result back to Gemini in the same conversational turn.
- **Native_Audio_Output**: Audio data returned by the `gemini-live-2.5-flash-native-audio` model when `responseModalities` includes `AUDIO`, encoded as a base64 string.
- **Speech_Recognition_API**: The browser-native `SpeechRecognition` (or `webkitSpeechRecognition`) interface that transcribes spoken audio into text in real time.
- **Audio_Equalizer**: A small React component consisting of 4–5 animated vertical bars that visually simulate voice frequencies.
- **isSpeaking_State**: A boolean React state variable that tracks whether the AI audio response is currently playing.
- **Model_Router**: The shared model configuration system (`model-router.ts`) that resolves capability slots to specific Gemini model identifiers.

## Requirements

### Requirement 1: Function Calling Declaration

**User Story:** As a developer, I want the Live_Session_Service to declare a `fetch_platform_trends` function tool to the Vertex AI SDK, so that Gemini can autonomously decide to call it when users ask about trends.

#### Acceptance Criteria

1. WHEN the Live_Session_Service initializes a Gemini generation request, THE Live_Session_Service SHALL include a `tools` array containing a Function_Declaration named `fetch_platform_trends`.
2. THE Function_Declaration SHALL specify a required `platform` parameter of type `string` with a description indicating valid platform values (`instagram_reels`, `x_twitter`, `linkedin`, `all_platforms`).
3. THE Function_Declaration SHALL include a description stating its purpose: to fetch current trending topics for a given social media platform.

### Requirement 2: Tool Execution Loop

**User Story:** As a user, I want the backend to automatically execute the trend-fetching tool when Gemini requests it, so that I receive trend-informed responses without manual intervention.

#### Acceptance Criteria

1. WHEN Gemini returns a function-call response for `fetch_platform_trends`, THE Live_Session_Service SHALL extract the `platform` argument from the function call.
2. WHEN the `platform` argument is extracted, THE Live_Session_Service SHALL invoke the Trend_Analyzer `analyzeTrends` function with the extracted platform and a default domain of `tech`.
3. WHEN the Trend_Analyzer returns results, THE Live_Session_Service SHALL feed the JSON result back to Gemini as a function-response part in the same conversational turn.
4. WHEN Gemini receives the function-response, THE Live_Session_Service SHALL extract the final text response from Gemini and return it to the caller.
5. IF the Trend_Analyzer call fails, THEN THE Live_Session_Service SHALL feed an error message back to Gemini as the function-response and allow Gemini to generate a graceful fallback response.
6. THE Live_Session_Service SHALL record each tool invocation (tool name, input parameters, output result, status) to AlloyDB via the existing `recordToolInvocation` helper.

### Requirement 3: System Instruction for Workflow

**User Story:** As a product owner, I want the Live Agent model to follow a specific conversational workflow when users ask about trends, so that the experience feels guided and professional.

#### Acceptance Criteria

1. THE Live_Session_Service SHALL include a system instruction in every Gemini generation request for the live agent.
2. THE system instruction SHALL contain the directive: "You are an AI Creative Director. If a user asks for current trends, ask them which platform they want. Then, use the fetch_platform_trends tool. While waiting for the tool, inform the user you are fetching the data."
3. THE system instruction SHALL be prepended to the conversation context before sending to Gemini.

### Requirement 4: Native Audio Output

**User Story:** As a user, I want to hear the AI Creative Director speak its responses aloud, so that the interaction feels like a real voice conversation.

#### Acceptance Criteria

1. WHEN the Live_Session_Service sends a generation request to Gemini, THE Live_Session_Service SHALL set `responseModalities` to include `AUDIO` in the generation configuration.
2. THE Live_Session_Service SHALL use the `gemini-live-2.5-flash-native-audio` model (resolved via the Model_Router `live` capability slot) for audio-enabled requests.
3. WHEN Gemini returns an audio response, THE Live_Session_Service SHALL extract the base64-encoded audio data from the response.
4. THE Live_Route SHALL return both the `agentText` (text transcript) and a `audioBase64` string field in the `LiveInputResponse`.
5. IF Gemini does not return audio data, THEN THE Live_Route SHALL return `audioBase64` as `null` and still return the text response.

### Requirement 5: Frontend Voice Input via Speech Recognition

**User Story:** As a user, I want to speak into my microphone and see my words transcribed in real time into the input box, so that I can use voice instead of typing.

#### Acceptance Criteria

1. WHEN the user clicks the microphone button in the Live_Agent_Panel, THE Live_Agent_Panel SHALL start the browser Speech_Recognition_API to capture and transcribe speech.
2. WHILE the Speech_Recognition_API is active, THE Live_Agent_Panel SHALL update the text input field in real time with interim transcription results.
3. WHEN the Speech_Recognition_API produces a final transcription result, THE Live_Agent_Panel SHALL place the finalized text into the input field.
4. WHEN the user clicks the microphone button again (to stop), THE Live_Agent_Panel SHALL stop the Speech_Recognition_API.
5. IF the browser does not support the Speech_Recognition_API, THEN THE Live_Agent_Panel SHALL display an informational message indicating voice input is not available and allow the user to continue typing.

### Requirement 6: Audio Playback and Speaking State

**User Story:** As a user, I want the AI response audio to play automatically and the UI to reflect when the AI is speaking, so that I have clear feedback on the conversation state.

#### Acceptance Criteria

1. WHEN the Live_Agent_Panel receives a `LiveInputResponse` containing a non-null `audioBase64` field, THE Live_Agent_Panel SHALL decode the base64 string and play it using an HTML5 Audio object.
2. WHEN the Audio object `.play()` method is called, THE Live_Agent_Panel SHALL set the isSpeaking_State to `true`.
3. WHEN the Audio object fires the `onended` event, THE Live_Agent_Panel SHALL set the isSpeaking_State to `false`.
4. IF audio playback fails (e.g., browser autoplay policy), THEN THE Live_Agent_Panel SHALL set isSpeaking_State to `false` and continue displaying the text response without interruption.

### Requirement 7: Audio Equalizer Component

**User Story:** As a designer, I want a small animated equalizer component that visually represents the AI speaking, so that the UI feels dynamic and modern.

#### Acceptance Criteria

1. THE Audio_Equalizer component SHALL render 4 to 5 vertical bars using `div` or `svg` elements.
2. THE Audio_Equalizer component SHALL apply a CSS `@keyframes` animation that scales each bar on the Y-axis to simulate voice frequency movement.
3. THE Audio_Equalizer component SHALL stagger the `animation-delay` for each bar so the bars move independently of each other.
4. THE Audio_Equalizer component SHALL accept an `active` boolean prop that controls whether the animation is running or paused.
5. WHEN the `active` prop is `false`, THE Audio_Equalizer component SHALL display the bars in a resting (flat or minimal height) state with `animation-play-state: paused`.

### Requirement 8: Conditional Equalizer Rendering and Theme Integration

**User Story:** As a user, I want the equalizer to appear next to the AI's messages only when the AI is speaking, and I want it to match the existing purple/minimalist theme, so that the experience is cohesive.

#### Acceptance Criteria

1. THE Live_Agent_Panel SHALL render the Audio_Equalizer component inside or adjacent to the AI agent's chat bubble.
2. THE Audio_Equalizer component SHALL receive the isSpeaking_State as its `active` prop.
3. WHEN isSpeaking_State is `false`, THE Audio_Equalizer component SHALL display bars in a resting state (minimal height, no active animation).
4. THE Audio_Equalizer component SHALL use colors from the existing brand palette (purple/brand tones defined in the application CSS: `brand-500`, `brand-600`, `brand-400`).
5. THE Audio_Equalizer component SHALL have a compact size (approximately 24–32px in height) so it fits naturally within or beside a chat bubble without disrupting the layout.
