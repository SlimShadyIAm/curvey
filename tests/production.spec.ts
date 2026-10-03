import { test, expect } from '@playwright/test';

test('compiled server serves web assets and accepts same-origin room creation', async ({
  page,
}) => {
  test.skip(!process.env.TEST_PRODUCTION_URL, 'Run explicitly against the compiled server.');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.TEST_PRODUCTION_URL!);
  await page.getByLabel('PLAYER NAME').fill('Production check');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByRole('heading', { name: 'Production check’s room' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  expect(errors).toEqual([]);
});
