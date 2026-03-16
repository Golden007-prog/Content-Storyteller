#!/bin/bash
set -euo pipefail

# ---------------------------------------------------------------------------
# dev.sh — Start local development servers concurrently
# ---------------------------------------------------------------------------

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Content Storyteller — Dev ===${NC}"

# --- Load root .env if present ---
if [ -f .env ]; then
  echo -e "${YELLOW}Loading root .env...${NC}"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# --- Load per-app .env files if present ---
for app in apps/web apps/api apps/worker; do
  if [ -f "${app}/.env" ]; then
    echo -e "${YELLOW}Loading ${app}/.env...${NC}"
    set -a
    # shellcheck disable=SC1091
    source "${app}/.env"
    set +a
  fi
done

# --- Build shared package first ---
echo -e "${YELLOW}Building shared package...${NC}"
npm run build --workspace=packages/shared

# --- Start dev servers concurrently ---
echo -e "${GREEN}Starting dev servers...${NC}"

# Use npx concurrently if available, otherwise fall back to background processes
if npx --yes concurrently --version &>/dev/null 2>&1; then
  npx concurrently \
    --names "web,api,worker" \
    --prefix-colors "blue,green,yellow" \
    "npm run dev --workspace=apps/web" \
    "npm run dev --workspace=apps/api" \
    "npm run dev --workspace=apps/worker"
else
  echo -e "${YELLOW}concurrently not found, using background processes...${NC}"

  trap 'kill 0; exit' SIGINT SIGTERM

  npm run dev --workspace=apps/web &
  npm run dev --workspace=apps/api &
  npm run dev --workspace=apps/worker &

  wait
fi
