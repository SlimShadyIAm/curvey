# Architecture and contracts

## Intended stack

pnpm TypeScript workspace; React/Vite UI; PixiJS arena; custom pure TypeScript simulation; Node/Colyseus authoritative rooms over WSS. Vitest unit tests and Playwright browser checks. No database in v1.

## Boundaries

- `packages/sim`: game state, fixed-step movement, geometry, effects and score rules. No browser/network/storage dependencies.
- `packages/protocol`: shared validated contracts and room state types.
- `apps/server`: sessions, invite admission, rooms, chat, simulation scheduling and transport.
- `apps/web`: React shell, keyboard state, network adapter, prediction and Pixi presentation.

Rules and protocol carry versions. Pin a compatible dependency set in the lockfile.

## Simulation

60 ticks/second; tick-based durations and seeded server randomness. Current baseline: minimum 600-unit field, scaling to 900 units at eight players, 124.81755 units/s speed, 35-unit turn radius. Use a spatial grid and swept geometry; never use endpoint-only collision checks or canvas pixels for authority. Retain full current-round geometry; free it at reset. Resolve equal-time contacts symmetrically, not by player iteration order. Only exempt immediately connected own trail. Width changes affect new geometry only.

Round starts sample seeded random interior positions with at least 120 units of wall clearance and 150 units between heads, plus independent uniform headings over a full circle. Rejection sampling is bounded to 256 candidates per player; a shuffled interior grid preserves clearance if placement is exhausted. Every reset draws new positions/headings.

Independent effect instances recompute modifiers from base values. Split geometry at gaps, wraps and effect changes. Death wins exact-time ties with pickups. One collector per pickup. Gaps and flying require explicit reference checks before parity claims.

## Networking

Colyseus owns room lifecycle. Server accepts steering intent, never client position/death/score claims. Protocol v8 input carries sequence, round and requested tick IDs; server clamps scheduling to the next 12 ticks and acknowledges applied input. Target updates: 60Hz with 60Hz simulation. After the three-second countdown, the server holds a two-second `direction-preview` phase without simulation movement before entering play. Each client draws its own starting-heading arrow from the authoritative spawn.

Separate replaceable head/state snapshots from ordered trail additions/clears/round transitions. Colyseus property patches only preserve the latest mutation, so interpolated head snapshots cannot reconstruct collision trails. Baselines and deltas carry round and sequence IDs. Keep predicted local trail separate from confirmed geometry; authority finalizes death/pickups/scores. No world rollback in v1.

Bound payloads, input cadence and outbound queues. Resynchronize/disconnect clients that fall too far behind; never drop required trail geometry silently. Heartbeats detect silent network failures. No log of production input history or match recordings.

## Rendering

React owns DOM and menus; Pixi owns frame-level arena drawing. Confirmed geometry is rasterized once into a render texture; separate active heads and trail tips update every display frame. Retain source geometry to rebuild after baseline replacement/context restoration. React HUD updates at 5Hz or immediately for meaningful score/death changes. Preserve aspect ratio; DPR cap 2. WebGL errors must be visible.

## Runtime

Guests and rooms are in memory; preferences local to browser. Random invite capability plus server-issued session identity. Invite tokens/chat bodies excluded from operational logs. A process restart ends active matches. Future multiple processes own whole rooms; shared presence/routing arrives only when needed.

## Current prediction and presentation

Small local reconciliation errors (within two trail widths) decay with a 60ms time constant. Only speculative tip geometry blends between the confirmed endpoint and corrected head; cached collision geometry stays exact. Fresh keyboard commands are not eased. Death, disconnect, phase changes and baseline replacement bypass or clear correction; larger corrections snap to authority.

The client shares `beginMovement`, `modifiers` and `movementStep` with the authoritative simulation. It predicts unacknowledged local commands to a fractional render tick, rebases on snapshots, and removes commands only when acknowledged as applied. Prediction never decides collisions or score. RTT sampling establishes the local lead plus one tick of headroom; the prediction horizon is bounded at 16 ticks (267ms), with the target lead capped two ticks below that limit. Local and remote clocks adjust their rates by at most 5% instead of stepping on packet arrivals or RTT changes. Remote heads and tick-stamped trail tips use buffered history with a jitter allowance and at most 33.3ms extrapolation. Disconnects freeze presentation; phase/round changes reset prediction. Effect-aware prediction includes independent expiry and split wraps; unknown collections still wait for authority.

## Power-ups and geometry revisions (v6)

`packages/sim/src/effects.ts` owns the twelve effect definitions, preset membership, weighted selection and bounded modifier composition. Match owns a separate seeded drop RNG, pickups, effect instances, collection cues and a geometry generation. Speed/width changes can split a tick; headings remain fixed-step. Boundary/gap/expiry contacts join death groups before pickup resolution. Swept growing-trail tests consider only geometry already deposited at contact time.

`game` snapshots include pickups, global effects, per-curve instances, collection cues, geometry generation and segment count. `geometry` batches carry round, monotonically increasing sequence, generation, clear flag, append offset and segments. Eraser increments generation and replaces stored/indexed trails. A clear invalidates the client's cached texture and old geometry history before appending surviving segments. Baselines include the geometry sequence; snapshots requiring unmatched geometry are withheld. This is ordered generation-based clearing rather than transporting a separate event for every discarded intra-tick segment.

Ground pickup state is authoritative. Curve effects carry unique instance IDs and start/expiry ticks, including fractional contact times. Segments retain per-tick start/end fractions, width and path-continuity IDs. Gaps and wraps break path continuity; prediction and remote tips never draw a wrap connector. Changed intent is scheduled on distinct ticks to preserve quick Corner press/release transitions; identical heartbeats coalesce. Numeric limits and exact tie/flight/corner semantics are recorded in DECISIONS.

Ruleset v7 reduces the normal drop rate to an eight-second mean with a three-second minimum, first drop at four seconds, and a three-pickup ground cap. Protocol v6 already broadcasts every curve's effect instances, so public countdown halos require no transport change. `effectRings` groups instances by kind and uses the next expiry; Arena draws each section around the presented head but times all players from `ArenaPresentation.effectTick`, a shared clock bounded to two ticks beyond the latest snapshot. It freezes outside play or while disconnected. Cached icons and stack labels are retained while a status is active and removed on expiry/reset.

## Bots

Protocol v7 adds an explicit bot flag to room members and host-only add-bot/remove-bot messages in lobby/match-results. Bots occupy normal capacity/color/score slots, remain ready after settings changes and results, and never inherit room ownership. Bots have no sockets, reconnect tokens or input acknowledgements. Rooms pause simulation when no human is connected; Colyseus still disposes rooms based on real clients.

The server's pure bots module forecasts ordinary steering candidates at 10Hz over a bounded 54-tick horizon. It uses shared effect-aware heading changes, swept trail checks, walls/wraps, known gaps, projected own trails and approximate opponent motion. Survival dominates mild pickup attraction. It does not mutate simulation state, consume gameplay RNG, predict future random gaps, or bypass authoritative collisions. This is one heuristic difficulty, not a pathfinding or optimal-play guarantee.

Protocol v8 raises the shared MAX_PLAYERS limit to 24, with 24 unique assignable colors. Existing square-root arena scaling gives 1,559 units at 24 participants. Roster scrolling is retained. This enables capacity without claiming concurrent-room or dense-round performance guarantees.
