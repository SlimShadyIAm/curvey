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
- Git repository initialized on `main` and tracking its configured GitHub remote.

## Verification

- `corepack pnpm typecheck`: passed.
- Latest unit run: 18 of 19 passed; the gap-boundary assertion still expected the old speed's third tick. Updated it to tick two for 94.38 units/s, without rerunning at the user's request.
- `corepack pnpm build`: passed for web and compiled server. Pixi is loaded only when needed; initial bundle is approximately 470kB minified / 145kB gzip. Upstream Zod PURE-annotation warnings remain non-blocking.
- Docker configuration was added and its Compose model was validated. Formatting, typecheck, all 16 unit tests, and the production build passed. A full image build was attempted but could not run because the local Docker daemon was unavailable; image assembly and its health check remain to be verified on a Docker host.
- Docker dependency assembly no longer uses pnpm's legacy `deploy`, which re-resolved Colyseus's unused optional uWebSockets transport and failed in the slim image because Git was absent. A frozen-lockfile, production-only dependency stage now supplies the runtime tree without that second resolution; VPS image rebuild verification is pending.
- Arena/pace refinement verification: formatting, typecheck, all 16 unit tests, production build, and all three two-browser game/responsive scenarios passed. The 1440×1000 live-match screenshot was inspected: the 60px larger square remains fully visible with its heading and controls, and does not overlap the room rail or footer.
- Clock-fix verification: all 6 integration tests passed including compiled-server smoke. Gameplay-tuning verification: unit tests, typecheck and build passed; 5 integration checks passed; the optional compiled-server smoke was skipped on this rerun. Arena screenshot inspected. Timing remained 60.22 ticks/s with 2.99s / 5.01s countdowns.
- Browser scenarios: two independent contexts create/join, exchange chat, ready/start, render actual canvases, steer, process departure scoring, transfer host; late arrival has no canvas; host kick displays the correct reason; invalid invite feedback; production build creates a room.
- Screenshots inspected at 1440×1000, 1024×768 and 390×844: entry, live match and responsive layout. Corrected desktop arena height to keep the field visible. No horizontal overflow on narrow entry screen. Desktop full-page content may scroll, but the live field fits its viewport.
- Corrected a Colyseus input-property naming collision, Corepack command portability, shared-package production bundling, and use of a framework-reserved close code for kicks.

## Current gameplay tuning

The larger world remains: minimum map width 600 and eight-player width 900. Two successive requested 10% increases take speed from 78 to 94.38 units/s, for a two-player empty-field crossing time of about 6.4 seconds. Turn radius and trail thickness remain unchanged. Desktop rooms now use the full window width with 24px side insets, a 48px header, a 280px room rail, and a square arena capped at viewport height minus 132px. Entry and mobile layouts retain their existing structure. This tuning is not a measured reference-speed match. Refresh all players and start a new room for protocol v5 / ruleset v5.

## Latest responsiveness correction

Snapshot arrivals previously moved the presentation clock by up to half a tick, turning packet jitter into visible movement jitter. Local and remote clocks now correct their rates within ±5% without those per-packet steps. Remote timing is independent of RTT sample changes. Client prediction now allows 16 ticks (267ms), targeting RTT plus one tick and reserving two ticks above the target, so 200ms RTT does not immediately pin new steering at the prediction limit. Server input scheduling and all collision/scoring authority remain unchanged.

Small reconciliation corrections now decay with a 60ms time constant, blending only speculative trail tips between confirmed geometry and the corrected head. New keyboard intent remains immediate; deaths and large corrections remain authoritative.

The three-second countdown now leads into a server-timed two-second stationary direction preview. Each player sees an arrow aligned to their own spawn heading before movement starts. Chat and steering remain disabled until play.

Verification: latest typecheck passed. All five enabled integration tests passed; optional production smoke was skipped. The delayed-network browser run measured 0.6ms to a changed presentation heading, 19.1ms median frame interval and 24.1ms p95; this is browser instrumentation, not physical display latency or a frame-rate guarantee. Authoritative timing measured 59.45Hz with a 2.99s countdown, 1.99s preview and 5.00s results interval. Inspected direction-preview and desktop/laptop arena screenshots; viewport checks passed at 2000×1250 and 1024×768. Nineteen unit tests passed before the final speed increase; the final run passed 18 with one outdated gap-tick expectation, now corrected without rerun. Production build passed before the last reconciliation/speed edits; its final rerun was prevented by that test failure. The user explicitly requested no further tests before pushing. Next verification: rerun units/build when requested, then measure extreme-jitter reconciliation and eight-player load. Long stalls still reach the prediction cap; large corrections can still move a head. Non-Chromium behavior remains unverified.

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
- No database, hosted service, deployment credentials, production rate/backpressure hardening, or operational performance claims.
