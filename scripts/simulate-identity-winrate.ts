import {
  applyLegalAction,
  compareFinalStanding,
  createSimGame,
  decisionPlayerId,
  enumerateLegalActions,
  finalScoreBreakdown,
  knowledgeEventsFor,
  projectedScore,
  sharesFinalStanding,
  simChecks,
  simShopOwnerJoy,
  simSide,
  visibleStateFor,
  type SimAction,
  type SimCard,
  type SimGame,
  type SimGoal,
  type SimIdentity,
} from "../lib/ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  observePublicAction,
  type AiMemory,
} from "../lib/heuristic-ai";

const GAMES = Number.parseInt(process.env.SIM_GAMES ?? "100", 10);
const SHOP_OWNER_CAP = Number.parseInt(process.env.SHOP_OWNER_CAP ?? "3", 10);
const SHOP_OWNER_SCORING = process.env.SHOP_OWNER_SCORING === "capped"
  ? "capped"
  : process.env.SHOP_OWNER_SCORING === "three-four-tier"
    ? "three-four-tier"
    : "three-four-tier-2-4";
const BASE_SEED = 20260822;
const identities: SimIdentity[] = ["male", "female", "nonbinary"];
const goals: SimGoal[] = ["文艺男", "男娘", "跨女", "demi-girl", "enby"];

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Bucket = { appearances: number; winShare: number; totalScore: number };
const makeBuckets = <T extends string>(keys: T[]) => Object.fromEntries(keys.map((key) => [key, { appearances: 0, winShare: 0, totalScore: 0 }])) as Record<T, Bucket>;

const identityStats = makeBuckets(identities);
const goalStats = makeBuckets(goals);
const identityGoalStats = Object.fromEntries(identities.map((identity) => [identity, makeBuckets(goals)])) as Record<SimIdentity, Record<SimGoal, Bucket>>;
type BreakdownBucket = { appearances: number; winShare: number; totalScore: number; totalJoy: number; items: Record<string, { label: string; totalPoints: number }> };
const goalBreakdownStats = Object.fromEntries(goals.map((goal) => [goal, { appearances: 0, winShare: 0, totalScore: 0, totalJoy: 0, items: {} }])) as Record<SimGoal, BreakdownBucket>;
let tiedGames = 0;
let totalDecisions = 0;
let totalRounds = 0;
let totalScore = 0;

type RunCardBucket = {
  plays: number;
  triggeredPlays: number;
  actorJoy: number;
  tableJoy: number;
};
const importantRunCards = ["程序员", "变装皇后", "女装店老板", "空间主理人", "伪娘团", "学吉他", "美妆博主", "自由职业者", "改好证了！", "职场 DEI"];
const runCardStats = Object.fromEntries(importantRunCards.map((name) => [name, { plays: 0, triggeredPlays: 0, actorJoy: 0, tableJoy: 0 }])) as Record<string, RunCardBucket>;
const relationshipStats = {
  complimentPlays: 0,
  complimentFizzles: 0,
  complimentJoyGiven: 0,
  markerJoyEarned: 0,
  markerTriggers: 0,
  activeMarkersAtEnd: 0,
  shieldPlays: 0,
  shieldTriggeredPlays: 0,
  shieldMarkersRemoved: 0,
  shieldJoyLossInflicted: 0,
  shieldedTargetExclusionsDuringCompliment: 0,
  shieldHoldersAtEnd: 0,
  jiraiPlays: 0,
  jiraiRetaliations: 0,
  jiraiJoyLossInflicted: 0,
};

type TimingBucket = {
  firstOpportunityGains: number[];
  pairedFirstOpportunityGains: number[];
  actualGains: number[];
  acquisitionRounds: number[];
  firstOpportunityRounds: number[];
  actualPlayRounds: number[];
  waitFromFirstOpportunity: number[];
};
const timingStats: Record<string, TimingBucket> = Object.fromEntries(["女装店老板", "空间主理人"].map((name) => [name, {
  firstOpportunityGains: [], pairedFirstOpportunityGains: [], actualGains: [], acquisitionRounds: [], firstOpportunityRounds: [], actualPlayRounds: [], waitFromFirstOpportunity: [],
}])) as Record<string, TimingBucket>;

type HeldTiming = { acquiredRound: number; firstOpportunityRound?: number; firstOpportunityGain?: number };

type MaleTierBucket = { appearances: number; totalScore: number; winShare: number };
const maleTierStats: Record<"exactly3" | "atLeast4", MaleTierBucket> = {
  exactly3: { appearances: 0, totalScore: 0, winShare: 0 },
  atLeast4: { appearances: 0, totalScore: 0, winShare: 0 },
};
let maleGoalAppearances = 0;
let malePlus10Completions = 0;

type LiteratureBucket = { appearances: number; totalScore: number; winShare: number };
const literatureRouteStats: Record<"noHair" | "hairTooManyChecks" | "hairRouteComplete", LiteratureBucket> = {
  noHair: { appearances: 0, totalScore: 0, winShare: 0 },
  hairTooManyChecks: { appearances: 0, totalScore: 0, winShare: 0 },
  hairRouteComplete: { appearances: 0, totalScore: 0, winShare: 0 },
};

const landmineChoiceStats = {
  decisionsWithLandmine: 0,
  globalPreferredLandmineWithoutPenalty: 0,
  globalRedirectedByPenalty: 0,
  globalStillTargetedDespitePenalty: 0,
  groupedPreferredLandmineWithoutPenalty: 0,
  groupedRedirectedByPenalty: 0,
  groupedStillTargetedDespitePenalty: 0,
};

function sourceJoy(game: SimGame, cardName: string, playerId?: number) {
  const players = playerId === undefined ? game.players : [game.players[playerId]];
  return players.reduce((sum, player) => sum + (player.scoreSources ?? [])
    .filter((source) => source.cardName === cardName)
    .reduce((playerSum, source) => playerSum + source.joy, 0), 0);
}

function underlyingPlayAction(game: SimGame, action: SimAction) {
  if (["reading-keep", "reading-switch"].includes(action.type)) return game.readingPrompt?.pendingAction ?? action;
  if (action.type === "check-count-select") return game.checkCountPrompt?.pendingAction ?? action;
  return action;
}

function resolvingCard(game: SimGame, action: SimAction): { card: SimCard; actorId: number; sourceAction: SimAction } | null {
  const sourceAction = underlyingPlayAction(game, action);
  if (sourceAction.type !== "play" || !sourceAction.cardId) return null;
  const actorId = game.active;
  const card = game.forcedPlay?.card.id === sourceAction.cardId
    ? game.forcedPlay.card
    : game.players[actorId].hand.find((held) => held.id === sourceAction.cardId);
  return card ? { card, actorId, sourceAction } : null;
}

function cardWasResolved(before: SimGame, after: SimGame, card: SimCard, actorId: number) {
  const remainsInHand = after.players[actorId].hand.some((held) => held.id === card.id);
  const remainsForced = after.forcedPlay?.card.id === card.id;
  return !remainsInHand && !remainsForced;
}

function exactRunCardJoy(before: SimGame, after: SimGame, cardName: string, actorId: number, sourceAction: SimAction) {
  const recordedTable = sourceJoy(after, cardName) - sourceJoy(before, cardName);
  const recordedActor = sourceJoy(after, cardName, actorId) - sourceJoy(before, cardName, actorId);
  if (recordedTable > 0) return { actorJoy: recordedActor, tableJoy: recordedTable };
  if (cardName === "自由职业者" || cardName === "改好证了！") return { actorJoy: 1, tableJoy: 1 };
  if (cardName === "学吉他") return { actorJoy: 1, tableJoy: 2 };
  if (cardName === "美妆博主") {
    const side = sourceAction.requiredReading ?? simSide(before.players[actorId]);
    return side === "male" ? { actorJoy: 2, tableJoy: 2 } : { actorJoy: 0, tableJoy: 0 };
  }
  if (cardName === "职场 DEI") {
    const tableJoy = before.players.filter((player) => !player.items.includes("自由职业者")).length;
    return { actorJoy: before.players[actorId].items.includes("自由职业者") ? 0 : 1, tableJoy };
  }
  return { actorJoy: 0, tableJoy: 0 };
}

function timingGain(game: SimGame, cardName: string) {
  if (cardName === "女装店老板") {
    const clothingKinds = new Set(game.players.flatMap((player) => player.presents.filter((card) => card.clothing || card.dress).map((card) => card.name))).size;
    return simShopOwnerJoy(clothingKinds, game.rules);
  }
  return game.players.filter((player) => simChecks(player) >= 2).length;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function histogram(values: number[]) {
  return Object.fromEntries([...new Set(values)].sort((a, b) => a - b).map((value) => [value, values.filter((entry) => entry === value).length]));
}

function targetGroupKey(action: SimAction) {
  if (action.targetId === undefined) return null;
  return JSON.stringify({
    type: action.type,
    cardId: action.cardId,
    sourcePlayerId: action.sourcePlayerId,
    marketCardId: action.marketCardId,
    presentId: action.presentId,
    presentIds: action.presentIds,
    venueMode: action.venueMode,
    requiredReading: action.requiredReading,
  });
}

function auditLandmineChoice(view: ReturnType<typeof visibleStateFor>, actions: SimAction[], memory: AiMemory) {
  const landmineIds = new Set(view.players.filter((player) => player.items.includes("地雷系")).map((player) => player.id));
  if (!landmineIds.size) return;
  landmineChoiceStats.decisionsWithLandmine += 1;
  const withoutLandmine = structuredClone(view);
  withoutLandmine.players.forEach((player) => { player.items = player.items.filter((item) => item !== "地雷系"); });

  const bestWith = chooseHeuristicAction(view, actions, memory, () => 0.5).chosen;
  const bestWithout = chooseHeuristicAction(withoutLandmine, actions, memory, () => 0.5).chosen;
  if (bestWithout.targetId !== undefined && landmineIds.has(bestWithout.targetId)) {
    landmineChoiceStats.globalPreferredLandmineWithoutPenalty += 1;
    if (bestWith.targetId !== bestWithout.targetId) landmineChoiceStats.globalRedirectedByPenalty += 1;
    else landmineChoiceStats.globalStillTargetedDespitePenalty += 1;
  }

  const groups = new Map<string, SimAction[]>();
  actions.forEach((action) => {
    const key = targetGroupKey(action);
    if (!key) return;
    const group = groups.get(key) ?? [];
    group.push(action);
    groups.set(key, group);
  });
  groups.forEach((group) => {
    if (new Set(group.map((action) => action.targetId)).size < 2) return;
    const groupWithout = chooseHeuristicAction(withoutLandmine, group, memory, () => 0.5).chosen;
    if (groupWithout.targetId === undefined || !landmineIds.has(groupWithout.targetId)) return;
    const groupWith = chooseHeuristicAction(view, group, memory, () => 0.5).chosen;
    landmineChoiceStats.groupedPreferredLandmineWithoutPenalty += 1;
    if (groupWith.targetId !== groupWithout.targetId) landmineChoiceStats.groupedRedirectedByPenalty += 1;
    else landmineChoiceStats.groupedStillTargetedDespitePenalty += 1;
  });
}

const originalMathRandom = Math.random;

for (let run = 0; run < GAMES; run += 1) {
  const random = mulberry32(BASE_SEED + run * 7919);
  // Some card effects still use the engine's default Math.random path. Bind it
  // to this game's seeded generator so counterfactual runs are reproducible.
  Math.random = random;
  let game = createSimGame(["A", "B", "C", "D"], random, {
    shopOwnerCap: SHOP_OWNER_CAP,
    shopOwnerScoring: SHOP_OWNER_SCORING,
  });
  let memories = createAiMemories(4);
  let decisions = 0;
  const heldTiming = new Map<string, HeldTiming>();

  while (game.phase !== "ended" && decisions < 360) {
    const actorId = decisionPlayerId(game);
    const actions = enumerateLegalActions(game);
    if (!actions.length) throw new Error(`Game ${run + 1}: no legal action\n${JSON.stringify({
      phase: game.phase,
      active: game.active,
      decisionPlayerId: actorId,
      deckCount: game.deck.length,
      market: game.market.map((card) => card.name),
      hands: game.players.map((player) => player.hand.map((card) => card.name)),
      certificateOffer: game.certificateOffer,
      truthOffer: game.truthOffer,
      confusionOffer: game.confusionOffer,
      forcedPlay: game.forcedPlay,
      venueExchange: game.venueExchange,
      manzhanPinkPrompt: game.manzhanPinkPrompt,
      readingPrompt: game.readingPrompt,
      checkCountPrompt: game.checkCountPrompt,
    }, null, 2)}`);
    for (const [cardName, bucket] of Object.entries(timingStats)) {
      const heldEntries = game.players.flatMap((player) => player.hand.filter((card) => card.name === cardName).map((card) => ({ card, playerId: player.id })));
      if (game.forcedPlay?.card.name === cardName) heldEntries.push({ card: game.forcedPlay.card, playerId: game.forcedPlay.playerId });
      heldEntries.forEach(({ card, playerId }) => {
        const key = `${run}:${card.id}`;
        const timing = heldTiming.get(key) ?? { acquiredRound: game.round };
        heldTiming.set(key, timing);
        const canPlayNow = playerId === game.active && actions.some((action) => action.type === "play" && action.cardId === card.id);
        if (canPlayNow && timing.firstOpportunityRound === undefined) {
          timing.firstOpportunityRound = game.round;
          timing.firstOpportunityGain = timingGain(game, cardName);
          bucket.firstOpportunityRounds.push(game.round);
          bucket.firstOpportunityGains.push(timing.firstOpportunityGain);
        }
      });
    }
    const before = game;
    const beforeView = visibleStateFor(before, actorId);
    auditLandmineChoice(beforeView, actions, memories[actorId]);
    const decision = chooseHeuristicAction(beforeView, actions, memories[actorId], random);
    const resolving = resolvingCard(before, decision.chosen);
    const sourceJoyBefore = {
      compliment: sourceJoy(before, "心动夸夸"),
      marker: sourceJoy(before, "心动标记"),
    };
    game = applyLegalAction(before, decision.chosen);
    if (resolving && cardWasResolved(before, game, resolving.card, resolving.actorId)) {
      const { card, actorId: cardActorId, sourceAction } = resolving;
      if (card.name === "心动夸夸") {
        relationshipStats.complimentPlays += 1;
        if (sourceAction.targetId === undefined) relationshipStats.complimentFizzles += 1;
        relationshipStats.shieldedTargetExclusionsDuringCompliment += before.players.filter((player) => player.id !== cardActorId && player.items.includes("封心锁爱")).length;
      }
      if (card.name === "封心锁爱") {
        relationshipStats.shieldPlays += 1;
        const incoming = before.players.filter((player) => player.crushTargetId === cardActorId);
        if (incoming.length > 0) relationshipStats.shieldTriggeredPlays += 1;
        relationshipStats.shieldMarkersRemoved += incoming.length;
        relationshipStats.shieldJoyLossInflicted += incoming.reduce((sum, giver) => sum + Math.min(2, giver.joy), 0);
      }
      if (card.name === "地雷系") relationshipStats.jiraiPlays += 1;
      const runBucket = runCardStats[card.name];
      if (runBucket) {
        const benefit = exactRunCardJoy(before, game, card.name, cardActorId, sourceAction);
        runBucket.plays += 1;
        runBucket.actorJoy += benefit.actorJoy;
        runBucket.tableJoy += benefit.tableJoy;
        if (benefit.tableJoy > 0) runBucket.triggeredPlays += 1;
        const timingBucket = timingStats[card.name];
        if (timingBucket) {
          const timing = heldTiming.get(`${run}:${card.id}`);
          timingBucket.actualGains.push(benefit.actorJoy);
          timingBucket.actualPlayRounds.push(before.round);
          if (timing) timingBucket.acquisitionRounds.push(timing.acquiredRound);
          if (timing?.firstOpportunityGain !== undefined && timing.firstOpportunityRound !== undefined) {
            timingBucket.pairedFirstOpportunityGains.push(timing.firstOpportunityGain);
            timingBucket.waitFromFirstOpportunity.push(before.round - timing.firstOpportunityRound);
          }
        }
      }
    }
    const previousTopEvent = before.events[0];
    const oldEventIndex = previousTopEvent ? game.events.indexOf(previousTopEvent) : game.events.length;
    const newEvents = oldEventIndex >= 0 ? game.events.slice(0, oldEventIndex) : game.events;
    const jiraiEvents = newEvents.filter((entry) => entry.includes("的【地雷系】") && entry.includes("而触发"));
    relationshipStats.jiraiRetaliations += jiraiEvents.length;
    relationshipStats.jiraiJoyLossInflicted += jiraiEvents.filter((entry) => entry.includes("失去 1 Joy")).length;
    relationshipStats.complimentJoyGiven += sourceJoy(game, "心动夸夸") - sourceJoyBefore.compliment;
    const markerJoyDelta = sourceJoy(game, "心动标记") - sourceJoyBefore.marker;
    relationshipStats.markerJoyEarned += markerJoyDelta;
    relationshipStats.markerTriggers += markerJoyDelta;
    const afterView = visibleStateFor(game, actorId);
    memories = observePublicAction(memories, beforeView, decision.chosen, afterView);
    memories = applyKnowledgeEvents(memories, knowledgeEventsFor(before, game, decision.chosen));
    decisions += 1;
  }

  if (game.phase !== "ended") throw new Error(`Game ${run + 1}: exceeded decision limit`);
  const scores = game.players.map(projectedScore);
  const standings = [...game.players].sort(compareFinalStanding);
  const winners = standings.filter((player) => sharesFinalStanding(player, standings[0]));
  const share = 1 / winners.length;
  if (winners.length > 1) tiedGames += 1;

  game.players.forEach((player, index) => {
    const breakdown = finalScoreBreakdown(player);
    identityStats[player.identity].appearances += 1;
    identityStats[player.identity].totalScore += scores[index];
    goalStats[player.goal].appearances += 1;
    goalStats[player.goal].totalScore += scores[index];
    identityGoalStats[player.identity][player.goal].appearances += 1;
    identityGoalStats[player.identity][player.goal].totalScore += scores[index];
    const goalBreakdown = goalBreakdownStats[player.goal];
    goalBreakdown.appearances += 1;
    goalBreakdown.totalScore += breakdown.total;
    goalBreakdown.totalJoy += breakdown.joyPoints;
    breakdown.goalItems.forEach((item) => {
      goalBreakdown.items[item.key] ??= { label: item.label, totalPoints: 0 };
      goalBreakdown.items[item.key].totalPoints += item.points;
    });
    if (player.goal === "男娘") {
      maleGoalAppearances += 1;
      const checkCount = simChecks(player);
      const tier = checkCount === 3 ? maleTierStats.exactly3 : checkCount >= 4 ? maleTierStats.atLeast4 : null;
      if (tier) {
        tier.appearances += 1;
        tier.totalScore += breakdown.total;
        if (winners.some((winner) => winner.id === player.id)) tier.winShare += share;
      }
      if (breakdown.goalItems.find((item) => item.key === "presentation")?.points === 10) malePlus10Completions += 1;
    }
    if (player.goal === "文艺男") {
      const hasHair = player.presents.some((card) => card.name === "长发");
      const literatureBucket = !hasHair
        ? literatureRouteStats.noHair
        : simChecks(player) > 2
          ? literatureRouteStats.hairTooManyChecks
          : literatureRouteStats.hairRouteComplete;
      literatureBucket.appearances += 1;
      literatureBucket.totalScore += breakdown.total;
      if (winners.some((winner) => winner.id === player.id)) literatureBucket.winShare += share;
    }
    totalScore += scores[index];
  });
  winners.forEach((player) => {
    identityStats[player.identity].winShare += share;
    goalStats[player.goal].winShare += share;
    identityGoalStats[player.identity][player.goal].winShare += share;
    goalBreakdownStats[player.goal].winShare += share;
  });
  totalDecisions += decisions;
  totalRounds += game.round;
  relationshipStats.activeMarkersAtEnd += game.players.filter((player) => player.crushTargetId !== null).length;
  relationshipStats.shieldHoldersAtEnd += game.players.filter((player) => player.items.includes("封心锁爱")).length;
}

Math.random = originalMathRandom;

const summarize = <T extends string>(buckets: Record<T, Bucket>, labels: Record<T, string>) => Object.entries(buckets).map(([key, raw]) => {
  const value = raw as Bucket;
  return {
    key,
    label: labels[key as T],
    appearances: value.appearances,
    appearanceRate: value.appearances / (GAMES * 4),
    winShare: value.winShare,
    shareOfWins: value.winShare / GAMES,
    conditionalWinRate: value.winShare / value.appearances,
    averageScore: value.totalScore / value.appearances,
  };
});

const identityGoal = identities.flatMap((identity) => goals.map((goal) => {
  const value = identityGoalStats[identity][goal];
  return {
    identity,
    identityLabel: { male: "男性", female: "女性", nonbinary: "非二元" }[identity],
    goal,
    appearances: value.appearances,
    averageScore: value.appearances ? value.totalScore / value.appearances : null,
    winShare: value.winShare,
    conditionalWinRate: value.appearances ? value.winShare / value.appearances : null,
  };
}));

const goalItemBreakdown = goals.map((goal) => {
  const value = goalBreakdownStats[goal];
  return {
    goal,
    appearances: value.appearances,
    items: Object.entries(value.items).map(([key, item]) => ({ key, label: item.label, averagePoints: item.totalPoints / value.appearances })),
    averageJoyPoints: value.totalJoy / value.appearances,
    averageTotalScore: value.totalScore / value.appearances,
    winShare: value.winShare,
    conditionalWinRate: value.winShare / value.appearances,
  };
});

const report = {
  games: GAMES,
  seed: BASE_SEED,
  shopOwnerCap: SHOP_OWNER_CAP,
  shopOwnerScoring: SHOP_OWNER_SCORING,
  scoring: "目标分 + 局末剩余 Joy",
  playerSeats: GAMES * 4,
  overallAverageScore: totalScore / (GAMES * 4),
  tiedGames,
  tiedGameRate: tiedGames / GAMES,
  averageDecisions: totalDecisions / GAMES,
  averageRounds: totalRounds / GAMES,
  goalItemBreakdown,
  identityGoal,
  identity: summarize(identityStats, { male: "男性", female: "女性", nonbinary: "非二元" }),
  goals: summarize(goalStats, { 文艺男: "文艺男", 男娘: "男娘", 跨女: "跨女", "demi-girl": "demi-girl", enby: "enby" }),
  relationshipCards: {
    ...relationshipStats,
    complimentJoyPerPlay: relationshipStats.complimentPlays ? relationshipStats.complimentJoyGiven / relationshipStats.complimentPlays : 0,
    markerJoyPerComplimentPlay: relationshipStats.complimentPlays ? relationshipStats.markerJoyEarned / relationshipStats.complimentPlays : 0,
    markerTriggersPerEstablishedMarker: relationshipStats.complimentJoyGiven ? relationshipStats.markerTriggers / relationshipStats.complimentJoyGiven : 0,
    shieldJoyLossPerPlay: relationshipStats.shieldPlays ? relationshipStats.shieldJoyLossInflicted / relationshipStats.shieldPlays : 0,
    shieldJoyLossPerTriggeredPlay: relationshipStats.shieldTriggeredPlays ? relationshipStats.shieldJoyLossInflicted / relationshipStats.shieldTriggeredPlays : 0,
    jiraiJoyLossPerPlay: relationshipStats.jiraiPlays ? relationshipStats.jiraiJoyLossInflicted / relationshipStats.jiraiPlays : 0,
    jiraiJoyLossPerRetaliation: relationshipStats.jiraiRetaliations ? relationshipStats.jiraiJoyLossInflicted / relationshipStats.jiraiRetaliations : 0,
  },
  landmineChoiceAudit: {
    ...landmineChoiceStats,
    globalRedirectionRate: landmineChoiceStats.globalPreferredLandmineWithoutPenalty
      ? landmineChoiceStats.globalRedirectedByPenalty / landmineChoiceStats.globalPreferredLandmineWithoutPenalty
      : 0,
    groupedRedirectionRate: landmineChoiceStats.groupedPreferredLandmineWithoutPenalty
      ? landmineChoiceStats.groupedRedirectedByPenalty / landmineChoiceStats.groupedPreferredLandmineWithoutPenalty
      : 0,
  },
  literatureRouteDiagnostics: Object.entries(literatureRouteStats).map(([category, value]) => ({
    category,
    ...value,
    shareOfLiteratureGoal: goalBreakdownStats["文艺男"].appearances ? value.appearances / goalBreakdownStats["文艺男"].appearances : 0,
    averageScore: value.appearances ? value.totalScore / value.appearances : null,
    conditionalWinRate: value.appearances ? value.winShare / value.appearances : null,
  })),
  maleGoalTiers: {
    exactly3Checks: {
      ...maleTierStats.exactly3,
      averageScore: maleTierStats.exactly3.appearances ? maleTierStats.exactly3.totalScore / maleTierStats.exactly3.appearances : null,
      conditionalWinRate: maleTierStats.exactly3.appearances ? maleTierStats.exactly3.winShare / maleTierStats.exactly3.appearances : null,
    },
    atLeast4Checks: {
      ...maleTierStats.atLeast4,
      averageScore: maleTierStats.atLeast4.appearances ? maleTierStats.atLeast4.totalScore / maleTierStats.atLeast4.appearances : null,
      conditionalWinRate: maleTierStats.atLeast4.appearances ? maleTierStats.atLeast4.winShare / maleTierStats.atLeast4.appearances : null,
    },
    plus10Completions: malePlus10Completions,
    plus10CompletionRate: maleGoalAppearances ? malePlus10Completions / maleGoalAppearances : 0,
    plus10CompletionRateAmongAtLeast4: maleTierStats.atLeast4.appearances ? malePlus10Completions / maleTierStats.atLeast4.appearances : 0,
  },
  timingAnalysis: Object.entries(timingStats).map(([name, value]) => ({
    name,
    firstOpportunitySamples: value.firstOpportunityGains.length,
    actualPlaySamples: value.actualGains.length,
    averageAcquisitionRound: mean(value.acquisitionRounds),
    averageFirstOpportunityRound: mean(value.firstOpportunityRounds),
    averageActualPlayRound: mean(value.actualPlayRounds),
    actualPlayRoundP25: quantile(value.actualPlayRounds, 0.25),
    actualPlayRoundMedian: quantile(value.actualPlayRounds, 0.5),
    actualPlayRoundP75: quantile(value.actualPlayRounds, 0.75),
    averageWaitRoundsAfterFirstOpportunity: mean(value.waitFromFirstOpportunity),
    waitedPlayCount: value.waitFromFirstOpportunity.filter((rounds) => rounds > 0).length,
    waitedPlayRate: value.waitFromFirstOpportunity.length ? value.waitFromFirstOpportunity.filter((rounds) => rounds > 0).length / value.waitFromFirstOpportunity.length : 0,
    waitRoundMedian: quantile(value.waitFromFirstOpportunity, 0.5),
    averageFirstOpportunityGainAll: mean(value.firstOpportunityGains),
    firstOpportunityGainHistogram: histogram(value.firstOpportunityGains),
    averageFirstOpportunityGainForPlayedCards: mean(value.pairedFirstOpportunityGains),
    averageActualGain: mean(value.actualGains),
    actualGainHistogram: histogram(value.actualGains),
    averageGainFromWaiting: mean(value.actualGains) !== null && mean(value.pairedFirstOpportunityGains) !== null
      ? mean(value.actualGains)! - mean(value.pairedFirstOpportunityGains)!
      : null,
  })),
  importantRunCards: Object.entries(runCardStats).map(([name, value]) => ({
    name,
    ...value,
    triggerRate: value.plays ? value.triggeredPlays / value.plays : 0,
    actorJoyPerPlay: value.plays ? value.actorJoy / value.plays : 0,
    tableJoyPerPlay: value.plays ? value.tableJoy / value.plays : 0,
  })),
};

console.log(JSON.stringify(report, null, 2));
