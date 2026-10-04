import { describe, expect, it } from 'vitest';
import {
  Match,
  SPEED,
  DT,
  TICK_RATE,
  EFFECTS,
  PRESETS,
  chooseEffect,
  modifiers,
  sweepGrowingTrail,
  type EffectKind,
  type EffectInstance,
  type Preset,
  type Segment,
} from './index';
const people = [
  { id: 'a', name: 'Ada', color: '#c4ec78' },
  { id: 'b', name: 'Bo', color: '#80c7ff' },
  { id: 'c', name: 'Cy', color: '#ff927d' },
];
const effect = (kind: EffectKind, expiresTick = 900, id = 1, startTick = 0): EffectInstance => ({
  kind,
  id,
  startTick,
  expiresTick,
});
function scene(preset: Preset = 'None', seed = 42) {
  const m = new Match(people, seed, 10, preset);
  m.players.forEach((p, i) =>
    Object.assign(p, { x: 100 + i * 150, y: 100 + i * 150, angle: 0, nextGap: 1e9 }),
  );
  return m;
}
function drop(m: Match, kind: EffectKind, x = m.players[0].x, y = m.players[0].y, id = 500) {
  m.pickups.push({ id, kind, x, y, spawnTick: m.tick, expiresTick: m.tick + 720 });
}
function line(m: Match, x: number, y1: number, y2: number, owner = 'old', width = 5) {
  const s: Segment = { id: 999, tick: 0, owner, x1: x, y1, x2: x, y2, width, distanceEnd: 0 };
  m.segments.push(s);
  m.grid.add(s);
  return s;
}

describe('power-up rules', () => {
  it.each(['green-turtle', 'red-turtle'] as const)('%s never slows its collector', (kind) => {
    const m = scene();
    drop(m, kind);
    m.step();
    expect(modifiers(m.players[0].effects, m.tick).speed).toBe(1);
    expect(m.players[0].x - 100).toBeCloseTo(SPEED * DT);
    for (const p of m.players.slice(1)) expect(modifiers(p.effects, m.tick).speed).toBe(0.5);
  });
  it.each(Object.keys(EFFECTS) as EffectKind[])(
    'collects %s once and applies only to its targets',
    (kind) => {
      const m = scene();
      drop(m, kind);
      m.step();
      expect(m.pickups).toHaveLength(0);
      expect(m.collections).toHaveLength(1);
      const target = EFFECTS[kind].target;
      if (kind !== 'eraser')
        for (const p of m.players) {
          expect(p.effects.some((e) => e.kind === kind)).toBe(
            target === 'all' || (target === 'self' ? p.id === 'a' : p.id !== 'a'),
          );
          for (const e of p.effects)
            expect(e.expiresTick - e.startTick).toBe(EFFECTS[kind].duration * TICK_RATE);
        }
      m.step();
      expect(m.collections).toHaveLength(1);
    },
  );
  it('normalizes weights inside each fixed preset', () => {
    for (const preset of Object.keys(PRESETS) as Preset[]) {
      const counts: Record<string, number> = {};
      const total = PRESETS[preset].reduce((n, k) => n + EFFECTS[k].weight, 0);
      for (let n = 0; n < total; n++) {
        const k = chooseEffect(preset, (n + 0.5) / total)!;
        counts[k] = (counts[k] ?? 0) + 1;
      }
      for (const k of PRESETS[preset]) expect(counts[k]).toBe(EFFECTS[k].weight);
    }
    expect(chooseEffect('None', 0.5)).toBeUndefined();
  });
  it('expires numeric stacks independently and keeps repeated Reverse active', () => {
    const effects = [
      effect('green-speed', 10, 1),
      effect('green-speed', 20, 2),
      effect('reverse', 10, 3),
      effect('reverse', 20, 4),
    ];
    expect(modifiers(effects, 0)).toMatchObject({ speed: 4, reverse: true });
    expect(modifiers(effects, 10)).toMatchObject({ speed: 2, reverse: true });
    expect(modifiers(effects, 20)).toMatchObject({ speed: 1, reverse: false });
    expect(
      modifiers(
        Array.from({ length: 20 }, (_, i) => effect('green-speed', 100, i)),
        0,
      ).speed,
    ).toBe(8);
    expect(
      modifiers(
        Array.from({ length: 20 }, (_, i) => effect('thin', 100, i)),
        0,
      ).width,
    ).toBe(0.125);
    expect(
      modifiers(
        Array.from({ length: 20 }, (_, i) => effect('fat', 100, i)),
        0,
      ).width,
    ).toBe(4);
  });
  it('changes only newly drawn widths and preserves collision geometry', () => {
    const m = scene();
    m.step();
    const old = m.segments[0];
    drop(m, 'thin');
    m.step();
    expect(old.width).toBe(5);
    expect(m.segments.filter((s) => s.owner === 'a').at(-1)!.width).toBe(2.5);
  });
  it('sweeps fast pickups and changes speed for the remaining part of the tick', () => {
    const m = scene();
    const p = m.players[0];
    p.effects = [
      effect('green-speed', 900, 0),
      effect('green-speed', 900, 1),
      effect('green-speed', 900, 2),
    ];
    drop(m, 'thin', p.x + 21, p.y);
    m.step();
    expect(p.effects.some((e) => e.kind === 'thin')).toBe(true);
    const n = scene();
    drop(n, 'green-speed', 110.5, 100);
    n.step();
    expect(n.players[0].x).toBeCloseTo(100 + 0.5 + (SPEED * DT - 0.5) * 2);
  });
  it('lets death win an exact tie with a pickup', () => {
    const m = scene();
    const p = m.players[0];
    p.x = 2.5;
    p.angle = Math.PI;
    drop(m, 'fly', p.x, p.y);
    m.step();
    expect(p.alive).toBe(false);
    expect(m.collections).toHaveLength(0);
  });
  it('resolves a contested pickup once, independently of roster order', () => {
    const run = (reverse: boolean) => {
      const m = scene();
      Object.assign(m.players[1], { x: 100, y: 100, gapLeft: 20 });
      m.players[0].gapLeft = 20;
      drop(m, 'thin');
      if (reverse) m.players.reverse();
      m.step();
      return m.collections.map((c) => c.collector);
    };
    expect(run(false)).toHaveLength(1);
    expect(run(false)).toEqual(run(true));
  });
  it('Eraser collected before a collision clears both stored and indexed geometry', () => {
    const m = scene();
    const p = m.players[0];
    p.effects = [
      effect('green-speed', 900, 0),
      effect('green-speed', 900, 1),
      effect('green-speed', 900, 2),
    ];
    line(m, 110, 80, 120);
    drop(m, 'eraser', 111, 100);
    const before = m.geometryGeneration;
    m.step();
    expect(p.alive).toBe(true);
    expect(m.geometryGeneration).toBe(before + 1);
    expect(m.segments.some((s) => s.id === 999)).toBe(false);
    expect(
      [...m.grid.query({ x: 110, y: 80 }, { x: 110, y: 120 }, 2)].some((s) => s.id === 999),
    ).toBe(false);
  });
  it('Fly collected before a collision suppresses drawing immediately', () => {
    const m = scene();
    const p = m.players[0];
    p.effects = [
      effect('green-speed', 900, 0),
      effect('green-speed', 900, 1),
      effect('green-speed', 900, 2),
    ];
    line(m, 110, 80, 120);
    drop(m, 'fly', 111, 100);
    m.step();
    expect(p.alive).toBe(true);
    expect(m.segments.filter((s) => s.owner === 'a').at(-1)!.x2).toBeCloseTo(101);
  });
  it('flight landing on a trail is lethal and gaps keep walls solid', () => {
    const m = scene();
    const p = m.players[0];
    p.effects = [effect('fly', 0.5)];
    line(m, 101, 80, 120);
    m.step();
    expect(p.alive).toBe(false);
    const n = scene();
    Object.assign(n.players[0], { x: 2.5, angle: Math.PI, gapLeft: 100 });
    n.step();
    expect(n.players[0].alive).toBe(false);
  });
  it.each(['fly', 'open-walls'] as EffectKind[])(
    '%s wraps without a cross-map connector',
    (kind) => {
      const m = scene();
      const p = m.players[0];
      Object.assign(p, { x: m.width - 0.5, angle: 0 });
      p.effects = [effect(kind)];
      m.step();
      expect(p.alive).toBe(true);
      expect(p.x).toBeLessThan(2);
      expect(m.segments.every((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 2)).toBe(true);
    },
  );
  it('wraps onto occupied space collide, and wall expiry restores boundaries', () => {
    const m = scene();
    const p = m.players[0];
    Object.assign(p, { x: m.width - 0.5, angle: 0, effects: [effect('open-walls')] });
    line(m, 1, 80, 120);
    m.step();
    expect(p.alive).toBe(false);
    const n = scene();
    Object.assign(n.players[0], {
      x: n.width - 1,
      angle: Math.PI,
      effects: [effect('open-walls', 0.1)],
    });
    n.step();
    expect(n.players[0].alive).toBe(false);
  });
  it('death wins a pickup tie at the exact end of a gap or flight', () => {
    for (const flight of [false, true]) {
      const m = scene();
      const p = m.players[0];
      if (flight) p.effects = [effect('fly', 0.5)];
      else p.gapLeft = SPEED * DT * 0.5;
      line(m, 100 + SPEED * DT * 0.5, 80, 120);
      drop(m, 'fly', 110 + SPEED * DT * 0.5, 100);
      m.step();
      expect(p.alive).toBe(false);
      expect(m.collections).toHaveLength(0);
    }
  });
  it('turns Corner once per press edge, respects both keys and Reverse', () => {
    const m = scene();
    const p = m.players[0];
    p.effects = [effect('corner'), effect('reverse', 900, 2)];
    m.step({ a: 1 });
    expect(p.angle).toBeCloseTo(-Math.PI / 2);
    m.step({ a: 1 });
    expect(p.angle).toBeCloseTo(-Math.PI / 2);
    m.step({ a: 0 });
    m.step({ a: 1 });
    expect(p.angle).toBeCloseTo(-Math.PI);
  });
  it('preserves opponent effects after the collector dies and resets everything between rounds', () => {
    const m = scene();
    drop(m, 'red-speed');
    m.step();
    m.eliminate('a');
    m.step();
    expect(m.players[1].effects).toHaveLength(1);
    m.resetRound();
    expect(m.players.every((p) => p.effects.length === 0 && p.previousInput === 0)).toBe(true);
    expect(m.pickups).toEqual([]);
    expect(m.collections).toEqual([]);
    expect(m.globalEffects).toEqual([]);
  });
});

describe('same-tick geometry and drop process', () => {
  it('does not collide against future trail, but detects an already drawn crossing', () => {
    expect(
      sweepGrowingTrail({ x: 5, y: -10 }, { x: 0, y: 20 }, { x: 0, y: 0 }, { x: 20, y: 0 }, 0.1),
    ).toBeCloseTo(0.495);
    expect(
      sweepGrowingTrail({ x: 15, y: -10 }, { x: 0, y: 20 }, { x: 0, y: 0 }, { x: 20, y: 0 }, 0.1),
    ).toBe(Infinity);
  });
  it('keeps a dying curve’s trail lethal later in the same tick', () => {
    const m = scene();
    const a = m.players[0],
      b = m.players[1];
    const boosts = [
      effect('green-speed', 900, 1),
      effect('green-speed', 900, 2),
      effect('green-speed', 900, 3),
      effect('thin', 900, 4),
      effect('thin', 900, 5),
      effect('thin', 900, 6),
    ];
    Object.assign(a, { x: 100, y: 100, angle: 0, effects: [...boosts] });
    Object.assign(b, { x: 102, y: 91, angle: Math.PI / 2, effects: [...boosts] });
    line(m, 106, 99, 101, 'wall', 0.625);
    m.step();
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
    expect(m.players[2].score).toBe(2);
  });
  it('spawns seeded, bounded drops only from the selected preset without perturbing gaps', () => {
    const a = scene('Thin'),
      b = scene('Thin'),
      none = scene();
    for (const m of [a, b, none])
      for (const p of m.players) {
        p.effects = [effect('fly', 10000)];
        p.nextGap = 1;
      }
    for (let tick = 0; tick < 239; tick++) {
      a.step();
      b.step();
      none.step();
    }
    expect(a.pickups).toHaveLength(0);
    a.step();
    b.step();
    none.step();
    expect(a.pickups).toHaveLength(1);
    expect(a.pickups).toEqual(b.pickups);
    expect(
      a.pickups.every(
        (p) =>
          p.kind === 'thin' && p.x > 10 && p.y > 10 && p.x < a.width - 10 && p.y < a.width - 10,
      ),
    ).toBe(true);
    expect(a.players.map((p) => p.nextGap)).toEqual(none.players.map((p) => p.nextGap));
    for (let tick = 0; tick < 1500; tick++) {
      a.step();
      expect(a.pickups.length).toBeLessThanOrEqual(3);
      expect(a.pickups.every((p) => p.expiresTick >= a.tick)).toBe(true);
    }
    expect(none.pickups).toHaveLength(0);
  });
  it('Bubbles accelerates spawning; blocked placement and full fields stay bounded', () => {
    const m = scene('Basic');
    m.globalEffects = [effect('bubbles', 900)];
    for (const p of m.players) p.effects = [effect('fly', 10000)];
    for (let i = 0; i < 80; i++) m.step();
    expect(m.pickups).toHaveLength(1);
    const blocked = scene('Thin');
    for (const p of blocked.players) p.effects = [effect('fly', 10000)];
    line(blocked, blocked.width / 2, 0, blocked.width, 'block', blocked.width * 2);
    for (let i = 0; i < 250; i++) blocked.step();
    expect(blocked.pickups).toHaveLength(0);
  });
});

it('spaces normal drops by at least three seconds and substantially reduces their rate', () => {
  const m = scene('Thin', 719);
  m.players.forEach((p) => {
    p.effects = [effect('fly', 36000)];
  });
  const ticks: number[] = [];
  for (let tick = 0; tick < 18000; tick++) {
    m.step();
    if (m.pickups.length) {
      ticks.push(m.pickups[0].spawnTick);
      m.pickups = [];
    }
  }
  expect(ticks[0]).toBe(240);
  expect(ticks.length).toBeGreaterThan(20);
  const intervals = ticks.slice(1).map((tick, i) => (tick - ticks[i]) / TICK_RATE);
  expect(Math.min(...intervals)).toBeGreaterThanOrEqual(3);
  const mean = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
  expect(mean).toBeGreaterThan(5);
  expect(mean).toBeLessThan(11);
});
