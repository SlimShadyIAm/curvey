# Power-up implementation plan

Prepared 2026-10-04; implemented locally in protocol v6 / ruleset v7. This retains the execution plan for PLAN milestone 3 within PRODUCT's approved 12-effect scope. See STATUS for verification and DECISIONS for the selected rules and numeric limits. Broader browser/load/balance gates remain; tuning is not a claim of reference parity.

## Catalogue and presets

The [official catalogue](https://curvecrash.com/about) documents these values. Green targets the collector, red targets opponents, blue is global. Treat its “1x/2x” spawn entries as relative weights, not percentages.

| Effect       | Duration | Weight | Behavior                       |
| ------------ | -------- | ------ | ------------------------------ |
| Green Speed  | 3s       | 2      | Speed ×2; radius ×1.2          |
| Red Speed    | 3s       | 1      | Speed ×2; radius ×1.2          |
| Thin         | 15s      | 2      | Width ×0.5                     |
| Fat          | 7s       | 2      | Width and gap length ×2        |
| Green Turtle | 10s      | 2      | Speed ×0.5; radius ×0.66       |
| Red Turtle   | 5s       | 2      | Speed ×0.5                     |
| Eraser       | Instant  | 1      | Remove all trails              |
| Bubbles      | 3s       | 2      | Spawn rate ×3                  |
| Reverse      | 5s       | 1      | Swap steering                  |
| Fly          | 6s       | 1      | Suppress trails and collisions |
| Open Walls   | 10s      | 2      | Wrap boundaries                |
| Green Corner | 15s      | 2      | Right-angle turns              |

Basic uses the ten entries excluding Thin and Green Corner. Thin and Corner each use their namesake; Thorner combines them. None has no pickups. Other catalogue effects remain deferred.

Curvey override (2026-10-04, ruleset v11): both turtle pickups target opponents only. The former Green Turtle keeps its ten-second duration and tighter-turn modifier, but uses the opponent scope/color and label “Enemy slow + tight turns.” The collector is never slowed by their own pickup. The table above records the original reference catalogue.

## 1. Establish rules and shared definitions

- Add `effects.ts` and `presets.ts` under `packages/sim/src`, keeping mechanics independent of UI, transport and storage. Definitions include stable ID, target, duration ticks, weight, modifier behavior and preset membership. UI metadata maps these IDs to labels and original icon assets.
- Follow the existing stacking contract: numeric instances multiply and expire independently; boolean effects persist while any instance remains. Repeated Reverse never cancels itself. Recompute from base values instead of repeatedly mutating speed or width.
- Keep the current 60Hz simulation and current base movement/world size. Catalogue seconds convert to ticks; adding effects must not retune None mode.
- Before effect implementation, settle wall immunity during gaps/Fly, corner key presses/held keys/both keys, stacking limits and wrap destination semantics through reference observation or an explicitly recorded Curvey decision. The about page alone cannot resolve these. Propose one corner turn per press edge, with simultaneous keys remaining straight; do not label this verified reference behavior.
- Establish a supported stacked-speed/width range before enabling presets. Test extremes and seek a product decision if a cap materially changes the approved stacking behavior.

## 2. Authoritative random drops

- Store pickups as `{ id, kind, x, y, spawnTick, expiresTick }` in Match. Use a dedicated seeded random stream so drop retries cannot change future gaps or player spawn headings.
- Current tuning after play feedback: first drop four seconds into play, then a three-second minimum plus an exponential five-second mean delay (eight-second average), at most three uncollected pickups, twelve-second ground lifetime, ten-unit collection radius. These are internal fixed-preset tuning values to playtest, not host sliders or reference measurements.
- Choose a kind using the active preset's normalized weights, then sample a position with clearance from walls, trails, existing pickups and heads. Use the spatial index, a short head look-ahead exclusion, and a bounded attempt count (for example 24). Skip blocked attempts rather than force a drop or loop indefinitely. This checks local clearance, not full path reachability through the maze.
- Apply Bubbles to the spawn process while active, preserving the ground cap and bounded placement work. Specify interval/rate integration so activation and expiry affect the next spawn consistently. Validate combined instances under the existing stacking rule.
- Spawn only during play. Reset pickups, timers and effects each round; None consumes no drop randomness.

## 3. Pickup resolution and effects

- Extend swept movement checks to pickup circles; fast curves must not tunnel past them. The server chooses the collector. Never accept a client claim that it collected an item.
- Resolve contacts in time order within each tick. Death wins an exact-time tie with a pickup. For equal-time surviving collectors, propose a seeded random tie-break over a stable sorted candidate set so roster iteration order cannot choose the winner. Consume each pickup once.
- Apply effects at the contact time and recompute the remaining part of the tick. Eraser or Fly collected before an impending collision can change the outcome. Resolve same-time pickup groups from one consistent alive-player state and specify a stable ordering for noncommuting effects.
- Finish the existing geometry correctness gate first: newly deposited trails, trails left by players dying during the tick, symmetric head contacts and precise gap boundaries. High speed amplifies these issues.
- Extend shared movement to accept effective speed, radius, width and input mode. Width affects head collisions and newly deposited segments; historical widths remain unchanged. Keep gap length in world units and split geometry exactly at effect, gap and wrap boundaries.
- Eraser clears both authoritative collision data and visible trails. Preserve logical owner/distance continuity safely after a clear. Open Walls splits travel at each boundary and never draws a cross-map connector. Fly landing and wrapping onto occupied space need explicit collision tests.
- Snapshot the living targets at collection for player effects. Global timed state applies to the arena; deaths do not undo an effect already applied to opponents. Round resets clear everything.

## 4. Synchronization and prediction

- Extend `packages/protocol/src/index.ts`: validated preset setting, room preset, authoritative pickup state, active instances/expiry ticks and effective movement state. Baselines must contain all current effects and pickups.
- Replace the append-only geometry assumption with ordered operations carrying round, sequence and geometry generation: trail append and clear. The current server uses `segments.slice(sentSegments)`, which cannot safely express Eraser. Couple game snapshots to a geometry revision so heads/effects cannot display against stale trails.
- Update `apps/server/src/GameRoom.ts` to freeze the selected preset at match start and publish only authoritative results. Preserve roster gating for late arrivals and include full state on reconnect/resync. Increment protocol and ruleset versions together when shipping.
- Extend `apps/web/src/presentation.ts` to use shared effect-aware movement, scheduled expiry and corner input edges. Predict known effects, never unknown pickups or random outcomes. Reconcile when authority confirms a collection; reset incompatible speculative paths after clear/wrap transitions.
- Keep publication at 60Hz and the existing bounded prediction horizon. Test expiry during the predicted interval and snapshots spanning multiple effect changes.

## 5. Icons and readable feedback

Players must recognize a pickup while steering through a dense desktop arena. Preserve the approved quiet dark shell and reserve semantic color for gameplay state.

- Create twelve original SVG symbols, rendered as cached Pixi textures and reused in HTML help. Use the reference icon links as visual research, not shipped assets. Example linked assets: [speed](https://curvecrash.com/static/img/powerups/GREEN_SPEED.svg), [reverse](https://curvecrash.com/static/img/powerups/REVERSE.svg), [walls](https://curvecrash.com/static/img/powerups/OPEN_WALLS.svg), [corner](https://curvecrash.com/static/img/powerups/GREEN_CORNER.svg). This session verified the page's links; direct SVG rendering was unavailable, so visual inspection remains part of implementation.
- Proposed symbol families: chevrons for speed, turtle for slow, narrowing/widening strokes for width, eraser, bubbles, opposing arrows, wing, boundary arrows and an elbow. Distinguish target scope with an additional badge/outline pattern as well as green/red/blue. Maintain legibility at actual arena scale.
- Draw drops above trails with a quiet contrasting backing. Keep the actual collection radius consistent with the visible disc. Use a brief confirmed collection cue without obscuring the head; respect reduced motion.
- Show countdown halos around every living affected player, visible in every client. Divide the ring by distinct effect kind and place matching icons beside each section. Stacks show a count and drain to the next expiry.
- Show local active effects in a compact strip beside existing controls, with name, remaining time and stack count. Stacked instances expire separately; explain the displayed timer as the next expiry. Show global boundary state on the arena and relevant opponent effects beside standings, without expanding the rail.
- Add preset selection and a keyboard-accessible effect legend in the lobby. Keep settings frozen during the match. Enable each preset only when its whole effect set works end to end.

## 6. Delivery and acceptance

1. **Foundation:** resolve the geometry gate, introduce the registry, deterministic drops, contact ordering, clear operations and protocol state. Test in headless fixtures without exposing incomplete presets.
2. **First playable pickup:** deliver Thin end to end, including original icon, timers, baseline recovery and effect-aware prediction. This exercises the complete path with a small effect set; enable Thin only after passing its checks.
3. **Basic:** implement numeric speed/width effects, Reverse, Bubbles, Eraser, Fly and wrapping. Validate interactions and all ten icons before exposing Basic.
4. **Corner/Thorner:** add discrete steering, input-edge synchronization and mixed width/corner behavior. Enable both after prediction and collision tests pass.
5. **Release validation:** balance spawn density for two through eight players; inspect browser renders and run network/load scenarios before marking milestone 3 complete.

Required verification during implementation:

- Seed reproducibility; weighted sampling via controlled random inputs; placement retry/cap bounds; None isolation; Bubbles activation/expiry; per-round cleanup.
- Collection at high speed, exact pickup/death ties, contested pickups, effect stacking/independent expiry, old/new width boundaries, no wrap connectors, Eraser removing collisions, Fly landing, corner press/hold behavior and combined effects.
- Independent browser contexts agree on collection, expiry, geometry clears and scores. Exercise reconnect/baseline replacement, stale round packets, rematches and late arrivals.
- Run `corepack pnpm test`, `typecheck`, `build`, `format:check` and relevant Playwright scenarios. Inspect desktop/laptop renders, color-independent recognition, readable timers and reduced motion.
- Repeat delayed-network checks at 50–200ms RTT with jitter. Measure eight-player dense rounds and stacked high-speed cases against the existing <5ms p95 step target; verify bounded memory over ten-minute rounds and rematches. Preserve the planned cross-browser release gate.

Completion means each enabled preset works across authority, prediction, rendering and resynchronization. A successful build alone is insufficient.

## Implementation notes

The implemented registry combines effects and preset definitions in `packages/sim/src/effects.ts`. Geometry clearing uses a generation/sequence/clear flag plus current surviving segments instead of serializing discarded intermediate segments. A fixed heading is chosen once per tick; speed/width and collision effects apply at their fractional collection time. Numeric limits, flight wrapping and press-edge Corner semantics are deliberate Curvey defaults documented in DECISIONS. Sprite assets are original vectors under `apps/web/src/assets/powerups`; no reference assets are shipped. STATUS distinguishes the verified implementation from remaining release/load/balance gates.
