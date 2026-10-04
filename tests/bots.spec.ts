import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { PROTOCOL_VERSION, type RoomView, type GameView } from '../packages/protocol/src/index';
const { Client } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@colyseus/sdk',
);

test('host manages ready bots, capacity, and autonomous gameplay', async () => {
  const client = new Client('ws://127.0.0.1:2567');
  const host = await client.create('curvey', {
    name: 'Host',
    color: '#c4ec78',
    protocol: PROTOCOL_VERSION,
  });
  const guest = await client.joinById(host.roomId, {
    name: 'Guest',
    color: '#80c7ff',
    protocol: PROTOCOL_VERSION,
  });
  let view!: RoomView;
  const frames: GameView[] = [];
  for (const room of [host, guest])
    for (const type of ['room', 'baseline', 'geometry', 'game', 'problem'])
      room.onMessage(type, () => {});
  host.onMessage('room', (v: RoomView) => {
    view = v;
  });
  host.onMessage('game', (v: GameView) => frames.push(v));
  host.send('sync');
  try {
    await expect.poll(() => view?.members.length).toBe(2);
    guest.send('add-bot');
    guest.send('sync');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(view.members).toHaveLength(2);
    host.send('add-bot');
    await expect.poll(() => view.members.length).toBe(3);
    const bot = view.members.find((p) => p.bot)!;
    expect(bot.ready).toBe(true);
    guest.send('remove-bot', bot.id);
    host.send('settings', { capacity: 3, target: 5, preset: 'None' });
    await expect.poll(() => view.capacity).toBe(3);
    expect(view.members.find((p) => p.bot)?.ready).toBe(true);
    host.send('add-bot');
    host.send('sync');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(view.members).toHaveLength(3);
    expect(new Set(view.members.map((p) => p.color)).size).toBe(3);
    host.send('remove-bot', bot.id);
    await expect.poll(() => view.members.length).toBe(2);
    host.send('add-bot');
    await expect.poll(() => view.members.length).toBe(3);
    await guest.leave();
    await expect.poll(() => view.members.length).toBe(2);
    host.send('ready');
    await expect.poll(() => view.members.every((p) => p.ready)).toBe(true);
    host.send('start');
    await expect.poll(() => view.phase).toBe('countdown');
    host.send('remove-bot', view.members.find((p) => p.bot)!.id);
    host.send('add-bot');
    await expect.poll(() => frames.length, { timeout: 15000 }).toBeGreaterThan(60);
    expect(view.members).toHaveLength(2);
    const id = view.members.find((p) => p.bot)!.id;
    const positions = frames.map((f) => f.players.find((p) => p.id === id)!);
    expect(new Set(positions.map((p) => p.x.toFixed(2))).size).toBeGreaterThan(20);
    expect(positions.some((p) => p.input !== 0)).toBe(true);
  } finally {
    await host.leave();
    if (guest.connection.isOpen) await guest.leave();
  }
});

test('solo player adds and removes bots from the lobby and starts a match', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('PLAYER NAME').fill('Solo');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await page.getByRole('button', { name: 'Add bot', exact: true }).click();
  await expect(page.locator('.roster > li')).toHaveCount(2);
  await expect(page.locator('.roster > li').last()).toContainText('BOT');
  await page.getByRole('button', { name: 'Remove Bot 1', exact: true }).click();
  await expect(page.locator('.roster > li')).toHaveCount(1);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Add bot', exact: true }).click();
  await expect(page.locator('.roster > li')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/bots-lobby.png', fullPage: true });
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add bot', exact: true })).toHaveCount(0);
  await expect(page.locator('.direction-preview-status')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.direction-preview-status')).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/bots-match.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('host ownership transfers to a human instead of a bot', async () => {
  const client = new Client('ws://127.0.0.1:2567');
  const host = await client.create('curvey', {
    name: 'Host',
    color: '#c4ec78',
    protocol: PROTOCOL_VERSION,
  });
  host.onMessage('room', () => {});
  host.send('add-bot');
  const guest = await client.joinById(host.roomId, {
    name: 'Guest',
    color: '#80c7ff',
    protocol: PROTOCOL_VERSION,
  });
  let view!: RoomView;
  guest.onMessage('room', (v: RoomView) => {
    view = v;
  });
  guest.send('sync');
  try {
    await expect.poll(() => view?.members.length).toBe(3);
    await host.leave();
    await expect.poll(() => view.host).toBe(guest.sessionId);
    guest.send('remove-bot', view.members.find((p) => p.bot)!.id);
    await expect.poll(() => view.members.length).toBe(1);
  } finally {
    await guest.leave();
  }
});
