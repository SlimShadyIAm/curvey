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
