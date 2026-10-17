# Granite on a host (decision 0035). The host builds this file and runs it; nothing else is needed.
# Settings come from the host's environment settings (docs/hosting-settings.md), never from here.
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CI=1
RUN corepack enable
WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/rules/package.json packages/rules/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000
# tsx directly (not through pnpm), so the host's stop signal reaches the app.
CMD ["node_modules/.bin/tsx", "scripts/hosted-start.ts"]
