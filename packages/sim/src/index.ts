/** Headless, fixed-step rules. No network, wall-clock or browser state belongs here. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SPEED = 94.38;
export const TURN_RADIUS = 35;
export const TRAIL_WIDTH = 5;
export const RULESET_VERSION = 5;
export type Steering = -1 | 0 | 1;
/** Shared by authority and prediction. One fixed movement step, without collision decisions. */
export function movementStep(angle: number, steer: Steering) {
  const nextAngle = angle + ((steer * SPEED) / TURN_RADIUS) * DT;
  return {
    angle: nextAngle,
    dx: Math.cos(nextAngle) * SPEED * DT,
    dy: Math.sin(nextAngle) * SPEED * DT,
  };
}
export type Point = { x: number; y: number };
export type Participant = { id: string; name: string; color: string };
export type Curve = Participant &
  Point & {
    angle: number;
    alive: boolean;
    score: number;
    distance: number;
    gapLeft: number;
    nextGap: number;
    input: Steering;
  };
export type Segment = {
  id: number;
  tick: number;
  owner: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  distanceEnd: number;
};
export type Frame = { tick: number; segments: Segment[]; deaths: string[]; roundOver: boolean };

const EPS = 1e-8;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export function segmentDistanceSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}

/** Earliest time a moving point touches a capsule, including its rounded end caps. */
export function sweepCapsule(p: Point, d: Point, a: Point, b: Point, radius: number): number {
  if (segmentDistanceSquared(p, a, b) <= radius * radius + EPS) return 0;
  let hit = Infinity;
  const circle = (c: Point) => {
    const x = p.x - c.x,
      y = p.y - c.y;
    const aa = d.x * d.x + d.y * d.y;
    if (aa < EPS) return;
    const bb = 2 * (x * d.x + y * d.y),
      cc = x * x + y * y - radius * radius;
    const disc = bb * bb - 4 * aa * cc;
    if (disc < 0) return;
    const t = (-bb - Math.sqrt(disc)) / (2 * aa);
    if (t >= -EPS && t <= 1 + EPS) hit = Math.min(hit, clamp01(t));
  };
  circle(a);
  circle(b);
  const sx = b.x - a.x,
    sy = b.y - a.y,
    len = Math.hypot(sx, sy);
  if (len > EPS) {
    const nx = -sy / len,
      ny = sx / len;
    const start = (p.x - a.x) * nx + (p.y - a.y) * ny,
      velocity = d.x * nx + d.y * ny;
    if (Math.abs(velocity) > EPS)
      for (const side of [-radius, radius]) {
        const t = (side - start) / velocity;
        const along = ((p.x + d.x * t - a.x) * sx + (p.y + d.y * t - a.y) * sy) / (len * len);
        if (t >= 0 && t <= 1 && along >= 0 && along <= 1) hit = Math.min(hit, t);
      }
  }
  return hit;
}

export class SpatialGrid {
  private cells = new Map<string, Segment[]>();
  constructor(readonly cellSize = 24) {}
  private keys(x1: number, y1: number, x2: number, y2: number, padding: number): string[] {
    const keys: string[] = [];
    for (
      let x = Math.floor((Math.min(x1, x2) - padding) / this.cellSize);
      x <= Math.floor((Math.max(x1, x2) + padding) / this.cellSize);
      x++
    )
      for (
        let y = Math.floor((Math.min(y1, y2) - padding) / this.cellSize);
        y <= Math.floor((Math.max(y1, y2) + padding) / this.cellSize);
        y++
      )
        keys.push(`${x},${y}`);
    return keys;
  }
  add(segment: Segment) {
    for (const key of this.keys(
      segment.x1,
      segment.y1,
      segment.x2,
      segment.y2,
      segment.width / 2,
    )) {
      const cell = this.cells.get(key);
      if (cell) cell.push(segment);
      else this.cells.set(key, [segment]);
    }
  }
  query(a: Point, b: Point, radius: number): Set<Segment> {
    const result = new Set<Segment>();
    for (const key of this.keys(a.x, a.y, b.x, b.y, radius))
      for (const s of this.cells.get(key) ?? []) result.add(s);
    return result;
  }
  clear() {
    this.cells.clear();
  }
}

export class Match {
  tick = 0;
  round = 0;
  players: Curve[];
  segments: Segment[] = [];
  grid = new SpatialGrid();
  width: number;
  over = false;
  private rng: number;
  private nextSegment = 0;
  private pendingDeaths = new Set<string>();
  constructor(
    players: Participant[],
    seed: number,
    readonly target = 10,
  ) {
    if (players.length < 2 || players.length > 32)
      throw new Error('A match requires 2–32 players.');
    if (new Set(players.map((p) => p.id)).size !== players.length)
      throw new Error('Duplicate player ID.');
    this.rng = seed >>> 0 || 1;
    this.width = Math.round(Math.max(600, 900 * Math.sqrt(players.length / 8)));
    this.players = players.map((p) => ({
      ...p,
      x: 0,
      y: 0,
      angle: 0,
      alive: true,
      score: 0,
      distance: 0,
      gapLeft: 0,
      nextGap: 0,
      input: 0,
    }));
    this.resetRound();
  }
  random(): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }
  private gapInterval() {
    return Math.ceil((0.4 - Math.log(Math.max(1e-8, 1 - this.random())) / 0.5) * TICK_RATE);
  }
  resetRound() {
    this.tick = 0;
    this.round++;
    this.over = false;
    this.segments = [];
    this.grid.clear();
    this.nextSegment = 0;
    this.pendingDeaths.clear();
    const offset = this.random() * Math.PI * 2;
    this.players.forEach((p, i) => {
      const a = offset + (i * Math.PI * 2) / this.players.length;
      Object.assign(p, {
        x: this.width / 2 + Math.cos(a) * this.width * 0.3,
        y: this.width / 2 + Math.sin(a) * this.width * 0.3,
        angle: a + Math.PI + (this.random() - 0.5),
        alive: true,
        distance: 0,
        gapLeft: 0,
        nextGap: this.gapInterval(),
        input: 0,
      });
    });
  }
  eliminate(id: string) {
    if (this.players.some((p) => p.id === id && p.alive)) this.pendingDeaths.add(id);
  }
  winner(): Curve | undefined {
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    return sorted[0].score >= this.target && sorted[0].score > sorted[1].score
      ? sorted[0]
      : undefined;
  }
  private award(ids: string[], deaths: string[]) {
    const dead = this.players.filter((p) => p.alive && ids.includes(p.id));
    dead.forEach((p) => {
      p.alive = false;
      deaths.push(p.id);
    });
    this.players
      .filter((p) => p.alive)
      .forEach((p) => {
        p.score += dead.length;
      });
  }
  step(inputs: Readonly<Record<string, Steering>> = {}): Frame {
    if (this.over) return { tick: this.tick, segments: [], deaths: [], roundOver: true };
    this.tick++;
    const deaths: string[] = [],
      added: Segment[] = [];
    this.award([...this.pendingDeaths], deaths);
    this.pendingDeaths.clear();
    const proposals = this.players
      .filter((p) => p.alive)
      .map((p) => {
        p.input = inputs[p.id] ?? 0;
        const movement = movementStep(p.angle, p.input);
        p.angle = movement.angle;
        if (this.tick >= p.nextGap) {
          p.gapLeft = 16;
          p.nextGap = this.tick + this.gapInterval();
        }
        const d = { x: movement.dx, y: movement.dy };
        const holeFraction = Math.min(1, p.gapLeft / (SPEED * DT));
        let hit = Infinity;
        const radius = TRAIL_WIDTH / 2;
        // Walls remain solid in the initial slice. Flight/wall fidelity is a later gate.
        if (d.x < 0) hit = Math.min(hit, (radius - p.x) / d.x);
        if (d.x > 0) hit = Math.min(hit, (this.width - radius - p.x) / d.x);
        if (d.y < 0) hit = Math.min(hit, (radius - p.y) / d.y);
        if (d.y > 0) hit = Math.min(hit, (this.width - radius - p.y) / d.y);
        if (hit < 0 || hit > 1) hit = Infinity;
        const bodyStart = { x: p.x + d.x * holeFraction, y: p.y + d.y * holeFraction };
        if (holeFraction < 1)
          for (const s of this.grid.query(bodyStart, { x: p.x + d.x, y: p.y + d.y }, radius)) {
            if (s.owner === p.id && p.distance - s.distanceEnd < TRAIL_WIDTH * 1.2) continue;
            const t = sweepCapsule(
              bodyStart,
              { x: d.x * (1 - holeFraction), y: d.y * (1 - holeFraction) },
              { x: s.x1, y: s.y1 },
              { x: s.x2, y: s.y2 },
              radius + s.width / 2,
            );
            hit = Math.min(hit, holeFraction + t * (1 - holeFraction));
          }
        return { p, d, holeFraction, hit };
      });
    // Moving-head contacts are symmetric; committed geometry is handled above.
    const contacts: { time: number; ids: string[] }[] = [];
    for (const a of proposals) if (a.hit <= 1) contacts.push({ time: a.hit, ids: [a.p.id] });
    for (let i = 0; i < proposals.length; i++)
      for (let j = i + 1; j < proposals.length; j++) {
        const a = proposals[i],
          b = proposals[j];
        const start = Math.max(a.holeFraction, b.holeFraction);
        if (start >= 1) continue;
        const p = {
          x: a.p.x - b.p.x + (a.d.x - b.d.x) * start,
          y: a.p.y - b.p.y + (a.d.y - b.d.y) * start,
        };
        const d = { x: (a.d.x - b.d.x) * (1 - start), y: (a.d.y - b.d.y) * (1 - start) };
        const t =
          start + sweepCapsule(p, d, { x: 0, y: 0 }, { x: 0, y: 0 }, TRAIL_WIDTH) * (1 - start);
        if (t <= 1 && t <= a.hit + EPS && t <= b.hit + EPS)
          contacts.push({ time: t, ids: [a.p.id, b.p.id] });
      }
    contacts.sort((a, b) => a.time - b.time);
    const endTimes = new Map<string, number>();
    for (let i = 0; i < contacts.length; ) {
      const time = contacts[i].time,
        group = new Set<string>();
      while (i < contacts.length && Math.abs(contacts[i].time - time) < EPS) {
        const contact = contacts[i++];
        if (contact.ids.every((id) => !endTimes.has(id)))
          contact.ids.forEach((id) => group.add(id));
      }
      group.forEach((id) => endTimes.set(id, time));
      this.award([...group], deaths);
    }
    for (const { p, d, holeFraction } of proposals) {
      const end = endTimes.get(p.id) ?? 1;
      if (end > holeFraction) {
        const s: Segment = {
          id: this.nextSegment++,
          tick: this.tick,
          owner: p.id,
          x1: p.x + d.x * holeFraction,
          y1: p.y + d.y * holeFraction,
          x2: p.x + d.x * end,
          y2: p.y + d.y * end,
          width: TRAIL_WIDTH,
          distanceEnd: p.distance + SPEED * DT * end,
        };
        this.segments.push(s);
        this.grid.add(s);
        added.push(s);
      }
      p.x += d.x * end;
      p.y += d.y * end;
      p.distance += SPEED * DT * end;
      p.gapLeft = Math.max(0, p.gapLeft - SPEED * DT * end);
    }
    this.over = this.players.filter((p) => p.alive).length <= 1 || this.tick >= TICK_RATE * 600;
    return { tick: this.tick, segments: added, deaths, roundOver: this.over };
  }
}
