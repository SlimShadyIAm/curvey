import { describe, expect, it } from 'vitest';
import { Match, type Curve } from '@curvey/sim';
import type { GameView, InputCommand } from '@curvey/protocol';
import { ArenaPresentation, predictPath, STEP_MS } from './presentation';

const players = [
  { id: 'a', name: 'Ada', color: '#c4ec78' },
  { id: 'b', name: 'Bo', color: '#80c7ff' },
];
function scene() {
  const match = new Match(players, 12);
  Object.assign(match.players[0], { x: 70, y: 100, angle: 0, nextGap: Infinity });
  Object.assign(match.players[1], { x: 250, y: 250, angle: 0, nextGap: Infinity });
  const game: GameView = {
    tick: 0,
    round: 1,
    width: match.width,
    players: match.players.map((p) => ({ ...p })),
    ack: {},
  };
  const presentation = new ArenaPresentation('a');
  presentation.baseline({ game, segments: [] }, 0);
  presentation.updateRtt(100);
  presentation.setPhase('playing', 0);
  return { match, presentation, game };
}

describe('prediction and presentation', () => {
  it('smooths reconciliation while attaching the speculative tip to confirmed geometry', () => {
    const { presentation, game } = scene();
    const before = presentation.local(20)!.head;
    const authoritative = predictPath(game.players[0], 0, 1, []).head;
    authoritative.y += 1;
    presentation.snapshot({ ...game, tick: 1, players: [authoritative, game.players[1]] }, 20);
    const after = presentation.local(20)!;
    expect(after.head.x).toBeCloseTo(before.x, 8);
    expect(after.head.y).toBeCloseTo(before.y, 8);
    expect(after.segments[0].x1).toBeCloseTo(authoritative.x, 8);
    expect(after.segments[0].y1).toBeCloseTo(authoritative.y, 8);
    expect(after.segments.at(-1)!.x2).toBeCloseTo(after.head.x, 8);
    expect(after.segments.at(-1)!.y2).toBeCloseTo(after.head.y, 8);
    expect(presentation.local(200)!.head.y).toBeCloseTo(authoritative.y, 1);
    presentation.command(1, -1, 21);
    expect(presentation.local(29)!.head.angle).toBeLessThan(after.head.angle);
  });

  it('keeps input headroom at a 200ms round trip', () => {
    const { presentation } = scene();
    presentation.rtt = 200;
    presentation.setPhase('countdown', 0);
    presentation.setPhase('playing', 0);
    const before = presentation.local(1)!.head.angle;
    presentation.command(1, -1, 1);
    expect(presentation.local(8)!.head.angle).toBeLessThan(before);
  });

  it('does not jump presentation clocks when jittered packets or RTT samples arrive', () => {
    const { presentation, game } = scene();
    for (let tick = 1; tick <= 100; tick++) {
      const now = tick * STEP_MS + (tick % 2 ? 5 : 0);
      const localBefore = presentation.localTick(now);
      const remoteBefore = presentation.remoteTick(now);
      presentation.updateRtt(tick % 2 ? 80 : 120);
      presentation.snapshot({ ...game, tick }, now);
      expect(presentation.localTick(now)).toBeCloseTo(localBefore, 8);
      expect(presentation.remoteTick(now)).toBeCloseTo(remoteBefore, 8);
      const advance = presentation.localTick(now + 4) - localBefore;
      expect(advance).toBeGreaterThanOrEqual((4 / STEP_MS) * 0.95 - 1e-10);
      expect(advance).toBeLessThanOrEqual((4 / STEP_MS) * 1.05 + 1e-10);
    }
  });

  it('turns before any server acknowledgement arrives', () => {
    const { presentation, game } = scene();
    presentation.command(1, -1, 10);
    const head = presentation.local(16)!.head;
    expect(head.angle).toBeLessThan(game.players[0].angle);
    expect(presentation.pending).toHaveLength(1);
    expect(game.players[0].angle).toBe(0);
  });

  it('replays identical full steps to the server for changing steering', () => {
    const { match, game } = scene();
    const commands: InputCommand[] = [
      { tick: 1, round: 1, seq: 0, steer: -1 },
      { tick: 4, round: 1, seq: 1, steer: 1 },
      { tick: 8, round: 1, seq: 2, steer: 0 },
    ];
    for (let tick = 1; tick <= 10; tick++)
      match.step({ a: commands.filter((c) => c.tick <= tick).at(-1)!.steer });
    const predicted = predictPath(game.players[0], 0, 10, commands).head;
    expect(predicted.x).toBe(match.players[0].x);
    expect(predicted.y).toBe(match.players[0].y);
    expect(predicted.angle).toBe(match.players[0].angle);
  });

  it('uses the authoritative baseline and drops acknowledged commands', () => {
    const { presentation, game } = scene();
    presentation.command(1, -1, 10);
    const authoritative = predictPath(game.players[0], 0, 6, presentation.pending).head;
    presentation.snapshot(
      { ...game, tick: 6, players: [authoritative, game.players[1]], ack: { a: 1 } },
      40,
    );
    expect(presentation.pending).toHaveLength(0);
    expect(presentation.game!.players[0]).toBe(authoritative);
    const after = presentation.local(40)!.head;
    expect(Number.isFinite(after.x)).toBe(true);
    expect(after.score).toBe(authoritative.score);
  });

  it('is independent of presentation refresh rate', () => {
    const { presentation } = scene();
    presentation.command(1, -1, 1);
    for (let ms = 0; ms <= 100; ms += 1000 / 144) presentation.local(ms);
    const highRefresh = presentation.local(100);
    for (let ms = 0; ms <= 100; ms += 1000 / 60) presentation.local(ms);
    expect(presentation.local(100)).toEqual(highRefresh);
  });

  it('stops on authoritative death and never predicts scores or revival', () => {
    const { presentation, game } = scene();
    const dead: Curve = { ...game.players[0], x: 80, alive: false, score: 3 };
    presentation.snapshot({ ...game, tick: 2, players: [dead, game.players[1]] }, 40);
    expect(presentation.local(1000)).toEqual({ head: dead, segments: [] });
  });

  it('freezes on disconnect and clears speculative history at a new round', () => {
    const { presentation, game } = scene();
    presentation.command(1, -1, 10);
    presentation.setConnected(false);
    expect(presentation.local(1000)!.head).toEqual(game.players[0]);
    expect(presentation.command(2, 1, 1000)).toBeNull();
    presentation.baseline({ game: { ...game, round: 2 }, segments: [] }, 1100);
    presentation.setPhase('countdown', 1100);
    expect(presentation.pending).toHaveLength(0);
    expect(presentation.local(2000)!.head).toEqual(game.players[0]);
  });

  it('honors known gap boundaries and bounds prediction after a network stall', () => {
    const { presentation, game } = scene();
    const base = { ...game.players[0], gapLeft: 3 };
    const path = predictPath(base, 0, 3, []);
    expect(path.segments[0].x1).toBeCloseTo(base.x + 3);
    expect(path.segments[0].tick).toBe(2);
    expect(presentation.localTick(100000)).toBeLessThanOrEqual(16);
  });
});
