#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-iam.sh — Create IAM service accounts and role bindings via gcloud
# Mirrors infra/terraform/iam.tf
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-deep-hook-468814-t7}"
echo "==> Using project: ${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 1. Create Service Accounts
# ---------------------------------------------------------------------------
echo "==> Creating service accounts..."

gcloud iam service-accounts create api-sa \
  --display-name="API Service Account" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "    api-sa already exists"

gcloud iam service-accounts create worker-sa \
  --display-name="Worker Service Account" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "    worker-sa already exists"

gcloud iam service-accounts create cicd-sa \
  --display-name="CI/CD Service Account" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "    cicd-sa already exists"

# ---------------------------------------------------------------------------
# 2. API Service Account — Role Bindings
# ---------------------------------------------------------------------------
echo "==> Binding roles for api-sa..."

API_SA="api-sa@${PROJECT_ID}.iam.gserviceaccount.com"

API_ROLES=(
  "roles/storage.objectAdmin"
  "roles/datastore.user"
  "roles/pubsub.publisher"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/aiplatform.user"
)

for role in "${API_ROLES[@]}"; do
  echo "    ${role}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${API_SA}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

# ---------------------------------------------------------------------------
# 3. Worker Service Account — Role Bindings
# ---------------------------------------------------------------------------
echo "==> Binding roles for worker-sa..."

WORKER_SA="worker-sa@${PROJECT_ID}.iam.gserviceaccount.com"

WORKER_ROLES=(
  "roles/storage.objectAdmin"
  "roles/datastore.user"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/aiplatform.user"
  "roles/pubsub.subscriber"
)

for role in "${WORKER_ROLES[@]}"; do
  echo "    ${role}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${WORKER_SA}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

# ---------------------------------------------------------------------------
# 4. CI/CD Service Account — Role Bindings
# ---------------------------------------------------------------------------
echo "==> Binding roles for cicd-sa..."

CICD_SA="cicd-sa@${PROJECT_ID}.iam.gserviceaccount.com"

CICD_ROLES=(
  "roles/artifactregistry.writer"
  "roles/run.admin"
  "roles/cloudbuild.builds.editor"
  "roles/iam.serviceAccountUser"
)

for role in "${CICD_ROLES[@]}"; do
  echo "    ${role}"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${CICD_SA}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

echo ""
echo "==> IAM setup complete."
echo "    api-sa:    ${API_SA}"
echo "    worker-sa: ${WORKER_SA}"
echo "    cicd-sa:   ${CICD_SA}"
