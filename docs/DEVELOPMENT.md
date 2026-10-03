# Development and verification

## Start

Use `corepack pnpm`, not an assumed global pnpm binary. The root package pins pnpm 10.15.1 and the lockfile pins resolved dependencies. Install with `corepack pnpm install` (`--frozen-lockfile` in CI).

`corepack pnpm dev` runs Vite on 5173 and Node/Colyseus on 2567. Create a room in one browser and join its link in an independent browser profile. Every player needs their own browser context. No account or database is needed.

For the production container, run `docker compose up --build -d`. The multi-stage image installs from the frozen lockfile, builds the web and server packages, deploys production server dependencies, and runs as the unprivileged `node` user. Compose binds port 2567 to `127.0.0.1` by default and includes a health check against `/api/health`; terminate TLS and proxy WebSocket upgrades with a host reverse proxy.

## Checks

- `corepack pnpm typecheck`: all TS source and tests.
- `corepack pnpm test`: geometry, simulation and client prediction tests.
- `corepack pnpm build`: web assets and compiled server, including shared workspace source.
- `corepack pnpm test:e2e`: independent-browser room and rendering tests in Chromium. Run `corepack pnpm exec playwright install chromium` first.
- To exercise the built application: start `PORT=2568 HOST=127.0.0.1 corepack pnpm --filter @curvey/server start`, then run `TEST_PRODUCTION_URL=http://127.0.0.1:2568 corepack pnpm test:e2e`.

Screenshots/traces are generated under ignored `test-results/`. They are temporary verification artifacts, not production match recordings. They may contain test invite identifiers and must stay untracked.

## Implementation map

`Match` in packages/sim is the pure engine. `GameRoom` schedules it and owns room state. The protocol package exports contracts and input validators. App binds room events to UI state; Arena retains confirmed trail data and renders through Pixi.

Current transport deliberately uses explicit messages rather than synchronized per-head Schema fields. `room` is low-frequency lobby/HUD state, `baseline` is full current geometry for roster members, `geometry` contains ordered append increments, and `game` contains authoritative heads and input acknowledgments. Protocol v4 input carries round, sequence and requested simulation tick IDs; acknowledgments identify applied commands. Refresh all players when updating this protocol. Late-arrival members receive room state only.

## Useful debugging boundaries

- Movement/scoring defects: add a focused headless engine scenario first.
- Join or room-state defects: reproduce with independent browser contexts.
- Visual trail mismatch: compare authoritative segment sequences before changing rendering interpolation.
- Graphics issues: inspect real screenshots and console errors, not only a passing DOM test.
- Scope/fidelity decisions: consult PRODUCT and RESEARCH; mark deliberate deviations.

## Current constraints

Only None mode is wired. No production recording or database. Runtime restart loses rooms. Browser reconnection uses Colyseus's automatic reconnect while the server holds the seat for 15 seconds; full page refresh currently creates a new guest session instead of restoring the seat. Do not represent this as complete reconnect coverage.

Host settings start at eight seats. Target score adjusts to 10 × (room members − 1), with a minimum default of ten, until the host explicitly changes it. Match rosters freeze at start; later arrivals wait. Rematches reset scores and require readiness again.

This initial engine uses ordinary segment arrays plus a spatial grid, not the final typed-array storage. It has swept capsule/static-trail tests and symmetric moving-head contacts at the base movement rate. It is not yet validated for every same-tick newly-deposited/dead-trail interaction or powerup speeds. Baseline wall behavior during gaps is explicitly provisional.

Base-movement local prediction and adaptive remote buffering are implemented. Extreme-jitter reconciliation, effect-aware prediction, outbound backpressure, load/capacity tests, and non-Chromium verification remain release gates. Do not deploy this development slice as a hardened public service.

## Responsiveness diagnostics

Open the development entry page with `?debug=1` before creating or joining a room. `window.__CURVEY_ARENA__` exposes recent frame intervals, renderer preparation durations, presented local head and authoritative tick. It is development-only, opt-in, and sends no telemetry. Preparation durations do not measure full GPU rendering time.

`tests/responsiveness.spec.ts` delays native game WebSocket traffic by 100ms each way, then measures keydown to a changed local heading on an animation frame. It also checks browser errors and reports median/p95 frame intervals. This is a presentation regression check, not an input-to-photon measurement.

`ArenaPresentation` replays unacknowledged steering with the shared fixed-step movement helper, including a fractional frame step. Prediction is capped at 12 ticks (200ms); remote extrapolation is capped at two ticks. Known gaps are presented, while collisions, scoring and random events remain server-authoritative. The server clamps requested input ticks to its next 12 ticks and acknowledges them on application. Confirmed geometry retains creation ticks so remote trail tips can follow the same presentation clock.

`tests/timing.spec.ts` uses two real SDK clients and monotonic elapsed time to check the three-second countdown, five-second results interval, and approximately 60 authoritative ticks per second. It bypasses canvas startup to avoid measuring renderer stalls as network cadence. The installed Colyseus version requires disabling patches again after fixed-step initialization to remove its previously created clock-only timer. Do not remove that ordering without running this regression.
