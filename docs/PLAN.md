# Approved implementation plan

Approved 2026-09-06. PRODUCT is authoritative for scope; ARCHITECTURE for technical contracts; STATUS for actual progress.

## Milestones

1. **Rules and engine foundation:** seeded fixed-step movement, trails, spatial collision index, holes, scoring, round resets, meaningful geometry tests. Verify reference-sensitive flight/wall/gap/corner behavior before claiming parity.
2. **Multiplayer vertical slice:** invite-only rooms, two independent browsers, readiness, None mode, server scoring, results, rematch, disconnect elimination, host transfer.
3. **Launch gameplay:** 12 effects, five fixed presets, 2–8 players, late-arrival waiting, text chat, mute, kick.
4. **Competitive UI and resilience:** complete states, remapping, accessibility, responsive shell, graphics recovery, network failures. Test Chrome, Firefox, Safari and Edge before release claims.
5. **Hosted release:** CDN web assets and persistent European Node game process over HTTPS/WSS, Docker, health/readiness, graceful draining. Hosting provider and credentials are not configured yet.

## Rules selected for Curvey

- Three-second round countdown, then a two-second stationary starting-direction arrow before movement; five-second round-result interval.
- Alive players gain one point for each opponent eliminated. Same-time deaths are one group, and do not score from one another.
- Round ends at at most one survivor. A unique leader at/above the target wins the match; tied leaders play on.
- Default target is 10 × (starting players − 1); host target range 5–300.
- Ten-minute round maximum, with no extra timeout points.
- Match roster and settings freeze at start. Late arrivals wait for the next match without receiving a live arena feed.
- Everyone readies; host starts with at least two ready players. Host transfers to longest-connected member on departure.
- Immediately eliminate on detected disconnect. Reserve seat 15 seconds for reconnect, never resurrect within a round.
- Both steering keys means straight. Blur releases steering; online games do not pause.
- Chat: lobby/results only, 300 characters, five messages per ten seconds, last 100 in memory; text-only rendering.
- Numeric powerups use independently expiring modifiers. Boolean effects last while any instance applies; Reverse does not cancel from a second pickup.

## Acceptance gates

- Same authoritative outcome across clients, including simultaneous deaths and pickup races.
- Eight players within 16.7ms ticks; proposed p95 room-step target <5ms on a documented server. Measure, do not assume.
- Typical renderer frame target 16.7ms on documented hardware.
- Test 50–200ms RTT, jitter, network stalls, blur, reconnect, slow clients and stale round messages.
- Ten-minute rounds and repeated rematches have bounded memory.
- Load test concurrent rooms before asserting server capacity.

## Expansion

Keep player/connection/curve identities separate and collections uncapped internally by eight. Increase actual enabled capacity 8 → 16 → 32 only after geometry, network, dense-arena and standings checks. Scale by assigning whole rooms to processes. Later features need separate specifications; do not silently expand v1.
