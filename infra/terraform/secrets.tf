# ---------------------------------------------------------------------------
# Secret Manager — placeholder secrets (no actual values stored)
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "api_keys" {
  project   = var.project_id
  secret_id = "api-keys"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "app_config" {
  project   = var.project_id
  secret_id = "app-config"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "vertex_ai_config" {
  project   = var.project_id
  secret_id = "vertex-ai-config"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}
