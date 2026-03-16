#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# deploy.sh — Deploy latest images to Cloud Run
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Deploy ===${NC}"

# --- Read values from Terraform outputs ---
AR_PATH=$(terraform -chdir=infra/terraform output -raw artifact_registry_path)
REGION=$(terraform -chdir=infra/terraform output -raw region)
PROJECT_ID=$(terraform -chdir=infra/terraform output -raw project_id)

if [ -z "$AR_PATH" ] || [ -z "$REGION" ] || [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: Could not read Terraform outputs.${NC}"
  echo "Have you run 'scripts/bootstrap.sh' first?"
  exit 1
fi

API_IMAGE="${AR_PATH}/api:latest"
WORKER_IMAGE="${AR_PATH}/worker:latest"
WEB_IMAGE="${AR_PATH}/web:latest"

# --- Deploy API service ---
echo -e "${YELLOW}Deploying API service...${NC}"
gcloud run deploy api-service \
  --image "$API_IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --quiet

# --- Deploy Worker service ---
echo -e "${YELLOW}Deploying Worker service...${NC}"
gcloud run deploy worker-service \
  --image "$WORKER_IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --quiet

# --- Deploy Web service ---
echo -e "${YELLOW}Deploying Web service...${NC}"
gcloud run deploy web-service \
  --image "$WEB_IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --port 8080 \
  --allow-unauthenticated \
  --quiet

# --- Print service URLs ---
API_URL=$(terraform -chdir=infra/terraform output -raw api_service_url)
WORKER_URL=$(terraform -chdir=infra/terraform output -raw worker_service_url)
WEB_URL=$(gcloud run services describe web-service --region "$REGION" --project "$PROJECT_ID" --format="value(status.url)")

echo -e "${GREEN}=== Deploy complete ===${NC}"
echo -e "API service:    ${API_URL}"
echo -e "Worker service: ${WORKER_URL}"
echo -e "Web service:    ${WEB_URL}"
