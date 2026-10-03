import { randomBytes } from 'node:crypto';
import { Room, type Client } from 'colyseus';
import { Match, TICK_RATE, type Steering } from '@curvey/sim';
import {
  COLORS,
  PROTOCOL_VERSION,
  chatSchema,
  guestSchema,
  inputSchema,
  settingsSchema,
  type ChatMessage,
  type GameView,
  type InputCommand,
  type Member,
  type Phase,
  type RoomView,
} from '@curvey/protocol';

/** One authoritative match owner. Room messages are deliberately separate from trail geometry. */
export class GameRoom extends Room {
  maxClients = 8;
  patchRate = null;
  maxMessagesPerSecond = 100;
  private members = new Map<string, Member>();
  private host = '';
  private phase: Phase = 'lobby';
  private target = 10;
  private customTarget = false;
  private match?: Match;
  private roster = new Set<string>();
  private countdown = 0;
  private winner: string | null = null;
  private chat: ChatMessage[] = [];
  private chatSeq = 0;
  private chatTimes = new Map<string, number[]>();
  private steering: Record<string, Steering> = {};
  private inputTimes: Record<string, number> = {};
  private received: Record<string, number> = {};
  private inputQueue = new Map<string, InputCommand[]>();
  private ack: Record<string, number> = {};
  private sentSegments = 0;

  async onCreate() {
    this.roomId = randomBytes(18).toString('base64url');
    await this.setPrivate(true);
    this.onMessage('ping', (client, stamp) => {
      if (typeof stamp === 'number' && Number.isFinite(stamp)) client.send('pong', stamp);
    });
    this.onMessage('sync', (client) => {
      this.sendView(client);
      this.baseline(client);
    });
    this.onMessage('ready', (client) => {
      if (!this.editable()) return;
      const p = this.members.get(client.sessionId);
      if (p) {
        p.ready = !p.ready;
        this.publishView();
      }
    });
    this.onMessage('settings', (client, data) => {
      if (client.sessionId !== this.host || !this.editable()) return;
      const parsed = settingsSchema.safeParse(data);
      if (!parsed.success) return this.error(client, 'Choose 2–8 players and a target from 5–300.');
      if (parsed.data.capacity < this.members.size)
        return this.error(client, 'The limit cannot be lower than the current room size.');
      this.maxClients = parsed.data.capacity;
      if (parsed.data.target !== this.target) this.customTarget = true;
      this.target = parsed.data.target;
      this.members.forEach((p) => (p.ready = false));
      this.publishView();
    });
    this.onMessage('start', (client) => {
      if (client.sessionId !== this.host || !this.editable()) return;
      const members = [...this.members.values()];
      if (members.length < 2 || members.some((p) => !p.ready || !p.connected))
        return this.error(
          client,
          'At least two players must be connected and everyone must be ready.',
        );
      this.roster = new Set(members.map((p) => p.id));
      members.forEach((p) => (p.waiting = false));
      this.match = new Match(members, randomBytes(4).readUInt32LE(), this.target);
      this.winner = null;
      this.beginCountdown();
    });
    this.onMessage('input', (client, data) => {
      const parsed = inputSchema.safeParse(data);
      if (
        !parsed.success ||
        this.phase !== 'playing' ||
        !this.match ||
        !this.roster.has(client.sessionId)
      )
        return;
      const { seq, round } = parsed.data;
      if (round !== this.match.round || seq <= (this.received[client.sessionId] ?? -1)) return;
      this.received[client.sessionId] = seq;
      const queue = this.inputQueue.get(client.sessionId) ?? [];
      const earliest = Math.max(this.match.tick + 1, queue.at(-1)?.tick ?? 0);
      const scheduled = {
        ...parsed.data,
        tick: Math.min(this.match.tick + 12, Math.max(earliest, parsed.data.tick)),
      };
      if (queue.at(-1)?.tick === scheduled.tick) queue.pop();
      queue.push(scheduled);
      this.inputQueue.set(client.sessionId, queue.slice(-32));
      this.inputTimes[client.sessionId] = this.clock.elapsedTime;
    });
    this.onMessage('chat', (client, data) => {
      if (this.phase === 'playing' || this.phase === 'countdown') return;
      const parsed = chatSchema.safeParse(data),
        member = this.members.get(client.sessionId);
      if (!parsed.success || !member) return;
      const now = this.clock.elapsedTime,
        times = (this.chatTimes.get(client.sessionId) ?? []).filter((t) => now - t < 10000);
      if (times.length >= 5)
        return this.error(client, 'Please wait a moment before sending another message.');
      this.chatTimes.set(client.sessionId, [...times, now]);
      this.chat.push({
        id: ++this.chatSeq,
        author: member.id,
        name: member.name,
        text: parsed.data,
      });
      this.chat = this.chat.slice(-100);
      this.publishView();
    });
    this.onMessage('kick', (client, id) => {
      if (client.sessionId !== this.host || typeof id !== 'string' || id === this.host) return;
      const target = this.clients.find((c) => c.sessionId === id);
      if (target) target.leave(4011);
    });
    this.setFixedTimestep(() => this.tick(), TICK_RATE);
    // Clear the clock-only interval created by patchRate=null before simulation existed.
    // Otherwise it consumes elapsed time between fixed-step accumulator callbacks.
    this.patchRate = null;
  }

  onAuth(_client: Client, options: unknown) {
    return guestSchema.parse(options);
  }
  onJoin(client: Client, _options: unknown, auth: ReturnType<typeof guestSchema.parse>) {
    if (this.members.size >= this.maxClients) throw new Error('This room is full.');
    const taken = new Set([...this.members.values()].map((p) => p.color));
    const color = taken.has(auth.color)
      ? (COLORS.find((c) => !taken.has(c)) ?? auth.color)
      : auth.color;
    this.members.set(client.sessionId, {
      id: client.sessionId,
      name: auth.name,
      color,
      ready: false,
      connected: true,
      waiting: !this.editable(),
    });
    if (this.editable() && !this.customTarget)
      this.target = Math.max(10, 10 * (this.members.size - 1));
    if (!this.host) this.host = client.sessionId;
    this.publishView();
  }
  async onDrop(client: Client) {
    this.dropPlayer(client.sessionId);
    try {
      await this.allowReconnection(client, 15);
    } catch {
      /* onLeave performs permanent removal */
    }
  }
  onReconnect(client: Client) {
    const p = this.members.get(client.sessionId);
    if (p) p.connected = true;
    this.publishView();
    this.baseline(client);
  }
  onLeave(client: Client) {
    this.dropPlayer(client.sessionId);
    this.members.delete(client.sessionId);
    this.chatTimes.delete(client.sessionId);
    if (this.editable() && !this.customTarget)
      this.target = Math.max(10, 10 * (this.members.size - 1));
    delete this.steering[client.sessionId];
    delete this.inputTimes[client.sessionId];
    delete this.received[client.sessionId];
    this.inputQueue.delete(client.sessionId);
    delete this.ack[client.sessionId];
    this.transferHost();
    this.publishView();
  }
  private dropPlayer(id: string) {
    const p = this.members.get(id);
    if (p) {
      p.connected = false;
      p.ready = false;
    }
    this.steering[id] = 0;
    this.inputQueue.delete(id);
    if (this.match && this.roster.has(id)) {
      this.match.eliminate(id);
    }
    this.transferHost();
    this.publishView();
  }
  private transferHost() {
    if (!this.members.get(this.host)?.connected)
      this.host = [...this.members.values()].find((p) => p.connected)?.id ?? '';
  }
  private editable() {
    return this.phase === 'lobby' || this.phase === 'match-results';
  }
  private error(client: Client, message: string) {
    client.send('problem', message);
  }
  private view(): RoomView {
    return {
      version: PROTOCOL_VERSION,
      roomId: this.roomId,
      host: this.host,
      phase: this.phase,
      capacity: this.maxClients,
      target: this.target,
      members: [...this.members.values()],
      chat: this.chat,
      remaining: Math.ceil(this.countdown / TICK_RATE),
      round: this.match?.round ?? 0,
      winner: this.winner,
    };
  }
  private sendView(client: Client) {
    client.send('room', this.view());
  }
  private publishView() {
    this.broadcast('room', this.view());
  }
  private gameView(): GameView {
    return {
      round: this.match!.round,
      tick: this.match!.tick,
      width: this.match!.width,
      players: this.match!.players,
      ack: this.ack,
    };
  }
  private eligible(client: Client) {
    return this.roster.has(client.sessionId);
  }
  private baseline(client: Client) {
    if (this.match && this.eligible(client))
      client.send('baseline', { game: this.gameView(), segments: this.match.segments });
  }
  private publishGame() {
    if (!this.match) return;
    const segments = this.match.segments.slice(this.sentSegments);
    for (const client of this.clients)
      if (this.eligible(client)) {
        client.send('geometry', { round: this.match.round, from: this.sentSegments, segments });
        client.send('game', this.gameView());
      }
    this.sentSegments = this.match.segments.length;
  }
  private beginCountdown() {
    this.phase = 'countdown';
    this.countdown = 3 * TICK_RATE;
    this.sentSegments = this.match!.segments.length;
    this.steering = {};
    this.received = {};
    this.inputQueue.clear();
    this.ack = {};
    this.clients.forEach((c) => this.baseline(c));
    this.publishView();
  }
  private tick() {
    if (!this.match) return;
    if (this.phase === 'countdown' || this.phase === 'round-results') {
      this.countdown--;
      if (this.countdown % TICK_RATE === 0) this.publishView();
      if (this.countdown > 0) return;
      if (this.phase === 'countdown') {
        this.phase = 'playing';
        this.publishView();
      } else {
        if ([...this.roster].filter((id) => this.members.get(id)?.connected).length < 2) {
          this.finishMatch();
          return;
        }
        this.match.resetRound();
        for (const p of this.match.players)
          if (!this.members.get(p.id)?.connected) this.match.eliminate(p.id);
        this.beginCountdown();
        return;
      }
    }
    if (this.phase !== 'playing') return;
    for (const [id, queue] of this.inputQueue) {
      while (queue.length && queue[0].tick <= this.match.tick + 1) {
        const command = queue.shift()!;
        this.steering[id] = command.steer;
        this.ack[id] = command.seq;
      }
    }
    for (const id of this.roster)
      if (this.clock.elapsedTime - (this.inputTimes[id] ?? 0) > 500) this.steering[id] = 0;
    const frame = this.match.step(this.steering);
    this.publishGame();
    if (frame.roundOver) {
      this.winner = this.match.players.find((p) => p.alive)?.id ?? null;
      if (this.match.winner()) this.finishMatch();
      else {
        this.phase = 'round-results';
        this.countdown = 5 * TICK_RATE;
        this.publishView();
      }
    }
  }
  private finishMatch() {
    this.phase = 'match-results';
    this.countdown = 0;
    this.winner = this.match?.winner()?.id ?? null;
    this.members.forEach((p) => {
      p.ready = false;
      p.waiting = false;
    });
    this.publishView();
  }
}
