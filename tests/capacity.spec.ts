import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { PROTOCOL_VERSION, type RoomView, type GameView } from '../packages/protocol/src/index';
const { Client } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@colyseus/sdk',
);

test('24 human clients join, start and agree on the roster; seat 25 is rejected', async () => {
  const client = new Client('ws://127.0.0.1:2567');
  const options = { name: 'Player', color: '#c4ec78', protocol: PROTOCOL_VERSION };
  const rooms = [await client.create('curvey', options)];
  const views: RoomView[] = [];
  const games: GameView[] = [];
  const listen = (room: (typeof rooms)[number], i: number) => {
    for (const type of ['room', 'game', 'baseline', 'geometry']) room.onMessage(type, () => {});
    room.onMessage('room', (v: RoomView) => {
      views[i] = v;
    });
    room.onMessage('game', (v: GameView) => {
      games[i] = v;
    });
    room.send('sync');
  };
  listen(rooms[0], 0);
  try {
    for (let i = 1; i < 24; i++) {
      rooms.push(await client.joinById(rooms[0].roomId, { ...options, name: 'Player ' + i }));
      listen(rooms[i], i);
    }
    await expect.poll(() => views.filter((v) => v.members.length === 24).length).toBe(24);
    expect(views[0].capacity).toBe(24);
    expect(new Set(views[0].members.map((p) => p.color)).size).toBe(24);
    await expect(client.joinById(rooms[0].roomId, options)).rejects.toThrow();
    rooms.forEach((room) => room.send('ready'));
    await expect.poll(() => views[0].members.every((p) => p.ready)).toBe(true);
    rooms[0].send('start');
    await expect
      .poll(() => games.filter((g) => g.players.length === 24 && g.tick >= 30).length, {
        timeout: 15000,
      })
      .toBe(24);
    expect(games[0].width).toBe(1559);
  } finally {
    await Promise.all(rooms.map((room) => room.leave()));
  }
});

test('24-seat lobby keeps bot controls and roster usable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('PLAYER NAME').fill('Capacity');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByLabel('Player limit')).toHaveValue('24');
  for (let i = 0; i < 23; i++) {
    await page.getByRole('button', { name: 'Add bot', exact: true }).click();
    await expect(page.locator('.roster > li')).toHaveCount(i + 2);
  }
  await expect(page.getByRole('button', { name: 'Room full', exact: true })).toBeDisabled();
  await page.locator('.roster').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Remove Bot 23', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/capacity-lobby.png', fullPage: true });
  await page.getByRole('button', { name: 'Remove Bot 23', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add bot', exact: true })).toBeEnabled();
});
