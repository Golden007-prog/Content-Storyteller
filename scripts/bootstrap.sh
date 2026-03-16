#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# bootstrap.sh — Initialize GCP project, authenticate, and provision infra
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Bootstrap ===${NC}"

# --- Check required CLI tools ---
MISSING=()
for cmd in gcloud terraform docker; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
  echo -e "${RED}Error: Missing required CLI tools: ${MISSING[*]}${NC}"
  echo "Please install them before running this script."
  exit 1
fi

echo -e "${GREEN}✓ All required CLI tools found${NC}"

# --- Authenticate ---
echo -e "${YELLOW}Authenticating with Google Cloud...${NC}"
gcloud auth login
gcloud auth application-default login

# --- Set project ---
if [ -z "${GCP_PROJECT_ID:-}" ]; then
  echo -e "${YELLOW}GCP_PROJECT_ID not set. Reading from .env or prompting...${NC}"
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    source .env
  fi
fi

if [ -z "${GCP_PROJECT_ID:-}" ]; then
  read -rp "Enter your GCP Project ID: " GCP_PROJECT_ID
fi

echo -e "${YELLOW}Setting project to ${GCP_PROJECT_ID}...${NC}"
gcloud config set project "$GCP_PROJECT_ID"

# --- Terraform init + apply ---
echo -e "${YELLOW}Initializing Terraform...${NC}"
terraform -chdir=infra/terraform init

echo -e "${YELLOW}Applying Terraform configuration...${NC}"
terraform -chdir=infra/terraform apply -var="project_id=${GCP_PROJECT_ID}"

echo -e "${GREEN}=== Bootstrap complete ===${NC}"
