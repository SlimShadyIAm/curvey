/** Opt-in local development instrumentation. No telemetry or production recordings. */
export type ArenaDiagnostics = {
  frames: number;
  at: number;
  frameIntervals: number[];
  renderDurations: number[];
  local: { x: number; y: number; angle: number; alive: boolean } | null;
  tick: number;
};
declare global {
  interface Window {
    __CURVEY_ARENA__?: ArenaDiagnostics;
  }
}
const enabled = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
export function recordFrame(start: number, local: ArenaDiagnostics['local'], tick: number) {
  if (!enabled) return;
  const stats = (window.__CURVEY_ARENA__ ??= {
    frames: 0,
    at: start,
    frameIntervals: [],
    renderDurations: [],
    local: null,
    tick: 0,
  });
  if (stats.frames) stats.frameIntervals.push(start - stats.at);
  stats.frames++;
  stats.at = start;
  stats.local = local;
  stats.tick = tick;
  stats.renderDurations.push(performance.now() - start);
  if (stats.frameIntervals.length > 240) stats.frameIntervals.shift();
  if (stats.renderDurations.length > 240) stats.renderDurations.shift();
}
