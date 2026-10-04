import { z } from 'zod';
import {
  PRESET_NAMES,
  type Curve,
  type Segment,
  type Pickup,
  type EffectInstance,
  type Collection,
  type Preset,
} from '@curvey/sim';
export const PROTOCOL_VERSION = 8;
export const MAX_PLAYERS = 24;
export const COLORS = [
  '#c4ec78',
  '#80c7ff',
  '#ff927d',
  '#d5a4ff',
  '#ffd878',
  '#70d9c4',
  '#ef9bca',
  '#c5d0e0',
  '#ff6b9d',
  '#65e6ff',
  '#ffb45b',
  '#a7a0ff',
  '#44d19b',
  '#f1ed79',
  '#db77ff',
  '#82aaff',
  '#e7b69a',
  '#b5dbb0',
  '#ff6470',
  '#36bcd0',
  '#dcaa48',
  '#b888d4',
  '#a3b95b',
  '#e6e6ed',
] as const;
export const guestSchema = z.object({
  name: z.string().trim().min(1).max(20),
  color: z.enum(COLORS),
});
export const settingsSchema = z.object({
  preset: z.enum(PRESET_NAMES).default('None'),
  capacity: z.number().int().min(2).max(MAX_PLAYERS),
  target: z.number().int().min(5).max(300),
});
export const inputSchema = z.object({
  round: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  tick: z.number().int().nonnegative(),
  steer: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});
export type InputCommand = z.infer<typeof inputSchema>;
export const chatSchema = z.string().trim().min(1).max(300);
export type Phase =
  | 'lobby'
  | 'countdown'
  | 'direction-preview'
  | 'playing'
  | 'round-results'
  | 'match-results';
export type Member = {
  bot: boolean;
  id: string;
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
  waiting: boolean;
};
export type ChatMessage = { id: number; author: string; name: string; text: string };
export type RoomView = {
  version: number;
  roomId: string;
  host: string;
  phase: Phase;
  capacity: number;
  preset: Preset;
  target: number;
  members: Member[];
  chat: ChatMessage[];
  remaining: number;
  round: number;
  winner: string | null;
};
export type GameView = {
  round: number;
  tick: number;
  width: number;
  players: Curve[];
  ack: Record<string, number>;
  pickups: Pickup[];
  globalEffects: EffectInstance[];
  collections: Collection[];
  geometryGeneration: number;
  geometryCount: number;
};
export type GeometryBatch = {
  round: number;
  sequence: number;
  generation: number;
  clear: boolean;
  from: number;
  segments: Segment[];
};
export type Baseline = { game: GameView; segments: Segment[]; geometrySequence: number };
