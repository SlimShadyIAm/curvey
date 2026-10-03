import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { DT, SPEED, type Curve, type Segment } from '@curvey/sim';
import type { ArenaPresentation } from './presentation';
import { recordFrame, type ArenaDiagnostics } from './diagnostics';

export function Arena({
  data,
  localId,
}: {
  data: React.RefObject<ArenaPresentation>;
  localId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const el = host.current!;
    let disposed = false,
      initialized = false;
    let releaseGraphics: (() => void) | undefined;
    let texture: RenderTexture | undefined;
    const app = new Application();
    void app
      .init({
        resizeTo: el,
        background: '#101415',
        antialias: true,
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
        preference: 'webgl',
      })
      .then(() => {
        initialized = true;
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        el.appendChild(app.canvas);
        app.canvas.setAttribute(
          'aria-label',
          'Live game arena. Your player is marked with a ring.',
        );
        const world = new Container(),
          accumulated = new Sprite(),
          incoming = new Graphics(),
          tips = new Graphics(),
          heads = new Graphics();
        world.addChild(accumulated, tips, heads);
        app.stage.addChild(world);
        // Old geometry is rasterized once, not submitted as thousands of paths every frame.
        let generation = -1,
          ingested = 0,
          queued: Segment[] = [];
        const colorCache = new Map<string, string>();
        const drawSegment = (graphics: Graphics, s: Segment, end = 1) => {
          graphics
            .moveTo(s.x1, s.y1)
            .lineTo(s.x1 + (s.x2 - s.x1) * end, s.y1 + (s.y2 - s.y1) * end)
            .stroke({
              width: s.width,
              color: colorCache.get(s.owner) ?? '#c5d0e0',
              cap: 'round',
              join: 'round',
            });
        };
        const drawHead = (p: Curve) => {
          if (!p.alive) {
            heads
              .moveTo(p.x - 4, p.y - 4)
              .lineTo(p.x + 4, p.y + 4)
              .moveTo(p.x + 4, p.y - 4)
              .lineTo(p.x - 4, p.y + 4)
              .stroke({ width: 1.4, color: p.color, alpha: 0.7 });
            return;
          }
          heads.circle(p.x, p.y, p.gapLeft > 0 ? 2 : 3.5).fill(p.color);
          if (p.id === localId)
            heads.circle(p.x, p.y, 7).stroke({ width: 1, color: p.color, alpha: 0.8 });
        };
        const invalidate = () => {
          generation = -1;
        };
        app.canvas.addEventListener('webglcontextrestored', invalidate);
        releaseGraphics = () => {
          app.canvas.removeEventListener('webglcontextrestored', invalidate);
          incoming.destroy();
        };
        app.ticker.maxFPS = 0; // Follow requestAnimationFrame on 60/120/144Hz displays.
        app.ticker.add(() => {
          const started = performance.now(),
            current = data.current,
            game = current.game;
          if (!game) return;
          world.scale.set(app.screen.width / game.width);
          if (generation !== current.generation) {
            texture?.destroy(true);
            texture = RenderTexture.create({
              width: game.width,
              height: game.width,
              resolution: 2,
              antialias: true,
            });
            accumulated.texture = texture;
            incoming.clear();
            app.renderer.render({ container: incoming, target: texture, clear: true });
            ingested = 0;
            queued = [];
            generation = current.generation;
            colorCache.clear();
            game.players.forEach((p) => colorCache.set(p.id, p.color));
          }
          while (ingested < current.segments.length) queued.push(current.segments[ingested++]);
          const remoteTick = current.remoteTick(started);
          incoming.clear();
          tips.clear();
          heads.clear();
          const waiting: Segment[] = [];
          let painted = false;
          for (const segment of queued) {
            const owner = game.players.find((p) => p.id === segment.owner);
            if (
              segment.owner === localId ||
              !owner?.alive ||
              segment.tick <= Math.floor(remoteTick)
            ) {
              drawSegment(incoming, segment);
              painted = true;
            } else {
              waiting.push(segment);
              // Animate the confirmed remote tip within its tick, including partial gap boundaries.
              if (segment.tick === Math.ceil(remoteTick)) {
                const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
                const bodyStart = Math.max(0, 1 - length / (SPEED * DT));
                const fraction = Math.max(
                  0,
                  (remoteTick - Math.floor(remoteTick) - bodyStart) / (1 - bodyStart || 1),
                );
                if (fraction > 0) drawSegment(tips, segment, Math.min(1, fraction));
              }
            }
          }
          queued = waiting;
          if (painted) app.renderer.render({ container: incoming, target: texture!, clear: false });
          let local: ArenaDiagnostics['local'] = null;
          for (const player of game.players) {
            const path =
              player.id === localId
                ? current.local(started)
                : current.remote(player.id, remoteTick);
            if (!path) continue;
            for (const segment of path.segments) drawSegment(tips, segment);
            drawHead(path.head);
            if (player.id === localId)
              local = {
                x: path.head.x,
                y: path.head.y,
                angle: path.head.angle,
                alive: path.head.alive,
              };
          }
          recordFrame(started, local, game.tick);
        });
      })
      .catch(() => {
        if (!disposed)
          setError(
            'The arena could not start. Enable hardware acceleration or try another desktop browser.',
          );
      });
    return () => {
      disposed = true;
      releaseGraphics?.();
      texture?.destroy(true);
      if (initialized) app.destroy(true, { children: true });
    };
  }, [data, localId]);
  return (
    <div className="live-arena" ref={host}>
      {error && (
        <div className="arena-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
