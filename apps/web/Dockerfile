# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json ./

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src

# Copy web package config files
COPY apps/web/package.json apps/web/
COPY apps/web/tsconfig.json apps/web/
COPY apps/web/index.html apps/web/
COPY apps/web/vite.config.ts apps/web/
COPY apps/web/tailwind.config.js apps/web/
COPY apps/web/postcss.config.js apps/web/

# Copy web source
COPY apps/web/src apps/web/src

# Install all dependencies (workspaces resolve shared link)
RUN npm ci --ignore-scripts

# Build shared package first, then web (Vite build)
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/web

# ---- Production stage ----
FROM nginx:alpine

# Copy custom nginx config for SPA routing on port 8080
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
