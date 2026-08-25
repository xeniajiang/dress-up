export type SimIdentity = "male" | "female" | "nonbinary";
export type SimSide = "male" | "female";
export type SimPhase = "draw" | "play" | "ended";

export type SimGoal = "文艺男" | "男娘" | "跨女" | "demi-girl" | "enby";
export type ShopOwnerScoring = "capped" | "three-four-tier" | "three-four-tier-2-4";
export type SimRuleOverrides = { shopOwnerCap?: number; shopOwnerScoring?: ShopOwnerScoring };

export type SimCard = {
  id: string;
  name: string;
  kind: "present" | "action" | "venue";
  checked?: boolean;
  dress?: boolean;
  clothing?: boolean;
  freshUntilTurnSerial?: number;
  checkOverride?: boolean;
  checkOverrideExpiresAfterTurn?: number;
  checkAnimationVersion?: number;
  checkAnimationKind?: "checked" | "unchecked";
};

export type SimScoreSource = {
  cardName: string;
  joy: number;
};

export type SimIdentityLayer = {
  identity: SimIdentity;
  reading: SimSide;
};

export type SimPlayer = {
  id: number;
  name: string;
  goal: SimGoal;
  identity: SimIdentity;
  reading: SimSide;
  identityHistory: SimIdentityLayer[];
  tempIdentity: SimIdentity | null;
  tempIdentityExpiresAfterTurn: number | null;
  ambiguityCard: SimCard | null;
  joy: number;
  hand: SimCard[];
  presents: SimCard[];
  removedPresents: Array<{ card: SimCard; untilTurnSerial: number }>;
  items: string[];
  scoreSources: SimScoreSource[];
  crushTargetId: number | null;
  skip: number;
  turns: number;
  whiteEffects: number;
  certificateReady: boolean;
  joyLossVersion: number;
  lastJoyLoss: number;
};

export type SimGame = {
  rules?: { shopOwnerCap: number; shopOwnerScoring: ShopOwnerScoring };
  players: SimPlayer[];
  deck: SimCard[];
  market: SimCard[];
  discard: SimCard[];
  active: number;
  phase: SimPhase;
  round: number;
  venue: {
    card: SimCard;
    ownerId: number;
    expiresAfterOwnerTurn: number;
    abilityUsedBy: number[];
    manzhanWhiteModes?: Record<number, "blue" | "pink">;
    manzhanWhiteModeTurns?: Record<number, number>;
    manzhanPinkHandledTurns?: Record<number, number>;
  } | null;
  dei: boolean;
  locks: Record<string, number>;
  finishing: boolean;
  turnSerial: number;
  events: string[];
  warnings: string[];
  certificateOffer: {
    card: SimCard;
    playerId: number;
    resumeAfter: "none" | "forced-play" | "advance-turn" | "fitting-room-fulingta";
    resumeActorId?: number;
    resumeTargetId?: number;
  } | null;
  truthOffer: { actorId: number; targetId: number; resumeAfter: "none" | "advance-turn" } | null;
  confusionOffer: { actorId: number; targetId: number; resumeAfter: "none" | "advance-turn" } | null;
  beautyOffer: { playerId: number; revealed: SimCard[] } | null;
  fittingRoomOffer: {
    actorId: number;
    targetId: number;
    stage: "select" | "allocate";
    revealed: SimCard[];
    selected: SimCard[];
  } | null;
  forcedPlay: { card: SimCard; playerId: number; source: "爱美之心" } | null;
  venueExchange: { playerIds: number[]; index: number; stage: "discard"; discardRemaining: number } | null;
  manzhanOpeningChoice: { playerIds: number[]; index: number } | null;
  manzhanPinkPrompt: { playerId: number } | null;
  readingPrompt: {
    checks: Array<{ playerId: number; sourceName: string; requiredReading?: SimSide }>;
    index: number;
    pendingAction: SimAction;
  } | null;
  checkCountPrompt: {
    checks: Array<{ playerId: number; sourceName: string; min?: number }>;
    index: number;
    pendingAction: SimAction;
    declaredCounts: Record<number, number>;
  } | null;
  dressCodeOffer: { actorId: number; playerIds: number[]; index: number } | null;
};

export type SimAction = {
  id: string;
  type: "draw-blind" | "draw-market" | "skip-draw" | "play" | "certificate-claim" | "certificate-pass" | "truth-allow" | "truth-resist" | "confusion-pay" | "confusion-discard" | "confusion-skip" | "beauty-blogger-play" | "beauty-blogger-pass" | "fitting-room-select" | "fitting-room-allocate" | "fitting-room-fizzle" | "reading-keep" | "reading-switch" | "check-count-select" | "dress-code-preserve" | "dress-code-discard-all" | "venue-convert" | "venue-exchange-discard" | "venue-manzhan-mode" | "venue-manzhan-use" | "venue-manzhan-pass" | "venue-manzhan-move";
  label: string;
  cardId?: string;
  targetId?: number;
  sourcePlayerId?: number;
  marketCardId?: string;
  presentId?: string;
  presentIds?: string[];
  pronounResponse?: "accept-binary" | "pay-nonbinary";
  venueIdentity?: "female" | "nonbinary";
  venueMode?: "blue" | "pink";
  requiredReading?: SimSide;
  readingChecked?: boolean;
  selectedCheckCount?: number;
  checkCountAdjustment?: -1 | 1;
  declaredChecks?: Record<number, number>;
  checkCountChecked?: boolean;
};

export type VisiblePlayer = Omit<SimPlayer, "goal" | "hand"> & { handCount: number; goal?: SimGoal };
export type VisibleGame = {
  rules?: SimGame["rules"];
  players: VisiblePlayer[];
  selfHand: SimCard[];
  market: SimCard[];
  discard: SimCard[];
  active: number;
  phase: SimPhase;
  round: number;
  venue: SimGame["venue"];
  truthOffer: SimGame["truthOffer"];
  confusionOffer: SimGame["confusionOffer"];
  beautyOffer: SimGame["beautyOffer"];
  fittingRoomOffer: SimGame["fittingRoomOffer"];
  readingPrompt: SimGame["readingPrompt"];
  checkCountPrompt: SimGame["checkCountPrompt"];
  dressCodeOffer: SimGame["dressCodeOffer"];
  forcedPlay: SimGame["forcedPlay"];
  dei: boolean;
  locks: Record<string, number>;
  deckCount: number;
  decisionPlayerId: number;
};

export type KnowledgeEvent =
  | { type: "reveal"; observerId: number; targetId: number; goal: SimGoal }
  | { type: "swap"; actorId: number; targetId: number; actorGoalBefore: SimGoal; targetGoalBefore: SimGoal };

const CARD_SPECS: Array<Omit<SimCard, "id"> & { count: number }> = [
  { name: "长发", count: 4, kind: "present", checked: true },
  { name: "美甲", count: 4, kind: "present", checked: true },
  { name: "一支商标模糊的口红", count: 4, kind: "present", checked: true },
  { name: "家里翻到的古老碎花裙", count: 4, kind: "present", checked: true, dress: true, clothing: true },
  { name: "商场专柜里的裙子", count: 4, kind: "present", checked: true, dress: true, clothing: true },
  { name: "亚文化裙裤", count: 4, kind: "present", checked: true, dress: true, clothing: true },
  { name: "亲戚给的宽大卫衣", count: 4, kind: "present", clothing: true },
  { name: "皱巴巴的格子衬衫", count: 2, kind: "present", clothing: true },
  { name: "她", count: 3, kind: "action" }, { name: "他", count: 2, kind: "action" },
  { name: "理发", count: 1, kind: "action" }, { name: "卸甲", count: 1, kind: "action" },
  { name: "共享衣橱", count: 1, kind: "action" }, { name: "翻箱倒柜", count: 1, kind: "action" },
  { name: "心动夸夸", count: 2, kind: "action" },
  { name: "封心锁爱", count: 1, kind: "action" },
  { name: "地雷系", count: 1, kind: "action" },
  { name: "打烊", count: 2, kind: "action" }, { name: "爱美之心", count: 2, kind: "action" },
  { name: "闺蜜试衣间", count: 2, kind: "action" },
  { name: "迷茫", count: 1, kind: "action" }, { name: "换一种活法", count: 1, kind: "action" },
  { name: "detrans", count: 1, kind: "action" },
  { name: "真心话大冒险", count: 1, kind: "action" }, { name: "试用代词", count: 2, kind: "action" },
  { name: "程序员", count: 1, kind: "action" }, { name: "变装皇后", count: 1, kind: "action" },
  { name: "女装店老板", count: 1, kind: "action" }, { name: "空间主理人", count: 1, kind: "action" },
  { name: "伪娘团", count: 1, kind: "action" },
  { name: "美妆博主", count: 1, kind: "action" }, { name: "你pass吗？", count: 1, kind: "action" }, { name: "身份肯定", count: 2, kind: "action" },
  { name: "开个小证", count: 1, kind: "action" }, { name: "学吉他", count: 2, kind: "action" },
  { name: "自由职业者", count: 1, kind: "action" }, { name: "改好证了！", count: 1, kind: "action" },
  { name: "老男人看了你一眼", count: 2, kind: "action" }, { name: "厌女症", count: 1, kind: "action" },
  { name: "职场 Dress Code", count: 1, kind: "action" }, { name: "职场 DEI", count: 1, kind: "action" },
  { name: "全女空间！", count: 1, kind: "venue" }, { name: "福灵塔", count: 1, kind: "venue" },
  { name: "漫展", count: 1, kind: "venue" },
  { name: "扑朔迷离", count: 1, kind: "action" },
  { name: "先入为主", count: 1, kind: "action" },
];

const GOALS: SimGoal[] = ["文艺男", "男娘", "跨女", "demi-girl", "enby"];

function shuffle<T>(items: T[], random = Math.random) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

function makeDeck(random = Math.random) {
  return shuffle(CARD_SPECS.flatMap((spec) => Array.from({ length: spec.count }, (_, index) => ({ ...spec, id: `${spec.name}-${index}-${random().toString(36).slice(2, 8)}` }))), random);
}

export function createSimGame(names: string[], random = Math.random, ruleOverrides: SimRuleOverrides = {}): SimGame {
  const deck = makeDeck(random);
  const goals = shuffle(GOALS, random);
  const players = names.map((name, id): SimPlayer => ({
    id, name: name || `AI ${id + 1}`, goal: goals[id], identity: "male", reading: "male", identityHistory: [{ identity: "male", reading: "male" }], tempIdentity: null, tempIdentityExpiresAfterTurn: null, ambiguityCard: null,
    joy: 2, hand: [deck.shift()!, deck.shift()!], presents: [], removedPresents: [], items: [], scoreSources: [], crushTargetId: null, skip: 0, turns: 0, whiteEffects: 0, certificateReady: false,
    joyLossVersion: 0, lastJoyLoss: 0,
  }));
  const active = Math.floor(random() * 4);
  return {
    rules: {
      shopOwnerCap: ruleOverrides.shopOwnerCap ?? 3,
      shopOwnerScoring: ruleOverrides.shopOwnerScoring ?? "three-four-tier-2-4",
    },
    players, deck, market: [deck.shift()!, deck.shift()!, deck.shift()!], discard: [], active, phase: "draw", round: 1,
    venue: null, dei: false, locks: {}, finishing: false, turnSerial: 0,
    events: [`${players[active].name} 随机先手。`, "AI 观战局开始。"], warnings: [], certificateOffer: null, truthOffer: null, confusionOffer: null, beautyOffer: null, fittingRoomOffer: null, forcedPlay: null, venueExchange: null, manzhanOpeningChoice: null, manzhanPinkPrompt: null, readingPrompt: null, checkCountPrompt: null, dressCodeOffer: null,
  };
}

export function visibleStateFor(game: SimGame, observerId: number): VisibleGame {
  return {
    rules: game.rules ?? { shopOwnerCap: 3, shopOwnerScoring: "three-four-tier-2-4" },
    players: game.players.map((player) => {
      const { goal, hand, ...publicPlayer } = player;
      return { ...publicPlayer, handCount: hand.length, ...(player.id === observerId ? { goal } : {}) };
    }),
    selfHand: game.forcedPlay?.playerId === observerId ? [game.forcedPlay.card] : [...game.players[observerId].hand],
    market: [...game.market],
    discard: [...game.discard],
    active: game.active,
    phase: game.phase,
    round: game.round,
    venue: game.venue,
    truthOffer: game.truthOffer,
    confusionOffer: game.confusionOffer,
    beautyOffer: game.beautyOffer,
    fittingRoomOffer: game.fittingRoomOffer
      ? { ...game.fittingRoomOffer, revealed: observerId === game.fittingRoomOffer.actorId ? game.fittingRoomOffer.revealed : [] }
      : null,
    readingPrompt: game.readingPrompt,
    checkCountPrompt: game.checkCountPrompt,
    dressCodeOffer: game.dressCodeOffer,
    forcedPlay: game.forcedPlay,
    dei: game.dei,
    locks: { ...game.locks },
    deckCount: game.deck.length,
    decisionPlayerId: decisionPlayerId(game),
  };
}

export function decisionPlayerId(game: SimGame) {
  return game.manzhanOpeningChoice?.playerIds[game.manzhanOpeningChoice.index]
    ?? game.readingPrompt?.checks[game.readingPrompt.index]?.playerId
    ?? game.checkCountPrompt?.checks[game.checkCountPrompt.index]?.playerId
    ?? game.dressCodeOffer?.playerIds[game.dressCodeOffer.index]
    ?? game.certificateOffer?.playerId
    ?? game.truthOffer?.targetId
    ?? game.confusionOffer?.targetId
    ?? game.beautyOffer?.playerId
    ?? (game.fittingRoomOffer?.stage === "select" ? game.fittingRoomOffer.actorId : game.fittingRoomOffer?.targetId)
    ?? (game.venueExchange ? game.venueExchange.playerIds[game.venueExchange.index] : undefined)
    ?? game.manzhanPinkPrompt?.playerId
    ?? game.forcedPlay?.playerId
    ?? game.active;
}

export function knowledgeEventsFor(before: SimGame, after: SimGame, action: SimAction): KnowledgeEvent[] {
  if (before.truthOffer && (action.type === "truth-allow" || action.type === "truth-resist")) {
    const { actorId, targetId } = before.truthOffer;
    return action.type === "truth-resist"
      ? [{ type: "reveal", observerId: targetId, targetId: actorId, goal: before.players[actorId].goal }]
      : [{ type: "reveal", observerId: actorId, targetId, goal: before.players[targetId].goal }];
  }
  if (action.type !== "play") return [];
  const actor = before.players[before.active];
  const card = before.forcedPlay?.card.id === action.cardId
    ? before.forcedPlay.card
    : actor.hand.find((held) => held.id === action.cardId);
  if (card?.name === "换一种活法" && action.targetId !== undefined) {
    return [{
      type: "swap",
      actorId: actor.id,
      targetId: action.targetId,
      actorGoalBefore: before.players[actor.id].goal,
      targetGoalBefore: before.players[action.targetId].goal,
    }];
  }
  return [];
}

export function simSide(player: SimPlayer): SimSide {
  const identity = player.tempIdentity ?? player.identity;
  return identity === "nonbinary" ? player.reading : identity;
}

export function simChecks(player: SimPlayer) {
  return player.presents.filter(simCardChecked).length;
}

/** Card effects read this value; goal scoring deliberately continues to use simChecks(). */
export function simEffectChecks(player: Pick<SimPlayer, "identity" | "tempIdentity" | "presents" | "ambiguityCard">) {
  const actual = player.presents.filter(simCardChecked).length;
  if (!player.ambiguityCard) return actual;
  const identity = player.tempIdentity ?? player.identity;
  const blueAdjustment = player.ambiguityCard.name === "扑朔迷离" ? 1 : -1;
  if (identity === "male") return Math.max(0, actual + blueAdjustment);
  if (identity === "female") return Math.max(0, actual - blueAdjustment);
  return actual;
}

export function simCardChecked(card: SimCard) {
  return card.checkOverride ?? Boolean(card.checked);
}

export function simCardQualifiesAsSkirtOrLipstick(card: SimCard) {
  return Boolean(card.dress || card.name === "一支商标模糊的口红");
}

export function simCardIsClothing(card: SimCard) {
  return Boolean(card.clothing || card.dress || card.name === "亲戚给的宽大卫衣" || card.name === "皱巴巴的格子衬衫");
}

export function simShopOwnerJoy(clothingKinds: number, rules?: SimGame["rules"]) {
  if (rules?.shopOwnerScoring === "three-four-tier-2-4") {
    return clothingKinds >= 4 ? 4 : clothingKinds >= 3 ? 2 : 0;
  }
  if (rules?.shopOwnerScoring === "three-four-tier") {
    return clothingKinds >= 4 ? 3 : clothingKinds >= 3 ? 1 : 0;
  }
  return Math.min(rules?.shopOwnerCap ?? 3, clothingKinds);
}

export function simHasSkirtOrLipstick(player: Pick<SimPlayer, "presents">) {
  return player.presents.some(simCardQualifiesAsSkirtOrLipstick);
}

export function enbyScoringSmallItems(player: Pick<SimPlayer, "presents" | "items">) {
  const clothingItem = player.presents.find((card) => card.name === "亲戚给的宽大卫衣" || card.name === "亚文化裙裤")?.name;
  return [
    ...(clothingItem ? [clothingItem] : []),
    ...(player.items.includes("吉他") ? ["吉他"] : []),
    ...(player.items.includes("小证") ? ["小证"] : []),
  ];
}

export type GoalScoreItem = { key: string; label: string; points: number };

export function goalScoreBreakdown(player: SimPlayer): GoalScoreItem[] {
  const checks = simChecks(player);
  const has = (name: string) => player.presents.some((card) => card.name === name);
  const feminine = simHasSkirtOrLipstick(player);
  if (player.goal === "文艺男") return [
    { key: "identity", label: "终局男性", points: Number(player.identity === "male") * 3 },
    { key: "hair", label: "长发且检定不超过 2", points: Number(has("长发") && checks <= 2) * 8 },
    { key: "guitar", label: "拥有吉他", points: Number(player.items.includes("吉他")) * 4 },
  ];
  if (player.goal === "男娘") {
    const presentationScore = feminine ? (checks >= 4 ? 10 : checks >= 3 ? 8 : 0) : 0;
    return [
      { key: "identity", label: "终局男性或非二元", points: Number(player.identity !== "female") * 4 },
      { key: "presentation", label: "裙装/口红且检定 ≥3；≥4 时升级", points: presentationScore },
    ];
  }
  if (player.goal === "跨女") return [
    { key: "identity", label: "终局女性", points: Number(player.identity === "female") * 4 },
    { key: "presentation", label: "裙装/口红且检定 ≥3", points: Number(checks >= 3 && feminine) * 8 },
    { key: "certificate", label: "拥有小证", points: Number(player.items.includes("小证")) * 4 },
  ];
  if (player.goal === "demi-girl") return [
    { key: "identity", label: "终局女性或非二元", points: Number(player.identity !== "male") * 4 },
    { key: "presentation", label: "裙装/口红且检定为 2–3", points: Number(checks >= 2 && checks <= 3 && feminine) * 8 },
    { key: "certificate", label: "拥有小证", points: Number(player.items.includes("小证")) * 2 },
  ];
  const enbySmallItems = enbyScoringSmallItems(player).length;
  return [
    { key: "identity", label: "终局非二元", points: Number(player.identity === "nonbinary") * 4 },
    { key: "white", label: "首次触发白色牌效", points: Number(player.whiteEffects > 0) * 6 },
    { key: "small-items", label: "宽大卫衣或裙裤、吉他、小证，每件计分，至多 3 件", points: enbySmallItems * 2 },
  ];
}

export function goalScore(player: SimPlayer) {
  return goalScoreBreakdown(player).reduce((sum, item) => sum + item.points, 0);
}

export function finalScoreBreakdown(player: SimPlayer) {
  const goalItems = goalScoreBreakdown(player);
  return {
    goalItems,
    joyPoints: player.joy,
    total: goalItems.reduce((sum, item) => sum + item.points, 0) + player.joy,
  };
}

export function projectedScore(player: SimPlayer) {
  return finalScoreBreakdown(player).total;
}

/** Final standing: total score first, then remaining Joy. Equal on both means a shared place. */
export function compareFinalStanding(a: SimPlayer, b: SimPlayer) {
  const scoreDifference = projectedScore(b) - projectedScore(a);
  return scoreDifference || b.joy - a.joy;
}

export function sharesFinalStanding(a: SimPlayer, b: SimPlayer) {
  return projectedScore(a) === projectedScore(b) && a.joy === b.joy;
}

function marketAllowed(game: SimGame, card: SimCard, player: SimPlayer) {
  const lock = game.locks[card.id];
  if (lock !== undefined && lock !== player.id) return false;
  const identity = player.tempIdentity ?? player.identity;
  if (game.venue?.card.name === "全女空间！" && simSide(player) === "male" && (identity !== "nonbinary" || player.joy < 1)) return false;
  return true;
}

function pushPlay(actions: SimAction[], card: SimCard, suffix: string, extras: Partial<SimAction> = {}) {
  actions.push({ id: `play:${card.id}:${suffix}`, type: "play", label: `打【${card.name}】${suffix}`, cardId: card.id, ...extras });
}

function enumerateCardPlayActions(game: SimGame, actor: SimPlayer, card: SimCard) {
  const actions: SimAction[] = [];
  const others = game.players.filter((player) => player.id !== actor.id);
  const everyone = game.players;
  if (card.kind === "present") {
    everyone.filter((target) => !target.presents.some((held) => held.name === card.name)).forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (["她", "他", "老男人看了你一眼", "你pass吗？"].includes(card.name)) {
    everyone.forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "心动夸夸") {
    others.filter((target) => !target.items.includes("封心锁爱")).forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "理发") {
    everyone.filter((target) => target.presents.some((held) => held.name === "长发")).forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "卸甲") {
    everyone.filter((target) => target.presents.some((held) => held.name === "美甲")).forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "共享衣橱") {
    everyone.forEach((source) => source.presents.forEach((present) => {
      everyone.filter((target) => target.id !== source.id && !target.presents.some((held) => held.name === present.name)).forEach((target) => {
        pushPlay(actions, card, ` → 【${present.name}】从 ${source.name} 移至 ${target.name}`, {
          sourcePlayerId: source.id,
          presentId: present.id,
          targetId: target.id,
        });
      });
    }));
  } else if (card.name === "打烊" || card.name === "爱美之心") {
    game.market.forEach((marketCard) => pushPlay(actions, card, ` → 【${marketCard.name}】`, { marketCardId: marketCard.id }));
  } else if (card.name === "闺蜜试衣间") {
    others.forEach((target) => pushPlay(actions, card, ` → 与 ${target.name} 试衣`, { targetId: target.id }));
  } else if (card.name === "伪娘团") {
    const canReadBlue = (player: SimPlayer) => {
      const identity = player.tempIdentity ?? player.identity;
      return identity === "male" || (identity === "nonbinary" && (player.reading === "male" || player.joy >= 1));
    };
    const canReachRequiredChecks = (player: SimPlayer) => hasFlexibleChecks(player)
      ? simChecks(player) + 1 >= 2
      : simEffectChecks(player) >= 2;
    if (canReadBlue(actor) && canReachRequiredChecks(actor)) {
      others.filter((target) => canReadBlue(target) && canReachRequiredChecks(target))
        .forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
    }
  } else if (card.name === "换一种活法") {
    others.forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
    actions.push({ id: `play:${card.id}:fizzle`, type: "play", label: `空出【${card.name}】`, cardId: card.id });
  } else if (["迷茫", "真心话大冒险", "学吉他"].includes(card.name)) {
    others.forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "detrans") {
    const history = actor.identityHistory ?? [];
    const historyMatchesCurrent = history.at(-1)?.identity === actor.identity;
    if (!actor.items.includes("改好证了！") && historyMatchesCurrent && history.length > 1) pushPlay(actions, card, " → 恢复上一层长期身份");
  } else if (card.name === "美妆博主") {
    pushPlay(actions, card, "");
  } else if (card.name === "身份肯定") {
    everyone.filter((target) => target.tempIdentity !== null && !target.items.includes("改好证了！")).forEach((target) => pushPlay(actions, card, ` → ${target.name}`, { targetId: target.id }));
  } else if (card.name === "扑朔迷离" || card.name === "先入为主") {
    pushPlay(actions, card, "");
  } else pushPlay(actions, card, "");
  return actions;
}

function enumerateManzhanPinkMoves(game: SimGame, actor: SimPlayer): SimAction[] {
  const actions: SimAction[] = [];
  game.players.forEach((source) => {
    source.presents.forEach((present) => {
      game.players
        .filter((target) => target.id !== source.id && !target.presents.some((held) => held.name === present.name))
        .forEach((target) => actions.push({
          id: `venue-manzhan:move:${actor.id}:${source.id}:${present.id}:${target.id}`,
          type: "venue-manzhan-move",
          label: `漫展：将 ${source.name} 的【${present.name}】移给 ${target.name}`,
          sourcePlayerId: source.id,
          presentId: present.id,
          targetId: target.id,
        }));
    });
  });
  return actions;
}

function manzhanEffectFor(game: SimGame, player: SimPlayer): "blue" | "pink" | null {
  if (game.venue?.card.name !== "漫展") return null;
  const identity = player.tempIdentity ?? player.identity;
  if (identity === "male") return "blue";
  if (identity === "female") return "pink";
  return game.venue.manzhanWhiteModes?.[player.id] ?? null;
}

function manzhanPinkHandledThisTurn(game: SimGame, player: SimPlayer) {
  return game.venue?.card.name === "漫展"
    && game.venue.manzhanPinkHandledTurns?.[player.id] === player.turns;
}

function isCurrentlyNonbinary(player: SimPlayer) {
  return (player.tempIdentity ?? player.identity) === "nonbinary";
}

function playedCardFor(game: SimGame, action: SimAction) {
  if (action.type !== "play") return undefined;
  const actor = game.players[game.active];
  return game.forcedPlay?.card.id === action.cardId
    ? game.forcedPlay.card
    : actor.hand.find((card) => card.id === action.cardId);
}

function readingChecksFor(game: SimGame, action: SimAction) {
  if (action.readingChecked) return [];
  const actor = game.players[game.active];
  const checks: Array<{ playerId: number; sourceName: string; requiredReading?: SimSide }> = [];
  if (action.type === "draw-market" && game.venue?.card.name === "全女空间！" && isCurrentlyNonbinary(actor)) {
    checks.push({ playerId: actor.id, sourceName: "全女空间！", requiredReading: "female" });
    return checks;
  }
  if (action.type === "beauty-blogger-play" && game.beautyOffer && action.presentId && action.targetId !== undefined) {
    const present = game.beautyOffer.revealed.find((held) => held.id === action.presentId);
    const recipient = game.players[action.targetId];
    if (game.venue?.card.name === "全女空间！" && present && simCardChecked(present) && isCurrentlyNonbinary(recipient)) {
      checks.push({ playerId: recipient.id, sourceName: "全女空间！" });
    }
    return checks;
  }
  const card = playedCardFor(game, action);
  if (!card) return checks;
  if (card.name === "美妆博主" && isCurrentlyNonbinary(actor)) {
    checks.push({ playerId: actor.id, sourceName: "美妆博主", requiredReading: action.requiredReading });
  }
  if (card.name === "老男人看了你一眼" && action.targetId !== undefined) {
    const target = game.players[action.targetId];
    if (isCurrentlyNonbinary(target)) checks.push({ playerId: target.id, sourceName: card.name });
  }
  if (card.name === "你pass吗？" && action.targetId !== undefined) {
    const target = game.players[action.targetId];
    if (isCurrentlyNonbinary(target)) checks.push({ playerId: target.id, sourceName: card.name });
  }
  if (card.name === "伪娘团" && action.targetId !== undefined) {
    const target = game.players[action.targetId];
    if (isCurrentlyNonbinary(actor)) checks.push({ playerId: actor.id, sourceName: card.name });
    if (isCurrentlyNonbinary(target)) checks.push({ playerId: target.id, sourceName: card.name });
  }
  if (card.name === "职场 Dress Code" && !game.dei) {
    game.players.filter((player) => isCurrentlyNonbinary(player) && !player.items.includes("自由职业者"))
      .forEach((player) => checks.push({ playerId: player.id, sourceName: card.name }));
  }
  const gainedPresent = card.kind === "present" ? card : undefined;
  const recipient = card.kind === "present" && action.targetId !== undefined ? game.players[action.targetId] : actor;
  if (game.venue?.card.name === "全女空间！" && gainedPresent && simCardChecked(gainedPresent) && isCurrentlyNonbinary(recipient)) {
    checks.push({ playerId: recipient.id, sourceName: "全女空间！" });
  }
  return checks;
}

function hasFlexibleChecks(player: SimPlayer) {
  return Boolean(player.ambiguityCard)
    && (player.tempIdentity ?? player.identity) === "nonbinary";
}

function resolvedCheckCount(action: SimAction, player: SimPlayer) {
  return action.declaredChecks?.[player.id] ?? simEffectChecks(player);
}

function checkCountChecksFor(game: SimGame, action: SimAction) {
  if (action.checkCountChecked) return [];
  const checks: Array<{ playerId: number; sourceName: string; min?: number }> = [];
  const card = playedCardFor(game, action);
  if (!card) return checks;
  const actor = game.players[game.active];
  if ((card.name === "老男人看了你一眼" || card.name === "你pass吗？") && action.targetId !== undefined) {
    const target = game.players[action.targetId];
    if (hasFlexibleChecks(target)) checks.push({ playerId: target.id, sourceName: card.name });
  } else if (card.name === "空间主理人") {
    game.players.filter(hasFlexibleChecks)
      .forEach((player) => checks.push({ playerId: player.id, sourceName: card.name }));
  } else if (card.name === "伪娘团" && action.targetId !== undefined) {
    const target = game.players[action.targetId];
    if (hasFlexibleChecks(actor)) checks.push({ playerId: actor.id, sourceName: card.name, min: 2 });
    if (hasFlexibleChecks(target)) checks.push({ playerId: target.id, sourceName: card.name, min: 2 });
  } else if (card.name === "厌女症") {
    game.players.filter(hasFlexibleChecks).forEach((player) => checks.push({ playerId: player.id, sourceName: card.name }));
  } else if (card.name === "职场 Dress Code" && !game.dei) {
    game.players.filter((player) => hasFlexibleChecks(player) && simSide(player) === "female" && !player.items.includes("自由职业者"))
      .forEach((player) => checks.push({ playerId: player.id, sourceName: card.name }));
  }
  return checks;
}

export function enumerateLegalActions(game: SimGame): SimAction[] {
  if (game.phase === "ended") return [];
  if (game.manzhanOpeningChoice) {
    const choice = game.manzhanOpeningChoice;
    const playerId = choice.playerIds[choice.index];
    return [
      { id: `venue-manzhan:opening:${playerId}:blue`, type: "venue-manzhan-mode", venueMode: "blue", label: "漫展白色：本场地选择蓝色效果" },
      { id: `venue-manzhan:opening:${playerId}:pink`, type: "venue-manzhan-mode", venueMode: "pink", label: "漫展白色：本场地选择粉色效果" },
    ];
  }
  if (game.readingPrompt) {
    const check = game.readingPrompt.checks[game.readingPrompt.index];
    const player = game.players[check.playerId];
    const current = player.reading;
    const canKeep = check.requiredReading === undefined || check.requiredReading === current;
    const canSwitch = player.joy >= 1 && (check.requiredReading === undefined || check.requiredReading !== current);
    return [
      ...(canKeep ? [{ id: `reading:keep:${check.playerId}:${game.readingPrompt.index}`, type: "reading-keep" as const, label: `保持${current === "male" ? "蓝" : "粉"}读取` }] : []),
      ...(canSwitch ? [{ id: `reading:switch:${check.playerId}:${game.readingPrompt.index}`, type: "reading-switch" as const, label: `支付 1 Joy，永久切为${current === "male" ? "粉" : "蓝"}读取` }] : []),
    ];
  }
  if (game.checkCountPrompt) {
    const prompt = game.checkCountPrompt;
    const check = prompt.checks[prompt.index];
    const player = game.players[check.playerId];
    const minimum = check.min ?? 0;
    const actual = simChecks(player);
    return ([-1, 1] as const)
      .map((adjustment) => ({ adjustment, count: Math.max(0, actual + adjustment) }))
      .filter(({ count }) => count >= minimum)
      .map(({ adjustment, count }) => ({
        id: `check-count:${check.playerId}:${prompt.index}:${adjustment > 0 ? "plus" : "minus"}:${count}`,
        type: "check-count-select" as const,
        label: `【${check.sourceName}】本次检定数 ${adjustment > 0 ? "+1" : "−1"}（按 ${count} 结算）`,
        selectedCheckCount: count,
        checkCountAdjustment: adjustment,
      }));
  }
  if (game.dressCodeOffer) {
    const offer = game.dressCodeOffer;
    const player = game.players[offer.playerIds[offer.index]];
    const checkedPresents = player.presents.filter(simCardChecked);
    return [
      ...checkedPresents.map((present) => ({
        id: `dress-code:preserve:${player.id}:${present.id}`,
        type: "dress-code-preserve" as const,
        label: `保留【${present.name}】，弃置其余检定呈现`,
        presentId: present.id,
      })),
      {
        id: `dress-code:discard-all:${player.id}`,
        type: "dress-code-discard-all" as const,
        label: "不保留，弃置全部检定呈现",
      },
    ];
  }
  if (game.certificateOffer) {
    const offer = game.certificateOffer;
    const owner = game.players[offer.playerId];
    return [
      { id: `certificate:pass:${offer.card.id}`, type: "certificate-pass", label: "放行【她】" },
      ...owner.hand.map((card) => ({
        id: `certificate:claim:${offer.card.id}:${card.id}`,
        type: "certificate-claim" as const,
        label: `弃【${card.name}】，将【她】换入手牌`,
        cardId: card.id,
      })),
    ];
  }
  if (game.truthOffer) {
    const { actorId, targetId } = game.truthOffer;
    const target = game.players[targetId];
    return [
      { id: `truth:allow:${actorId}:${targetId}`, type: "truth-allow", label: "不反制，公开目标", targetId: actorId },
      ...(target.joy >= 2
        ? [{ id: `truth:resist:${actorId}:${targetId}`, type: "truth-resist" as const, label: "支付 2 Joy 反制，并查看对方目标", targetId: actorId }]
        : []),
    ];
  }
  if (game.confusionOffer) {
    const { actorId, targetId } = game.confusionOffer;
    const target = game.players[targetId];
    return [
      ...(target.joy >= 1 ? [{ id: `confusion:pay:${actorId}:${targetId}`, type: "confusion-pay" as const, label: "支付 1 Joy" }] : []),
      ...target.presents.map((present) => ({
        id: `confusion:discard:${actorId}:${targetId}:${present.id}`,
        type: "confusion-discard" as const,
        label: `弃置【${present.name}】`,
        sourcePlayerId: target.id,
        presentId: present.id,
      })),
      { id: `confusion:skip:${actorId}:${targetId}`, type: "confusion-skip", label: "跳过下回合" },
    ];
  }
  if (game.beautyOffer) {
    const offer = game.beautyOffer;
    const actions: SimAction[] = [{
      id: `beauty-blogger:pass:${offer.playerId}`,
      type: "beauty-blogger-pass",
      label: "不打出呈现，其余牌置于牌堆底",
    }];
    offer.revealed.filter((card) => card.kind === "present").forEach((present) => {
      game.players
        .filter((target) => !target.presents.some((held) => held.name === present.name))
        .forEach((target) => actions.push({
          id: `beauty-blogger:play:${offer.playerId}:${present.id}:${target.id}`,
          type: "beauty-blogger-play",
          label: `立即打出【${present.name}】→ ${target.name}`,
          presentId: present.id,
          targetId: target.id,
        }));
    });
    return actions;
  }
  if (game.fittingRoomOffer) {
    const offer = game.fittingRoomOffer;
    if (offer.stage === "select") {
      const candidates = [...game.market, ...offer.revealed].filter((card) => card.kind === "present");
      const actions: SimAction[] = [];
      for (let first = 0; first < candidates.length; first += 1) {
        for (let second = first + 1; second < candidates.length; second += 1) {
          const pair = [candidates[first], candidates[second]];
          actions.push({
            id: `fitting-room:select:${offer.actorId}:${offer.targetId}:${pair[0].id}:${pair[1].id}`,
            type: "fitting-room-select",
            label: `选择【${pair[0].name}】与【${pair[1].name}】`,
            presentIds: pair.map((card) => card.id),
          });
        }
      }
      return [...actions, {
        id: `fitting-room:fizzle:${offer.actorId}:${offer.targetId}`,
        type: "fitting-room-fizzle",
        label: "没买到衣服",
      }];
    }
    return offer.selected.map((card) => {
      const kept = offer.selected.find((other) => other.id !== card.id)!;
      return {
        id: `fitting-room:allocate:${offer.actorId}:${offer.targetId}:${card.id}`,
        type: "fitting-room-allocate" as const,
        label: `把【${card.name}】给 ${game.players[offer.actorId].name}，自己留下【${kept.name}】`,
        presentId: card.id,
        targetId: offer.actorId,
      };
    });
  }
  if (game.venueExchange) {
    const exchange = game.venueExchange;
    const player = game.players[exchange.playerIds[exchange.index]];
    return player.hand.map((card) => ({
      id: `venue-exchange:discard:${player.id}:${card.id}:${exchange.discardRemaining}`,
      type: "venue-exchange-discard" as const,
      label: `福灵塔：弃【${card.name}】（还需弃 ${exchange.discardRemaining} 张）`,
      cardId: card.id,
    }));
  }
  if (game.forcedPlay) {
    const forced = game.forcedPlay;
    const actor = game.players[forced.playerId];
    const actions = enumerateCardPlayActions(game, actor, forced.card);
    if (actions.length) return actions;
    return [{ id: `play:${forced.card.id}:forced-fizzle`, type: "play", label: `空出【${forced.card.name}】（无合理目标）`, cardId: forced.card.id }];
  }
  const actor = game.players[game.active];
  if (game.manzhanPinkPrompt?.playerId === actor.id) return enumerateManzhanPinkMoves(game, actor);
  if (game.phase === "play" && game.venue?.card.name === "漫展" && !manzhanPinkHandledThisTurn(game, actor)) {
    const currentIdentity = actor.tempIdentity ?? actor.identity;
    const moves = enumerateManzhanPinkMoves(game, actor);
    if (currentIdentity === "nonbinary" && manzhanEffectFor(game, actor) === null) {
      const hasBluePlay = actor.hand.some((card) => card.kind === "present" && simCardChecked(card) && !actor.presents.some((held) => held.name === card.name));
      return [
        ...(hasBluePlay ? [{ id: `venue-manzhan:mode:${actor.id}:${actor.turns}:blue`, type: "venue-manzhan-mode" as const, venueMode: "blue" as const, label: "漫展白色：选择蓝色效果" }] : []),
        ...(moves.length ? [{ id: `venue-manzhan:mode:${actor.id}:${actor.turns}:pink`, type: "venue-manzhan-mode" as const, venueMode: "pink" as const, label: "漫展白色：选择粉色效果" }] : []),
        { id: `venue-manzhan:pass:${actor.id}:${actor.turns}`, type: "venue-manzhan-pass", label: "本回合不使用【漫展】" },
      ];
    }
    if (manzhanEffectFor(game, actor) === "pink" && moves.length) {
      return [
        { id: `venue-manzhan:use:${actor.id}:${actor.turns}`, type: "venue-manzhan-use", label: "使用【漫展】移动一张呈现" },
        { id: `venue-manzhan:pass:${actor.id}:${actor.turns}`, type: "venue-manzhan-pass", label: "不使用【漫展】" },
      ];
    }
  }
  if (game.phase === "draw") {
    const actions: SimAction[] = [];
    const currentIdentity = actor.tempIdentity ?? actor.identity;
    if (game.venue?.card.name === "福灵塔" && currentIdentity === "male" && !actor.items.includes("改好证了！") && simChecks(actor) > 0 && !game.venue.abilityUsedBy.includes(actor.id)) {
      actions.push(
        { id: `venue-convert:${actor.id}:female`, type: "venue-convert", label: "福灵塔：长期身份变为女性", venueIdentity: "female" },
        { id: `venue-convert:${actor.id}:nonbinary`, type: "venue-convert", label: "福灵塔：长期身份变为非二元（蓝读取）", venueIdentity: "nonbinary" },
      );
    }
    if (game.deck.length) actions.push({ id: "draw:blind", type: "draw-blind", label: "暗摸" });
    game.market.filter((card) => marketAllowed(game, card, actor)).forEach((card) => actions.push({ id: `draw:${card.id}`, type: "draw-market", label: `拿【${card.name}】`, marketCardId: card.id }));
    if (!actions.length) actions.push({ id: "draw:skip", type: "skip-draw", label: "牌堆已空，跳过拿牌" });
    return actions;
  }

  return actor.hand.flatMap((card) => {
    const actions = enumerateCardPlayActions(game, actor, card);
    if (actions.length) return actions;
    return [{ id: `play:${card.id}:fizzle`, type: "play" as const, label: `空出【${card.name}】（无合理目标）`, cardId: card.id }];
  });
}

function clone(game: SimGame): SimGame {
  return structuredClone(game) as SimGame;
}

function event(game: SimGame, text: string) {
  game.events = [text, ...game.events];
}

function recordScoreSource(player: SimPlayer, cardName: string, joy: number) {
  if (joy <= 0) return;
  player.scoreSources ??= [];
  const existing = player.scoreSources.find((source) => source.cardName === cardName);
  if (existing) existing.joy += joy;
  else player.scoreSources.push({ cardName, joy });
}

function grantCrushJoy(game: SimGame, actor: SimPlayer, targetId: number, cardName: string) {
  if (actor.crushTargetId !== targetId) return false;
  actor.joy += 1;
  recordScoreSource(actor, "心动标记", 1);
  event(game, `${actor.name} 对拥有其心动标记的 ${game.players[targetId].name} 使用了【${cardName}】，获得 1 Joy。`);
  return true;
}

function recordFirstWhiteEffect(game: SimGame, player: SimPlayer, sourceName: string) {
  if (player.whiteEffects > 0) return;
  player.whiteEffects = 1;
  event(game, `${player.name} 首次触发【${sourceName}】的白色效果，enby 目标记为 +6。`);
}

function warn(game: SimGame, text: string) {
  if (!game.warnings.includes(text)) game.warnings.push(text);
}

function drawTop(game: SimGame) {
  const card = game.deck.shift() ?? null;
  if (card && game.deck.length === 0) game.finishing = true;
  return card;
}

function refill(game: SimGame) {
  while (game.market.length < 3) {
    const card = drawTop(game);
    if (!card) break;
    const certificateOwner = card.name === "她" ? game.players.find((player) => player.certificateReady) : undefined;
    if (certificateOwner) {
      game.certificateOffer = { card, playerId: certificateOwner.id, resumeAfter: "none" };
      event(game, `一张【她】将补入公共牌列；${certificateOwner.name} 可放行，或弃 1 张手牌将其换入手牌。`);
      break;
    }
    game.market.push(card);
  }
}

function removeMarket(game: SimGame, id?: string) {
  const card = game.market.find((item) => item.id === id);
  if (!card) return null;
  game.market = game.market.filter((item) => item.id !== id);
  delete game.locks[id!];
  refill(game);
  return card;
}

function takeMarketWithoutRefill(game: SimGame, id: string) {
  const card = game.market.find((item) => item.id === id);
  if (!card) return null;
  game.market = game.market.filter((item) => item.id !== id);
  delete game.locks[id];
  return card;
}

function idealIdentity(goal: SimGoal, intended: SimIdentity) {
  if (goal === "文艺男" || goal === "男娘") return intended === "male";
  if (goal === "跨女") return intended === "female";
  if (goal === "demi-girl") return intended !== "male";
  return intended === "nonbinary";
}

function discardAmbiguityAfterLongTermIdentityChange(game: SimGame, player: SimPlayer, previousIdentity: SimIdentity) {
  if (player.identity === previousIdentity || !player.ambiguityCard) return;
  const discarded = player.ambiguityCard;
  player.ambiguityCard = null;
  game.discard.push(discarded);
  event(game, `${player.name} 的长期身份改变，【${discarded.name}】移除。`);
}

function ensureIdentityHistory(player: SimPlayer) {
  player.identityHistory ??= [];
  const top = player.identityHistory.at(-1);
  if (!top || top.identity !== player.identity) {
    // Also keeps hand-authored test states and older saved games compatible: their
    // current public identity becomes the single known baseline layer.
    player.identityHistory = [{ identity: player.identity, reading: player.reading }];
  } else if (top.identity === "nonbinary") {
    top.reading = player.reading;
  }
  return player.identityHistory;
}

function syncCurrentIdentityLayer(player: SimPlayer) {
  const history = ensureIdentityHistory(player);
  const top = history.at(-1)!;
  top.identity = player.identity;
  if (player.identity === "nonbinary") top.reading = player.reading;
}

function pushLongTermIdentity(game: SimGame, player: SimPlayer, identity: SimIdentity, reading: SimSide) {
  const history = ensureIdentityHistory(player);
  const previousIdentity = player.identity;
  if (identity === previousIdentity) {
    player.reading = reading;
    syncCurrentIdentityLayer(player);
    return false;
  }
  player.identity = identity;
  player.reading = reading;
  history.push({ identity, reading });
  discardAmbiguityAfterLongTermIdentityChange(game, player, previousIdentity);
  return true;
}

function popLongTermIdentity(game: SimGame, player: SimPlayer) {
  const history = ensureIdentityHistory(player);
  if (player.items.includes("改好证了！") || history.length <= 1) return null;
  const previousIdentity = player.identity;
  history.pop();
  const restored = history.at(-1)!;
  player.identity = restored.identity;
  player.reading = restored.reading;
  discardAmbiguityAfterLongTermIdentityChange(game, player, previousIdentity);
  return restored;
}

function applyTemporaryIdentity(game: SimGame, actor: SimPlayer, target: SimPlayer, identity: SimIdentity, sourceName: string) {
  target.tempIdentity = identity;
  target.tempIdentityExpiresAfterTurn = target.turns + (target.id === actor.id ? 2 : 1);
  event(game, `${target.name} 因【${sourceName}】暂时成为${identity === "male" ? "男性" : identity === "female" ? "女性" : "非二元"}，持续至自己的下回合结束。`);
}

function applyPronounTarget(game: SimGame, target: SimPlayer, card: SimCard, action: SimAction) {
  if (target.items.includes("改好证了！")) {
    event(game, `${target.name} 已经【改好证了！】，长期公开身份不能改变。`);
    return;
  }
  const intended: SimIdentity = card.name === "她" ? "female" : "male";
  const nonbinaryBetter = action.pronounResponse === "pay-nonbinary"
    ? target.joy > 0
    : action.pronounResponse === "accept-binary"
      ? false
      : idealIdentity(target.goal, "nonbinary") && !idealIdentity(target.goal, intended) && target.joy > (target.goal === "enby" ? 0 : 1);
  if (nonbinaryBetter) {
    loseJoy(target);
    pushLongTermIdentity(game, target, "nonbinary", intended as SimSide);
  } else pushLongTermIdentity(game, target, intended, intended as SimSide);
}

function loseJoy(player: SimPlayer, amount = 1) {
  const loss = Math.min(player.joy, amount);
  if (loss <= 0) return;
  player.joy -= loss;
  player.lastJoyLoss = loss;
  player.joyLossVersion += 1;
}

function triggerJiraiRetaliation(game: SimGame, actor: SimPlayer, target: SimPlayer, cardName: string) {
  if (actor.id === target.id || !target.items.includes("地雷系")) return false;
  const joyBefore = actor.joy;
  loseJoy(actor);
  const lost = joyBefore - actor.joy;
  event(game, lost > 0
    ? `${target.name} 的【地雷系】因 ${actor.name} 对其使用【${cardName}】而触发；${actor.name} 失去 1 Joy。`
    : `${target.name} 的【地雷系】因 ${actor.name} 对其使用【${cardName}】而触发；${actor.name} 已无 Joy 可失去。`);
  return true;
}

function removePresent(game: SimGame, player: SimPlayer, card: SimCard) {
  player.presents = player.presents.filter((held) => held.id !== card.id);
  player.removedPresents.push({ card, untilTurnSerial: game.turnSerial + 2 });
  game.discard.push(card);
}

function gainPresent(game: SimGame, card: SimCard, targetId: number) {
  const target = game.players[targetId];
  if (target.presents.some((held) => held.name === card.name)) {
    game.discard.push(card);
    return;
  }
  if (simCardIsClothing(card)) {
    [...target.presents].filter(simCardIsClothing).forEach((held) => removePresent(game, target, held));
  }
  card.freshUntilTurnSerial = game.turnSerial + game.players.length;
  target.presents.push(card);
  if (game.venue?.card.name === "全女空间！" && simSide(target) === "female" && simCardChecked(card)) target.joy += 1;
}

function resolvePlay(game: SimGame, action: SimAction, card: SimCard) {
  const actor = game.players[game.active];
  const target = action.targetId === undefined ? null : game.players[action.targetId];
  if (card.kind === "present" && target) {
    gainPresent(game, card, target.id);
    return;
  }
  if (card.name === "她" || card.name === "他") {
    if (!target) return;
    applyPronounTarget(game, target, card, action);
    return;
  }
  if (card.name === "理发" && target) {
    const hair = target.presents.find((held) => held.name === "长发");
    if (hair) removePresent(game, target, hair);
  } else if (card.name === "卸甲" && target) {
    const nails = target.presents.find((held) => held.name === "美甲");
    if (nails) removePresent(game, target, nails);
  } else if (card.name === "共享衣橱" && target && action.sourcePlayerId !== undefined && action.presentId) {
    const source = game.players[action.sourcePlayerId];
    const moved = source.presents.find((held) => held.id === action.presentId);
    if (moved) {
      source.presents = source.presents.filter((held) => held.id !== moved.id);
      source.removedPresents.push({ card: { ...moved }, untilTurnSerial: game.turnSerial + 2 });
      delete moved.checkOverride;
      delete moved.checkOverrideExpiresAfterTurn;
      moved.checkAnimationKind = moved.checked ? "checked" : "unchecked";
      moved.checkAnimationVersion = (moved.checkAnimationVersion ?? 0) + 1;
      gainPresent(game, moved, target.id);
    }
  } else if (card.name === "心动夸夸" && target) {
    if (target.items.includes("封心锁爱")) {
      warn(game, `【心动夸夸】不能以拥有【封心锁爱】的 ${target.name} 为目标。`);
      return;
    }
    const previousTargetId = actor.crushTargetId ?? null;
    actor.crushTargetId = target.id;
    target.joy += 1;
    recordScoreSource(target, card.name, 1);
    if (previousTargetId !== null && previousTargetId !== target.id) {
      event(game, `${actor.name} 移除了此前给 ${game.players[previousTargetId].name} 的心动标记，并将标记交给 ${target.name}。`);
    } else {
      event(game, `${target.name} 获得 1 Joy，并获得一枚来自 ${actor.name} 的心动标记。`);
    }
  } else if (card.name === "封心锁爱") {
    actor.items.push("封心锁爱");
    const givers = game.players.filter((player) => player.crushTargetId === actor.id);
    if (givers.length === 0) {
      event(game, `${actor.name} 打出【封心锁爱】；此后不能成为【心动夸夸】的目标。`);
    } else {
      givers.forEach((giver) => {
        giver.crushTargetId = null;
        const joyBefore = giver.joy;
        loseJoy(giver, 2);
        event(game, `${actor.name} 弃置了来自 ${giver.name} 的心动标记；${giver.name} 失去 ${joyBefore - giver.joy} Joy。`);
      });
    }
  } else if (card.name === "地雷系") {
    actor.items.push("地雷系");
    event(game, `${actor.name} 打出【地雷系】；此后其他玩家每次对其使用一张牌，都会失去 1 Joy。`);
  } else if (card.name === "打烊") {
    const removed = removeMarket(game, action.marketCardId);
    if (removed) game.discard.push(removed);
  } else if (card.name === "爱美之心") {
    const claimed = removeMarket(game, action.marketCardId);
    if (claimed) {
      game.forcedPlay = { card: claimed, playerId: actor.id, source: "爱美之心" };
      event(game, `${actor.name} 用【爱美之心】获得【${claimed.name}】，必须立即打出。`);
    }
  } else if (card.name === "闺蜜试衣间" && target) {
    const revealed = game.deck.splice(0, Math.min(3, game.deck.length));
    game.fittingRoomOffer = { actorId: actor.id, targetId: target.id, stage: "select", revealed, selected: [] };
    event(game, `${actor.name} 邀请 ${target.name} 进入【闺蜜试衣间】，查看公共牌列与牌堆顶 ${revealed.length} 张，并选择至多 2 张呈现。`);
  } else if (card.name === "迷茫" && target) {
    game.confusionOffer = { actorId: actor.id, targetId: target.id, resumeAfter: "none" };
    event(game, `${target.name} 正在选择如何承受【迷茫】：支付 1 Joy、弃置一张呈现，或跳过下回合。`);
  } else if (card.name === "换一种活法" && target) [actor.goal, target.goal] = [target.goal, actor.goal];
  else if (card.name === "detrans") {
    const restored = popLongTermIdentity(game, actor);
    if (restored) event(game, `${actor.name} 使用【detrans】，移除最上层长期身份标记，恢复为${restored.identity === "male" ? "男性" : restored.identity === "female" ? "女性" : `非二元（${restored.reading === "male" ? "蓝" : "粉"}读取）`}。`);
  }
  else if (card.name === "真心话大冒险" && target) {
    game.truthOffer = { actorId: actor.id, targetId: target.id, resumeAfter: "none" };
    event(game, `${target.name} 正在决定是否支付 2 Joy 反制【真心话大冒险】。`);
  } else if (card.name === "美妆博主") {
    const resolvedSide = action.requiredReading ?? simSide(actor);
    if (resolvedSide === "male") actor.joy += 2;
    else {
      const revealed = game.deck.splice(0, Math.min(3, game.deck.length));
      game.beautyOffer = { playerId: actor.id, revealed };
      event(game, `${actor.name} 展示牌堆顶 ${revealed.length} 张牌，正在选择是否立即打出其中一张呈现。`);
    }
  } else if (card.name === "翻箱倒柜") {
    const returned = game.market.length;
    game.deck = shuffle([...game.deck, ...game.market]);
    game.market = [];
    game.locks = {};
    refill(game);
    game.phase = "draw";
    event(game, `${actor.name} 将 ${returned} 张公共牌洗回暗牌并重抽公共牌列，可以再次拿牌并出牌。`);
  } else if (card.name === "试用代词") {
    const identities: SimIdentity[] = ["male", "female", "nonbinary"];
    actor.tempIdentity = identities[Math.floor(Math.random() * identities.length)];
    actor.tempIdentityExpiresAfterTurn = actor.turns + 2;
    actor.joy += 1;
    const readingNote = actor.tempIdentity === "nonbinary" ? `，二元读取保持为${actor.reading === "male" ? "蓝" : "粉"}` : "";
    event(game, `${actor.name} 暂时成为${actor.tempIdentity === "male" ? "男性" : actor.tempIdentity === "female" ? "女性" : "非二元"}${readingNote}，并获得 1 Joy。`);
  } else if (card.name === "程序员") {
    if (actor.presents.some((held) => held.name === "皱巴巴的格子衬衫")) {
      actor.joy += 2;
      recordScoreSource(actor, card.name, 2);
    }
  } else if (card.name === "变装皇后") {
    if (actor.presents.some((held) => held.name === "一支商标模糊的口红") && actor.presents.some((held) => held.name === "美甲")) {
      actor.joy += 2;
      recordScoreSource(actor, card.name, 2);
    }
  } else if (card.name === "女装店老板") {
    const clothingKinds = new Set(game.players.flatMap((player) => player.presents.filter(simCardIsClothing).map((held) => held.name)));
    const gainedJoy = simShopOwnerJoy(clothingKinds.size, game.rules);
    actor.joy += gainedJoy;
    recordScoreSource(actor, card.name, gainedJoy);
  } else if (card.name === "空间主理人") {
    const gainedJoy = game.players.filter((player) => resolvedCheckCount(action, player) >= 2).length;
    actor.joy += gainedJoy;
    recordScoreSource(actor, card.name, gainedJoy);
  } else if (card.name === "伪娘团" && target) {
    const actorSide = simSide(actor);
    const targetSide = simSide(target);
    const actorChecks = resolvedCheckCount(action, actor);
    const targetChecks = resolvedCheckCount(action, target);
    if (actorSide === "male" && targetSide === "male" && actorChecks >= 2 && targetChecks >= 2) {
      actor.joy += 2;
      target.joy += 2;
      recordScoreSource(actor, card.name, 2);
      recordScoreSource(target, card.name, 2);
      event(game, `${actor.name} 与 ${target.name} 连接【伪娘团】，双方均为蓝读取且检定数至少为 2，各获得 2 Joy。`);
    } else {
      event(game, `${actor.name} 对 ${target.name} 使用【伪娘团】，但未满足双方均为蓝读取且检定数至少为 2 的条件，未能获得 Joy。`);
    }
  } else if (card.name === "你pass吗？" && target) {
    const count = resolvedCheckCount(action, target);
    const side = simSide(target);
    if (side === "male" && count >= 3) applyTemporaryIdentity(game, actor, target, "female", card.name);
    else if (side === "female" && count <= 1) applyTemporaryIdentity(game, actor, target, "male", card.name);
    else event(game, `${target.name} 当前为${side === "male" ? "蓝" : "粉"}读取且有 ${count} 个检定，【你pass吗？】未改变其临时身份。`);
  } else if (card.name === "身份肯定" && target?.tempIdentity && !target.items.includes("改好证了！")) {
    const affirmed = target.tempIdentity;
    pushLongTermIdentity(game, target, affirmed, affirmed === "nonbinary" ? target.reading : affirmed);
    target.tempIdentity = null;
    target.tempIdentityExpiresAfterTurn = null;
    event(game, `${actor.name} 对 ${target.name} 使用【身份肯定】；其长期公开身份固定为${affirmed === "male" ? "男性" : affirmed === "female" ? "女性" : `非二元（${target.reading === "male" ? "蓝" : "粉"}读取）`}，临时状态结束。`);
  } else if (card.name === "开个小证") { actor.items.push("小证"); actor.certificateReady = true; }
  else if (card.name === "学吉他" && target) { actor.joy += 1; target.joy += 1; actor.items.push("吉他"); }
  else if (card.name === "自由职业者") { actor.joy += 1; actor.items.push("自由职业者"); }
  else if (card.name === "改好证了！") { actor.joy += 1; actor.items.push("改好证了！"); }
  else if (card.name === "老男人看了你一眼" && target) {
    const count = resolvedCheckCount(action, target); const side = simSide(target);
    if (side === "male" && count >= 1 && count <= 2) loseJoy(target);
    if (side === "male" && count >= 3) applyTemporaryIdentity(game, actor, target, "female", card.name);
    if (side === "female" && count >= 3) loseJoy(target);
  } else if (card.name === "厌女症") {
    const counts = game.players.map((player) => resolvedCheckCount(action, player));
    const max = Math.max(...counts);
    if (max > 0) game.players.forEach((player) => { if (counts[player.id] === max) loseJoy(player); });
  } else if (card.name === "职场 Dress Code") {
    if (!game.dei) {
      const preserveChoices: number[] = [];
      game.players.filter((player) => !player.items.includes("自由职业者")).forEach((player) => {
      if (simSide(player) === "male") {
        const checkedPresents = player.presents.filter(simCardChecked);
        if (player.ambiguityCard?.name === "扑朔迷离" && checkedPresents.length > 0) preserveChoices.push(player.id);
        else checkedPresents.forEach((held) => removePresent(game, player, held));
      } else if (resolvedCheckCount(action, player) < 2) loseJoy(player);
      });
      if (preserveChoices.length > 0) game.dressCodeOffer = { actorId: actor.id, playerIds: preserveChoices, index: 0 };
    }
  } else if (card.name === "职场 DEI") { game.players.filter((player) => !player.items.includes("自由职业者")).forEach((player) => { player.joy += 1; }); game.dei = true; }
  else if (card.kind === "venue") {
    if (game.venue) game.discard.push(game.venue.card);
    game.venue = {
      card,
      ownerId: actor.id,
      expiresAfterOwnerTurn: actor.turns + 2,
      abilityUsedBy: [],
      ...(card.name === "漫展" ? { manzhanWhiteModes: {}, manzhanWhiteModeTurns: {}, manzhanPinkHandledTurns: {} } : {}),
    };
    const manzhanWhitePlayerIds = card.name === "漫展"
      ? game.players.filter(isCurrentlyNonbinary).map((player) => player.id)
      : [];
    game.manzhanOpeningChoice = manzhanWhitePlayerIds.length > 0
      ? { playerIds: manzhanWhitePlayerIds, index: 0 }
      : null;
    event(game, `场地【${card.name}】生效至 ${actor.name} 的下回合结束。`);
  } else if (card.name === "扑朔迷离" || card.name === "先入为主") {
    if (actor.ambiguityCard) game.discard.push(actor.ambiguityCard);
    actor.ambiguityCard = card;
    event(game, `${actor.name} 将【${card.name}】留在面前；长期身份改变时移除。`);
  }
}

function expireTemporaryChecks(player: SimPlayer) {
  player.presents.forEach((card) => {
    if (card.checkOverrideExpiresAfterTurn === undefined || player.turns < card.checkOverrideExpiresAfterTurn) return;
    const returnsChecked = Boolean(card.checked);
    delete card.checkOverride;
    delete card.checkOverrideExpiresAfterTurn;
    card.checkAnimationVersion = (card.checkAnimationVersion ?? 0) + 1;
    card.checkAnimationKind = returnsChecked ? "checked" : "unchecked";
  });
}

function expireTemporaryIdentity(game: SimGame, player: SimPlayer) {
  if (!player.tempIdentity) return;
  if (player.tempIdentityExpiresAfterTurn !== null && player.turns < player.tempIdentityExpiresAfterTurn) return;
  player.tempIdentity = null;
  player.tempIdentityExpiresAfterTurn = null;
}

function expireVenueAtEndOfTurn(game: SimGame, player: SimPlayer) {
  if (game.venue?.ownerId !== player.id || player.turns < game.venue.expiresAfterOwnerTurn) return;
  const expired = game.venue.card;
  game.discard.push(expired);
  game.venue = null;
  game.manzhanOpeningChoice = null;
  game.manzhanPinkPrompt = null;
  event(game, `${player.name} 的下回合结束，场地【${expired.name}】失效。`);
}

function advanceVisualClock(game: SimGame) {
  game.turnSerial += 1;
  game.players.forEach((player) => {
    player.removedPresents = player.removedPresents.filter((entry) => game.turnSerial < entry.untilTurnSerial);
  });
}

function advanceTurn(game: SimGame) {
  const leaving = game.players[game.active];
  leaving.turns += 1;
  expireTemporaryIdentity(game, leaving);
  expireTemporaryChecks(leaving);
  expireVenueAtEndOfTurn(game, leaving);
  advanceVisualClock(game);
  const equal = game.players.every((player) => player.turns === game.players[0].turns);
  if (game.finishing && equal) { game.phase = "ended"; event(game, "完成当前轮：AI 观战局结束。 "); return; }
  let nextId = (game.active + 1) % game.players.length;
  if (nextId === 0) game.round += 1;
  let guard = 0;
  while (game.players[nextId].skip > 0 && guard < 4) {
    const skipped = game.players[nextId];
    skipped.skip -= 1; skipped.turns += 1; expireTemporaryIdentity(game, skipped);
    expireTemporaryChecks(skipped);
    advanceVisualClock(game);
    event(game, `${skipped.name} 因【迷茫】跳过回合。`);
    expireVenueAtEndOfTurn(game, skipped);
    nextId = (nextId + 1) % game.players.length;
    if (nextId === 0) game.round += 1;
    guard += 1;
  }
  game.active = nextId;
  Object.entries(game.locks).forEach(([cardId, ownerId]) => { if (ownerId === nextId) delete game.locks[cardId]; });
  game.phase = "draw";
}

function finishVenueExchangeParticipant(game: SimGame) {
  const exchange = game.venueExchange!;
  exchange.index += 1;
  if (exchange.index < exchange.playerIds.length) {
    beginFulingtaExchangeParticipant(game);
    return;
  }
  game.venueExchange = null;
  advanceTurn(game);
}

function beginFulingtaExchangeParticipant(game: SimGame) {
  const exchange = game.venueExchange!;
  const player = game.players[exchange.playerIds[exchange.index]];
  const requestedDraws = exchange.index === 0 ? 2 : 1;
  let drawn = 0;
  while (drawn < requestedDraws) {
    const card = drawTop(game);
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  exchange.discardRemaining = drawn;
  if (drawn > 0) {
    event(game, `${player.name} 因【福灵塔】摸 ${drawn} 张，现在需弃 ${drawn} 张。`);
  } else {
    finishVenueExchangeParticipant(game);
  }
}

function startFulingtaExchange(game: SimGame, actor: SimPlayer, action: SimAction) {
  const currentIdentity = actor.tempIdentity ?? actor.identity;
  if (game.venue?.card.name !== "福灵塔" || currentIdentity === "male" || action.targetId === undefined || action.targetId === actor.id) return false;
  const target = game.players[action.targetId];
  if (currentIdentity === "nonbinary") recordFirstWhiteEffect(game, actor, "福灵塔");
  game.venueExchange = { playerIds: [actor.id, target.id], index: 0, stage: "discard", discardRemaining: 0 };
  event(game, `【福灵塔】触发：${actor.name} 摸 2 弃 2；${target.name} 随后摸 1 弃 1。`);
  beginFulingtaExchangeParticipant(game);
  return true;
}

export function applyLegalAction(current: SimGame, action: SimAction): SimGame {
  const game = clone(current);
  const legal = enumerateLegalActions(current).some((candidate) => candidate.id === action.id);
  if (!legal) {
    warn(game, `规则引擎拒绝非法动作：${action.label}`);
    return game;
  }
  if (action.type === "reading-keep" || action.type === "reading-switch") {
    const prompt = game.readingPrompt!;
    const check = prompt.checks[prompt.index];
    const player = game.players[check.playerId];
    if (action.type === "reading-switch") {
      loseJoy(player);
      player.reading = player.reading === "male" ? "female" : "male";
      if (player.identity === "nonbinary") syncCurrentIdentityLayer(player);
      event(game, `${player.name} 支付 1 Joy，将非二元读取永久切为${player.reading === "male" ? "蓝" : "粉"}，再结算【${check.sourceName}】。`);
    } else {
      event(game, `${player.name} 保持${player.reading === "male" ? "蓝" : "粉"}读取，结算【${check.sourceName}】。`);
    }
    prompt.index += 1;
    if (prompt.index < prompt.checks.length) return game;
    const pendingAction = { ...prompt.pendingAction, readingChecked: true };
    game.readingPrompt = null;
    return applyLegalAction(game, pendingAction);
  }
  if (action.type === "check-count-select") {
    const prompt = game.checkCountPrompt!;
    const check = prompt.checks[prompt.index];
    const player = game.players[check.playerId];
    prompt.declaredCounts[player.id] = action.selectedCheckCount!;
    if (player.ambiguityCard && isCurrentlyNonbinary(player)) recordFirstWhiteEffect(game, player, player.ambiguityCard.name);
    event(game, `${player.name} 令本次检定数${action.checkCountAdjustment === 1 ? "+1" : "−1"}，【${check.sourceName}】按 ${action.selectedCheckCount} 个检定结算。`);
    prompt.index += 1;
    if (prompt.index < prompt.checks.length) return game;
    const pendingAction = { ...prompt.pendingAction, declaredChecks: { ...prompt.declaredCounts }, checkCountChecked: true };
    game.checkCountPrompt = null;
    return applyLegalAction(game, pendingAction);
  }
  if (action.type === "dress-code-preserve" || action.type === "dress-code-discard-all") {
    const offer = game.dressCodeOffer!;
    const player = game.players[offer.playerIds[offer.index]];
    const preserved = action.type === "dress-code-preserve"
      ? player.presents.find((present) => present.id === action.presentId)
      : undefined;
    player.presents.filter((present) => simCardChecked(present) && present.id !== preserved?.id)
      .forEach((present) => removePresent(game, player, present));
    event(game, preserved
      ? `${player.name} 因【扑朔迷离】保留【${preserved.name}】，其余检定呈现因【职场 Dress Code】弃置。`
      : `${player.name} 不使用【扑朔迷离】保留呈现，全部检定呈现因【职场 Dress Code】弃置。`);
    offer.index += 1;
    if (offer.index >= offer.playerIds.length) {
      game.dressCodeOffer = null;
      advanceTurn(game);
    }
    return game;
  }
  const readingChecks = readingChecksFor(current, action);
  if (readingChecks.length) {
    game.readingPrompt = { checks: readingChecks, index: 0, pendingAction: action };
    const first = readingChecks[0];
    event(game, `${game.players[first.playerId].name} 即将被【${first.sourceName}】判断身份，可先改变非二元读取。`);
    return game;
  }
  const checkCountChecks = checkCountChecksFor(current, action);
  if (checkCountChecks.length) {
    game.checkCountPrompt = { checks: checkCountChecks, index: 0, pendingAction: action, declaredCounts: {} };
    const first = checkCountChecks[0];
    event(game, `${game.players[first.playerId].name} 可决定【${first.sourceName}】本次读取到几个检定。`);
    return game;
  }
  if (action.type === "certificate-pass" || action.type === "certificate-claim") {
    const offer = game.certificateOffer!;
    const owner = game.players[offer.playerId];
    const resumeAfter = offer.resumeAfter;
    game.certificateOffer = null;
    if (action.type === "certificate-pass") {
      game.market.push(offer.card);
      event(game, `${owner.name} 放行【她】进入公共牌列；小证的截获能力继续保留。`);
    } else {
      const discarded = owner.hand.find((card) => card.id === action.cardId)!;
      owner.hand = owner.hand.filter((card) => card.id !== discarded.id);
      game.discard.push(discarded);
      owner.hand.push(offer.card);
      owner.certificateReady = false;
      event(game, `${owner.name} 弃置【${discarded.name}】，用小证将【她】换入手牌；小证物件继续保留。`);
    }
    refill(game);
    if (resumeAfter === "advance-turn") advanceTurn(game);
    else if (resumeAfter === "fitting-room-fulingta") {
      const resumeActor = game.players[offer.resumeActorId!];
      const resumeTargetId = offer.resumeTargetId!;
      if (!startFulingtaExchange(game, resumeActor, { ...action, targetId: resumeTargetId })) advanceTurn(game);
    }
    return game;
  }
  if (action.type === "truth-allow" || action.type === "truth-resist") {
    const offer = game.truthOffer!;
    const actor = game.players[offer.actorId];
    const target = game.players[offer.targetId];
    const resumeAfter = offer.resumeAfter;
    game.truthOffer = null;
    if (action.type === "truth-resist") {
      loseJoy(target, 2);
      event(game, `${target.name} 支付 2 Joy 反制；${actor.name} 未能查看目标，改为 ${target.name} 查看 ${actor.name} 的目标。`);
    } else {
      event(game, `${target.name} 不反制；${actor.name} 查看了 ${target.name} 的目标。`);
    }
    if (resumeAfter === "advance-turn" && !startFulingtaExchange(game, actor, { ...action, targetId: offer.targetId })) advanceTurn(game);
    return game;
  }
  if (action.type === "confusion-pay" || action.type === "confusion-discard" || action.type === "confusion-skip") {
    const offer = game.confusionOffer!;
    const actor = game.players[offer.actorId];
    const target = game.players[offer.targetId];
    const resumeAfter = offer.resumeAfter;
    game.confusionOffer = null;
    if (action.type === "confusion-pay") {
      loseJoy(target);
      event(game, `${target.name} 支付 1 Joy，取消【迷茫】的其余影响。`);
    } else if (action.type === "confusion-discard") {
      const present = target.presents.find((held) => held.id === action.presentId)!;
      removePresent(game, target, present);
      event(game, `${target.name} 因【迷茫】选择弃置【${present.name}】。`);
    } else {
      target.skip += 1;
      event(game, `${target.name} 因【迷茫】选择跳过自己的下回合。`);
    }
    if (resumeAfter === "advance-turn" && !startFulingtaExchange(game, actor, { ...action, targetId: offer.targetId })) advanceTurn(game);
    return game;
  }
  if (action.type === "beauty-blogger-play" || action.type === "beauty-blogger-pass") {
    const offer = game.beautyOffer!;
    const offerActor = game.players[offer.playerId];
    const selected = action.type === "beauty-blogger-play"
      ? offer.revealed.find((card) => card.id === action.presentId)
      : undefined;
    game.deck.push(...offer.revealed.filter((card) => card.id !== selected?.id));
    game.beautyOffer = null;
    if (selected && action.targetId !== undefined) {
      const target = game.players[action.targetId];
      gainPresent(game, selected, target.id);
      grantCrushJoy(game, offerActor, target.id, selected.name);
      triggerJiraiRetaliation(game, offerActor, target, selected.name);
      event(game, `${offerActor.name} 从展示牌中立即打出【${selected.name}】给 ${target.name}，其余牌置于牌堆底。`);
    } else {
      event(game, `${offerActor.name} 没有打出展示牌；3 张牌按原顺序置于牌堆底。`);
    }
    if (game.deck.length === 0) game.finishing = true;
    if (!startFulingtaExchange(game, offerActor, action)) advanceTurn(game);
    return game;
  }
  if (action.type === "fitting-room-fizzle") {
    const offer = game.fittingRoomOffer!;
    const actor = game.players[offer.actorId];
    game.deck = [...offer.revealed, ...game.deck];
    if (game.deck.length === 0) game.finishing = true;
    game.fittingRoomOffer = null;
    event(game, `${actor.name} 的【闺蜜试衣间】没买到衣服；牌效空出。`);
    if (!startFulingtaExchange(game, actor, { ...action, targetId: offer.targetId })) advanceTurn(game);
    return game;
  }
  if (action.type === "fitting-room-select") {
    const offer = game.fittingRoomOffer!;
    const selectedIds = new Set(action.presentIds ?? []);
    const selected: SimCard[] = [];
    for (const id of selectedIds) {
      const marketCard = takeMarketWithoutRefill(game, id);
      const revealedCard = offer.revealed.find((card) => card.id === id);
      const card = marketCard ?? revealedCard;
      if (card?.kind === "present") selected.push(card);
    }
    const returned = offer.revealed.filter((card) => !selectedIds.has(card.id));
    game.deck = [...returned, ...game.deck];
    if (game.deck.length === 0) game.finishing = true;
    offer.revealed = [];
    offer.selected = selected;
    offer.stage = "allocate";
    event(game, `${game.players[offer.actorId].name} 选出【${selected[0].name}】与【${selected[1].name}】；现在由 ${game.players[offer.targetId].name} 分配。`);
    return game;
  }
  if (action.type === "fitting-room-allocate") {
    const offer = game.fittingRoomOffer!;
    const actor = game.players[offer.actorId];
    const target = game.players[offer.targetId];
    const actorCard = offer.selected.find((card) => card.id === action.presentId)!;
    const targetCard = offer.selected.find((card) => card.id !== actorCard.id)!;
    game.fittingRoomOffer = null;
    gainPresent(game, actorCard, actor.id);
    gainPresent(game, targetCard, target.id);
    event(game, `${target.name} 将【${actorCard.name}】分给 ${actor.name}，自己获得【${targetCard.name}】；双方立即打出，衣物覆盖正常结算。`);
    refill(game);
    if (game.certificateOffer) {
      game.certificateOffer.resumeAfter = "fitting-room-fulingta";
      game.certificateOffer.resumeActorId = actor.id;
      game.certificateOffer.resumeTargetId = target.id;
    } else if (!startFulingtaExchange(game, actor, { ...action, targetId: target.id })) {
      advanceTurn(game);
    }
    return game;
  }
  if (action.type === "venue-exchange-discard") {
    const exchange = game.venueExchange!;
    const player = game.players[exchange.playerIds[exchange.index]];
    const discarded = player.hand.find((card) => card.id === action.cardId)!;
    player.hand = player.hand.filter((card) => card.id !== action.cardId);
    game.discard.push(discarded);
    exchange.discardRemaining -= 1;
    event(game, `${player.name} 因【福灵塔】弃置【${discarded.name}】${exchange.discardRemaining > 0 ? `，还需弃 ${exchange.discardRemaining} 张` : ""}。`);
    if (exchange.discardRemaining <= 0) finishVenueExchangeParticipant(game);
    return game;
  }
  if (action.type === "venue-manzhan-mode") {
    const venue = game.venue!;
    const openingChoice = game.manzhanOpeningChoice;
    const chooser = openingChoice
      ? game.players[openingChoice.playerIds[openingChoice.index]]
      : game.players[game.active];
    venue.manzhanWhiteModes ??= {};
    venue.manzhanWhiteModeTurns ??= {};
    venue.manzhanWhiteModes[chooser.id] = action.venueMode!;
    venue.manzhanWhiteModeTurns[chooser.id] = chooser.turns;
    recordFirstWhiteEffect(game, chooser, "漫展");
    if (openingChoice) {
      event(game, `${chooser.name} 在【漫展】打开时选择本场地使用${action.venueMode === "blue" ? "蓝色" : "粉色"}效果。`);
      openingChoice.index += 1;
      if (openingChoice.index >= openingChoice.playerIds.length) {
        game.manzhanOpeningChoice = null;
        advanceTurn(game);
      }
      return game;
    }
    if (action.venueMode === "pink") game.manzhanPinkPrompt = { playerId: chooser.id };
    event(game, `${chooser.name} 本回合选择执行【漫展】${action.venueMode === "blue" ? "蓝色" : "粉色"}效果。`);
    return game;
  }
  const actor = game.players[game.active];
  if (action.type === "venue-manzhan-use") {
    game.manzhanPinkPrompt = { playerId: actor.id };
    event(game, `${actor.name} 决定使用【漫展】的粉色效果。`);
    return game;
  }
  if (action.type === "venue-manzhan-pass") {
    game.venue!.manzhanPinkHandledTurns ??= {};
    game.venue!.manzhanPinkHandledTurns[actor.id] = actor.turns;
    event(game, `${actor.name} 本回合不使用【漫展】。`);
    return game;
  }
  if (action.type === "venue-manzhan-move") {
    const source = game.players[action.sourcePlayerId!];
    const target = game.players[action.targetId!];
    const moved = source.presents.find((card) => card.id === action.presentId)!;
    source.presents = source.presents.filter((card) => card.id !== moved.id);
    source.removedPresents.push({ card: { ...moved }, untilTurnSerial: game.turnSerial + 2 });
    delete moved.checkOverride;
    delete moved.checkOverrideExpiresAfterTurn;
    moved.checkAnimationKind = moved.checked ? "checked" : "unchecked";
    moved.checkAnimationVersion = (moved.checkAnimationVersion ?? 0) + 1;
    gainPresent(game, moved, target.id);
    if ((actor.tempIdentity ?? actor.identity) === "nonbinary") recordFirstWhiteEffect(game, actor, "漫展");
    actor.joy += 1;
    source.joy += 1;
    game.venue!.manzhanPinkHandledTurns ??= {};
    game.venue!.manzhanPinkHandledTurns[actor.id] = actor.turns;
    game.manzhanPinkPrompt = null;
    event(game, `${actor.name} 因【漫展】将 ${source.name} 的【${moved.name}】移给 ${target.name}；${actor.name} 与原持有者各获得 1 Joy${source.id === actor.id ? "（由同一人获得，共 +2 Joy）" : ""}。`);
    return game;
  }
  if (action.type === "venue-convert") {
    const clearedTemporaryIdentity = actor.tempIdentity !== null;
    pushLongTermIdentity(game, actor, action.venueIdentity!, action.venueIdentity === "female" ? "female" : "male");
    actor.tempIdentity = null;
    actor.tempIdentityExpiresAfterTurn = null;
    game.venue!.abilityUsedBy.push(actor.id);
    event(game, `${actor.name} 使用【福灵塔】，长期身份变为${action.venueIdentity === "female" ? "女性" : "非二元（蓝读取）"}${clearedTemporaryIdentity ? "，当前临时身份同时结束" : ""}。`);
    return game;
  }
  if (action.type === "draw-blind") {
    const card = drawTop(game); if (card) actor.hand.push(card);
    game.phase = "play"; event(game, `${actor.name} 暗摸 1 张。`); return game;
  }
  if (action.type === "draw-market") {
    const card = removeMarket(game, action.marketCardId); if (card) actor.hand.push(card);
    game.phase = "play"; event(game, `${actor.name} 明拿【${card?.name}】。`); return game;
  }
  if (action.type === "skip-draw") {
    if (actor.hand.length) {
      game.phase = "play";
      event(game, `${actor.name} 无牌可拿，直接进入出牌阶段。`);
    } else {
      event(game, `${actor.name} 无牌可拿且没有手牌，本回合自动结束。`);
      advanceTurn(game);
    }
    return game;
  }

  const forcedCard = game.forcedPlay?.card.id === action.cardId ? game.forcedPlay.card : null;
  const card = forcedCard ?? actor.hand.find((held) => held.id === action.cardId)!;
  const fizzled = action.id.endsWith(":fizzle") || action.id.endsWith(":forced-fizzle");
  const grantsExtraAction = !fizzled && card.name === "翻箱倒柜";
  const grantsManzhanBluePlay = !fizzled
    && card.kind === "present"
    && simCardChecked(card)
    && action.targetId === actor.id
    && manzhanEffectFor(game, actor) === "blue";
  const triggersCrushJoy = !fizzled
    && card.name !== "心动夸夸"
    && action.targetId !== undefined
    && actor.crushTargetId === action.targetId;
  if (forcedCard) game.forcedPlay = null;
  else actor.hand = actor.hand.filter((held) => held.id !== card.id);
  if (!fizzled) resolvePlay(game, action, card);
  if (triggersCrushJoy) grantCrushJoy(game, actor, action.targetId!, card.name);
  if (!fizzled && action.targetId !== undefined) triggerJiraiRetaliation(game, actor, game.players[action.targetId], card.name);
  if (fizzled || (card.kind !== "present" && card.kind !== "venue" && !["开个小证", "学吉他", "自由职业者", "改好证了！", "封心锁爱", "地雷系", "职场 DEI", "扑朔迷离", "先入为主"].includes(card.name))) game.discard.push(card);
  event(game, forcedCard ? `${actor.name} 立即${action.label}。` : `${actor.name} ${action.label}。`);
  if (grantsManzhanBluePlay) {
    if ((actor.tempIdentity ?? actor.identity) === "nonbinary") recordFirstWhiteEffect(game, actor, "漫展");
    game.phase = "draw";
    event(game, `${actor.name} 触发【漫展】蓝色效果：该检定呈现不计正常出牌，重新进入拿牌阶段；拿牌后仍可完成正常出牌。`);
  }
  if (game.certificateOffer) game.certificateOffer.resumeAfter = grantsExtraAction || grantsManzhanBluePlay ? "none" : game.forcedPlay ? "forced-play" : "advance-turn";
  else if (game.truthOffer) game.truthOffer.resumeAfter = grantsExtraAction ? "none" : "advance-turn";
  else if (game.confusionOffer) game.confusionOffer.resumeAfter = grantsExtraAction ? "none" : "advance-turn";
  else if (!game.beautyOffer && !game.fittingRoomOffer && !game.forcedPlay && !game.manzhanOpeningChoice && !game.dressCodeOffer && !grantsExtraAction && !grantsManzhanBluePlay && !startFulingtaExchange(game, actor, action)) advanceTurn(game);
  return game;
}
