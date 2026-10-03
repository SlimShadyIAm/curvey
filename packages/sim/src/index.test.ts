import { describe, expect, it } from 'vitest';
import { Match, sweepCapsule, type Segment } from './index';
const people = [
  { id: 'a', name: 'Ada', color: '#ff9999' },
  { id: 'b', name: 'Bo', color: '#99ccff' },
];
const openMatch = () => {
  const m = new Match(people, 123);
  m.players.forEach((p, i) =>
    Object.assign(p, { x: 70 + i * 180, y: 150, angle: Math.PI / 2, nextGap: Infinity }),
  );
  return m;
};
describe('continuous collision geometry', () => {
  it('catches tunneling through a thin line', () => {
    expect(
      sweepCapsule({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -20 }, { x: 50, y: 20 }, 2),
    ).toBeCloseTo(0.48);
  });
  it('allows a real gap and catches round segment ends', () => {
    expect(
      sweepCapsule({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 5 }, { x: 50, y: 20 }, 2),
    ).toBe(Infinity);
    expect(
      sweepCapsule({ x: 0, y: 4 }, { x: 100, y: 0 }, { x: 50, y: 5 }, { x: 50, y: 20 }, 2),
    ).toBeLessThan(0.5);
  });
});
describe('authoritative match rules', () => {
  it('reproduces seeded geometry and gaps', () => {
    const a = new Match(people, 42),
      b = new Match(people, 42);
    for (let i = 0; i < 500; i++) {
      a.step({ a: 1, b: -1 });
      b.step({ a: 1, b: -1 });
    }
    expect(a.players).toEqual(b.players);
    expect(a.segments).toEqual(b.segments);
  });
  it('eliminates disconnected players and awards surviving opponents once', () => {
    const m = openMatch();
    m.eliminate('a');
    m.eliminate('a');
    expect(m.step().deaths).toEqual(['a']);
    expect(m.players[1].score).toBe(1);
    m.step();
    expect(m.players[1].score).toBe(1);
  });
  it('resolves equal-time head impacts without iteration advantage', () => {
    const run = (reverse: boolean) => {
      const m = openMatch();
      Object.assign(m.players[0], { x: 100, y: 100, angle: 0 });
      Object.assign(m.players[1], { x: 107, y: 100, angle: Math.PI });
      if (reverse) m.players.reverse();
      m.step();
      return m.players
        .map((p) => ({ id: p.id, alive: p.alive, score: p.score }))
        .sort((a, b) => a.id.localeCompare(b.id));
    };
    expect(run(false)).toEqual(run(true));
    expect(run(false).every((p) => !p.alive && p.score === 0)).toBe(true);
  });
  it('collides with older own trail', () => {
    const m = openMatch();
    const p = m.players[0];
    p.distance = 100;
    const s: Segment = {
      id: 0,
      tick: 0,
      owner: p.id,
      x1: p.x - 20,
      y1: p.y + 6,
      x2: p.x + 20,
      y2: p.y + 6,
      width: 5,
      distanceEnd: 10,
    };
    m.grid.add(s);
    m.segments.push(s);
    expect(m.step().deaths).toContain(p.id);
  });
  it('leaves no collidable body while a gap is active', () => {
    const m = openMatch();
    m.players[0].gapLeft = 16;
    const f = m.step();
    expect(f.segments.some((s) => s.owner === 'a')).toBe(false);
  });
  it('resets geometry and preserves cumulative scores', () => {
    const m = openMatch();
    m.step();
    m.players[0].score = 4;
    m.resetRound();
    expect(m.segments).toHaveLength(0);
    expect(m.players[0].score).toBe(4);
    expect(m.round).toBe(2);
    expect(m.grid.query({ x: 0, y: 0 }, { x: m.width, y: m.width }, 5).size).toBe(0);
  });
  it('requires a unique leader to finish a match', () => {
    const m = openMatch();
    m.players.forEach((p) => (p.score = 10));
    expect(m.winner()).toBeUndefined();
    m.players[0].score++;
    expect(m.winner()?.id).toBe('a');
  });
});
