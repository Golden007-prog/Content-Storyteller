# ---------------------------------------------------------------------------
# Terraform Outputs
# ---------------------------------------------------------------------------

# --- Project & Region ---

output "project_id" {
  description = "The GCP project ID used for all resources"
  value       = var.project_id
}

output "region" {
  description = "The GCP region where all resources are deployed"
  value       = var.region
}

# --- Artifact Registry ---

output "artifact_registry_path" {
  description = "Full Docker repository path for pushing and pulling container images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.content_storyteller.repository_id}"
}

# --- Cloud Storage Buckets ---

output "uploads_bucket_name" {
  description = "Name of the Cloud Storage bucket for raw user uploads"
  value       = google_storage_bucket.uploads.name
}

output "assets_bucket_name" {
  description = "Name of the Cloud Storage bucket for generated output assets"
  value       = google_storage_bucket.assets.name
}

output "temp_bucket_name" {
  description = "Name of the Cloud Storage bucket for temporary processing files"
  value       = google_storage_bucket.temp.name
}

# --- Firestore ---

output "firestore_database_name" {
  description = "Name of the Firestore database used for job tracking and state"
  value       = google_firestore_database.main.name
}

# --- Pub/Sub ---

output "pubsub_topic_name" {
  description = "Name of the Pub/Sub topic for content generation job dispatch"
  value       = google_pubsub_topic.content_generation_jobs.name
}

output "pubsub_subscription_name" {
  description = "Name of the Pub/Sub subscription for the worker service to consume messages"
  value       = google_pubsub_subscription.content_generation_jobs_sub.name
}

# --- Service Account Emails ---

output "api_service_account_email" {
  description = "Email address of the API service account"
  value       = google_service_account.api_sa.email
}

output "worker_service_account_email" {
  description = "Email address of the Worker service account"
  value       = google_service_account.worker_sa.email
}

output "cicd_service_account_email" {
  description = "Email address of the CI/CD service account"
  value       = google_service_account.cicd_sa.email
}

# --- Cloud Run Service URLs ---

output "api_service_url" {
  description = "URL of the deployed API Cloud Run service"
  value       = google_cloud_run_v2_service.api.uri
}

output "worker_service_url" {
  description = "URL of the deployed Worker Cloud Run service"
  value       = google_cloud_run_v2_service.worker.uri
}

# --- Secret Manager ---

output "secret_api_keys_name" {
  description = "Resource name of the API keys secret in Secret Manager"
  value       = google_secret_manager_secret.api_keys.name
}

output "secret_app_config_name" {
  description = "Resource name of the application config secret in Secret Manager"
  value       = google_secret_manager_secret.app_config.name
}

output "secret_vertex_ai_config_name" {
  description = "Resource name of the Vertex AI config secret in Secret Manager"
  value       = google_secret_manager_secret.vertex_ai_config.name
}
