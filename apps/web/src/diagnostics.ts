import type { EffectRing } from './effectRings';
import type { GameView } from '@curvey/protocol';
/** Opt-in local development instrumentation. No telemetry or production recordings. */
export type ArenaDiagnostics = {
  rings: Record<string, EffectRing[]>;
  frames: number;
  at: number;
  frameIntervals: number[];
  renderDurations: number[];
  local: { x: number; y: number; angle: number; alive: boolean } | null;
  tick: number;
  powerups: Pick<GameView, 'pickups' | 'collections' | 'geometryGeneration' | 'geometryCount'> & {
    effects: Record<string, string[]>;
  };
};
declare global {
  interface Window {
    __CURVEY_ARENA__?: ArenaDiagnostics;
  }
}
const enabled = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
export function recordFrame(
  start: number,
  local: ArenaDiagnostics['local'],
  game: GameView,
  rings: ArenaDiagnostics['rings'],
) {
  if (!enabled) return;
  const stats = (window.__CURVEY_ARENA__ ??= {
    rings: {},
    frames: 0,
    at: start,
    frameIntervals: [],
    renderDurations: [],
    local: null,
    tick: 0,
    powerups: {
      pickups: [],
      collections: [],
      geometryGeneration: 0,
      geometryCount: 0,
      effects: {},
    },
  });
  if (stats.frames) stats.frameIntervals.push(start - stats.at);
  stats.frames++;
  stats.at = start;
  stats.local = local;
  stats.tick = game.tick;
  stats.rings = rings;
  stats.powerups = {
    pickups: game.pickups,
    collections: game.collections,
    geometryGeneration: game.geometryGeneration,
    geometryCount: game.geometryCount,
    effects: Object.fromEntries(game.players.map((p) => [p.id, p.effects.map((e) => e.kind)])),
  };
  stats.renderDurations.push(performance.now() - start);
  if (stats.frameIntervals.length > 240) stats.frameIntervals.shift();
  if (stats.renderDurations.length > 240) stats.renderDurations.shift();
}
