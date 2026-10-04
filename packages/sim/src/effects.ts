/** Pure gameplay definitions. Durations are seconds; simulation uses tick timestamps. */
export const EFFECTS = {
  'green-speed': { target: 'self', duration: 3, weight: 2, speed: 2, radius: 1.2 },
  'red-speed': { target: 'others', duration: 3, weight: 1, speed: 2, radius: 1.2 },
  thin: { target: 'self', duration: 15, weight: 2, width: 0.5 },
  fat: { target: 'others', duration: 7, weight: 2, width: 2, gap: 2 },
  'green-turtle': { target: 'others', duration: 10, weight: 2, speed: 0.5, radius: 0.66 },
  'red-turtle': { target: 'others', duration: 5, weight: 2, speed: 0.5 },
  eraser: { target: 'all', duration: 0, weight: 1 },
  bubbles: { target: 'all', duration: 3, weight: 2 },
  reverse: { target: 'others', duration: 5, weight: 1 },
  fly: { target: 'self', duration: 6, weight: 1 },
  'open-walls': { target: 'all', duration: 10, weight: 2 },
  corner: { target: 'self', duration: 15, weight: 2 },
} as const;
export type EffectKind = keyof typeof EFFECTS;
export type EffectInstance = {
  id: number;
  kind: EffectKind;
  startTick: number;
  expiresTick: number;
};
export type Pickup = {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  spawnTick: number;
  expiresTick: number;
};
export type Collection = {
  id: number;
  kind: EffectKind;
  collector: string;
  x: number;
  y: number;
  tick: number;
};
export const PICKUP_RADIUS = 10;
export const DROP_LIMIT = 3;
export const INITIAL_DROP_SECONDS = 4;
export const MIN_DROP_INTERVAL_SECONDS = 3;
export const MEAN_DROP_INTERVAL_SECONDS = 8;
export const PRESET_NAMES = ['Basic', 'None', 'Thin', 'Corner', 'Thorner'] as const;
export type Preset = (typeof PRESET_NAMES)[number];
export const PRESETS: Record<Preset, readonly EffectKind[]> = {
  Basic: [
    'green-speed',
    'red-speed',
    'fat',
    'green-turtle',
    'red-turtle',
    'eraser',
    'bubbles',
    'reverse',
    'fly',
    'open-walls',
  ],
  None: [],
  Thin: ['thin'],
  Corner: ['corner'],
  Thorner: ['thin', 'corner'],
};
export function chooseEffect(preset: Preset, random: number): EffectKind | undefined {
  const kinds = PRESETS[preset];
  let choice = random * kinds.reduce((sum, kind) => sum + EFFECTS[kind].weight, 0);
  for (const kind of kinds) {
    choice -= EFFECTS[kind].weight;
    if (choice < 0) return kind;
  }
  return kinds.at(-1);
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function modifiers(effects: readonly EffectInstance[], tick: number) {
  let speed = 1,
    radius = 1,
    width = 1,
    gap = 1,
    drops = 1;
  let reverse = false,
    fly = false,
    wrap = false,
    corner = false;
  for (const instance of effects) {
    if (instance.startTick > tick + 1e-8 || instance.expiresTick <= tick + 1e-8) continue;
    const definition: {
      target: string;
      speed?: number;
      radius?: number;
      width?: number;
      gap?: number;
    } = EFFECTS[instance.kind];
    speed *= definition.speed ?? 1;
    radius *= definition.radius ?? 1;
    width *= definition.width ?? 1;
    gap *= definition.gap ?? 1;
    reverse ||= instance.kind === 'reverse';
    fly ||= instance.kind === 'fly';
    wrap ||= instance.kind === 'open-walls' || instance.kind === 'fly';
    corner ||= instance.kind === 'corner';
    if (instance.kind === 'bubbles') drops *= 3;
  }
  return {
    speed: clamp(speed, 0.25, 8),
    radius: clamp(radius, 0.25, 4),
    width: clamp(width, 0.125, 4),
    gap: clamp(gap, 1, 4),
    drops: clamp(drops, 1, 9),
    reverse,
    fly,
    wrap,
    corner,
  };
}
