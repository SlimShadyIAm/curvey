# Curvey

An invite-only browser curve-survival game. Desktop FFA for 2–8 players first, designed to grow toward 32.

## Project context

Start with [AGENTS.md](AGENTS.md) for the session contract and [STATUS](docs/STATUS.md) for current progress. [PRODUCT](PRODUCT.md), [DESIGN](DESIGN.md), [PLAN](docs/PLAN.md), [ARCHITECTURE](docs/ARCHITECTURE.md), [RESEARCH](docs/RESEARCH.md) and [DECISIONS](docs/DECISIONS.md) preserve the approved direction.

## Run locally

Requires Node.js 22+ and Corepack (developed with Node 24). From this directory:

```sh
corepack pnpm install
corepack pnpm dev
```

Open **http://localhost:5173**. Create a private room, then open its invite in another browser profile/incognito window. Enter a second name, ready both players, and start from the host browser. There are no bots or single-player mode.

The web development server uses port 5173; the game server uses 2567. For another computer on your LAN, use the host computer’s LAN address, and permit both ports through its firewall. An invite containing `localhost` only works on the host computer.

**Implemented now:** None-mode FFA, invite rooms, ready checks, authoritative trails/collisions/scoring, round transitions, chat, host transfer/kick, and configurable steering keys. Powerups and the other four presets are upcoming. This is a development slice, not the finished release.

## Checks

```sh
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm test
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

Playwright starts development servers if needed. Its production smoke test is opt-in; see [development notes](docs/DEVELOPMENT.md).

## Run the compiled app

```sh
corepack pnpm build
corepack pnpm --filter @curvey/server start
```

Open **http://localhost:2567**. The compiled server serves the built web client and handles same-origin game connections. `PORT` and `HOST` configure listening; `VITE_SERVER_URL` optionally selects a separate game endpoint at web build time. No deployment or production hosting is configured yet.

## Run with Docker

Build and start the production image:

```sh
docker compose up --build -d
curl http://127.0.0.1:2567/api/health
```

Open **http://localhost:2567**. Compose publishes the application only on the host loopback interface so a production host can put Nginx, Caddy, or another TLS/WebSocket-capable reverse proxy in front of it. Set `CURVEY_PORT` if port 2567 is already occupied:

```sh
CURVEY_PORT=2568 docker compose up --build -d
```

Use `docker compose logs -f curvey` for logs and `docker compose down` to stop it. Rooms are in memory; rebuilding or restarting the container ends active matches.

### Caddy reverse proxy

When Caddy runs on the same host, point the public domain at the loopback-bound Compose port:

```caddyfile
curvey.example.com {
    reverse_proxy 127.0.0.1:2567
}
```

Caddy obtains HTTPS certificates and proxies WebSocket upgrades automatically. Keep ports 80 and 443 open publicly; do not expose port 2567. After changing the Caddyfile, validate and reload it with the commands appropriate to your Caddy installation.
