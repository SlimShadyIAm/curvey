import { EFFECTS, type EffectInstance, type EffectKind } from '@curvey/sim';

export type EffectRing = { kind: EffectKind; fraction: number; stacks: number };
/** One countdown section per kind. Each independent stack retains its own expiry. */
export function effectRings(effects: readonly EffectInstance[], tick: number): EffectRing[] {
  const result: EffectRing[] = [];
  for (const kind of Object.keys(EFFECTS) as EffectKind[]) {
    const active = effects.filter(
      (e) => e.kind === kind && e.startTick <= tick && e.expiresTick > tick,
    );
    if (!active.length) continue;
    const next = active.reduce((a, b) => (a.expiresTick <= b.expiresTick ? a : b));
    const duration = next.expiresTick - next.startTick;
    if (duration <= 0) continue;
    result.push({
      kind,
      stacks: active.length,
      fraction: Math.min(1, Math.max(0, (next.expiresTick - tick) / duration)),
    });
  }
  return result;
}
export const EFFECT_SCOPE_COLORS = { self: '#b8e879', others: '#ff927d', all: '#80c7ff' };
