# ──────────────────────────────────────────────────────────────
# Dockerfile — Builds the Bun chess game server
#
# WHAT THIS DOES:
#   1. Starts from an official Bun image (Linux + Bun pre-installed)
#   2. Copies our workspace package.json files
#   3. Installs all dependencies
#   4. Copies our source code
#   5. Starts the server with Bun
#
# HOW TO BUILD:
#   docker build -t chess-server .
#
# HOW TO RUN:
#   docker run -p 3001:3001 chess-server
# ──────────────────────────────────────────────────────────────

# ─── STAGE: Base Image ─────────────────────────────────────────
# "FROM" picks a pre-configured Linux environment.
# oven/bun:1-alpine = Bun runtime on Alpine Linux (tiny ~50MB OS)
# Alpine is a minimal Linux distro — keeps our image small.
FROM oven/bun:1-alpine

# ─── Set Up Working Directory ──────────────────────────────────
# All following commands will run inside /app in the container.
# Like doing: mkdir -p /app && cd /app
WORKDIR /app

# ─── Copy Package Files First (Layer Caching Trick) ────────────
# WHY SEPARATE FROM SOURCE CODE?
# Docker caches each step (layer). If package.json hasn't changed,
# Docker skips the "bun install" step on rebuild — saving minutes.
# We only re-install when dependencies actually change.

# Root workspace configuration
# NOTE: We only copy package.json (which has "workspaces" field), NOT
# pnpm-workspace.yaml. Bun uses the package.json workspaces field for
# native resolution. Copying pnpm-workspace.yaml causes Bun to create
# pnpm-style symlinks that point to the wrong location.
COPY package.json .
COPY turbo.json .

# Server package.json
COPY apps/server/package.json apps/server/

# Shared workspace packages that the server imports from
COPY packages/chess-engine/package.json packages/chess-engine/
COPY packages/shared/package.json packages/shared/

# ─── Install Dependencies ─────────────────────────────────────
# Bun reads the workspace configuration and installs everything.
# NOTE: The project uses pnpm locally, but Bun handles workspace
# installs fine. For production, you'd want to commit a bun.lock
# file for fully deterministic builds (exact same versions every time).
RUN bun install

# ─── Copy Source Code ──────────────────────────────────────────
# Now copy the actual source files.
# This is AFTER install so that code changes don't trigger
# a full dependency reinstall (the expensive part).

# Server source code
COPY apps/server/ apps/server/

# Workspace packages the server depends on
COPY packages/chess-engine/ packages/chess-engine/
COPY packages/shared/ packages/shared/

# Root TypeScript config (needed for path resolution)
COPY tsconfig.base.json .

# ─── Document the Port ─────────────────────────────────────────
# EXPOSE doesn't actually open the port — it's documentation.
# You still need "ports:" in docker-compose or "-p" in docker run.
# The server listens on 3001 (HTTP + WebSocket).
EXPOSE 3001

# ─── Start the Server ─────────────────────────────────────────
# CMD is what runs when the container starts.
# If this process crashes, the container stops.
CMD ["bun", "run", "apps/server/src/index.ts"]
