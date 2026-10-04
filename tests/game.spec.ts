import { test, expect } from '@playwright/test';

test('invite-only two-browser match, chat, disconnect and host transfer', async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('PLAYER NAME').fill('Ada');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByRole('heading', { name: 'Ada’s room' })).toBeVisible();
  await page.getByLabel('Game mode', { exact: true }).selectOption('None');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  const invite = page.url();
  await page.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  const other = await browser.newContext();
  const friend = await other.newPage();
  friend.on('pageerror', (error) => errors.push(error.message));
  await friend.goto(invite);
  await friend.getByLabel('PLAYER NAME').fill('Bo');
  await friend.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(friend.getByRole('heading', { name: 'Ada’s room' })).toBeVisible();
  await expect(page.locator('.roster li')).toHaveCount(2);
  await friend.getByLabel('Chat message').fill('Ready for a rematch?');
  await friend.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('log')).toContainText('Ready for a rematch?');
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await friend.getByRole('button', { name: 'I’m ready' }).click();
  await expect(page.getByRole('button', { name: 'Start match' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(friend.locator('canvas')).toBeVisible();
  await expect(page.locator('.countdown-overlay')).toHaveCount(0);
  await expect(page.locator('.direction-preview-status')).toBeVisible();
  await page.screenshot({ path: 'test-results/direction-preview.png', fullPage: true });
  for (const viewport of [
    { width: 2000, height: 1250 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.locator('.arena-frame').evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.bottom <= innerHeight &&
            Math.abs(rect.width - rect.height) < 2 &&
            Math.abs(innerWidth - rect.right - 24) < 2
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `test-results/match-${viewport.width}.png`, fullPage: true });
  }
  await expect(page.locator('.direction-preview-status')).toHaveCount(0);
  await expect(page.getByLabel('Chat message')).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator('.arena-frame')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
    )
    .toBe(true);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: 'test-results/match-desktop.png', fullPage: true });
  // Leaving is an authoritative elimination; the remaining browser receives host ownership.
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  await expect(friend.getByRole('heading', { name: 'Bo’s room' })).toBeVisible();
  await expect(friend.getByText('ROUND COMPLETE', { exact: true })).toBeVisible();
  // Either player may already have hit a wall during screenshot inspection.
  // Exact disconnect scoring is covered by the headless and SDK scenarios.
  await expect(friend.locator('.score').first()).toHaveText(/^[01]$/);
  await other.close();
  expect(errors).toEqual([]);
});

test('late arrivals wait without live geometry and hosts can kick', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByLabel('PLAYER NAME').fill('Host');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByRole('heading', { name: 'Host’s room' })).toBeVisible();
  const invite = page.url();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [second, late] = await Promise.all(contexts.map((c) => c.newPage()));
  await second.goto(invite);
  await second.getByLabel('PLAYER NAME').fill('Second');
  await second.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(second.getByRole('heading', { name: 'Host’s room' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await second.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await late.goto(invite);
  await late.getByLabel('PLAYER NAME').fill('Late');
  await late.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(late.getByRole('heading', { name: 'You’re up next.' })).toBeVisible();
  await expect(late.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kick Late', exact: true }).click();
  await expect(late.getByRole('alert')).toContainText('The host removed you');
  await Promise.all(contexts.map((c) => c.close()));
});

test('entry responsive states and invalid invite', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-results/entry-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/entry-laptop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Curvey plays best on a desktop', { exact: false })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'test-results/entry-mobile.png', fullPage: true });
  await page.getByLabel('PLAYER NAME').fill('Ada');
  await page.getByRole('button', { name: 'I have an invite' }).click();
  await page.getByLabel('INVITE LINK OR ROOM CODE').fill('not-an-invite');
  await page.getByRole('button', { name: 'Join room', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Paste a Curvey invite');
});
