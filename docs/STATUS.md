# Project status

Updated: 2026-10-04.

## Current state: lobby bots, five presets and random power-ups

Implemented locally:

- Hosts can add/remove labelled, automatically ready bots before matches and rematches. One human can play against up to 23 bots within the 24-participant capacity. Server AI supplies steering; bots use normal collisions, pickups, scoring and public effect timers.

- Invite-only desktop FFA for 2–24 players; None, Basic, Thin, Corner and Thorner. New rooms default to Basic. Hosts choose preset, capacity and score target before a match; changes reset readiness and settings freeze at start.
- Twelve effects with original SVG icons, weighted seeded random drops, swept collection, independently expiring stacks, countdown halos around every affected player, a keyboard-accessible lobby legend, text timers and opponent effect badges. Server owns randomness, pickup races, collisions and scoring.
- Pure 60Hz simulation with time-ordered intra-tick events: effects change speed/width immediately; gap endings, flight landings, wraps and deaths resolve before equal-time pickups. Newly deposited and dead-player trails participate in collisions.
- Geometry generations and sequenced append/clear messages support Eraser, baseline replacement and reconnect. Every snapshot identifies its required geometry. Wrapping splits geometry instead of drawing a connector across the map.
- Shared effect-aware movement, local prediction/reconciliation, buffered remote heads, corner input-edge preservation, and cached confirmed Pixi trails. Predict only confirmed effects and known expiry; never predict pickup ownership or collision outcomes.
- Guest names/colors, remappable controls, readiness, three-second countdown, two-second stationary heading preview, survival scoring, results/rematches, host transfer/kick, lobby/results chat and local mute. Late arrivals wait without receiving arena state. Disconnects eliminate immediately when detected; reconnect reserves the seat for 15 seconds without resurrection.
- Compiled server serves web assets. Docker/Compose configuration exists; full Docker image assembly still needs a working daemon/host verification.

Protocol is **v8** and ruleset is **v11**. Refresh every browser and start new rooms after updating both server and client. No deployment was performed.

## Power-up rules selected for Curvey

See [POWERUPS](POWERUPS.md) for the catalogue/plan and [DECISIONS](DECISIONS.md) for durable semantics. These choices are not measured Curve Crash parity:

- First drop after four seconds; subsequent intervals are three seconds plus an exponential delay averaging five seconds (eight seconds total, 75% lower base rate). Bubbles accelerates this schedule as before. At most three ground pickups, twelve-second ground lifetime and ten-unit collection radius. Placement makes at most 24 attempts with local trail/head/wall clearance; it does not prove maze reachability.
- Numeric modifiers multiply, then effective values are bounded: speed ¼–8×, width ⅛–4×, radius ¼–4×, gap length up to 4×, Bubbles rate up to 9×. Every instance expires independently. Reverse never cancels itself.
- Gaps keep walls solid. Fly suppresses trails/body collisions and wraps at edges. Open Walls wraps without trail immunity. Corner turns once per nonzero input transition; holding does not repeat and both keys mean straight.
- Death wins equal-time pickup ties, including immunity expiry. Equal-time surviving collectors use a seeded draw over sorted identities. Simultaneous pickups apply by pickup ID. Heading is chosen once per fixed tick; newly collected speed/width apply to the remaining fraction, and steering/radius changes affect the next heading step.

## Latest change: slowdown affects opponents only

Both slowdown pickups now exclude their collector. The former self-targeted ten-second variant applies its half-speed/tighter-turn modifiers to opponents, with a matching opponent icon and description. The five-second variant already targeted opponents. Existing effects from other players are not removed by collecting a pickup.

Verification: **78 unit tests passed**, including explicit normal-speed collector checks for both variants. Type checking and production web/server builds passed. Protocol v8 / ruleset v11. Final targeted reruns passed all twelve pickups across two browsers (including slowdown recipients, Eraser, rings and reconnect), Corner with latency, and eight-client collection/scoring. The combined regression pass plus targeted fixes covers 13 passing browser/network scenarios; production smoke was skipped. Fixed narrow-screen color wrapping and made pickup checks assert lasting effects instead of expiring one-second cues.

## Previous change: 24 participants and another 15% speed increase

Raised default/maximum capacity to 24 for both humans and bots, shared across server validation and lobby controls. Added 24 unique assignable colors; existing roster scrolling and arena scaling support the larger roster. Base speed is now 124.81755 units/s (another 15%); shared prediction and AI use the same value. Protocol v8 / ruleset v10.

Verification: 76 unit tests, type checking and production builds passed. Two 24-seat integration/browser tests passed: 24 human SDK clients joined/started with unique colors and matching rosters, seat 25 was rejected, and a full bot lobby retained usable add/remove controls. Inspected the full-lobby Chromium screenshot. Dense 24-player long-round CPU, concurrent rooms and palette distinguishability need further playtesting; enabling 24 seats does not establish hosted capacity.

## Previous change: random starts with turning room

Each round now samples seeded random positions throughout the interior and independent full-circle headings, replacing the evenly spaced circle with inward headings. Wall clearance is at least 120 units; head separation is at least 150 units. Placement work is bounded, with a safely spaced shuffled-grid fallback. Existing authoritative direction preview shows the new headings.

Verification: **76 unit tests passed**, including clearance across 200 seeds at each supported room size (and the internal 32-player size), deterministic seeds/new rounds, heading/position variety, forced fallback, and simultaneous immediate left/right U-turn survival across 20 eight-player seeds. Type checking and production web/server builds passed. No rendering code changed; browser inspection was not rerun. Next: playtest opening encounters and bot choices at the new random starts. Initial clearance does not guarantee safety after players move toward each other.

## Previous change: 15% faster base movement

Base speed is now 108.537 units/s, up from 94.38. Authority, client prediction and bot forecasts share this value. The 35-unit turn radius makes angular turning speed scale accordingly. Ruleset is v8; protocol remains v7.

Verification: all **72 unit tests**, type checking and production web/server builds passed. Existing tests cover prediction, power-ups, collisions, bot avoidance and synthetic endurance. No UI code changed; browser checks were not rerun for this tuning. Next: playtest the faster pace with humans and bots; existing load and browser release gates remain.

## Previous change: playable lobby bots

Added host-only add/remove controls, capacity/color allocation, automatic bot readiness, and explicit protocol v7 bot identity. Bots never inherit host ownership. Server-side AI evaluates three steering choices at 10Hz, with a bounded forecast for walls, trails, nearby opponents, wrapping, known gaps and effect expiry; safe routes can favor pickups. Match simulation pauses when no human remains connected.

Verification: **72 unit tests passed**, including wall/trail avoidance, Reverse compensation, no authoritative-state mutation and better aggregate survival than straight-only steering across five seeded eight-player rounds. **Six browser/network checks passed**: three bot scenarios (solo lobby/gameplay, permissions/capacity/autonomous movement, human host transfer) and three existing multiplayer/UI regressions. Type checking and production web/server builds passed. Inspected lobby and live-match Chromium screenshots at 1440×1000.

Limitations: one heuristic difficulty; bots can make poor choices in tight spaces and do not know future random gaps or opponent inputs. Dense long-round bot CPU, cross-browser coverage and a complete bot rematch lifecycle remain follow-up verification. Next concrete work: playtest crowded mixed human/bot matches and tune decision quality from observed failures.

## Previous change: quieter drops and shared countdown halos

Implemented the user's spawn-rate reduction and public on-player timers. Every affected living player has a countdown halo visible in every client. Distinct effect kinds get separate sections with matching icons; stacked instances show a count and the next expiry. Sections drain smoothly against a shared authoritative clock, freeze during disconnect/results, and disappear when effects expire or the player dies. The existing text timers remain for precise duration labels. No protocol change was needed.

Verification for this change: **69 unit tests passed**, including normal spawn spacing/rate, independent ring expiry and clock freeze. All **3 power-up multiplayer tests passed**, covering both browsers' views, stacked/simultaneous ring expiry, reconnect, 200ms RTT with jitter and eight SDK clients. Type checking, production web/server build, formatting and diff checks passed. Inspected countdown-ring screenshots at 1440×1000 and 1024×768. Latest eight-player synthetic endurance under the quieter schedule: 85 rounds, peak 3,590 segments, two collections, 0.028ms p95 / 0.99ms maximum step on Apple M4. These remain synthetic checks, not hosted capacity measurements.

## Earlier full power-up implementation verification

- Initial full implementation unit run: **66 tests passed**, including all twelve targets/durations, stacking, high-speed collection, width history, pickup/death ties, gap/flight expiry, flight landing, Eraser, wrapping, corners, seeded drops, blocked placement and effect-aware prediction. Geometry sequencing and baseline tests passed.
- `corepack pnpm typecheck`, `corepack pnpm format:check` and `git diff --check`: passed.
- `corepack pnpm build`: passed for production web and server. Compiled-app room-creation smoke passed. Non-blocking upstream Zod PURE-annotation warnings remain.
- Deterministic two-browser Chromium scenario passed for all twelve pickups, matching collection/target state, Eraser generations and real disconnect/reconnect baseline recovery. The fixture is a separate loopback-only test entry point, absent from production imports.
- Initial full implementation browser/network run: **9 passed**, including room/chat/host transfer, late-arrival/kick, responsive entry, all twelve pickups/reconnect, preset controls, eight SDK clients, compiled-app smoke, delayed steering and authoritative timing. Eight clients agreed on one Fat collection, seven affected opponents and departure scoring.
- Under 200ms round trip with ±15ms receive jitter, Corner changed the presented heading in **0.9ms** and did not repeat while held. Existing delayed continuous-steering diagnostic measured **23.3ms**, with 20.5ms median / 26ms p95 frame intervals. These are browser instrumentation, not input-to-photon guarantees. Clock regression measured **60.06Hz**, 3.00s countdown, 2.00s direction preview and 5.00s results.
- Corrected screenshots inspected at 1440×1000 and 1024×768: twelve original pickup icons, scrollable lobby legend, active effects and readable standings. Fixed a stale mode label, roster styling leaking into nested badges and laptop footer overflow. Browser assertions confirm the active-effect footer remains in the viewport and roster rows stay compact.
- Eight-player headless Basic endurance: 36,000 steps across 81 rounds, peak 3,149 trail segments, 12 collected pickups, approximately **0.043ms p95 / 5.1ms max** in the final run alongside browser checks step on **Apple M4, macOS arm64**. Separately verified full ten-minute round timeout/reset with flight keeping players alive. These are synthetic simulation checks, not dense ten-minute arena, browser load, concurrent-room or hosted-capacity guarantees.

## Current gameplay baseline

Minimum field width 600, scaling to 900 at eight players and 1,559 at 24; speed 124.81755 units/s, turn radius 35 and trail width 5. Base speed includes the latest 15% increase. Desktop arena and controls fit beside the 280px room rail. Prediction is bounded at 16 ticks (267ms); local/remote clocks slew within ±5%, and small corrections decay over 60ms. Large corrections can still move a head; long stalls reach the prediction cap.

## Run and handoff

Use `corepack pnpm dev` and open http://localhost:5173 in two independent browser contexts. Choose the mode in the lobby and apply settings before readying. See README and [DEVELOPMENT](DEVELOPMENT.md) for build and verification commands. Test screenshots/traces stay in ignored `test-results/`. The temporary compiled smoke server was stopped after verification; start development servers with the command above.

## Next concrete work / remaining limits

1. Playtest the reduced drop density and shared countdown halos with friends. Balance values are intentionally explicit and adjustable in code.
2. Measure eight real clients, dense long-round geometry/baseline size, concurrent rooms, extreme jitter/stalls and Firefox/Safari/Edge. Current multiplayer visual evidence is Chromium with two clients.
3. Bound outbound queues and sync-request rates; exercise slow clients, full match/rematch endurance and context-loss recovery. Full refresh does not restore the guest seat.
4. Validate Docker image/health check on a Docker host and implement graceful draining before hardened hosting claims. Public deployment remains a separate action.
5. Reference flight/corner/wrap behavior and stacking limits remain unverified by live reference play. No exact parity claim. No accounts, discovery, teams, shared keyboard, dedicated spectators or recordings were added.

The gameplay implementation is present; broader release milestones and production hardening remain incomplete.
