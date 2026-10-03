import { z } from 'zod';
import type { Curve, Segment } from '@curvey/sim';
export const PROTOCOL_VERSION = 4;
export const COLORS = [
  '#c4ec78',
  '#80c7ff',
  '#ff927d',
  '#d5a4ff',
  '#ffd878',
  '#70d9c4',
  '#ef9bca',
  '#c5d0e0',
] as const;
export const guestSchema = z.object({
  name: z.string().trim().min(1).max(20),
  color: z.enum(COLORS),
});
export const settingsSchema = z.object({
  capacity: z.number().int().min(2).max(8),
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
export type Phase = 'lobby' | 'countdown' | 'playing' | 'round-results' | 'match-results';
export type Member = {
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
};
export type GeometryBatch = { round: number; from: number; segments: Segment[] };
export type Baseline = { game: GameView; segments: Segment[] };
