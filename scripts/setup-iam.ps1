## setup-iam.ps1 — Create IAM service accounts and role bindings via gcloud
## Mirrors infra/terraform/iam.tf

$ErrorActionPreference = "Continue"

$PROJECT_ID = if ($env:GCP_PROJECT_ID) { $env:GCP_PROJECT_ID } else { "deep-hook-468814-t7" }
Write-Host "==> Using project: $PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Create Service Accounts
# ---------------------------------------------------------------------------
Write-Host "==> Creating service accounts..."

$serviceAccounts = @(
    @{ id = "api-sa";    name = "API Service Account" },
    @{ id = "worker-sa"; name = "Worker Service Account" },
    @{ id = "cicd-sa";   name = "CI/CD Service Account" }
)

foreach ($sa in $serviceAccounts) {
    Write-Host "    Creating $($sa.id)..."
    & gcloud.cmd iam service-accounts create $sa.id `
        --display-name="$($sa.name)" `
        --project="$PROJECT_ID" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "    $($sa.id) already exists (or error)" }
}

# ---------------------------------------------------------------------------
# 2. Bind roles
# ---------------------------------------------------------------------------
$bindings = @(
    @{ sa = "api-sa";    roles = @(
        "roles/storage.objectAdmin",
        "roles/datastore.user",
        "roles/pubsub.publisher",
        "roles/secretmanager.secretAccessor",
        "roles/logging.logWriter",
        "roles/aiplatform.user"
    )},
    @{ sa = "worker-sa"; roles = @(
        "roles/storage.objectAdmin",
        "roles/datastore.user",
        "roles/secretmanager.secretAccessor",
        "roles/logging.logWriter",
        "roles/aiplatform.user",
        "roles/pubsub.subscriber"
    )},
    @{ sa = "cicd-sa";   roles = @(
        "roles/artifactregistry.writer",
        "roles/run.admin",
        "roles/cloudbuild.builds.editor",
        "roles/iam.serviceAccountUser"
    )}
)

foreach ($binding in $bindings) {
    $saEmail = "$($binding.sa)@${PROJECT_ID}.iam.gserviceaccount.com"
    Write-Host "==> Binding roles for $($binding.sa) ($saEmail)..."

    foreach ($role in $binding.roles) {
        Write-Host "    $role"
        & gcloud.cmd projects add-iam-policy-binding $PROJECT_ID `
            --member="serviceAccount:${saEmail}" `
            --role="$role" `
            --condition=None `
            --quiet 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    WARNING: Failed to bind $role" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "==> IAM setup complete."
Write-Host "    api-sa:    api-sa@${PROJECT_ID}.iam.gserviceaccount.com"
Write-Host "    worker-sa: worker-sa@${PROJECT_ID}.iam.gserviceaccount.com"
Write-Host "    cicd-sa:   cicd-sa@${PROJECT_ID}.iam.gserviceaccount.com"
