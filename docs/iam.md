# IAM Configuration

All service accounts follow the principle of least privilege. No `roles/owner` or `roles/editor` is assigned to any service account.

## Service Accounts

### `api-sa` — API Service Account

Used by the API Cloud Run service.

| Role | Justification |
|---|---|
| `roles/storage.objectAdmin` | Read/write uploaded media and generated assets in Cloud Storage |
| `roles/datastore.user` | Read/write Job documents in Firestore |
| `roles/pubsub.publisher` | Publish generation task messages to Pub/Sub topic |
| `roles/secretmanager.secretAccessor` | Read application secrets from Secret Manager |
| `roles/logging.logWriter` | Write structured logs to Cloud Logging |
| `roles/aiplatform.user` | Access Vertex AI Gemini models for content analysis |

### `worker-sa` — Worker Service Account

Used by the Worker Cloud Run service.

| Role | Justification |
|---|---|
| `roles/storage.objectAdmin` | Read uploads, write generated assets, use temp bucket for processing |
| `roles/datastore.user` | Read/write Job documents and asset references in Firestore |
| `roles/secretmanager.secretAccessor` | Read application secrets from Secret Manager |
| `roles/logging.logWriter` | Write structured logs to Cloud Logging |
| `roles/aiplatform.user` | Access Vertex AI Gemini models for content generation |
| `roles/pubsub.subscriber` | Consume generation task messages from Pub/Sub subscription |

### `cicd-sa` — CI/CD Service Account

Used by Cloud Build for automated builds and deployments.

| Role | Justification |
|---|---|
| `roles/artifactregistry.writer` | Push Docker images to Artifact Registry |
| `roles/run.admin` | Deploy new revisions to Cloud Run services |
| `roles/cloudbuild.builds.editor` | Trigger and manage Cloud Build pipelines |
| `roles/iam.serviceAccountUser` | Act as service accounts when deploying Cloud Run services |

## ADC-First Authentication

The system uses Application Default Credentials (ADC) as the primary authentication mechanism in production. This eliminates the need for explicit API keys or service account key files on GCP.

### How ADC Works

- **Google Cloud client libraries** (Storage, Firestore, Pub/Sub) automatically use ADC when initialized without explicit credentials. No key files are needed.
- **Google GenAI SDK** (`@google/genai`) is configured ADC-first via Vertex AI mode. When `GEMINI_API_KEY` is not set, the SDK uses `vertexai: true` with the project ID and region from environment variables, authenticating via the Cloud Run service account.
- **API key fallback**: `GEMINI_API_KEY` is only needed for local development outside GCP where ADC is not available. In production on Cloud Run, the service account's `roles/aiplatform.user` role grants access to Vertex AI Gemini models.

### Recommended Minimum Roles

For least-privilege production deployments:

| Service Account | Minimum Required Roles |
|---|---|
| `api-sa` | `roles/datastore.user`, `roles/storage.objectAdmin`, `roles/pubsub.publisher` |
| `worker-sa` | `roles/datastore.user`, `roles/storage.objectAdmin`, `roles/aiplatform.user` |

Additional roles (e.g. `roles/secretmanager.secretAccessor`, `roles/logging.logWriter`) are recommended for full functionality as listed in the service account tables above.

## Security Notes

- All IAM bindings are defined in `infra/terraform/iam.tf`
- Storage roles are project-level (`roles/storage.objectAdmin`) — for production, scope to specific buckets using IAM conditions
- No service account has `roles/owner` or `roles/editor`
- Service accounts are created per-service to isolate blast radius
- `GEMINI_API_KEY` should not be set in production — use ADC via service accounts instead
