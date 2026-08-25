import {
  enbyScoringSmallItems,
  simCardChecked,
  simCardIsClothing,
  simEffectChecks,
  simHasSkirtOrLipstick,
  simShopOwnerJoy,
  type KnowledgeEvent,
  type SimAction,
  type SimCard,
  type SimGoal,
  type VisibleGame,
  type VisiblePlayer,
} from "./ai-engine";

const GOALS: SimGoal[] = ["文艺男", "男娘", "跨女", "demi-girl", "enby"];

export type Suspicion = Record<SimGoal, number>;
export type AiMemory = {
  observerId: number;
  knownTargets: Record<number, SimGoal | undefined>;
  suspicions: Record<number, Suspicion>;
};

export type CandidateScore = {
  action: SimAction;
  selfValue: number;
  blockingValue: number;
  informationValue: number;
  noise: number;
  total: number;
  reason: string;
};

export type AiDecision = {
  chosen: SimAction;
  candidates: CandidateScore[];
  target: SimGoal;
};

const equalSuspicion = (): Suspicion => ({ 文艺男: 1, 男娘: 1, 跨女: 1, "demi-girl": 1, enby: 1 });

export function createAiMemories(playerCount = 4): AiMemory[] {
  return Array.from({ length: playerCount }, (_, observerId) => ({
    observerId,
    knownTargets: {},
    suspicions: Object.fromEntries(
      Array.from({ length: playerCount }, (_, targetId) => [targetId, equalSuspicion()]),
    ) as Record<number, Suspicion>,
  }));
}

function normalize(suspicion: Suspicion) {
  const total = GOALS.reduce((sum, goal) => sum + Math.max(0.05, suspicion[goal]), 0);
  GOALS.forEach((goal) => { suspicion[goal] = Math.max(0.05, suspicion[goal]) / total; });
}

function add(suspicion: Suspicion, goals: SimGoal[], amount: number) {
  goals.forEach((goal) => { suspicion[goal] += amount; });
  normalize(suspicion);
}

export function applyKnowledgeEvents(memories: AiMemory[], events: KnowledgeEvent[]) {
  const next = structuredClone(memories) as AiMemory[];
  events.forEach((event) => {
    if (event.type === "reveal") {
      next[event.observerId].knownTargets[event.targetId] = event.goal;
      const certain = equalSuspicion();
      GOALS.forEach((goal) => { certain[goal] = goal === event.goal ? 1 : 0.001; });
      normalize(certain);
      next[event.observerId].suspicions[event.targetId] = certain;
      return;
    }
    next.forEach((memory) => {
      const actorKnownBefore = memory.observerId === event.actorId
        ? event.actorGoalBefore
        : memory.knownTargets[event.actorId];
      const targetKnownBefore = memory.observerId === event.targetId
        ? event.targetGoalBefore
        : memory.knownTargets[event.targetId];
      const actorSuspicionBefore = memory.suspicions[event.actorId];
      const targetSuspicionBefore = memory.suspicions[event.targetId];

      memory.suspicions[event.actorId] = targetSuspicionBefore;
      memory.suspicions[event.targetId] = actorSuspicionBefore;

      if (targetKnownBefore) memory.knownTargets[event.actorId] = targetKnownBefore;
      else delete memory.knownTargets[event.actorId];
      if (actorKnownBefore) memory.knownTargets[event.targetId] = actorKnownBefore;
      else delete memory.knownTargets[event.targetId];
    });
  });
  return next;
}

export function observePublicAction(memories: AiMemory[], viewBefore: VisibleGame, action: SimAction, viewAfter: VisibleGame) {
  const next = structuredClone(memories) as AiMemory[];
  const actorId = viewBefore.decisionPlayerId;
  const card = action.type === "play"
    ? viewBefore.selfHand.find((held) => held.id === action.cardId)
    : action.type === "draw-market"
      ? viewBefore.market.find((marketCard) => marketCard.id === action.marketCardId)
      : undefined;
  if (!card) return next;
  next.forEach((memory) => {
    if (memory.observerId === actorId || memory.knownTargets[actorId]) return;
    const suspicion = memory.suspicions[actorId];
    const beforeActor = viewBefore.players[actorId];
    const afterActor = viewAfter.players[actorId];
    const acquiredForSelf = action.type === "draw-market" || action.targetId === actorId;
    if (card.name === "学吉他" || (card.name === "长发" && acquiredForSelf)) add(suspicion, ["文艺男", "enby"], 0.36);
    if (card.kind === "present" && acquiredForSelf && simCardChecked(card)) add(suspicion, ["男娘", "跨女", "demi-girl"], 0.28);
    if (card.name === "开个小证") add(suspicion, ["跨女", "demi-girl", "enby"], 0.34);
    if (["扑朔迷离", "先入为主"].includes(card.name) && acquiredForSelf) add(suspicion, ["enby"], 0.22);
    if (["漫展", "福灵塔"].includes(card.name) && acquiredForSelf) add(suspicion, ["enby"], 0.12);

    // Only score public state changes once. Re-adding permanent identity and check-count
    // evidence after every unrelated play made suspicions drift without new information.
    if (beforeActor.identity !== afterActor.identity) {
      if (afterActor.identity === "female") add(suspicion, ["跨女", "demi-girl"], 0.24);
      if (afterActor.identity === "nonbinary") add(suspicion, ["enby", "demi-girl", "男娘"], 0.18);
    }
    const beforeChecks = beforeActor.presents.filter(simCardChecked).length;
    const afterChecks = afterActor.presents.filter(simCardChecked).length;
    if (beforeChecks < 3 && afterChecks >= 3 && afterActor.identity !== "female") add(suspicion, ["男娘"], 0.24);
    if ((beforeChecks < 2 && afterChecks >= 2) || (beforeChecks > 3 && afterChecks <= 3)) add(suspicion, ["demi-girl"], 0.08);
  });
  return next;
}

function has(player: VisiblePlayer, name: string) {
  return player.presents.some((card) => card.name === name);
}

function checks(player: VisiblePlayer) {
  return player.presents.filter(simCardChecked).length;
}

function effectChecks(player: VisiblePlayer) {
  return simEffectChecks(player);
}

function maximumEffectChecks(player: VisiblePlayer) {
  if (effectiveIdentity(player) === "nonbinary" && player.ambiguityCard) return checks(player) + 1;
  return effectChecks(player);
}

function minimumEffectChecks(player: VisiblePlayer) {
  if (effectiveIdentity(player) === "nonbinary" && player.ambiguityCard) return Math.max(0, checks(player) - 1);
  return effectChecks(player);
}

function effectiveIdentity(player: VisiblePlayer) {
  return player.tempIdentity ?? player.identity;
}

function currentReadingSide(player: VisiblePlayer): "male" | "female" {
  const identity = effectiveIdentity(player);
  return identity === "nonbinary" ? player.reading : identity;
}

function isClothing(card: SimCard) {
  return Boolean(card.clothing || card.dress);
}

function afterGainingPresentation(player: VisiblePlayer, card: SimCard): VisiblePlayer {
  if (player.presents.some((present) => present.name === card.name)) return player;
  const presents = isClothing(card)
    ? [...player.presents.filter((present) => !isClothing(present)), card]
    : [...player.presents, card];
  return { ...player, presents };
}

function afterRemovingPresentation(player: VisiblePlayer, card: SimCard): VisiblePlayer {
  return { ...player, presents: player.presents.filter((present) => present.id !== card.id) };
}

export function goalCompletion(player: VisiblePlayer, goal: SimGoal) {
  const count = checks(player);
  const feminine = simHasSkirtOrLipstick(player);
  if (goal === "文艺男") return (player.identity === "male" ? 1.05 : 0) + (has(player, "长发") ? 2 : 0) + (player.items.includes("吉他") ? 1.2 : 0) - Math.max(0, count - 2) * 1.3;
  if (goal === "男娘") {
    const tierValue = feminine ? (count >= 4 ? 2.5 : count >= 3 ? 2 : count * 0.22) : count * 0.18;
    return (player.identity !== "female" ? 1 : 0) + tierValue + (feminine ? 1.2 : 0);
  }
  if (goal === "跨女") return (player.identity === "female" ? 1.4 : 0) + Math.min(3, count) * 0.65 + (feminine ? 1.1 : 0) + (player.items.includes("小证") ? 1.2 : 0);
  if (goal === "demi-girl") return (player.identity !== "male" ? 1.2 : 0) + (count >= 2 && count <= 3 ? 1.5 : count < 2 ? count * 0.45 : -Math.max(0, count - 3) * 1.5) + (feminine ? 1 : 0) + (player.items.includes("小证") ? 0.5 : 0);
  const smallItemCount = enbyScoringSmallItems(player).length;
  return (player.identity === "nonbinary" ? 1.7 : 0) + smallItemCount * 0.7 + Number(player.whiteEffects > 0) * 1.65 + Math.min(player.joy, 3) * 0.15;
}

function cardAffinity(card: SimCard, goal: SimGoal, self: VisiblePlayer) {
  if (card.kind === "present") {
    const after = afterGainingPresentation(self, card);
    const marginalGoalValue = goalCompletion(after, goal) - goalCompletion(self, goal);
    return 0.75 + marginalGoalValue * 2;
  }
  if (["扑朔迷离", "先入为主"].includes(card.name)) {
    if (self.ambiguityCard) return 0.35;
    if (goal === "enby" && self.whiteEffects === 0) return effectiveIdentity(self) === "nonbinary" ? 2.8 : 1.9;
    return effectiveIdentity(self) === "nonbinary" ? 1.8 : 1.35;
  }
  if (card.name === "程序员") return has(self, "皱巴巴的格子衬衫") ? 3.2 : 0.2;
  if (card.name === "变装皇后") return has(self, "一支商标模糊的口红") && has(self, "美甲") ? 3.2 : 0.2;
  if (card.name === "女装店老板" || card.name === "空间主理人") return 1.45;
  if (card.name === "自由职业者") return self.items.includes("自由职业者") ? 0.2 : 2.3;
  if (card.name === "封心锁爱") return self.items.includes("封心锁爱") ? 0.15 : 1.4;
  if (card.name === "地雷系") return self.items.includes("地雷系") ? 0.15 : 2;
  if (card.name === "改好证了！") {
    const identityFits = goal === "文艺男"
      ? self.identity === "male"
      : goal === "男娘"
        ? self.identity !== "female"
        : goal === "跨女"
          ? self.identity === "female"
          : goal === "demi-girl"
            ? self.identity !== "male"
            : self.identity === "nonbinary";
    return identityFits ? 3 : 0.25;
  }
  if (card.name === "detrans") {
    const history = self.identityHistory ?? [];
    const restored = history.at(-1)?.identity === self.identity ? history.at(-2) : undefined;
    if (!restored || self.items.includes("改好证了！")) return 0.15;
    const after = { ...self, identity: restored.identity, reading: restored.reading };
    return Math.max(0.2, 0.8 + (goalCompletion(after, goal) - goalCompletion(self, goal)) * 1.8);
  }
  if (card.name === "伪娘团") {
    const canReadBlue = currentReadingSide(self) === "male" || (effectiveIdentity(self) === "nonbinary" && self.joy >= 1);
    return canReadBlue && maximumEffectChecks(self) >= 2 ? 3.1 : 0.25;
  }
  if (goal === "文艺男") {
    if (card.name === "学吉他") return self.items.includes("吉他") ? 0.7 : 3.8;
    if (card.name === "他") return self.identity === "male" ? 0.3 : 2.85;
  }
  if (goal === "男娘") {
    if (card.name === "他") return self.identity === "female" ? 2.2 : 0.4;
  }
  if (goal === "跨女") {
    if (card.name === "她") return self.identity === "female" ? 0.35 : 3.9;
    if (card.name === "开个小证") return self.items.includes("小证") ? 0.4 : 3.8;
  }
  if (goal === "demi-girl") {
    if (card.name === "她") return self.identity === "male" ? 1.9 : 0.4;
    if (card.name === "开个小证") return self.items.includes("小证") ? 0.4 : 2.2;
  }
  if (goal === "enby") {
    if (card.name === "学吉他") return self.items.includes("吉他") ? 0.8 : 2.4;
    if (card.name === "开个小证") return self.items.includes("小证") ? 0.8 : 2.4;
    if (card.name === "漫展" && self.whiteEffects === 0) return effectiveIdentity(self) === "nonbinary" ? 5 : 2;
    if (card.name === "福灵塔" && self.whiteEffects === 0) return effectiveIdentity(self) === "nonbinary" ? 2.6 : 1.7;
    if (card.name === "她" || card.name === "他") return self.identity === "nonbinary" ? 0.4 : 1.8;
    if (card.name === "心动夸夸" || card.name === "美妆博主") return 1.5;
  }
  if (card.name === "心动夸夸") return 1.3;
  if (card.kind === "venue") return 1.35;
  if (card.name === "打烊") return 1.2;
  if (card.name === "真心话大冒险") return 1.35;
  if (card.name === "换一种活法") return 0.5;
  return 0.85;
}

function likelyGoal(memory: AiMemory, playerId: number): SimGoal | undefined {
  if (memory.knownTargets[playerId]) return memory.knownTargets[playerId]!;
  const ranked = [...GOALS].sort((a, b) => memory.suspicions[playerId][b] - memory.suspicions[playerId][a]);
  return memory.suspicions[playerId][ranked[0]] - memory.suspicions[playerId][ranked[1]] >= 0.08
    ? ranked[0]
    : undefined;
}

function expectedGoalCompletion(player: VisiblePlayer, memory: AiMemory, playerId: number) {
  const known = memory.knownTargets[playerId];
  if (known) return goalCompletion(player, known);
  return GOALS.reduce((sum, goal) => sum + memory.suspicions[playerId][goal] * goalCompletion(player, goal), 0);
}

function expectedCardAffinity(card: SimCard, player: VisiblePlayer, memory: AiMemory, playerId: number) {
  const known = memory.knownTargets[playerId];
  if (known) return cardAffinity(card, known, player);
  return GOALS.reduce((sum, goal) => sum + memory.suspicions[playerId][goal] * cardAffinity(card, goal, player), 0);
}

function uncertainty(memory: AiMemory, playerId: number) {
  if (memory.knownTargets[playerId]) return 0;
  const values = Object.values(memory.suspicions[playerId]);
  return 1 - (Math.max(...values) - Math.min(...values));
}

function targetThreat(view: VisibleGame, memory: AiMemory, targetId: number) {
  const target = view.players[targetId];
  return expectedGoalCompletion(target, memory, targetId);
}

function targetFrom(action: SimAction, view: VisibleGame) {
  return action.targetId === undefined ? undefined : view.players[action.targetId];
}

function marketCardFrom(action: SimAction, view: VisibleGame) {
  return view.market.find((card) => card.id === action.marketCardId);
}

function fittingRoomCard(view: VisibleGame, id: string) {
  return [...view.market, ...(view.fittingRoomOffer?.revealed ?? []), ...(view.fittingRoomOffer?.selected ?? [])]
    .find((card) => card.id === id);
}

function handCardFrom(action: SimAction, view: VisibleGame) {
  return view.selfHand.find((card) => card.id === action.cardId);
}

function readingEffectValue(view: VisibleGame, player: VisiblePlayer, goal: SimGoal, side: "male" | "female") {
  const prompt = view.readingPrompt!;
  const check = prompt.checks[prompt.index];
  if (check.requiredReading && side !== check.requiredReading) return -20;
  if (check.sourceName === "美妆博主") {
    if (side === "male") return player.joy <= 1 ? 3.4 : 2.3;
    return 1.65;
  }
  if (check.sourceName === "老男人看了你一眼") {
    const count = checks(player);
    if ((side === "male" && count >= 1 && count <= 2) || (side === "female" && count >= 3)) return player.joy <= 1 ? -2.7 : -1.5;
    if (side === "male" && count >= 3) {
      const before = goalCompletion(player, goal);
      const after = goalCompletion({ ...player, identity: "female" }, goal);
      const canLockIdentity = view.selfHand.some((card) => card.name === "身份肯定");
      return Math.max(0, after - before) * (canLockIdentity ? 2.2 : 0.45);
    }
    return 0;
  }
  if (check.sourceName === "你pass吗？") {
    const count = effectChecks(player);
    const temporaryIdentity = side === "male" && count >= 3
      ? "female"
      : side === "female" && count <= 1
        ? "male"
        : undefined;
    if (!temporaryIdentity) return 0.25;
    const before = goalCompletion(player, goal);
    const after = goalCompletion({ ...player, identity: temporaryIdentity, tempIdentity: null }, goal);
    const canAffirm = view.selfHand.some((card) => card.name === "身份肯定");
    return (after - before) * (canAffirm ? 2 : 0.45);
  }
  if (check.sourceName === "职场 Dress Code") {
    if (player.items.includes("自由职业者")) return 0;
    if (side === "male") {
      const unchecked = player.presents.filter((card) => !simCardChecked(card));
      const checked = player.presents.filter(simCardChecked);
      const remaining = player.ambiguityCard?.name === "扑朔迷离" && checked.length > 0
        ? [...unchecked, checked.reduce((best, card) => cardAffinity(card, goal, player) > cardAffinity(best, goal, player) ? card : best)]
        : unchecked;
      return (goalCompletion({ ...player, presents: remaining }, goal) - goalCompletion(player, goal)) * 2.4;
    }
    return maximumEffectChecks(player) < 2 ? (player.joy <= 1 ? -2.7 : -1.5) : 0;
  }
  if (check.sourceName === "伪娘团") return side === "male" ? 3.2 : 0;
  if (check.sourceName === "全女空间！") return side === "female" ? 1.35 : 0;
  return 0;
}

function scoreAction(view: VisibleGame, action: SimAction, memory: AiMemory, random: () => number): CandidateScore {
  const self = view.players[view.decisionPlayerId];
  const goal = self.goal!;
  const target = targetFrom(action, view);
  const source = action.sourcePlayerId === undefined ? undefined : view.players[action.sourcePlayerId];
  const movedPresent = source?.presents.find((present) => present.id === action.presentId);
  const marketCard = marketCardFrom(action, view);
  const beautyPresent = view.beautyOffer?.revealed.find((present) => present.id === action.presentId);
  const card = handCardFrom(action, view);
  let selfValue = 0;
  let blockingValue = 0;
  let informationValue = 0;
  const reasons: string[] = [];

  if (action.type === "draw-blind") {
    selfValue = 1.35;
    reasons.push("公共牌价值一般时保留未知收益");
  }
  if (action.type === "skip-draw") selfValue = 0;
  if (action.type === "beauty-blogger-pass") {
    selfValue = 0.05;
    reasons.push("展示牌中没有值得立即打出的呈现");
  }
  if (action.type === "beauty-blogger-play" && beautyPresent && target) {
    if (target.id === self.id) {
      selfValue = cardAffinity(beautyPresent, goal, self) + 0.7;
      reasons.push("从展示牌中立即获得能推进自身目标的呈现");
    } else {
      const afterTarget = afterGainingPresentation(target, beautyPresent);
      const beforeProgress = expectedGoalCompletion(target, memory, target.id);
      const afterProgress = expectedGoalCompletion(afterTarget, memory, target.id);
      blockingValue = (beforeProgress - afterProgress) * 2;
      selfValue = 0.2;
      reasons.push(afterProgress < beforeProgress ? "把展示牌中的呈现用于破坏对手路线" : "把自己不需要的展示呈现交给其他玩家");
    }
    if (self.crushTargetIds.includes(target.id)) {
      selfValue += self.joy <= 1 ? 2.4 : 1.55;
      reasons.push(`立即把展示呈现打给心动对象 ${target.name}，额外获得 1 Joy`);
    }
  }
  if (action.type === "fitting-room-fizzle") {
    selfValue = 0.35;
    reasons.push("六张牌中没有值得与对方分配的两张呈现");
  }
  if (action.type === "fitting-room-select" && view.fittingRoomOffer && action.presentIds?.length === 2) {
    const pair = action.presentIds.map((id) => fittingRoomCard(view, id)).filter((item): item is SimCard => Boolean(item));
    const recipient = view.players[view.fittingRoomOffer.targetId];
    if (pair.length === 2) {
      const recipientValues = pair.map((present) => expectedCardAffinity(present, recipient, memory, recipient.id));
      const recipientKeepsIndex = recipientValues[0] >= recipientValues[1] ? 0 : 1;
      const actorGets = pair[1 - recipientKeepsIndex];
      const recipientKeeps = pair[recipientKeepsIndex];
      selfValue = cardAffinity(actorGets, goal, self) * 1.8;
      const recipientBefore = expectedGoalCompletion(recipient, memory, recipient.id);
      const recipientAfter = expectedGoalCompletion(afterGainingPresentation(recipient, recipientKeeps), memory, recipient.id);
      blockingValue = (recipientBefore - recipientAfter) * 1.6;
      reasons.push(`预估对方会留下【${recipientKeeps.name}】，自己获得【${actorGets.name}】`);
    }
  }
  if (action.type === "fitting-room-allocate" && view.fittingRoomOffer && action.presentId) {
    const given = view.fittingRoomOffer.selected.find((present) => present.id === action.presentId);
    const kept = view.fittingRoomOffer.selected.find((present) => present.id !== action.presentId);
    const actorPlayer = view.players[view.fittingRoomOffer.actorId];
    if (given && kept) {
      selfValue = cardAffinity(kept, goal, self) * 2;
      const actorBefore = expectedGoalCompletion(actorPlayer, memory, actorPlayer.id);
      const actorAfter = expectedGoalCompletion(afterGainingPresentation(actorPlayer, given), memory, actorPlayer.id);
      blockingValue = (actorBefore - actorAfter) * 1.7;
      reasons.push(`自己留下【${kept.name}】，把【${given.name}】分给对方`);
    }
  }
  if (action.type === "shared-wardrobe-pass") {
    selfValue = 0.15;
    reasons.push("不指定另一张呈现，直接结束结算");
  }
  if (action.type === "shared-wardrobe-select" && movedPresent && source) {
    const selfAfter = afterGainingPresentation(self, movedPresent);
    const sourceAfter = afterRemovingPresentation(source, movedPresent);
    const possibleGain = Math.max(0, goalCompletion(selfAfter, goal) - goalCompletion(self, goal)) * 1.8
      + Math.max(0, cardAffinity(movedPresent, goal, self)) * 0.35;
    const transferPressure = Math.max(0, expectedGoalCompletion(source, memory, source.id) - expectedGoalCompletion(sourceAfter, memory, source.id)) * 1.8
      + possibleGain;
    selfValue = possibleGain * 0.35;
    blockingValue = Math.min(transferPressure, 2.4);
    reasons.push(`指定【${movedPresent.name}】，迫使 ${source.name} 在移交与失去 2 Joy 之间选择`);
  }
  if (action.type === "shared-wardrobe-transfer" && movedPresent && source && target) {
    const sourceAfter = afterRemovingPresentation(source, movedPresent);
    const targetAfter = afterGainingPresentation(target, movedPresent);
    selfValue = (goalCompletion(sourceAfter, goal) - goalCompletion(self, goal)) * 2.2;
    blockingValue = (expectedGoalCompletion(target, memory, target.id) - expectedGoalCompletion(targetAfter, memory, target.id)) * 1.5;
    reasons.push(`比较移交【${movedPresent.name}】造成的路线损失与失去 2 Joy`);
  }
  if (action.type === "shared-wardrobe-lose-joy") {
    selfValue = self.joy <= 2 ? -3.8 : self.joy <= 4 ? -2.8 : -2.2;
    reasons.push("保留被指定的呈现，承担 2 Joy 代价");
  }
  if (action.type === "confusion-pay") {
    selfValue = -(self.joy <= 1 ? 3.2 : self.joy === 2 ? 2.1 : 1.35) - (goal === "enby" ? 0.45 : 0);
    reasons.push("支付 Joy，保住呈现与下回合");
  }
  if (action.type === "confusion-discard" && movedPresent) {
    selfValue = -Math.max(0.4, cardAffinity(movedPresent, goal, self));
    if ((goal === "文艺男" && simCardChecked(movedPresent) && checks(self) > 2)
      || (goal === "demi-girl" && simCardChecked(movedPresent) && checks(self) > 3)) selfValue += 2.2;
    reasons.push("比较这张呈现的目标价值与其他两种代价");
  }
  if (action.type === "confusion-skip") {
    selfValue = -3.8;
    reasons.push("保留 Joy 和呈现，但失去完整下回合");
  }
  if (action.type === "check-count-select") {
    const check = view.checkCountPrompt!.checks[view.checkCountPrompt!.index];
    const count = action.selectedCheckCount ?? checks(self);
    const currentSide = currentReadingSide(self);
    if (check.sourceName === "老男人看了你一眼") {
      if ((currentSide === "male" && count >= 1 && count <= 2) || (currentSide === "female" && count >= 3)) selfValue = -2.5;
      else if (currentSide === "male" && count >= 3) {
        const before = goalCompletion(self, goal);
        const after = goalCompletion({ ...self, identity: "female" }, goal);
        selfValue = (after - before) * 2;
      } else selfValue = 1.2;
    } else if (check.sourceName === "你pass吗？") {
      const temporaryIdentity = currentSide === "male" && count >= 3
        ? "female"
        : currentSide === "female" && count <= 1
          ? "male"
          : undefined;
      if (!temporaryIdentity) selfValue = 0.25;
      else {
        const before = goalCompletion(self, goal);
        const after = goalCompletion({ ...self, identity: temporaryIdentity, tempIdentity: null }, goal);
        const canAffirm = view.selfHand.some((card) => card.name === "身份肯定");
        selfValue = (after - before) * (canAffirm ? 2 : 0.45);
      }
    } else if (check.sourceName === "厌女症") selfValue = -count * 0.8;
    else if (check.sourceName === "职场 Dress Code") {
      selfValue = currentSide === "male" ? -count * 1.4 : count >= 2 ? 1.5 : -2.2;
    } else if (check.sourceName === "空间主理人") {
      const helpsActor = self.id === view.active;
      selfValue = helpsActor && count >= 2 ? 1.35 : 0;
      blockingValue = !helpsActor && count >= 2 ? -1.25 : 0.35;
    } else if (check.sourceName === "伪娘团") {
      selfValue = count >= 2 ? 2.4 : -20;
    } else selfValue = -count * 0.05;
    reasons.push(`为【${check.sourceName}】选择本次读取到的检定数量`);
  }
  if (action.type === "dress-code-preserve" || action.type === "dress-code-discard-all") {
    const preserved = action.type === "dress-code-preserve"
      ? self.presents.find((present) => present.id === action.presentId)
      : undefined;
    const remaining = self.presents.filter((present) => !simCardChecked(present) || present.id === preserved?.id);
    selfValue = (goalCompletion({ ...self, presents: remaining }, goal) - goalCompletion(self, goal)) * 2.4;
    reasons.push(preserved ? `用【扑朔迷离】保留【${preserved.name}】` : "选择不保留检定呈现");
  }
  if (action.type === "reading-keep" || action.type === "reading-switch") {
    const prompt = view.readingPrompt!;
    const check = prompt.checks[prompt.index];
    const side = action.type === "reading-switch" ? (self.reading === "male" ? "female" : "male") : self.reading;
    selfValue = readingEffectValue(view, self, goal, side);
    if (action.type === "reading-switch") {
      const joyCost = self.joy <= 1 ? 3.5 : self.joy === 2 ? 2.5 : self.joy === 3 ? 1.8 : 1.3;
      selfValue -= joyCost + (goal === "enby" ? 0.55 : 0);
      reasons.push(`为【${check.sourceName}】切换读取；比较本次效果收益与 1 Joy 机会成本`);
    } else reasons.push(`保持当前读取结算【${check.sourceName}】`);
  }
  if ((action.type === "truth-allow" || action.type === "truth-resist") && target) {
    const ownProgress = goalCompletion(self, goal);
    const opponentProgress = view.players
      .filter((player) => player.id !== self.id)
      .map((player) => targetThreat(view, memory, player.id));
    const isPublicLeader = ownProgress >= Math.max(...opponentProgress);
    const secrecyRisk = 1.15 + ownProgress * 0.72 + Number(isPublicLeader) * 0.85;

    if (action.type === "truth-allow") {
      selfValue = -secrecyRisk;
      reasons.push(self.joy < 2
        ? "Joy 不足 2，只能公开目标"
        : "保留 Joy 的价值高于隐藏当前目标");
    } else {
      const joyCost = self.joy === 2 ? 5.2 : self.joy === 3 ? 3.8 : self.joy === 4 ? 2.8 : 2.1;
      const enbyJoyPremium = goal === "enby" ? 0.9 : 0;
      selfValue = -(joyCost + enbyJoyPremium);
      informationValue = uncertainty(memory, target.id) * 3 + targetThreat(view, memory, target.id) * 0.2;
      reasons.push(`保护完成度较高的目标，并反查${target.name}；计入 2 Joy 机会成本${goal === "enby" ? "和 enby 储备" : ""}`);
    }
  }
  if (action.type === "venue-convert" && action.venueIdentity) {
    const before = goalCompletion(self, goal);
    const after = goalCompletion({ ...self, identity: action.venueIdentity, reading: action.venueIdentity === "female" ? "female" : "male" }, goal);
    selfValue = (after - before) * 3 + 0.35;
    reasons.push(`使用福灵塔的一次机会转为${action.venueIdentity === "female" ? "女性" : "非二元"}`);
  }
  if (action.type === "venue-exchange-discard" && card) {
    selfValue = 2.4 - cardAffinity(card, goal, self);
    reasons.push("弃掉当前手牌中目标价值较低的一张");
  }
  if (action.type === "venue-manzhan-mode") {
    const presentationCount = view.selfHand.filter((held) => held.kind === "present" && simCardChecked(held)).length;
    const movableCount = view.players.reduce((sum, player) => sum + player.presents.length, 0);
    selfValue = action.venueMode === "blue"
      ? 1.2 + presentationCount * 0.9
      : 1 + movableCount * 0.12;
    if (goal === "enby" && self.whiteEffects === 0) selfValue += 3.3;
    reasons.push(action.venueMode === "blue" ? "手中检定呈现可连续对自己打出并重新拿牌" : "可搬运场上呈现并按原持有者获得 Joy");
  }
  if (action.type === "venue-manzhan-use") {
    let bestMove: { self: number; block: number; total: number } | undefined;
    view.players.forEach((moveSource) => {
      moveSource.presents.forEach((present) => {
        view.players.filter((player) => player.id !== moveSource.id && !player.presents.some((held) => held.name === present.name)).forEach((player) => {
          const sourceAfter = afterRemovingPresentation(moveSource, present);
          const targetAfter = afterGainingPresentation(player, present);
          const ownDelta = moveSource.id === self.id ? goalCompletion(sourceAfter, goal) - goalCompletion(self, goal) : 0;
          const sourceBlock = moveSource.id === self.id ? 0 : expectedGoalCompletion(moveSource, memory, moveSource.id) - expectedGoalCompletion(sourceAfter, memory, moveSource.id);
          const targetDelta = player.id === self.id
            ? goalCompletion(targetAfter, goal) - goalCompletion(self, goal)
            : expectedGoalCompletion(targetAfter, memory, player.id) - expectedGoalCompletion(player, memory, player.id);
          const joyValue = moveSource.id === self.id ? 2 : 1;
          const candidateSelf = joyValue + ownDelta * 2 + (player.id === self.id ? targetDelta * 2 : 0);
          const candidateBlock = sourceBlock * 2 - (player.id === self.id ? 0 : targetDelta * 2);
          const candidate = { self: candidateSelf, block: candidateBlock, total: candidateSelf + candidateBlock * 0.45 };
          if (!bestMove || candidate.total > bestMove.total) bestMove = candidate;
        });
      });
    });
    selfValue = bestMove?.self ?? -10;
    blockingValue = bestMove?.block ?? 0;
    reasons.push(bestMove && bestMove.total > 0.15 ? "存在有净收益的场上呈现搬运" : "当前没有值得移动的呈现");
  }
  if (action.type === "venue-manzhan-pass") {
    selfValue = 0.1;
    reasons.push("保留当前呈现布局");
  }
  if (action.type === "venue-manzhan-move" && target && movedPresent) {
    const sourcePlayer = source!;
    const afterSource = afterRemovingPresentation(sourcePlayer, movedPresent);
    const afterTarget = afterGainingPresentation(target, movedPresent);
    const ownDelta = sourcePlayer.id === self.id ? goalCompletion(afterSource, goal) - goalCompletion(self, goal) : 0;
    const selfReceiveDelta = target.id === self.id ? goalCompletion(afterTarget, goal) - goalCompletion(self, goal) : 0;
    const sourceBlock = sourcePlayer.id === self.id ? 0 : expectedGoalCompletion(sourcePlayer, memory, sourcePlayer.id) - expectedGoalCompletion(afterSource, memory, sourcePlayer.id);
    const targetDelta = target.id === self.id ? 0 : expectedGoalCompletion(afterTarget, memory, target.id) - expectedGoalCompletion(target, memory, target.id);
    const targetGoal = likelyGoal(memory, target.id);
    selfValue = (sourcePlayer.id === self.id ? 2 : 1) + ownDelta * 2 + selfReceiveDelta * 2;
    blockingValue = sourceBlock * 2 - targetDelta * 2;
    reasons.push(targetDelta < 0
      ? `把呈现移给${targetGoal ? `疑似${targetGoal}的` : "可能被破坏路线的"}玩家并获得 Joy`
      : `搬运${sourcePlayer.name}的呈现，并计入原持有者 Joy 与双方目标变化`);
  }
  if (action.type === "draw-market" && marketCard) {
    selfValue = cardAffinity(marketCard, goal, self);
    const bestOpponentNeed = view.players.filter((player) => player.id !== self.id).reduce((best, player) => {
      const need = expectedCardAffinity(marketCard, player, memory, player.id) * Math.max(0.45, targetThreat(view, memory, player.id) / 5);
      return Math.max(best, need);
    }, 0);
    blockingValue = Math.max(0, bestOpponentNeed - selfValue * 0.35);
    reasons.push(selfValue >= 2.5 ? "直接推进自己的目标" : blockingValue >= 1.5 ? "抢走对手明显需要的公共资源" : "补充可用手牌");
  }

  if (action.type === "certificate-pass") {
    selfValue = 0.65;
    const she = { id: "certificate-she", name: "她", kind: "action" as const };
    const bestOpponentNeed = view.players.filter((player) => player.id !== self.id)
      .reduce((best, player) => Math.max(best, expectedCardAffinity(she, player, memory, player.id)), 0);
    blockingValue = -bestOpponentNeed * 0.45;
    reasons.push("放行这张【她】，并保留小证的截获能力等待之后使用");
  }
  if (action.type === "certificate-claim") {
    const discarded = view.selfHand.find((card) => card.id === action.cardId);
    const she = { id: "certificate-she", name: "她", kind: "action" as const };
    const gainedValue = cardAffinity(she, goal, self);
    const discardedValue = discarded ? cardAffinity(discarded, goal, self) : 4;
    selfValue = gainedValue - discardedValue - 0.25;
    const bestOpponentNeed = view.players.filter((player) => player.id !== self.id)
      .reduce((best, player) => Math.max(best, expectedCardAffinity(she, player, memory, player.id)), 0);
    blockingValue = bestOpponentNeed * 0.55;
    reasons.push(discarded
      ? `弃【${discarded.name}】换取【她】；比较新手牌价值与被弃手牌价值`
      : "没有可用于替换的手牌");
  }

  if (action.type === "play" && card) {
    if (card.kind === "present") {
      if (target?.id === self.id) {
        selfValue = cardAffinity(card, goal, self) + 0.7;
        reasons.push("把呈现留给自己以推进目标");
        const identity = effectiveIdentity(self);
        const manzhanMode = identity === "male"
          ? "blue"
          : identity === "nonbinary"
            ? view.venue?.manzhanWhiteModes?.[self.id]
            : undefined;
        if (view.venue?.card.name === "漫展" && manzhanMode === "blue" && simCardChecked(card)) {
          selfValue += 1.8;
          reasons.push("触发漫展蓝色：本张不占正常出牌，重新拿牌后仍可继续连锁");
        }
      } else if (target) {
        const opponentGoal = likelyGoal(memory, target.id);
        const afterTarget = afterGainingPresentation(target, card);
        const beforeProgress = expectedGoalCompletion(target, memory, target.id);
        const afterProgress = expectedGoalCompletion(afterTarget, memory, target.id);
        const targetDelta = afterProgress - beforeProgress;
        blockingValue = -targetDelta * 2;
        selfValue = 0.25;
        reasons.push(targetDelta < 0
          ? `${opponentGoal ? `疑似${opponentGoal}，` : ""}呈现覆盖或检定变化会实际破坏路线`
          : "自己不需要，但会计入送牌对对方的实际帮助");
      }
    } else {
      selfValue = cardAffinity(card, goal, self) * 0.55;
      if (["扑朔迷离", "先入为主"].includes(card.name) && goal === "enby" && self.whiteEffects === 0 && effectiveIdentity(self) === "nonbinary") {
        selfValue += 0.6;
        reasons.push("建立白栏潜力；需等牌效实际检查检定并选择 ±1 后才完成白效计分项");
      }
      if (card.name === "心动夸夸" && target) {
        const reusableTargetedCards = view.selfHand.filter((held) => held.id !== card.id && (held.kind === "present" || ["她", "他", "理发", "卸甲", "迷茫", "老男人看了你一眼", "你pass吗？"].includes(held.name))).length;
        const alreadyMarked = self.crushTargetIds.includes(target.id);
        selfValue += 0.45 + Math.min(1.2, reusableTargetedCards * 0.3) + targetThreat(view, memory, target.id) * 0.12 + (alreadyMarked ? -0.15 : 0.3);
        blockingValue -= target.joy <= 1 ? 1.15 : 0.75;
        reasons.push(alreadyMarked ? "重复夸夸仍给予 Joy，但不会增加新的心动对象" : "新增一个可在后续互动中获得 Joy 的心动对象");
      }
      const identityActionName = card.name === "她" || card.name === "他" ? card.name : undefined;
      if (identityActionName && target) {
        const intended = identityActionName === "她" ? "female" : "male";
        if (target.items.includes("改好证了！")) {
          selfValue -= 1.4;
          reasons.push("目标已经改好证，长期身份不会改变");
        } else if (target.id === self.id) {
          const before = goalCompletion(self, goal);
          const after = goalCompletion({ ...self, identity: intended }, goal);
          selfValue += (after - before) * 2.2;
          reasons.push("把自己推向目标需要的终局身份");
        } else {
          const opponentGoal = likelyGoal(memory, target.id);
          const before = expectedGoalCompletion(target, memory, target.id);
          const after = expectedGoalCompletion({ ...target, identity: intended }, memory, target.id);
          blockingValue += (before - after) * 2.1;
          reasons.push(`按${opponentGoal ? `疑似${opponentGoal}` : "多目标推断"}判断身份改变是否真的构成干扰`);
        }
      }
      if (card.name === "理发" && target) {
        const removed = target.presents.find((present) => present.name === "长发");
        if (removed) {
          const after = afterRemovingPresentation(target, removed);
          if (target.id === self.id) selfValue += (goalCompletion(after, goal) - goalCompletion(self, goal)) * 2.2;
          else blockingValue += (expectedGoalCompletion(target, memory, target.id) - expectedGoalCompletion(after, memory, target.id)) * 2.2;
        }
        reasons.push("按移除长发前后的真实目标完成度估值");
      }
      if (card.name === "卸甲" && target) {
        const removed = target.presents.find((present) => present.name === "美甲");
        if (removed) {
          const after = afterRemovingPresentation(target, removed);
          if (target.id === self.id) selfValue += (goalCompletion(after, goal) - goalCompletion(self, goal)) * 2.2;
          else blockingValue += (expectedGoalCompletion(target, memory, target.id) - expectedGoalCompletion(after, memory, target.id)) * 2.2;
        }
        reasons.push("按移除美甲前后的真实目标完成度估值");
      }
      if (card.name === "共享衣橱" && source && target && movedPresent) {
        const sourceAfter = afterRemovingPresentation(source, movedPresent);
        const destination = action.destinationPlayerId === undefined ? target : view.players[action.destinationPlayerId];
        const destinationAfter = afterGainingPresentation(destination, movedPresent);
        if (source.id === self.id) selfValue += (goalCompletion(sourceAfter, goal) - goalCompletion(self, goal)) * 2;
        else blockingValue += (expectedGoalCompletion(source, memory, source.id) - expectedGoalCompletion(sourceAfter, memory, source.id)) * 2;
        if (destination.id === self.id) selfValue += (goalCompletion(destinationAfter, goal) - goalCompletion(self, goal)) * 2;
        else blockingValue += (expectedGoalCompletion(destination, memory, destination.id) - expectedGoalCompletion(destinationAfter, memory, destination.id)) * 2;
        reasons.push("先从对方处取得呈现，并估算其随后指定己方呈现的风险");
      }
      if (card.name === "打烊" && marketCard) {
        blockingValue += view.players.filter((player) => player.id !== self.id).reduce((best, player) => Math.max(best, expectedCardAffinity(marketCard, player, memory, player.id)), 0);
        reasons.push("清除对手可能争夺的公共牌");
      }
      if (card.name === "爱美之心" && marketCard) {
        selfValue += cardAffinity(marketCard, goal, self) * 0.8;
        reasons.push("立即兑现公共牌价值");
      }
      if (card.name === "闺蜜试衣间" && target) {
        const publicPresents = view.market.filter((present) => present.kind === "present");
        const bestVisible = [...publicPresents]
          .sort((a, b) => cardAffinity(b, goal, self) - cardAffinity(a, goal, self))
          .slice(0, 2);
        selfValue += bestVisible.reduce((sum, present) => sum + cardAffinity(present, goal, self), publicPresents.length >= 2 ? 0.5 : 1.25) * 0.45;
        const targetNeed = bestVisible.reduce((sum, present) => sum + expectedCardAffinity(present, target, memory, target.id), 0);
        blockingValue -= targetNeed * 0.15;
        reasons.push(publicPresents.length >= 2 ? "从公共呈现中挑两张，再预留对方分牌空间" : "公共呈现不足，利用顶牌三张补充选择");
      }
      if (card.name === "翻箱倒柜") {
        const bestMarket = view.market.reduce((best, item) => Math.max(best, cardAffinity(item, goal, self)), 0);
        selfValue += bestMarket < 1.4 ? 1.8 : -0.6;
        reasons.push(bestMarket < 1.4 ? "公共牌价值偏低，刷新牌列" : "当前公共牌仍有可用资源");
      }
      if (card.name === "试用代词") {
        selfValue += self.joy <= 1 ? 2.8 : 1.7;
        if (goal === "enby" || self.identity === "male" && ["跨女", "demi-girl"].includes(goal)) selfValue += 0.7;
        reasons.push("获得 Joy，并尝试临时身份路线");
      }
      if (card.name === "程序员") {
        const succeeds = has(self, "皱巴巴的格子衬衫");
        selfValue += succeeds ? 3 : -1.1;
        reasons.push(succeeds ? "格子衬衫满足条件，立即获得 2 Joy" : "没有格子衬衫，牌效为空");
      }
      if (card.name === "变装皇后") {
        const succeeds = has(self, "一支商标模糊的口红") && has(self, "美甲");
        selfValue += succeeds ? 3 : -1.1;
        reasons.push(succeeds ? "口红与美甲同时在场，立即获得 2 Joy" : "口红与美甲条件尚未同时满足");
      }
      if (card.name === "女装店老板") {
        const clothingKinds = new Set(view.players.flatMap((player) => player.presents.filter(simCardIsClothing).map((present) => present.name))).size;
        const gain = simShopOwnerJoy(clothingKinds, view.rules);
        selfValue += gain * 1.35 - (gain === 0 ? 1 : 0);
        reasons.push(`场上有 ${clothingKinds} 种服装，本牌获得 ${gain} Joy`);
      }
      if (card.name === "空间主理人") {
        const qualified = view.players.filter((player) => (
          player.id === self.id ? maximumEffectChecks(player) : minimumEffectChecks(player)
        ) >= 2).length;
        selfValue += qualified * 1.35 - (qualified === 0 ? 1 : 0);
        reasons.push(`按当前检定修正，预计有 ${qualified} 名玩家达到至少 2 个检定`);
      }
      if (card.name === "伪娘团" && target) {
        selfValue += 3;
        blockingValue -= 1.2;
        reasons.push(`与同样满足条件的 ${target.name} 各获得 2 Joy`);
      }
      if (card.name === "自由职业者") {
        const vulnerableChecks = currentReadingSide(self) === "male" ? checks(self) : Number(checks(self) < 2);
        selfValue += 1.4 + (!view.dei ? Math.min(2.2, vulnerableChecks * 0.65) : 0);
        reasons.push("获得 1 Joy，并永久免疫两张职场牌");
      }
      if (card.name === "封心锁爱") {
        const givers = view.players.filter((player) => player.crushTargetIds.includes(self.id));
        const reflectedLoss = givers.reduce((sum, giver) => sum + Math.min(2, giver.joy), 0);
        selfValue += givers.length > 0 ? 2.1 : 1.15;
        blockingValue += reflectedLoss * 0.8;
        reasons.push(givers.length > 0
          ? `清除 ${givers.length} 枚心动标记并反噬发起者，共使其失去 ${reflectedLoss} Joy`
          : "提前获得心动标记免疫");
      }
      if (card.name === "地雷系") {
        selfValue += 1.45 + targetThreat(view, memory, self.id) * 0.12;
        reasons.push("留场后，其他玩家每次对自己用牌都会失去 1 Joy");
      }
      if (card.name === "改好证了！") {
        const identityFits = goal === "文艺男"
          ? self.identity === "male"
          : goal === "男娘"
            ? self.identity !== "female"
            : goal === "跨女"
              ? self.identity === "female"
              : goal === "demi-girl"
                ? self.identity !== "male"
                : self.identity === "nonbinary";
        selfValue += identityFits ? 3.1 : -2;
        reasons.push(identityFits ? "当前长期身份符合目标，锁定并获得 1 Joy" : "当前长期身份不符合目标，避免提前锁死");
      }
      if (card.name === "迷茫" && target) {
        blockingValue += targetThreat(view, memory, target.id) * 0.85;
        reasons.push("攻击当前公开完成度较高的玩家");
      }
      if (card.name === "换一种活法" && target) {
        const own = goalCompletion(self, goal);
        selfValue += own < 2.2 ? 4.2 : own >= 4.5 ? -4.5 : -0.8;
        blockingValue += targetThreat(view, memory, target.id) * 0.35;
        reasons.push(own < 2.2 ? "当前路线落后，用高波动换目标" : "当前目标已接近完成，不宜交换");
      }
      if (card.name === "detrans") {
        const history = self.identityHistory ?? [];
        const restored = history.at(-1)?.identity === self.identity ? history.at(-2) : undefined;
        if (restored && !self.items.includes("改好证了！")) {
          const after = { ...self, identity: restored.identity, reading: restored.reading };
          const delta = goalCompletion(after, goal) - goalCompletion(self, goal);
          selfValue += delta * 3;
          reasons.push(delta >= 0
            ? `撤回最上层长期身份，恢复更适合目标的${restored.identity === "male" ? "男性" : restored.identity === "female" ? "女性" : `非二元（${restored.reading === "male" ? "蓝" : "粉"}读取）`}`
            : "恢复上一层长期身份会偏离当前目标路线");
        }
      }
      if (card.name === "真心话大冒险" && target) {
        const targetProgress = targetThreat(view, memory, target.id);
        const resistanceChance = target.joy < 2
          ? 0
          : Math.min(0.92, (target.joy === 2 ? 0.12 : target.joy === 3 ? 0.42 : target.joy === 4 ? 0.66 : 0.8) + Math.max(0, targetProgress - 3) * 0.06);
        const rawInformation = uncertainty(memory, target.id) * 3 + targetProgress * 0.25;
        informationValue += rawInformation * (1 - resistanceChance);
        selfValue -= resistanceChance * (0.55 + goalCompletion(self, goal) * 0.22);
        reasons.push(resistanceChance >= 0.55
          ? "目标有足够 Joy 且较可能反制，折损情报收益并计入反向泄露风险"
          : "查看领先或难判断玩家的目标");
      }
      if (card.name === "学吉他") {
        const learnsNewGuitar = !self.items.includes("吉他");
        selfValue += goal === "文艺男" ? (learnsNewGuitar ? 3.5 : 0.6) : goal === "enby" ? (learnsNewGuitar ? 2.2 : 0.6) : 1.1;
        reasons.push(learnsNewGuitar
          ? (goal === "文艺男" ? "自己必定学会吉他；所选目标仅获得 Joy" : "自己获得新物件，所选目标获得 Joy")
          : "已有吉他时不重复计算目标分；这次主要按双方 Joy 估值");
      }
      if (card.name === "开个小证") {
        const gainsNewCertificate = !self.items.includes("小证");
        selfValue += goal === "跨女" ? (gainsNewCertificate ? 3.6 : 0.45) : goal === "demi-girl" ? (gainsNewCertificate ? 2.4 : 0.4) : goal === "enby" ? (gainsNewCertificate ? 2.2 : 0.4) : 0.5;
        reasons.push("按目标评估小证物件");
      }
      if (card.name === "身份肯定" && target?.tempIdentity) {
        const affirmed = target.tempIdentity;
        if (target.id === self.id) {
          const after = goalCompletion({ ...self, identity: affirmed, tempIdentity: null }, goal);
          selfValue += (after - goalCompletion(self, goal)) * 3;
        } else {
          const before = expectedGoalCompletion(target, memory, target.id);
          const after = expectedGoalCompletion({ ...target, identity: affirmed, tempIdentity: null }, memory, target.id);
          blockingValue += (before - after) * 2.4;
        }
        reasons.push(target.id === self.id ? "把有利的临时身份固定为自己的长期身份" : "判断固定对方临时身份是否会破坏其目标路线");
      }
      if (card.name === "你pass吗？" && target) {
        const side = currentReadingSide(target);
        const count = effectChecks(target);
        const temporaryIdentity = side === "male" && count >= 3
          ? "female"
          : side === "female" && count <= 1
            ? "male"
            : undefined;
        if (!temporaryIdentity) selfValue -= 1.2;
        else if (target.id === self.id) {
          const before = goalCompletion(self, goal);
          const after = goalCompletion({ ...self, identity: temporaryIdentity, tempIdentity: null }, goal);
          const canAffirm = view.selfHand.some((held) => held.name === "身份肯定");
          selfValue += (after - before) * (canAffirm ? 2.1 : 0.5) + 0.35;
        } else {
          const before = expectedGoalCompletion(target, memory, target.id);
          const after = expectedGoalCompletion({ ...target, identity: temporaryIdentity, tempIdentity: null }, memory, target.id);
          blockingValue += (before - after) * 0.75;
        }
        reasons.push(temporaryIdentity ? `按目标当前${side === "male" ? "蓝" : "粉"}读取制造临时${temporaryIdentity === "female" ? "女性" : "男性"}身份` : "目标当前读取与检定数不满足牌效，避免空打");
      }
      if (card.name === "美妆博主") {
        const beautyValue = (side: "male" | "female") => side === "male"
          ? (self.joy <= 1 ? 3.4 : 2.2)
          : 1.65;
        const currentSide = currentReadingSide(self);
        const actionSide = action.requiredReading ?? currentSide;
        let chosenValue = beautyValue(actionSide);
        if (effectiveIdentity(self) === "nonbinary" && actionSide !== currentSide) {
          const switchCost = self.joy <= 1 ? 3.5 : self.joy === 2 ? 2.5 : self.joy === 3 ? 1.8 : 1.3;
          chosenValue -= switchCost + (goal === "enby" ? 0.55 : 0);
        }
        selfValue += chosenValue;
        reasons.push(actionSide === "male" ? "按蓝栏 +2 Joy 的实际收益估值" : "按粉栏展示三张并择一打出的期望收益估值");
      }
      if (card.name === "老男人看了你一眼" && target) {
        const side = currentReadingSide(target);
        const count = effectChecks(target);
        const losesJoy = (side === "male" && count >= 1 && count <= 2) || (side === "female" && count >= 3);
        const joyLoss = target.joy <= 1 ? 2.7 : 1.5;
        if (target.id === self.id) {
          if (losesJoy) selfValue -= joyLoss;
          else if (side === "male" && count >= 3) {
            const identityDelta = goalCompletion({ ...self, identity: "female" }, goal) - goalCompletion(self, goal);
            const canLockIdentity = view.selfHand.some((held) => held.name === "身份肯定");
            selfValue += Math.max(0, identityDelta) * (canLockIdentity ? 2.2 : 0.45);
          }
        } else {
          if (losesJoy) blockingValue += joyLoss;
          else if (side === "male" && count >= 3) {
            const before = expectedGoalCompletion(target, memory, target.id);
            const after = expectedGoalCompletion({ ...target, identity: "female" }, memory, target.id);
            blockingValue += (before - after) * 0.45;
          }
        }
        reasons.push(target.id === self.id ? "按当前读取、检定数与真实 Joy 损失评估对自己使用" : "按目标当前读取造成的 Joy / 临时身份变化估值");
      }
      if (["厌女症", "职场 Dress Code"].includes(card.name)) {
        if (card.name === "厌女症") {
          const maxChecks = Math.max(...view.players.map(effectChecks));
          const selfRisk = Number(effectChecks(self) === maxChecks);
          const opponentRisk = view.players.filter((player) => player.id !== self.id).reduce((sum, player) => sum + Number(effectChecks(player) === maxChecks), 0);
          blockingValue += opponentRisk * 0.9;
          selfValue -= selfRisk * 1.4;
        } else {
          const dressCodeEffect = (player: VisiblePlayer, own: boolean, side: "male" | "female") => {
            if (player.items.includes("自由职业者")) return 0;
            if (side === "female") return maximumEffectChecks(player) < 2 ? -(player.joy <= 1 ? 2.7 : 1.5) : 0;
            const unchecked = player.presents.filter((present) => !simCardChecked(present));
            const checked = player.presents.filter(simCardChecked);
            const scoreState = (presents: SimCard[]) => own
              ? goalCompletion({ ...player, presents }, goal)
              : expectedGoalCompletion({ ...player, presents }, memory, player.id);
            const afterPresents = player.ambiguityCard?.name === "扑朔迷离" && checked.length > 0
              ? checked.map((kept) => [...unchecked, kept]).reduce((best, candidate) => scoreState(candidate) > scoreState(best) ? candidate : best)
              : unchecked;
            const after = { ...player, presents: afterPresents };
            return own
              ? (goalCompletion(after, goal) - goalCompletion(player, goal)) * 2.4
              : (expectedGoalCompletion(after, memory, player.id) - expectedGoalCompletion(player, memory, player.id)) * 2.4;
          };
          const rationalEffect = (player: VisiblePlayer, own: boolean) => {
            const side = currentReadingSide(player);
            let value = dressCodeEffect(player, own, side);
            if (effectiveIdentity(player) === "nonbinary" && player.joy >= 1) {
              const alternate = side === "male" ? "female" : "male";
              const switchCost = player.joy <= 1 ? 3.5 : player.joy === 2 ? 2.5 : player.joy === 3 ? 1.8 : 1.3;
              value = Math.max(value, dressCodeEffect(player, own, alternate) - switchCost);
            }
            return value;
          };
          selfValue += rationalEffect(self, true);
          blockingValue += view.players.filter((player) => player.id !== self.id).reduce((sum, player) => sum - rationalEffect(player, false), 0);
        }
        reasons.push("群体牌只在对手总损失明显更高时使用");
      }
      if (card.name === "职场 DEI") {
        const gain = view.players.filter((player) => !player.items.includes("自由职业者")).length;
        selfValue += self.items.includes("自由职业者") ? 0.3 : 1.4;
        blockingValue -= Math.max(0, gain - (self.items.includes("自由职业者") ? 0 : 1)) * 0.3;
        reasons.push("自由职业者不获得本次 Joy；其余玩家各获得 1 Joy");
      }
      if (card.name !== "心动夸夸" && target && self.crushTargetIds.includes(target.id)) {
        selfValue += self.joy <= 1 ? 2.4 : 1.55;
        reasons.push(`对心动对象 ${target.name} 使用牌，额外获得 1 Joy`);
      }
    }
  }

  if (target && target.id !== self.id && target.items.includes("地雷系")
    && (action.type === "play" || action.type === "beauty-blogger-play")) {
    selfValue -= self.joy <= 1 ? 2.7 : 1.5;
    reasons.push(`对 ${target.name} 用牌会触发【地雷系】，自己失去 1 Joy`);
  }

  const noise = (random() - 0.5) * 0.24;
  const total = selfValue + 0.45 * blockingValue + 0.35 * informationValue + noise;
  return { action, selfValue, blockingValue, informationValue, noise, total, reason: reasons.slice(0, 3).join("；") || "合法且有基础价值" };
}

export function chooseHeuristicAction(view: VisibleGame, actions: SimAction[], memory: AiMemory, random = Math.random): AiDecision {
  const candidates = actions.map((action) => scoreAction(view, action, memory, random)).sort((a, b) => b.total - a.total);
  if (candidates.length === 0) throw new Error(`AI ${view.decisionPlayerId} 在 ${view.phase} 阶段没有合法动作`);
  return { chosen: candidates[0].action, candidates, target: view.players[view.decisionPlayerId].goal! };
}

export function formatDecisionLog(name: string, decision: AiDecision) {
  const top = decision.candidates.slice(0, 3).map((candidate, index) =>
    `${index + 1}. ${candidate.action.label}  ${candidate.total.toFixed(2)}\n   self ${candidate.selfValue >= 0 ? "+" : ""}${candidate.selfValue.toFixed(2)} / block ${candidate.blockingValue >= 0 ? "+" : ""}${candidate.blockingValue.toFixed(2)} / info ${candidate.informationValue >= 0 ? "+" : ""}${candidate.informationValue.toFixed(2)}\n   ${candidate.reason}`,
  ).join("\n");
  return `AI ${name}\ntarget = ${decision.target}\ntop candidates:\n${top}\n\nchosen: ${decision.chosen.label}`;
}
