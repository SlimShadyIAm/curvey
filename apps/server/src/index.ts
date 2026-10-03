import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './GameRoom';
import { PROTOCOL_VERSION } from '@curvey/protocol';

const app = express();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ status: 'ok', protocol: PROTOCOL_VERSION }));
const web = fileURLToPath(new URL('../../web/dist/', import.meta.url));
app.use(express.static(web));
const http = createServer(app);
const server = new Server({
  transport: new WebSocketTransport({
    server: http,
    maxPayload: 8192,
    pingInterval: 2000,
    pingMaxRetries: 2,
  }),
  greet: false,
});
server.define('curvey', GameRoom);
const port = Number(process.env.PORT ?? 2567);
await server.listen(port, process.env.HOST ?? '0.0.0.0');
console.log(`Curvey server listening on port ${port}`);
