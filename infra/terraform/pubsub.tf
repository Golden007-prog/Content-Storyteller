# ---------------------------------------------------------------------------
# Pub/Sub Topics and Subscriptions
# ---------------------------------------------------------------------------

# Dead-letter topic for failed messages
resource "google_pubsub_topic" "content_generation_jobs_dead_letter" {
  name    = "content-generation-jobs-dead-letter"
  project = var.project_id

  depends_on = [google_project_service.apis]
}

# Main topic for content generation job dispatch
resource "google_pubsub_topic" "content_generation_jobs" {
  name    = "content-generation-jobs"
  project = var.project_id

  depends_on = [google_project_service.apis]
}

# Subscription with retry policy and dead-letter routing
resource "google_pubsub_subscription" "content_generation_jobs_sub" {
  name    = "content-generation-jobs-sub"
  topic   = google_pubsub_topic.content_generation_jobs.id
  project = var.project_id

  ack_deadline_seconds = 600

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.content_generation_jobs_dead_letter.id
    max_delivery_attempts = 5
  }

  depends_on = [google_project_service.apis]
}
