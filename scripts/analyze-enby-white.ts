import {
  applyLegalAction,
  createSimGame,
  decisionPlayerId,
  enbyScoringSmallItems,
  enumerateLegalActions,
  finalScoreBreakdown,
  knowledgeEventsFor,
  projectedScore,
  visibleStateFor,
} from "../lib/ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  observePublicAction,
} from "../lib/heuristic-ai";

const GAMES = Number.parseInt(process.env.SIM_GAMES ?? "3000", 10);
const BASE_SEED = 20260824;

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const ratio = (value: number, total: number) => total ? value / total : 0;
const round = (value: number) => Math.round(value * 10000) / 10000;

let enbyAppearances = 0;
let finalNonbinary = 0;
let currentWhite = 0;
let ternaryWhite = 0;
let nonbinaryAndCurrentWhite = 0;
let nonbinaryAndTernaryWhite = 0;
let anySmallItem = 0;
let threeSmallItems = 0;
let currentPerfect = 0;
let ternaryPerfect = 0;
let currentGoalPoints = 0;
let currentTotalPoints = 0;
let ternaryGoalPoints = 0;
let ternaryTotalPoints = 0;
let currentWinShare = 0;
let ternaryWinShare = 0;
let currentCoWins = 0;
let ternaryCoWins = 0;
const whiteSources: Record<string, number> = { "扑朔迷离": 0, "先入为主": 0, "福灵塔": 0, "漫展": 0, "未知": 0 };

for (let run = 0; run < GAMES; run += 1) {
  const random = mulberry32(BASE_SEED + run * 7919);
  let game = createSimGame(["A", "B", "C", "D"], random);
  let memories = createAiMemories(4);
  const ternaryTriggered = new Set<number>();
  const firstWhiteSource = new Map<number, string>();
  let decisions = 0;

  while (game.phase !== "ended" && decisions < 360) {
    const actorId = decisionPlayerId(game);
    const actions = enumerateLegalActions(game);
    if (!actions.length) throw new Error(`Game ${run + 1}: no legal action`);
    const before = game;
    const beforeView = visibleStateFor(before, actorId);
    const decision = chooseHeuristicAction(beforeView, actions, memories[actorId], random);
    const chosen = decision.chosen;
    const playedCard = chosen.type === "play"
      ? before.forcedPlay?.card.id === chosen.cardId
        ? before.forcedPlay.card
        : before.players[actorId].hand.find((card) => card.id === chosen.cardId)
      : undefined;
    const actorIdentity = before.players[actorId].tempIdentity ?? before.players[actorId].identity;
    const ternaryActuallyTriggered = playedCard !== undefined
      && ["扑朔迷离", "先入为主"].includes(playedCard.name)
      && actorIdentity === "nonbinary"
      && !chosen.id.endsWith(":fizzle")
      && !chosen.id.endsWith(":forced-fizzle");

    game = applyLegalAction(before, chosen);
    if (ternaryActuallyTriggered) ternaryTriggered.add(actorId);

    game.players.forEach((player, playerId) => {
      if (before.players[playerId].whiteEffects > 0 || player.whiteEffects === 0) return;
      const sourceEvent = game.events.find((item) => item.startsWith(`${player.name} 首次触发【`));
      const source = sourceEvent?.match(/首次触发【([^】]+)】/)?.[1] ?? "未知";
      firstWhiteSource.set(playerId, source);
    });

    const afterView = visibleStateFor(game, actorId);
    memories = observePublicAction(memories, beforeView, chosen, afterView);
    memories = applyKnowledgeEvents(memories, knowledgeEventsFor(before, game, chosen));
    decisions += 1;
  }

  if (game.phase !== "ended") throw new Error(`Game ${run + 1}: exceeded decision limit`);

  const currentScores = game.players.map(projectedScore);
  const alternativeScores = game.players.map((player, playerId) => {
    const breakdown = finalScoreBreakdown(player);
    if (player.goal !== "enby") return breakdown.total;
    const currentWhitePoints = player.whiteEffects > 0 ? 6 : 0;
    const alternativeWhitePoints = ternaryTriggered.has(playerId) ? 6 : 0;
    return breakdown.total - currentWhitePoints + alternativeWhitePoints;
  });
  const currentHigh = Math.max(...currentScores);
  const alternativeHigh = Math.max(...alternativeScores);
  const currentWinners = currentScores.map((score, index) => score === currentHigh ? index : -1).filter((index) => index >= 0);
  const alternativeWinners = alternativeScores.map((score, index) => score === alternativeHigh ? index : -1).filter((index) => index >= 0);

  game.players.forEach((player, playerId) => {
    if (player.goal !== "enby") return;
    enbyAppearances += 1;
    const isNonbinary = player.identity === "nonbinary";
    const hasCurrentWhite = player.whiteEffects > 0;
    const hasTernaryWhite = ternaryTriggered.has(playerId);
    const smallItems = enbyScoringSmallItems(player).length;
    const breakdown = finalScoreBreakdown(player);
    const goalPoints = breakdown.goalItems.reduce((sum, item) => sum + item.points, 0);
    const alternativeGoal = goalPoints - (hasCurrentWhite ? 6 : 0) + (hasTernaryWhite ? 6 : 0);

    finalNonbinary += Number(isNonbinary);
    currentWhite += Number(hasCurrentWhite);
    ternaryWhite += Number(hasTernaryWhite);
    nonbinaryAndCurrentWhite += Number(isNonbinary && hasCurrentWhite);
    nonbinaryAndTernaryWhite += Number(isNonbinary && hasTernaryWhite);
    anySmallItem += Number(smallItems > 0);
    threeSmallItems += Number(smallItems === 3);
    currentPerfect += Number(isNonbinary && hasCurrentWhite && smallItems === 3);
    ternaryPerfect += Number(isNonbinary && hasTernaryWhite && smallItems === 3);
    currentGoalPoints += goalPoints;
    currentTotalPoints += breakdown.total;
    ternaryGoalPoints += alternativeGoal;
    ternaryTotalPoints += alternativeGoal + breakdown.joyPoints;
    if (hasCurrentWhite) whiteSources[firstWhiteSource.get(playerId) ?? "未知"] += 1;
    if (currentWinners.includes(playerId)) {
      currentCoWins += 1;
      currentWinShare += 1 / currentWinners.length;
    }
    if (alternativeWinners.includes(playerId)) {
      ternaryCoWins += 1;
      ternaryWinShare += 1 / alternativeWinners.length;
    }
  });
}

const a = nonbinaryAndCurrentWhite;
const b = finalNonbinary - a;
const c = currentWhite - a;
const d = enbyAppearances - a - b - c;
const phiDenominator = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
const phi = phiDenominator ? (a * d - b * c) / phiDenominator : 0;

console.log(JSON.stringify({
  games: GAMES,
  seed: BASE_SEED,
  enbyAppearances,
  currentRule: {
    finalNonbinaryRate: round(ratio(finalNonbinary, enbyAppearances)),
    whiteConditionRate: round(ratio(currentWhite, enbyAppearances)),
    jointIdentityAndWhiteRate: round(ratio(nonbinaryAndCurrentWhite, enbyAppearances)),
    pWhiteGivenFinalNonbinary: round(ratio(nonbinaryAndCurrentWhite, finalNonbinary)),
    pFinalNonbinaryGivenWhite: round(ratio(nonbinaryAndCurrentWhite, currentWhite)),
    phiIdentityWhite: round(phi),
    anySmallItemRate: round(ratio(anySmallItem, enbyAppearances)),
    threeSmallItemsRate: round(ratio(threeSmallItems, enbyAppearances)),
    perfect16Rate: round(ratio(currentPerfect, enbyAppearances)),
    averageGoalPoints: round(ratio(currentGoalPoints, enbyAppearances)),
    averageTotalPoints: round(ratio(currentTotalPoints, enbyAppearances)),
    splitWinRate: round(ratio(currentWinShare, enbyAppearances)),
    coWinnerRate: round(ratio(currentCoWins, enbyAppearances)),
    whiteSources,
  },
  ternaryOnlyCounterfactual: {
    whiteConditionRate: round(ratio(ternaryWhite, enbyAppearances)),
    jointIdentityAndWhiteRate: round(ratio(nonbinaryAndTernaryWhite, enbyAppearances)),
    pWhiteGivenFinalNonbinary: round(ratio(nonbinaryAndTernaryWhite, finalNonbinary)),
    pFinalNonbinaryGivenWhite: round(ratio(nonbinaryAndTernaryWhite, ternaryWhite)),
    perfect16Rate: round(ratio(ternaryPerfect, enbyAppearances)),
    averageGoalPoints: round(ratio(ternaryGoalPoints, enbyAppearances)),
    averageTotalPoints: round(ratio(ternaryTotalPoints, enbyAppearances)),
    splitWinRate: round(ratio(ternaryWinShare, enbyAppearances)),
    coWinnerRate: round(ratio(ternaryCoWins, enbyAppearances)),
  },
}, null, 2));
