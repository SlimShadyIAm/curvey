import { expect, it } from 'vitest';
import { effectRings } from './effectRings';
import { ArenaPresentation } from './presentation';
import { Match } from '@curvey/sim';

it('counts down each kind independently and advances to the next expiring stack', () => {
  const effects = [
    { id: 1, kind: 'thin' as const, startTick: 0, expiresTick: 900 },
    { id: 2, kind: 'thin' as const, startTick: 300, expiresTick: 1200 },
    { id: 3, kind: 'reverse' as const, startTick: 300, expiresTick: 600 },
  ];
  expect(effectRings(effects, 0)).toEqual([{ kind: 'thin', fraction: 1, stacks: 1 }]);
  expect(effectRings(effects, 450)).toEqual([
    { kind: 'thin', fraction: 0.5, stacks: 2 },
    { kind: 'reverse', fraction: 0.5, stacks: 1 },
  ]);
  expect(effectRings(effects, 900)).toEqual([{ kind: 'thin', fraction: 1 / 3, stacks: 1 }]);
  expect(effectRings(effects, 1200)).toEqual([]);
});
it('shares a bounded timer clock across players and freezes on disconnect/results', () => {
  const match = new Match(
    [
      { id: 'a', name: 'A', color: '#c4ec78' },
      { id: 'b', name: 'B', color: '#80c7ff' },
    ],
    1,
  );
  const data = new ArenaPresentation('a');
  data.baseline(
    {
      game: {
        round: 1,
        tick: 100,
        width: 600,
        players: match.players,
        ack: {},
        pickups: [],
        collections: [],
        globalEffects: [],
        geometryCount: 0,
        geometryGeneration: 1,
      },
      segments: [],
      geometrySequence: 0,
    },
    1000,
  );
  data.setPhase('playing', 1000);
  expect(data.effectTick(1010)).toBeCloseTo(100.6);
  data.rtt = 200;
  expect(data.effectTick(1010)).toBeCloseTo(100.6);
  expect(data.effectTick(10000)).toBe(102);
  data.setConnected(false);
  expect(data.effectTick(10000)).toBe(100);
  data.setConnected(true);
  data.setPhase('round-results', 1100);
  expect(data.effectTick(1200)).toBe(100);
});
