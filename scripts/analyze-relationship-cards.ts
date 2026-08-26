import {
  applyLegalAction,
  createSimGame,
  decisionPlayerId,
  enumerateLegalActions,
  knowledgeEventsFor,
  visibleStateFor,
  type SimGame,
} from "../lib/ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  observePublicAction,
} from "../lib/heuristic-ai";

const GAMES = Number.parseInt(process.env.SIM_GAMES ?? "1000", 10);
const BASE_SEED = 20260826;

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function markerSet(game: SimGame) {
  return new Set(game.players.flatMap((giver) => giver.crushTargetIds.map((targetId) => `${giver.id}>${targetId}`)));
}

function sourceJoy(game: SimGame, cardName: string) {
  return game.players.reduce((sum, player) => sum + (player.scoreSources ?? [])
    .filter((source) => source.cardName === cardName)
    .reduce((playerSum, source) => playerSum + source.joy, 0), 0);
}

function newEvents(before: SimGame, after: SimGame) {
  const previousTop = before.events[0];
  const oldIndex = previousTop ? after.events.indexOf(previousTop) : after.events.length;
  return oldIndex >= 0 ? after.events.slice(0, oldIndex) : after.events;
}

type RoundBucket = {
  complimentPlays: number;
  markersCreated: number;
  markerJoy: number;
};

const roundStats = new Map<number, RoundBucket>();
type MarkerRecord = { createdRound: number; joy: number };
type ComplimentRecord = { playedRound: number; immediateJoy: number; marker?: MarkerRecord };
const markerRecords: MarkerRecord[] = [];
const complimentRecords: ComplimentRecord[] = [];
const finalRounds: number[] = [];
let totalDecisions = 0;
let complimentPlays = 0;
let markersCreated = 0;
let markerJoy = 0;
let markerTriggers = 0;
let gamesWithMarkerJoy = 0;
let antiPlays = 0;
let antiEffectivePlays = 0;
let antiRelationshipsRemoved = 0;
let antiPlayersHit = 0;
let antiJoyLost = 0;
let antiGiverJoyLost = 0;
let antiTargetJoyLost = 0;
let shieldPlays = 0;
let shieldTriggeredPlays = 0;
let shieldMarkersRemoved = 0;
let shieldJoyLost = 0;

const originalMathRandom = Math.random;

for (let run = 0; run < GAMES; run += 1) {
  const random = mulberry32(BASE_SEED + run * 7919);
  Math.random = random;
  let game = createSimGame(["花雨", "晓山", "姬姐", "欣娅"], random);
  let memories = createAiMemories(4);
  let decisions = 0;
  let gameMarkerJoy = 0;
  const openMarkers = new Map<string, MarkerRecord>();

  while (game.phase !== "ended" && decisions < 420) {
    const actorId = decisionPlayerId(game);
    const actions = enumerateLegalActions(game);
    if (!actions.length) throw new Error(`Game ${run + 1}: no legal action at round ${game.round}`);

    const before = game;
    const beforeView = visibleStateFor(before, actorId);
    const decision = chooseHeuristicAction(beforeView, actions, memories[actorId], random);
    const markersBefore = markerSet(before);
    const markerJoyBefore = sourceJoy(before, "心动标记");
    const markerJoyBeforeByPlayer = before.players.map((player) => (player.scoreSources ?? [])
      .filter((source) => source.cardName === "心动标记")
      .reduce((sum, source) => sum + source.joy, 0));
    const complimentJoyBefore = sourceJoy(before, "心动夸夸");
    const joysBefore = before.players.map((player) => player.joy);

    game = applyLegalAction(before, decision.chosen);

    const markersAfter = markerSet(game);
    const addedMarkers = [...markersAfter].filter((key) => !markersBefore.has(key));
    const removedMarkers = [...markersBefore].filter((key) => !markersAfter.has(key));
    const markerJoyDelta = sourceJoy(game, "心动标记") - markerJoyBefore;
    const complimentJoyDelta = sourceJoy(game, "心动夸夸") - complimentJoyBefore;
    const events = newEvents(before, game);
    const round = before.round;
    const bucket = roundStats.get(round) ?? { complimentPlays: 0, markersCreated: 0, markerJoy: 0 };

    const complimentPlayDelta = complimentJoyDelta / 2;
    complimentPlays += complimentPlayDelta;
    markersCreated += addedMarkers.length;
    markerJoy += markerJoyDelta;
    markerTriggers += markerJoyDelta;
    gameMarkerJoy += markerJoyDelta;
    bucket.complimentPlays += complimentPlayDelta;
    bucket.markersCreated += addedMarkers.length;
    bucket.markerJoy += markerJoyDelta;
    roundStats.set(round, bucket);

    const addedRecords = new Map<string, MarkerRecord>();
    addedMarkers.forEach((key) => {
      const record = { createdRound: round, joy: 0 };
      markerRecords.push(record);
      openMarkers.set(key, record);
      addedRecords.set(key, record);
    });
    game.players.forEach((player, playerId) => {
      const afterJoy = (player.scoreSources ?? [])
        .filter((source) => source.cardName === "心动标记")
        .reduce((sum, source) => sum + source.joy, 0);
      const delta = afterJoy - markerJoyBeforeByPlayer[playerId];
      if (delta <= 0) return;
      const triggerEvent = events.find((entry) => entry.startsWith(`${player.name} 对拥有其心动标记的 `));
      const target = triggerEvent
        ? game.players.find((candidate) => triggerEvent.includes(`的 ${candidate.name} 使用了`))
        : undefined;
      const key = target ? `${playerId}>${target.id}` : undefined;
      if (key && openMarkers.has(key)) openMarkers.get(key)!.joy += delta;
    });
    if (complimentJoyDelta > 0) {
      complimentRecords.push({
        playedRound: round,
        immediateJoy: complimentJoyDelta,
        marker: addedMarkers.length === 1 ? addedRecords.get(addedMarkers[0]) : undefined,
      });
    }
    removedMarkers.forEach((key) => openMarkers.delete(key));

    if (events.some((entry) => entry.includes("打出【不支持不反对】"))) {
      antiPlays += 1;
      antiRelationshipsRemoved += removedMarkers.length;
      if (removedMarkers.length > 0) antiEffectivePlays += 1;
      const affectedGivers = new Set(removedMarkers.map((key) => Number.parseInt(key.split(">")[0], 10)));
      const affectedTargets = new Set(removedMarkers.map((key) => Number.parseInt(key.split(">")[1], 10)));
      const affected = new Set([...affectedGivers, ...affectedTargets]);
      antiPlayersHit += affected.size;
      antiJoyLost += [...affected].reduce((sum, playerId) => sum + Math.max(0, joysBefore[playerId] - game.players[playerId].joy), 0);
      antiGiverJoyLost += [...affectedGivers].reduce((sum, playerId) => sum + Math.max(0, joysBefore[playerId] - game.players[playerId].joy), 0);
      antiTargetJoyLost += [...affectedTargets].reduce((sum, playerId) => sum + Math.max(0, joysBefore[playerId] - game.players[playerId].joy), 0);
    }

    const shieldWasPlayed = game.players.some((player, playerId) => (
      player.items.filter((item) => item === "封心锁爱").length
      > before.players[playerId].items.filter((item) => item === "封心锁爱").length
    ));
    if (shieldWasPlayed) {
      shieldPlays += 1;
      shieldMarkersRemoved += removedMarkers.length;
      if (removedMarkers.length > 0) shieldTriggeredPlays += 1;
      const giverIds = new Set(removedMarkers.map((key) => Number.parseInt(key.split(">")[0], 10)));
      shieldJoyLost += [...giverIds].reduce((sum, playerId) => sum + Math.max(0, joysBefore[playerId] - game.players[playerId].joy), 0);
    }

    const afterView = visibleStateFor(game, actorId);
    memories = observePublicAction(memories, beforeView, decision.chosen, afterView);
    memories = applyKnowledgeEvents(memories, knowledgeEventsFor(before, game, decision.chosen));
    decisions += 1;
  }

  if (game.phase !== "ended") throw new Error(`Game ${run + 1}: exceeded decision limit`);
  if (gameMarkerJoy > 0) gamesWithMarkerJoy += 1;
  finalRounds.push(game.round);
  totalDecisions += decisions;
}

Math.random = originalMathRandom;

const maxRound = Math.max(...finalRounds, ...roundStats.keys());
let cumulativeMarkerJoy = 0;
const rounds = Array.from({ length: maxRound }, (_, index) => index + 1).map((round) => {
  const bucket = roundStats.get(round) ?? { complimentPlays: 0, markersCreated: 0, markerJoy: 0 };
  cumulativeMarkerJoy += bucket.markerJoy;
  const gamesReached = finalRounds.filter((value) => value >= round).length;
  return {
    round,
    gamesReached,
    complimentPlays: bucket.complimentPlays,
    complimentShare: complimentPlays ? bucket.complimentPlays / complimentPlays : 0,
    complimentPlaysPerActiveGame: gamesReached ? bucket.complimentPlays / gamesReached : 0,
    markersCreated: bucket.markersCreated,
    markerJoy: bucket.markerJoy,
    markerJoyPerGame: bucket.markerJoy / GAMES,
    markerJoyPerActiveGame: gamesReached ? bucket.markerJoy / gamesReached : 0,
    cumulativeMarkerJoyPerGame: cumulativeMarkerJoy / GAMES,
  };
});

const cohortRounds = Array.from({ length: maxRound }, (_, index) => index + 1).map((round) => {
  const records = complimentRecords.filter((record) => record.playedRound === round);
  const created = records.filter((record) => record.marker);
  const immediateJoy = records.reduce((sum, record) => sum + record.immediateJoy, 0);
  const downstreamMarkerJoy = records.reduce((sum, record) => sum + (record.marker?.joy ?? 0), 0);
  return {
    round,
    plays: records.length,
    shareOfComplimentPlays: complimentRecords.length ? records.length / complimentRecords.length : 0,
    markersCreated: created.length,
    immediateJoy,
    downstreamMarkerJoy,
    downstreamJoyPerPlay: records.length ? downstreamMarkerJoy / records.length : null,
    downstreamJoyPerCreatedMarker: created.length ? downstreamMarkerJoy / created.length : null,
    totalJoyPerPlay: records.length ? (immediateJoy + downstreamMarkerJoy) / records.length : null,
  };
});

const weightedMeanRound = (key: "complimentPlays" | "markerJoy") => {
  const total = rounds.reduce((sum, row) => sum + row[key], 0);
  return total ? rounds.reduce((sum, row) => sum + row.round * row[key], 0) / total : null;
};

const report = {
  configuration: { games: GAMES, playersPerGame: 4, seed: BASE_SEED, totalDecisions, averageFinalRound: finalRounds.reduce((a, b) => a + b, 0) / GAMES },
  heartCompliment: {
    plays: complimentPlays,
    playsPerGame: complimentPlays / GAMES,
    markersCreated,
    markersCreatedPerGame: markersCreated / GAMES,
    markerJoy,
    markerJoyPerGame: markerJoy / GAMES,
    markerTriggerCount: markerTriggers,
    joyPerTrigger: markerTriggers ? markerJoy / markerTriggers : null,
    joyPerCreatedMarker: markersCreated ? markerJoy / markersCreated : null,
    totalJoyIncludingImmediate: complimentPlays * 2 + markerJoy,
    totalJoyIncludingImmediatePerGame: (complimentPlays * 2 + markerJoy) / GAMES,
    totalJoyIncludingImmediatePerPlay: complimentPlays ? (complimentPlays * 2 + markerJoy) / complimentPlays : null,
    initiatorImmediateJoy: complimentPlays,
    initiatorGrossJoy: complimentPlays + markerJoy,
    initiatorGrossJoyPerPlay: complimentPlays ? (complimentPlays + markerJoy) / complimentPlays : null,
    initiatorCounterLoss: antiGiverJoyLost + shieldJoyLost,
    initiatorNetJoy: complimentPlays + markerJoy - antiGiverJoyLost - shieldJoyLost,
    initiatorNetJoyPerPlay: complimentPlays ? (complimentPlays + markerJoy - antiGiverJoyLost - shieldJoyLost) / complimentPlays : null,
    gamesWithMarkerJoy,
    gamesWithMarkerJoyRate: gamesWithMarkerJoy / GAMES,
    averageComplimentPlayRound: weightedMeanRound("complimentPlays"),
    averageMarkerJoyRound: weightedMeanRound("markerJoy"),
  },
  complimentCohortsByPlayRound: cohortRounds,
  neutralOpposition: {
    plays: antiPlays,
    playsPerGame: antiPlays / GAMES,
    effectivePlays: antiEffectivePlays,
    effectiveRate: antiPlays ? antiEffectivePlays / antiPlays : null,
    relationshipsRemoved: antiRelationshipsRemoved,
    relationshipsRemovedPerPlay: antiPlays ? antiRelationshipsRemoved / antiPlays : null,
    relationshipsRemovedPerEffectivePlay: antiEffectivePlays ? antiRelationshipsRemoved / antiEffectivePlays : null,
    playersHit: antiPlayersHit,
    joyLost: antiJoyLost,
    giverJoyLost: antiGiverJoyLost,
    targetJoyLost: antiTargetJoyLost,
    joyLostPerPlay: antiPlays ? antiJoyLost / antiPlays : null,
    joyLostPerEffectivePlay: antiEffectivePlays ? antiJoyLost / antiEffectivePlays : null,
  },
  closedHeart: {
    plays: shieldPlays,
    playsPerGame: shieldPlays / GAMES,
    triggeredPlays: shieldTriggeredPlays,
    triggerRate: shieldPlays ? shieldTriggeredPlays / shieldPlays : null,
    markersRemoved: shieldMarkersRemoved,
    markersRemovedPerTriggeredPlay: shieldTriggeredPlays ? shieldMarkersRemoved / shieldTriggeredPlays : null,
    joyLost: shieldJoyLost,
    joyLostPerTriggeredPlay: shieldTriggeredPlays ? shieldJoyLost / shieldTriggeredPlays : null,
  },
  rounds,
};

console.log(JSON.stringify(report, null, 2));
