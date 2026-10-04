import {
  EFFECTS,
  modifiers,
  chooseEffect,
  PICKUP_RADIUS,
  DROP_LIMIT,
  INITIAL_DROP_SECONDS,
  MIN_DROP_INTERVAL_SECONDS,
  MEAN_DROP_INTERVAL_SECONDS,
  type EffectInstance,
  type EffectKind,
  type Pickup,
  type Preset,
  type Collection,
} from './effects';
export * from './effects';
/** Headless, fixed-step rules. No network, wall-clock or browser state belongs here. */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SPEED = 124.81755;
export const TURN_RADIUS = 35;
export const TRAIL_WIDTH = 5;
// Room for a full base-radius turn plus reaction time before reaching a wall.
export const SPAWN_MARGIN = 120;
export const SPAWN_SEPARATION = 4 * TURN_RADIUS + 2 * TRAIL_WIDTH;
export const RULESET_VERSION = 11;
export type Steering = -1 | 0 | 1;
/** Shared by authority and prediction. One fixed movement step, without collision decisions. */
export function movementStep(angle: number, steer: Steering, speed = SPEED, radius = TURN_RADIUS) {
  const nextAngle = angle + ((steer * speed) / radius) * DT;
  return {
    angle: nextAngle,
    dx: Math.cos(nextAngle) * speed * DT,
    dy: Math.sin(nextAngle) * speed * DT,
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
    previousInput: Steering;
    effects: EffectInstance[];
    pathId: number;
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
  pathId?: number;
  startTime?: number;
  endTime?: number;
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

/** Heading changes once per fixed tick; collection changes speed/width immediately. */
export function beginMovement(p: Curve, input: Steering, tick: number) {
  const mod = modifiers(p.effects, tick);
  const steer = (mod.reverse ? -input : input) as Steering;
  if (mod.corner) {
    if (input !== 0 && input !== p.previousInput) p.angle += (steer * Math.PI) / 2;
  } else p.angle = movementStep(p.angle, steer, SPEED * mod.speed, TURN_RADIUS * mod.radius).angle;
  p.input = input;
  p.previousInput = input;
}

/** Contact with the portion of B's new trail that exists at time t, never future geometry. */
export function sweepGrowingTrail(
  a: Point,
  ad: Point,
  b: Point,
  bd: Point,
  radius: number,
): number {
  let hit = sweepCapsule(a, ad, b, b, radius);
  const length = Math.hypot(bd.x, bd.y);
  if (length < EPS) return hit;
  const nx = -bd.y / length,
    ny = bd.x / length;
  const start = (a.x - b.x) * nx + (a.y - b.y) * ny,
    velocity = ad.x * nx + ad.y * ny;
  if (Math.abs(velocity) > EPS)
    for (const side of [-radius, radius]) {
      const t = (side - start) / velocity;
      const along =
        ((a.x + ad.x * t - b.x) * bd.x + (a.y + ad.y * t - b.y) * bd.y) / (length * length);
      if (t >= 0 && t <= 1 && along >= 0 && along <= t + EPS) hit = Math.min(hit, t);
    }
  return hit;
}

export class Match {
  tick = 0;
  round = 0;
  players: Curve[];
  segments: Segment[] = [];
  grid = new SpatialGrid();
  width: number;
  over = false;
  pickups: Pickup[] = [];
  globalEffects: EffectInstance[] = [];
  collections: Collection[] = [];
  geometryGeneration = 0;
  private dropRng: number;
  private nextPickup = 0;
  private nextEffect = 0;
  private dropBudget = INITIAL_DROP_SECONDS * TICK_RATE;
  private rng: number;
  private nextSegment = 0;
  private pendingDeaths = new Set<string>();
  constructor(
    players: Participant[],
    seed: number,
    readonly target = 10,
    readonly preset: Preset = 'None',
  ) {
    if (players.length < 2 || players.length > 32)
      throw new Error('A match requires 2–32 players.');
    if (new Set(players.map((p) => p.id)).size !== players.length)
      throw new Error('Duplicate player ID.');
    this.rng = seed >>> 0 || 1;
    this.dropRng = (seed ^ 0x9e3779b9) >>> 0 || 1;
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
      previousInput: 0,
      effects: [],
      pathId: 0,
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
    this.geometryGeneration++;
    this.pickups = [];
    this.globalEffects = [];
    this.collections = [];
    this.dropBudget = INITIAL_DROP_SECONDS * TICK_RATE;
    this.nextPickup = this.nextEffect = 0;
    this.pendingDeaths.clear();
    const positions: Point[] = [];
    const span = this.width - 2 * SPAWN_MARGIN;
    for (let i = 0; i < this.players.length; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 256; attempt++) {
        const point = {
          x: SPAWN_MARGIN + this.random() * span,
          y: SPAWN_MARGIN + this.random() * span,
        };
        if (positions.some((q) => Math.hypot(q.x - point.x, q.y - point.y) < SPAWN_SEPARATION))
          continue;
        positions.push(point);
        placed = true;
        break;
      }
      if (!placed) {
        // Bounded fallback: shuffle a safely spaced interior grid, never relax clearance.
        const side = Math.ceil(Math.sqrt(this.players.length));
        const slots = Array.from({ length: side * side }, (_, j) => ({
          x: SPAWN_MARGIN + ((j % side) * span) / (side - 1),
          y: SPAWN_MARGIN + (Math.floor(j / side) * span) / (side - 1),
        }));
        for (let j = slots.length - 1; j > 0; j--) {
          const k = Math.floor(this.random() * (j + 1));
          [slots[j], slots[k]] = [slots[k], slots[j]];
        }
        positions.splice(0, positions.length, ...slots.slice(0, this.players.length));
        break;
      }
    }
    this.players.forEach((p, i) => {
      Object.assign(p, {
        ...positions[i],
        angle: this.random() * Math.PI * 2,
        alive: true,
        distance: 0,
        gapLeft: 0,
        nextGap: this.gapInterval(),
        input: 0,
        previousInput: 0,
        effects: [],
        pathId: 0,
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
  private dropRandom(): number {
    let x = this.dropRng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.dropRng = x >>> 0;
    return this.dropRng / 4294967296;
  }
  private spawn() {
    if (this.pickups.length >= DROP_LIMIT) return;
    const kind = chooseEffect(this.preset, this.dropRandom());
    if (!kind) return;
    const margin = PICKUP_RADIUS + 6;
    for (let attempt = 0; attempt < 24; attempt++) {
      const point = {
        x: margin + this.dropRandom() * (this.width - 2 * margin),
        y: margin + this.dropRandom() * (this.width - 2 * margin),
      };
      if (this.pickups.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 2 * margin)) continue;
      if (
        this.players.some(
          (p) =>
            p.alive &&
            segmentDistanceSquared(point, p, {
              x: p.x + Math.cos(p.angle) * SPEED * modifiers(p.effects, this.tick).speed * 0.35,
              y: p.y + Math.sin(p.angle) * SPEED * modifiers(p.effects, this.tick).speed * 0.35,
            }) <
              (margin + (TRAIL_WIDTH * modifiers(p.effects, this.tick).width) / 2) ** 2,
        )
      )
        continue;
      if (
        [...this.grid.query(point, point, margin)].some(
          (s) =>
            segmentDistanceSquared(point, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <=
            (margin + s.width / 2) ** 2,
        )
      )
        continue;
      this.pickups.push({
        ...point,
        kind,
        id: this.nextPickup++,
        spawnTick: this.tick,
        expiresTick: this.tick + 12 * TICK_RATE,
      });
      return;
    }
  }
  private collect(pickup: Pickup, collector: Curve, time: number) {
    this.pickups = this.pickups.filter((p) => p.id !== pickup.id);
    this.collections.push({ ...pickup, collector: collector.id, tick: time });
    const definition = EFFECTS[pickup.kind];
    if (pickup.kind === 'eraser') {
      this.segments = [];
      this.grid.clear();
      this.geometryGeneration++;
      this.players.forEach((p) => p.pathId++);
      return;
    }
    const instance = {
      id: this.nextEffect++,
      kind: pickup.kind,
      startTick: time,
      expiresTick: time + definition.duration * TICK_RATE,
    };
    if (definition.target === 'all') this.globalEffects.push(instance);
    for (const p of this.players) {
      if (
        !p.alive ||
        (definition.target === 'self' && p.id !== collector.id) ||
        (definition.target === 'others' && p.id === collector.id)
      )
        continue;
      p.effects.push(instance);
    }
  }
  step(inputs: Readonly<Record<string, Steering>> = {}): Frame {
    if (this.over) return { tick: this.tick, segments: [], deaths: [], roundOver: true };
    this.tick++;
    const deaths: string[] = [];
    const firstIndex = this.segments.length;
    const generation = this.geometryGeneration;
    this.collections = this.collections.filter((c) => c.tick > this.tick - TICK_RATE);
    this.pickups = this.pickups.filter((p) => p.expiresTick > this.tick - 1);
    this.award([...this.pendingDeaths], deaths);
    this.pendingDeaths.clear();
    for (const p of this.players) {
      p.effects = p.effects.filter((e) => e.expiresTick > this.tick - 1);
      if (!p.alive) continue;
      const mods = modifiers(p.effects, this.tick - 1);
      if (this.tick >= p.nextGap) {
        p.gapLeft = 16 * mods.gap;
        p.nextGap = this.tick + this.gapInterval();
        p.pathId++;
      }
      beginMovement(p, inputs[p.id] ?? 0, this.tick - 1);
    }
    let elapsed = 0;
    while (elapsed < 1 - EPS) {
      const now = this.tick - 1 + elapsed;
      const moving = this.players
        .filter((p) => p.alive)
        .map((p) => {
          const mod = modifiers(p.effects, now);
          const speed = SPEED * mod.speed * DT;
          return {
            p,
            mod,
            speed,
            d: { x: Math.cos(p.angle) * speed, y: Math.sin(p.angle) * speed },
            solid: !mod.fly && p.gapLeft <= EPS,
            radius: (TRAIL_WIDTH * mod.width) / 2,
          };
        });
      if (!moving.length) break;
      let span = 1 - elapsed;
      // Every change of geometry or kinematics is a new continuous interval.
      for (const { p, speed } of moving) {
        if (p.gapLeft > EPS) span = Math.min(span, p.gapLeft / speed);
        for (const e of p.effects)
          if (e.expiresTick > now + EPS) span = Math.min(span, e.expiresTick - now);
      }
      for (const e of this.globalEffects)
        if (e.expiresTick > now + EPS) span = Math.min(span, e.expiresTick - now);
      type Event = {
        time: number;
        kind: 'death' | 'wrap' | 'pickup';
        ids: string[];
        pickup?: Pickup;
        axis?: 'x' | 'y';
      };
      const events: Event[] = [];
      for (const a of moving) {
        const { p, d, radius, solid, mod } = a;
        for (const axis of ['x', 'y'] as const) {
          const low = mod.wrap ? 0 : radius,
            high = this.width - low;
          const time =
            p[axis] < low - EPS || p[axis] > high + EPS
              ? 0
              : d[axis] < -EPS
                ? (low - p[axis]) / d[axis]
                : d[axis] > EPS
                  ? (high - p[axis]) / d[axis]
                  : Infinity;
          if (time >= -EPS && time <= span + EPS)
            events.push({
              time: Math.max(0, time),
              kind: mod.wrap ? 'wrap' : 'death',
              ids: [p.id],
              axis,
            });
        }
        if (solid)
          for (const s of this.grid.query(
            p,
            { x: p.x + d.x * span, y: p.y + d.y * span },
            radius,
          )) {
            // Only the connected, recent own tail is exempt. Wraps/holes break continuity.
            if (
              s.owner === p.id &&
              (s.pathId ?? 0) === p.pathId &&
              p.distance - s.distanceEnd < (radius + s.width / 2) * 1.2
            )
              continue;
            const time =
              sweepCapsule(
                p,
                { x: d.x * span, y: d.y * span },
                { x: s.x1, y: s.y1 },
                { x: s.x2, y: s.y2 },
                radius + s.width / 2,
              ) * span;
            if (time <= span + EPS) events.push({ time, kind: 'death', ids: [p.id] });
          }
        for (const pickup of this.pickups) {
          const time =
            sweepCapsule(p, { x: d.x * span, y: d.y * span }, pickup, pickup, PICKUP_RADIUS) * span;
          if (time <= span + EPS) events.push({ time, kind: 'pickup', ids: [p.id], pickup });
        }
      }
      for (let i = 0; i < moving.length; i++)
        for (let j = i + 1; j < moving.length; j++) {
          const a = moving[i],
            b = moving[j];
          if (!a.solid || !b.solid) continue;
          const ad = { x: a.d.x * span, y: a.d.y * span },
            bd = { x: b.d.x * span, y: b.d.y * span };
          const headTime =
            sweepCapsule(
              { x: a.p.x - b.p.x, y: a.p.y - b.p.y },
              { x: ad.x - bd.x, y: ad.y - bd.y },
              { x: 0, y: 0 },
              { x: 0, y: 0 },
              a.radius + b.radius,
            ) * span;
          if (headTime <= span + EPS)
            events.push({ time: headTime, kind: 'death', ids: [a.p.id, b.p.id] });
          const at = sweepGrowingTrail(a.p, ad, b.p, bd, a.radius + b.radius) * span;
          const bt = sweepGrowingTrail(b.p, bd, a.p, ad, a.radius + b.radius) * span;
          if (at <= span + EPS) events.push({ time: at, kind: 'death', ids: [a.p.id] });
          if (bt <= span + EPS) events.push({ time: bt, kind: 'death', ids: [b.p.id] });
        }
      const duration = Math.max(0, Math.min(span, ...events.map((e) => e.time)));
      for (const { p, d, speed, solid, mod } of moving) {
        if (solid && duration > EPS) {
          const segment: Segment = {
            id: this.nextSegment++,
            tick: this.tick,
            owner: p.id,
            x1: p.x,
            y1: p.y,
            x2: p.x + d.x * duration,
            y2: p.y + d.y * duration,
            width: TRAIL_WIDTH * mod.width,
            distanceEnd: p.distance + speed * duration,
            pathId: p.pathId,
            startTime: elapsed,
            endTime: elapsed + duration,
          };
          this.segments.push(segment);
          this.grid.add(segment);
        }
        p.x += d.x * duration;
        p.y += d.y * duration;
        p.distance += speed * duration;
        p.gapLeft = Math.max(0, p.gapLeft - speed * duration);
        if (p.gapLeft < EPS) p.gapLeft = 0;
      }
      // Integrate spawn intensity, including fractional Bubbles activation/expiry.
      if (this.preset !== 'None')
        this.dropBudget -= duration * modifiers(this.globalEffects, now).drops;
      elapsed += duration;
      const contacts = events.filter((e) => Math.abs(e.time - duration) < EPS);
      const deathIds = new Set(contacts.filter((e) => e.kind === 'death').flatMap((e) => e.ids));
      for (const e of contacts.filter((e) => e.kind === 'wrap')) {
        const p = this.players.find((p) => p.id === e.ids[0])!;
        if (deathIds.has(p.id)) continue;
        const axis = e.axis!;
        // Nudge inward only by numerical epsilon, preventing zero-time repeat wraps.
        p[axis] = p[axis] < this.width / 2 ? this.width - EPS * 10 : EPS * 10;
        p.pathId++;
      }
      // Expiry/gap endings and wrap arrivals take effect at this exact contact time.
      // Include their collisions in the same death group before awarding any pickups.
      const atContact = moving.map(({ p }) => ({
        p,
        mod: modifiers(p.effects, this.tick - 1 + elapsed),
      }));
      for (const { p, mod } of atContact) {
        const radius = (TRAIL_WIDTH * mod.width) / 2;
        if (
          !mod.wrap &&
          (p.x < radius - EPS ||
            p.y < radius - EPS ||
            p.x > this.width - radius + EPS ||
            p.y > this.width - radius + EPS)
        )
          deathIds.add(p.id);
        if (mod.fly || p.gapLeft > EPS) continue;
        for (const segment of this.grid.query(p, p, radius)) {
          if (
            segment.owner === p.id &&
            (segment.pathId ?? 0) === p.pathId &&
            p.distance - segment.distanceEnd < (radius + segment.width / 2) * 1.2
          )
            continue;
          if (
            segmentDistanceSquared(
              p,
              { x: segment.x1, y: segment.y1 },
              { x: segment.x2, y: segment.y2 },
            ) <=
            (radius + segment.width / 2) ** 2 + EPS
          )
            deathIds.add(p.id);
        }
      }
      for (let i = 0; i < atContact.length; i++)
        for (let j = i + 1; j < atContact.length; j++) {
          const a = atContact[i],
            b = atContact[j];
          if (a.mod.fly || b.mod.fly || a.p.gapLeft > EPS || b.p.gapLeft > EPS) continue;
          if (
            (a.p.x - b.p.x) ** 2 + (a.p.y - b.p.y) ** 2 <=
            ((TRAIL_WIDTH * (a.mod.width + b.mod.width)) / 2) ** 2 + EPS
          ) {
            deathIds.add(a.p.id);
            deathIds.add(b.p.id);
          }
        }
      this.award([...deathIds], deaths);
      const pickupIds = [
        ...new Set(contacts.filter((e) => e.kind === 'pickup').map((e) => e.pickup!.id)),
      ].sort((a, b) => a - b);
      // Targets are the survivors of this time group; pickup IDs define instant-effect order.
      for (const id of pickupIds) {
        const candidates = [
          ...new Set(
            contacts
              .filter((e) => e.kind === 'pickup' && e.pickup!.id === id)
              .flatMap((e) => e.ids),
          ),
        ]
          .sort()
          .map((id) => this.players.find((p) => p.id === id)!)
          .filter((p) => p.alive);
        if (!candidates.length) continue;
        const pickup = this.pickups.find((p) => p.id === id);
        if (pickup)
          this.collect(
            pickup,
            candidates.length === 1
              ? candidates[0]
              : candidates[Math.floor(this.dropRandom() * candidates.length)],
            this.tick - 1 + elapsed,
          );
      }
      // Each zero-time event consumes a pickup, kills a curve, or crosses a boundary.
      // Otherwise span always advances to a gap/expiry/tick boundary.
    }
    this.pickups = this.pickups.filter((p) => p.expiresTick > this.tick);
    this.globalEffects = this.globalEffects.filter((e) => e.expiresTick > this.tick);
    for (const p of this.players) p.effects = p.effects.filter((e) => e.expiresTick > this.tick);
    if (this.preset !== 'None' && this.dropBudget <= EPS) {
      this.spawn();
      this.dropBudget =
        (MIN_DROP_INTERVAL_SECONDS -
          Math.log(Math.max(1e-8, 1 - this.dropRandom())) *
            (MEAN_DROP_INTERVAL_SECONDS - MIN_DROP_INTERVAL_SECONDS)) *
        TICK_RATE;
    }
    this.over = this.players.filter((p) => p.alive).length <= 1 || this.tick >= TICK_RATE * 600;
    return {
      tick: this.tick,
      segments: this.segments.slice(generation === this.geometryGeneration ? firstIndex : 0),
      deaths,
      roundOver: this.over,
    };
  }
}
