# Requirements Document

## Introduction

Content Storyteller is a multimodal AI product that transforms rough text prompts, screenshots, images, and voice notes into polished marketing copy, generated visuals, storyboard and voiceover scripts, and short promo videos. This requirements document covers the Google Cloud foundation layer: repository structure, Terraform infrastructure, IAM configuration, deployment tooling, local development setup, async pipeline design, observability, documentation, and safety/fallback behavior. The goal is a reproducible, deployable MVP running entirely on Google Cloud using Vertex AI with Gemini models.

## Glossary

- **Monorepo**: A single repository containing multiple applications (web, api, worker) and shared packages
- **API_Service**: The Cloud Run service that handles HTTP requests, media uploads, job creation, polling, and streaming endpoints
- **Worker_Service**: The Cloud Run service (or job) that performs async AI generation tasks including multimodal understanding, copy generation, image generation, and video generation
- **Web_App**: The TypeScript frontend web application for user interaction
- **Terraform_Config**: The Infrastructure-as-Code configuration that provisions all Google Cloud resources
- **Job**: A Firestore document representing a single content generation request and its lifecycle state
- **Asset**: A generated artifact (copy, image, video, storyboard) stored in Cloud Storage
- **Generation_Pipeline**: The async workflow from upload through AI processing to final asset bundle
- **Bootstrap_Script**: A shell script that initializes the GCP project, enables APIs, and runs Terraform
- **Service_Account**: A Google Cloud IAM identity used by a specific service with least-privilege roles
- **ADC**: Application Default Credentials, the local authentication mechanism for Google Cloud SDK
- **Correlation_ID**: A unique identifier propagated across services for request tracing
- **Idempotency_Key**: A client-provided key ensuring duplicate requests produce the same result
- **Creative_Brief**: A structured AI-generated document outlining the marketing direction for a generation job
- **Asset_Bundle**: The final collection of all generated assets for a completed job

## Requirements

### Requirement 1: Monorepo Structure

**User Story:** As a developer, I want a clean monorepo layout, so that all application code, infrastructure, scripts, and documentation are organized and discoverable.

#### Acceptance Criteria

1. THE Monorepo SHALL contain the directories: `/apps/web`, `/apps/api`, `/apps/worker`, `/packages/shared`, `/infra/terraform`, `/scripts`, and `/docs`
2. THE Monorepo SHALL contain a root `package.json` or workspace configuration that references all application and package directories
3. THE Monorepo SHALL contain a `.env.example` file at the root documenting all required environment variables with placeholder values
4. WHEN a developer clones the repository, THE Monorepo SHALL contain a root README.md with setup instructions sufficient to bootstrap the project

### Requirement 2: Google Cloud API Enablement

**User Story:** As a platform engineer, I want all required Google Cloud APIs enabled via Terraform, so that services can be provisioned without manual console steps.

#### Acceptance Criteria

1. THE Terraform_Config SHALL enable the following APIs: Vertex AI, Cloud Run, Artifact Registry, Secret Manager, Cloud Build, Cloud Storage, Firestore, Cloud Tasks, Pub/Sub, IAM, and Cloud Logging
2. THE Terraform_Config SHALL define a `region` variable with a default value of `us-central1`
3. THE Terraform_Config SHALL define a `project_id` variable with no default value, requiring explicit user input
4. THE Terraform_Config SHALL not hardcode any project IDs, regions, bucket names, or secret values

### Requirement 3: Artifact Registry

**User Story:** As a developer, I want a container registry in Google Cloud, so that built Docker images can be stored and deployed to Cloud Run.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create an Artifact Registry repository in Docker format in the configured region
2. THE Terraform_Config SHALL output the full repository path for use in build and deploy scripts

### Requirement 4: Cloud Storage Buckets

**User Story:** As a developer, I want separate Cloud Storage buckets for uploads, generated assets, and temporary processing, so that media files are organized by lifecycle stage.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create three Cloud Storage buckets: one for raw uploads, one for generated assets, and one for temporary processing files
2. THE Terraform_Config SHALL configure bucket names using the project ID as a prefix to ensure global uniqueness
3. THE Terraform_Config SHALL configure a lifecycle rule on the temporary processing bucket to delete objects older than 7 days
4. THE Terraform_Config SHALL output all bucket names for use by application services
5. THE Terraform_Config SHALL set uniform bucket-level access on all buckets

### Requirement 5: Firestore Database

**User Story:** As a developer, I want a Firestore database provisioned for job tracking and session metadata, so that the API and worker services can share state.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create a Firestore database in Native mode in the configured region
2. THE Terraform_Config SHALL output the Firestore database name

### Requirement 6: Async Queueing

**User Story:** As a developer, I want a Cloud Tasks queue or Pub/Sub topic provisioned, so that the API service can enqueue generation work for the worker service.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create either a Cloud Tasks queue or a Pub/Sub topic with subscription for async job dispatch
2. THE Terraform_Config SHALL configure retry settings with exponential backoff on the queue or subscription
3. THE Terraform_Config SHALL output the queue name or topic and subscription names

### Requirement 7: Secret Manager

**User Story:** As a developer, I want Secret Manager secrets provisioned as placeholders, so that sensitive configuration values have a defined storage location.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create Secret Manager secret resources as placeholders for application secrets
2. THE Terraform_Config SHALL not store any actual secret values in Terraform state or source code
3. THE Terraform_Config SHALL output the secret resource names for reference by application services

### Requirement 8: Cloud Run Services

**User Story:** As a developer, I want Cloud Run services defined for the API and worker, so that containerized applications can be deployed to Google Cloud.

#### Acceptance Criteria

1. THE Terraform_Config SHALL define a Cloud Run service for the API_Service with configurable CPU, memory, and concurrency settings
2. THE Terraform_Config SHALL define a Cloud Run service or job for the Worker_Service with configurable CPU, memory, and timeout settings
3. THE Terraform_Config SHALL configure both Cloud Run services to use their respective service accounts
4. THE Terraform_Config SHALL pass required environment variables (bucket names, Firestore database, queue/topic names, region, project ID) to both Cloud Run services
5. THE Terraform_Config SHALL output the Cloud Run service URLs


### Requirement 9: Service Accounts and IAM

**User Story:** As a security engineer, I want separate service accounts with least-privilege roles for the API, worker, and CI/CD pipeline, so that each service has only the permissions it needs.

#### Acceptance Criteria

1. THE Terraform_Config SHALL create three service accounts: one for API_Service, one for Worker_Service, and one for CI/CD operations
2. THE Terraform_Config SHALL assign the API_Service service account roles for: Cloud Storage read/write on upload and asset buckets, Firestore read/write, Cloud Tasks or Pub/Sub publish, Secret Manager secret accessor, Cloud Logging writer, and Vertex AI user
3. THE Terraform_Config SHALL assign the Worker_Service service account roles for: Cloud Storage read/write on all three buckets, Firestore read/write, Secret Manager secret accessor, Cloud Logging writer, Vertex AI user, and Cloud Tasks or Pub/Sub subscriber
4. THE Terraform_Config SHALL assign the CI/CD service account roles for: Artifact Registry writer, Cloud Run deployer, Cloud Build editor, and Service Account user
5. THE Terraform_Config SHALL not assign any owner or editor project-level roles to any service account
6. THE Terraform_Config SHALL output all service account email addresses

### Requirement 10: Terraform Outputs

**User Story:** As a developer, I want all important resource identifiers exported as Terraform outputs, so that deployment scripts and application configuration can reference them programmatically.

#### Acceptance Criteria

1. THE Terraform_Config SHALL output: project ID, region, Artifact Registry repository path, all bucket names, Firestore database name, queue or topic names, all service account emails, Cloud Run service URLs, and secret resource names
2. THE Terraform_Config SHALL organize outputs with descriptive names and descriptions

### Requirement 11: Deployment Scripts

**User Story:** As a developer, I want shell scripts and a task runner for bootstrapping, building, deploying, and running the project, so that common operations are repeatable one-command actions.

#### Acceptance Criteria

1. THE Monorepo SHALL contain a `scripts/bootstrap.sh` script that initializes the GCP project, authenticates, and runs Terraform apply
2. THE Monorepo SHALL contain a `scripts/build.sh` script that builds Docker images for API_Service and Worker_Service and pushes them to Artifact Registry
3. THE Monorepo SHALL contain a `scripts/deploy.sh` script that deploys the latest images to Cloud Run
4. THE Monorepo SHALL contain a `scripts/dev.sh` script that starts local development servers for Web_App, API_Service, and Worker_Service
5. THE Monorepo SHALL contain a Makefile or equivalent task runner with targets for bootstrap, build, deploy, dev, and terraform operations
6. WHEN a developer runs the bootstrap script, THE Bootstrap_Script SHALL check for required CLI tools (gcloud, terraform, docker) before proceeding
7. THE Monorepo SHALL contain a Cloud Build configuration file (`cloudbuild.yaml`) or equivalent CI/CD pipeline definition

### Requirement 12: Local Development Setup

**User Story:** As a developer, I want local development configuration and instructions, so that I can run and test services on my machine using Application Default Credentials.

#### Acceptance Criteria

1. THE Monorepo SHALL contain `.env.example` files in each application directory (`apps/web`, `apps/api`, `apps/worker`) listing all required environment variables
2. THE Monorepo SHALL contain documentation in `docs/env.md` explaining each environment variable and how to obtain its value
3. THE Monorepo SHALL contain documentation instructing developers to use `gcloud auth application-default login` for local ADC authentication
4. WHEN a developer runs the local dev script, THE dev script SHALL start all three services (Web_App, API_Service, Worker_Service) with environment variables loaded from `.env` files

### Requirement 13: API Contracts and Schemas

**User Story:** As a developer, I want defined API contracts and structured output schemas in the shared package, so that the web, API, and worker services have a consistent interface.

#### Acceptance Criteria

1. THE packages/shared directory SHALL define TypeScript interfaces or types for: upload media request/response, create generation job request/response, poll job status response, retrieve assets response, and stream partial results event shape
2. THE packages/shared directory SHALL define a structured schema for Asset metadata including: asset ID, job ID, asset type (copy, image, video, storyboard, voiceover_script), storage path, generation timestamp, and status
3. THE packages/shared directory SHALL define structured output schemas for: Creative_Brief, copy package, image prompt set, storyboard document, video brief, and Asset_Bundle
4. THE packages/shared directory SHALL define the Job state enum with values: `queued`, `processing_input`, `generating_copy`, `generating_images`, `generating_video`, `composing_package`, `completed`, and `failed`
5. THE packages/shared directory SHALL export all types and schemas for consumption by Web_App, API_Service, and Worker_Service

### Requirement 14: Async Generation Pipeline Design

**User Story:** As a developer, I want a documented async generation pipeline, so that the system processes content generation jobs through defined stages with status tracking.

#### Acceptance Criteria

1. WHEN a user uploads media through the API_Service, THE API_Service SHALL store the media in the raw uploads bucket and create a Job document in Firestore with state `queued`
2. WHEN a Job is created, THE API_Service SHALL enqueue a task message to the Cloud Tasks queue or Pub/Sub topic containing the job ID
3. WHEN the Worker_Service receives a task message, THE Worker_Service SHALL update the Job state to `processing_input` and begin the generation pipeline
4. THE Worker_Service SHALL progress the Job through states in order: `processing_input` → `generating_copy` → `generating_images` → `generating_video` → `composing_package` → `completed`
5. IF an unrecoverable error occurs during any pipeline stage, THEN THE Worker_Service SHALL update the Job state to `failed` with an error message and cease processing
6. WHEN each pipeline stage completes, THE Worker_Service SHALL persist generated assets to the generated assets bucket and update the Job document with asset references
7. THE API_Service SHALL provide a polling endpoint that returns the current Job state and any available partial results
8. THE API_Service SHALL provide a streaming endpoint (SSE or equivalent) that emits Job state changes and partial results in real time


### Requirement 15: Observability and Operational Safety

**User Story:** As an operator, I want structured logging, correlation IDs, error handling, and cost-conscious defaults, so that the system is debuggable, resilient, and affordable.

#### Acceptance Criteria

1. THE API_Service SHALL include a Correlation_ID in every log entry, propagating the ID to the Worker_Service via task message metadata
2. THE Worker_Service SHALL include the Correlation_ID and Job ID in every log entry during pipeline processing
3. THE API_Service SHALL emit structured JSON logs compatible with Cloud Logging
4. THE Worker_Service SHALL emit structured JSON logs compatible with Cloud Logging
5. THE API_Service SHALL enforce a maximum upload file size of 50MB per file
6. THE Worker_Service SHALL enforce a maximum processing timeout of 10 minutes per job
7. THE Worker_Service SHALL process task messages in a retry-safe manner, using Idempotency_Key to prevent duplicate processing
8. THE Terraform_Config SHALL configure Cloud Storage lifecycle rules and Cloud Run concurrency limits as cost-conscious defaults

### Requirement 16: Hackathon Documentation

**User Story:** As a hackathon judge, I want comprehensive documentation proving architecture decisions, GCP usage, IAM security, and deployment capability, so that the submission meets all judging criteria.

#### Acceptance Criteria

1. THE Monorepo SHALL contain `docs/architecture.md` with a Mermaid diagram showing all services, data flows, and GCP resources
2. THE Monorepo SHALL contain `docs/deployment-proof.md` with instructions and evidence placeholders for demonstrating a live deployment
3. THE Monorepo SHALL contain `docs/iam.md` documenting all service accounts, their assigned roles, and the justification for each role
4. THE Monorepo SHALL contain `docs/env.md` documenting all environment variables across all services
5. THE Monorepo SHALL contain `docs/demo-flow.md` describing the end-to-end demo scenario from upload to final asset delivery
6. THE Monorepo SHALL contain `docs/submission-checklist.md` with checkboxes for: Gemini model usage, Google GenAI SDK or ADK usage, Google Cloud service usage, multimodal input/output support, real-time interaction, and live deployment
7. THE root README.md SHALL contain sections covering: project overview, architecture summary, quickstart, deployment, and hackathon criteria compliance

### Requirement 17: Kiro Build Handoff Document

**User Story:** As a developer using Kiro, I want a structured handoff document, so that Kiro can efficiently build application code with full context of the infrastructure and contracts.

#### Acceptance Criteria

1. THE Monorepo SHALL contain `docs/kiro-build-handoff.md` documenting: repo structure, provisioned GCP services and bucket names, environment variables, API contracts, frontend screen descriptions, backend endpoint specifications, worker pipeline step details, known TODOs, and operational commands
2. THE kiro-build-handoff.md SHALL reference the shared package types and schemas for all API contracts
3. THE kiro-build-handoff.md SHALL list every Cloud Run environment variable and its source (Terraform output, Secret Manager, or static config)

### Requirement 18: Safety and Fallback Behavior

**User Story:** As a developer, I want capability detection and graceful fallbacks for AI generation APIs, so that the system degrades gracefully when image or video generation is unavailable.

#### Acceptance Criteria

1. WHEN the Worker_Service starts a generation pipeline stage, THE Worker_Service SHALL check API availability for that capability (image generation, video generation) before attempting the call
2. IF image generation API is unavailable or returns an access-denied error, THEN THE Worker_Service SHALL skip image generation, record a fallback notice in the Job document, and continue to the next pipeline stage
3. IF video generation API is unavailable or returns an access-denied error, THEN THE Worker_Service SHALL skip video generation, record a fallback notice in the Job document, and continue to the next pipeline stage
4. THE packages/shared directory SHALL define interfaces for all generation capabilities that allow substitution of real and stub implementations
5. THE Worker_Service SHALL not use hardcoded mock data in place of real API calls; fallback behavior SHALL produce a clear "capability unavailable" status rather than fake results

### Requirement 19: Implementation Language and Code Quality

**User Story:** As a developer, I want consistent language choices and code quality standards, so that the codebase is maintainable and hackathon-ready.

#### Acceptance Criteria

1. THE Web_App SHALL be implemented in TypeScript
2. THE API_Service SHALL be implemented in TypeScript or Python, whichever provides the fastest path to a working MVP
3. THE Worker_Service SHALL be implemented in the same language as the API_Service for code sharing
4. THE Monorepo SHALL use consistent naming conventions across all services: kebab-case for file names, PascalCase for types and interfaces, camelCase for functions and variables
5. THE packages/shared directory SHALL contain only code that is consumed by two or more services
