# Hackathon Submission Checklist

## Gemini Model Usage

- [x] Uses Vertex AI with Gemini models for multimodal content understanding
- [x] Gemini analyzes uploaded media (images, text, screenshots) to generate Creative Briefs
- [x] Gemini generates marketing copy (headlines, body text, CTAs)
- [x] Gemini generates image prompts and storyboard documents

## Google GenAI SDK / ADK Usage

- [x] Uses `@google-cloud/vertexai` SDK for Gemini model interactions
- [x] Uses Google Cloud client libraries (`@google-cloud/storage`, `@google-cloud/firestore`, `@google-cloud/pubsub`)
- [x] Structured output schemas defined for all AI generation calls

## Google Cloud Service Usage

- [x] Cloud Run — API and Worker services
- [x] Cloud Storage — Three buckets (uploads, assets, temp)
- [x] Firestore — Job state management and metadata
- [x] Pub/Sub — Async job dispatch with dead-letter topic
- [x] Vertex AI — Gemini model access for content generation
- [x] Artifact Registry — Docker image storage
- [x] Secret Manager — Sensitive configuration placeholders
- [x] Cloud Build — CI/CD pipeline
- [x] Cloud Logging — Structured observability
- [x] IAM — Least-privilege service accounts

## Multimodal Input/Output

- [x] Input: Text, images, screenshots, voice notes (multipart upload)
- [x] Output: Marketing copy, generated images, storyboards, voiceover scripts, video briefs
- [x] Vertex AI multimodal understanding processes mixed input types

## Real-Time Interaction

- [x] SSE (Server-Sent Events) endpoint for live job status streaming
- [x] Polling endpoint for job state and partial results
- [x] Real-time Firestore state transitions visible during processing

## Live Deployment

- [x] Terraform-managed infrastructure (fully reproducible)
- [x] Cloud Build CI/CD pipeline for automated deployment
- [x] Shell scripts for one-command bootstrap, build, and deploy
- [x] Deployment evidence documented in `docs/deployment-proof.md`
