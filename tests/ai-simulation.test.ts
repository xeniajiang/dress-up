import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLegalAction,
  compareFinalStanding,
  createSimGame,
  decisionPlayerId,
  enbyScoringSmallItems,
  enumerateLegalActions,
  finalScoreBreakdown,
  goalScore,
  knowledgeEventsFor,
  projectedScore,
  simCardChecked,
  simCardQualifiesAsSkirtOrLipstick,
  simChecks,
  simEffectChecks,
  simShopOwnerJoy,
  simSide,
  sharesFinalStanding,
  visibleStateFor,
} from "../lib/ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  goalCompletion,
  observePublicAction,
} from "../lib/heuristic-ai";

test("heuristic AI completes 40 games without illegal states or loops", () => {
  for (let run = 0; run < 40; run += 1) {
    let game = createSimGame(["A", "B", "C", "D"]);
    let memories = createAiMemories(4);
    let steps = 0;
    while (game.phase !== "ended" && steps < 260) {
      const actorId = decisionPlayerId(game);
      const actions = enumerateLegalActions(game);
      assert.ok(actions.length > 0, `run ${run}: no legal action at step ${steps}`);
      const beforeView = visibleStateFor(game, actorId);
      const decision = chooseHeuristicAction(beforeView, actions, memories[actorId]);
      const before = game;
      game = applyLegalAction(game, decision.chosen);
      const afterView = visibleStateFor(game, actorId);
      memories = observePublicAction(memories, beforeView, decision.chosen, afterView);
      memories = applyKnowledgeEvents(memories, knowledgeEventsFor(before, game, decision.chosen));
      game.players.forEach((player) => {
        assert.ok(player.joy >= 0, `run ${run}: negative Joy`);
        assert.equal(new Set(player.presents.map((card) => card.name)).size, player.presents.length, `run ${run}: duplicate presentation`);
      });
      steps += 1;
    }
    assert.equal(game.phase, "ended", `run ${run}: did not finish after ${steps} decisions`);
    assert.ok(game.players.every((player) => player.turns === game.players[0].turns), `run ${run}: unequal turn count at end`);
    assert.ok(!game.warnings.some((warning) => warning.includes("拒绝非法动作")), `run ${run}: engine rejected an AI action`);
  }
});

test("human pronoun response can accept binary identity or pay to stay nonbinary", () => {
  const base = createSimGame(["Human", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].identity = "nonbinary";
  base.players[0].reading = "male";
  base.players[0].joy = 2;
  base.players[0].hand = [{ id: "she-test", name: "她", kind: "action" }, ...base.players[0].hand.slice(0, 2)];
  const action = enumerateLegalActions(base).find((candidate) => candidate.cardId === "she-test" && candidate.targetId === 0)!;

  const accepted = applyLegalAction(base, { ...action, pronounResponse: "accept-binary" });
  assert.equal(accepted.players[0].identity, "female");
  assert.equal(accepted.players[0].joy, 2);

  const stayed = applyLegalAction(base, { ...action, pronounResponse: "pay-nonbinary" });
  assert.equal(stayed.players[0].identity, "nonbinary");
  assert.equal(stayed.players[0].reading, "female");
  assert.equal(stayed.players[0].joy, 1);
  assert.equal(stayed.players[0].joyLossVersion, 1);
  assert.equal(stayed.players[0].lastJoyLoss, 1);
});

test("心动夸夸只标记其他玩家、移动旧标记，并在后续对心动对象出牌时奖励 Joy", () => {
  let game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "crush-first", name: "心动夸夸", kind: "action" }];
  const firstActions = enumerateLegalActions(game).filter((action) => action.cardId === "crush-first");
  assert.equal(firstActions.some((action) => action.targetId === 0), false, "不能对自己使用心动夸夸");
  game = applyLegalAction(game, firstActions.find((action) => action.targetId === 1)!);
  assert.equal(game.players[0].crushTargetId, 1);
  assert.equal(game.players[0].joy, 2, "心动夸夸本身不让出牌者获得连锁 Joy");
  assert.equal(game.players[1].joy, 3);
  assert.deepEqual(game.players[1].scoreSources, [{ cardName: "心动夸夸", joy: 1 }]);

  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "crush-follow-up", name: "她", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "crush-follow-up" && action.targetId === 1)!);
  assert.equal(game.players[0].joy, 3);
  assert.deepEqual(game.players[0].scoreSources, [{ cardName: "心动标记", joy: 1 }]);

  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "crush-move", name: "心动夸夸", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "crush-move" && action.targetId === 2)!);
  assert.equal(game.players[0].crushTargetId, 2, "新标记覆盖同一出牌者此前的标记");
  assert.equal(game.players[0].joy, 3, "移动标记本身不触发连锁 Joy");

  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "old-crush-target", name: "他", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "old-crush-target" && action.targetId === 1)!);
  assert.equal(game.players[0].joy, 3, "旧心动对象不再触发奖励");

  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "new-crush-target", name: "她", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "new-crush-target" && action.targetId === 2)!);
  assert.equal(game.players[0].joy, 4);
  assert.deepEqual(game.players[0].scoreSources, [{ cardName: "心动标记", joy: 2 }]);
});

test("AI 会优先利用已经建立的心动标记获得额外 Joy", () => {
  const game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].crushTargetId = 1;
  game.players[0].hand = [{ id: "use-crush", name: "她", kind: "action" }];
  const decision = chooseHeuristicAction(visibleStateFor(game, 0), enumerateLegalActions(game), createAiMemories(4)[0], () => 0.5);
  const marked = decision.candidates.find((candidate) => candidate.action.cardId === "use-crush" && candidate.action.targetId === 1)!;
  const unmarked = decision.candidates.find((candidate) => candidate.action.cardId === "use-crush" && candidate.action.targetId === 2)!;
  assert.ok(marked.selfValue > unmarked.selfValue + 1, "心动标记的确定性 +1 Joy 应进入出牌估值");
});

test("封心锁爱清除已有心动标记、反噬每名发起者并持续免疫心动夸夸", () => {
  let game = createSimGame(["封心者", "发起者甲", "发起者乙", "旁观者"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "closed-heart", name: "封心锁爱", kind: "action" }];
  game.players[1].crushTargetId = 0;
  game.players[1].joy = 3;
  game.players[2].crushTargetId = 0;
  game.players[2].joy = 1;
  game.players[3].crushTargetId = 2;

  const closeHeart = enumerateLegalActions(game).find((action) => action.cardId === "closed-heart")!;
  game = applyLegalAction(game, closeHeart);
  assert.ok(game.players[0].items.includes("封心锁爱"));
  assert.equal(game.players[1].crushTargetId, null);
  assert.equal(game.players[2].crushTargetId, null);
  assert.equal(game.players[3].crushTargetId, 2, "与封心者无关的心动标记不受影响");
  assert.equal(game.players[1].joy, 1);
  assert.equal(game.players[2].joy, 0, "Joy 不足 2 时只失去现有 Joy");
  assert.ok(!game.discard.some((card) => card.id === "closed-heart"), "封心锁爱应持续留场");

  game.active = 1;
  game.phase = "play";
  game.players[1].hand = [{ id: "blocked-crush", name: "心动夸夸", kind: "action" }];
  const crushTargets = enumerateLegalActions(game).filter((action) => action.cardId === "blocked-crush");
  assert.equal(crushTargets.some((action) => action.targetId === 0), false);
  assert.ok(crushTargets.some((action) => action.targetId === 2));
});

test("地雷系留场，并让每名对持有者使用牌的其他玩家失去 1 Joy", () => {
  let game = createSimGame(["地雷系玩家", "出牌者", "旁观者甲", "旁观者乙"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "jirai-status", name: "地雷系", kind: "action" }];

  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "jirai-status")!);
  assert.ok(game.players[0].items.includes("地雷系"));
  assert.ok(!game.discard.some((card) => card.id === "jirai-status"), "地雷系应持续留场");

  game.active = 1;
  game.phase = "play";
  game.players[1].joy = 2;
  game.players[1].hand = [{ id: "jirai-targeted-present", name: "美甲", kind: "present", checked: true }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "jirai-targeted-present" && action.targetId === 0)!);
  assert.equal(game.players[1].joy, 1, "别人对地雷系持有者使用牌后失去 1 Joy");

  game.active = 0;
  game.phase = "play";
  game.players[0].joy = 2;
  game.players[0].hand = [{ id: "jirai-self-present", name: "长发", kind: "present", checked: true }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "jirai-self-present" && action.targetId === 0)!);
  assert.equal(game.players[0].joy, 2, "对自己使用牌不触发自己的地雷系");
});

test("地雷系会结算美妆博主的立即呈现，AI 也会识别其 Joy 代价", () => {
  let game = createSimGame(["地雷系玩家", "美妆博主", "普通目标", "旁观者"]);
  game.active = 1;
  game.phase = "play";
  game.players[0].items = ["地雷系"];
  game.players[1].joy = 2;
  game.beautyOffer = { playerId: 1, revealed: [{ id: "beauty-jirai-present", name: "美甲", kind: "present", checked: true }] };
  const beautyTarget = enumerateLegalActions(game).find((action) => action.type === "beauty-blogger-play" && action.targetId === 0)!;
  game = applyLegalAction(game, beautyTarget);
  assert.equal(game.players[1].joy, 1, "立即打出的呈现也属于对目标使用一张牌");

  const aiGame = createSimGame(["AI", "地雷目标", "普通目标", "旁观者"]);
  aiGame.active = 0;
  aiGame.phase = "play";
  aiGame.players[0].hand = [{ id: "jirai-ai-present", name: "长发", kind: "present", checked: true }];
  aiGame.players[1].items = ["地雷系"];
  const decision = chooseHeuristicAction(visibleStateFor(aiGame, 0), enumerateLegalActions(aiGame), createAiMemories(4)[0], () => 0.5);
  const costly = decision.candidates.find((candidate) => candidate.action.cardId === "jirai-ai-present" && candidate.action.targetId === 1)!;
  const ordinary = decision.candidates.find((candidate) => candidate.action.cardId === "jirai-ai-present" && candidate.action.targetId === 2)!;
  assert.ok(costly.selfValue < ordinary.selfValue - 1, "AI 应把触发地雷系的 1 Joy 损失计入估值");
});

test("enby 小件终局每件两分，重复吉他和互斥衣物不重复计分，至多六分", () => {
  const game = createSimGame(["Enby", "B", "C", "D"]);
  const player = game.players[0];
  player.goal = "enby";
  player.identity = "nonbinary";
  player.whiteEffects = 2;
  player.presents = [
    { id: "hoodie", name: "亲戚给的宽大卫衣", kind: "present" },
    { id: "skirt-pants", name: "亚文化裙裤", kind: "present", checked: true, dress: true },
  ];
  player.items = ["吉他", "小证"];
  assert.equal(goalScore(player), 16);
  assert.equal(finalScoreBreakdown(player).goalItems.find((item) => item.key === "white")?.points, 6);
  assert.equal(finalScoreBreakdown(player).goalItems.find((item) => item.key === "small-items")?.points, 6);
  player.items.push("吉他");
  assert.equal(goalScore(player), 16);
  assert.equal(finalScoreBreakdown(player).goalItems.find((item) => item.key === "small-items")?.points, 6);
});

test("updated goal thresholds score exactly at their new breakpoints", () => {
  const game = createSimGame(["A", "B", "C", "D"]);
  const player = game.players[0];
  const checked = (id: string, name = `呈现-${id}`) => ({ id, name, kind: "present" as const, checked: true });

  player.goal = "男娘";
  player.identity = "male";
  player.presents = [checked("plain-1"), checked("plain-2"), checked("plain-3")];
  assert.equal(goalScore(player), 4);
  player.presents = [{ ...checked("1", "商场专柜里的裙子"), dress: true }, checked("2"), checked("3")];
  assert.equal(goalScore(player), 12);
  assert.equal(projectedScore(player), 14, "男娘三检定档终局获得 8 分，另加身份 4 分与初始 2 Joy");
  player.presents.push(checked("4"));
  assert.equal(goalScore(player), 14, "男娘四检定档改为 10 分，另加身份 4 分");

  player.goal = "demi-girl";
  player.identity = "female";
  player.items = ["小证"];
  player.presents = [checked("1", "一支商标模糊的口红")];
  assert.equal(goalScore(player), 6);
  player.presents.push(checked("2"));
  assert.equal(goalScore(player), 14);
  assert.equal(projectedScore(player), 16, "demi-girl 小证终局只贡献 2 分");

  player.goal = "enby";
  player.identity = "male";
  player.items = [];
  player.presents = [];
  player.whiteEffects = 1;
  assert.equal(goalScore(player), 6);
  player.whiteEffects = 2;
  assert.equal(goalScore(player), 6);
});

test("AI 与终局计分只把裙装或口红视为对应目标条件", () => {
  const game = createSimGame(["A", "B", "C", "D"]);
  const player = game.players[0];
  player.goal = "跨女";
  player.identity = "female";
  player.presents = [
    { id: "nails", name: "美甲", kind: "present", checked: true },
    { id: "hair", name: "长发", kind: "present", checked: true },
    { id: "plain", name: "普通检定", kind: "present", checked: true },
  ];

  assert.equal(simCardQualifiesAsSkirtOrLipstick(player.presents[0]), false, "美甲不能满足裙装/口红条件");
  const withoutRequirement = goalCompletion(visibleStateFor(game, 0).players[0], "跨女");
  assert.equal(goalScore(player), 4, "三个检定但没有裙装或口红时，只获得身份基础分");

  player.presents[0] = { id: "lipstick", name: "一支商标模糊的口红", kind: "present", checked: true };
  assert.equal(simCardQualifiesAsSkirtOrLipstick(player.presents[0]), true);
  const withRequirement = goalCompletion(visibleStateFor(game, 0).players[0], "跨女");
  assert.equal(withRequirement - withoutRequirement, 1.1, "AI 只在真正拥有裙装或口红后计入该条件");
  assert.equal(goalScore(player), 12);
});

test("终局总分为目标分加全部剩余 Joy", () => {
  const game = createSimGame(["A", "B", "C", "D"]);
  const player = game.players[0];
  player.goal = "文艺男";
  player.identity = "male";
  player.joy = 5;
  player.presents = [{ id: "score-hair", name: "长发", kind: "present", checked: true }];
  player.items = ["吉他"];
  assert.equal(goalScore(player), 15);
  assert.equal(projectedScore(player), 20);
});

test("终局同分先以 Joy 破平，Joy 仍相同则并列", () => {
  const game = createSimGame(["A", "B", "C", "D"]);
  const [identityScorePlayer, joyTiebreakPlayer, tiedPlayer] = game.players;

  identityScorePlayer.goal = "跨女";
  identityScorePlayer.identity = "female";
  identityScorePlayer.joy = 2;

  joyTiebreakPlayer.goal = "文艺男";
  joyTiebreakPlayer.identity = "male";
  joyTiebreakPlayer.joy = 3;

  tiedPlayer.goal = "文艺男";
  tiedPlayer.identity = "male";
  tiedPlayer.joy = 3;

  assert.equal(projectedScore(identityScorePlayer), 6);
  assert.equal(projectedScore(joyTiebreakPlayer), 6);
  assert.ok(compareFinalStanding(joyTiebreakPlayer, identityScorePlayer) < 0, "同为 6 分时，3 Joy 应排在 2 Joy 前");
  assert.equal(sharesFinalStanding(identityScorePlayer, joyTiebreakPlayer), false);
  assert.equal(sharesFinalStanding(joyTiebreakPlayer, tiedPlayer), true, "总分和 Joy 都相同应并列");
});

test("小证放行不消耗能力，截获时弃一张手牌并把她换入手牌", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 1;
  base.phase = "draw";
  base.players[0].items = ["小证"];
  base.players[0].certificateReady = true;
  base.players[0].hand = [
    { id: "certificate-swap-a", name: "程序员", kind: "action" },
    { id: "certificate-swap-b", name: "美甲", kind: "present", checked: true },
  ];
  base.deck = [{ id: "she-offer", name: "她", kind: "action" }];

  const draw = enumerateLegalActions(base).find((action) => action.type === "draw-market")!;
  const offered = applyLegalAction(base, draw);
  assert.equal(offered.certificateOffer?.playerId, 0);
  assert.deepEqual(offered.players[0].items, ["小证"]);
  assert.equal(offered.players[0].certificateReady, true, "出现【她】时尚未消耗截获能力");
  assert.equal(decisionPlayerId(offered), 0);

  const pass = enumerateLegalActions(offered).find((action) => action.type === "certificate-pass")!;
  const passed = applyLegalAction(offered, pass);
  assert.equal(passed.certificateOffer, null);
  assert.ok(passed.market.some((card) => card.id === "she-offer"));
  assert.deepEqual(passed.players[0].items, ["小证"]);
  assert.equal(passed.players[0].certificateReady, true, "放行后继续保留截获能力");

  const claim = enumerateLegalActions(offered).find((action) => action.type === "certificate-claim" && action.cardId === "certificate-swap-a")!;
  const claimed = applyLegalAction(offered, claim);
  assert.equal(claimed.certificateOffer, null);
  assert.equal(claimed.players[0].identity, "male", "截获只把【她】加入手牌，不立即改变身份");
  assert.ok(claimed.players[0].hand.some((card) => card.id === "she-offer"));
  assert.ok(!claimed.players[0].hand.some((card) => card.id === "certificate-swap-a"));
  assert.ok(claimed.discard.some((card) => card.id === "certificate-swap-a"));
  assert.equal(claimed.players[0].certificateReady, false, "真正取得【她】后才消耗截获能力");
  assert.deepEqual(claimed.players[0].items, ["小证"]);

  const emptyHand = structuredClone(offered);
  emptyHand.players[0].hand = [];
  assert.deepEqual(enumerateLegalActions(emptyHand).map((action) => action.type), ["certificate-pass"], "没有手牌时只能放行");
});

test("场地持续至打出者的下回合结束", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "venue-test", name: "全女空间！", kind: "venue" }];

  const venueAction = enumerateLegalActions(base).find((action) => action.cardId === "venue-test")!;
  let game = applyLegalAction(base, venueAction);
  assert.equal(game.venue?.ownerId, 0);
  assert.equal(game.venue?.expiresAfterOwnerTurn, 2);

  const finishCurrentTurn = () => {
    const actor = game.players[game.active];
    game.phase = "play";
    actor.hand = [{ id: `pass-${actor.id}-${actor.turns}`, name: "程序员", kind: "action" }];
    const action = enumerateLegalActions(game).find((candidate) => candidate.cardId === actor.hand[0].id)!;
    game = applyLegalAction(game, action);
  };

  finishCurrentTurn();
  finishCurrentTurn();
  finishCurrentTurn();
  assert.equal(game.active, 0);
  assert.equal(game.venue?.card.name, "全女空间！", "场地应覆盖打出者的整个下回合");
  finishCurrentTurn();
  assert.equal(game.venue, null);
  assert.ok(game.discard.some((card) => card.id === "venue-test"));
});

test("爱美之心获得公共行动牌后立即选择目标并执行", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.deck = [];
  base.players[0].joy = 2;
  base.players[0].hand = [{ id: "love-beauty", name: "爱美之心", kind: "action" }];
  base.market = [
    { id: "claimed-praise", name: "心动夸夸", kind: "action" },
    { id: "market-a", name: "美甲", kind: "present", checked: true },
    { id: "market-b", name: "亲戚给的宽大卫衣", kind: "present" },
  ];

  const claimAction = enumerateLegalActions(base).find((action) => action.cardId === "love-beauty" && action.marketCardId === "claimed-praise")!;
  const claimed = applyLegalAction(base, claimAction);
  assert.equal(claimed.active, 0, "立即打出的牌结算前不能结束回合");
  assert.equal(claimed.forcedPlay?.card.id, "claimed-praise");
  assert.ok(!claimed.players[0].hand.some((card) => card.id === "claimed-praise"), "获得的牌不进入手牌");

  const praiseOther = enumerateLegalActions(claimed).find((action) => action.cardId === "claimed-praise" && action.targetId === 1)!;
  const resolved = applyLegalAction(claimed, praiseOther);
  assert.equal(resolved.players[0].joy, 2);
  assert.equal(resolved.players[1].joy, 3);
  assert.equal(resolved.players[0].crushTargetId, 1);
  assert.equal(resolved.forcedPlay, null);
  assert.equal(resolved.active, 1);
  assert.ok(resolved.discard.some((card) => card.id === "claimed-praise"));
  assert.ok(resolved.discard.some((card) => card.id === "love-beauty"));
});

test("新增呈现保留一轮的新牌标记", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.turnSerial = 0;
  base.players[0].hand = [{ id: "fresh-present", name: "美甲", kind: "present", checked: true }];

  const playPresent = enumerateLegalActions(base).find((action) => action.cardId === "fresh-present" && action.targetId === 0)!;
  let game = applyLegalAction(base, playPresent);
  const gained = game.players[0].presents.find((card) => card.id === "fresh-present")!;
  assert.equal(gained.freshUntilTurnSerial, 4);
  assert.equal(game.turnSerial, 1);

  for (let index = 0; index < 3; index += 1) {
    const actor = game.players[game.active];
    game.phase = "play";
    actor.hand = [{ id: `fresh-pass-${index}`, name: "程序员", kind: "action" }];
    const pass = enumerateLegalActions(game).find((action) => action.cardId === `fresh-pass-${index}`)!;
    game = applyLegalAction(game, pass);
  }
  assert.equal(game.turnSerial, gained.freshUntilTurnSerial, "完整一轮后新牌底色应结束");
});

test("裙装与裙裤互相覆盖且保留离场动画状态", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].presents = [{ id: "old-dress", name: "家里翻到的古老碎花裙", kind: "present", checked: true, dress: true }];
  base.players[0].hand = [{ id: "new-dress", name: "亚文化裙裤", kind: "present", checked: true, dress: true }];

  const replace = enumerateLegalActions(base).find((action) => action.cardId === "new-dress" && action.targetId === 0)!;
  const game = applyLegalAction(base, replace);
  const dresses = game.players[0].presents.filter((card) => card.dress);
  assert.deepEqual(dresses.map((card) => card.id), ["new-dress"]);
  assert.ok(game.discard.some((card) => card.id === "old-dress"));
  assert.ok(game.players[0].removedPresents.some((entry) => entry.card.id === "old-dress"));
});

test("enby 被覆盖的亚文化裙裤立即停止计分，离场动画不参与终局分", () => {
  const base = createSimGame(["Enby", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].goal = "enby";
  base.players[0].identity = "male";
  base.players[0].joy = 0;
  base.players[0].presents = [
    { id: "scoring-culottes", name: "亚文化裙裤", kind: "present", checked: true, dress: true, clothing: true },
  ];
  base.players[0].hand = [
    { id: "covering-shirt", name: "皱巴巴的格子衬衫", kind: "present", clothing: true },
  ];
  assert.deepEqual(enbyScoringSmallItems(base.players[0]), ["亚文化裙裤"]);
  assert.equal(projectedScore(base.players[0]), 2);

  const cover = enumerateLegalActions(base).find((action) => action.cardId === "covering-shirt" && action.targetId === 0)!;
  const covered = applyLegalAction(base, cover);
  assert.deepEqual(enbyScoringSmallItems(covered.players[0]), []);
  assert.equal(projectedScore(covered.players[0]), 0);
  assert.ok(covered.players[0].removedPresents.some((entry) => entry.card.id === "scoring-culottes"), "离场牌只保留动画状态");
});

test("单张牌没有合理目标时可直接空出", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players.forEach((player) => { player.presents = []; });
  base.players[0].hand = [
    { id: "no-haircut-target", name: "理发", kind: "action" },
    { id: "still-playable", name: "她", kind: "action" },
  ];

  const actions = enumerateLegalActions(base);
  const fizzle = actions.find((action) => action.cardId === "no-haircut-target" && action.id.endsWith(":fizzle"));
  assert.ok(fizzle, "即使另一张手牌可用，无目标的【理发】也应能单独空出");
  assert.ok(actions.some((action) => action.cardId === "still-playable" && action.targetId === 0));

  const game = applyLegalAction(base, fizzle!);
  assert.ok(game.discard.some((card) => card.id === "no-haircut-target"));
  assert.ok(!game.warnings.some((warning) => warning.includes("手牌全部无合法目标")));
});

test("扑朔迷离与先入为主持续留场、按当前身份修改检定并仅在长期身份改变时移除", () => {
  const blueBase = createSimGame(["A", "B", "C", "D"]);
  blueBase.active = 0;
  blueBase.phase = "play";
  blueBase.players[0].identity = "male";
  blueBase.players[0].presents = [
    { id: "checked-a", name: "美甲", kind: "present", checked: true },
    { id: "checked-b", name: "长发", kind: "present", checked: true },
  ];
  blueBase.players[0].hand = [{ id: "hard-to-tell-blue", name: "扑朔迷离", kind: "action" }];

  const blueActions = enumerateLegalActions(blueBase).filter((action) => action.cardId === "hard-to-tell-blue");
  assert.equal(blueActions.length, 1);
  assert.equal(blueActions[0].presentId, undefined, "蓝栏不应要求玩家选择呈现");
  let game = applyLegalAction(blueBase, blueActions[0]);
  assert.equal(simChecks(game.players[0]), 2, "真实呈现与终局计分不得被改写");
  assert.equal(simEffectChecks(game.players[0]), 3, "扑朔迷离蓝栏让牌效多读取一个检定");
  assert.equal(game.players[0].ambiguityCard?.id, "hard-to-tell-blue");

  game.phase = "play";
  game.players[1].hand = [{ id: "dress-code-after-ambiguity", name: "职场 Dress Code", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "dress-code-after-ambiguity")!);
  assert.equal(decisionPlayerId(game), 0, "蓝栏扑朔迷离应让持有者选择保留哪张检定呈现");
  const preserveHair = enumerateLegalActions(game).find((action) => action.type === "dress-code-preserve" && action.presentId === "checked-b")!;
  game = applyLegalAction(game, preserveHair);
  assert.deepEqual(game.players[0].presents.map((present) => present.id), ["checked-b"], "Dress Code 蓝栏不计算检定数，并允许扑朔迷离保留一张");
  assert.ok(game.players[0].ambiguityCard, "身份未变时状态应跨轮持续");

  game.phase = "play";
  game.players[2].hand = [{ id: "identity-change", name: "她", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "identity-change" && action.targetId === 0)!);
  assert.equal(game.players[0].ambiguityCard, null, "长期身份改变后必须立即移除");
  assert.ok(game.discard.some((card) => card.id === "hard-to-tell-blue"));

  const pinkBase = createSimGame(["A", "B", "C", "D"]);
  pinkBase.active = 0;
  pinkBase.phase = "play";
  pinkBase.players[0].identity = "female";
  pinkBase.players[0].presents = [{ id: "unchecked", name: "亲戚给的宽大卫衣", kind: "present" }];
  pinkBase.players[0].hand = [{ id: "hard-to-tell-pink", name: "扑朔迷离", kind: "action" }];
  const pinkAction = enumerateLegalActions(pinkBase).find((action) => action.cardId === "hard-to-tell-pink")!;
  const pinkGame = applyLegalAction(pinkBase, pinkAction);
  assert.equal(simCardChecked(pinkGame.players[0].presents[0]), false, "粉栏同样不得修改真实勾选");
  assert.equal(simEffectChecks(pinkGame.players[0]), 0, "扑朔迷离粉栏让牌效少读取一个检定，最低为零");

  let temporary = createSimGame(["Holder", "Actor", "C", "D"]);
  temporary.active = 1;
  temporary.phase = "play";
  temporary.players[0].identity = "male";
  temporary.players[0].presents = [
    { id: "temp-a", name: "长发", kind: "present", checked: true },
    { id: "temp-b", name: "美甲", kind: "present", checked: true },
    { id: "temp-c", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  temporary.players[0].ambiguityCard = { id: "temp-ambiguity", name: "扑朔迷离", kind: "action" };
  temporary.players[1].hand = [{ id: "temporary-pass", name: "你pass吗？", kind: "action" }];
  temporary = applyLegalAction(temporary, enumerateLegalActions(temporary).find((action) => action.cardId === "temporary-pass" && action.targetId === 0)!);
  assert.equal(temporary.players[0].tempIdentity, "female");
  assert.equal(temporary.players[0].ambiguityCard?.id, "temp-ambiguity", "临时身份产生时不得移除持续三切标记");
  assert.equal(simEffectChecks(temporary.players[0]), 2, "临时女性身份应把扑朔迷离切换为粉栏 −1");
  temporary.active = 0;
  temporary.phase = "play";
  temporary.players[0].hand = [{ id: "temporary-expiry", name: "程序员", kind: "action" }];
  temporary = applyLegalAction(temporary, enumerateLegalActions(temporary).find((action) => action.cardId === "temporary-expiry")!);
  assert.equal(temporary.players[0].tempIdentity, null);
  assert.equal(temporary.players[0].ambiguityCard?.id, "temp-ambiguity", "临时身份到期时不得移除持续三切标记");
  assert.equal(simEffectChecks(temporary.players[0]), 4, "临时身份结束后应重新按长期男性身份使用蓝栏 +1");

  const primacyBlue = createSimGame(["A", "B", "C", "D"]);
  primacyBlue.active = 0;
  primacyBlue.phase = "play";
  primacyBlue.players[0].identity = "male";
  primacyBlue.players[0].presents = [{ id: "primacy-check", name: "美甲", kind: "present", checked: true }];
  primacyBlue.players[0].hand = [{ id: "primacy-blue", name: "先入为主", kind: "action" }];
  const primacyBlueGame = applyLegalAction(primacyBlue, enumerateLegalActions(primacyBlue).find((action) => action.cardId === "primacy-blue")!);
  assert.equal(simEffectChecks(primacyBlueGame.players[0]), 0, "先入为主蓝栏让检定数 −1");

  const primacyPink = createSimGame(["A", "B", "C", "D"]);
  primacyPink.active = 0;
  primacyPink.phase = "play";
  primacyPink.players[0].identity = "female";
  primacyPink.players[0].hand = [{ id: "primacy-pink", name: "先入为主", kind: "action" }];
  const primacyPinkGame = applyLegalAction(primacyPink, enumerateLegalActions(primacyPink).find((action) => action.cardId === "primacy-pink")!);
  assert.equal(simEffectChecks(primacyPinkGame.players[0]), 1, "先入为主粉栏让检定数 +1");

  const whiteBase = createSimGame(["A", "B", "C", "D"]);
  whiteBase.active = 0;
  whiteBase.phase = "play";
  whiteBase.players[0].identity = "nonbinary";
  whiteBase.players[0].presents = [{ id: "white-present", name: "美甲", kind: "present", checked: true }];
  whiteBase.players[0].hand = [{ id: "hard-to-tell-white", name: "扑朔迷离", kind: "action" }];
  const whiteAction = enumerateLegalActions(whiteBase).find((action) => action.cardId === "hard-to-tell-white")!;
  let whiteGame = applyLegalAction(whiteBase, whiteAction);
  assert.equal(whiteGame.players[0].whiteEffects, 0, "仅打出具有三切牌效的行动牌不能算触发白色牌效");
  assert.equal(whiteGame.players[0].ambiguityCard?.id, "hard-to-tell-white");
  assert.equal(whiteGame.players[0].presents[0].checkOverride, undefined);
  whiteGame.active = 1;
  whiteGame.phase = "play";
  whiteGame.players[1].hand = [{ id: "white-check-trigger", name: "老男人看了你一眼", kind: "action" }];
  const triggerCheck = enumerateLegalActions(whiteGame).find((action) => action.cardId === "white-check-trigger" && action.targetId === 0)!;
  whiteGame = applyLegalAction(whiteGame, triggerCheck);
  whiteGame = applyLegalAction(whiteGame, enumerateLegalActions(whiteGame).find((action) => action.type === "reading-keep")!);
  assert.equal(whiteGame.players[0].whiteEffects, 0, "读取判断本身不是白色检定修正");
  whiteGame = applyLegalAction(whiteGame, enumerateLegalActions(whiteGame).find((action) => action.type === "check-count-select")!);
  assert.equal(whiteGame.players[0].whiteEffects, 1, "实际选择 ±1 后才记录首次白色牌效");
});

test("职场 Dress Code 蓝栏只让扑朔迷离保留一张，粉栏才检查修正后的检定数", () => {
  const checked = (id: string) => ({ id, name: id, kind: "present" as const, checked: true });
  let blue = createSimGame(["Actor", "Puzzling", "Primacy", "Pink"]);
  blue.active = 0;
  blue.phase = "play";
  blue.players[0].items = ["自由职业者"];
  blue.players[0].hand = [{ id: "dress-code-blue-rules", name: "职场 Dress Code", kind: "action" }];
  blue.players[1].identity = "male";
  blue.players[1].presents = [checked("puzzling-a"), checked("puzzling-b")];
  blue.players[1].ambiguityCard = { id: "puzzling-mark", name: "扑朔迷离", kind: "action" };
  blue.players[2].identity = "male";
  blue.players[2].presents = [checked("primacy-a"), checked("primacy-b")];
  blue.players[2].ambiguityCard = { id: "primacy-mark", name: "先入为主", kind: "action" };
  blue.players[3].identity = "female";
  blue.players[3].presents = [checked("pink-one")];
  blue.players[3].ambiguityCard = { id: "pink-primacy", name: "先入为主", kind: "action" };
  const pinkJoyBefore = blue.players[3].joy;
  blue = applyLegalAction(blue, enumerateLegalActions(blue).find((action) => action.cardId === "dress-code-blue-rules")!);
  assert.equal(blue.players[2].presents.length, 0, "蓝栏先入为主不能通过 −1 保留呈现");
  assert.equal(blue.players[3].joy, pinkJoyBefore, "粉栏先入为主应把一个检定修正为两个并避免失去 Joy");
  const keepOne = enumerateLegalActions(blue).find((action) => action.type === "dress-code-preserve" && action.presentId === "puzzling-b")!;
  blue = applyLegalAction(blue, keepOne);
  assert.deepEqual(blue.players[1].presents.map((present) => present.id), ["puzzling-b"]);

  let whitePink = createSimGame(["NB", "B", "C", "D"]);
  whitePink.active = 0;
  whitePink.phase = "play";
  whitePink.players[0].identity = "nonbinary";
  whitePink.players[0].reading = "female";
  whitePink.players[0].presents = [checked("white-pink-one")];
  whitePink.players[0].ambiguityCard = { id: "white-pink-mark", name: "扑朔迷离", kind: "action" };
  whitePink.players[0].hand = [{ id: "dress-code-white-pink", name: "职场 Dress Code", kind: "action" }];
  const joyBefore = whitePink.players[0].joy;
  whitePink = applyLegalAction(whitePink, enumerateLegalActions(whitePink).find((action) => action.cardId === "dress-code-white-pink")!);
  whitePink = applyLegalAction(whitePink, enumerateLegalActions(whitePink).find((action) => action.type === "reading-keep")!);
  assert.equal(whitePink.checkCountPrompt?.checks[0].sourceName, "职场 Dress Code", "非二元粉读取才应进入检定数选择");
  whitePink = applyLegalAction(whitePink, enumerateLegalActions(whitePink).find((action) => action.checkCountAdjustment === 1)!);
  assert.equal(whitePink.players[0].joy, joyBefore);
  assert.equal(whitePink.players[0].whiteEffects, 1);
});

test("福灵塔蓝色能力可在有检定时免费转换长期身份且每人限一次", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "fulingta", name: "福灵塔", kind: "venue" }];
  base.players[1].identity = "male";
  base.players[1].presents = [{ id: "check-for-convert", name: "美甲", kind: "present", checked: true }];

  const playVenue = enumerateLegalActions(base).find((action) => action.cardId === "fulingta")!;
  const activeVenue = applyLegalAction(base, playVenue);
  assert.equal(activeVenue.active, 1);

  const falsePositive = structuredClone(activeVenue);
  falsePositive.players[1].presents = [];
  falsePositive.players[1].ambiguityCard = { id: "fake-check", name: "扑朔迷离", kind: "action" };
  assert.equal(simEffectChecks(falsePositive.players[1]), 1);
  assert.ok(!enumerateLegalActions(falsePositive).some((action) => action.type === "venue-convert"), "0 张真实检定不能靠 +1 修正取得福灵塔资格");

  const falseNegative = structuredClone(activeVenue);
  falseNegative.players[1].ambiguityCard = { id: "hidden-check", name: "先入为主", kind: "action" };
  assert.equal(simChecks(falseNegative.players[1]), 1);
  assert.equal(simEffectChecks(falseNegative.players[1]), 0);
  assert.ok(enumerateLegalActions(falseNegative).some((action) => action.type === "venue-convert"), "1 张真实检定不能被 −1 修正取消福灵塔资格");

  const convertActions = enumerateLegalActions(activeVenue).filter((action) => action.type === "venue-convert");
  assert.deepEqual(new Set(convertActions.map((action) => action.venueIdentity)), new Set(["female", "nonbinary"]));

  const toNonbinary = convertActions.find((action) => action.venueIdentity === "nonbinary")!;
  const converted = applyLegalAction(activeVenue, toNonbinary);
  assert.equal(converted.players[1].identity, "nonbinary");
  assert.equal(converted.players[1].reading, "male");
  assert.equal(converted.phase, "draw", "福灵塔转换不消耗正常拿牌");
  assert.deepEqual(converted.venue?.abilityUsedBy, [1]);
  assert.ok(!enumerateLegalActions(converted).some((action) => action.type === "venue-convert"));

  const temporarilyMale = structuredClone(activeVenue);
  temporarilyMale.players[1].identity = "female";
  temporarilyMale.players[1].tempIdentity = "male";
  temporarilyMale.players[1].tempIdentityExpiresAfterTurn = temporarilyMale.players[1].turns + 2;
  const temporaryConvert = enumerateLegalActions(temporarilyMale).find((action) => action.type === "venue-convert" && action.venueIdentity === "nonbinary")!;
  const visiblyConverted = applyLegalAction(temporarilyMale, temporaryConvert);
  assert.equal(visiblyConverted.players[1].identity, "nonbinary");
  assert.equal(visiblyConverted.players[1].tempIdentity, null, "福灵塔转换后不应继续被旧临时身份覆盖");
  assert.equal(visiblyConverted.players[1].tempIdentityExpiresAfterTurn, null);
  assert.equal(simSide(visiblyConverted.players[1]), "male", "转为非二元后立即以蓝读取生效");

  visiblyConverted.deck = [
    { id: "post-convert-draw", name: "理发", kind: "action" },
    { id: "post-convert-exchange-a", name: "美甲", kind: "present", checked: true },
    { id: "post-convert-exchange-b", name: "长发", kind: "present", checked: true },
    { id: "post-convert-target-draw", name: "心动夸夸", kind: "action" },
  ];
  visiblyConverted.players[1].hand = [{ id: "post-convert-praise", name: "心动夸夸", kind: "action" }];
  const afterDraw = applyLegalAction(visiblyConverted, enumerateLegalActions(visiblyConverted).find((action) => action.type === "draw-blind")!);
  const postConvertPlay = enumerateLegalActions(afterDraw).find((action) => action.cardId === "post-convert-praise" && action.targetId === 2)!;
  const postConvertTriggered = applyLegalAction(afterDraw, postConvertPlay);
  assert.ok(postConvertTriggered.venueExchange, "从蓝转为白后，应能在同一场地持续期内继续触发福灵塔白色摸弃");
  assert.equal(postConvertTriggered.players[1].whiteEffects, 1);
});

test("福灵塔粉白玩家对人出牌后强制按自己摸二弃二、对方摸一弃一结算", () => {
  const makeBase = (identity: "female" | "nonbinary") => {
    const game = createSimGame(["A", "B", "C", "D"]);
    game.active = 0;
    game.phase = "play";
    game.venue = { card: { id: "fulingta-active", name: "福灵塔", kind: "venue" }, ownerId: 3, expiresAfterOwnerTurn: 99, abilityUsedBy: [] };
    game.players[0].identity = identity;
    game.players[0].reading = "male";
    game.players[0].hand = [{ id: "praise-under-venue", name: "心动夸夸", kind: "action" }];
    game.players[1].hand = [{ id: "target-old", name: "打烊", kind: "action" }];
    game.deck = [
      { id: "actor-new-a", name: "美甲", kind: "present", checked: true },
      { id: "actor-new-b", name: "亲戚给的宽大卫衣", kind: "present" },
      { id: "target-new", name: "长发", kind: "present", checked: true },
      { id: "deck-rest", name: "心动夸夸", kind: "action" },
    ];
    return game;
  };

  let game = makeBase("female");
  const praiseTarget = enumerateLegalActions(game).find((action) => action.cardId === "praise-under-venue" && action.targetId === 1)!;
  game = applyLegalAction(game, praiseTarget);
  assert.equal(game.active, 0, "双方完成福灵塔摸弃前不得结束回合");
  assert.equal(game.venueExchange?.stage, "discard");
  assert.equal(game.venueExchange?.discardRemaining, 2);
  assert.equal(decisionPlayerId(game), 0);
  assert.ok(game.players[0].hand.some((card) => card.id === "actor-new-a"));
  assert.ok(game.players[0].hand.some((card) => card.id === "actor-new-b"));

  const actorDiscardA = enumerateLegalActions(game).find((action) => action.type === "venue-exchange-discard" && action.cardId === "actor-new-a")!;
  game = applyLegalAction(game, actorDiscardA);
  assert.equal(game.venueExchange?.discardRemaining, 1);
  assert.equal(decisionPlayerId(game), 0);
  const actorDiscardB = enumerateLegalActions(game).find((action) => action.type === "venue-exchange-discard" && action.cardId === "actor-new-b")!;
  game = applyLegalAction(game, actorDiscardB);
  assert.equal(decisionPlayerId(game), 1);
  assert.equal(game.venueExchange?.discardRemaining, 1);
  assert.ok(game.players[1].hand.some((card) => card.id === "target-new"));
  const targetDiscard = enumerateLegalActions(game).find((action) => action.type === "venue-exchange-discard" && action.cardId === "target-old")!;
  game = applyLegalAction(game, targetDiscard);
  assert.equal(game.venueExchange, null);
  assert.equal(game.active, 1);
  assert.ok(game.players[1].hand.some((card) => card.id === "target-new"));
  assert.ok(game.discard.some((card) => card.id === "actor-new-a"));
  assert.ok(game.discard.some((card) => card.id === "actor-new-b"));
  assert.ok(game.discard.some((card) => card.id === "target-old"));

  const whiteGame = makeBase("nonbinary");
  const whitePraise = enumerateLegalActions(whiteGame).find((action) => action.cardId === "praise-under-venue" && action.targetId === 1)!;
  const whiteTriggered = applyLegalAction(whiteGame, whitePraise);
  assert.ok(whiteTriggered.venueExchange, "白色身份即使为蓝读取也使用福灵塔白栏");
  assert.equal(whiteTriggered.players[0].whiteEffects, 1, "福灵塔白色效果应记录 enby 的首次白栏 +6");

  const blueGame = makeBase("female");
  blueGame.players[0].identity = "male";
  const bluePraise = enumerateLegalActions(blueGame).find((action) => action.cardId === "praise-under-venue" && action.targetId === 1)!;
  const blueResolved = applyLegalAction(blueGame, bluePraise);
  assert.equal(blueResolved.venueExchange, null, "男性不触发粉白摸弃效果");
  assert.equal(blueResolved.active, 1);
});

test("呈现牌数量翻倍并加入两张皱巴巴的格子衬衫", () => {
  const game = createSimGame(["A", "B", "C", "D"], () => 0.42);
  const allCards = [...game.deck, ...game.market, ...game.players.flatMap((player) => player.hand)];
  const count = (name: string) => allCards.filter((card) => card.name === name).length;
  ["长发", "美甲", "一支商标模糊的口红", "家里翻到的古老碎花裙", "商场专柜里的裙子", "亚文化裙裤", "亲戚给的宽大卫衣"]
    .forEach((name) => assert.equal(count(name), 4, `${name}应有四张`));
  assert.equal(count("皱巴巴的格子衬衫"), 2);
  assert.equal(count("学吉他"), 2);
  assert.equal(count("扑朔迷离"), 1);
  assert.equal(count("先入为主"), 1);
  assert.equal(count("detrans"), 1);
  ["程序员", "变装皇后", "女装店老板", "自由职业者", "改好证了！", "封心锁爱", "地雷系", "空间主理人", "伪娘团"]
    .forEach((name) => assert.equal(count(name), 1, `${name}应有一张`));
  assert.equal(count("发卡"), 0, "【发卡】不进入正式牌库");
  assert.ok(allCards.filter((card) => card.name === "皱巴巴的格子衬衫").every((card) => !card.checked));
});

test("程序员、变装皇后、女装店老板与空间主理人按公开场面获得 Joy", () => {
  assert.equal(simShopOwnerJoy(2, { shopOwnerCap: 3, shopOwnerScoring: "three-four-tier-2-4" }), 0);
  assert.equal(simShopOwnerJoy(3, { shopOwnerCap: 3, shopOwnerScoring: "three-four-tier-2-4" }), 2);
  assert.equal(simShopOwnerJoy(4, { shopOwnerCap: 3, shopOwnerScoring: "three-four-tier-2-4" }), 4);
  const checked = (id: string, name: string) => ({ id, name, kind: "present" as const, checked: true });

  let programmer = createSimGame(["A", "B", "C", "D"]);
  programmer.active = 0;
  programmer.phase = "play";
  programmer.players[0].presents = [{ id: "shirt", name: "皱巴巴的格子衬衫", kind: "present", clothing: true }];
  programmer.players[0].hand = [{ id: "programmer", name: "程序员", kind: "action" }];
  programmer = applyLegalAction(programmer, enumerateLegalActions(programmer).find((action) => action.cardId === "programmer")!);
  assert.equal(programmer.players[0].joy, 4);
  assert.deepEqual(programmer.players[0].scoreSources, [{ cardName: "程序员", joy: 2 }]);

  let dragQueen = createSimGame(["A", "B", "C", "D"]);
  dragQueen.phase = "play";
  dragQueen.players[dragQueen.active].presents = [checked("lip", "一支商标模糊的口红"), checked("nails", "美甲")];
  dragQueen.players[dragQueen.active].hand = [{ id: "drag-queen", name: "变装皇后", kind: "action" }];
  const dragQueenActor = dragQueen.active;
  dragQueen = applyLegalAction(dragQueen, enumerateLegalActions(dragQueen).find((action) => action.cardId === "drag-queen")!);
  assert.equal(dragQueen.players[dragQueenActor].joy, 4);
  assert.deepEqual(dragQueen.players[dragQueenActor].scoreSources, [{ cardName: "变装皇后", joy: 2 }]);

  let shop = createSimGame(["A", "B", "C", "D"]);
  shop.phase = "play";
  shop.players[0].presents = [{ id: "clothing-a", name: "亲戚给的宽大卫衣", kind: "present", clothing: true }];
  shop.players[1].presents = [{ id: "clothing-b", name: "亚文化裙裤", kind: "present", clothing: true, dress: true }];
  shop.players[2].presents = [{ id: "clothing-c", name: "皱巴巴的格子衬衫", kind: "present", clothing: true }];
  shop.players[3].presents = [{ id: "clothing-d", name: "商场专柜里的裙子", kind: "present", clothing: true, dress: true }];
  const shopActor = shop.active;
  shop.players[shopActor].hand = [{ id: "shop-owner", name: "女装店老板", kind: "action" }];
  shop = applyLegalAction(shop, enumerateLegalActions(shop).find((action) => action.cardId === "shop-owner")!);
  assert.equal(shop.players[shopActor].joy, 6, "四种服装应获得 4 Joy");
  assert.deepEqual(shop.players[shopActor].scoreSources, [{ cardName: "女装店老板", joy: 4 }]);

  let space = createSimGame(["A", "B", "C", "D"]);
  space.phase = "play";
  space.players[0].presents = [checked("a1", "美甲"), checked("a2", "长发")];
  space.players[1].presents = [checked("b1", "一支商标模糊的口红"), checked("b2", "商场专柜里的裙子")];
  space.players[2].presents = [checked("c1", "美甲")];
  const spaceActor = space.active;
  space.players[spaceActor].hand = [{ id: "space-host", name: "空间主理人", kind: "action" }];
  space = applyLegalAction(space, enumerateLegalActions(space).find((action) => action.cardId === "space-host")!);
  assert.equal(space.players[spaceActor].joy, 4, "两名玩家满足条件，应获得 2 Joy");
  assert.deepEqual(space.players[spaceActor].scoreSources, [{ cardName: "空间主理人", joy: 2 }]);
});

test("自由职业者留场并免疫两张职场相关行动", () => {
  let game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].hand = [{ id: "freelancer", name: "自由职业者", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "freelancer")!);
  assert.equal(game.players[0].joy, 3);
  assert.ok(game.players[0].items.includes("自由职业者"));

  game.active = 1;
  game.phase = "play";
  game.players[0].presents = [{ id: "protected-check", name: "美甲", kind: "present", checked: true }];
  game.players[1].presents = [{ id: "unprotected-check", name: "长发", kind: "present", checked: true }];
  game.players[1].hand = [{ id: "dress-code", name: "职场 Dress Code", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "dress-code")!);
  assert.ok(game.players[0].presents.some((card) => card.id === "protected-check"));
  assert.equal(game.players[1].presents.length, 0);

  game.dei = false;
  game.active = 2;
  game.phase = "play";
  game.players[2].hand = [{ id: "dei", name: "职场 DEI", kind: "action" }];
  const joyBefore = game.players.map((player) => player.joy);
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "dei")!);
  assert.equal(game.players[0].joy, joyBefore[0], "自由职业者不受 DEI 的 +1 Joy 影响");
  [1, 2, 3].forEach((id) => assert.equal(game.players[id].joy, joyBefore[id] + 1));
});

test("改好证了锁定长期身份但不阻止临时身份", () => {
  let game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "male";
  game.players[0].hand = [{ id: "fixed-id", name: "改好证了！", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "fixed-id")!);
  assert.ok(game.players[0].items.includes("改好证了！"));
  assert.equal(game.players[0].joy, 3);

  game.active = 1;
  game.phase = "play";
  game.players[1].hand = [{ id: "she-after-fixed", name: "她", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "she-after-fixed" && action.targetId === 0)!);
  assert.equal(game.players[0].identity, "male", "【她】不能改变已锁定的长期身份");

  game.players[0].tempIdentity = "female";
  game.players[0].tempIdentityExpiresAfterTurn = game.players[0].turns + 2;
  assert.equal(game.players[0].tempIdentity, "female", "长期身份锁定不妨碍临时身份存在");
  game.active = 2;
  game.phase = "play";
  game.players[2].hand = [{ id: "affirm-fixed", name: "身份肯定", kind: "action" }];
  assert.equal(enumerateLegalActions(game).some((action) => action.cardId === "affirm-fixed" && action.targetId === 0), false, "身份肯定不能固定已锁定玩家的临时身份");
});

test("长期身份改变公开叠层，detrans 弹出一层且不清除临时身份", () => {
  let pushed = createSimGame(["A", "B", "C", "D"]);
  pushed.active = 0;
  pushed.phase = "play";
  pushed.players[0].hand = [{ id: "push-female", name: "她", kind: "action" }];
  const pronoun = enumerateLegalActions(pushed).find((action) => action.cardId === "push-female" && action.targetId === 0)!;
  pushed = applyLegalAction(pushed, { ...pronoun, pronounResponse: "accept-binary" });
  assert.deepEqual(pushed.players[0].identityHistory, [
    { identity: "male", reading: "male" },
    { identity: "female", reading: "female" },
  ], "【她】【他】改变长期身份时应把新身份压入公开历史栈");

  let game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "female";
  game.players[0].reading = "female";
  game.players[0].identityHistory = [
    { identity: "male", reading: "male" },
    { identity: "nonbinary", reading: "female" },
    { identity: "female", reading: "female" },
  ];
  game.players[0].tempIdentity = "male";
  game.players[0].tempIdentityExpiresAfterTurn = game.players[0].turns + 2;
  game.players[0].ambiguityCard = { id: "detrans-ambiguity", name: "扑朔迷离", kind: "action" };
  game.players[0].hand = [{ id: "detrans-card", name: "detrans", kind: "action" }];

  const detrans = enumerateLegalActions(game).find((action) => action.cardId === "detrans-card" && !action.id.endsWith(":fizzle"))!;
  assert.ok(detrans, "有可撤回的长期身份层时可以正常使用 detrans");
  game = applyLegalAction(game, detrans);

  assert.equal(game.players[0].identity, "nonbinary");
  assert.equal(game.players[0].reading, "female", "恢复非二元层时应恢复该层记录的粉读取");
  assert.deepEqual(game.players[0].identityHistory, [
    { identity: "male", reading: "male" },
    { identity: "nonbinary", reading: "female" },
  ]);
  assert.equal(game.players[0].tempIdentity, "male", "detrans 只操作长期身份，不清除临时身份");
  assert.equal(game.players[0].ambiguityCard, null, "detrans 属于长期身份改变，应移除持续三切标记");
  assert.ok(game.discard.some((card) => card.id === "detrans-ambiguity"));
});

test("detrans 在只有初始身份层或已改好证时不能正常使用", () => {
  const initialOnly = createSimGame(["A", "B", "C", "D"]);
  initialOnly.active = 0;
  initialOnly.phase = "play";
  initialOnly.players[0].hand = [{ id: "initial-detrans", name: "detrans", kind: "action" }];
  const initialActions = enumerateLegalActions(initialOnly).filter((action) => action.cardId === "initial-detrans");
  assert.ok(initialActions.every((action) => action.id.endsWith(":fizzle")), "只有最初一层时只能按无合理效果空出");

  const locked = createSimGame(["A", "B", "C", "D"]);
  locked.active = 0;
  locked.phase = "play";
  locked.players[0].identity = "female";
  locked.players[0].reading = "female";
  locked.players[0].identityHistory = [
    { identity: "male", reading: "male" },
    { identity: "female", reading: "female" },
  ];
  locked.players[0].items = ["改好证了！"];
  locked.players[0].hand = [{ id: "locked-detrans", name: "detrans", kind: "action" }];
  const lockedActions = enumerateLegalActions(locked).filter((action) => action.cardId === "locked-detrans");
  assert.ok(lockedActions.every((action) => action.id.endsWith(":fizzle")), "改好证后不能弹出长期身份层");
});

test("伪娘团只连接两名蓝读取且至少有两个检定呈现的玩家", () => {
  const checked = (id: string) => ({ id, name: id, kind: "present" as const, checked: true });
  let game = createSimGame(["A", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "male";
  game.players[1].identity = "male";
  game.players[0].presents = [checked("a1"), checked("a2")];
  game.players[1].presents = [checked("b1"), checked("b2")];
  game.players[0].hand = [{ id: "femboy-group", name: "伪娘团", kind: "action" }];
  const action = enumerateLegalActions(game).find((candidate) => candidate.cardId === "femboy-group" && candidate.targetId === 1)!;
  assert.ok(action);
  game = applyLegalAction(game, action);
  assert.equal(game.players[0].joy, 4);
  assert.equal(game.players[1].joy, 4);
  assert.deepEqual(game.players[0].scoreSources, [{ cardName: "伪娘团", joy: 2 }]);
  assert.deepEqual(game.players[1].scoreSources, [{ cardName: "伪娘团", joy: 2 }]);

  const noPartner = createSimGame(["A", "B", "C", "D"]);
  noPartner.active = 0;
  noPartner.phase = "play";
  noPartner.players[0].presents = [checked("solo-a"), checked("solo-b")];
  noPartner.players[0].hand = [{ id: "femboy-no-partner", name: "伪娘团", kind: "action" }];
  assert.ok(enumerateLegalActions(noPartner).some((candidate) => candidate.id.endsWith(":fizzle")), "没有同伴时只能空出");

  // 非二元目标玩家在粉读取时被指定：可选择保持粉读取（拒绝切蓝，伪娘团不发分）或支付 1 Joy 切为蓝读取（获得 2 Joy）
  let targetPink = createSimGame(["A", "B", "C", "D"]);
  targetPink.active = 0;
  targetPink.phase = "play";
  targetPink.players[0].identity = "male";
  targetPink.players[0].presents = [checked("tp-a1"), checked("tp-a2")];
  targetPink.players[1].identity = "nonbinary";
  targetPink.players[1].reading = "female";
  targetPink.players[1].joy = 3;
  targetPink.players[1].presents = [checked("tp-b1"), checked("tp-b2")];
  targetPink.players[0].hand = [{ id: "tp-femboy", name: "伪娘团", kind: "action" }];

  const playTargetPink = enumerateLegalActions(targetPink).find((candidate) => candidate.cardId === "tp-femboy" && candidate.targetId === 1)!;
  assert.ok(playTargetPink, "可以对有 Joy 的非二元玩家打出伪娘团");
  targetPink = applyLegalAction(targetPink, playTargetPink);
  assert.ok(targetPink.readingPrompt, "应触发目标非二元玩家的读取判定");

  const readingOptions = enumerateLegalActions(targetPink);
  const keepOption = readingOptions.find((action) => action.type === "reading-keep");
  const switchOption = readingOptions.find((action) => action.type === "reading-switch");
  assert.ok(keepOption, "被指定方必须有权选择保持当前粉读取（取消/拒绝支付 Joy）");
  assert.ok(switchOption, "被指定方可以支付 1 Joy 切换为蓝读取");

  // 分支 1：选择保持粉读取 -> 伪娘团因未满足蓝读取条件不发分
  let declinedGame = applyLegalAction(targetPink, keepOption!);
  assert.equal(declinedGame.players[1].reading, "female");
  assert.equal(declinedGame.players[1].joy, 3, "保持读取不消耗 Joy");
  assert.equal(declinedGame.players[0].joy, 2, "出牌者不获得 Joy");
  assert.equal(declinedGame.players[1].scoreSources?.length ?? 0, 0, "目标不获得伪娘团 Joy");

  // 分支 2：选择支付 1 Joy 切换为蓝读取 -> 伪娘团成功发分
  let acceptedGame = applyLegalAction(targetPink, switchOption!);
  assert.equal(acceptedGame.players[1].reading, "male");
  assert.equal(acceptedGame.players[1].joy, 4, "消耗 1 Joy 并获得 2 Joy（净增 1 Joy）");
  assert.equal(acceptedGame.players[0].joy, 4, "出牌者获得 2 Joy");
  assert.deepEqual(acceptedGame.players[0].scoreSources, [{ cardName: "伪娘团", joy: 2 }]);
  assert.deepEqual(acceptedGame.players[1].scoreSources, [{ cardName: "伪娘团", joy: 2 }]);
});

test("空间主理人与伪娘团使用被三切持续状态修正后的当前检定数", () => {
  const checked = (id: string) => ({ id, name: id, kind: "present" as const, checked: true });

  let space = createSimGame(["A", "B", "C", "D"]);
  space.active = 0;
  space.phase = "play";
  space.players[0].hand = [{ id: "adjusted-space-host", name: "空间主理人", kind: "action" }];
  space.players[1].identity = "male";
  space.players[1].presents = [checked("space-plus-one")];
  space.players[1].ambiguityCard = { id: "space-plus", name: "扑朔迷离", kind: "action" };
  space.players[2].identity = "female";
  space.players[2].presents = [checked("space-minus-a"), checked("space-minus-b")];
  space.players[2].ambiguityCard = { id: "space-minus", name: "扑朔迷离", kind: "action" };
  const spacePlay = enumerateLegalActions(space).find((candidate) => candidate.cardId === "adjusted-space-host")!;
  space = applyLegalAction(space, spacePlay);
  assert.equal(space.players[0].joy, 3, "蓝栏 +1 使一检定达标；粉栏 −1 使两检定不达标");
  assert.deepEqual(space.players[0].scoreSources, [{ cardName: "空间主理人", joy: 1 }]);

  let group = createSimGame(["A", "B", "C", "D"]);
  group.active = 0;
  group.phase = "play";
  group.players[0].identity = "nonbinary";
  group.players[0].reading = "male";
  group.players[0].presents = [checked("group-white-one")];
  group.players[0].ambiguityCard = { id: "group-white", name: "扑朔迷离", kind: "action" };
  group.players[1].identity = "male";
  group.players[1].presents = [checked("group-target-a"), checked("group-target-b")];
  group.players[0].hand = [{ id: "adjusted-femboy-group", name: "伪娘团", kind: "action" }];
  const groupPlay = enumerateLegalActions(group).find((candidate) => candidate.cardId === "adjusted-femboy-group" && candidate.targetId === 1)!;
  assert.ok(groupPlay, "白栏可把一个实际检定修正为两个，使伪娘团成为合法动作");
  group = applyLegalAction(group, groupPlay);
  const keepBlue = enumerateLegalActions(group).find((candidate) => candidate.type === "reading-keep")!;
  group = applyLegalAction(group, keepBlue);
  assert.equal(group.checkCountPrompt?.checks[0].sourceName, "伪娘团");
  const choosePlus = enumerateLegalActions(group).find((candidate) => candidate.checkCountAdjustment === 1)!;
  group = applyLegalAction(group, choosePlus);
  assert.equal(group.players[0].joy, 4);
  assert.equal(group.players[1].joy, 4);
});

test("卸甲移除美甲，后一件衣物覆盖所有先前衣物", () => {
  const removeBase = createSimGame(["A", "B", "C", "D"]);
  removeBase.active = 0;
  removeBase.phase = "play";
  removeBase.players[1].presents = [{ id: "nails-target", name: "美甲", kind: "present", checked: true }];
  removeBase.players[0].hand = [{ id: "remove-nails", name: "卸甲", kind: "action" }];
  const removeAction = enumerateLegalActions(removeBase).find((action) => action.cardId === "remove-nails" && action.targetId === 1)!;
  const removed = applyLegalAction(removeBase, removeAction);
  assert.ok(!removed.players[1].presents.some((card) => card.name === "美甲"));
  assert.ok(removed.discard.some((card) => card.id === "nails-target"));

  const hoodieBase = createSimGame(["A", "B", "C", "D"]);
  hoodieBase.active = 0;
  hoodieBase.phase = "play";
  hoodieBase.players[0].presents = [
    { id: "dress-under-hoodie", name: "亚文化裙裤", kind: "present", checked: true, dress: true },
    { id: "shirt-stays", name: "皱巴巴的格子衬衫", kind: "present" },
  ];
  hoodieBase.players[0].hand = [{ id: "hoodie-cover", name: "亲戚给的宽大卫衣", kind: "present" }];
  const hoodieAction = enumerateLegalActions(hoodieBase).find((action) => action.cardId === "hoodie-cover" && action.targetId === 0)!;
  const covered = applyLegalAction(hoodieBase, hoodieAction);
  assert.ok(covered.players[0].presents.some((card) => card.id === "hoodie-cover"));
  assert.ok(!covered.players[0].presents.some((card) => card.id === "shirt-stays"));
  assert.ok(!covered.players[0].presents.some((card) => card.id === "dress-under-hoodie"));
  assert.ok(covered.discard.some((card) => card.id === "shirt-stays"));
  assert.ok(covered.discard.some((card) => card.id === "dress-under-hoodie"));
});

test("真心话大冒险支付 2 Joy 反制，AI 按泄露风险和 Joy 储备决策", () => {
  const base = createSimGame(["Actor", "Target", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "truth-test", name: "真心话大冒险", kind: "action" }];
  base.players[1].joy = 2;

  const play = enumerateLegalActions(base).find((action) => action.cardId === "truth-test" && action.targetId === 1)!;
  const offered = applyLegalAction(base, play);
  assert.equal(offered.truthOffer?.targetId, 1);
  assert.equal(offered.active, 0, "反制选择完成前不能结束回合");
  assert.equal(decisionPlayerId(offered), 1);
  const responses = enumerateLegalActions(offered);
  assert.ok(responses.some((action) => action.type === "truth-allow"));
  assert.ok(responses.some((action) => action.type === "truth-resist"));

  const resist = responses.find((action) => action.type === "truth-resist")!;
  const resisted = applyLegalAction(offered, resist);
  assert.equal(resisted.players[1].joy, 0);
  assert.equal(resisted.players[1].lastJoyLoss, 2);
  assert.equal(resisted.truthOffer, null);
  assert.equal(resisted.active, 1);
  assert.deepEqual(knowledgeEventsFor(offered, resisted, resist), [
    { type: "reveal", observerId: 1, targetId: 0, goal: offered.players[0].goal },
  ]);

  const lowProgressView = visibleStateFor(offered, 1);
  const lowProgressDecision = chooseHeuristicAction(lowProgressView, responses, createAiMemories(4)[1], () => 0.5);
  assert.equal(lowProgressDecision.chosen.type, "truth-allow", "只剩 2 Joy 且目标尚不关键时应保留 Joy");

  const highProgress = structuredClone(offered);
  highProgress.players[1].goal = "跨女";
  highProgress.players[1].identity = "female";
  highProgress.players[1].joy = 5;
  highProgress.players[1].items = ["小证"];
  highProgress.players[1].presents = [
    { id: "truth-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "truth-nails", name: "美甲", kind: "present", checked: true },
    { id: "truth-hair", name: "长发", kind: "present", checked: true },
  ];
  const highResponses = enumerateLegalActions(highProgress);
  const highDecision = chooseHeuristicAction(visibleStateFor(highProgress, 1), highResponses, createAiMemories(4)[1], () => 0.5);
  assert.equal(highDecision.chosen.type, "truth-resist", "目标接近完成且 Joy 充足时应支付 2 Joy 保护情报");
});

test("换一种活法公开交换目标牌，确定记忆与目标推断随牌移动", () => {
  const game = createSimGame(["观察者", "A", "B", "另一观察者"]);
  game.active = 1;
  game.phase = "play";
  game.players[1].goal = "enby";
  game.players[2].goal = "跨女";
  game.players[1].hand = [{ id: "swap-goals", name: "换一种活法", kind: "action" }];

  let memories = createAiMemories(4);
  memories = applyKnowledgeEvents(memories, [
    { type: "reveal", observerId: 0, targetId: 1, goal: "enby" },
    { type: "reveal", observerId: 3, targetId: 1, goal: "enby" },
    { type: "reveal", observerId: 3, targetId: 2, goal: "跨女" },
  ]);

  const action = enumerateLegalActions(game).find(
    (candidate) => candidate.cardId === "swap-goals" && candidate.targetId === 2,
  )!;
  const after = applyLegalAction(game, action);
  memories = applyKnowledgeEvents(memories, knowledgeEventsFor(game, after, action));

  assert.equal(after.players[1].goal, "跨女");
  assert.equal(after.players[2].goal, "enby");

  assert.equal(memories[0].knownTargets[1], undefined, "只知道 A 的观察者不应凭空知道 A 换来的牌");
  assert.equal(memories[0].knownTargets[2], "enby", "已知的 enby 目标应随牌移动到 B");
  assert.ok(memories[0].suspicions[2].enby > 0.8, "对已知目标的高置信推断也应随牌移动");

  assert.equal(memories[3].knownTargets[1], "跨女", "知道双方目标时应完整交换确定记忆");
  assert.equal(memories[3].knownTargets[2], "enby");
  assert.equal(memories[1].knownTargets[2], "enby", "交换发起者知道自己交出的目标去了哪里");
  assert.equal(memories[2].knownTargets[1], "跨女", "交换对象知道自己交出的目标去了哪里");
});

test("非二元玩家每次身份判断前都可支付 1 Joy 永久切换读取", () => {
  const base = createSimGame(["Actor", "Enby", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "old-man-reading", name: "老男人看了你一眼", kind: "action" }];
  base.players[1].identity = "nonbinary";
  base.players[1].reading = "male";
  base.players[1].joy = 2;
  base.players[1].presents = [{ id: "one-check", name: "美甲", kind: "present", checked: true }];

  const play = enumerateLegalActions(base).find((action) => action.cardId === "old-man-reading" && action.targetId === 1)!;
  const prompted = applyLegalAction(base, play);
  assert.equal(prompted.readingPrompt?.checks[0].playerId, 1);
  assert.equal(prompted.players[1].joy, 2, "身份判断前不能提前结算牌效");
  assert.equal(decisionPlayerId(prompted), 1);
  assert.deepEqual(new Set(enumerateLegalActions(prompted).map((action) => action.type)), new Set(["reading-keep", "reading-switch"]), "读取选择只能保持或付费翻转，不能取消已打出的牌");

  const switchReading = enumerateLegalActions(prompted).find((action) => action.type === "reading-switch")!;
  const resolved = applyLegalAction(prompted, switchReading);
  assert.equal(resolved.readingPrompt, null);
  assert.equal(resolved.players[1].reading, "female");
  assert.equal(resolved.players[1].joy, 1, "只支付切换读取的 1 Joy，粉栏在 1 个检定时不再失去 Joy");
  assert.equal(resolved.players[1].lastJoyLoss, 1);

  resolved.active = 0;
  resolved.phase = "play";
  resolved.players[0].hand = [{ id: "old-man-reading-again", name: "老男人看了你一眼", kind: "action" }];
  const playAgain = enumerateLegalActions(resolved).find((action) => action.cardId === "old-man-reading-again" && action.targetId === 1)!;
  const promptedAgain = applyLegalAction(resolved, playAgain);
  assert.ok(enumerateLegalActions(promptedAgain).some((action) => action.type === "reading-switch"), "下一次判断前仍可再次付费切回");
});

test("AI 会比较身份判断的即时损失与切换读取的 Joy 成本", () => {
  const base = createSimGame(["Actor", "Enby", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "dress-code-reading", name: "职场 Dress Code", kind: "action" }];
  base.players[1].goal = "跨女";
  base.players[1].identity = "nonbinary";
  base.players[1].reading = "male";
  base.players[1].joy = 4;
  base.players[1].presents = [
    { id: "dc-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "dc-nails", name: "美甲", kind: "present", checked: true },
    { id: "dc-hair", name: "长发", kind: "present", checked: true },
  ];
  const play = enumerateLegalActions(base).find((action) => action.cardId === "dress-code-reading")!;
  const prompted = applyLegalAction(base, play);
  const actions = enumerateLegalActions(prompted);
  const decision = chooseHeuristicAction(visibleStateFor(prompted, 1), actions, createAiMemories(4)[1], () => 0.5);
  assert.equal(decision.chosen.type, "reading-switch", "应花 1 Joy 保住三张关键检定呈现");
});

test("共享衣橱把任意呈现移给另一名玩家而不弃置该牌", () => {
  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[1].presents = [{ id: "shared-nails", name: "美甲", kind: "present", checked: true }];
  base.players[0].hand = [{ id: "shared-wardrobe", name: "共享衣橱", kind: "action" }];

  const action = enumerateLegalActions(base).find((candidate) => candidate.cardId === "shared-wardrobe" && candidate.sourcePlayerId === 1 && candidate.presentId === "shared-nails" && candidate.targetId === 2)!;
  const game = applyLegalAction(base, action);
  assert.ok(!game.players[1].presents.some((card) => card.id === "shared-nails"));
  assert.ok(game.players[2].presents.some((card) => card.id === "shared-nails"));
  assert.ok(!game.discard.some((card) => card.id === "shared-nails"));
  assert.ok(game.players[1].removedPresents.some((entry) => entry.card.id === "shared-nails"));
});

test("美妆博主粉栏无口红也可展示牌堆顶三张并择一立即打出", () => {
  const beauty = createSimGame(["A", "B", "C", "D"]);
  beauty.active = 0;
  beauty.phase = "play";
  beauty.players[0].identity = "female";
  beauty.players[0].reading = "female";
  beauty.players[0].presents = [];
  beauty.players[0].hand = [{ id: "beauty-no-lipstick", name: "美妆博主", kind: "action" }];
  beauty.deck = [
    { id: "beauty-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "beauty-action", name: "心动夸夸", kind: "action" },
    { id: "beauty-nails", name: "美甲", kind: "present", checked: true },
    { id: "beauty-bottom", name: "打烊", kind: "action" },
  ];
  const play = enumerateLegalActions(beauty).find((action) => action.cardId === "beauty-no-lipstick")!;
  const offered = applyLegalAction(beauty, play);
  assert.deepEqual(offered.beautyOffer?.revealed.map((card) => card.id), ["beauty-dress", "beauty-action", "beauty-nails"]);
  assert.deepEqual(offered.deck.map((card) => card.id), ["beauty-bottom"]);
  assert.equal(offered.active, 0);

  const chooseDress = enumerateLegalActions(offered).find((action) => action.type === "beauty-blogger-play" && action.presentId === "beauty-dress" && action.targetId === 0)!;
  const resolved = applyLegalAction(offered, chooseDress);
  assert.ok(resolved.players[0].presents.some((card) => card.id === "beauty-dress"));
  assert.deepEqual(resolved.deck.map((card) => card.id), ["beauty-bottom", "beauty-action", "beauty-nails"]);
  assert.equal(resolved.beautyOffer, null);
  assert.equal(resolved.active, 1);
});

test("美妆博主立即打出的呈现会触发出牌者给予的心动标记", () => {
  const beauty = createSimGame(["A", "心动对象", "C", "D"]);
  beauty.active = 0;
  beauty.phase = "play";
  beauty.players[0].identity = "female";
  beauty.players[0].reading = "female";
  beauty.players[0].joy = 2;
  beauty.players[0].crushTargetId = 1;
  beauty.players[0].hand = [{ id: "beauty-crush", name: "美妆博主", kind: "action" }];
  beauty.deck = [
    { id: "beauty-crush-nails", name: "美甲", kind: "present", checked: true },
    { id: "beauty-crush-other-a", name: "打烊", kind: "action" },
    { id: "beauty-crush-other-b", name: "她", kind: "action" },
  ];

  const play = enumerateLegalActions(beauty).find((action) => action.cardId === "beauty-crush")!;
  const offered = applyLegalAction(beauty, play);
  const actions = enumerateLegalActions(offered);
  const markedAction = actions.find((action) => action.type === "beauty-blogger-play" && action.presentId === "beauty-crush-nails" && action.targetId === 1)!;
  const unmarkedAction = actions.find((action) => action.type === "beauty-blogger-play" && action.presentId === "beauty-crush-nails" && action.targetId === 2)!;
  const decision = chooseHeuristicAction(visibleStateFor(offered, 0), actions, createAiMemories(4)[0], () => 0.5);
  const markedScore = decision.candidates.find((candidate) => candidate.action.id === markedAction.id)!.total;
  const unmarkedScore = decision.candidates.find((candidate) => candidate.action.id === unmarkedAction.id)!.total;
  assert.ok(markedScore > unmarkedScore, "AI 应识别立即打给心动对象可额外获得 1 Joy");

  const resolved = applyLegalAction(offered, markedAction);
  assert.equal(resolved.players[0].joy, 3);
  assert.ok(resolved.players[1].presents.some((card) => card.id === "beauty-crush-nails"));
  assert.deepEqual(resolved.players[0].scoreSources, [{ cardName: "心动标记", joy: 1 }]);
  assert.ok(resolved.events.some((entry) => entry.includes("【美甲】") && entry.includes("心动标记")));
});

test("美妆博主可以不打出展示牌并按原顺序沉底", () => {
  const beauty = createSimGame(["A", "B", "C", "D"]);
  beauty.active = 0;
  beauty.phase = "play";
  beauty.players[0].identity = "female";
  beauty.players[0].reading = "female";
  beauty.players[0].hand = [{ id: "beauty-pass-card", name: "美妆博主", kind: "action" }];
  beauty.deck = [
    { id: "beauty-top-1", name: "心动夸夸", kind: "action" },
    { id: "beauty-top-2", name: "美甲", kind: "present", checked: true },
    { id: "beauty-top-3", name: "她", kind: "action" },
    { id: "beauty-old-bottom", name: "打烊", kind: "action" },
  ];
  const play = enumerateLegalActions(beauty).find((action) => action.cardId === "beauty-pass-card")!;
  const offered = applyLegalAction(beauty, play);
  const pass = enumerateLegalActions(offered).find((action) => action.type === "beauty-blogger-pass")!;
  const resolved = applyLegalAction(offered, pass);
  assert.deepEqual(resolved.deck.map((card) => card.id), ["beauty-old-bottom", "beauty-top-1", "beauty-top-2", "beauty-top-3"]);
  assert.equal(resolved.beautyOffer, null);
  assert.equal(resolved.active, 1);
});

test("翻箱倒柜重洗公共牌列", () => {
  const rummage = createSimGame(["A", "B", "C", "D"]);
  rummage.active = 0;
  rummage.phase = "play";
  rummage.players[0].hand = [
    { id: "rummage", name: "翻箱倒柜", kind: "action" },
    { id: "after-rummage", name: "程序员", kind: "action" },
  ];
  rummage.deck = [
    { id: "deck-1", name: "心动夸夸", kind: "action" },
    { id: "deck-2", name: "美甲", kind: "present", checked: true },
    { id: "deck-3", name: "长发", kind: "present", checked: true },
  ];
  rummage.market = [
    { id: "market-1", name: "她", kind: "action" },
    { id: "market-2", name: "皱巴巴的格子衬衫", kind: "present" },
    { id: "market-3", name: "打烊", kind: "action" },
  ];
  rummage.locks = { "market-1": 2 };
  const rummageAction = enumerateLegalActions(rummage).find((action) => action.cardId === "rummage")!;
  const shuffled = applyLegalAction(rummage, rummageAction);
  assert.equal(shuffled.market.length, 3);
  assert.equal(shuffled.active, 0);
  assert.equal(shuffled.phase, "draw");
  assert.deepEqual(Object.keys(shuffled.locks), []);
  assert.deepEqual(new Set([...shuffled.market, ...shuffled.deck].map((card) => card.id)), new Set(["deck-1", "deck-2", "deck-3", "market-1", "market-2", "market-3"]));
  const extraDraw = enumerateLegalActions(shuffled).find((action) => action.type === "draw-blind")!;
  const afterDraw = applyLegalAction(shuffled, extraDraw);
  assert.equal(afterDraw.active, 0);
  assert.equal(afterDraw.phase, "play");
  const followUp = enumerateLegalActions(afterDraw).find((action) => action.cardId === "after-rummage")!;
  const completed = applyLegalAction(afterDraw, followUp);
  assert.equal(completed.active, 1);
});

test("删除撒娇并加入两张试用代词，临时身份持续至本人下回合结束", () => {
  const inventory = createSimGame(["A", "B", "C", "D"], () => 0.37);
  const allCards = [...inventory.deck, ...inventory.market, ...inventory.players.flatMap((player) => player.hand)];
  assert.equal(allCards.filter((card) => card.name === "撒娇").length, 0);
  assert.equal(allCards.filter((card) => card.name === "试用代词").length, 2);

  const base = createSimGame(["A", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].identity = "male";
  base.players[0].reading = "female";
  base.players[0].joy = 2;
  base.players[0].hand = [{ id: "try-pronouns", name: "试用代词", kind: "action" }];
  const trial = enumerateLegalActions(base).find((action) => action.cardId === "try-pronouns")!;
  const originalRandom = Math.random;
  let game: ReturnType<typeof applyLegalAction>;
  try {
    Math.random = () => 0.99;
    game = applyLegalAction(base, trial);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(game.players[0].tempIdentity, "nonbinary");
  assert.equal(game.players[0].reading, "female");
  assert.equal(simSide(game.players[0]), "female");
  assert.equal(game.players[0].tempIdentityExpiresAfterTurn, 2);
  assert.equal(game.players[0].joy, 3);

  for (let index = 0; index < 3; index += 1) {
    const actor = game.players[game.active];
    game.phase = "play";
    actor.hand = [{ id: `trial-pass-${index}`, name: "程序员", kind: "action" }];
    const pass = enumerateLegalActions(game).find((action) => action.cardId === `trial-pass-${index}`)!;
    game = applyLegalAction(game, pass);
  }
  assert.notEqual(game.players[0].tempIdentity, null, "本人下回合结束前临时身份应继续存在");

  game.phase = "play";
  game.players[0].hand = [{ id: "trial-owner-pass", name: "程序员", kind: "action" }];
  const ownerPass = enumerateLegalActions(game).find((action) => action.cardId === "trial-owner-pass")!;
  game = applyLegalAction(game, ownerPass);
  assert.equal(game.players[0].tempIdentity, null);
  assert.equal(game.players[0].tempIdentityExpiresAfterTurn, null);
  assert.equal(game.players[0].identity, "male");
});

test("你pass吗按目标当前二元读取与检定阈值制造临时身份", () => {
  const inventory = createSimGame(["A", "B", "C", "D"], () => 0.37);
  const allCards = [...inventory.deck, ...inventory.market, ...inventory.players.flatMap((player) => player.hand)];
  assert.equal(allCards.filter((card) => card.name === "你pass吗？").length, 1);
  assert.equal(allCards.filter((card) => card.name === "身份肯定").length, 2);
  assert.equal(allCards.filter((card) => card.name === "还好试了一下").length, 0);

  const blue = createSimGame(["Actor", "Blue", "C", "D"]);
  blue.active = 0;
  blue.phase = "play";
  blue.players[1].identity = "male";
  blue.players[1].presents = [
    { id: "pass-blue-1", name: "长发", kind: "present", checked: true },
    { id: "pass-blue-2", name: "美甲", kind: "present", checked: true },
    { id: "pass-blue-3", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  blue.players[0].hand = [{ id: "pass-blue", name: "你pass吗？", kind: "action" }];
  const bluePlay = enumerateLegalActions(blue).find((action) => action.cardId === "pass-blue" && action.targetId === 1)!;
  const blueResult = applyLegalAction(blue, bluePlay);
  assert.equal(blueResult.players[1].identity, "male", "长期身份不能被临时结果覆盖");
  assert.equal(blueResult.players[1].tempIdentity, "female");
  assert.equal(blueResult.players[1].tempIdentityExpiresAfterTurn, 1);

  const pink = createSimGame(["Actor", "Pink", "C", "D"]);
  pink.active = 0;
  pink.phase = "play";
  pink.players[1].identity = "female";
  pink.players[1].presents = [{ id: "pass-pink-1", name: "美甲", kind: "present", checked: true }];
  pink.players[0].hand = [{ id: "pass-pink", name: "你pass吗？", kind: "action" }];
  const pinkPlay = enumerateLegalActions(pink).find((action) => action.cardId === "pass-pink" && action.targetId === 1)!;
  const pinkResult = applyLegalAction(pink, pinkPlay);
  assert.equal(pinkResult.players[1].identity, "female");
  assert.equal(pinkResult.players[1].tempIdentity, "male");
});

test("你pass吗判断非二元前允许切换读取，身份肯定可固定任意玩家的临时身份", () => {
  const base = createSimGame(["Actor", "Target", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[1].identity = "nonbinary";
  base.players[1].reading = "male";
  base.players[1].joy = 2;
  base.players[1].presents = [
    { id: "pass-nb-1", name: "长发", kind: "present", checked: true },
    { id: "pass-nb-2", name: "美甲", kind: "present", checked: true },
    { id: "pass-nb-3", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  base.players[0].hand = [{ id: "pass-nb", name: "你pass吗？", kind: "action" }];
  const play = enumerateLegalActions(base).find((action) => action.cardId === "pass-nb" && action.targetId === 1)!;
  const prompted = applyLegalAction(base, play);
  assert.equal(decisionPlayerId(prompted), 1);
  assert.equal(prompted.readingPrompt?.checks[0].sourceName, "你pass吗？");

  const kept = applyLegalAction(prompted, enumerateLegalActions(prompted).find((action) => action.type === "reading-keep")!);
  assert.equal(kept.players[1].tempIdentity, "female");

  kept.active = 0;
  kept.phase = "play";
  kept.players[0].hand = [{ id: "affirm-target", name: "身份肯定", kind: "action" }];
  const affirm = enumerateLegalActions(kept).find((action) => action.cardId === "affirm-target" && action.targetId === 1)!;
  const affirmed = applyLegalAction(kept, affirm);
  assert.equal(affirmed.players[1].identity, "female");
  assert.equal(affirmed.players[1].tempIdentity, null);
  assert.equal(affirmed.players[1].tempIdentityExpiresAfterTurn, null);
});

test("漫展蓝色效果可以连续打出检定呈现并在每次之后重新拿牌", () => {
  const game = createSimGame(["Blue", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "male";
  game.players[0].hand = [
    { id: "con-blue-present-1", name: "长发", kind: "present", checked: true },
    { id: "con-blue-present-2", name: "美甲", kind: "present", checked: true },
    { id: "con-blue-normal", name: "心动夸夸", kind: "action" },
  ];
  game.deck = [
    { id: "con-blue-deck-rest", name: "共享衣橱", kind: "action" },
  ];
  game.market = [
    { id: "con-blue-market-pick", name: "卸甲", kind: "action" },
    { id: "con-blue-market-other-1", name: "迷茫", kind: "action" },
    { id: "con-blue-market-other-2", name: "心动夸夸", kind: "action" },
  ];
  game.venue = {
    card: { id: "con-blue-venue", name: "漫展", kind: "venue" }, ownerId: 1, expiresAfterOwnerTurn: 2, abilityUsedBy: [],
    manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {},
  };

  const first = enumerateLegalActions(game).find((action) => action.cardId === "con-blue-present-1" && action.targetId === 0)!;
  const afterFirst = applyLegalAction(game, first);
  assert.equal(afterFirst.active, 0);
  assert.equal(afterFirst.phase, "draw");
  assert.ok(!afterFirst.players[0].hand.some((card) => card.id === "con-blue-market-pick"), "不能自动从暗牌堆补牌");
  assert.equal(afterFirst.venue?.manzhanPinkHandledTurns?.[0], undefined, "蓝栏不能占用粉栏的每回合一次记录");

  const refillActions = enumerateLegalActions(afterFirst);
  assert.ok(refillActions.some((action) => action.type === "draw-blind"), "应重新提供暗摸");
  const marketPick = refillActions.find((action) => action.type === "draw-market" && action.marketCardId === "con-blue-market-pick")!;
  const afterRefill = applyLegalAction(afterFirst, marketPick);
  assert.equal(afterRefill.active, 0);
  assert.equal(afterRefill.phase, "play");
  assert.ok(afterRefill.players[0].hand.some((card) => card.id === "con-blue-market-pick"), "可以改为从公共牌列明拿");

  const second = enumerateLegalActions(afterRefill).find((action) => action.cardId === "con-blue-present-2" && action.targetId === 0)!;
  const afterSecond = applyLegalAction(afterRefill, second);
  assert.equal(afterSecond.active, 0, "同一回合第二张检定呈现仍应触发蓝栏");
  assert.equal(afterSecond.phase, "draw");

  const secondRefill = enumerateLegalActions(afterSecond).find((action) => action.type === "draw-market" && action.marketCardId === "con-blue-deck-rest")!;
  const afterSecondRefill = applyLegalAction(afterSecond, secondRefill);
  assert.equal(afterSecondRefill.active, 0);
  assert.equal(afterSecondRefill.phase, "play");
  assert.ok(afterSecondRefill.players[0].hand.some((card) => card.id === "con-blue-deck-rest"));

  const normalPlay = enumerateLegalActions(afterSecondRefill).find((action) => action.cardId === "con-blue-normal" && action.targetId === 1)!;
  const ended = applyLegalAction(afterSecondRefill, normalPlay);
  assert.equal(ended.active, 1, "玩家打出正常行动牌后才结束本回合");
});

test("漫展粉色效果可移动场上任意呈现，Joy 归行动者与原持有者", () => {
  const game = createSimGame(["Pink", "Owner", "Receiver", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "female";
  game.players[0].joy = 2;
  game.players[1].joy = 3;
  game.players[1].presents = [{ id: "con-pink-nails", name: "美甲", kind: "present", checked: true }];
  game.players[0].hand = [{ id: "con-pink-normal", name: "心动夸夸", kind: "action" }];
  game.venue = {
    card: { id: "con-pink-venue", name: "漫展", kind: "venue" }, ownerId: 2, expiresAfterOwnerTurn: 2, abilityUsedBy: [],
    manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {},
  };

  const offer = enumerateLegalActions(game);
  assert.deepEqual(new Set(offer.map((action) => action.type)), new Set(["venue-manzhan-use", "venue-manzhan-pass"]));
  const accepted = applyLegalAction(game, offer.find((action) => action.type === "venue-manzhan-use")!);
  const move = enumerateLegalActions(accepted).find((action) => action.type === "venue-manzhan-move" && action.sourcePlayerId === 1 && action.targetId === 2)!;
  const moved = applyLegalAction(accepted, move);

  assert.ok(!moved.players[1].presents.some((card) => card.id === "con-pink-nails"));
  assert.ok(moved.players[2].presents.some((card) => card.id === "con-pink-nails"));
  assert.equal(moved.players[0].joy, 3);
  assert.equal(moved.players[1].joy, 4);
  assert.equal(moved.active, 0);
  assert.ok(enumerateLegalActions(moved).some((action) => action.cardId === "con-pink-normal"));

  const own = createSimGame(["Pink", "Receiver", "C", "D"]);
  own.active = 0;
  own.phase = "play";
  own.players[0].identity = "female";
  own.players[0].joy = 2;
  own.players[0].presents = [{ id: "own-present", name: "美甲", kind: "present", checked: true }];
  own.venue = { card: { id: "own-manzhan", name: "漫展", kind: "venue" }, ownerId: 2, expiresAfterOwnerTurn: 9, abilityUsedBy: [], manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {} };
  const ownOffer = applyLegalAction(own, enumerateLegalActions(own).find((action) => action.type === "venue-manzhan-use")!);
  const ownMove = enumerateLegalActions(ownOffer).find((action) => action.type === "venue-manzhan-move" && action.sourcePlayerId === 0 && action.targetId === 1)!;
  const ownMoved = applyLegalAction(ownOffer, ownMove);
  assert.equal(ownMoved.players[0].joy, 4, "移动自己的呈现时行动者兼原持有者，应共获得 2 Joy");
  assert.equal(ownMoved.players[1].joy, 2, "接收者不因漫展粉色效果获得 Joy");
});

test("非二元玩家打出漫展时立即选择本场地白色模式并完成首次白效", () => {
  const game = createSimGame(["Owner", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "nonbinary";
  game.players[0].goal = "enby";
  game.players[0].whiteEffects = 0;
  game.players[0].hand = [{ id: "opening-manzhan", name: "漫展", kind: "venue" }];

  const play = enumerateLegalActions(game).find((action) => action.cardId === "opening-manzhan")!;
  let opened = applyLegalAction(game, play);
  assert.equal(opened.active, 0, "白色模式选择完成前不能结束打出者回合");
  assert.equal(decisionPlayerId(opened), 0);
  const choices = enumerateLegalActions(opened);
  assert.deepEqual(new Set(choices.map((action) => action.venueMode)), new Set(["blue", "pink"]));
  assert.equal(opened.players[0].whiteEffects, 0, "玩家实际选择前尚未触发白色效果");

  opened = applyLegalAction(opened, choices.find((action) => action.venueMode === "blue")!);
  assert.equal(opened.players[0].whiteEffects, 1);
  assert.equal(goalScore(opened.players[0]), 10, "非二元身份与首次白效均应进入 enby 目标完成度");
  assert.equal(opened.venue?.manzhanWhiteModes?.[0], "blue");
  assert.equal(opened.active, 1, "选择完成后才结束打出者回合");
});

test("漫展白色玩家若尚未选定模式，会在自己的回合补选", () => {
  const game = createSimGame(["White", "B", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].identity = "nonbinary";
  game.players[0].goal = "enby";
  game.players[0].whiteEffects = 0;
  game.players[0].hand = [{ id: "white-checked", name: "美甲", kind: "present", checked: true }];
  game.players[1].presents = [{ id: "white-pink-option", name: "长发", kind: "present", checked: true }];
  game.deck = [{ id: "white-draw", name: "心动夸夸", kind: "action" }];
  game.venue = { card: { id: "white-manzhan", name: "漫展", kind: "venue" }, ownerId: 2, expiresAfterOwnerTurn: 9, abilityUsedBy: [], manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {} };

  const choices = enumerateLegalActions(game);
  assert.ok(choices.some((action) => action.type === "venue-manzhan-mode" && action.venueMode === "blue"));
  assert.ok(choices.some((action) => action.type === "venue-manzhan-mode" && action.venueMode === "pink"));
  let chosen = applyLegalAction(game, choices.find((action) => action.type === "venue-manzhan-mode" && action.venueMode === "blue")!);
  assert.equal(chosen.players[0].whiteEffects, 1, "选择白色分支本身即视为首次触发白色牌效");
  assert.equal(goalScore(chosen.players[0]), 10);
  const freePlay = enumerateLegalActions(chosen).find((action) => action.cardId === "white-checked" && action.targetId === 0)!;
  chosen = applyLegalAction(chosen, freePlay);
  assert.equal(chosen.players[0].whiteEffects, 1);
  assert.equal(goalScore(chosen.players[0]), 10);
  assert.equal(chosen.active, 0);
  assert.equal(chosen.phase, "draw");
  assert.ok(!chosen.players[0].hand.some((card) => card.id === "white-draw"), "白色选择蓝分支后同样不能自动摸牌");
  const whiteDraw = enumerateLegalActions(chosen).find((action) => action.type === "draw-blind")!;
  chosen = applyLegalAction(chosen, whiteDraw);
  assert.equal(chosen.phase, "play");
  assert.ok(chosen.players[0].hand.some((card) => card.id === "white-draw"));
});

test("学吉他始终由出牌者获得吉他，所选玩家只接收 Joy，重复吉他不会被 AI 当作重复计分", () => {
  const game = createSimGame(["Actor", "Joy target", "C", "D"]);
  game.active = 0;
  game.phase = "play";
  game.players[0].goal = "文艺男";
  game.players[0].items = ["吉他"];
  game.players[0].hand = [
    { id: "guitar-repeat", name: "学吉他", kind: "action" },
    { id: "praise-instead", name: "心动夸夸", kind: "action" },
  ];
  const actions = enumerateLegalActions(game);
  const decision = chooseHeuristicAction(visibleStateFor(game, 0), actions, createAiMemories(4)[0], () => 0.5);
  assert.equal(decision.chosen.cardId, "praise-instead");

  const guitarAction = actions.find((action) => action.cardId === "guitar-repeat" && action.targetId === 1)!;
  const beforeActorJoy = game.players[0].joy;
  const beforeTargetJoy = game.players[1].joy;
  const learned = applyLegalAction(game, guitarAction);
  assert.ok(learned.players[0].items.includes("吉他"));
  assert.ok(!learned.players[1].items.includes("吉他"));
  assert.equal(learned.players[0].joy, beforeActorJoy + 1);
  assert.equal(learned.players[1].joy, beforeTargetJoy + 1);
});

test("AI 按真实牌效评估美妆博主、老男人与职场 Dress Code", () => {
  const beauty = createSimGame(["Beauty", "B", "C", "D"]);
  beauty.active = 0;
  beauty.phase = "play";
  beauty.players[0].goal = "跨女";
  beauty.players[0].identity = "female";
  beauty.players[0].reading = "female";
  beauty.players[0].hand = [{ id: "beauty-choice", name: "美妆博主", kind: "action" }];
  beauty.deck = [
    { id: "beauty-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "beauty-shirt", name: "皱巴巴的格子衬衫", kind: "present", clothing: true },
    { id: "beauty-action", name: "心动夸夸", kind: "action" },
  ];
  const beautyPlay = enumerateLegalActions(beauty).find((action) => action.cardId === "beauty-choice")!;
  const beautyOffer = applyLegalAction(beauty, beautyPlay);
  const beautyDecision = chooseHeuristicAction(visibleStateFor(beautyOffer, 0), enumerateLegalActions(beautyOffer), createAiMemories(4)[0], () => 0.5);
  assert.equal(beautyDecision.chosen.presentId, "beauty-dress");
  assert.equal(beautyDecision.chosen.targetId, 0);

  const oldMan = createSimGame(["Target", "B", "C", "D"]);
  oldMan.active = 0;
  oldMan.phase = "play";
  oldMan.players[0].goal = "跨女";
  oldMan.players[0].identity = "female";
  oldMan.players[0].reading = "female";
  oldMan.players[0].presents = [
    { id: "old-1", name: "长发", kind: "present", checked: true },
    { id: "old-2", name: "美甲", kind: "present", checked: true },
    { id: "old-3", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  oldMan.players[0].hand = [
    { id: "old-self-harm", name: "老男人看了你一眼", kind: "action" },
    { id: "old-praise", name: "心动夸夸", kind: "action" },
  ];
  const oldDecision = chooseHeuristicAction(visibleStateFor(oldMan, 0), enumerateLegalActions(oldMan), createAiMemories(4)[0], () => 0.5);
  const oldSelfCandidate = oldDecision.candidates.find((candidate) => candidate.action.cardId === "old-self-harm" && candidate.action.targetId === 0)!;
  assert.ok(oldSelfCandidate.selfValue < 0, "粉读取且三检定时应识别为损失 Joy，而不是自我 combo");

  const dressCode = createSimGame(["NB", "B", "C", "D"]);
  dressCode.active = 0;
  dressCode.phase = "play";
  dressCode.players[0].goal = "跨女";
  dressCode.players[0].identity = "nonbinary";
  dressCode.players[0].reading = "male";
  dressCode.players[0].joy = 3;
  dressCode.players[0].presents = [
    { id: "dc-1", name: "长发", kind: "present", checked: true },
    { id: "dc-2", name: "美甲", kind: "present", checked: true },
    { id: "dc-3", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  dressCode.players[0].hand = [{ id: "dc-card", name: "职场 Dress Code", kind: "action" }];
  const dressDecision = chooseHeuristicAction(visibleStateFor(dressCode, 0), enumerateLegalActions(dressCode), createAiMemories(4)[0], () => 0.5);
  const dressCandidate = dressDecision.candidates.find((candidate) => candidate.action.cardId === "dc-card")!;
  assert.ok(dressCandidate.selfValue < 0, "非二元蓝读取应看到移除检定或切读取的真实成本");
});

test("AI 会放行帮助对手的她，并拒绝用漫展送走自己的关键呈现", () => {
  const certificate = createSimGame(["Owner", "B", "C", "D"]);
  certificate.active = 0;
  certificate.phase = "play";
  certificate.players[0].goal = "文艺男";
  certificate.players[0].certificateReady = true;
  certificate.players[0].hand = [{ id: "valuable-guitar", name: "学吉他", kind: "action" }];
  certificate.certificateOffer = {
    card: { id: "cert-she", name: "她", kind: "action" },
    playerId: 0,
    resumeAfter: "none",
  };
  const memories = createAiMemories(4);
  memories[0].knownTargets[1] = "跨女";
  memories[0].knownTargets[2] = "跨女";
  memories[0].knownTargets[3] = "跨女";
  const certificateDecision = chooseHeuristicAction(visibleStateFor(certificate, 0), enumerateLegalActions(certificate), memories[0], () => 0.5);
  assert.equal(certificateDecision.chosen.type, "certificate-pass");

  const transCertificate = structuredClone(certificate);
  transCertificate.players[0].goal = "跨女";
  transCertificate.players[0].hand = [{ id: "low-value-swap", name: "程序员", kind: "action" }];
  const transDecision = chooseHeuristicAction(visibleStateFor(transCertificate, 0), enumerateLegalActions(transCertificate), createAiMemories(4)[0], () => 0.5);
  assert.equal(transDecision.chosen.type, "certificate-claim", "跨女应愿意用低价值手牌换取【她】");
  assert.equal(transDecision.chosen.cardId, "low-value-swap");

  const manzhan = createSimGame(["Pink", "B", "C", "D"]);
  manzhan.active = 0;
  manzhan.phase = "play";
  manzhan.players[0].goal = "跨女";
  manzhan.players[0].identity = "female";
  manzhan.players[0].presents = [{ id: "critical-lip", name: "一支商标模糊的口红", kind: "present", checked: true }];
  manzhan.venue = {
    card: { id: "pink-venue-ai", name: "漫展", kind: "venue" }, ownerId: 2, expiresAfterOwnerTurn: 2, abilityUsedBy: [],
    manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {},
  };
  const manzhanDecision = chooseHeuristicAction(visibleStateFor(manzhan, 0), enumerateLegalActions(manzhan), createAiMemories(4)[0], () => 0.5);
  assert.equal(manzhanDecision.chosen.type, "venue-manzhan-pass");
});

test("衣物覆盖按覆盖后的净状态估值，enby 按三切行动的未来白栏潜力估值", () => {
  const clothes = createSimGame(["Demi", "B", "C", "D"]);
  clothes.active = 0;
  clothes.phase = "play";
  clothes.players[0].goal = "demi-girl";
  clothes.players[0].identity = "female";
  clothes.players[0].presents = [
    { id: "old-dress", name: "家里翻到的古老碎花裙", kind: "present", checked: true, dress: true, clothing: true },
    { id: "nails", name: "美甲", kind: "present", checked: true },
    { id: "hair", name: "长发", kind: "present", checked: true },
  ];
  clothes.players[0].hand = [{ id: "replacement-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true }];
  const clothesDecision = chooseHeuristicAction(visibleStateFor(clothes, 0), enumerateLegalActions(clothes), createAiMemories(4)[0], () => 0.5);
  const selfReplacement = clothesDecision.candidates.find((candidate) => candidate.action.cardId === "replacement-dress" && candidate.action.targetId === 0)!;
  assert.ok(selfReplacement.selfValue > 1, "三检定衣物换三检定衣物不应被误判为第四检定");

  const white = createSimGame(["Enby", "B", "C", "D"]);
  white.active = 0;
  white.phase = "play";
  white.players[0].goal = "enby";
  white.players[0].identity = "male";
  white.players[0].whiteEffects = 0;
  white.players[0].hand = [{ id: "white-card", name: "扑朔迷离", kind: "action" }];
  const maleCandidate = chooseHeuristicAction(visibleStateFor(white, 0), enumerateLegalActions(white), createAiMemories(4)[0], () => 0.5).candidates[0];
  white.players[0].identity = "nonbinary";
  const enbyCandidate = chooseHeuristicAction(visibleStateFor(white, 0), enumerateLegalActions(white), createAiMemories(4)[0], () => 0.5).candidates[0];
  assert.ok(enbyCandidate.selfValue > maleCandidate.selfValue + 0.8, "当前非二元时可重视未来白栏潜力，但不能按打出即完成估值");
});

test("公共区拿牌会形成目标猜测，重复观察无关行动不会让静态身份证据漂移", () => {
  const draw = createSimGame(["Observer", "Actor", "C", "D"]);
  draw.active = 1;
  draw.phase = "draw";
  draw.market = [{ id: "public-guitar", name: "学吉他", kind: "action" }];
  const beforeDraw = visibleStateFor(draw, 1);
  const drawAction = enumerateLegalActions(draw).find((action) => action.marketCardId === "public-guitar")!;
  const afterDrawGame = applyLegalAction(draw, drawAction);
  const memories = observePublicAction(createAiMemories(4), beforeDraw, drawAction, visibleStateFor(afterDrawGame, 1));
  assert.ok(memories[0].suspicions[1]["文艺男"] > memories[0].suspicions[1]["跨女"]);
  assert.ok(memories[0].suspicions[1].enby > memories[0].suspicions[1]["跨女"]);

  const praise = createSimGame(["Observer", "Actor", "C", "D"]);
  praise.active = 1;
  praise.phase = "play";
  praise.players[1].identity = "female";
  praise.players[1].reading = "female";
  praise.players[1].hand = [{ id: "neutral-praise", name: "心动夸夸", kind: "action" }];
  const beforePraise = visibleStateFor(praise, 1);
  const praiseAction = enumerateLegalActions(praise).find((action) => action.cardId === "neutral-praise" && action.targetId === 2)!;
  const afterPraise = applyLegalAction(praise, praiseAction);
  const unchanged = observePublicAction(createAiMemories(4), beforePraise, praiseAction, visibleStateFor(afterPraise, 1));
  assert.deepEqual(unchanged[0].suspicions[1], createAiMemories(4)[0].suspicions[1]);
});

test("全女空间下蓝方无牌可摸时直接出牌，连手牌也为空则自动结束回合", () => {
  const withHand = createSimGame(["Blue", "B", "C", "D"]);
  withHand.active = 0;
  withHand.phase = "draw";
  withHand.deck = [];
  withHand.market = [{ id: "blocked-market", name: "心动夸夸", kind: "action" }];
  withHand.players[0].identity = "male";
  withHand.players[0].reading = "male";
  withHand.players[0].hand = [{ id: "existing-hand", name: "心动夸夸", kind: "action" }];
  withHand.venue = { card: { id: "women-only", name: "全女空间！", kind: "venue" }, ownerId: 1, expiresAfterOwnerTurn: 3, abilityUsedBy: [] };
  const skipWithHand = enumerateLegalActions(withHand).find((action) => action.type === "skip-draw")!;
  const readyToPlay = applyLegalAction(withHand, skipWithHand);
  assert.equal(readyToPlay.active, 0);
  assert.equal(readyToPlay.phase, "play");
  assert.ok(enumerateLegalActions(readyToPlay).some((action) => action.cardId === "existing-hand"));

  const emptyHand = structuredClone(withHand);
  emptyHand.players[0].hand = [];
  const skipEmpty = enumerateLegalActions(emptyHand).find((action) => action.type === "skip-draw")!;
  const advanced = applyLegalAction(emptyHand, skipEmpty);
  assert.notEqual(advanced.active, 0);
  assert.notEqual(advanced.phase, "play");
});

test("迷茫由目标玩家选择支付 Joy、弃呈现或跳过下回合", () => {
  const base = createSimGame(["Actor", "B", "Target", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "confusion-choice", name: "迷茫", kind: "action" }];
  base.players[2].joy = 2;
  base.players[2].presents = [{ id: "confusion-nails", name: "美甲", kind: "present", checked: true }];

  const play = enumerateLegalActions(base).find((action) => action.cardId === "confusion-choice" && action.targetId === 2)!;
  const offered = applyLegalAction(base, play);
  assert.equal(decisionPlayerId(offered), 2);
  assert.deepEqual(new Set(enumerateLegalActions(offered).map((action) => action.type)), new Set(["confusion-pay", "confusion-discard", "confusion-skip"]));

  const paid = applyLegalAction(structuredClone(offered), enumerateLegalActions(offered).find((action) => action.type === "confusion-pay")!);
  assert.equal(paid.players[2].joy, 1);
  assert.equal(paid.players[2].presents.length, 1);

  const discarded = applyLegalAction(structuredClone(offered), enumerateLegalActions(offered).find((action) => action.type === "confusion-discard")!);
  assert.equal(discarded.players[2].joy, 2);
  assert.equal(discarded.players[2].presents.length, 0);

  const skipped = applyLegalAction(structuredClone(offered), enumerateLegalActions(offered).find((action) => action.type === "confusion-skip")!);
  assert.equal(skipped.players[2].skip, 1);
  assert.equal(skipped.active, 1);
});

test("三切行动留下的持续状态会在每次检查时只提供加一或减一", () => {
  const base = createSimGame(["White", "Old Man", "Workplace", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].identity = "nonbinary";
  base.players[0].reading = "male";
  base.players[0].joy = 2;
  base.players[0].presents = [
    { id: "white-check-a", name: "美甲", kind: "present", checked: true },
    { id: "white-check-b", name: "长发", kind: "present", checked: true },
    { id: "white-check-c", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  base.players[0].hand = [{ id: "white-flex", name: "扑朔迷离", kind: "action" }];

  let game = applyLegalAction(base, enumerateLegalActions(base).find((action) => action.cardId === "white-flex")!);
  assert.equal(game.players[0].ambiguityCard?.id, "white-flex");

  game.phase = "play";
  game.players[1].hand = [{ id: "old-man-flex", name: "老男人看了你一眼", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "old-man-flex" && action.targetId === 0)!);
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.type === "reading-keep")!);
  assert.equal(game.checkCountPrompt?.checks[0].sourceName, "老男人看了你一眼");
  assert.deepEqual(new Set(enumerateLegalActions(game).map((action) => action.selectedCheckCount)), new Set([2, 4]));
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.type === "check-count-select" && action.checkCountAdjustment === -1)!);
  assert.equal(game.players[0].joy, 1, "实际 3 个检定选择 −1 后，应按 2 个检定承受老男人效果");
  assert.equal(game.players[0].tempIdentity, null);

  game.phase = "play";
  game.players[2].hand = [{ id: "misogyny-flex", name: "厌女症", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "misogyny-flex")!);
  assert.equal(game.checkCountPrompt?.checks[0].sourceName, "厌女症", "下一次检定读取必须再次询问");
  assert.deepEqual(new Set(enumerateLegalActions(game).map((action) => action.checkCountAdjustment)), new Set([-1, 1]));
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.type === "check-count-select" && action.checkCountAdjustment === 1)!);
  assert.equal(game.players[0].joy, 0, "下一次可重新选择 +1，并按 4 个检定参与厌女症比较");
});

test("老男人对自己产生的临时女性身份持续至自己的下回合结束", () => {
  const base = createSimGame(["Self", "B", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].identity = "male";
  base.players[0].presents = [
    { id: "old-self-a", name: "美甲", kind: "present", checked: true },
    { id: "old-self-b", name: "长发", kind: "present", checked: true },
    { id: "old-self-c", name: "一支商标模糊的口红", kind: "present", checked: true },
  ];
  base.players[0].hand = [{ id: "old-self", name: "老男人看了你一眼", kind: "action" }];

  let game = applyLegalAction(base, enumerateLegalActions(base).find((action) => action.cardId === "old-self" && action.targetId === 0)!);
  assert.equal(game.players[0].tempIdentity, "female");
  assert.equal(game.players[0].tempIdentityExpiresAfterTurn, 2);

  for (let index = 1; index <= 3; index += 1) {
    game.phase = "play";
    game.players[index].hand = [{ id: `old-self-pass-${index}`, name: "程序员", kind: "action" }];
    game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === `old-self-pass-${index}`)!);
  }
  assert.equal(game.active, 0);
  assert.equal(game.players[0].tempIdentity, "female", "自己的下回合开始与进行中仍应保持临时女性");

  game.phase = "play";
  game.players[0].hand = [{ id: "old-self-next-turn", name: "程序员", kind: "action" }];
  game = applyLegalAction(game, enumerateLegalActions(game).find((action) => action.cardId === "old-self-next-turn")!);
  assert.equal(game.players[0].tempIdentity, null);
  assert.equal(game.players[0].tempIdentityExpiresAfterTurn, null);
});

test("闺蜜试衣间始终把公共列与牌堆顶三张一起交给出牌者手选", () => {
  const base = createSimGame(["发起者", "闺蜜", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "fitting-room", name: "闺蜜试衣间", kind: "action" }];
  base.players[1].presents = [{ id: "old-shirt", name: "皱巴巴的格子衬衫", kind: "present", clothing: true }];
  base.market = [
    { id: "public-dress", name: "商场专柜里的裙子", kind: "present", checked: true, dress: true, clothing: true },
    { id: "public-hoodie", name: "亲戚给的宽大卫衣", kind: "present", clothing: true },
    { id: "public-action", name: "心动夸夸", kind: "action" },
  ];
  base.deck = [
    { id: "top-a", name: "她", kind: "action" },
    { id: "top-b", name: "美甲", kind: "present", checked: true },
    { id: "top-c", name: "打烊", kind: "action" },
  ];

  const play = enumerateLegalActions(base).find((action) => action.cardId === "fitting-room" && action.targetId === 1)!;
  let game = applyLegalAction(base, play);
  assert.equal(game.fittingRoomOffer?.stage, "select");
  assert.deepEqual(game.fittingRoomOffer?.revealed.map((card) => card.id), ["top-a", "top-b", "top-c"], "即使公共列已有两张呈现，也应展示牌堆顶三张");
  assert.deepEqual(game.deck.map((card) => card.id), []);
  assert.ok(enumerateLegalActions(game).some((action) => action.type === "fitting-room-fizzle"), "即使能凑满两张呈现，也应允许主动选择没买到衣服");

  const select = enumerateLegalActions(game).find((action) => action.type === "fitting-room-select" && action.presentIds?.includes("public-dress") && action.presentIds?.includes("public-hoodie"))!;
  game = applyLegalAction(game, select);
  assert.equal(game.fittingRoomOffer?.stage, "allocate");
  assert.deepEqual(game.market.map((card) => card.id), ["public-action"], "两张呈现先一起移出，尚未补牌");
  assert.deepEqual(game.deck.map((card) => card.id), ["top-a", "top-b", "top-c"], "未选的三张顶牌应按原顺序放回");
  assert.equal(decisionPlayerId(game), 1, "选择两张后应把分配权交给另一名玩家");

  const allocate = enumerateLegalActions(game).find((action) => action.type === "fitting-room-allocate" && action.presentId === "public-dress")!;
  game = applyLegalAction(game, allocate);
  assert.ok(game.players[0].presents.some((card) => card.id === "public-dress"));
  assert.ok(game.players[1].presents.some((card) => card.id === "public-hoodie"));
  assert.ok(!game.players[1].presents.some((card) => card.id === "old-shirt"), "新衣物应正常覆盖旧衣物");
  assert.ok(game.discard.some((card) => card.id === "old-shirt"));
  assert.equal(game.market.length, 3, "双方都打出后才补满公共牌列");
  assert.equal(game.active, 1);
});

test("闺蜜试衣间从公共列与牌堆顶混选时，未选顶牌按原序放回", () => {
  const base = createSimGame(["发起者", "闺蜜", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "fitting-room-peek", name: "闺蜜试衣间", kind: "action" }];
  base.market = [
    { id: "only-public-present", name: "长发", kind: "present", checked: true },
    { id: "public-action-2", name: "心动夸夸", kind: "action" },
    { id: "public-identity", name: "他", kind: "action" },
  ];
  base.deck = [
    { id: "peek-present", name: "美甲", kind: "present", checked: true },
    { id: "peek-action", name: "打烊", kind: "action" },
    { id: "peek-second-present", name: "一支商标模糊的口红", kind: "present", checked: true },
    { id: "below-peek", name: "她", kind: "action" },
  ];

  const play = enumerateLegalActions(base).find((action) => action.cardId === "fitting-room-peek" && action.targetId === 1)!;
  let game = applyLegalAction(base, play);
  assert.deepEqual(game.fittingRoomOffer?.revealed.map((card) => card.id), ["peek-present", "peek-action", "peek-second-present"]);
  assert.deepEqual(game.deck.map((card) => card.id), ["below-peek"], "查看中的顶三张应暂时离开牌堆");

  const select = enumerateLegalActions(game).find((action) => action.type === "fitting-room-select" && action.presentIds?.includes("only-public-present") && action.presentIds?.includes("peek-present"))!;
  game = applyLegalAction(game, select);
  assert.deepEqual(game.market.map((card) => card.id), ["public-action-2", "public-identity"], "分配前不得补公共列");
  assert.deepEqual(game.deck.map((card) => card.id), ["peek-action", "peek-second-present", "below-peek"], "未选顶牌必须保持原相对顺序回到牌堆顶");

  game = applyLegalAction(game, enumerateLegalActions(game)[0]);
  assert.equal(game.market.length, 3);
  assert.equal(game.market[2].id, "peek-action", "结算完成后的补牌应从恢复后的真实牌堆顶进行");
  assert.equal(game.deck[0].id, "peek-second-present");
});

test("闺蜜试衣间顶牌只对出牌者可见，并可直接选择没买到衣服", () => {
  const base = createSimGame(["发起者", "闺蜜", "C", "D"]);
  base.active = 0;
  base.phase = "play";
  base.players[0].hand = [{ id: "private-fitting-room", name: "闺蜜试衣间", kind: "action" }];
  base.market = [
    { id: "market-action-a", name: "心动夸夸", kind: "action" },
    { id: "market-action-b", name: "打烊", kind: "action" },
    { id: "market-identity", name: "他", kind: "action" },
  ];
  base.deck = [
    { id: "private-top-a", name: "她", kind: "action" },
    { id: "private-top-b", name: "真心话大冒险", kind: "action" },
    { id: "private-top-present", name: "美甲", kind: "present", checked: true },
    { id: "private-below", name: "长发", kind: "present", checked: true },
  ];

  const play = enumerateLegalActions(base).find((action) => action.cardId === "private-fitting-room" && action.targetId === 1)!;
  let game = applyLegalAction(base, play);
  assert.deepEqual(visibleStateFor(game, 0).fittingRoomOffer?.revealed.map((card) => card.id), ["private-top-a", "private-top-b", "private-top-present"]);
  assert.deepEqual(visibleStateFor(game, 1).fittingRoomOffer?.revealed, [], "受邀玩家不应看到出牌者查看的顶牌");
  assert.deepEqual(visibleStateFor(game, 2).fittingRoomOffer?.revealed, [], "其他玩家同样不应看到顶牌");
  const fizzle = enumerateLegalActions(game).find((action) => action.type === "fitting-room-fizzle");
  assert.ok(fizzle, "查看后应始终提供明确的没买到衣服动作");

  game = applyLegalAction(game, fizzle!);
  assert.equal(game.fittingRoomOffer, null);
  assert.deepEqual(game.deck.map((card) => card.id).slice(0, 4), ["private-top-a", "private-top-b", "private-top-present", "private-below"]);
  assert.ok(game.events[0].includes("没买到衣服"));
});
