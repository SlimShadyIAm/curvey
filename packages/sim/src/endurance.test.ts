import { cpus, platform, arch } from 'node:os';
import { expect, it } from 'vitest';
import { Match, TICK_RATE, type Steering } from './index';

it('runs eight-player effect matches across ten simulated minutes and repeated resets', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    name: `Player ${i}`,
    color: '#80c7ff',
  }));
  const match = new Match(players, 731, 300, 'Basic');
  const durations: number[] = [];
  let rounds = 0,
    peakSegments = 0,
    collections = 0;
  for (let tick = 0; tick < TICK_RATE * 600; tick++) {
    if (match.over) {
      match.resetRound();
      rounds++;
      expect(match.pickups).toHaveLength(0);
      expect(match.segments).toHaveLength(0);
    }
    // Deterministic steering changes exercise survival, pickups, deaths and resets.
    const input = Object.fromEntries(
      players.map((p, i) => [
        p.id,
        ([-1, 0, 1] as Steering[])[Math.floor(tick / (45 + i * 7) + i) % 3],
      ]),
    );
    const before = performance.now();
    match.step(input);
    durations.push(performance.now() - before);
    peakSegments = Math.max(peakSegments, match.segments.length);
    collections += match.collections.filter((c) => c.tick > match.tick - 1).length;
    expect(match.pickups.length).toBeLessThanOrEqual(3);
    for (const p of match.players) {
      expect(Number.isFinite(p.x + p.y + p.angle)).toBe(true);
      expect(p.effects.every((e) => e.expiresTick > match.tick)).toBe(true);
    }
  }
  durations.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      scenario: '8-player Basic, 36,000 steps',
      machine: `${platform()} ${arch()} ${cpus()[0].model}`,
      rounds,
      peakSegments,
      collections,
      p95StepMs: durations[Math.floor(durations.length * 0.95)],
      maxStepMs: durations.at(-1),
    }),
  );
  expect(rounds).toBeGreaterThan(5);
  expect(collections).toBeGreaterThan(0);
}, 20000);

it('ends a ten-minute round and releases its timers and effects at reset', () => {
  const m = new Match(
    [
      { id: 'a', name: 'A', color: '#80c7ff' },
      { id: 'b', name: 'B', color: '#c4ec78' },
    ],
    82,
    10,
    'Thorner',
  );
  // Flight guarantees a full-duration round without making a claim about dense-trail load.
  for (const p of m.players)
    p.effects = [{ id: 100, kind: 'fly', startTick: 0, expiresTick: 600 * TICK_RATE + 1 }];
  for (let tick = 0; tick < TICK_RATE * 600; tick++) m.step({ a: 1, b: -1 });
  expect(m.tick).toBe(36000);
  expect(m.over).toBe(true);
  m.resetRound();
  expect(m.players.every((p) => p.effects.length === 0)).toBe(true);
  expect(m.globalEffects).toEqual([]);
  expect(m.pickups).toEqual([]);
  expect(m.segments).toEqual([]);
}, 20000);
