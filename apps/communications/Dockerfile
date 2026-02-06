FROM node:24.9.0-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  wget \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
  wget \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*


RUN apt-get update && apt-get install vim

WORKDIR /app

USER root

RUN rm -rf tokens


RUN npm add -g pnpm
# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Run TypeScript directly with tsx
# CMD ["pnpm", "dev"]
