import {
  applyLegalAction,
  createSimGame,
  decisionPlayerId,
  enumerateLegalActions,
  finalScoreBreakdown,
  knowledgeEventsFor,
  visibleStateFor,
  type SimAction,
  type SimController,
  type SimGame,
} from "./ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  observePublicAction,
  type AiMemory,
} from "./heuristic-ai";
import type {
  DecisionSummary,
  DecisionStatsSummary,
  GameStateMessage,
  HumanControlMode,
  ObserverReplayBuffer,
  ObserverVisualSnapshot,
  PlayAnimation,
  PublicSeat,
  ReplayBundle,
  ReplayEvent,
  RoomStateMessage,
  VisualSegment,
} from "./multiplayer-protocol";
import { CARD_PLAY_REVEAL_DURATION_MS, TABLE_STATE_ANIMATION_DURATION_MS } from "./ui-timing";

export type HumanSeat = {
  playerId: number;
  name: string;
  controller: "human";
  playerToken: string;
  ready: boolean;
  controlMode: HumanControlMode;
  online: boolean;
  disconnectedSince: number | null;
};

export type AiSeat = {
  playerId: number;
  name: string;
  controller: "ai";
  ready: true;
};

export type DecisionRecord = DecisionSummary & {
  submittedAt: number;
  durationMs: number;
  resolvedBy: "human" | "ai-native" | "ai-self" | "ai-host" | "ai-host-once";
  actionId: string;
};

export type SessionAuditEvent = {
  at: number;
  type: "room-created" | "game-started" | "action" | "control" | "connection" | "pause" | "game-ended";
  stateVersion: number;
  playerId?: number;
  actionId?: string;
  detail: string;
  resolution?: StoredReplay;
  diagnostic?: {
    decisionPlayerId: number;
    activePlayer: number;
    authoritativeHandCounts: number[];
    visibleHandCounts: Record<number, number>;
    forcedPlay: { playerId: number; cardName: string } | null;
    phase: string;
    pendingPrompt: string | null;
  };
};

type StoredReplay = {
  resolutionId: string;
  actorId: number;
  actionId: string;
  createdAt: number;
  publicEvents: ReplayEvent[];
  privateEvents: Record<number, ReplayEvent[]>;
};

export type RoomRecord = {
  roomId: string;
  status: "lobby" | "playing" | "ended";
  hostToken: string | null;
  seats: Array<HumanSeat | AiSeat>;
  game: SimGame | null;
  memories: AiMemory[];
  revision: number;
  stateVersion: number;
  paused: boolean;
  pausedAt: number | null;
  seed: number | null;
  randomState: number;
  startedAt: number | null;
  endedAt: number | null;
  deckExhaustedAt: number | null;
  lastPlay: PlayAnimation | null;
  playAnimations: PlayAnimation[];
  liveVisualSegments: Record<number, VisualSegment[]>;
  observerReplays: Record<number, ObserverReplayBuffer>;
  lastReplay: StoredReplay | null;
  pendingPronoun: { actorId: number; targetId: number; cardName: "她" | "他"; action: SimAction } | null;
  currentDecision: DecisionSummary | null;
  decisionRecords: DecisionRecord[];
  auditLog: SessionAuditEvent[];
  acceptedRequestIds: string[];
};

const AI_NAMES = ["花雨", "晓山", "姬姐", "可乐"];

export function createRoomRecord(roomId: string, now = Date.now()): RoomRecord {
  return {
    roomId,
    status: "lobby",
    hostToken: null,
    seats: [],
    game: null,
    memories: createAiMemories(4),
    revision: 0,
    stateVersion: 0,
    paused: false,
    pausedAt: null,
    seed: null,
    randomState: 0,
    startedAt: null,
    endedAt: null,
    deckExhaustedAt: null,
    lastPlay: null,
    playAnimations: [],
    liveVisualSegments: {},
    observerReplays: {},
    lastReplay: null,
    pendingPronoun: null,
    currentDecision: null,
    decisionRecords: [],
    auditLog: [{ at: now, type: "room-created", stateVersion: 0, detail: `创建房间 ${roomId}` }],
    acceptedRequestIds: [],
  };
}

function normalizeRecord(record: RoomRecord): RoomRecord {
  record.stateVersion ??= record.revision ?? 0;
  record.revision = record.stateVersion;
  record.paused ??= false;
  record.pausedAt ??= null;
  record.seed ??= null;
  record.randomState ??= record.seed ?? 0;
  record.startedAt ??= null;
  record.endedAt ??= null;
  record.deckExhaustedAt ??= null;
  record.lastReplay ??= null;
  record.playAnimations ??= [];
  record.liveVisualSegments ??= {};
  record.observerReplays ??= {};
  record.currentDecision ??= null;
  record.decisionRecords ??= [];
  record.auditLog ??= [];
  record.acceptedRequestIds ??= [];
  record.seats.forEach((seat) => {
    if (seat.controller !== "human") return;
    seat.controlMode ??= "manual";
    seat.online ??= false;
    seat.disconnectedSince ??= null;
  });
  return record;
}

function safeName(name: string) {
  return name.trim().slice(0, 10) || "欣娅";
}

function pendingPromptName(game: SimGame, hasPendingPronoun: boolean) {
  if (hasPendingPronoun) return "pronoun-response";
  if (game.certificateOffer) return "certificate";
  if (game.truthOffer) return "truth";
  if (game.confusionOffer) return "confusion";
  if (game.beautyOffer) return "beauty-blogger";
  if (game.fittingRoomOffer) return `fitting-room-${game.fittingRoomOffer.stage}`;
  if (game.sharedWardrobeOffer) return `shared-wardrobe-${game.sharedWardrobeOffer.stage}`;
  if (game.readingPrompt) return "reading";
  if (game.checkCountPrompt) return "check-count";
  if (game.dressCodeOffer) return "dress-code";
  if (game.venueExchange) return "venue-exchange";
  if (game.manzhanOpeningChoice) return "manzhan-opening";
  if (game.manzhanPinkPrompt) return "manzhan-pink";
  if (game.forcedPlay) return "forced-play";
  return null;
}

function identityText(identity: string) {
  return identity === "male" ? "男性" : identity === "female" ? "女性" : "非二元";
}

function buildReplay(before: SimGame, after: SimGame, action: SimAction, actorId: number, privateEvents: Record<number, ReplayEvent[]>): StoredReplay {
  const events: ReplayEvent[] = [];
  const beforeForcedPlay = before.forcedPlay;
  const beforeCard = beforeForcedPlay && beforeForcedPlay.card.id === action.cardId
    ? beforeForcedPlay.card
    : before.players[actorId].hand.find((card) => card.id === action.cardId);
  if (beforeCard && action.type === "play") events.push({ type: "CARD_PLAYED", playerId: actorId, targetPlayerId: action.targetId, card: beforeCard, cardName: beforeCard.name, text: `${before.players[actorId].name} 打出【${beforeCard.name}】` });

  const removedById = new Map<string, { playerId: number; card: SimGame["market"][number] }>();
  const addedById = new Map<string, { playerId: number; card: SimGame["market"][number] }>();
  before.players.forEach((player) => player.presents.forEach((card) => {
    if (!after.players[player.id].presents.some((present) => present.id === card.id)) removedById.set(card.id, { playerId: player.id, card });
  }));
  after.players.forEach((player) => player.presents.forEach((card) => {
    if (!before.players[player.id].presents.some((present) => present.id === card.id)) addedById.set(card.id, { playerId: player.id, card });
  }));
  after.players.forEach((player, playerId) => {
    const removedClothing = before.players[playerId].presents.find((card) => card.clothing && !player.presents.some((present) => present.id === card.id));
    const addedClothing = player.presents.find((card) => card.clothing && !before.players[playerId].presents.some((present) => present.id === card.id));
    if (removedClothing && addedClothing) events.push({ type: "CLOTHING_REPLACED", playerId, card: addedClothing, cardName: addedClothing.name, text: `${player.name} 用【${addedClothing.name}】覆盖【${removedClothing.name}】` });
  });
  for (const [cardId, removed] of removedById) {
    const added = addedById.get(cardId);
    if (added && added.playerId !== removed.playerId) {
      events.push({ type: "PRESENTATION_MOVED", sourcePlayerId: removed.playerId, targetPlayerId: added.playerId, card: added.card, cardName: added.card.name, text: `【${added.card.name}】从 ${before.players[removed.playerId].name} 移至 ${after.players[added.playerId].name}` });
      addedById.delete(cardId);
    } else events.push({ type: "PRESENTATION_DISCARDED", playerId: removed.playerId, card: removed.card, cardName: removed.card.name, text: `${before.players[removed.playerId].name} 失去【${removed.card.name}】` });
  }
  for (const added of addedById.values()) events.push({ type: "PRESENTATION_ADDED", playerId: added.playerId, card: added.card, cardName: added.card.name, text: `${after.players[added.playerId].name} 获得【${added.card.name}】` });

  after.players.forEach((player, playerId) => {
    const previous = before.players[playerId];
    const joyDelta = player.joy - previous.joy;
    if (joyDelta !== 0) events.push({ type: joyDelta > 0 ? "JOY_GAINED" : "JOY_LOST", playerId, amount: Math.abs(joyDelta), text: `${player.name} ${joyDelta > 0 ? "获得" : "失去"} ${Math.abs(joyDelta)} Joy` });
    if (player.identityHistory.length > previous.identityHistory.length) events.push({ type: "IDENTITY_PUSHED", playerId, text: `${player.name} 的长期身份变为${identityText(player.identity)}` });
    else if (player.identityHistory.length < previous.identityHistory.length) events.push({ type: "IDENTITY_POPPED", playerId, text: `${player.name} 恢复为${identityText(player.identity)}` });
    const addedItems = player.items.filter((item) => !previous.items.includes(item));
    const removedItems = previous.items.filter((item) => !player.items.includes(item));
    addedItems.forEach((item) => events.push({ type: "TOKEN_ADDED", playerId, cardName: item, text: `${player.name} 获得【${item}】` }));
    removedItems.forEach((item) => events.push({ type: "TOKEN_REMOVED", playerId, cardName: item, text: `${player.name} 失去【${item}】` }));
    if (player.tempIdentity !== previous.tempIdentity) {
      if (previous.tempIdentity) events.push({ type: "TOKEN_REMOVED", playerId, text: `${player.name} 的临时身份结束` });
      if (player.tempIdentity) events.push({ type: "TOKEN_ADDED", playerId, text: `${player.name} 获得临时${identityText(player.tempIdentity)}身份` });
    }
    if (player.ambiguityCard?.id !== previous.ambiguityCard?.id) {
      if (previous.ambiguityCard) events.push({ type: "TOKEN_REMOVED", playerId, cardName: previous.ambiguityCard.name, text: `${player.name} 失去【${previous.ambiguityCard.name}】状态` });
      if (player.ambiguityCard) events.push({ type: "TOKEN_ADDED", playerId, cardName: player.ambiguityCard.name, text: `${player.name} 获得【${player.ambiguityCard.name}】状态` });
    }
    const addedCrushes = player.crushTargetIds.filter((targetId) => !previous.crushTargetIds.includes(targetId));
    const removedCrushes = previous.crushTargetIds.filter((targetId) => !player.crushTargetIds.includes(targetId));
    addedCrushes.forEach((targetId) => events.push({ type: "TOKEN_ADDED", sourcePlayerId: playerId, targetPlayerId: targetId, text: `${after.players[targetId].name} 获得来自 ${player.name} 的心动标记` }));
    removedCrushes.forEach((targetId) => events.push({ type: "TOKEN_REMOVED", sourcePlayerId: playerId, targetPlayerId: targetId, text: `${after.players[targetId].name} 失去来自 ${player.name} 的心动标记` }));
  });
  if (before.venue?.card.id !== after.venue?.card.id) events.push({ type: "FIELD_CHANGED", card: after.venue?.card, cardName: after.venue?.card.name, text: after.venue ? `场地变为【${after.venue.card.name}】` : "场地效果结束" });

  const createdAt = Date.now();
  return { resolutionId: `${createdAt}-${actorId}-${action.id}`, actorId, actionId: action.id, createdAt, publicEvents: events, privateEvents };
}

function hasAnimatedTableDelta(before: ObserverVisualSnapshot, after: ObserverVisualSnapshot) {
  if (before.view.venue?.card.id !== after.view.venue?.card.id || before.view.dei !== after.view.dei) return true;
  return before.view.players.some((player, index) => {
    const next = after.view.players[index];
    return player.joyLossVersion !== next.joyLossVersion
      || player.identity !== next.identity
      || player.reading !== next.reading
      || player.tempIdentity !== next.tempIdentity
      || player.ambiguityCard?.id !== next.ambiguityCard?.id
      || player.presents.map((card) => card.id).join("|") !== next.presents.map((card) => card.id).join("|")
      || player.removedPresents.map((entry) => entry.card.id).join("|") !== next.removedPresents.map((entry) => entry.card.id).join("|")
      || player.items.join("|") !== next.items.join("|")
      || player.crushTargetIds.join("|") !== next.crushTargetIds.join("|");
  });
}

export class MultiplayerRoomCore {
  constructor(public record: RoomRecord) {
    this.record = normalizeRecord(record);
    if (this.record.game && this.record.status === "playing") this.syncDecision();
  }

  private bump() {
    this.record.stateVersion += 1;
    this.record.revision = this.record.stateVersion;
  }

  private observerSnapshot(playerId: number): ObserverVisualSnapshot {
    return {
      view: visibleStateFor(this.requireGame(), playerId),
      knownGoals: { ...this.record.memories[playerId].knownTargets },
    };
  }

  private humanPlayerIds() {
    return this.record.seats.filter((seat): seat is HumanSeat => seat.controller === "human").map((seat) => seat.playerId);
  }

  private beginVisualBatch() {
    this.record.playAnimations = [];
    this.record.liveVisualSegments = Object.fromEntries(this.humanPlayerIds().map((playerId) => [playerId, []]));
  }

  private initializeReplayAnchors() {
    this.record.observerReplays = {};
    this.humanPlayerIds().forEach((playerId) => {
      this.record.observerReplays[playerId] = { anchor: this.observerSnapshot(playerId), segments: [] };
    });
  }

  private resetReplayAnchor(playerId: number) {
    this.record.observerReplays[playerId] = { anchor: this.observerSnapshot(playerId), segments: [] };
  }

  private nextRandom() {
    let state = this.record.randomState >>> 0;
    if (state === 0) state = 0x9e3779b9;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.record.randomState = state >>> 0;
    return this.record.randomState / 0x1_0000_0000;
  }

  private isHost(token: string) { return this.record.hostToken === token; }
  private requireHost(token: string) { if (!this.isHost(token)) throw new Error("只有房主可以使用测试工具。"); }

  playerIdForToken(token: string) {
    return this.record.seats.find((seat): seat is HumanSeat => seat.controller === "human" && seat.playerToken === token)?.playerId;
  }

  private humanSeat(playerId: number) {
    const seat = this.record.seats[playerId];
    return seat?.controller === "human" ? seat : null;
  }

  private currentDecisionPlayerId() {
    const game = this.requireGame();
    return this.record.pendingPronoun?.targetId ?? decisionPlayerId(game);
  }

  private decisionDescriptor(now = Date.now()): DecisionSummary | null {
    const game = this.record.game;
    if (!game || game.phase === "ended") return null;
    const playerId = this.record.pendingPronoun?.targetId ?? decisionPlayerId(game);
    const prompt = pendingPromptName(game, Boolean(this.record.pendingPronoun));
    const decisionType = prompt ? "response" : game.phase === "draw" ? "draw" : "play";
    const detail = prompt ?? decisionType;
    return { decisionId: `${this.record.stateVersion}:${playerId}:${detail}`, playerId, decisionType, detail, startedAt: now };
  }

  private syncDecision(now = Date.now()) {
    const next = this.decisionDescriptor(now);
    if (!next) { this.record.currentDecision = null; return; }
    const current = this.record.currentDecision;
    if (current && current.playerId === next.playerId && current.detail === next.detail) return;
    this.record.currentDecision = next;
  }

  private completeDecision(actionId: string, resolvedBy: DecisionRecord["resolvedBy"], now = Date.now()) {
    const current = this.record.currentDecision;
    if (!current) return;
    this.record.decisionRecords.push({ ...current, submittedAt: now, durationMs: Math.max(0, now - current.startedAt), resolvedBy, actionId });
    this.record.currentDecision = null;
  }

  private controlResolver(playerId: number): DecisionRecord["resolvedBy"] {
    const seat = this.record.seats[playerId];
    if (seat.controller === "ai") return "ai-native";
    return seat.controlMode === "ai-self" ? "ai-self" : seat.controlMode === "ai-host" ? "ai-host" : "human";
  }

  private isAiControlled(playerId: number) {
    const seat = this.record.seats[playerId];
    return seat.controller === "ai" || seat.controlMode !== "manual";
  }

  private decisionStats(): DecisionStatsSummary | null {
    if (!this.record.startedAt) return null;
    const rows = this.record.decisionRecords;
    const average = (selected: DecisionRecord[]) => selected.length ? Math.round(selected.reduce((sum, row) => sum + row.durationMs, 0) / selected.length) : 0;
    return {
      totalDurationMs: (this.record.endedAt ?? Date.now()) - this.record.startedAt,
      averageDecisionMs: average(rows),
      averageDrawMs: average(rows.filter((row) => row.decisionType === "draw")),
      averagePlayMs: average(rows.filter((row) => row.decisionType === "play")),
      averageResponseMs: average(rows.filter((row) => row.decisionType === "response")),
      longestDecisionMs: rows.reduce((longest, row) => Math.max(longest, row.durationMs), 0),
      delegatedDecisions: rows.filter((row) => row.resolvedBy !== "human").length,
      perPlayer: this.record.seats.map((seat) => {
        const own = rows.filter((row) => row.playerId === seat.playerId);
        return { playerId: seat.playerId, totalMs: own.reduce((sum, row) => sum + row.durationMs, 0), averageMs: average(own), count: own.length };
      }),
    };
  }

  join(token: string, nickname: string) {
    const resumed = this.playerIdForToken(token);
    if (resumed !== undefined) return resumed;
    if (this.record.status !== "lobby") throw new Error("对局已经开始，只有原玩家可以恢复座位。");
    const humanCount = this.record.seats.filter((seat) => seat.controller === "human").length;
    if (humanCount >= 4) throw new Error("房间已满。");
    const playerId = humanCount;
    this.record.seats.push({ playerId, name: safeName(nickname), controller: "human", playerToken: token, ready: false, controlMode: "manual", online: true, disconnectedSince: null });
    this.record.hostToken ??= token;
    this.bump();
    return playerId;
  }

  updateConnections(connectedTokens: ReadonlySet<string>, now = Date.now()) {
    let changed = false;
    this.record.seats.forEach((seat) => {
      if (seat.controller !== "human") return;
      const online = connectedTokens.has(seat.playerToken);
      if (online === seat.online) return;
      seat.online = online;
      seat.disconnectedSince = online ? null : now;
      changed = true;
      this.record.auditLog.push({ at: now, type: "connection", stateVersion: this.record.stateVersion + 1, playerId: seat.playerId, detail: online ? `${seat.name} 重连` : `${seat.name} 断线` });
    });
    if (changed) this.bump();
  }

  setReady(token: string, ready: boolean) {
    const playerId = this.requireHuman(token);
    const seat = this.record.seats[playerId];
    if (seat.controller !== "human" || this.record.status !== "lobby") throw new Error("现在不能修改准备状态。");
    seat.ready = ready;
    this.bump();
  }

  canStart(token: string) {
    const humans = this.record.seats.filter((seat): seat is HumanSeat => seat.controller === "human");
    return this.record.status === "lobby" && this.record.hostToken === token && humans.length >= 2 && humans.every((seat) => seat.ready);
  }

  start(token: string, random = Math.random, now = Date.now()) {
    if (!this.canStart(token)) throw new Error("至少两名真人加入且全部准备后，房主才能开始。");
    this.beginVisualBatch();
    const humanSeats = this.record.seats.filter((seat): seat is HumanSeat => seat.controller === "human");
    const seats: Array<HumanSeat | AiSeat> = [...humanSeats];
    while (seats.length < 4) {
      const playerId = seats.length;
      seats.push({ playerId, name: AI_NAMES[playerId] ?? `AI ${playerId + 1}`, controller: "ai", ready: true });
    }
    const controllers = seats.map((seat) => seat.controller) as SimController[];
    this.record.seats = seats;
    this.record.seed = Math.floor(random() * 0x1_0000_0000) >>> 0;
    this.record.randomState = this.record.seed || 0x9e3779b9;
    this.record.game = createSimGame(seats.map((seat) => seat.name), () => this.nextRandom(), {}, "online", controllers);
    this.record.memories = createAiMemories(4);
    this.record.status = "playing";
    this.record.startedAt = now;
    this.bump();
    this.initializeReplayAnchors();
    this.record.auditLog.push({ at: now, type: "game-started", stateVersion: this.record.stateVersion, detail: `开始游戏，seed=${this.record.seed}` });
    this.syncDecision(now);
    this.advanceAi(random, now);
  }

  private pronounActions(playerId: number): SimAction[] {
    const pending = this.record.pendingPronoun;
    const game = this.requireGame();
    if (!pending || pending.targetId !== playerId) return [];
    return [
      { id: "pronoun-accept", type: "reading-keep", label: `接受【${pending.cardName}】，变为${pending.cardName === "她" ? "女性" : "男性"}` },
      ...(game.players[playerId].joy > 0 ? [{ id: "pronoun-nonbinary", type: "reading-switch" as const, label: `支付 1 Joy，成为非二元并设为${pending.cardName === "她" ? "粉" : "蓝"}读取` }] : []),
    ];
  }

  private legalActionsForCurrentDecision() {
    const playerId = this.currentDecisionPlayerId();
    return this.record.pendingPronoun ? this.pronounActions(playerId) : enumerateLegalActions(this.requireGame());
  }

  private applyPronounResponse(action: SimAction, random: () => number) {
    const game = this.requireGame();
    const pending = this.record.pendingPronoun!;
    const response = action.id === "pronoun-accept" ? "accept-binary" : action.id === "pronoun-nonbinary" ? "pay-nonbinary" : null;
    if (!response || (response === "pay-nonbinary" && game.players[pending.targetId].joy < 1)) throw new Error("该响应已经失效。");
    this.record.pendingPronoun = null;
    this.applyAction({ ...pending.action, pronounResponse: response }, random);
  }

  submitAction(token: string, actionId: string, random = () => this.nextRandom(), requestId = `${token}:${actionId}:${Date.now()}`, expectedStateVersion = this.record.stateVersion, now = Date.now()) {
    const playerId = this.requireHuman(token);
    if (this.record.acceptedRequestIds.includes(requestId)) return;
    if (expectedStateVersion !== this.record.stateVersion) throw new Error("客户端状态已经过期，请按最新桌面重新选择。");
    if (this.record.paused) throw new Error("对局暂停中，暂时不能操作。");
    const seat = this.humanSeat(playerId)!;
    if (seat.controlMode !== "manual") throw new Error(seat.controlMode === "ai-host" ? "该座位正由房主托管。" : "请先取消 AI 托管。");
    if (this.currentDecisionPlayerId() !== playerId) throw new Error("现在不是由你做决定。");
    const action = this.legalActionsForCurrentDecision().find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("该动作已经失效，请按最新桌面重新选择。");
    this.beginVisualBatch();
    this.completeDecision(action.id, "human", now);
    if (this.record.pendingPronoun) this.applyPronounResponse(action, random);
    else if (!this.deferPronounToHuman(action)) this.applyAction(action, random);
    this.record.acceptedRequestIds.push(requestId);
    this.record.acceptedRequestIds = this.record.acceptedRequestIds.slice(-128);
    // 本人手动选择及其同步牌效结算完成后立即建立锚点。
    // 后续 AI / 托管座位的决定属于“刚才发生的事”，必须进入回看区间。
    this.resetReplayAnchor(playerId);
    this.advanceAi(random, now);
    this.syncDecision(now);
  }

  setSelfControl(token: string, controlMode: "manual" | "ai-self", random = () => this.nextRandom(), now = Date.now()) {
    const playerId = this.requireHuman(token);
    const seat = this.humanSeat(playerId)!;
    if (seat.controlMode === "ai-host") throw new Error("该座位由房主托管，只有房主可以恢复真人操作。");
    if (seat.controlMode === controlMode) return;
    this.beginVisualBatch();
    seat.controlMode = controlMode;
    this.bump();
    this.record.auditLog.push({ at: now, type: "control", stateVersion: this.record.stateVersion, playerId, detail: controlMode === "ai-self" ? `${seat.name} 主动托管给 AI` : `${seat.name} 取消主动托管` });
    if (controlMode === "ai-self") this.advanceAi(random, now);
    this.syncDecision(now);
  }

  hostSetControl(token: string, playerId: number, enabled: boolean, random = () => this.nextRandom(), now = Date.now()) {
    this.requireHost(token);
    const seat = this.humanSeat(playerId);
    if (!seat) throw new Error("只能托管真人座位。");
    this.beginVisualBatch();
    seat.controlMode = enabled ? "ai-host" : "manual";
    this.bump();
    this.record.auditLog.push({ at: now, type: "control", stateVersion: this.record.stateVersion, playerId, detail: enabled ? `房主持续托管 ${seat.name}` : `房主恢复 ${seat.name} 真人操作` });
    if (enabled) this.advanceAi(random, now);
    this.syncDecision(now);
  }

  hostResolveOne(token: string, random = () => this.nextRandom(), now = Date.now()) {
    this.requireHost(token);
    if (this.record.paused) throw new Error("请先继续对局，再处理当前选择。");
    const playerId = this.currentDecisionPlayerId();
    const seat = this.humanSeat(playerId);
    if (!seat) throw new Error("当前选择不属于真人座位。");
    const actions = this.legalActionsForCurrentDecision();
    if (!actions.length) throw new Error("当前没有可处理的合法动作。");
    this.beginVisualBatch();
    const decision = chooseHeuristicAction(visibleStateFor(this.requireGame(), playerId), actions, this.record.memories[playerId], random);
    this.completeDecision(decision.chosen.id, "ai-host-once", now);
    if (this.record.pendingPronoun) this.applyPronounResponse(decision.chosen, random);
    else if (!this.deferPronounToHuman(decision.chosen)) this.applyAction(decision.chosen, random);
    this.record.auditLog.push({ at: now, type: "control", stateVersion: this.record.stateVersion, playerId, actionId: decision.chosen.id, detail: `房主让 AI 只处理 ${seat.name} 的当前选择` });
    this.advanceAi(random, now);
    this.syncDecision(now);
  }

  hostSetPaused(token: string, paused: boolean, random = () => this.nextRandom(), now = Date.now()) {
    this.requireHost(token);
    if (this.record.paused === paused) return;
    this.beginVisualBatch();
    this.record.paused = paused;
    if (paused) this.record.pausedAt = now;
    else if (this.record.pausedAt !== null && this.record.currentDecision) {
      this.record.currentDecision.startedAt += Math.max(0, now - this.record.pausedAt);
      this.record.pausedAt = null;
    }
    this.bump();
    this.record.auditLog.push({ at: now, type: "pause", stateVersion: this.record.stateVersion, detail: paused ? "房主暂停对局" : "房主继续对局" });
    if (!paused) this.advanceAi(random, now);
    this.syncDecision(now);
  }

  advanceAi(random = () => this.nextRandom(), now = Date.now()) {
    if (this.record.paused) return;
    let guard = 0;
    while (this.record.game?.phase !== "ended") {
      const game = this.record.game!;
      const playerId = this.record.pendingPronoun?.targetId ?? decisionPlayerId(game);
      if (!this.isAiControlled(playerId)) break;
      this.syncDecision(now);
      const actions = this.legalActionsForCurrentDecision();
      if (!actions.length) throw new Error(`AI ${playerId} 没有合法动作。`);
      const decision = chooseHeuristicAction(visibleStateFor(game, playerId), actions, this.record.memories[playerId], random);
      this.completeDecision(decision.chosen.id, this.controlResolver(playerId), now);
      if (this.record.pendingPronoun) this.applyPronounResponse(decision.chosen, random);
      else if (!this.deferPronounToHuman(decision.chosen)) this.applyAction(decision.chosen, random);
      guard += 1;
      if (guard > 240) throw new Error("AI 自动推进超过安全上限。");
    }
    if (this.record.game?.phase === "ended" && this.record.status !== "ended") {
      this.record.status = "ended";
      this.record.endedAt = now;
      this.bump();
      this.record.auditLog.push({ at: now, type: "game-ended", stateVersion: this.record.stateVersion, detail: "游戏结束" });
    }
    this.syncDecision(now);
  }

  roomStateFor(token: string, connectedTokens: ReadonlySet<string> = new Set()): RoomStateMessage {
    const selfPlayerId = this.requireHuman(token);
    const seats: PublicSeat[] = Array.from({ length: 4 }, (_, playerId) => {
      const seat = this.record.seats[playerId];
      if (!seat) return { playerId, name: "等待加入", controller: "empty", ready: false, connected: false, disconnectedSince: null };
      if (seat.controller === "ai") return { playerId, name: seat.name, controller: "ai", ready: true, connected: true, controlMode: "ai", disconnectedSince: null };
      const connected = connectedTokens.has(seat.playerToken);
      return { playerId, name: seat.name, controller: "human", ready: seat.ready, connected, controlMode: seat.controlMode, disconnectedSince: connected ? null : seat.disconnectedSince };
    });
    return { type: "ROOM_STATE", roomId: this.record.roomId, status: this.record.status, seats, selfPlayerId, isHost: this.record.hostToken === token, canStart: this.canStart(token), paused: this.record.paused, pausedAt: this.record.pausedAt, currentDecision: this.record.currentDecision, decisionStats: this.isHost(token) ? this.decisionStats() : null };
  }

  gameStateFor(token: string): GameStateMessage | null {
    const playerId = this.requireHuman(token);
    const game = this.record.game;
    if (!game) return null;
    const seat = this.humanSeat(playerId)!;
    const isDecisionOwner = this.currentDecisionPlayerId() === playerId;
    const view = visibleStateFor(game, playerId);
    if (this.record.pendingPronoun) view.decisionPlayerId = this.record.pendingPronoun.targetId;
    const storedReplay = this.record.lastReplay;
    const replay: ReplayBundle | null = storedReplay ? { resolutionId: storedReplay.resolutionId, actorId: storedReplay.actorId, actionId: storedReplay.actionId, createdAt: storedReplay.createdAt, publicEvents: storedReplay.publicEvents, privateEvents: storedReplay.privateEvents[playerId] ?? [] } : null;
    return {
      type: "GAME_STATE",
      revision: this.record.stateVersion,
      stateVersion: this.record.stateVersion,
      view,
      actions: !this.record.paused && isDecisionOwner && seat.controlMode === "manual" ? this.legalActionsForCurrentDecision() : [],
      knownGoals: { ...this.record.memories[playerId].knownTargets },
      recentEvents: game.events.slice(0, 18),
      lastPlay: this.record.lastPlay ?? null,
      playAnimations: [...this.record.playAnimations],
      liveVisualSegments: [...(this.record.liveVisualSegments[playerId] ?? [])],
      replayBuffer: this.record.observerReplays[playerId] ?? null,
      pendingPronounCardName: this.record.pendingPronoun?.targetId === playerId ? this.record.pendingPronoun.cardName : null,
      paused: this.record.paused,
      controlMode: seat.controlMode,
      replay,
    };
  }

  exportTestRecord(token: string) {
    this.requireHost(token);
    const game = this.requireGame();
    const decisions = this.record.decisionRecords;
    const perPlayer = game.players.map((player) => {
      const own = decisions.filter((decision) => decision.playerId === player.id);
      const average = own.length ? own.reduce((sum, decision) => sum + decision.durationMs, 0) / own.length : 0;
      return {
        playerId: player.id,
        name: player.name,
        controller: this.record.seats[player.id].controller,
        controlMode: this.humanSeat(player.id)?.controlMode ?? "ai",
        goal: player.goal,
        finalScore: game.phase === "ended" ? finalScoreBreakdown(player).total : null,
        joy: player.joy,
        identity: player.identity,
        identityHistory: player.identityHistory,
        presents: player.presents.map((card) => card.name),
        items: player.items,
        totalDecisionMs: own.reduce((sum, decision) => sum + decision.durationMs, 0),
        averageDecisionMs: Math.round(average),
        longestDecisionMs: own.reduce((longest, decision) => Math.max(longest, decision.durationMs), 0),
        delegatedDecisions: own.filter((decision) => decision.resolvedBy !== "human").length,
      };
    });
    const byType = (type: DecisionSummary["decisionType"]) => {
      const rows = decisions.filter((decision) => decision.decisionType === type);
      return rows.length ? Math.round(rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length) : 0;
    };
    const payload = {
      formatVersion: 1,
      roomId: this.record.roomId,
      seed: this.record.seed,
      stateVersion: this.record.stateVersion,
      status: this.record.status,
      startedAt: this.record.startedAt,
      endedAt: this.record.endedAt,
      durationMs: this.record.startedAt ? (this.record.endedAt ?? Date.now()) - this.record.startedAt : 0,
      round: game.round,
      deckExhausted: game.finishing,
      deckExhaustedAt: this.record.deckExhaustedAt,
      players: perPlayer,
      decisionStats: { count: decisions.length, averageDrawMs: byType("draw"), averagePlayMs: byType("play"), averageResponseMs: byType("response"), decisions },
      authoritativeState: game,
      auditLog: this.record.auditLog,
    };
    const txt = [
      `dress-up! 联机试玩记录 · ${this.record.roomId}`,
      `stateVersion ${this.record.stateVersion} · seed ${this.record.seed ?? "未知"}`,
      `开始 ${this.record.startedAt ? new Date(this.record.startedAt).toISOString() : "未开始"}`,
      `结束 ${this.record.endedAt ? new Date(this.record.endedAt).toISOString() : "进行中"}`,
      "",
      ...perPlayer.map((player) => `${player.name} · ${player.controller} · ${player.goal} · Joy ${player.joy} · ${identityText(player.identity)} · 决策 ${Math.round(player.totalDecisionMs / 1000)}s`),
      "",
      `拿牌平均 ${Math.round(byType("draw") / 1000)}s · 出牌平均 ${Math.round(byType("play") / 1000)}s · 响应平均 ${Math.round(byType("response") / 1000)}s`,
      "",
      "事件：",
      ...this.record.auditLog.map((event) => `${new Date(event.at).toISOString()} [v${event.stateVersion}] ${event.detail}`),
    ].join("\n");
    return { filename: `dress-up-${this.record.roomId}-test-record`, json: JSON.stringify(payload, null, 2), txt };
  }

  private applyAction(action: SimAction, random = () => this.nextRandom()) {
    const before = this.requireGame();
    const actorId = decisionPlayerId(before);
    const observerIds = this.humanPlayerIds();
    const beforeSnapshots = Object.fromEntries(observerIds.map((playerId) => [playerId, this.observerSnapshot(playerId)])) as Record<number, ObserverVisualSnapshot>;
    let playAnimation: PlayAnimation | null = null;
    const privateReplay: Record<number, ReplayEvent[]> = {};
    if (before.fittingRoomOffer?.stage === "select" && (action.type === "fitting-room-select" || action.type === "fitting-room-solo-play" || action.type === "fitting-room-fizzle")) {
      privateReplay[before.fittingRoomOffer.actorId] = before.fittingRoomOffer.revealed.map((card) => ({ type: "PRIVATE_REVEAL", card, cardName: card.name, text: `牌堆顶：${card.name}` }));
    }
    if (action.type === "play") {
      const forcedPlay = before.forcedPlay;
      const card = forcedPlay && forcedPlay.card.id === action.cardId ? forcedPlay.card : before.players[actorId].hand.find((held) => held.id === action.cardId);
      if (card) {
        const playerDestination = card.kind === "present" || ["她", "他", "扑朔迷离", "先入为主", "学吉他", "开个小证", "地雷系", "封心锁爱", "自由职业者", "改好证了！"].includes(card.name);
        playAnimation = { actorId, card, destination: card.kind === "venue" ? "public" : playerDestination ? "player" : "discard", version: this.record.stateVersion + 1 };
        this.record.lastPlay = playAnimation;
        this.record.playAnimations.push(playAnimation);
      }
    }
    const beforeView = visibleStateFor(before, actorId);
    const after = applyLegalAction(before, action, random);
    const knowledgeEvents = knowledgeEventsFor(before, after, action);
    knowledgeEvents.filter((event) => event.type === "reveal").forEach((event) => {
      (privateReplay[event.observerId] ??= []).push({ type: "PRIVATE_REVEAL", playerId: event.targetId, text: `${after.players[event.targetId].name} 的目标：${event.goal}` });
    });
    const afterView = visibleStateFor(after, actorId);
    let memories = observePublicAction(this.record.memories, beforeView, action, afterView);
    memories = applyKnowledgeEvents(memories, knowledgeEvents);
    this.record.game = after;
    this.record.memories = memories;
    this.bump();
    observerIds.forEach((playerId) => {
      const beforeSnapshot = beforeSnapshots[playerId];
      const afterSnapshot = this.observerSnapshot(playerId);
      const observerPlayAnimation = playAnimation?.actorId === playerId ? null : playAnimation;
      const durationMs = observerPlayAnimation
        ? CARD_PLAY_REVEAL_DURATION_MS
        : hasAnimatedTableDelta(beforeSnapshot, afterSnapshot)
          ? TABLE_STATE_ANIMATION_DURATION_MS
          : 0;
      const segment: VisualSegment = {
        segmentId: `${this.record.stateVersion}:${actorId}:${action.id}:${playerId}`,
        stateVersion: this.record.stateVersion,
        before: beforeSnapshot,
        after: afterSnapshot,
        commands: [{ type: "resolve-state", play: observerPlayAnimation, durationMs }],
      };
      (this.record.liveVisualSegments[playerId] ??= []).push(segment);
      const replay = this.record.observerReplays[playerId] ??= { anchor: beforeSnapshot, segments: [] };
      replay.segments.push(segment);
    });
    this.record.lastReplay = buildReplay(before, after, action, actorId, privateReplay);
    if (!before.finishing && after.finishing) this.record.deckExhaustedAt = Date.now();
    const visibleHandCounts: Record<number, number> = {};
    this.record.seats.forEach((seat) => { if (seat.controller === "human") visibleHandCounts[seat.playerId] = visibleStateFor(after, seat.playerId).selfHand.length; });
    this.record.auditLog.push({
      at: Date.now(),
      type: "action",
      stateVersion: this.record.stateVersion,
      playerId: actorId,
      actionId: action.id,
      detail: action.label,
      resolution: this.record.lastReplay,
      diagnostic: {
        decisionPlayerId: this.record.pendingPronoun?.targetId ?? decisionPlayerId(after),
        activePlayer: after.active,
        authoritativeHandCounts: after.players.map((player) => player.hand.length),
        visibleHandCounts,
        forcedPlay: after.forcedPlay ? { playerId: after.forcedPlay.playerId, cardName: after.forcedPlay.card.name } : null,
        phase: after.phase,
        pendingPrompt: pendingPromptName(after, Boolean(this.record.pendingPronoun)),
      },
    });
  }

  private deferPronounToHuman(action: SimAction) {
    if (action.type !== "play" || action.targetId === undefined) return false;
    const game = this.requireGame();
    const actorId = decisionPlayerId(game);
    const forcedPlay = game.forcedPlay;
    const card = forcedPlay && forcedPlay.card.id === action.cardId ? forcedPlay.card : game.players[actorId].hand.find((held) => held.id === action.cardId);
    if ((card?.name !== "她" && card?.name !== "他") || game.players[action.targetId].controller !== "human") return false;
    this.record.pendingPronoun = { actorId, targetId: action.targetId, cardName: card.name, action };
    this.bump();
    this.syncDecision();
    return true;
  }

  private requireHuman(token: string) {
    const playerId = this.playerIdForToken(token);
    if (playerId === undefined) throw new Error("无效的玩家凭证。");
    return playerId;
  }

  private requireGame() {
    if (!this.record.game) throw new Error("对局尚未开始。");
    return this.record.game;
  }
}
