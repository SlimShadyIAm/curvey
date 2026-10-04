/** Loopback-only test fixture. Never imported by the production entry point. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Match, EFFECTS, type EffectKind, type Steering } from '@curvey/sim';
import { GameRoom } from '../src/GameRoom';
const rooms = new Map<string, GameRoom>();
class FixtureRoom extends GameRoom {
  async onCreate() {
    await super.onCreate();
    rooms.set(this.roomId, this);
  }
  onDispose() {
    rooms.delete(this.roomId);
  }
}
// Access to internals stays entirely in this test harness; no gameplay debug messages exist.
type Internals = {
  match: Match;
  phase: string;
  steering: Record<string, Steering>;
  inputQueue: Map<string, unknown>;
  sentSegments: number;
  sentGeneration: number;
  geometrySequence: number;
  publishView(): void;
  baseline(client: unknown): void;
};
const scenario = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.end('ready');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/scenario') {
    res.writeHead(404).end();
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { roomId, kind } = ((req as IncomingMessage & { body?: unknown }).body ??
      JSON.parse(body)) as { roomId: string; kind: EffectKind | 'showcase' | 'rings' };
    const room = rooms.get(roomId);
    if (!room || (kind !== 'showcase' && kind !== 'rings' && !(kind in EFFECTS))) {
      res.writeHead(400).end();
      return;
    }
    const internal = room as unknown as Internals;
    const previous = internal.match;
    if (!previous) {
      res.writeHead(409).end();
      return;
    }
    const m = new Match(previous.players, 42, previous.target, previous.preset);
    m.round = previous.round + 1;
    m.players.forEach((p, i) =>
      Object.assign(p, {
        x: 100,
        y:
          m.players.length > 2
            ? 80 + (i * (m.width - 160)) / (m.players.length - 1)
            : 150 + i * 250,
        angle: 0,
        nextGap: 1e9,
      }),
    );
    if (kind === 'rings') {
      m.players[0].effects = [
        { id: 10, kind: 'thin', startTick: 0, expiresTick: 180 },
        { id: 11, kind: 'thin', startTick: 0, expiresTick: 360 },
      ];
      m.players[1].effects = [
        { id: 12, kind: 'reverse', startTick: 0, expiresTick: 180 },
        { id: 13, kind: 'thin', startTick: 0, expiresTick: 360 },
      ];
    } else if (kind === 'showcase') {
      m.players.forEach((p) => (p.y += 40));
      m.pickups = (Object.keys(EFFECTS) as EffectKind[]).map((kind, i) => ({
        id: 500 + i,
        kind,
        x: 160 + (i % 4) * 85,
        y: 240 + Math.floor(i / 4) * 55,
        spawnTick: 0,
        expiresTick: 720,
      }));
    } else
      m.pickups = [{ id: 500, kind, x: 130, y: m.players[0].y, spawnTick: 0, expiresTick: 720 }];
    internal.match = m;
    internal.phase = 'playing';
    internal.steering = {};
    internal.inputQueue.clear();
    internal.sentSegments = 0;
    internal.sentGeneration = m.geometryGeneration;
    internal.geometrySequence = 0;
    internal.publishView();
    room.clients.forEach((c) => internal.baseline(c));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ round: m.round }));
  } catch {
    res.writeHead(500).end();
  }
};
const http = createServer();
const server = new Server({
  transport: new WebSocketTransport({ server: http }),
  greet: false,
  express: (app) => {
    app.post('/scenario', scenario);
    app.get('/health', (_req, res) => res.send('ready'));
  },
});
server.define('curvey', FixtureRoom);
await server.listen(2569, '127.0.0.1');
console.log('powerup fixture ready');
