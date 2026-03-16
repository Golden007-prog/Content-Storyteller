# Demo Flow

End-to-end demo scenario from upload to final asset delivery.

## Scenario: Marketing Campaign from Product Photo

A marketing manager uploads a product photo and brief text description. Content Storyteller generates a complete marketing asset package.

## Step-by-Step Flow

### 1. Upload Media

The user opens the Web App and uploads a product photo (JPEG/PNG, ≤50MB).

```
POST /api/v1/upload
Content-Type: multipart/form-data

→ Response: { "uploadPaths": ["uploads/abc123/product.jpg"] }
```

### 2. Create Generation Job

The user submits the upload to start content generation.

```
POST /api/v1/jobs
{ "uploadPaths": ["uploads/abc123/product.jpg"] }

→ Response: { "jobId": "job_xyz", "state": "queued" }
```

Behind the scenes:
- Job document created in Firestore with state `queued`
- Pub/Sub message published with `jobId` and `idempotencyKey`

### 3. Pipeline Processing (Worker)

The Worker picks up the Pub/Sub message and runs the pipeline:

| Stage | Job State | What Happens |
|---|---|---|
| ProcessInput | `processing_input` | Vertex AI analyzes the uploaded photo, generates a Creative Brief |
| GenerateCopy | `generating_copy` | Gemini generates marketing copy (headlines, body, CTAs) |
| GenerateImages | `generating_images` | Capability check → generate images or record fallback notice |
| GenerateVideo | `generating_video` | Capability check → generate video brief or record fallback notice |
| ComposePackage | `composing_package` | Assemble all assets into final Asset Bundle |

Each stage persists generated assets to the GCS assets bucket and updates the Job document.

### 4. Real-Time Status Updates

The Web App streams status via SSE:

```
GET /api/v1/jobs/job_xyz/stream

→ event: state_change
→ data: { "state": "processing_input", "timestamp": "..." }

→ event: state_change
→ data: { "state": "generating_copy", "timestamp": "..." }

→ event: state_change
→ data: { "state": "completed", "timestamp": "..." }
```

Alternatively, the Web App can poll:

```
GET /api/v1/jobs/job_xyz
→ { "jobId": "job_xyz", "state": "generating_copy", "assets": [...] }
```

### 5. Retrieve Final Assets

Once the job reaches `completed`, the user retrieves the asset bundle:

```
GET /api/v1/jobs/job_xyz/assets

→ Response: {
    "jobId": "job_xyz",
    "completedAt": "...",
    "creativeBrief": { ... },
    "assets": [
      { "assetType": "copy", "storagePath": "assets/job_xyz/copy.json", "status": "completed" },
      { "assetType": "image", "storagePath": "assets/job_xyz/hero.png", "status": "completed" },
      { "assetType": "storyboard", "storagePath": "assets/job_xyz/storyboard.json", "status": "completed" }
    ],
    "fallbackNotices": []
  }
```

### 6. Fallback Scenario

If image or video generation APIs are unavailable, the pipeline continues gracefully:

- The capability check detects unavailability
- A `FallbackNotice` is recorded (no mock data produced)
- The pipeline proceeds to the next stage
- The final asset bundle clearly indicates which capabilities were skipped

## Demo Tips

- Use a clear, well-lit product photo for best AI analysis results
- Monitor Cloud Logging during the demo to show structured logs with correlation IDs
- Show the Firestore console to demonstrate real-time Job state transitions
- If generation APIs are unavailable, highlight the graceful fallback behavior as a feature
