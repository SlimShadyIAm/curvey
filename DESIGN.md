# Curvey design brief

The user approved a competitive interface and the complete plan on 2026-09-06. This is the confirmed implementation brief, not a proposed direction awaiting approval.

## Scene and composition

Friends concentrate on a desktop arena during fast rounds. A quiet dark shell keeps bright trails readable and avoids changing brightness between lobby and gameplay. Use a compact 280px standings/chat rail beside the arena, a short top bar, and concise inline status. On entry, show Create room / Join invite immediately with a representative arena illustration. No promotional landing-page sequence.

## Visual system

- Tinted charcoal surfaces and near-white text, expressed with OKLCH tokens.
- One warm lime UI accent for the primary action; player colors have separate semantic roles.
- System sans-serif typography, tabular numerals for scores and timers.
- Compact 4/8px spacing rhythm, fine borders, modest corners, no ornamental shadows.
- Original vector curve mark and powerup symbols. Arena uses Pixi; controls and text remain semantic HTML.
- Short state transitions; respect reduced motion. No continuous decorative interface animations.

## Screens and states

Entry: name/color, create or invite join, pending and connection failures.
Lobby: room invite, roster, ready states, host settings, chat, host kick.
Match: arena, stable-order standings, target, round number, input hints, connection status.
Round results: winner/draw, gains, standings, five-second interval and chat.
Match results: winner, final standings, rematch ready check.
Settings: steering bindings, audio/render preferences and accessibility aids as implemented.

Invalid/expired invite, full room, kicked player, host departure, dropped network, server restart and unavailable WebGL must have explicit states. Never show nonfunctional controls for deferred features.

## Responsive behavior

Preserve world coordinates and arena aspect ratio. Collapse the side rail structurally on smaller desktop screens. Entry/lobby remain usable on phones, but do not promise phone gameplay. Future 32-player standings must scroll and retain local-player visibility.

## Visual validation

Inspect actual browser renders at desktop, small laptop and narrow mobile widths. The approved reference composition already establishes the visual direction; initial implementation uses that brief directly. Record screenshots/checks and defects in STATUS; do not claim visual QA from a build alone.
