# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm-slim AS production-dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN corepack enable

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter @curvey/server... --prod --frozen-lockfile

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=2567
WORKDIR /app/apps/server

COPY --from=production-dependencies --chown=node:node /workspace/node_modules/ /app/node_modules/
COPY --from=production-dependencies --chown=node:node /workspace/apps/server/node_modules/ ./node_modules/
COPY --from=production-dependencies --chown=node:node /workspace/apps/server/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/server/dist/ ./dist/
COPY --from=build --chown=node:node /workspace/apps/web/dist/ /app/apps/web/dist/

USER node
EXPOSE 2567

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:2567/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "dist/index.js"]
