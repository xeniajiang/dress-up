import assert from "node:assert/strict";
import test from "node:test";
import { decisionPlayerId, enumerateLegalActions, visibleStateFor, type SimCard } from "../lib/ai-engine";
import { MultiplayerRoomCore, createRoomRecord } from "../lib/multiplayer-room";
import { shouldAcceptGameState } from "../lib/multiplayer-protocol";

const TOKENS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function startRoom(humans: number) {
  const core = new MultiplayerRoomCore(createRoomRecord("K7M4Q"));
  for (let index = 0; index < humans; index += 1) {
    assert.equal(core.join(TOKENS[index], `玩家${index + 1}`), index);
    core.setReady(TOKENS[index], true);
  }
  core.start(TOKENS[0], () => 0.42);
  return core;
}

test("2H、3H、4H 分别用 AI 补足四座，且停在真人决策", () => {
  for (const humans of [2, 3, 4]) {
    const core = startRoom(humans);
    assert.equal(core.record.seats.length, 4);
    assert.equal(core.record.seats.filter((seat) => seat.controller === "human").length, humans);
    assert.equal(core.record.seats.filter((seat) => seat.controller === "ai").length, 4 - humans);
    const game = core.record.game!;
    if (game.phase !== "ended") assert.equal(game.players[game.active].controller, "human");
  }
});

test("4H 可仅通过各自 token 提交 actionId 完成整局", () => {
  const core = startRoom(4);
  let steps = 0;
  while (core.record.game?.phase !== "ended" && steps < 500) {
    const game = core.record.game!;
    const decisionId = core.record.pendingPronoun?.targetId ?? decisionPlayerId(game);
    const action = core.gameStateFor(TOKENS[decisionId])!.actions[0];
    assert.ok(action, `step ${steps} 应有合法动作`);
    core.submitAction(TOKENS[decisionId], action.id, () => 0.42);
    steps += 1;
  }
  assert.equal(core.record.game?.phase, "ended");
});

test("房间 payload 不发送他人手牌、隐藏目标或私下查看的顶牌", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  const first = core.gameStateFor(TOKENS[0])!;
  const second = core.gameStateFor(TOKENS[1])!;
  assert.ok(first.view.players[0].goal);
  assert.equal(first.view.players[1].goal, undefined);
  assert.ok(second.view.players[1].goal);
  assert.equal(second.view.players[0].goal, undefined);
  assert.equal("hand" in first.view.players[1], false);
  assert.deepEqual(first.view.selfHand, game.players[0].hand);

  const privateCards: SimCard[] = [{ id: "private-top", name: "美甲", kind: "present", checked: true }];
  game.fittingRoomOffer = { actorId: 0, targetId: 1, stage: "select", revealed: privateCards, selected: [] };
  assert.equal(core.gameStateFor(TOKENS[0])!.view.fittingRoomOffer?.revealed[0]?.name, "美甲");
  assert.deepEqual(core.gameStateFor(TOKENS[1])!.view.fittingRoomOffer?.revealed, []);

  game.beautyOffer = { playerId: 0, revealed: privateCards };
  assert.equal(visibleStateFor(game, 0).beautyOffer?.revealed[0]?.name, "美甲");
  assert.deepEqual(visibleStateFor(game, 1).beautyOffer?.revealed, []);
});

test("爱美之心的立即打出牌不会替换联机玩家原有手牌", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [
    { id: "held-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "held-jirai", name: "地雷系", kind: "action" },
  ];
  game.forcedPlay = {
    playerId: 0,
    source: "爱美之心",
    card: { id: "forced-crush", name: "心动夸夸", kind: "action" },
  };

  const state = core.gameStateFor(TOKENS[0])!;
  assert.deepEqual(state.view.selfHand.map((card) => card.id), ["held-dress", "held-jirai"]);
  assert.equal(state.view.forcedPlay?.card.id, "forced-crush");
  assert.ok(state.actions.length > 0);
  assert.ok(state.actions.every((action) => action.cardId === "forced-crush"));
});

test("连续托管与 AI 出牌会保留完整动画队列", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  game.active = 1;
  game.phase = "play";
  game.players[1].hand = [{ id: "p1-hair", name: "长发", kind: "present", checked: true }];
  game.players[2].hand = [{ id: "p2-nails", name: "美甲", kind: "present", checked: true }];
  game.players[3].hand = [{ id: "p3-lipstick", name: "一支商标模糊的口红", kind: "present", checked: true }];

  core.setSelfControl(TOKENS[1], "ai-self", () => 0.42);

  assert.deepEqual(core.record.playAnimations.map((animation) => animation.actorId), [1, 2, 3]);
  assert.deepEqual(core.gameStateFor(TOKENS[0])!.playAnimations.map((animation) => animation.actorId), [1, 2, 3]);
  assert.deepEqual(
    core.gameStateFor(TOKENS[0])!.liveVisualSegments.flatMap((segment) => segment.commands.map((command) => command.play?.actorId).filter((id): id is number => id !== undefined)),
    [1, 2, 3],
    "连续代理行动必须作为三个独立的真实动画片段发送",
  );
});

test("回看锚点在本人结算后、后续 AI 行动前重置，且自己的出牌不做 AI 揭示", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  game.active = 1;
  game.phase = "play";
  game.players[1].hand = [{ id: "manual-nails", name: "美甲", kind: "present", checked: true }];
  const play = enumerateLegalActions(game).find((action) => action.cardId === "manual-nails" && action.targetId === 1)!;
  core.submitAction(TOKENS[1], play.id, () => 0.42, "manual-play", core.record.stateVersion, 20_000);

  const selfState = core.gameStateFor(TOKENS[1])!;
  const otherState = core.gameStateFor(TOKENS[0])!;
  const selfPlaySegment = selfState.liveVisualSegments.find((segment) => segment.segmentId.includes("manual-nails"))!;
  const otherPlaySegment = otherState.replayBuffer!.segments.find((segment) => segment.segmentId.includes("manual-nails"))!;
  assert.ok((selfState.replayBuffer?.segments.length ?? 0) > 0, "本人操作后连续发生的 AI 行动必须可以回看");
  assert.equal(selfState.replayBuffer?.segments.some((segment) => segment.segmentId.includes("manual-nails")), false, "本人的已完成操作位于新锚点之前");
  assert.ok(selfState.replayBuffer?.segments.some((segment) => segment.commands.some((command) => command.play?.actorId !== undefined)), "新锚点后的 AI 出牌进入回看区间");
  assert.equal(selfPlaySegment.commands[0].play, null, "自己的牌不应伪装成 AI 揭示动画");
  assert.equal(otherPlaySegment.commands[0].play?.card.name, "美甲", "其他观察者保留该动作进入自己的回看区间");
  assert.equal("hand" in otherPlaySegment.before.view.players[1], false, "观察者快照不得包含他人手牌");
  assert.equal(otherPlaySegment.before.view.players[1].goal, undefined, "观察者快照不得包含他人目标");
});

test("真心话知识只进入对应 token 的 payload，刷新 token 恢复原座位", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "truth-private", name: "真心话大冒险", kind: "action" }];
  const play = enumerateLegalActions(game).find((action) => action.cardId === "truth-private" && action.targetId === 1)!;
  core.submitAction(TOKENS[0], play.id, () => 0.42);
  const allow = enumerateLegalActions(core.record.game!).find((action) => action.type === "truth-allow")!;
  core.submitAction(TOKENS[1], allow.id, () => 0.42);

  assert.equal(core.gameStateFor(TOKENS[0])!.knownGoals[1], core.record.game!.players[1].goal);
  assert.equal(core.gameStateFor(TOKENS[1])!.knownGoals[0], undefined);
  assert.ok(core.gameStateFor(TOKENS[0])!.replay?.privateEvents.some((event) => event.type === "PRIVATE_REVEAL"));
  assert.equal(core.gameStateFor(TOKENS[1])!.replay?.privateEvents.length, 0);
  assert.equal(core.join(TOKENS[0], "改名也不能新占座"), 0);
  assert.throws(() => core.submitAction(TOKENS[1], "伪造动作"), /现在不是由你做决定|动作已经失效/);
});

test("玩家主动托管会连续代理决策，取消后座位仍是 Human", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  const token = TOKENS[playerId];
  core.setSelfControl(token, "ai-self", () => 0.42, 10_000);

  const seat = core.record.seats[playerId];
  assert.equal(seat.controller, "human");
  assert.equal(seat.controller === "human" && seat.controlMode, "ai-self");
  assert.ok(core.record.decisionRecords.some((record) => record.playerId === playerId && record.resolvedBy === "ai-self"));

  core.setSelfControl(token, "manual", () => 0.42, 12_000);
  assert.equal(seat.controller === "human" && seat.controlMode, "manual");
  assert.equal(core.record.game!.players[playerId].controller, "human");
});

test("房主 AI 处理当前选择只处理一步，不改变 manual", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  const beforeCount = core.record.decisionRecords.length;
  core.hostResolveOne(TOKENS[0], () => 0.42, 20_000);

  const seat = core.record.seats[playerId];
  assert.equal(seat.controller === "human" && seat.controlMode, "manual");
  assert.equal(core.record.decisionRecords.filter((record) => record.resolvedBy === "ai-host-once").length, 1);
  assert.equal(core.record.decisionRecords.length, beforeCount + 1);
  if (core.record.currentDecision?.playerId === playerId) assert.ok(core.gameStateFor(TOKENS[playerId])!.actions.length > 0);
});

test("房主持续托管与恢复真人不改变座位身份", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  core.hostSetControl(TOKENS[0], playerId, true, () => 0.42, 30_000);
  const seat = core.record.seats[playerId];
  assert.equal(seat.controller === "human" && seat.controlMode, "ai-host");
  assert.equal(core.gameStateFor(TOKENS[playerId])!.actions.length, 0);

  core.hostSetControl(TOKENS[0], playerId, false, () => 0.42, 31_000);
  assert.equal(seat.controller === "human" && seat.controlMode, "manual");
  assert.equal(core.record.game!.players[playerId].controller, "human");
});

test("暂停拒绝 Human action，继续后从原状态恢复", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  const action = core.gameStateFor(TOKENS[playerId])!.actions[0];
  const before = JSON.stringify(core.record.game);
  core.hostSetPaused(TOKENS[0], true, () => 0.42, 40_000);
  assert.throws(() => core.submitAction(TOKENS[playerId], action.id, () => 0.42, "paused-action", core.record.stateVersion, 41_000), /暂停/);
  core.advanceAi(() => 0.42, 42_000);
  assert.equal(JSON.stringify(core.record.game), before);

  core.hostSetPaused(TOKENS[0], false, () => 0.42, 43_000);
  assert.equal(core.record.paused, false);
  assert.ok(core.gameStateFor(TOKENS[playerId])!.actions.length > 0);
});

test("断线不自动托管，原 token 重连仍恢复原座位", () => {
  const core = startRoom(2);
  core.updateConnections(new Set([TOKENS[0]]), 50_000);
  const disconnected = core.record.seats[1];
  assert.equal(disconnected.controller, "human");
  assert.equal(disconnected.controller === "human" && disconnected.controlMode, "manual");
  assert.equal(disconnected.controller === "human" && disconnected.online, false);
  assert.equal(core.join(TOKENS[1], "新名字"), 1);
  core.updateConnections(new Set([TOKENS[0], TOKENS[1]]), 55_000);
  assert.equal(disconnected.controller === "human" && disconnected.online, true);
});

test("requestId 幂等且 stale stateVersion 不能覆盖新状态", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  const state = core.gameStateFor(TOKENS[playerId])!;
  const action = state.actions[0];
  core.submitAction(TOKENS[playerId], action.id, () => 0.42, "same-request", state.stateVersion, 60_000);
  const afterVersion = core.record.stateVersion;
  const afterGame = JSON.stringify(core.record.game);

  core.submitAction(TOKENS[playerId], action.id, () => 0.42, "same-request", state.stateVersion, 61_000);
  assert.equal(core.record.stateVersion, afterVersion);
  assert.equal(JSON.stringify(core.record.game), afterGame);
  assert.throws(() => core.submitAction(TOKENS[playerId], action.id, () => 0.42, "new-request", state.stateVersion, 62_000), /过期|不是由你/);
  assert.equal(shouldAcceptGameState(afterVersion, state.stateVersion), false);
  assert.equal(shouldAcceptGameState(afterVersion, afterVersion + 1), true);
});

test("回放只读取缓存，不改变 SimGame；私密顶牌只发给查看者", () => {
  const core = startRoom(2);
  const game = core.record.game!;
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "fitting", name: "闺蜜试衣间", kind: "action" }];
  game.market = [{ id: "market-present", name: "美甲", kind: "present", checked: true }];
  const play = enumerateLegalActions(game).find((action) => action.cardId === "fitting" && action.targetId === 1)!;
  core.submitAction(TOKENS[0], play.id, () => 0.42, "fitting-play", core.record.stateVersion, 70_000);
  game.deck.unshift({ id: "private-present", name: "长发", kind: "present", checked: true });
  const selectState = core.gameStateFor(TOKENS[0])!;
  const fizzle = selectState.actions.find((action) => action.type === "fitting-room-fizzle")!;
  core.submitAction(TOKENS[0], fizzle.id, () => 0.42, "fitting-fizzle", core.record.stateVersion, 71_000);

  const hash = JSON.stringify(core.record.game);
  const actorReplay = core.gameStateFor(TOKENS[0])!.replay;
  const otherReplay = core.gameStateFor(TOKENS[1])!.replay;
  assert.ok(actorReplay?.privateEvents.some((event) => event.type === "PRIVATE_REVEAL"));
  assert.equal(otherReplay?.privateEvents.length, 0);
  assert.equal(JSON.stringify(core.record.game), hash);
});

test("导出记录包含 hand 同步诊断、decision timing 与完整状态", () => {
  const core = startRoom(2);
  const playerId = decisionPlayerId(core.record.game!);
  const state = core.gameStateFor(TOKENS[playerId])!;
  core.submitAction(TOKENS[playerId], state.actions[0].id, () => 0.42, "diagnostic-action", state.stateVersion, 80_000);
  const exported = core.exportTestRecord(TOKENS[0]);
  const parsed = JSON.parse(exported.json);
  assert.equal(parsed.roomId, "K7M4Q");
  assert.ok(parsed.decisionStats.count >= 1);
  assert.ok(parsed.auditLog.some((event: { diagnostic?: { authoritativeHandCounts?: number[]; visibleHandCounts?: Record<number, number> } }) => event.diagnostic?.authoritativeHandCounts?.length === 4 && event.diagnostic.visibleHandCounts));
  assert.match(exported.txt, /stateVersion/);
});
