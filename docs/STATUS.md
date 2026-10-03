# Project status

Updated: 2026-10-03.

## Current state: first playable None-mode slice

The repository began empty. Durable product/research/architecture docs and a working TypeScript workspace now exist. The full launch plan is not complete.

Implemented:

- Pure 60Hz engine: seeded spawning/gaps, continuous steering, spatial trail index, swept capsule collisions, simultaneous head contacts, survival scoring, reset/winner logic.
- Colyseus server: cryptographically random private room IDs, guest admission, unique room colors, ready/start, capacity/target controls, frozen match roster, countdown/results/rematch transitions.
- Explicit authoritative game snapshots and ordered trail increments at 60Hz. Late arrivals receive no live arena state.
- Lobby/between-round chat, local mute, host kick and host transfer. Detected departures eliminate players; dropped sessions reserve their seat for 15 seconds through Colyseus reconnection.
- React competitive shell, lazy-loaded Pixi arena, raster-cached confirmed trails, frame-rate trail tips, local prediction/reconciliation and buffered remote heads. Original SVG entry illustration is labeled as an illustration, not a live match.
- Name/color preferences and key remapping, keyboard controls/blur release, reduced-motion styling, responsive entry/lobby, actionable error states.
- Compiled server serves compiled web assets and supports same-origin connections.
- Production multi-stage Docker image and Compose service: frozen-lockfile build, production dependency deploy, non-root/read-only runtime, loopback-only published port, and HTTP health check.
- Local Git repository initialized on the `main` branch; no commits or remotes have been created.

## Verification

- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: 16 engine/geometry/presentation tests passed.
- `corepack pnpm build`: passed for web and compiled server. Pixi is loaded only when needed; initial bundle is approximately 470kB minified / 145kB gzip. Upstream Zod PURE-annotation warnings remain non-blocking.
- Docker configuration was added and its Compose model was validated. Formatting, typecheck, all 16 unit tests, and the production build passed. A full image build was attempted but could not run because the local Docker daemon was unavailable; image assembly and its health check remain to be verified on a Docker host.
- Clock-fix verification: all 6 integration tests passed including compiled-server smoke. Gameplay-tuning verification: unit tests, typecheck and build passed; 5 integration checks passed; the optional compiled-server smoke was skipped on this rerun. Arena screenshot inspected. Timing remained 60.22 ticks/s with 2.99s / 5.01s countdowns.
- Browser scenarios: two independent contexts create/join, exchange chat, ready/start, render actual canvases, steer, process departure scoring, transfer host; late arrival has no canvas; host kick displays the correct reason; invalid invite feedback; production build creates a room.
- Screenshots inspected at 1440×1000, 1024×768 and 390×844: entry, live match and responsive layout. Corrected desktop arena height to keep the field visible. No horizontal overflow on narrow entry screen. Desktop full-page content may scroll, but the live field fits its viewport.
- Corrected a Colyseus input-property naming collision, Corepack command portability, shared-package production bundling, and use of a framework-reserved close code for kicks.

## Current gameplay tuning

User feedback and a supplied reference screenshot prompted a slower pace and larger world: speed 72 units/s (down 20%), minimum map width 600 (previous two-player width 360), eight-player width 900 (previous 720). Two-player empty-field crossing time is now about 8.3 seconds versus 4 seconds. Turn radius and trail thickness in world units remain unchanged; trails appear finer relative to the enlarged field. This tuning is not a measured reference-speed match. Refresh all players and start a new room for protocol v4 / ruleset v3.

## Clock correction and 60Hz

A second user report exposed a server clock defect missed by the earlier input-response test. Colyseus started a clock-only timer when patches were disabled before simulation initialization; that timer stole elapsed time from the fixed-step accumulator. Disabling patches again after starting simulation removes the conflicting timer. Both authoritative simulation and game/geometry publication now run at 60Hz, using shared TICK_RATE for three-second start and five-second results countdowns. Ruleset v3 / protocol v4 require all players to refresh.

A direct two-SDK-client timing regression measured 60.35–60.70 authoritative ticks/s, 2.98–3.00s start countdown and 4.99–5.02s results interval. It measures independently of renderer startup and checks seconds against a monotonic clock. Eight-player/long-round bandwidth and CPU costs at the increased rate remain unmeasured.

## Earlier responsiveness fix

Local steering now predicts immediately using shared movement math, then reconciles applied server acknowledgments. Protocol v4 includes bounded target ticks; refresh both players after this update. Remote presentation uses RTT-aware interpolation with a jitter allowance. Heads and active trail tips update on every display frame; completed geometry is raster-cached, and React HUD updates are limited to 5Hz or meaningful state changes.

With an artificial 100ms delay in each network direction, the Chromium diagnostic measured input-to-presented-heading delay dropping from 223.2ms to 0.6–5.1ms across successful post-fix runs (next-frame timing). Median frame interval was 16.7ms, p95 about 17.4ms. This measures browser presentation state, not physical display latency, and is not a cross-hardware guarantee. The new regression test requires a response within 80ms under that 200ms round trip.

## Run / handoff

`corepack pnpm dev`, then open http://localhost:5173. The development servers were left running at the end of this session; if they are gone, rerun the command. Temporary production smoke-test server on 2568 was stopped. Use two independent browser contexts and share the room invite. See README and DEVELOPMENT for all commands.

## Next concrete work, in order

1. Finish fidelity/correctness checks before adding effects: gap-wall behavior, corner semantics, collision tolerance, and same-tick newly deposited/dead-trail contacts. Extend geometry tests for those cases.
2. Implement a shared effect registry and the 12 approved effects; add Basic, Thin, Corner and Thorner selectors only when each works. Preserve fixed preset mechanics.
3. Extend the implemented base-movement prediction to effect-modified movement as effects land. Validate extreme jitter and reconciliation behavior.
4. Harden sync and lifecycle: bound outbound queues/baseline requests, test abrupt-network reconnection and rematches, restore sessions across refresh if desired. Review automatic target recalculation when queued members enter the next match.
5. Test eight-player/long-round/concurrent-room load and Firefox/Safari/Edge. Measure actual capacity before hosting or raising the player cap. Validate the production image on a Debian host and add graceful draining before treating hosted deployment as hardened.

## Known limits and scope reminders

- Only None mode exists. No powerups, accounts, public discovery, teams, shared keyboard, dedicated spectator slots or recordings.
- Two-player behavior is browser-tested; the 2–8 admission limit is implemented but eight-player performance is unmeasured. 32-player capacity remains an architectural target.
- Segment storage uses ordinary arrays rather than final typed-array chunks. Initial same-tick collision handling is not yet certified for high-speed effects.
- Gap immunity keeps walls solid provisionally. Do not claim exact Curve Crash parity.
- Auto reconnect code exists, but abrupt-network recovery has not been browser-tested; full refresh does not restore the guest seat.
- Full match-to-target/rematch endurance, context-loss recovery, screen-reader behavior and cross-browser coverage remain unverified.
- No database, hosted service, deployment credentials, production rate/backpressure hardening, or operational performance claims. Git is initialized locally, but there are no commits or configured remotes yet.
