# Curvey: session entry point

Read `docs/STATUS.md` first, then `PRODUCT.md`, `DESIGN.md`, and `docs/PLAN.md`. Consult `docs/ARCHITECTURE.md` before changing simulation or networking, `docs/DEVELOPMENT.md` for commands and implementation constraints, and `docs/RESEARCH.md` before claiming reference parity.

## Working agreement

- This repository implements the user-approved Curve Crash-inspired game, under its own identity, Curvey.
- Preserve the agreed scope. Ask about material product tradeoffs; resolve ordinary implementation details independently.
- User requests to build authorize local implementation and reversible checks. Deployment to a public service is a separate action.
- Keep simulation independent of rendering, React, transports, and storage. The server decides collisions, scores, pickups, and randomness.
- Never report untested reference behavior as faithful or unimplemented milestones as complete.
- After each meaningful task, update `docs/STATUS.md` with what works, verification, known limitations, and the next concrete work. Update architectural and product docs when decisions change; avoid contradictory duplicate specifications.
- Record durable decisions in `docs/DECISIONS.md`. Keep this file short; it is a navigation and maintenance contract, not a session transcript.
- Run relevant tests, type checking, and production builds before handing off code. UI changes also need browser inspection when available.
- Do not add accounts, public discovery, teams, mobile gameplay, shared-keyboard play, spectators, or recordings without a new scope decision.
- Do not commit credentials, invite tokens, chat contents, generated test artifacts, or dependency directories.

## Commands

The root README is authoritative for setup and commands. Keep it accurate as tooling lands.

## Completion standard

Distinguish implemented, tested, and planned. A passing build does not establish multiplayer correctness or visual quality. Leave enough context in STATUS for a new session to continue without asking the user to repeat the brief.
