import { createRequire } from 'node:module';
import type { GameView, RoomView } from '../packages/protocol/src/index';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { EFFECTS, type EffectKind } from '../packages/sim/src/index';
let fixture: ChildProcess;
test.beforeAll(async () => {
  fixture = spawn(process.execPath, ['--import', 'tsx', 'test/powerup-server.ts'], {
    cwd: fileURLToPath(new URL('../apps/server', import.meta.url)),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture startup timed out')), 15000);
    fixture.stdout!.on('data', (chunk) => {
      if (String(chunk).includes('powerup fixture ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    fixture.stderr!.on('data', (chunk) => {
      if (String(chunk).includes('Error')) {
        clearTimeout(timer);
        reject(new Error(String(chunk)));
      }
    });
    fixture.on('exit', (code) => {
      if (code) {
        clearTimeout(timer);
        reject(new Error(`Fixture exited ${code}`));
      }
    });
  });
});
test.afterAll(async () => {
  if (!fixture || fixture.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    fixture.once('exit', () => resolve());
    fixture.kill();
  });
});
async function useFixture(page: Page, latency = 0) {
  await page.route('http://127.0.0.1:2567/**', (route) =>
    route.continue({ url: route.request().url().replace(':2567/', ':2569/') }),
  );
  await page.addInitScript((delay) => {
    const Base = window.WebSocket;
    class TestSocket extends Base {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(String(url).replace(':2567/', ':2569/'), protocols);
      }
      send(payload: Parameters<WebSocket['send']>[0]) {
        if (!delay || !this.url.includes(':2569/')) return super.send(payload);
        const copy =
          payload instanceof ArrayBuffer
            ? payload.slice(0)
            : ArrayBuffer.isView(payload)
              ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength).slice()
              : payload;
        setTimeout(() => {
          if (this.readyState === Base.OPEN) super.send(copy);
        }, delay);
      }
    }
    if (delay) {
      const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, 'onmessage')!;
      Object.defineProperty(TestSocket.prototype, 'onmessage', {
        get() {
          return descriptor.get!.call(this);
        },
        set(handler) {
          let delivery = 0,
            index = 0;
          descriptor.set!.call(
            this,
            handler &&
              ((event: MessageEvent) => {
                if (!this.url.includes(':2569/')) return handler.call(this, event);
                delivery = Math.max(
                  delivery,
                  performance.now() + delay + Math.sin(index++ * 0.7) * 15,
                );
                setTimeout(
                  () => handler.call(this, event),
                  Math.max(0, delivery - performance.now()),
                );
              }),
          );
        },
      });
    }
    window.WebSocket = TestSocket;
  }, latency);
}
test('all twelve pickups agree across two browsers, clear trails, and survive resync', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const other = await browser.newContext();
  const friend = await other.newPage();
  for (const p of [page, friend]) {
    p.on('pageerror', (e) => errors.push(e.message));
    await useFixture(p);
  }
  await page.goto('/?debug=1');
  await page.getByLabel('PLAYER NAME').fill('Power-up check');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByLabel('Game mode', { exact: true })).toHaveValue('Basic');
  await expect(page.getByLabel('Game mode', { exact: true }).locator('option')).toHaveCount(5);
  const invite = page.url(),
    roomId = new URL(invite).searchParams.get('room')!;
  await friend.goto(`${invite}&debug=1`);
  await friend.getByLabel('PLAYER NAME').fill('Opponent');
  await friend.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(friend.getByLabel('Game mode', { exact: true })).toBeDisabled();
  await page.locator('.powerup-legend summary').click();
  await page.screenshot({ path: 'test-results/powerup-legend.png', fullPage: true });
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await friend.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(friend.locator('canvas')).toBeVisible();
  const setScene = async (kind: EffectKind | 'showcase' | 'rings') => {
    const response = await request.post('http://127.0.0.1:2569/scenario', {
      data: { roomId, kind },
    });
    expect(response.status()).toBe(200);
    await expect
      .poll(() => page.evaluate(() => window.__CURVEY_ARENA__?.powerups.collections.length))
      .toBe(0);
  };
  await setScene('showcase');
  await expect
    .poll(() => page.evaluate(() => window.__CURVEY_ARENA__?.powerups.pickups.length))
    .toBe(12);
  await page.screenshot({ path: 'test-results/powerups-arena.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/powerups-laptop.png', fullPage: true });
  for (const kind of Object.keys(EFFECTS) as EffectKind[]) {
    await setScene(kind);
    // Collection cues expire after one second; assert lasting state, not a transient animation.
    await Promise.all(
      [page, friend].map((p) =>
        expect
          .poll(
            () =>
              p.evaluate((effect) => {
                const state = window.__CURVEY_ARENA__?.powerups;
                if (!state || state.pickups.some((pickup) => pickup.id === 500)) return false;
                return effect === 'eraser'
                  ? state.geometryGeneration === 2
                  : Object.values(state.effects).some((kinds) => kinds.includes(effect));
              }, kind),
            { intervals: [25] },
          )
          .toBe(true),
      ),
    );
    const a = await page.evaluate(() => window.__CURVEY_ARENA__!.powerups);
    const b = await friend.evaluate(() => window.__CURVEY_ARENA__!.powerups);
    expect(a.collections).toEqual(b.collections);
    expect(a.effects).toEqual(b.effects);
    expect(a.pickups.some((p) => p.id === 500)).toBe(false);
    if (kind === 'eraser') {
      expect(a.geometryGeneration).toBe(2);
      expect(b.geometryGeneration).toBe(2);
    } else {
      const recipients = Object.values(a.effects).filter((kinds) => kinds.includes(kind)).length;
      expect(recipients).toBe(EFFECTS[kind].target === 'all' ? 2 : 1);
      for (const clientPage of [page, friend]) {
        const rings = await clientPage.evaluate(() => window.__CURVEY_ARENA__!.rings);
        expect(
          Object.values(rings).filter((list) => list.some((r) => r.kind === kind)),
        ).toHaveLength(recipients);
      }
      if (EFFECTS[kind].target !== 'others')
        await expect(page.locator('.arena-column .active-effects')).toBeVisible();
    }
  }
  await setScene('rings');
  for (const clientPage of [page, friend])
    await expect
      .poll(() =>
        clientPage.evaluate(() =>
          Object.values(window.__CURVEY_ARENA__!.rings)
            .map((list) => list.length)
            .sort(),
        ),
      )
      .toEqual([1, 2]);
  const before = await page.evaluate(
    () =>
      Object.values(window.__CURVEY_ARENA__!.rings)
        .flat()
        .find((r) => r.kind === 'reverse')!.fraction,
  );
  await page.waitForTimeout(1000);
  const after = await page.evaluate(
    () =>
      Object.values(window.__CURVEY_ARENA__!.rings)
        .flat()
        .find((r) => r.kind === 'reverse')!.fraction,
  );
  expect(after).toBeLessThan(before - 0.2);
  await page.screenshot({ path: 'test-results/powerup-rings-laptop.png', fullPage: true });
  await friend.screenshot({ path: 'test-results/powerup-rings-other-player.png', fullPage: true });
  for (const clientPage of [page, friend])
    await expect
      .poll(() =>
        clientPage.evaluate(() =>
          Object.values(window.__CURVEY_ARENA__!.rings).map((list) =>
            list.map((r) => [r.kind, r.stacks]),
          ),
        ),
      )
      .toEqual([[['thin', 1]], [['thin', 1]]]);
  await setScene('thin');
  await expect(page.locator('.arena-column .active-effects')).toContainText('Thin');
  await expect
    .poll(() =>
      page
        .locator('.arena-footer')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    )
    .toBe(true);
  await expect(page.locator('.pill')).toHaveText('BASIC');
  await expect
    .poll(() =>
      page
        .locator('.roster > li')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height),
    )
    .toBeLessThan(90);
  await page.screenshot({ path: 'test-results/powerup-active.png', fullPage: true });
  // Exercise the real reconnect path while an opponent's effect is live.
  await other.setOffline(true);
  await expect(friend.getByRole('alert')).toContainText('Connection lost', { timeout: 15000 });
  await other.setOffline(false);
  await expect(friend.getByRole('alert')).toHaveCount(0, { timeout: 15000 });
  await expect
    .poll(() => friend.evaluate(() => window.__CURVEY_ARENA__?.powerups.effects))
    .toEqual(await page.evaluate(() => window.__CURVEY_ARENA__!.powerups.effects));
  await other.close();
  expect(errors).toEqual([]);
});

test('preset controls and Corner remain responsive with a 200ms round trip and jitter', async ({
  page,
  browser,
  request,
}) => {
  const context = await browser.newContext(),
    friend = await context.newPage();
  await useFixture(page, 100);
  await useFixture(friend);
  await page.goto('/?debug=1');
  await page.getByLabel('PLAYER NAME').fill('Corner check');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByLabel('Game mode', { exact: true })).toBeVisible();
  const invite = page.url(),
    roomId = new URL(invite).searchParams.get('room')!;
  await friend.goto(`${invite}&debug=1`);
  await friend.getByLabel('PLAYER NAME').fill('Opponent');
  await friend.getByRole('button', { name: 'Join room', exact: true }).click();
  for (const mode of ['None', 'Thin', 'Corner', 'Thorner']) {
    await page.getByLabel('Game mode', { exact: true }).selectOption(mode);
    await page.getByRole('button', { name: 'Apply settings' }).click();
    await expect(friend.getByLabel('Game mode', { exact: true })).toHaveValue(mode);
  }
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await friend.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByLabel('Game mode', { exact: true })).toHaveCount(0);
  expect(
    (
      await request.post('http://127.0.0.1:2569/scenario', { data: { roomId, kind: 'corner' } })
    ).status(),
  ).toBe(200);
  await expect(page.locator('.arena-column .active-effects')).toContainText('Corner');
  await page.bringToFront();
  const result = await page.evaluate(async () => {
    const before = window.__CURVEY_ARENA__!.local!.angle,
      started = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    return await new Promise<{ latency: number; angle: number }>((resolve) => {
      const sample = () => {
        const angle = window.__CURVEY_ARENA__!.local!.angle;
        if (Math.abs(angle - before) > 1 || performance.now() - started > 1000)
          resolve({ latency: performance.now() - started, angle });
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  expect(result.latency).toBeLessThan(80);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__CURVEY_ARENA__!.local!.angle)).toBeCloseTo(
    result.angle,
    4,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' })),
  );
  console.log(JSON.stringify({ cornerResponseWith200msRttAndJitter: result.latency }));
  await context.close();
});

test('eight SDK clients agree on an effect collection and departure scoring', async ({
  request,
}) => {
  const { Client } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
    '@colyseus/sdk',
  ) as typeof import('../apps/web/node_modules/@colyseus/sdk');
  const client = new Client('ws://127.0.0.1:2569');
  const host = await client.create('curvey', { name: 'Host', color: '#80c7ff' });
  const rooms = [host],
    games = new Map<string, GameView>();
  let view: RoomView | undefined;
  const listen = (room: typeof host) => {
    room.onMessage('room', (next: RoomView) => {
      if (room === host) view = next;
    });
    room.onMessage('baseline', () => {});
    room.onMessage('geometry', () => {});
    room.onMessage('game', (game: GameView) => games.set(room.sessionId, game));
  };
  listen(host);
  try {
    for (let i = 1; i < 8; i++) {
      const room = await client.joinById(host.roomId, { name: `Player ${i}`, color: '#80c7ff' });
      rooms.push(room);
      listen(room);
    }
    for (const room of rooms) room.send('ready');
    await expect.poll(() => view?.members.filter((p) => p.ready).length).toBe(8);
    host.send('start');
    await expect.poll(() => view?.phase).toBe('countdown');
    expect(
      (
        await request.post('http://127.0.0.1:2569/scenario', {
          data: { roomId: host.roomId, kind: 'fat' },
        })
      ).status(),
    ).toBe(200);
    await expect
      .poll(() => [...games.values()].filter((g) => g.collections.length === 1).length)
      .toBe(8);
    const results = [...games.values()];
    for (const game of results) {
      expect(game.collections).toEqual(results[0].collections);
      expect(game.players.filter((p) => p.effects.some((e) => e.kind === 'fat'))).toHaveLength(7);
    }
    const departed = rooms.pop()!;
    await departed.leave();
    await expect
      .poll(() =>
        rooms.every((room) => {
          const game = games.get(room.sessionId);
          return (
            game?.players.find((p) => p.id === departed.sessionId)?.alive === false &&
            game.players.filter((p) => p.alive).every((p) => p.score === 1)
          );
        }),
      )
      .toBe(true);
  } finally {
    await Promise.all(rooms.map((room) => room.leave()));
  }
});
