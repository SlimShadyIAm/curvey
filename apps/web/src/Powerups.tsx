import {
  EFFECTS,
  PRESETS,
  TICK_RATE,
  type EffectKind,
  type EffectInstance,
  type Preset,
} from '@curvey/sim';
const files = import.meta.glob<string>('./assets/powerups/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const iconUrl = (kind: EffectKind) => files[`./assets/powerups/${kind}.svg`];
export const EFFECT_LABELS: Record<EffectKind, { name: string; description: string }> = {
  'green-speed': { name: 'Speed', description: 'Move twice as fast; turn radius grows slightly.' },
  'red-speed': {
    name: 'Enemy speed',
    description: 'Opponents move twice as fast with a wider turn.',
  },
  thin: { name: 'Thin', description: 'Draw a trail half as wide. Existing trails stay unchanged.' },
  fat: { name: 'Fat', description: 'Opponents draw double-width trails and longer gaps.' },
  'green-turtle': {
    name: 'Enemy slow + tight turns',
    description: 'Opponents move at half speed with tighter turns. You keep your speed.',
  },
  'red-turtle': { name: 'Enemy slow', description: 'Opponents move at half speed.' },
  eraser: { name: 'Eraser', description: 'Clear every trail immediately.' },
  bubbles: { name: 'Bubbles', description: 'Power-ups spawn three times as often.' },
  reverse: { name: 'Reverse', description: 'Swap opponents’ left and right controls.' },
  fly: { name: 'Fly', description: 'Pass through trails, stop drawing, and wrap at edges.' },
  'open-walls': { name: 'Open walls', description: 'Everyone wraps to the opposite edge.' },
  corner: { name: 'Corner', description: 'Turn 90° with each press. Release to turn again.' },
};
const targets = { self: 'You', others: 'Opponents', all: 'Everyone' };
export function PowerupLegend({ preset }: { preset: Preset }) {
  return (
    <details className="powerup-legend">
      <summary>Power-ups · {PRESETS[preset].length}</summary>
      {preset === 'None' ? (
        <p>No drops. Just steering and survival.</p>
      ) : (
        <div
          className="powerup-legend-content"
          tabIndex={0}
          role="region"
          aria-label="Power-up guide"
        >
          <p>
            Drive through a symbol to collect it. Circle: you. Diamond: opponents. Double bar:
            everyone.
          </p>
          <ul>
            {PRESETS[preset].map((kind) => (
              <li key={kind}>
                <img src={iconUrl(kind)} alt="" width="32" height="32" />
                <div>
                  <strong>{EFFECT_LABELS[kind].name}</strong>
                  <small>
                    {targets[EFFECTS[kind].target]} ·{' '}
                    {EFFECTS[kind].duration ? `${EFFECTS[kind].duration}s` : 'Instant'}
                  </small>
                  <p>{EFFECT_LABELS[kind].description}</p>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Stacks expire separately. Speed and size have limits. A second Reverse keeps controls
            reversed.
          </p>
        </div>
      )}
    </details>
  );
}
export function ActiveEffects({
  effects,
  tick,
  compact = false,
}: {
  effects: EffectInstance[];
  tick: number;
  compact?: boolean;
}) {
  const groups = new Map<EffectKind, EffectInstance[]>();
  for (const e of effects)
    if (e.expiresTick > tick) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]);
  if (!groups.size) return null;
  return (
    <ul className={`active-effects ${compact ? 'compact' : ''}`} aria-label="Active power-ups">
      {[...groups].map(([kind, instances]) => {
        const seconds = Math.max(
          0,
          Math.ceil((Math.min(...instances.map((e) => e.expiresTick)) - tick) / TICK_RATE),
        );
        const label = `${EFFECT_LABELS[kind].name}, ${instances.length > 1 ? `${instances.length} stacks, next expires in` : ''} ${seconds}s`;
        return (
          <li key={kind} title={label} aria-label={label}>
            <img src={iconUrl(kind)} alt="" width={compact ? 18 : 22} height={compact ? 18 : 22} />
            {!compact && (
              <span>
                {EFFECT_LABELS[kind].name} {instances.length > 1 && <b>×{instances.length}</b>}{' '}
                <time>{seconds}s</time>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
