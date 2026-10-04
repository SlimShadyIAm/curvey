import { describe, expect, it } from 'vitest';
import { Match, type Steering } from '@curvey/sim';
import { chooseBotSteering } from './bots';

const players = Array.from({ length: 8 }, (_, i) => ({
  id: String(i),
  name: 'Bot',
  color: '#fff',
}));
describe('bot steering', () => {
  it('turns before a wall without mutating authoritative state', () => {
    const match = new Match(players.slice(0, 2), 1, 10, 'None');
    Object.assign(match.players[0], { x: match.width - 45, y: match.width / 2, angle: 0 });
    const before = JSON.stringify(match);
    expect(chooseBotSteering(match, match.players[0])).not.toBe(0);
    expect(JSON.stringify(match)).toBe(before);
  });
  it('avoids a trail and compensates for reverse controls', () => {
    const match = new Match(players.slice(0, 2), 1, 10, 'None');
    const p = match.players[0];
    Object.assign(p, { x: 100, y: 100, angle: 0, gapLeft: 0 });
    const segment = {
      id: 1,
      tick: 0,
      owner: 'other',
      x1: 145,
      y1: 65,
      x2: 145,
      y2: 180,
      width: 5,
      distanceEnd: 1,
    };
    match.grid.add(segment);
    const normal = chooseBotSteering(match, p);
    expect(normal).not.toBe(0);
    p.effects = [{ id: 1, kind: 'reverse', startTick: 0, expiresTick: 500 }];
    expect(chooseBotSteering(match, p)).toBe(-normal);
  });
  it('survives longer than straight steering across seeded eight-player rounds', () => {
    let smart = 0,
      straight = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const ai of [false, true]) {
        const match = new Match(players, seed, 10, 'Basic');
        for (let tick = 0; tick < 900 && !match.over; tick++) {
          const inputs: Record<string, Steering> = {};
          for (const p of match.players)
            if (p.alive)
              inputs[p.id] = ai ? (tick % 6 === 0 ? chooseBotSteering(match, p) : p.input) : 0;
          match.step(inputs);
          if (ai) smart += match.players.filter((p) => p.alive).length;
          else straight += match.players.filter((p) => p.alive).length;
        }
      }
    }
    expect(smart).toBeGreaterThan(straight * 1.5);
  });
});
