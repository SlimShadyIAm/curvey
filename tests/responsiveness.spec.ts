import { test, expect } from '@playwright/test';

test('steering reacts locally before a delayed server round trip', async ({ browser, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Delay native game socket messages 100ms each way; Vite's HMR socket is unaffected.
  await page.addInitScript(() => {
    const Base = window.WebSocket;
    class DelayedSocket extends Base {
      send(payload: Parameters<WebSocket['send']>[0]) {
        if (!this.url.includes(':2567/')) return super.send(payload);
        // The SDK reuses its encoding buffer, so copy before delaying.
        const copy =
          payload instanceof ArrayBuffer
            ? payload.slice(0)
            : ArrayBuffer.isView(payload)
              ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength).slice()
              : payload;
        setTimeout(() => {
          if (this.readyState === Base.OPEN) super.send(copy);
        }, 100);
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, 'onmessage')!;
    Object.defineProperty(DelayedSocket.prototype, 'onmessage', {
      get() {
        return descriptor.get!.call(this);
      },
      set(handler) {
        descriptor.set!.call(
          this,
          handler &&
            ((event: MessageEvent) => {
              if (this.url.includes(':2567/')) setTimeout(() => handler.call(this, event), 100);
              else handler.call(this, event);
            }),
        );
      },
    });
    window.WebSocket = DelayedSocket;
  });
  await page.goto('/?debug=1');
  await page.getByLabel('PLAYER NAME').fill('Latency check');
  await page.getByRole('button', { name: 'Create a private room' }).click();
  await expect(page.getByRole('heading', { name: 'Latency check’s room' })).toBeVisible();
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByLabel('PLAYER NAME').fill('Opponent');
  await other.getByRole('button', { name: 'Join room', exact: true }).click();
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await other.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.countdown-overlay')).toHaveCount(0);
  await page.waitForFunction(() => (window.__CURVEY_ARENA__?.tick ?? 0) >= 4);
  const latency = await page.evaluate(async () => {
    const before = window.__CURVEY_ARENA__!.local!.angle;
    const started = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    return await new Promise<number>((resolve) => {
      const sample = () => {
        const angle = window.__CURVEY_ARENA__?.local?.angle ?? before;
        if (Math.abs(angle - before) > 0.001 || performance.now() - started > 1000)
          resolve(performance.now() - started);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' })),
  );
  const metrics = await page.evaluate(() => {
    const d = window.__CURVEY_ARENA__!;
    const values = d.frameIntervals.filter((ms) => ms > 0).sort((a, b) => a - b);
    return {
      frames: d.frames,
      medianFrameMs: values[Math.floor(values.length / 2)],
      p95FrameMs: values[Math.floor(values.length * 0.95)],
    };
  });
  console.log(JSON.stringify({ inputToVisibleTurnMs: latency, ...metrics }));
  await page.screenshot({ path: 'test-results/responsiveness.png' });
  await context.close();
  expect(errors).toEqual([]);
  expect(latency).toBeLessThan(80);
});
