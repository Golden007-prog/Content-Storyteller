# GCP Deployment Proof Plan — Content Storyteller

Complete, judge-ready plan for recording a behind-the-scenes proof that Content Storyteller runs on Google Cloud.

**Project:** `deep-hook-468814-t7` | **Region:** `us-central1` | **Services:** `api-service`, `worker-service`

---

## 1. Proof Video Script (30–60 seconds)

### Screen 1 — Frontend triggers backend (0:00–0:08)
- Open your GitHub Pages app in Chrome
- Click "Generate Content" (or trigger any action that hits the API)
- **Say:** "Here's Content Storyteller running on GitHub Pages. When I generate content, it sends a request to my Cloud Run backend on Google Cloud."

### Screen 2 — Cloud Run services (0:08–0:18)
- Switch to GCP Console tab: Cloud Run services list
- **Say:** "Here are my two Cloud Run services — api-service handles HTTP requests, worker-service runs the AI pipeline. Both deployed in us-central1."

### Screen 3 — Cloud Run logs (0:18–0:30)
- Click into `api-service` → Logs tab
- Show the log entry from the request you just made (look for the correlation ID or "POST /api/v1/jobs")
- **Say:** "And here in the logs you can see the request that just came in — the API created a job and dispatched it to the worker via Pub/Sub."

### Screen 4 — Firestore (0:30–0:40)
- Switch to Firestore Console tab → `jobs` collection
- Click the most recent job document
- Show the `state` field (e.g., `completed` or `generating_copy`)
- **Say:** "Firestore stores all job state. Here's the job document with its current state and the outputs from each pipeline stage."

### Screen 5 — Cloud Storage (0:40–0:48)
- Switch to Cloud Storage Console tab → `deep-hook-468814-t7-assets` bucket
- Show the generated asset files
- **Say:** "Generated assets — copy, image concepts, storyboards — are stored in Cloud Storage with signed URL delivery."

### Screen 6 — Vertex AI evidence (0:48–0:58)
- Switch to Cloud Run logs tab for `worker-service`
- Filter for "Pipeline started" or "generateContent"
- **Say:** "The worker calls Vertex AI Gemini models for every pipeline stage — text generation, image concepts, storyboards, and video briefs. All AI runs on Google Cloud."

---

## 2. Judge-Friendly Proof Checklist

### Must appear in the recording
- [ ] GCP Console showing Cloud Run services list with `api-service` and `worker-service`
- [ ] Cloud Run logs showing a real request being processed
- [ ] Firestore document showing job state and data
- [ ] Cloud Storage bucket with generated assets
- [ ] Your project ID (`deep-hook-468814-t7`) visible in the console header

### Optional but strong
- [ ] Health endpoint response showing `projectId`, `location`, `authMode`, and resolved Vertex AI models
- [ ] Pub/Sub topic `content-generation-jobs` visible in console
- [ ] Artifact Registry showing pushed Docker images
- [ ] Terraform files visible in repo (proves IaC)
- [ ] Cloud Build history showing a successful deployment

### Don't forget
- [ ] Make sure the GCP project ID is visible in the console top bar
- [ ] Show a timestamp on the logs that matches when you triggered the action
- [ ] Keep the browser URL bar visible so judges can see `console.cloud.google.com`

### Avoid
- Blurring or cropping the project ID
- Showing stale logs from days ago (trigger a fresh request right before recording)
- Spending time on the frontend UI (judges want to see GCP, not your React app)
- Showing error logs or failed deployments
- Leaving sensitive API keys visible in env files

---

## 3. Stack-Specific Proof Flow

```
GitHub Pages (frontend)
    │
    ▼  HTTP POST /api/v1/jobs
Cloud Run: api-service
    │  ├─ Creates job in Firestore (state: queued)
    │  ├─ Publishes message to Pub/Sub
    │  └─ Returns jobId to frontend
    ▼
Cloud Run: worker-service (via Pub/Sub)
    │  ├─ Reads uploads from Cloud Storage
    │  ├─ Calls Vertex AI Gemini for each pipeline stage
    │  ├─ Writes generated assets to Cloud Storage
    │  └─ Updates Firestore job state at each stage
    ▼
Frontend polls/streams results via SSE
```

### What to show for each service:

| GCP Service | What to show | Where in console |
|-------------|-------------|-----------------|
| Cloud Run | `api-service` and `worker-service` running, green checkmarks | Cloud Run → Services |
| Cloud Run Logs | POST /api/v1/jobs log entry, Pipeline started log | Cloud Run → api-service → Logs |
| Firestore | `jobs` collection → recent document with `state`, `steps`, `outputs` | Firestore → Data → jobs |
| Cloud Storage | `deep-hook-468814-t7-assets` bucket with generated files | Cloud Storage → Buckets → assets |
| Vertex AI | Worker logs showing Gemini model calls, OR health endpoint showing resolved models | Cloud Run → worker-service → Logs |
| Pub/Sub | `content-generation-jobs` topic exists | Pub/Sub → Topics (optional) |

---

## 4. Best Recording Sequence

**Before you hit record, open these 6 browser tabs in order:**

1. **Tab 1:** Your GitHub Pages app (`https://<username>.github.io/content-storyteller/`)
2. **Tab 2:** Cloud Run services list (`console.cloud.google.com/run?project=deep-hook-468814-t7`)
3. **Tab 3:** Cloud Run logs for api-service (pre-filtered)
4. **Tab 4:** Firestore Data (`console.cloud.google.com/firestore/databases/-default-/data?project=deep-hook-468814-t7`)
5. **Tab 5:** Cloud Storage buckets (`console.cloud.google.com/storage/browser?project=deep-hook-468814-t7`)
6. **Tab 6:** Cloud Run logs for worker-service (pre-filtered for "Pipeline" or "Gemini")

**Recording flow:**
1. Start on Tab 1 → trigger a content generation request
2. Switch to Tab 2 → show both services running
3. Switch to Tab 3 → show the fresh log entry from your request
4. Switch to Tab 4 → click into the job document, show state and outputs
5. Switch to Tab 5 → open the assets bucket, show generated files
6. Switch to Tab 6 → show worker logs with Vertex AI / pipeline evidence

---

## 5. Very Short Version (20–30 seconds)

**For a speed proof when time is tight:**

| Time | Action | Narration |
|------|--------|-----------|
| 0:00–0:05 | Show GitHub Pages app, click Generate | "Frontend on GitHub Pages sends requests to Cloud Run." |
| 0:05–0:15 | Switch to GCP Console → Cloud Run services list | "Here are my two Cloud Run services — API and Worker — running in us-central1." |
| 0:15–0:25 | Click api-service → Logs, show fresh log entry | "Logs confirm the backend just processed that request using Vertex AI Gemini." |
| 0:25–0:30 | Quick flash of Firestore job document | "Job state tracked in Firestore. All backend logic runs on Google Cloud." |

---

## 6. Stronger Version (45–60 seconds)

| Time | Action | Narration |
|------|--------|-----------|
| 0:00–0:08 | GitHub Pages app → trigger generation | "Content Storyteller frontend on GitHub Pages. Generating content now — this hits my Cloud Run backend." |
| 0:08–0:18 | GCP Console → Cloud Run services list | "Two Cloud Run services: api-service handles requests, worker-service runs the AI pipeline. Both in us-central1." |
| 0:18–0:28 | api-service → Logs tab, show fresh request | "Here's the request log — API created a Firestore job and published to Pub/Sub." |
| 0:28–0:38 | Firestore → jobs collection → recent document | "Firestore tracks every job. This one shows state 'completed' with outputs from five pipeline stages." |
| 0:38–0:48 | Cloud Storage → assets bucket → show files | "Generated assets stored in Cloud Storage — copy, image concepts, storyboards, video briefs." |
| 0:48–0:58 | worker-service → Logs, show Gemini/pipeline logs | "Worker logs show Vertex AI Gemini calls at every stage. All AI generation runs on Google Cloud." |

---

## 7. README Section

Paste this into your README.md:

```markdown
## Proof of Google Cloud Deployment

Content Storyteller's frontend is hosted on **GitHub Pages** as a static React SPA. All backend logic, AI processing, and data storage run on **Google Cloud Platform**:

- **Cloud Run** — `api-service` (HTTP API) and `worker-service` (async AI pipeline), both in `us-central1`
- **Firestore** — Job state management, live session persistence, trend query storage
- **Cloud Storage** — Three buckets for uploads, generated assets, and temp processing
- **Vertex AI** — Gemini models power all content generation (copy, images, storyboards, video briefs) via the `@google/genai` SDK with ADC authentication
- **Pub/Sub** — Async job dispatch between API and Worker with dead-letter support
- **Artifact Registry + Cloud Build** — CI/CD pipeline for container image management

### Where to verify in the repo
| What | Where |
|------|-------|
| Terraform IaC | `infra/terraform/*.tf` |
| Cloud Run Dockerfiles | `apps/api/Dockerfile`, `apps/worker/Dockerfile` |
| Vertex AI SDK usage | `apps/worker/src/pipeline/*.ts`, `apps/api/src/services/genai.ts` |
| Model Router config | `packages/shared/src/ai/model-router.ts` |
| Firestore integration | `apps/api/src/services/firestore.ts` |
| Pub/Sub integration | `apps/api/src/services/pubsub.ts` |
| CI/CD pipeline | `cloudbuild.yaml` |
| Deploy scripts | `scripts/deploy-backend.sh`, `scripts/deploy-frontend.sh` |
| Deployment evidence | `docs/deployment-proof.md` |
```

---

## 8. Submission Text Snippet

For the hackathon submission form under "Proof of Google Cloud Deployment":

> Content Storyteller is fully deployed on Google Cloud Platform. The frontend is a static React SPA hosted on GitHub Pages, while all backend logic runs on Cloud Run (api-service and worker-service) in us-central1. The AI content generation pipeline uses Vertex AI Gemini models via the @google/genai SDK with Application Default Credentials. Job state is managed in Firestore, generated assets are stored in Cloud Storage (three purpose-specific buckets), and async job dispatch uses Pub/Sub with dead-letter support. Infrastructure is defined as code using Terraform, and deployments are automated via Cloud Build with images stored in Artifact Registry. The proof recording shows live Cloud Run logs, Firestore job documents, Cloud Storage assets, and Vertex AI model integration — all under project deep-hook-468814-t7.

---

## 9. Screen Recording Shot List

| Timestamp | Shot | What's visible |
|-----------|------|---------------|
| 0:00–0:05 | Frontend request | GitHub Pages URL bar, click Generate button, loading state appears |
| 0:05–0:15 | Cloud Run services | GCP Console, project ID in header, api-service and worker-service with green status |
| 0:15–0:25 | API logs | Cloud Run → api-service → Logs, fresh POST /api/v1/jobs entry with timestamp |
| 0:25–0:35 | Firestore data | Firestore console → jobs collection → document with state, steps, outputs fields |
| 0:35–0:45 | Cloud Storage | Storage browser → deep-hook-468814-t7-assets bucket → generated asset files |
| 0:45–0:55 | Vertex AI evidence | Cloud Run → worker-service → Logs showing pipeline stages and Gemini model calls |
| 0:55–1:00 | Closing | Back to frontend showing completed results (optional) |

---

## 10. Troubleshooting

### Logs don't appear live
- Cloud Run logs can have a 5–15 second delay. Trigger the request 30 seconds before you plan to show logs.
- Use the "Stream logs" toggle in the Cloud Run Logs tab to get near-real-time updates.
- Fallback: run `curl <API_URL>/api/v1/health` right before recording — the health check always produces a log entry.

### Firestore updates too fast
- If the job completes before you switch tabs, that's fine — show the completed document with all its fields.
- The `steps` object on the job document shows every stage's status, which proves the pipeline ran.
- If you want to catch it mid-flight, use a larger input file or video generation to slow the pipeline.

### Assets not yet generated
- Run a full generation 5 minutes before recording so assets are already in the bucket.
- Show the existing assets — judges don't need to see them appear in real-time.
- The Firestore job document's `outputs` field also proves assets were generated even if you don't show the bucket.

### Vertex AI not visibly obvious in console
- The Vertex AI console page may not show usage for SDK-based calls. Don't rely on it.
- Instead, show worker-service logs filtered for "Pipeline started", "generateContent", or model names like "gemini".
- Best option: `curl <API_URL>/api/v1/health` and show the JSON response — it includes a `models` field listing every resolved Vertex AI model with its status.
- You can also show the `@google/genai` dependency in `package.json` or the SDK initialization code in `apps/api/src/services/genai.ts`.

### Frontend is on GitHub Pages — will judges question it?
- Address it directly in your narration: "The frontend is a static site on GitHub Pages. All backend logic, AI, and data storage run on Google Cloud."
- The Cloud Run logs proving real requests from the frontend to GCP are your strongest evidence.
- Your README's "Proof of Google Cloud Deployment" section explicitly explains the split architecture.

### Health endpoint as a fallback proof
If anything goes wrong during recording, `curl` the health endpoint as a catch-all:
```bash
curl https://<API_URL>/api/v1/health | jq
```
This returns:
- `projectId`: your GCP project
- `location`: us-central1
- `authMode`: adc-service-account
- `models`: every Vertex AI model slot with its resolved model and availability status

This single response proves Cloud Run + Vertex AI + ADC authentication in one shot.

---

## Proof Tiers

### Minimum Proof (20 seconds, bare minimum)
1. GCP Console → Cloud Run services list showing both services running
2. Click into api-service → Logs → show one real log entry
3. **Say:** "Backend runs on Cloud Run, AI powered by Vertex AI Gemini."

### Strong Proof (45 seconds, recommended)
1. Frontend → trigger request
2. Cloud Run services list
3. API logs showing the request
4. Firestore job document
5. Cloud Storage assets bucket
6. Worker logs showing Gemini calls

### Best Possible Proof (60 seconds, maximum impact)
1. Frontend → trigger request (show GitHub Pages URL)
2. Cloud Run services list (both green)
3. API logs (fresh request with timestamp)
4. Firestore job document (state, steps, outputs)
5. Cloud Storage assets bucket (generated files)
6. Worker logs (pipeline stages, Gemini model names)
7. Health endpoint JSON (projectId, models, authMode)
8. Quick flash of Artifact Registry or Cloud Build history

---

## Final Recommended Recording Order

1. **Trigger a request from the frontend** (establishes the connection between GitHub Pages and GCP)
2. **Cloud Run services list** (proves compute is on GCP)
3. **API service logs** (proves the request was handled by Cloud Run)
4. **Firestore job document** (proves data layer is on GCP)
5. **Cloud Storage assets** (proves storage is on GCP)
6. **Worker service logs** (proves AI/Vertex AI runs on GCP)

## Browser Tabs to Open Before Recording

1. `https://<username>.github.io/content-storyteller/` — your app
2. `https://console.cloud.google.com/run?project=deep-hook-468814-t7` — Cloud Run
3. `https://console.cloud.google.com/run/detail/us-central1/api-service/logs?project=deep-hook-468814-t7` — API logs
4. `https://console.cloud.google.com/firestore/databases/-default-/data/jobs?project=deep-hook-468814-t7` — Firestore
5. `https://console.cloud.google.com/storage/browser?project=deep-hook-468814-t7` — Storage
6. `https://console.cloud.google.com/run/detail/us-central1/worker-service/logs?project=deep-hook-468814-t7` — Worker logs

## The One-Line Explanation

> "The frontend is on GitHub Pages — every backend request, AI call, database write, and asset storage operation runs on Google Cloud: Cloud Run, Firestore, Cloud Storage, and Vertex AI Gemini."
