# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src

# Copy api package
COPY apps/api/package.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src

# Install all dependencies (workspaces resolve shared link)
RUN npm ci --ignore-scripts

# Build shared package first, then api
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/api

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy shared package (built)
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist

# Copy api package.json for prod install
COPY --from=build /app/apps/api/package.json apps/api/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled api code
COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
