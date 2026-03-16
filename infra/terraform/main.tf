terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ---------------------------------------------------------------------------
# API Enablement
# ---------------------------------------------------------------------------

locals {
  required_apis = [
    "aiplatform.googleapis.com",         # Vertex AI
    "run.googleapis.com",                # Cloud Run
    "artifactregistry.googleapis.com",   # Artifact Registry
    "secretmanager.googleapis.com",      # Secret Manager
    "cloudbuild.googleapis.com",         # Cloud Build
    "storage.googleapis.com",            # Cloud Storage
    "firestore.googleapis.com",          # Firestore
    "cloudtasks.googleapis.com",         # Cloud Tasks
    "pubsub.googleapis.com",            # Pub/Sub
    "iam.googleapis.com",               # IAM
    "logging.googleapis.com",           # Cloud Logging
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
