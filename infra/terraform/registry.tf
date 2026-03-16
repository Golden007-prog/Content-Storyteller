# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "content_storyteller" {
  repository_id = "content-storyteller"
  location      = var.region
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}
