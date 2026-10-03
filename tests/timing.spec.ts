import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import type { GameView, RoomView } from '../packages/protocol/src/index';

// Use the same installed SDK as the web app, without canvas startup blocking message delivery.
const { Client } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@colyseus/sdk',
);

test('countdowns and authoritative 60Hz simulation track real time', async () => {
  const client = new Client('ws://127.0.0.1:2567');
  const host = await client.create('curvey', {
    name: 'Clock check',
    color: '#c4ec78',
    protocol: 3,
  });
  const other = await client.joinById(host.roomId, {
    name: 'Opponent',
    color: '#80c7ff',
    protocol: 3,
  });
  let started = 0;
  let countdownMs = 0;
  let firstSecond = 0;
  let resultsStarted = 0;
  let resultsMs = 0;
  const samples: { tick: number; at: number }[] = [];
  let done!: () => void;
  const finished = new Promise<void>((resolve) => {
    done = resolve;
  });
  for (const room of [host, other]) {
    for (const type of ['baseline', 'geometry', 'game', 'room']) room.onMessage(type, () => {});
  }
  host.onMessage('game', (game: GameView) => {
    if (game.round === 1) samples.push({ tick: game.tick, at: performance.now() });
  });
  host.onMessage('room', (view: RoomView) => {
    const now = performance.now();
    if (view.phase === 'countdown' && view.round === 1 && view.remaining === 3) started = now;
    if (view.phase === 'countdown' && view.round === 1 && view.remaining === 2)
      firstSecond = now - started;
    if (view.phase === 'playing' && view.round === 1) countdownMs = now - started;
    if (view.phase === 'round-results' && !resultsStarted) resultsStarted = now;
    if (view.phase === 'countdown' && view.round === 2) {
      resultsMs = now - resultsStarted;
      done();
    }
  });
  try {
    host.send('ready', true);
    other.send('ready', true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    host.send('start');
    await finished;
    const first = samples.find((s) => s.tick >= 5)!;
    const last = samples.find((s) => s.tick >= 45)!;
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    const hz = ((last.tick - first.tick) * 1000) / (last.at - first.at);
    console.log(JSON.stringify({ firstSecond, countdownMs, authoritativeHz: hz, resultsMs }));
    expect(firstSecond).toBeGreaterThan(850);
    expect(firstSecond).toBeLessThan(1200);
    expect(countdownMs).toBeGreaterThan(2850);
    expect(countdownMs).toBeLessThan(3200);
    expect(hz).toBeGreaterThan(54);
    expect(hz).toBeLessThan(66);
    expect(resultsMs).toBeGreaterThan(4800);
    expect(resultsMs).toBeLessThan(5200);
  } finally {
    await Promise.all([host.leave(), other.leave()]);
  }
});
