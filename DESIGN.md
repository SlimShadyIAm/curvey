# Curvey design brief

The user approved a competitive interface and the complete plan on 2026-09-06. This is the confirmed implementation brief, not a proposed direction awaiting approval.

## Scene and composition

Friends concentrate on a desktop arena during fast rounds. A quiet dark shell keeps bright trails readable and avoids changing brightness between lobby and gameplay. Use a compact 280px standings/chat rail beside the arena, a short top bar, and concise inline status. On entry, show Create room / Join invite immediately with a representative arena illustration. No promotional landing-page sequence.

Desktop rooms occupy the full window width with 24px side insets and a 48px header. Align the square arena to the right edge, enlarging it to the available width or viewport height minus 132px, whichever is smaller. Keep the round heading and steering controls visible. Omit the decorative page footer inside desktop rooms to give gameplay priority.

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

## Power-up presentation

Use original vector glyphs in ten-world-unit pickup discs. Green/self, red/opponents and blue/global have additional circle/diamond/double-bar scope marks. Cache SVG textures in Pixi. Every affected living player has a countdown halo visible to all clients. A single effect uses the full ring; multiple effect kinds divide it into separately draining sections with matching icons. Stacks show a count and time to the next expiry. Keep active effect names and numeric next-expiry timers beside steering controls, with compact symbols beside player standings. The host's fixed preset selector and a scrollable, keyboard-focusable disclosure explain effects in the lobby. Global wrapping outlines the arena; brief collection rings respect reduced motion. Width changes affect only new visible trails, matching collision geometry.
