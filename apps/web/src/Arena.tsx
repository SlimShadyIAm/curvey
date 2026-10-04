import { useEffect, useRef, useState } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Text,
  type Texture,
} from 'pixi.js';
import {
  EFFECTS,
  PICKUP_RADIUS,
  modifiers,
  type EffectKind,
  type Curve,
  type Segment,
} from '@curvey/sim';
import type { ArenaPresentation } from './presentation';
import { effectRings, EFFECT_SCOPE_COLORS } from './effectRings';
import { iconUrl } from './Powerups';
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
      .then(async () => {
        initialized = true;
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        const icons = new Map<EffectKind, Texture>();
        await Promise.all(
          (Object.keys(EFFECTS) as EffectKind[]).map(async (kind) => {
            icons.set(kind, await Assets.load<Texture>(iconUrl(kind)));
          }),
        );
        if (disposed) return;
        el.appendChild(app.canvas);
        app.canvas.setAttribute(
          'aria-label',
          'Live game arena. Power-up countdown rings and icons are visible around every affected player.',
        );
        const world = new Container(),
          accumulated = new Sprite(),
          incoming = new Graphics(),
          tips = new Graphics(),
          heads = new Graphics(),
          drops = new Container(),
          cues = new Graphics(),
          halos = new Graphics(),
          statusIcons = new Container();
        world.addChild(accumulated, tips, drops, cues, halos, statusIcons, heads);
        const statusSprites = new Map<string, { sprite: Sprite; count: Text }>();
        const pickupSprites = new Map<number, Sprite>();
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
          const mod = modifiers(p.effects, data.current.game!.tick);
          const radius = Math.max(1.5, 2.5 * mod.width);
          if (mod.fly) heads.circle(p.x, p.y, radius + 3).stroke({ width: 1.5, color: p.color });
          else heads.circle(p.x, p.y, p.gapLeft > 0 ? 2 : radius + 1).fill(p.color);
          if (p.id === localId)
            heads
              .circle(p.x, p.y, Math.max(7, radius + 4))
              .stroke({ width: 1, color: p.color, alpha: 0.8 });
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
            pickupSprites.forEach((sprite) => sprite.destroy());
            pickupSprites.clear();
            statusSprites.forEach(({ sprite, count }) => {
              sprite.destroy();
              count.destroy();
            });
            statusSprites.clear();
            colorCache.clear();
            game.players.forEach((p) => colorCache.set(p.id, p.color));
          }
          while (ingested < current.segments.length) queued.push(current.segments[ingested++]);
          const pickupIds = new Set(game.pickups.map((p) => p.id));
          for (const [id, sprite] of pickupSprites)
            if (!pickupIds.has(id)) {
              sprite.destroy();
              pickupSprites.delete(id);
            }
          for (const pickup of game.pickups) {
            let sprite = pickupSprites.get(pickup.id);
            if (!sprite) {
              sprite = new Sprite(icons.get(pickup.kind));
              sprite.anchor.set(0.5);
              sprite.width = sprite.height = PICKUP_RADIUS * 2;
              sprite.position.set(pickup.x, pickup.y);
              drops.addChild(sprite);
              pickupSprites.set(pickup.id, sprite);
            }
            sprite.alpha = pickup.expiresTick - game.tick < 120 ? 0.65 : 1;
          }
          cues.clear();
          if (modifiers(game.globalEffects, game.tick).wrap) {
            cues
              .rect(1, 1, game.width - 2, game.width - 2)
              .stroke({ width: 2, color: '#80c7ff', alpha: 0.7 });
          }
          for (const collected of game.collections) {
            const age = (current.localTick(started) - collected.tick) / 60;
            if (age < 0 || age > 0.35) continue;
            cues
              .circle(
                collected.x,
                collected.y,
                PICKUP_RADIUS + (reducedMotion.matches ? 0 : age * 18),
              )
              .stroke({ width: 1.5, color: '#d7e4de', alpha: (1 - age / 0.35) * 0.8 });
          }
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
                const bodyStart = segment.startTime ?? 0;
                const bodyEnd = segment.endTime ?? 1;
                const fraction = Math.max(
                  0,
                  (remoteTick - Math.floor(remoteTick) - bodyStart) / (bodyEnd - bodyStart || 1),
                );
                if (fraction > 0) drawSegment(tips, segment, Math.min(1, fraction));
              }
            }
          }
          queued = waiting;
          if (painted) app.renderer.render({ container: incoming, target: texture!, clear: false });
          halos.clear();
          const statusKeys = new Set<string>();
          const renderedRings: ArenaDiagnostics['rings'] = {};
          const effectTick = current.effectTick(started);
          let local: ArenaDiagnostics['local'] = null;
          for (const player of game.players) {
            const path =
              player.id === localId
                ? current.local(started)
                : current.remote(player.id, remoteTick);
            if (!path) continue;
            for (const segment of path.segments) drawSegment(tips, segment);
            drawHead(path.head);
            // All clients render all players' authoritative effects, including opponents.
            const rings = player.alive ? effectRings(player.effects, effectTick) : [];
            renderedRings[player.id] = rings;
            if (rings.length) {
              const { x, y } = path.head;
              const radius = Math.max(
                14,
                2.5 * modifiers(player.effects, effectTick).width + 7,
                rings.length * 3.4,
              );
              const sector = (Math.PI * 2) / rings.length;
              const gap = rings.length > 1 ? 0.14 : 0.055;
              rings.forEach((ring, index) => {
                const start = -Math.PI / 2 + index * sector + gap / 2;
                const sweep = sector - gap;
                const color = EFFECT_SCOPE_COLORS[EFFECTS[ring.kind].target];
                // Narrow dark backing keeps the timer legible over bright trails.
                halos
                  .moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
                  .arc(x, y, radius, start, start + sweep)
                  .stroke({ width: 4.5, color: '#101415', alpha: 0.85 });
                halos
                  .moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
                  .arc(x, y, radius, start, start + sweep)
                  .stroke({ width: 2, color, alpha: 0.2 });
                halos
                  .moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius)
                  .arc(x, y, radius, start, start + sweep * ring.fraction)
                  .stroke({ width: 2, color, cap: 'round' });
                const key = `${player.id}:${ring.kind}`;
                statusKeys.add(key);
                let entry = statusSprites.get(key);
                if (!entry) {
                  const sprite = new Sprite(icons.get(ring.kind));
                  sprite.anchor.set(0.5);
                  sprite.width = sprite.height = 12;
                  const count = new Text({
                    text: '',
                    style: {
                      fontFamily: 'system-ui',
                      fontSize: 8,
                      fontWeight: '700',
                      fill: '#e1eae5',
                      stroke: { color: '#101415', width: 2 },
                    },
                  });
                  statusIcons.addChild(sprite, count);
                  entry = { sprite, count };
                  statusSprites.set(key, entry);
                }
                const middle = start + sweep / 2;
                entry.sprite.position.set(
                  x + Math.cos(middle) * (radius + 9),
                  y + Math.sin(middle) * (radius + 9),
                );
                entry.count.text = ring.stacks > 1 ? String(ring.stacks) : '';
                entry.count.position.set(entry.sprite.x + 4, entry.sprite.y + 2);
              });
            }
            if (player.id === localId && player.alive && current.phase === 'direction-preview') {
              const { x, y, angle, color } = path.head;
              const dx = Math.cos(angle),
                dy = Math.sin(angle);
              const tipX = x + dx * 44,
                tipY = y + dy * 44;
              heads
                .moveTo(x + dx * 12, y + dy * 12)
                .lineTo(tipX, tipY)
                .moveTo(tipX - dx * 10 - dy * 7, tipY - dy * 10 + dx * 7)
                .lineTo(tipX, tipY)
                .lineTo(tipX - dx * 10 + dy * 7, tipY - dy * 10 - dx * 7)
                .stroke({ width: 2.5, color, cap: 'round', join: 'round' });
            }
            if (player.id === localId)
              local = {
                x: path.head.x,
                y: path.head.y,
                angle: path.head.angle,
                alive: path.head.alive,
              };
          }
          for (const [key, entry] of statusSprites)
            if (!statusKeys.has(key)) {
              entry.sprite.destroy();
              entry.count.destroy();
              statusSprites.delete(key);
            }
          recordFrame(started, local, game, renderedRings);
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
