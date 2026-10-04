# Decision log

## 2026-09-06: user-confirmed scope

- Original identity, faithful gameplay feel, competitive desktop UI.
- Invite-only FFA, 2–8 initially, eventually up to 32 primarily FFA.
- One player per browser; no teams or shared keyboard in v1.
- Core 12 effects; Basic, None, Thin, Corner, Thorner.
- Fixed preset mechanics; host chooses capacity and target score.
- Room text chat, mute and host kick.
- No dedicated spectators, production recording or replay viewer.
- Immediate elimination when disconnection is detected.
- Small European hosted service is intended; provider not selected.
- User approved persistent docs and implementation. Maintain AGENTS and STATUS so future sessions need no repeated explanation.

## Architecture chosen in approved plan

Shared pure TS simulation, React/Pixi browser, Node/Colyseus authority, 50Hz simulation/25Hz updates, no database initially. Separate geometry transport from occasional head snapshots. Release capacity increases require measurement.

## 2026-09-06: first implementation increment

Build the approved None-mode vertical slice first and label the UI Development Build. Other presets and prediction are still planned, not removed from release scope. Explicit messages carry both snapshots and ordered geometry; no schema fields reconstruct trails. Package shared workspace sources into the server bundle so production Node does not execute unsupported raw TypeScript syntax. Use system font fallbacks without external font requests.

## 2026-09-06: responsiveness correction

Keep authoritative simulation at 50Hz and snapshots at 25Hz. Decouple presentation from network updates: predict local steering with shared movement math, reconcile applied acknowledgments, buffer remote movement, and draw active tips each display frame. Cache completed trails in a render texture to avoid growing per-frame geometry work. Protocol v2 adds requested input ticks with bounded server scheduling; existing players must refresh. Add a delayed-network regression test and development-only frame diagnostics. Prediction currently covers None-mode movement and known gaps; random events and collision outcomes remain authoritative.

## 2026-09-07: real-time clock correction and 60Hz

User reported slow countdowns and requested at least 60Hz. Found that setting `patchRate = null` before simulation initialization in Colyseus 0.18.10 starts a clock-only interval. It remains active when fixed stepping starts and consumes elapsed time needed by the accumulator. Reapply `patchRate = null` after `setFixedTimestep` to clear it, leaving the simulation as the sole clock driver. Keep this ordering until a verified framework change removes the requirement.

Supersedes the earlier 50Hz/25Hz decision: simulation and authoritative snapshot/geometry publication now run at 60Hz; rendering remains display-paced. Countdown constants derive from shared TICK_RATE (three seconds before play, five seconds between rounds). Ruleset v2 / protocol v3 require refreshed clients. The 12-tick prediction/input lead is now 200ms, and two-tick remote extrapolation is about 33ms. Higher message/geometry volume still needs eight-player load testing.

## Gameplay pace and arena tuning from user feedback

User supplied a Curve Crash trailer screenshot and reported excessive speed and a cramped map. Set base speed to 72 units/s (20% below 90). Arena width becomes round(max(600, 900 × sqrt(players / 8))), replacing 720 × sqrt(players / 8). Two-player width grows from 360 to 600; eight-player width grows from 720 to 900. Preserve 35-unit turning radius, 5-unit trails, and 60Hz timing. This is a Curvey tuning choice, not a measured reference speed: a still screenshot cannot establish motion timing. Ruleset v3 / protocol v4 require refreshed clients.

## 2026-10-03: arena presence and pace refinement

Increase base speed from 72 to 78 units/s after play feedback that the enlarged world feels slightly slow. Preserve the 35-unit turning radius, so angular response scales with movement speed and authority/prediction remain on the same shared step. Increase the desktop arena's viewport cap by 60px while preserving its square aspect ratio and existing responsive rail collapse. Ruleset v4 uses the existing protocol v4; refresh clients and start new rooms after deployment.

## 2026-10-03: continuous presentation clocks

Replace per-snapshot half-tick display-clock jumps with bounded ±5% clock-rate correction. Give remote presentation its own clock so RTT samples cannot move it abruptly. Increase client prediction to 16 ticks (267ms), targeting RTT plus one tick with two ticks of remaining headroom; the previous 12-tick cap saturated at 200ms RTT and delayed new steering until another snapshot. Server input scheduling stays bounded to its next 12 ticks; authority and protocol are unchanged. Long stalls still freeze at the prediction limit, and authoritative corrections may still move a head.

## 2026-10-03: faster play and full-width rooms

User requested two successive 10% speed increases and a larger arena occupying the right side. Set speed to 94.38 units/s (78 × 1.1 × 1.1) with the existing turn radius; ruleset v5. Expand desktop rooms to the window edges with 24px insets, compact the header to 48px, and fit the largest square up to viewport height minus 132px beside the room rail. Preserve the world dimensions and mobile/entry layout. Refresh clients and restart rooms after deploying the matching server/client build.

## 2026-10-03: direction preview and reconciliation smoothing

Protocol v5 adds a server-timed two-second stationary direction preview after the three-second countdown, before movement starts. Show each player an arrow aligned to their authoritative spawn angle. Chat and input stay disabled during the preview. Smooth small network corrections with a 60ms decay, blending only the speculative tip from exact confirmed geometry to the corrected head. Keep new steering immediate and authoritative death/large corrections exact.

## 2026-10-04: random power-ups and five presets

Implement the user's power-up plan within the approved twelve-effect scope. New rooms default to Basic; hosts can select None, Thin, Corner or Thorner. Settings reset readiness and freeze at match start. Preserve the current base speed/world size and 60Hz timing. Protocol/ruleset v6 add effect instances, pickup state, per-segment time fractions and sequenced geometry clears; every client must refresh.

Curvey implementation defaults, not verified reference semantics: first drop at two seconds, exponential two-second mean thereafter, six ground pickups, twelve-second ground lifetime, ten-unit collection radius, 24 placement attempts and local head look-ahead clearance. Drop RNG is independent of spawn/gap RNG. Bubbles multiplies the integrated spawn intensity without bypassing the pickup/placement bounds.

Numeric instances multiply then clamp effective values: speed ¼–8×, width ⅛–4×, radius ¼–4×, gap length 1–4× and spawn rate 1–9×. Instances expire independently; booleans use any-active semantics and repeated Reverse does not cancel. This bounds geometry and movement work while keeping stacking meaningful. Gaps keep walls solid; Fly disables drawing/body collision and wraps; Open Walls wraps to the opposite edge, preserving heading and the other coordinate, with trails still lethal. Corner uses nonzero press transitions, not held-key repeat; both keys remain straight.

Time-ordered contacts apply pickup speed/width to the remainder of the tick; heading updates, radius and steering modes take effect at the next fixed heading step. Death wins exact-time pickup ties, including immunity endings and wrap arrivals. Equal-time surviving collectors are selected by seeded draw from sorted IDs, and simultaneous pickups apply by increasing pickup ID. Effects target the living roster at collection; collector death does not undo opponent effects.

Original SVG icons use symbols plus green/red/blue and scope marks. A compact effect strip shows the next independent expiry; the lobby legend explains targets and stacking. The test-only fixture server is a separate loopback entry point and must never be imported by production code. Eight-player synthetic simulation timing does not establish hosted capacity or reference parity.

## 2026-10-04: fewer drops and public countdown halos

User requested substantially less frequent pickups and duration rings around every player, visible to everyone. Ruleset v7 retains protocol v6. First drop moves to four seconds. Subsequent intervals use a three-second minimum plus an exponential five-second mean delay, averaging eight seconds instead of two (75% lower normal rate); reduce the ground cap from six to three. Bubbles retains its existing rate multiplier. Lifetimes, weights and effect durations are unchanged. These supersede the earlier spawn defaults.

Render all living players' authoritative effect durations as a halo around their displayed head. Each distinct effect kind gets a countdown section and matching icon; repeated instances show a count and the next independently expiring instance's fraction. Use one shared, bounded server-snapshot clock instead of the local prediction lead or remote interpolation lag. Freeze on disconnect and non-playing phases; remove on expiry/death/reset. Retain readable text timers and standings badges as supporting information.

## 2026-10-04: lobby bots

User authorized computer opponents. Hosts add/remove bots only before matches/rematches, within the existing eight-participant capacity. Bots are labelled, automatically ready, use unused colors and normal scoring/effects/collisions, and never become host. Bot roster edits reset human readiness. One human can start against bots. No difficulty selector in this change. Server-owned bounded look-ahead produces ordinary steering without changing core simulation rules or gameplay RNG. Protocol v7 adds member.bot; ruleset remains v7.

## 2026-10-04: 15% faster base movement

Increase base speed from 94.38 to 108.537 units/s (×1.15), as requested. Shared simulation, client prediction and bot forecasting use the same constant. Preserve the 35-unit turn radius, so angular turning speed also scales with movement. Effect durations and the 60Hz clock are unchanged. Ruleset v8 retains protocol v7; refresh clients and start new rooms with matching builds.

## 2026-10-04: varied starting positions and headings

User requested more random starts with room to turn. Replace the rotated circle and inward headings with seeded random interior positions and independent uniform full-circle headings each round. Keep heads at least 120 units from walls and 150 units apart (two 70-unit turn diameters plus trail clearance). Bound placement to 256 candidates per player, falling back to a shuffled safe interior grid. This guarantees initial turning space, not immunity from later player choices. Ruleset v9 retains protocol v7 and the existing direction preview.

## 2026-10-04: 24 seats and another 15% speed increase

User explicitly enabled 24 participants and requested another 15% increase. Protocol v8 shares MAX_PLAYERS=24 across room admission, settings validation and lobby controls, and supplies 24 unique assignable colors. Humans and bots share the capacity. Preserve existing arena scaling (1,559 units at 24) and scrollable standings. Broader load qualification remains separate from enabling the requested limit.

Ruleset v10 increases speed from 108.537 to 124.81755 units/s, retaining the turn radius, seeded spawn clearances and power-up durations. Refresh clients and start new rooms with matching server/client builds.

## 2026-10-04: slowdown excludes its collector

User requested that the person collecting slowdown not be slowed. Both turtle effects now target living opponents; the collector keeps their current speed. The former self-targeted ten-second variant retains its tighter-turn modifier, with an opponent-colored icon and explicit enemy label. The five-second opponent variant is unchanged. Ruleset v11 retains protocol v8. Already-active effects from other players remain active.
