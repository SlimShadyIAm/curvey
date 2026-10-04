import {
  beginMovement,
  modifiers,
  sweepCapsule,
  DT,
  SPEED,
  TRAIL_WIDTH,
  type Match,
  type Curve,
  type Steering,
  type Segment,
} from '@curvey/sim';

/** Bounded, deterministic local look-ahead. Never mutates the match or consumes its RNG. */
export function chooseBotSteering(match: Match, player: Curve): Steering {
  let best: Steering = 0;
  let bestScore = -Infinity;
  for (const input of [0, -1, 1] as const) {
    const p = { ...player };
    const projected: Segment[] = [];
    let score = input === 0 ? 2 : input === player.input ? 1 : 0;
    for (let step = 0; step < 54; step++) {
      const tick = match.tick + step;
      const mod = modifiers(p.effects, tick);
      beginMovement(p, input, tick);
      let remaining = SPEED * mod.speed * DT;
      let crashed = false;
      // Split at wraps and known gap endings; future random gaps are deliberately not assumed.
      while (remaining > 1e-7) {
        const dx = Math.cos(p.angle),
          dy = Math.sin(p.angle);
        const edgeX = dx > 0 ? (match.width - p.x) / dx : dx < 0 ? -p.x / dx : Infinity;
        const edgeY = dy > 0 ? (match.width - p.y) / dy : dy < 0 ? -p.y / dy : Infinity;
        const edge = Math.min(edgeX, edgeY);
        const length = Math.min(remaining, edge, p.gapLeft > 0 ? p.gapLeft : Infinity);
        const delta = { x: dx * length, y: dy * length };
        const end = { x: p.x + delta.x, y: p.y + delta.y };
        const radius = (TRAIL_WIDTH * mod.width) / 2;
        if (
          !mod.wrap &&
          (end.x < radius ||
            end.y < radius ||
            end.x > match.width - radius ||
            end.y > match.width - radius)
        )
          crashed = true;
        if (!mod.fly && p.gapLeft <= 0) {
          for (const s of [...match.grid.query(p, end, radius + 10), ...projected]) {
            if (
              s.owner === p.id &&
              (s.pathId ?? 0) === p.pathId &&
              p.distance - s.distanceEnd < (radius + s.width / 2) * 1.2
            )
              continue;
            if (
              sweepCapsule(
                p,
                delta,
                { x: s.x1, y: s.y1 },
                { x: s.x2, y: s.y2 },
                radius + s.width / 2,
              ) <= 1
            ) {
              crashed = true;
              break;
            }
          }
          for (const other of match.players) {
            if (!other.alive || other.id === p.id) continue;
            const otherMod = modifiers(other.effects, tick);
            if (otherMod.fly || other.gapLeft > 0) continue;
            const ahead = Math.min(step + 1, 12) * SPEED * otherMod.speed * DT;
            const head = {
              x: other.x + Math.cos(other.angle) * ahead,
              y: other.y + Math.sin(other.angle) * ahead,
            };
            if (
              sweepCapsule(
                p,
                delta,
                other,
                head,
                radius + (TRAIL_WIDTH * otherMod.width) / 2 + 2,
              ) <= 1
            )
              crashed = true;
          }
          projected.push({
            id: -1,
            tick,
            owner: p.id,
            x1: p.x,
            y1: p.y,
            x2: end.x,
            y2: end.y,
            width: radius * 2,
            distanceEnd: p.distance + length,
            pathId: p.pathId,
          });
        }
        if (crashed) break;
        p.x = end.x;
        p.y = end.y;
        p.distance += length;
        p.gapLeft = Math.max(0, p.gapLeft - length);
        remaining -= length;
        if (edge <= length + 1e-8) {
          if (!mod.wrap) {
            crashed = true;
            break;
          }
          if (edgeX <= edgeY) p.x = dx > 0 ? 1e-7 : match.width - 1e-7;
          if (edgeY <= edgeX) p.y = dy > 0 ? 1e-7 : match.width - 1e-7;
          p.pathId++;
        }
      }
      if (crashed) break;
      score += 1000;
    }
    // Survival dominates pickup attraction and a gentle preference for open central space.
    score += (Math.min(p.x, p.y, match.width - p.x, match.width - p.y) / match.width) * 20;
    for (const pickup of match.pickups) {
      if (
        pickup.expiresTick <= match.tick + 54 ||
        pickup.kind === 'green-speed' ||
        pickup.kind === 'bubbles'
      )
        continue;
      score += Math.max(0, 150 - Math.hypot(p.x - pickup.x, p.y - pickup.y)) / 15;
    }
    if (score > bestScore) {
      bestScore = score;
      best = input;
    }
  }
  return best;
}
