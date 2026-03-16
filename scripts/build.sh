#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build.sh — Build and push Docker images to Artifact Registry
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Build ===${NC}"

# --- Read Artifact Registry path from Terraform output ---
AR_PATH=$(terraform -chdir=infra/terraform output -raw artifact_registry_path)

if [ -z "$AR_PATH" ]; then
  echo -e "${RED}Error: Could not read artifact_registry_path from Terraform outputs.${NC}"
  echo "Have you run 'scripts/bootstrap.sh' first?"
  exit 1
fi

echo -e "${YELLOW}Artifact Registry: ${AR_PATH}${NC}"

# --- Configure Docker for Artifact Registry ---
REGION=$(terraform -chdir=infra/terraform output -raw region)
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# --- Build API image (root context for monorepo) ---
echo -e "${YELLOW}Building API image...${NC}"
docker build -t "${AR_PATH}/api:latest" -f apps/api/Dockerfile .

# --- Build Worker image (root context for monorepo) ---
echo -e "${YELLOW}Building Worker image...${NC}"
docker build -t "${AR_PATH}/worker:latest" -f apps/worker/Dockerfile .

# --- Build Web image (root context for monorepo) ---
echo -e "${YELLOW}Building Web image...${NC}"
docker build -t "${AR_PATH}/web:latest" -f apps/web/Dockerfile .

# --- Push images ---
echo -e "${YELLOW}Pushing API image...${NC}"
docker push "${AR_PATH}/api:latest"

echo -e "${YELLOW}Pushing Worker image...${NC}"
docker push "${AR_PATH}/worker:latest"

echo -e "${YELLOW}Pushing Web image...${NC}"
docker push "${AR_PATH}/web:latest"

echo -e "${GREEN}=== Build complete ===${NC}"
echo -e "API image:    ${AR_PATH}/api:latest"
echo -e "Worker image: ${AR_PATH}/worker:latest"
echo -e "Web image:    ${AR_PATH}/web:latest"
