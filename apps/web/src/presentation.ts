import {
  DT,
  SPEED,
  TRAIL_WIDTH,
  beginMovement,
  modifiers,
  type Curve,
  type Segment,
  type Steering,
} from '@curvey/sim';
import type { Baseline, GameView, GeometryBatch, InputCommand, Phase } from '@curvey/protocol';

export const STEP_MS = DT * 1000;
const MAX_LEAD = 16;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export type PredictedPath = { head: Curve; segments: Segment[] };

/** Replay only kinematics and known gap intervals. Never invent pickups, deaths or scores. */
export function predictPath(
  base: Curve,
  fromTick: number,
  toTick: number,
  commands: readonly InputCommand[],
  worldWidth = Infinity,
): PredictedPath {
  const head = { ...base, effects: [...base.effects] },
    segments: Segment[] = [];
  if (!base.alive) return { head, segments };
  const end = clamp(toTick, fromTick, fromTick + MAX_LEAD);
  let index = 0;
  for (let tick = fromTick + 1; tick <= Math.ceil(end); tick++) {
    let input = head.input;
    while (index < commands.length && commands[index].tick <= tick) input = commands[index++].steer;
    const amount = Math.min(1, end - tick + 1);
    if (amount <= 0) break;
    const initialMods = modifiers(head.effects, tick - 1);
    if (tick >= head.nextGap) {
      head.gapLeft = 16 * initialMods.gap;
      head.nextGap = Infinity;
      head.pathId++;
    }
    const previousAngle = head.angle;
    beginMovement(head, input, tick - 1);
    let elapsed = 0;
    while (elapsed < amount - 1e-8) {
      const now = tick - 1 + elapsed;
      const mod = modifiers(head.effects, now),
        speed = SPEED * mod.speed * DT;
      const dx = Math.cos(head.angle) * speed,
        dy = Math.sin(head.angle) * speed;
      let span = amount - elapsed;
      if (head.gapLeft > 1e-8) span = Math.min(span, head.gapLeft / speed);
      for (const effect of head.effects)
        if (effect.expiresTick > now + 1e-8) span = Math.min(span, effect.expiresTick - now);
      const boundary = (position: number, velocity: number) =>
        velocity < -1e-8
          ? -position / velocity
          : velocity > 1e-8
            ? (worldWidth - position) / velocity
            : Infinity;
      const tx = mod.wrap ? boundary(head.x, dx) : Infinity,
        ty = mod.wrap ? boundary(head.y, dy) : Infinity;
      span = Math.max(0, Math.min(span, tx, ty));
      if (!mod.fly && head.gapLeft <= 1e-8 && span > 1e-8)
        segments.push({
          id: -segments.length - 1,
          tick,
          owner: head.id,
          x1: head.x,
          y1: head.y,
          x2: head.x + dx * span,
          y2: head.y + dy * span,
          width: TRAIL_WIDTH * mod.width,
          distanceEnd: head.distance + speed * span,
          pathId: head.pathId,
          startTime: elapsed,
          endTime: elapsed + span,
        });
      head.x += dx * span;
      head.y += dy * span;
      head.distance += speed * span;
      head.gapLeft = Math.max(0, head.gapLeft - speed * span);
      if (head.gapLeft < 1e-8) head.gapLeft = 0;
      elapsed += span;
      if (Math.abs(tx - span) < 1e-8) {
        head.x = dx < 0 ? worldWidth - 1e-7 : 1e-7;
        head.pathId++;
      }
      if (Math.abs(ty - span) < 1e-8) {
        head.y = dy < 0 ? worldWidth - 1e-7 : 1e-7;
        head.pathId++;
      }
    }
    if (!initialMods.corner) head.angle = previousAngle + (head.angle - previousAngle) * amount;
    head.effects = head.effects.filter((e) => e.expiresTick > tick - 1 + amount);
  }
  return { head, segments };
}

/** Display timeline and bounded unacknowledged inputs. Authoritative data stays untouched. */
export class ArenaPresentation {
  game: GameView | null = null;
  segments: Segment[] = [];
  generation = 0;
  private geometryGeneration = 0;
  private geometrySequence = 0;
  phase: Phase = 'lobby';
  connected = true;
  rtt = 0;
  receivedAt = 0;
  jitter = 0;
  pending: InputCommand[] = [];
  private history: GameView[] = [];
  private anchorTick = 0;
  private anchorAt = 0;
  private clockRate = 1;
  private remoteAnchorTick = 0;
  private remoteClockRate = 1;
  private lastCommandTick = 0;
  private lastCommandSteer: Steering = 0;
  private correction = { x: 0, y: 0, angle: 0, at: 0 };
  constructor(readonly localId = '') {}

  baseline(baseline: Baseline, now: number) {
    this.game = baseline.game;
    this.segments = [...baseline.segments];
    this.geometryGeneration = baseline.game.geometryGeneration;
    this.geometrySequence = baseline.geometrySequence;
    this.generation++;
    this.history = [baseline.game];
    this.pending = [];
    this.receivedAt = now;
    this.anchorTick = baseline.game.tick;
    this.anchorAt = now;
    this.clockRate = this.remoteClockRate = 1;
    this.remoteAnchorTick = baseline.game.tick;
    this.lastCommandTick = 0;
    this.lastCommandSteer = 0;
    this.clearCorrection();
  }
  setPhase(phase: Phase, now: number) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.lastCommandTick = 0;
    this.lastCommandSteer = 0;
    this.pending = [];
    this.clearCorrection();
    this.anchorAt = now;
    this.anchorTick = (this.game?.tick ?? 0) + (phase === 'playing' ? this.lead() : 0);
    this.remoteAnchorTick = this.game?.tick ?? 0;
    this.clockRate = this.remoteClockRate = 1;
  }
  setConnected(connected: boolean) {
    this.connected = connected;
    if (!connected) {
      this.pending = [];
      this.clearCorrection();
    }
  }
  updateRtt(ms: number) {
    if (ms >= 0 && ms < 2000) this.rtt = this.rtt ? this.rtt * 0.8 + ms * 0.2 : ms;
  }
  snapshot(game: GameView, now: number) {
    if (game.round !== this.game?.round || game.tick <= this.game.tick) return;
    if (
      game.geometryGeneration !== this.geometryGeneration ||
      game.geometryCount !== this.segments.length
    )
      return;
    const effectChanged = this.game.players.some((p) => {
      const next = game.players.find((n) => n.id === p.id);
      return (
        next?.pathId !== p.pathId ||
        next.effects.map((e) => e.id).join() !== p.effects.map((e) => e.id).join()
      );
    });
    const oldTarget = this.localTick(now);
    const oldRemote = this.remoteTick(now);
    const previousHead = this.local(now)?.head;
    const expectedInterval = (game.tick - this.game.tick) * STEP_MS;
    this.jitter = clamp(
      this.jitter * 0.9 + Math.abs(now - this.receivedAt - expectedInterval) * 0.1,
      0,
      60,
    );
    this.game = game;
    this.receivedAt = now;
    this.history.push(game);
    if (this.history.length > 20) this.history.shift();
    this.pending = this.pending.filter((c) => c.seq > (game.ack[this.localId] ?? -1));
    // Slew the clock rather than jumping the displayed position on every packet.
    // Keep two ticks free so ordinary packet jitter cannot pin input at the horizon.
    const desired = game.tick + this.lead();
    this.anchorTick = clamp(oldTarget, game.tick, game.tick + MAX_LEAD);
    this.clockRate = 1 + clamp((desired - oldTarget) * 0.02, -0.05, 0.05);
    this.remoteAnchorTick = oldRemote;
    this.remoteClockRate =
      1 + clamp((game.tick - (40 + this.jitter) / STEP_MS - oldRemote) * 0.02, -0.05, 0.05);
    this.anchorAt = now;
    this.clearCorrection();
    const nextHead = this.local(now)?.head;
    if (
      !effectChanged &&
      this.phase === 'playing' &&
      this.connected &&
      previousHead?.alive &&
      nextHead?.alive &&
      Math.hypot(previousHead.x - nextHead.x, previousHead.y - nextHead.y) <= TRAIL_WIDTH * 2
    ) {
      // Only reconcile network corrections. Fresh keyboard intent is never eased.
      this.correction = {
        x: previousHead.x - nextHead.x,
        y: previousHead.y - nextHead.y,
        angle: previousHead.angle - nextHead.angle,
        at: now,
      };
    }
  }
  private clearCorrection() {
    this.correction = { x: 0, y: 0, angle: 0, at: 0 };
  }
  private lead() {
    return clamp(this.rtt / STEP_MS + 1, 1, MAX_LEAD - 2);
  }
  append(batch: GeometryBatch): boolean {
    if (batch.round !== this.game?.round) return true;
    if (batch.sequence <= this.geometrySequence) return true;
    if (batch.sequence !== this.geometrySequence + 1) return false;
    if (batch.clear) {
      if (batch.generation <= this.geometryGeneration || batch.from !== 0) return false;
      this.segments = [];
      this.geometryGeneration = batch.generation;
      this.generation++;
      this.clearCorrection();
      this.history = this.game ? [this.game] : [];
    }
    if (batch.generation !== this.geometryGeneration || batch.from !== this.segments.length)
      return false;
    this.segments.push(...batch.segments);
    this.geometrySequence = batch.sequence;
    return true;
  }
  effectTick(now: number) {
    if (!this.game) return 0;
    if (this.phase !== 'playing' || !this.connected) return this.game.tick;
    // A shared clock for all halos, independent of local input lead/remote interpolation.
    return this.game.tick + clamp((now - this.receivedAt) / STEP_MS, 0, 2);
  }
  localTick(now: number) {
    if (!this.game || this.phase !== 'playing' || !this.connected) return this.game?.tick ?? 0;
    return clamp(
      this.anchorTick + (Math.max(0, now - this.anchorAt) / STEP_MS) * this.clockRate,
      this.game.tick,
      this.game.tick + MAX_LEAD,
    );
  }
  command(seq: number, steer: Steering, now: number): InputCommand | null {
    if (!this.game || !this.connected || this.phase !== 'playing') return null;
    const command = {
      seq,
      steer,
      round: this.game.round,
      tick: Math.max(
        this.lastCommandTick + (steer !== this.lastCommandSteer ? 1 : 0),
        Math.floor(this.localTick(now)) + 1,
      ),
    };
    this.lastCommandTick = command.tick;
    this.lastCommandSteer = steer;
    // Heartbeats at the same tick supersede earlier intent; keep input history bounded on stalls.
    this.pending = this.pending.filter((c) => c.tick !== command.tick);
    this.pending.push(command);
    if (this.pending.length > 64) this.pending.shift();
    return command;
  }
  local(now: number): PredictedPath | null {
    const base = this.game?.players.find((p) => p.id === this.localId);
    if (!base || !this.game) return null;
    const path = predictPath(
      base,
      this.game.tick,
      this.localTick(now),
      this.pending,
      this.game.width,
    );
    if (!base.alive || !this.connected || this.phase !== 'playing') return path;
    const decay = Math.exp(-Math.max(0, now - this.correction.at) / 60);
    const dx = this.correction.x * decay,
      dy = this.correction.y * decay;
    const distance = path.head.distance - base.distance;
    // Blend from the exact confirmed endpoint to the corrected head. Never move
    // cached authority or bridge gaps; only the speculative tip bends slightly.
    for (const segment of path.segments) {
      const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
      const end = clamp((segment.distanceEnd - base.distance) / (distance || 1), 0, 1);
      const start = clamp((segment.distanceEnd - length - base.distance) / (distance || 1), 0, 1);
      segment.x1 += dx * start;
      segment.y1 += dy * start;
      segment.x2 += dx * end;
      segment.y2 += dy * end;
    }
    path.head.x += dx;
    path.head.y += dy;
    path.head.angle += this.correction.angle * decay;
    return path;
  }
  remoteTick(now: number) {
    if (!this.game) return 0;
    if (this.phase !== 'playing' || !this.connected) return this.game.tick;
    return clamp(
      this.remoteAnchorTick + (Math.max(0, now - this.anchorAt) / STEP_MS) * this.remoteClockRate,
      this.history[0]?.tick ?? 0,
      this.game.tick + 2,
    );
  }
  remote(id: string, tick: number): PredictedPath | null {
    const latest = this.game?.players.find((p) => p.id === id);
    if (!latest || !this.game) return null;
    if (!latest.alive || this.phase !== 'playing' || !this.connected)
      return { head: latest, segments: [] };
    if (tick > this.game.tick)
      return predictPath(latest, this.game.tick, tick, [], this.game.width);
    let before = this.history[0],
      after = this.game;
    for (const snapshot of this.history) {
      if (snapshot.tick <= tick) before = snapshot;
      if (snapshot.tick >= tick) {
        after = snapshot;
        break;
      }
    }
    const a = before.players.find((p) => p.id === id)!,
      b = after.players.find((p) => p.id === id)!;
    if (
      Math.hypot(b.x - a.x, b.y - a.y) > this.game.width / 2 ||
      before.geometryGeneration !== after.geometryGeneration
    )
      return { head: b, segments: [] };
    const t = clamp((tick - before.tick) / (after.tick - before.tick || 1), 0, 1);
    return {
      head: {
        ...a,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: a.angle + (b.angle - a.angle) * t,
      },
      segments: [],
    };
  }
}
