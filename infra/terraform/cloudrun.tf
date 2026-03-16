# ---------------------------------------------------------------------------
# Cloud Run Services
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name     = "api-service"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.api_sa.email

    scaling {
      max_instance_count = 3
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.content_storyteller.repository_id}/api:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "UPLOADS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "ASSETS_BUCKET"
        value = google_storage_bucket.assets.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.main.name
      }
      env {
        name  = "PUBSUB_TOPIC"
        value = google_pubsub_topic.content_generation_jobs.name
      }
      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origin
      }
      env {
        name  = "PORT"
        value = "8080"
      }
    }

    max_instance_request_concurrency = 80
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "worker" {
  name     = "worker-service"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.worker_sa.email
    timeout         = "600s"

    scaling {
      max_instance_count = 3
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.content_storyteller.repository_id}/worker:latest"

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_REGION"
        value = var.region
      }
      env {
        name  = "UPLOADS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      env {
        name  = "ASSETS_BUCKET"
        value = google_storage_bucket.assets.name
      }
      env {
        name  = "TEMP_BUCKET"
        value = google_storage_bucket.temp.name
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = google_firestore_database.main.name
      }
      env {
        name  = "PUBSUB_SUBSCRIPTION"
        value = google_pubsub_subscription.content_generation_jobs_sub.name
      }
      env {
        name  = "PORT"
        value = "8080"
      }
    }

    max_instance_request_concurrency = 1
  }

  depends_on = [google_project_service.apis]
}
