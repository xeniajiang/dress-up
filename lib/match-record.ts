import { compareFinalStanding, decisionPlayerId, finalScoreBreakdown, sharesFinalStanding, type SimAction, type SimGame } from "./ai-engine";

export const MATCH_SCHEMA_VERSION = 1;
export const RULES_VERSION = "2026-09-20";
export const AI_VERSION = "heuristic-1";
export const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "dev";

export type MatchMode = "single" | "spectator" | "multiplayer";

export type MatchRecordPlayer = {
  seat: number;
  playerId: string;
  displayName: string;
  humanOrAI: "human" | "ai";
  aiVersion?: string;
  goal: string;
};

export type MatchChoiceContext = {
  hand: string[];
  market: string[];
  legalOptions: SimAction[];
  chosenOption: SimAction;
  decisionTimeMs: number;
};

export type MatchChange = {
  type: "joy_change" | "identity_change" | "reading_change" | "temporary_identity_change" | "presentation_added" | "presentation_removed" | "item_added" | "item_removed";
  player: number;
  delta?: number;
  source?: string;
  value?: string | null;
};

export type MatchEvent = {
  seq: number;
  at: string;
  turn: number;
  actor: number;
  controller: "human" | "ai";
  type: string;
  actionId: string;
  action: SimAction;
  label: string;
  card?: string;
  target?: number;
  disposition?: "normal" | "voluntary_fizzle" | "no_legal_target_fizzle" | "forced_play";
  choice?: MatchChoiceContext;
  changes: MatchChange[];
  messages: string[];
};

export type MatchFinalPlayer = {
  seat: number;
  playerId: string;
  displayName: string;
  identity: string;
  reading: string;
  presentations: string[];
  items: string[];
  goal: string;
  scoreItems: ReturnType<typeof finalScoreBreakdown>["goalItems"];
  goalScore: number;
  joy: number;
  totalScore: number;
  rank: number;
};

export type MatchRecord = {
  schemaVersion: number;
  admin?: { starred: boolean };
  matchInfo: {
    matchId: string;
    mode: MatchMode;
    rulesVersion: string;
    buildVersion: string;
    startTime: string;
    endTime: string | null;
    completed: boolean;
    randomSeed: number | null;
  };
  players: MatchRecordPlayer[];
  initialState: SimGame;
  events: MatchEvent[];
  finalState: { game: SimGame; players: MatchFinalPlayer[] } | null;
};

export type MatchPlayerIdentity = { playerId: string; displayName?: string };

function cloneGame(game: SimGame): SimGame {
  return JSON.parse(JSON.stringify(game)) as SimGame;
}

export function createMatchId() {
  return `match_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function createMatchRecord(args: {
  game: SimGame;
  mode: MatchMode;
  identities: MatchPlayerIdentity[];
  matchId?: string;
  startTime?: number;
  randomSeed?: number | null;
  buildVersion?: string;
}): MatchRecord {
  const startTime = args.startTime ?? Date.now();
  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    matchInfo: {
      matchId: args.matchId ?? createMatchId(),
      mode: args.mode,
      rulesVersion: RULES_VERSION,
      buildVersion: args.buildVersion ?? BUILD_VERSION,
      startTime: new Date(startTime).toISOString(),
      endTime: null,
      completed: false,
      randomSeed: args.randomSeed ?? null,
    },
    players: args.game.players.map((player) => ({
      seat: player.id,
      playerId: args.identities[player.id]?.playerId ?? `${player.controller}:${player.id}`,
      displayName: args.identities[player.id]?.displayName ?? player.name,
      humanOrAI: player.controller,
      ...(player.controller === "ai" ? { aiVersion: AI_VERSION } : {}),
      goal: player.goal,
    })),
    initialState: cloneGame(args.game),
    events: [],
    finalState: null,
  };
}

function playedCardName(game: SimGame, action: SimAction, actor: number) {
  if (game.forcedPlay && game.forcedPlay.card.id === action.cardId) return game.forcedPlay.card.name;
  const held = game.players[actor]?.hand.find((card) => card.id === action.cardId);
  if (held) return held.name;
  const market = game.market.find((card) => card.id === action.marketCardId);
  return market?.name;
}

function diffNames(before: string[], after: string[]) {
  const remaining = [...before];
  const added: string[] = [];
  after.forEach((name) => {
    const index = remaining.indexOf(name);
    if (index >= 0) remaining.splice(index, 1);
    else added.push(name);
  });
  return { added, removed: remaining };
}

function stateChanges(before: SimGame, after: SimGame, source?: string): MatchChange[] {
  const changes: MatchChange[] = [];
  before.players.forEach((previous, seat) => {
    const player = after.players[seat];
    if (!player) return;
    const joyDelta = player.joy - previous.joy;
    if (joyDelta) changes.push({ type: "joy_change", player: seat, delta: joyDelta, source });
    if (player.identity !== previous.identity) changes.push({ type: "identity_change", player: seat, value: player.identity, source });
    if (player.reading !== previous.reading) changes.push({ type: "reading_change", player: seat, value: player.reading, source });
    if (player.tempIdentity !== previous.tempIdentity) changes.push({ type: "temporary_identity_change", player: seat, value: player.tempIdentity, source });
    const presents = diffNames(previous.presents.map((card) => card.name), player.presents.map((card) => card.name));
    presents.added.forEach((value) => changes.push({ type: "presentation_added", player: seat, value, source }));
    presents.removed.forEach((value) => changes.push({ type: "presentation_removed", player: seat, value, source }));
    const items = diffNames(previous.items, player.items);
    items.added.forEach((value) => changes.push({ type: "item_added", player: seat, value, source }));
    items.removed.forEach((value) => changes.push({ type: "item_removed", player: seat, value, source }));
  });
  return changes;
}

export function appendMatchEvent(record: MatchRecord, args: {
  before: SimGame;
  after: SimGame;
  action: SimAction;
  legalActions: SimAction[];
  controller: "human" | "ai";
  decisionTimeMs?: number;
  at?: number;
}) {
  const actor = decisionPlayerId(args.before);
  const card = playedCardName(args.before, args.action, actor);
  const sameCardNormalActions = args.legalActions.filter((candidate) => candidate.cardId === args.action.cardId && !candidate.fizzle);
  const forced = args.before.forcedPlay?.card.id === args.action.cardId;
  const newMessageCount = Math.max(0, args.after.events.length - args.before.events.length);
  const event: MatchEvent = {
    seq: record.events.length + 1,
    at: new Date(args.at ?? Date.now()).toISOString(),
    turn: args.before.turnSerial,
    actor,
    controller: args.controller,
    type: args.action.type,
    actionId: args.action.id,
    action: { ...args.action },
    label: args.action.label,
    ...(card ? { card } : {}),
    ...(args.action.targetId === undefined ? {} : { target: args.action.targetId }),
    disposition: forced ? "forced_play" : args.action.fizzle ? (sameCardNormalActions.length ? "voluntary_fizzle" : "no_legal_target_fizzle") : "normal",
    ...(args.controller === "human" ? {
      choice: {
        hand: args.before.players[actor]?.hand.map((held) => held.name) ?? [],
        market: args.before.market.map((held) => held.name),
        legalOptions: args.legalActions.map((option) => ({ ...option })),
        chosenOption: { ...args.action },
        decisionTimeMs: Math.max(0, Math.round(args.decisionTimeMs ?? 0)),
      },
    } : {}),
    changes: stateChanges(args.before, args.after, card),
    messages: args.after.events.slice(0, newMessageCount).reverse(),
  };
  record.events.push(event);
  if (args.after.phase === "ended") finalizeMatchRecord(record, args.after, args.at);
  return event;
}

export function finalizeMatchRecord(record: MatchRecord, game: SimGame, at = Date.now()) {
  const standing = [...game.players].sort(compareFinalStanding);
  record.matchInfo.completed = game.phase === "ended";
  record.matchInfo.endTime = new Date(at).toISOString();
  record.finalState = {
    game: cloneGame(game),
    players: game.players.map((player) => {
      const score = finalScoreBreakdown(player);
      return {
        seat: player.id,
        playerId: record.players[player.id]?.playerId ?? String(player.id),
        displayName: record.players[player.id]?.displayName ?? player.name,
        identity: player.identity,
        reading: player.reading,
        presentations: player.presents.map((card) => card.name),
        items: [...player.items],
        goal: player.goal,
        scoreItems: score.goalItems,
        goalScore: score.goalItems.reduce((sum, item) => sum + item.points, 0),
        joy: player.joy,
        totalScore: score.total,
        rank: standing.findIndex((candidate) => sharesFinalStanding(candidate, player)) + 1,
      };
    }),
  };
}

export function matchSummary(record: MatchRecord) {
  return {
    matchId: record.matchInfo.matchId,
    startTime: record.matchInfo.startTime,
    endTime: record.matchInfo.endTime,
    completed: record.matchInfo.completed,
    mode: record.matchInfo.mode,
    rulesVersion: record.matchInfo.rulesVersion,
    buildVersion: record.matchInfo.buildVersion,
    starred: record.admin?.starred === true,
    players: record.players.map((player) => ({
      playerId: player.playerId,
      displayName: player.displayName,
      humanOrAI: player.humanOrAI,
      goal: player.goal,
      totalScore: record.finalState?.players[player.seat]?.totalScore ?? null,
    })),
    eventCount: record.events.length,
  };
}
