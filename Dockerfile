# https://pnpm.io/docker#example-2-build-multiple-docker-images-in-a-monorepo
#
# Dev usage (with hot-reload via volume mounts):
#   docker compose up -d core
#
# Production usage:
#   docker build . -f Dockerfile --target production -t ufabc-next-backend

ARG NODE_VERSION="24.12.0"

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.33.3

# Necessary for turborepo
RUN apk add --no-cache libc6-compat

# =============================================================================
# Dev stage — full workspace install for local development
# -----------------------------------------------------------------------------
# Source directories are mounted at runtime (see docker-compose.yml) so
# tsx --watch picks up edits in both apps/core/src and packages/*/src.
# =============================================================================
FROM base AS dev
WORKDIR /app

# Copy workspace config first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./

# Copy entire repo (respects .dockerignore). At runtime docker-compose mounts
# overlay the copied source, giving hot-reload while keeping node_modules intact.
COPY . .

# Install everything including devDependencies (tsx, types, etc.)
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/core
EXPOSE 5000
CMD ["node", "--import=tsx", "--watch", "--no-warnings", "--env-file=.env.dev", "src/server.ts"]

# =============================================================================
# Build stage — installs deps and deploys self-contained production package
# -----------------------------------------------------------------------------
# `pnpm deploy` copies only the files needed by @next/core (respecting
# each package's "files" field) and produces a flat, portable /prod/core tree.
# =============================================================================
FROM base AS build
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY . .

RUN pnpm install --frozen-lockfile

# Deploy app (no compilation step — TypeScript is executed directly via tsx)
RUN pnpm deploy --filter=@next/core --prod --ignore-scripts /prod/core

# =============================================================================
# Production stage — minimal runtime image
# =============================================================================
FROM base AS production

# Git secret environment variables
ARG GIT_SECRET_PRIVATE_KEY
ENV GIT_SECRET_PRIVATE_KEY=$GIT_SECRET_PRIVATE_KEY

ARG GIT_SECRET_PASSWORD
ENV GIT_SECRET_PASSWORD=$GIT_SECRET_PASSWORD

# Install git and git-secret for env decryption
RUN apk add --no-cache git && \
    sh -c "echo 'https://gitsecret.jfrog.io/artifactory/git-secret-apk/latest-stable/main'" >> /etc/apk/repositories && \
    wget -O /etc/apk/keys/git-secret-apk.rsa.pub 'https://gitsecret.jfrog.io/artifactory/api/security/keypair/public/repositories/git-secret-apk' && \
    apk add --update --no-cache git-secret

RUN git init && \
    git config --global --add safe.directory /app

# Create non-root user
RUN addgroup --system --gid 1001 backend && \
    adduser --system --uid 1001 core

WORKDIR /app

# Create directories with proper permissions
RUN mkdir -p logs /pnpm && chown -R core:backend logs /pnpm

# Copy the deployed, self-contained application
COPY --chown=core:backend --from=build /prod/core .

# Copy git-secret files for env decryption
COPY --chown=core:backend .env.prod.secret .
COPY --chown=core:backend .gitsecret ./.gitsecret

# Decrypt .env.prod file
RUN echo "$GIT_SECRET_PRIVATE_KEY" >> ./private-container-file-key && \
    gpg --batch --yes --pinentry-mode loopback --import ./private-container-file-key && \
    git secret reveal -p ${GIT_SECRET_PASSWORD} && \
    rm -f ./private-container-file-key && \
    chown core:backend .env.prod

USER core

EXPOSE 5000

CMD ["node", "--import=tsx", "--env-file=.env.prod", "src/server.ts"]
