# Demo Script — Content Storyteller

**Target duration: under 4 minutes**

---

## Pre-Demo Setup (before going live)

- Open the Web App URL in Chrome (`https://golden007-prog.github.io/Content-Storyteller/`)
- Have a sample product image ready (e.g., a product photo, app screenshot, or brand visual)
- Optionally have the GCP Console open in a second tab (Cloud Run services page)

---

## Demo Flow

### 0:00–0:20 — Introduction (20s)

> "Content Storyteller transforms rough inputs — images, text, audio — into complete marketing packages using Gemini 2.0 Flash on Google Cloud."

- Show the landing page hero section
- Point out the clean, modern UI

### 0:20–0:50 — Upload Assets (30s)

- **Drag and drop** a product image onto the upload area
  - Highlight: "We accept images, screenshots, audio, video, and PDFs — all validated server-side with MIME type checking"
- Optionally add a second file to show multi-file support
- Note the file list appearing with names and sizes

### 0:50–1:20 — Configure Generation (30s)

- Type a prompt in the text field:
  > "Launch campaign for our new AI-powered design tool. Highlight speed, creativity, and ease of use."
- **Select a Platform**: click "Instagram Reel"
  - Mention: "Each platform gets tailored content — reel format, LinkedIn thought-leadership, Twitter threads"
- **Select a Tone**: click "Cinematic"
  - Mention: "Tone shapes the language, pacing, and visual style across all outputs"

### 1:20–1:30 — Generate (10s)

- Click the **"Generate Content"** button
- Mention: "This uploads to Cloud Storage, creates a job in Firestore, and dispatches via Pub/Sub to our Worker pipeline"

### 1:30–2:30 — Watch Streaming Timeline (60s)

- The **Generation Timeline** appears with 5 stages
- As each stage activates, point out:
  1. **Processing Input** (pulse animation) → "Gemini acts as a Creative Director, analyzing our inputs and producing a platform-aware Creative Brief"
  2. **Generating Copy** → "Structured copy: hook, caption, CTA, hashtags, voiceover script — all tailored to Instagram Reel + Cinematic tone"
  3. **Generating Images** → "Image concepts with visual direction and generation prompts"
  4. **Generating Video** → "Storyboard with scene-by-scene pacing, motion style, and camera direction"
  5. **Composing Package** → "Final asset bundle assembled"
- As partial results stream in, the Output Dashboard progressively reveals content sections
- Mention: "All of this streams in real-time via Server-Sent Events — no polling needed"

### 2:30–3:30 — Review Outputs (60s)

Walk through each section of the Output Dashboard:

1. **Creative Brief** — campaign angle, pacing, visual style
   - "The Creative Director Agent produced this brief to guide all downstream generation"

2. **Copy Cards** — hook, caption, CTA, hashtags
   - Click a **copy-to-clipboard** button: "One click to grab any text"

3. **Voiceover & On-Screen Text** — script and text overlays
   - "Ready for video production or social posting"

4. **Storyboard** — scene cards with duration, motion, camera direction
   - "Scene-by-scene direction for a 15-second Instagram Reel"

5. **Visual Direction** — image concepts with style and prompts
   - "Actionable creative direction for your design team or image generation tools"

6. **Video Brief** — motion style, energy direction, text overlay style
   - "Complete video production brief"

### 3:30–3:50 — Export (20s)

- Click **"Download All"** to download the complete asset bundle
- Show individual download buttons on specific assets
- Mention: "All downloads use time-limited signed URLs — secure, no backend proxy"

### 3:50–4:00 — Wrap-Up (10s)

> "Content Storyteller: multimodal input, Gemini 2.0 Flash intelligence, five GCP services, real-time streaming — all deployed on Cloud Run. Thank you!"

---

## Live Agent Mode Demo (Optional — if time permits)

### Setup
- From the landing page, click the "🎙️ Live Agent" toggle in the mode switcher

### Flow (60s)

1. Click **"Start Creative Session"** — a live session is created in Firestore
2. Type a message: "I want to promote a new AI design tool for creative professionals"
3. The AI Creative Director responds with follow-up questions about platform, tone, and themes
4. Continue the conversation: "Target Instagram Reels with a cinematic feel"
5. Click **"End Session"** — the transcript is persisted and creative direction is extracted
6. Review the extracted creative direction: suggested prompt, platform, tone, key themes
7. Click **"Generate Content Package from This Direction"** — seamlessly transitions to batch mode

> "Live Agent Mode lets you brainstorm with an AI Creative Director before generating. The conversation is persisted in Firestore, and creative direction is extracted via Gemini to seed the batch pipeline."

---

## Trend Analyzer Demo (Optional — if time permits)

### Setup
- From the landing page, click the "📊 Trend Analyzer" toggle in the mode switcher

### Flow (60s)

1. **Select filters**: choose platform "Instagram Reels", domain "Tech", region "Global"
2. Click **"Analyze Trends"** — the API calls Gemini to discover trending topics for the selected filters
3. Review the **trend landscape summary** at the top of the results
4. Browse **trend cards** — each shows a title, keyword, momentum score bar, freshness label badge (Fresh, Rising Fast, Established, Fading), suggested hook, content angle, and hashtags
5. Click **"Use in Content Storyteller"** on a trend card — the app switches to batch mode with the prompt and platform pre-filled from the trend data
6. Show the **seamless transition**: the landing page form is pre-filled with the trend's title, hook, content angle, and hashtags, and the platform selector is set to Instagram Reel

> "Trend Analyzer lets you discover what's trending right now, then use those insights to generate content in one click. Gemini analyzes platform-specific trends and gives you actionable hooks, hashtags, and content angles."

---

## Architecture Talking Points (if asked)

- **3 Cloud Run services**: Web (React+nginx), API (Express), Worker (pipeline)
- **Gemini 2.0 Flash** via `@google/genai` SDK with ADC authentication
- **5 pipeline stages** running sequentially with Pub/Sub dispatch
- **Firestore** for job state, **Cloud Storage** for uploads and assets
- **Terraform** manages all infrastructure
- **TypeScript monorepo** with shared types across all services

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Upload fails | Check file is under 50MB and an allowed type |
| Generation stalls | Check Worker service logs in Cloud Logging |
| No streaming updates | Verify SSE connection in browser DevTools Network tab |
| Signed URL expired | Refresh the page to get new signed URLs |
