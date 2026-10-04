import { expect, it } from 'vitest';
import { Match, SPAWN_MARGIN, SPAWN_SEPARATION, SPEED, TURN_RADIUS, TICK_RATE } from './index';
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), name: String(i), color: '#fff' }));

it('keeps random spawns clear of walls and each other across room sizes and seeds', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 24, 32]) {
    for (let seed = 1; seed <= 200; seed++) {
      const m = new Match(people(count), seed);
      for (const [i, p] of m.players.entries()) {
        expect(Math.min(p.x, p.y, m.width - p.x, m.width - p.y)).toBeGreaterThanOrEqual(
          SPAWN_MARGIN,
        );
        for (const q of m.players.slice(0, i))
          expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(SPAWN_SEPARATION);
      }
    }
  }
});

it('reproduces seeds, changes each round, and samples independent full-circle headings', () => {
  const a = new Match(people(8), 123),
    b = new Match(people(8), 123);
  const initial = structuredClone(a.players);
  expect(a.players).toEqual(b.players);
  a.resetRound();
  b.resetRound();
  expect(a.players).toEqual(b.players);
  expect(a.players).not.toEqual(initial);
  const headings = new Set<number>(),
    radii = new Set<number>();
  let outward = 0,
    inward = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const m = new Match(people(8), seed);
    for (const p of m.players) {
      headings.add(Math.floor(p.angle / (Math.PI / 4)));
      radii.add(Math.round(Math.hypot(p.x - m.width / 2, p.y - m.width / 2)));
      const dot = (p.x - m.width / 2) * Math.cos(p.angle) + (p.y - m.width / 2) * Math.sin(p.angle);
      if (dot > 0) outward++;
      else inward++;
    }
  }
  expect(headings.size).toBe(8);
  expect(radii.size).toBeGreaterThan(100);
  expect(outward).toBeGreaterThan(250);
  expect(inward).toBeGreaterThan(250);
});

it('allows every player an immediate left or right U-turn from the starting position', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const steer of [-1, 1] as const) {
      const m = new Match(people(8), seed, 10, 'None');
      const inputs = Object.fromEntries(m.players.map((p) => [p.id, steer]));
      for (let tick = 0; tick < Math.ceil(((Math.PI * TURN_RADIUS) / SPEED) * TICK_RATE); tick++)
        m.step(inputs);
      expect(m.players.every((p) => p.alive)).toBe(true);
    }
  }
});

it('uses a bounded safe fallback when random candidates repeatedly overlap', () => {
  const m = new Match(people(8), 1);
  m.random = () => 0.5;
  m.resetRound();
  for (const [i, p] of m.players.entries())
    for (const q of m.players.slice(0, i))
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(SPAWN_SEPARATION);
});
