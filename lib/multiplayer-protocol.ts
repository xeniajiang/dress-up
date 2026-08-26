import type { SimAction, SimCard, SimGoal, VisibleGame } from "./ai-engine";

export type HumanControlMode = "manual" | "ai-self" | "ai-host";
export type ReplayEventType =
  | "CARD_PLAYED"
  | "PRESENTATION_ADDED"
  | "PRESENTATION_MOVED"
  | "PRESENTATION_DISCARDED"
  | "CLOTHING_REPLACED"
  | "JOY_GAINED"
  | "JOY_LOST"
  | "IDENTITY_PUSHED"
  | "IDENTITY_POPPED"
  | "TOKEN_ADDED"
  | "TOKEN_REMOVED"
  | "FIELD_CHANGED"
  | "PRIVATE_REVEAL";

export type ReplayEvent = {
  type: ReplayEventType;
  playerId?: number;
  sourcePlayerId?: number;
  targetPlayerId?: number;
  card?: SimCard;
  cardName?: string;
  amount?: number;
  text: string;
};

export type ReplayBundle = {
  resolutionId: string;
  actorId: number;
  actionId: string;
  createdAt: number;
  publicEvents: ReplayEvent[];
  privateEvents: ReplayEvent[];
};

export type PlayAnimation = {
  actorId: number;
  card: SimCard;
  destination: "player" | "public" | "discard";
  version: number;
};

export type ObserverVisualSnapshot = {
  view: VisibleGame;
  knownGoals: Record<number, SimGoal | undefined>;
};

export type CanonicalAnimationCommand = {
  type: "resolve-state";
  play: PlayAnimation | null;
  durationMs: number;
};

export type VisualSegment = {
  segmentId: string;
  stateVersion: number;
  before: ObserverVisualSnapshot;
  after: ObserverVisualSnapshot;
  commands: CanonicalAnimationCommand[];
};

export type ObserverReplayBuffer = {
  anchor: ObserverVisualSnapshot;
  segments: VisualSegment[];
};

export type DecisionSummary = {
  decisionId: string;
  playerId: number;
  decisionType: "draw" | "play" | "response";
  detail: string;
  startedAt: number;
};

export type DecisionStatsSummary = {
  totalDurationMs: number;
  averageDecisionMs: number;
  averageDrawMs: number;
  averagePlayMs: number;
  averageResponseMs: number;
  longestDecisionMs: number;
  delegatedDecisions: number;
  perPlayer: Array<{ playerId: number; totalMs: number; averageMs: number; count: number }>;
};

export type PublicSeat = {
  playerId: number;
  name: string;
  controller: "human" | "ai" | "empty";
  ready: boolean;
  connected: boolean;
  controlMode?: HumanControlMode | "ai";
  disconnectedSince?: number | null;
};

export type RoomStateMessage = {
  type: "ROOM_STATE";
  roomId: string;
  status: "lobby" | "playing" | "ended";
  seats: PublicSeat[];
  selfPlayerId: number;
  isHost: boolean;
  canStart: boolean;
  paused: boolean;
  pausedAt: number | null;
  currentDecision: DecisionSummary | null;
  decisionStats: DecisionStatsSummary | null;
};

export type GameStateMessage = {
  type: "GAME_STATE";
  revision: number;
  stateVersion: number;
  view: VisibleGame;
  actions: SimAction[];
  knownGoals: Record<number, SimGoal | undefined>;
  recentEvents: string[];
  lastPlay: PlayAnimation | null;
  playAnimations: PlayAnimation[];
  liveVisualSegments: VisualSegment[];
  replayBuffer: ObserverReplayBuffer | null;
  pendingPronounCardName: "她" | "他" | null;
  paused: boolean;
  controlMode: HumanControlMode;
  replay: ReplayBundle | null;
};

export type ServerMessage =
  | RoomStateMessage
  | GameStateMessage
  | { type: "TEST_RECORD"; filename: string; json: string; txt: string }
  | { type: "ERROR"; message: string };

export type ClientMessage =
  | { type: "JOIN" | "RESUME"; playerToken: string; nickname: string }
  | { type: "READY"; ready: boolean }
  | { type: "START_GAME" }
  | { type: "ACTION"; actionId: string; requestId: string; expectedStateVersion: number }
  | { type: "SET_SELF_CONTROL"; controlMode: "manual" | "ai-self" }
  | { type: "HOST_SET_CONTROL"; playerId: number; enabled: boolean }
  | { type: "HOST_RESOLVE_ONE" }
  | { type: "HOST_SET_PAUSED"; paused: boolean }
  | { type: "EXPORT_TEST_RECORD" };

export function normalizeRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 5);
}

export function shouldAcceptGameState(currentVersion: number, incomingVersion: number) {
  return incomingVersion > currentVersion;
}
