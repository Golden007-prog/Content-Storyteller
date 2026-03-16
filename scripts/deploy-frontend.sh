#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# deploy-frontend.sh — Build and deploy frontend to GitHub Pages
# ---------------------------------------------------------------------------
# Usage:
#   VITE_API_URL=https://api-service-xxx-uc.a.run.app \
#   VITE_BASE_PATH=/Content-Storyteller/ \
#   bash scripts/deploy-frontend.sh
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Deploy Frontend (GitHub Pages) ===${NC}"

# --- Validate required env vars ---
if [ -z "${VITE_API_URL:-}" ]; then
  echo -e "${RED}Error: VITE_API_URL is required (your Cloud Run API URL).${NC}"
  echo "Example: VITE_API_URL=https://api-service-xxxxx-uc.a.run.app bash scripts/deploy-frontend.sh"
  exit 1
fi

VITE_BASE_PATH="${VITE_BASE_PATH:-/}"

echo -e "${YELLOW}API URL:   ${VITE_API_URL}${NC}"
echo -e "${YELLOW}Base path: ${VITE_BASE_PATH}${NC}"

# --- Build shared package ---
echo -e "${YELLOW}Building shared package...${NC}"
npm run build --workspace=packages/shared

# --- Build frontend with production env vars ---
echo -e "${YELLOW}Building frontend...${NC}"
VITE_API_URL="$VITE_API_URL" VITE_BASE_PATH="$VITE_BASE_PATH" npm run build --workspace=apps/web

# --- Add 404.html and .nojekyll for SPA routing on GitHub Pages ---
cp apps/web/dist/index.html apps/web/dist/404.html
touch apps/web/dist/.nojekyll

echo -e "${GREEN}=== Frontend build complete ===${NC}"
echo -e "Output: apps/web/dist/"
echo ""
echo -e "${YELLOW}To deploy to GitHub Pages, push the dist folder to the gh-pages branch:${NC}"
echo ""
echo "  npx gh-pages -d apps/web/dist"
echo ""
echo "Or configure GitHub Actions to do it automatically."
