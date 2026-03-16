# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src

# Copy worker package
COPY apps/worker/package.json apps/worker/
COPY apps/worker/tsconfig.json apps/worker/
COPY apps/worker/src apps/worker/src

# Install all dependencies (workspaces resolve shared link)
RUN npm ci --ignore-scripts

# Build shared package first, then worker
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/worker

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy shared package (built)
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Copy worker package.json for prod install
COPY --from=build /app/apps/worker/package.json apps/worker/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled worker code
COPY --from=build /app/apps/worker/dist apps/worker/dist

EXPOSE 8080

CMD ["node", "apps/worker/dist/index.js"]
