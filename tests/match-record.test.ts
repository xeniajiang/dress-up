import test from "node:test";
import assert from "node:assert/strict";
import { applyLegalAction, createSimGame, enumerateLegalActions } from "../lib/ai-engine";
import { appendMatchEvent, createMatchRecord, finalizeMatchRecord, matchSummary } from "../lib/match-record";
import { MultiplayerRoomCore, createRoomRecord } from "../lib/multiplayer-room";

test("MatchRecord 保存初始状态、真人选择上下文和终局计分", () => {
  const before = createSimGame(["Xenia", "花雨", "晓山", "姬姐"], () => 0.4, {}, "solo", ["human", "ai", "ai", "ai"]);
  before.active = 0;
  before.phase = "draw";
  const record = createMatchRecord({ game: before, mode: "single", identities: [
    { playerId: "player-xenia", displayName: "Xenia" }, { playerId: "ai-1" }, { playerId: "ai-2" }, { playerId: "ai-3" },
  ] });
  const legal = enumerateLegalActions(before);
  const chosen = legal.find((action) => action.type === "draw-market") ?? legal[0];
  const after = applyLegalAction(before, chosen, () => 0.4);
  appendMatchEvent(record, { before, after, action: chosen, legalActions: legal, controller: "human", decisionTimeMs: 1234 });

  assert.equal(record.initialState.phase, "draw");
  assert.equal(record.players[0].playerId, "player-xenia");
  assert.equal(record.events.length, 1);
  assert.equal(record.events[0].choice?.decisionTimeMs, 1234);
  assert.deepEqual(record.events[0].choice?.legalOptions.map((option) => option.id), legal.map((option) => option.id));

  after.phase = "ended";
  finalizeMatchRecord(record, after, Date.parse("2026-09-20T12:00:00Z"));
  assert.equal(record.matchInfo.completed, true);
  assert.equal(record.finalState?.players.length, 4);
  assert.equal(matchSummary(record).players[0].totalScore, record.finalState?.players[0].totalScore);
  assert.equal(matchSummary(record).starred, false);
  record.admin = { starred: true };
  assert.equal(matchSummary(record).starred, true);
});

test("MatchRecord 区分没有合法目标的空出", () => {
  const before = createSimGame(["A", "B", "C", "D"], () => 0.5, {}, "solo", ["human", "ai", "ai", "ai"]);
  before.active = 0;
  before.phase = "play";
  before.players.forEach((player) => { player.presents = []; });
  before.players[0].hand = [{ id: "haircut", name: "理发", kind: "action" }];
  const legal = enumerateLegalActions(before);
  const chosen = legal.find((action) => action.fizzle)!;
  const after = applyLegalAction(before, chosen);
  const record = createMatchRecord({ game: before, mode: "single", identities: before.players.map((player) => ({ playerId: player.name })) });
  appendMatchEvent(record, { before, after, action: chosen, legalActions: legal, controller: "human" });
  assert.equal(record.events[0].disposition, "no_legal_target_fizzle");
});

test("联机 MatchRecord 只生成一份并保留网站玩家 ID", () => {
  const core = new MultiplayerRoomCore(createRoomRecord("ABCDE"));
  core.join("aaaaaaaaaaaaaaaaaaaa", "Xenia", "player-xenia");
  core.join("bbbbbbbbbbbbbbbbbbbb", "Fox", "player-fox");
  core.setReady("aaaaaaaaaaaaaaaaaaaa", true);
  core.setReady("bbbbbbbbbbbbbbbbbbbb", true);
  core.start("aaaaaaaaaaaaaaaaaaaa", () => 0.4, 1000);
  assert.equal(core.record.matchRecord?.matchInfo.mode, "multiplayer");
  assert.deepEqual(core.record.matchRecord?.players.slice(0, 2).map((player) => player.playerId), ["player-xenia", "player-fox"]);
  assert.equal(core.record.matchRecord?.matchInfo.randomSeed, core.record.seed);
});
