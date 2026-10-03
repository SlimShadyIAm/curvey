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

60 ticks/second; tick-based durations and seeded server randomness. Reference baseline: minimum 600-unit field, scaling to 900 units at eight players, 78 units/s speed, 35-unit turn radius. Use a spatial grid and swept geometry; never use endpoint-only collision checks or canvas pixels for authority. Retain full current-round geometry; free it at reset. Resolve equal-time contacts symmetrically, not by player iteration order. Only exempt immediately connected own trail. Width changes affect new geometry only.

Independent effect instances recompute modifiers from base values. Split geometry at gaps, wraps and effect changes. Death wins exact-time ties with pickups. One collector per pickup. Gaps and flying require explicit reference checks before parity claims.

## Networking

Colyseus owns room lifecycle. Server accepts steering intent, never client position/death/score claims. Protocol v4 input carries sequence, round and requested tick IDs; server clamps scheduling to the next 12 ticks and acknowledges applied input. Target updates: 60Hz with 60Hz simulation.

Separate replaceable head/state snapshots from ordered trail additions/clears/round transitions. Colyseus property patches only preserve the latest mutation, so interpolated head snapshots cannot reconstruct collision trails. Baselines and deltas carry round and sequence IDs. Keep predicted local trail separate from confirmed geometry; authority finalizes death/pickups/scores. No world rollback in v1.

Bound payloads, input cadence and outbound queues. Resynchronize/disconnect clients that fall too far behind; never drop required trail geometry silently. Heartbeats detect silent network failures. No log of production input history or match recordings.

## Rendering

React owns DOM and menus; Pixi owns frame-level arena drawing. Confirmed geometry is rasterized once into a render texture; separate active heads and trail tips update every display frame. Retain source geometry to rebuild after baseline replacement/context restoration. React HUD updates at 5Hz or immediately for meaningful score/death changes. Preserve aspect ratio; DPR cap 2. WebGL errors must be visible.

## Runtime

Guests and rooms are in memory; preferences local to browser. Random invite capability plus server-issued session identity. Invite tokens/chat bodies excluded from operational logs. A process restart ends active matches. Future multiple processes own whole rooms; shared presence/routing arrives only when needed.

## Current prediction and presentation

The None-mode client shares `movementStep` with the authoritative simulation. It predicts unacknowledged local commands to a fractional render tick, rebases on snapshots, and removes commands only when acknowledged as applied. Prediction never decides collisions or score. RTT sampling establishes the local lead; the prediction horizon is bounded at 200ms. Remote heads and tick-stamped trail tips use buffered history with a jitter allowance and at most 33.3ms extrapolation. Disconnects freeze presentation; phase/round changes reset prediction. Future effects must extend both authoritative movement and presentation before enabling their presets.
