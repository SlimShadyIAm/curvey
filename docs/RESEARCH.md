# Reference research

Investigated 2026-09-06 using official pages and public HTML/CSS/JavaScript. No authenticated session or live multiplayer playtest was performed. Original server internals are unverified. Public bundle hashes may change.

## Sources

- [Homepage](https://curvecrash.com/): browser survival game and broader community platform.
- [About](https://curvecrash.com/about): reference preset and powerup definitions. Use as the catalogue; it is not an exhaustive current feature list.
- [News](https://curvecrash.com/news): evidence of additional modes, multi-team events and cosmetic rewards; does not establish an automated tournament backend.
- [Public client](https://curvecrash.com/play/static/js/main.3ba68f07.chunk.js): observed baseline movement/settings, Pixi renderer, frame-based logic, spatial grid, input settings and gap/corner behavior. Reference client permits 16 players; our 32-player target is an extension.
- [Stylesheet](https://curvecrash.com/play/static/css/main.53afb6e1.chunk.css): dark shell, arena and standings/chat panel, result overlays.
- [Colyseus rooms](https://docs.colyseus.io/room): room lifecycle and authoritative message handling.
- [Colyseus state](https://docs.colyseus.io/state): latest-property patches do not preserve intermediate trail positions.
- [Prediction](https://docs.colyseus.io/netcode/determinism): fixed-step shared movement and side-effect separation.
- [Pixi performance](https://pixijs.com/8.x/guides/concepts/performance-tips): cache stable geometry; avoid constant complex Graphics/text rebuilding.
- [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API): application must handle backpressure.

## Evidence boundaries

Rechecked the official about-page catalogue on 2026-10-04 for the [power-up plan](POWERUPS.md). Its values inform the proposed registry; spawn cadence, placement, stacking bounds and exact collision/input semantics remain unverified. SVG icon links were discoverable, but direct visual inspection was unavailable during this planning session. No live reference match was tested.

The proposed Node/Colyseus server is our architecture, not a discovered Curve Crash backend. Original lag compensation, deployment and exact fairness rules are unknown. Our scoring ties, disconnect policy and timeouts are explicit product decisions.

## Remaining fidelity checks

Verify flight and gap immunity at walls, corner press buffering, numerical collision tolerance, effect stacking limits and per-preset scaling. Public client inspection suggests BODY-only death tests and distinct HOLE geometry; verify behavior before claiming equivalence. Implement original code/assets; do not copy bundled implementation or branding.
