#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# deploy-backend.sh — Build and deploy API + Worker to Cloud Run
# ---------------------------------------------------------------------------
# Usage:
#   bash scripts/deploy-backend.sh
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - Docker installed
#   - Terraform applied (infra/terraform)
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Deploy Backend ===${NC}"

# --- Read config ---
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
AR_REPO="content-storyteller"
AR_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: GCP_PROJECT_ID not set and no default project configured.${NC}"
  exit 1
fi

echo -e "${YELLOW}Project:  ${PROJECT_ID}${NC}"
echo -e "${YELLOW}Region:   ${REGION}${NC}"
echo -e "${YELLOW}Registry: ${AR_PATH}${NC}"

# --- Configure Docker for Artifact Registry ---
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# --- Build and push API ---
echo -e "${YELLOW}Building API image...${NC}"
docker build -t "${AR_PATH}/api:latest" -f apps/api/Dockerfile .
echo -e "${YELLOW}Pushing API image...${NC}"
docker push "${AR_PATH}/api:latest"

# --- Build and push Worker ---
echo -e "${YELLOW}Building Worker image...${NC}"
docker build -t "${AR_PATH}/worker:latest" -f apps/worker/Dockerfile .
echo -e "${YELLOW}Pushing Worker image...${NC}"
docker push "${AR_PATH}/worker:latest"

# --- Deploy API to Cloud Run ---
echo -e "${YELLOW}Deploying API service...${NC}"
gcloud run deploy api-service \
  --image "${AR_PATH}/api:latest" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --quiet

# --- Deploy Worker to Cloud Run ---
echo -e "${YELLOW}Deploying Worker service...${NC}"
gcloud run deploy worker-service \
  --image "${AR_PATH}/worker:latest" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --quiet

# --- Print results ---
API_URL=$(gcloud run services describe api-service --region "$REGION" --project "$PROJECT_ID" --format="value(status.url)")
WORKER_URL=$(gcloud run services describe worker-service --region "$REGION" --project "$PROJECT_ID" --format="value(status.url)")

echo -e "${GREEN}=== Backend Deploy Complete ===${NC}"
echo -e "API service:    ${API_URL}"
echo -e "Worker service: ${WORKER_URL}"
echo ""
echo -e "${YELLOW}Next: Use the API URL above as VITE_API_URL when deploying the frontend:${NC}"
echo "  VITE_API_URL=${API_URL} bash scripts/deploy-frontend.sh"
