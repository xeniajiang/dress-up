"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent, type ReactNode, type WheelEvent } from "react";
import {
  applyLegalAction,
  compareFinalStanding,
  createSimGame,
  decisionPlayerId,
  enbyScoringSmallItems,
  enumerateLegalActions,
  finalScoreBreakdown,
  knowledgeEventsFor,
  projectedScore,
  simCardChecked,
  simChecks,
  sharesFinalStanding,
  visibleStateFor,
  type SimAction,
  type SimCard,
  type SimGame,
  type SimGoal,
  type SimPlayer,
} from "../lib/ai-engine";
import {
  applyKnowledgeEvents,
  chooseHeuristicAction,
  createAiMemories,
  formatDecisionLog,
  observePublicAction,
  type AiMemory,
} from "../lib/heuristic-ai";

type Mode = "spectate" | "solo";
type PendingPronoun = { action: SimAction; actorId: number; cardName: "她" | "他" };
type TruthReveal = { observerId: number; targetId: number; goal: SimGoal; version: number };
type GoalSwapTransition = { actorId: number; targetId: number; humanGoal?: SimGoal; duration: number; version: number };
type PlayedCardTransition = {
  card: SimCard;
  actorId: number;
  destination: "fade" | "public" | "player";
  duration: number;
  version: number;
};
type FittingRoomNotice = { actorId: number; version: number };
type BoardMoveSelection = { presentId: string; sourcePlayerId: number };

const DEFAULT_AI_NAMES = ["欣娅", "花雨", "晓山", "姬姐"];
const DEFAULT_SOLO_NAMES = ["欣娅", "花雨", "晓山", "姬姐"];

function shortName(name: string) {
  return name
    .replace("一支商标模糊的", "")
    .replace("家里翻到的古老", "")
    .replace("商场专柜里的", "")
    .replace("亲戚给的宽大", "")
    .replace("皱巴巴的", "");
}

function identityHistoryFor(player: SimPlayer) {
  const history = player.identityHistory?.length
    ? player.identityHistory
    : [{ identity: player.identity, reading: player.reading }];
  return history.at(-1)?.identity === player.identity
    ? history
    : [{ identity: player.identity, reading: player.reading }];
}

function identityLayerLabel(identity: SimPlayer["identity"], reading: SimPlayer["reading"]) {
  if (identity === "male") return "🔵 男性";
  if (identity === "female") return "🔴 女性";
  return `⚪ 非二元 · ${reading === "male" ? "蓝" : "粉"}读`;
}

function IdentityHistoryStack({ player, superseded = false }: { player: SimPlayer; superseded?: boolean }) {
  const history = identityHistoryFor(player);
  return <div className={`identity-history-stack${superseded ? " is-superseded" : ""}`} aria-label={`长期身份历史：${history.map((layer) => identityLayerLabel(layer.identity, layer.reading).replace(/^[^ ]+ /, "")).join(" → ")}`}>
    {history.map((layer, index) => <span
      className={`identity-pill identity-history-token identity-${layer.identity}${index === history.length - 1 ? " is-current" : ""}`}
      style={{ zIndex: index + 1 }}
      title={`${index === history.length - 1 ? "当前长期身份" : `第 ${index + 1} 层长期身份`}：${identityLayerLabel(layer.identity, layer.reading).replace(/^[^ ]+ /, "")}`}
      key={`${index}-${layer.identity}-${layer.reading}`}
    >{identityLayerLabel(layer.identity, layer.reading)}</span>)}
  </div>;
}

const CARD_IMAGES: Record<string, string> = {
  长发: "/assets/presentations/hair.png",
  美甲: "/assets/presentations/nails.png",
  一支商标模糊的口红: "/assets/presentations/lipstick.png",
  家里翻到的古老碎花裙: "/assets/presentations/floral-dress.png",
  商场专柜里的裙子: "/assets/presentations/mall-dress.png",
  亚文化裙裤: "/assets/presentations/culottes.png",
  亲戚给的宽大卫衣: "/assets/presentations/hoodie.png",
  皱巴巴的格子衬衫: "/assets/presentations/plaid-shirt.png",
  学吉他: "/assets/presentations/guitar.png",
  吉他: "/assets/presentations/guitar.png",
  开个小证: "/assets/cards/certificate-document.png",
  小证: "/assets/cards/certificate-document.png",
  "职场 Dress Code": "/assets/cards/workplace-dress-code-pictogram.png",
  "职场 DEI": "/assets/actions/workplace-dei-open.png",
  美妆博主: "/assets/actions/beauty-blogger.png",
  "你pass吗？": "/assets/actions/pass-question.png",
  心动夸夸: "/assets/actions/crush-compliment-badge.png",
  封心锁爱: "/assets/actions/closed-heart-keepsake-box.png",
  地雷系: "/assets/actions/jirai-kei-outfit.png",
  迷茫: "/assets/actions/confusion-path.png",
  身份肯定: "/assets/actions/temporary-identity-fixed.png",
  翻箱倒柜: "/assets/actions/rummage-drawer.png",
  共享衣橱: "/assets/actions/shared-wardrobe.png",
  闺蜜试衣间: "/assets/actions/bestie-fitting-room.png",
  打烊: "/assets/actions/closing-shutter.png",
  试用代词: "/assets/actions/pronoun-tryout.png",
  扑朔迷离: "/assets/actions/gender-ambiguity-v2.png",
  先入为主: "/assets/actions/first-impression-v2.png",
  "换一种活法": "/assets/actions/new-life-path.png",
  detrans: "/assets/actions/detrans-identity-layers.png",
  爱美之心: "/assets/actions/self-admiration-mirror.png",
  厌女症: "/assets/actions/misogyny-pressure.png",
  真心话大冒险: "/assets/actions/truth-or-dare-cards.png",
  理发: "/assets/actions/haircut-action.png",
  卸甲: "/assets/actions/nail-removal-action.png",
  老男人看了你一眼: "/assets/actions/older-man-glance.png",
  程序员: "/assets/actions/programmer.png",
  变装皇后: "/assets/actions/drag-queen.png",
  女装店老板: "/assets/actions/womenswear-shop-owner.png",
  自由职业者: "/assets/actions/freelancer.png",
  "改好证了！": "/assets/actions/id-corrected.png",
  空间主理人: "/assets/actions/space-organizer.png",
  伪娘团: "/assets/actions/femboy-group.png",
  她: "/assets/cards/she-her-pin.png",
  他: "/assets/cards/he-him-pin.png",
};

const VENUE_CARD_IMAGES: Record<string, string> = {
  "全女空间！": "/assets/venues/women-space-v2.png",
  福灵塔: "/assets/venues/flinta-v1.png",
  漫展: "/assets/venues/anime-convention-card-v3.png",
};

const VENUE_BANNER_IMAGES: Record<string, string> = {
  "全女空间！": "/assets/venues/women-space-v2.png",
  福灵塔: "/assets/venues/flinta-v1.png",
  漫展: "/assets/venues/anime-convention-v2.png",
};

function cardImage(name: string) {
  return CARD_IMAGES[name];
}

function venueCardImage(name: string) {
  return VENUE_CARD_IMAGES[name];
}

function venueBannerImage(name: string) {
  return VENUE_BANNER_IMAGES[name];
}

function venueCardImagePosition(name: string) {
  if (name === "福灵塔") return "70% center";
  return "center";
}

function cardClass(kind: string, checked?: boolean) {
  if (kind === "present") return checked ? "card-pink" : "card-cream";
  if (kind === "venue") return "card-white";
  return "card-ink";
}

function cardGlyph(name: string) {
  if (name.includes("长发")) return "〰";
  if (name.includes("口红")) return "💄";
  if (name.includes("美甲")) return "💅";
  if (name.includes("裙裤")) return "👖";
  if (name.includes("裙")) return "👗";
  if (name.includes("卫衣")) return "🧥";
  if (name.includes("格子衬衫")) return "👔";
  if (name.includes("吉他")) return "🎸";
  if (name.includes("小证")) return "🪪";
  if (name === "她") return "她";
  if (name === "他") return "他";
  if (name.includes("美妆")) return "✦";
  if (name.includes("福灵塔")) return "🏯";
  if (name.includes("漫展")) return "🎪";
  if (name.includes("全女空间")) return "♀";
  if (name === "心动夸夸") return "♥";
  if (name === "封心锁爱") return "锁";
  if (name === "地雷系") return "雷";
  if (name === "detrans") return "↶";
  if (name === "先入为主") return "◉";
  if (name === "程序员") return "⌨";
  if (name === "变装皇后") return "✦";
  if (name === "女装店老板") return "衣";
  if (name === "自由职业者") return "⌂";
  if (name === "改好证了！") return "证";
  if (name === "空间主理人") return "⌁";
  if (name === "伪娘团") return "双";
  return "✦";
}

function goalCriteria(player: SimPlayer) {
  const checks = simChecks(player);
  const feminine = player.presents.some((card) => card.dress || card.name === "一支商标模糊的口红");
  const has = (name: string) => player.presents.some((card) => card.name === name);
  if (player.goal === "文艺男") return [
    { text: "终局男性", points: "+3", done: player.identity === "male" },
    { text: "长发且检定不超过 2", points: "+8", done: has("长发") && checks <= 2 },
    { text: "拥有吉他", points: "+4", done: player.items.includes("吉他") },
    { text: `剩余 Joy（当前 ${player.joy}）`, points: `+${player.joy}`, done: player.joy > 0 },
  ];
  if (player.goal === "男娘") return [
    { text: "终局男性或非二元", points: "+4", done: player.identity !== "female" },
    { text: "裙装/口红且检定 ≥ 3", points: "+8", done: feminine && checks >= 3 },
    { text: "上述条件且检定 ≥ 4", points: "改为 +10", done: feminine && checks >= 4 },
    { text: `剩余 Joy（当前 ${player.joy}）`, points: `+${player.joy}`, done: player.joy > 0 },
  ];
  if (player.goal === "跨女") return [
    { text: "终局女性", points: "+4", done: player.identity === "female" },
    { text: "裙装/口红且检定 ≥ 3", points: "+8", done: feminine && checks >= 3 },
    { text: "拥有小证", points: "+4", done: player.items.includes("小证") },
    { text: `剩余 Joy（当前 ${player.joy}）`, points: `+${player.joy}`, done: player.joy > 0 },
  ];
  if (player.goal === "demi-girl") return [
    { text: "终局女性或非二元", points: "+4", done: player.identity !== "male" },
    { text: "裙装/口红且检定为 2–3", points: "+8", done: feminine && checks >= 2 && checks <= 3 },
    { text: "拥有小证", points: "+2", done: player.items.includes("小证") },
    { text: `剩余 Joy（当前 ${player.joy}）`, points: `+${player.joy}`, done: player.joy > 0 },
  ];
  const smallItems = enbyScoringSmallItems(player);
  const smallItemSummary = smallItems.length > 0 ? smallItems.join("、") : "无";
  return [
    { text: "终局非二元", points: "+4", done: player.identity === "nonbinary" },
    { text: "首次触发任意白色牌效", points: "+6", done: player.whiteEffects > 0 },
    { text: `小件：宽大卫衣或裙裤（衣物类只计 1 件）、吉他、小证；每件 +2，至多 +6。当前：${smallItemSummary}`, points: `+${smallItems.length * 2}`, done: smallItems.length > 0 },
    { text: `剩余 Joy（当前 ${player.joy}）`, points: `+${player.joy}`, done: player.joy > 0 },
  ];
}

function resultRouteTags(player: SimPlayer, scoredKeys: Set<string>) {
  const tags: string[] = [];
  if (player.goal === "文艺男") {
    if (scoredKeys.has("hair")) tags.push("长发");
    if (scoredKeys.has("guitar")) tags.push("吉他");
  } else if (player.goal === "男娘") {
    if (scoredKeys.has("presentation")) tags.push("裙装/口红");
  } else if (player.goal === "跨女" || player.goal === "demi-girl") {
    if (scoredKeys.has("presentation")) tags.push("裙装/口红");
    if (scoredKeys.has("certificate")) tags.push("小证");
  } else if (player.goal === "enby" && scoredKeys.has("small-items")) {
    tags.push(...enbyScoringSmallItems(player).map(shortName));
  }
  return Array.from(new Set(tags));
}

function resultStatusTags(player: SimPlayer) {
  return [
    ...player.items.filter((item) => item === "自由职业者" || item === "改好证了！" || item === "封心锁爱" || item === "地雷系"),
    ...(player.ambiguityCard ? [player.ambiguityCard.name] : []),
  ];
}

const BINARY_EFFECT_CARDS = new Set(["美妆博主", "你pass吗？", "老男人看了你一眼", "职场 Dress Code"]);
const TERNARY_EFFECT_CARDS = new Set(["扑朔迷离", "先入为主"]);

function isSplitCard(card: SimCard) {
  return BINARY_EFFECT_CARDS.has(card.name);
}

function isTernaryEffectCard(card: SimCard) {
  return TERNARY_EFFECT_CARDS.has(card.name);
}

function splitCardCopy(name: string) {
  if (name === "美妆博主") return { blue: "+2 Joy", pink: "展示牌堆顶 3 张；可立即打出其中一张呈现，其余沉底" };
  if (name === "你pass吗？") return { blue: "目标检定 ≥3：临时变为女性", pink: "目标检定 ≤1：临时变为男性" };
  if (name === "老男人看了你一眼") return { blue: "1–2 个检定：−1 Joy；≥3：临时变为女性", pink: "≥3 个检定：−1 Joy" };
  return { blue: "弃置所有检定呈现", pink: "检定不足 2：−1 Joy" };
}

type CheckAdjustment = 1 | -1 | "flex";

function CheckPip({ tone = "pink", className = "" }: { tone?: "pink" | "gray"; className?: string }) {
  return <i className={`check-pip check-pip-${tone}${className ? ` ${className}` : ""}`} aria-hidden="true">✦</i>;
}

function checkAdjustmentLabel(adjustment: CheckAdjustment) {
  if (adjustment === "flex") return "±1 ✦";
  return `${adjustment > 0 ? "+" : "−"}1 ✦`;
}

function CheckAdjustmentMark({ adjustment, className = "" }: { adjustment: CheckAdjustment; className?: string }) {
  const label = checkAdjustmentLabel(adjustment);
  return <span
    className={`check-adjustment-mark adjustment-${adjustment === "flex" ? "flex" : adjustment > 0 ? "positive" : "negative"}${className ? ` ${className}` : ""}`}
    title={label}
    aria-label={label}
  >
    {adjustment === "flex"
      ? <><CheckPip tone="gray" className="adjustment-star adjustment-star-gray" /><CheckPip className="adjustment-star adjustment-star-pink" /></>
      : <CheckPip tone={adjustment > 0 ? "pink" : "gray"} className="adjustment-star" />}
  </span>;
}

function ternaryCardCopy(name: string) {
  if (name === "扑朔迷离") return {
    blue: "检定数 +1",
    white: "每次检查时选择 +1 或 −1",
    pink: "检定数 −1",
  };
  return {
    blue: "检定数 −1",
    white: "每次检查时选择 +1 或 −1",
    pink: "检定数 +1",
  };
}

function ambiguityCheckAdjustment(cardName: string, identity: SimPlayer["identity"]): CheckAdjustment {
  if (identity === "nonbinary") return "flex";
  const blueAdjustment = cardName === "扑朔迷离" ? 1 : -1;
  return (identity === "male" ? blueAdjustment : -blueAdjustment) as 1 | -1;
}

function venueRuleCopy(name: string) {
  if (name === "全女空间！") return {
    blue: "不能明拿",
    pink: "新增检定呈现：+1 Joy",
  };
  if (name === "福灵塔") return {
    blue: "至少有 1 张 ✦ 呈现：场地期间一次转为女性／非二元",
    white: "对他人出牌后：你摸 2 弃 2；对方摸 1 弃 1",
    pink: "对他人出牌后：你摸 2 弃 2；对方摸 1 弃 1",
  };
  return {
    blue: "每对自己打出检定呈现：不计出牌，重新拿牌后可继续连锁",
    white: "本回合选择蓝或粉执行",
    pink: "每回合限一次：移动一张呈现；你与原持有者各 +1 Joy",
  };
}

function venueEffectCopy(name: string) {
  if (name === "全女空间！") return "蓝读取不能明拿；粉读取新增检定呈现时 +1 Joy";
  if (name === "福灵塔") return "蓝色有检定时可转换长期身份一次；粉 / 白对他人出牌后，自己摸 2 弃 2，对方摸 1 弃 1";
  return "蓝色对自己打检定呈现后重新拿牌并可继续连锁；粉色每回合限一次，移动场上呈现并使自己与原持有者各 +1 Joy";
}

function cardEffectCopy(name: string) {
  const effects: Record<string, string> = {
    理发: "弃置一名玩家的【长发】。",
    卸甲: "弃置一名玩家的【美甲】。",
    共享衣橱: "选择场上一张呈现，将其移至另一名玩家处。",
    闺蜜试衣间: "查看公共牌列与牌堆顶 3 张，从中选择 2 张呈现及另一名玩家；也可以直接选择【没买到衣服】。对方分给双方各 1 张并立即打出；未选顶牌按原顺序放回牌堆顶。",
    翻箱倒柜: "将公共牌列洗回暗牌并重新翻出三张；然后再次暗摸或明拿，并正常出一张牌。",
    心动夸夸: "选择一名其他玩家。其获得 1 Joy，并获得一枚来自你的心动标记。你至多给予一名玩家心动标记；给予新标记时，移除此前由你给予的标记。此后，每当你对拥有你的心动标记的玩家使用一张牌时，你获得 1 Joy。",
    封心锁爱: "将此牌留在你面前。你不能成为【心动夸夸】的目标。若你已有心动标记，弃置这些标记，并使每枚标记的发起者失去 2 Joy。",
    地雷系: "将此牌留在你面前。每当另一名玩家对你使用一张牌时，其失去 1 Joy。",
    打烊: "弃置一张公共牌，然后补满公共牌列。",
    爱美之心: "获得一张公共牌并立即打出；不进入手牌。",
    迷茫: "目标支付 1 Joy 取消；否则弃一张呈现或跳过下回合。",
    换一种活法: "与另一名玩家交换隐藏目标。",
    detrans: "对自己使用。移除最上层长期身份标记，恢复为下方记录的长期身份。若恢复非二元，同时恢复该层记录的二元读取；不清除临时身份。【改好证了！】会阻止本牌。",
    真心话大冒险: "查看另一名玩家的目标；对方可支付 2 Joy 反制，改为查看你的目标。",
    试用代词: "随机获得男性、女性或非二元临时身份并 +1 Joy，持续至你的下回合结束；非二元沿用原有二元读取规则。",
    程序员: "若你拥有【皱巴巴的格子衬衫】，获得 2 Joy。",
    变装皇后: "若你同时拥有【一支商标模糊的口红】和【美甲】，获得 2 Joy。",
    女装店老板: "若场上有至少 4 种不同的服装，获得 4 Joy；否则，若有至少 3 种不同的服装，获得 2 Joy。",
    自由职业者: "获得 1 Joy。将此牌留在你面前。你不受【职场 Dress Code】和【职场 DEI】影响。",
    "改好证了！": "获得 1 Joy。将此牌留在你面前。你的长期公开身份直到终局不能改变。",
    空间主理人: "检查全场玩家的检定数。每有一名玩家的检定数至少为 2，你获得 1 Joy。【扑朔迷离】与【先入为主】会影响这次检定。",
    伪娘团: "使用时，你必须为蓝读取且检定数至少为 2。选择另一名同样为蓝读取、且检定数至少为 2 的玩家，你们各获得 2 Joy。非二元可在读取判断前改变读取；【扑朔迷离】与【先入为主】会影响双方的检定数判断。",
    "你pass吗？": "选择一名玩家，按其当前二元读取结算。蓝：检定 ≥3 时临时变为女性。粉：检定 ≤1 时临时变为男性。临时身份持续至目标自己的下回合结束。",
    身份肯定: "选择任意处于临时身份的玩家，将其当前临时身份固定为长期公开身份，并结束临时状态。",
    开个小证: "获得一个【小证】物件。当一张【她】将补入公共牌列时，你可以弃置 1 张手牌，以该【她】替换之；【她】加入你的手牌，不进入公共牌列，并消耗截获能力。放行不消耗截获能力；小证物件始终保留。",
    学吉他: "你与另一名玩家各 +1 Joy；本牌成为吉他。",
    老男人看了你一眼: "蓝｜1–2 个检定：失去 1 Joy；至少 3 个检定：临时变为女性。\n粉｜至少 3 个检定：失去 1 Joy。",
    厌女症: "检定数量最多的所有玩家各失去 1 Joy。",
    她: "选择一名玩家，使其成为女性；目标可支付 1 Joy 改为粉读取的非二元。",
    他: "选择一名玩家，使其成为男性；目标可支付 1 Joy 改为蓝读取的非二元。",
    美妆博主: "蓝读取 +2 Joy；粉读取展示牌堆顶 3 张，可立即打出其中一张呈现，其余牌置于牌堆底。",
    "职场 Dress Code": "对所有未受职场效果豁免的玩家结算。蓝：弃置所有带 ✦ 的呈现；若有【扑朔迷离】，可选择保留其中 1 张。蓝栏不计算检定数，【先入为主】及一般 ±1 修正不影响。粉：若检定数少于 2，失去 1 Joy；正常受到检定修正影响。若【职场 DEI】已生效，本牌无效。",
    "职场 DEI": "所有玩家 +1 Joy；在场时【职场 Dress Code】无效。",
    "全女空间！": "场地：蓝读取不能明拿；粉读取新增检定呈现时 +1 Joy。",
    福灵塔: "场地，持续至打出者下回合结束。蓝：至少拥有 1 张带 ✦ 的呈现时，场地期间限一次将长期公开身份改为女性或非二元；非二元继承蓝读取。粉 / 白：每当你对另一名玩家出牌后，你摸 2 弃 2，对方摸 1 弃 1。按触发时身份结算；从蓝转为粉或白后，可继续触发相应效果。",
    漫展: "场地，持续至打出者下回合结束。蓝：对自己打出的检定呈现不计正常出牌；每以此方式打出一张牌后，重新进入拿牌阶段，拿牌后可继续出牌。粉：每回合限一次，移动场上一张呈现；你与原持有者各 +1 Joy，移动自己的牌时共 +2 Joy。白：场地打开时选择本场地使用蓝或粉效果。移动不视为打出呈现。",
    扑朔迷离: "结算后放置对应标记；每名玩家同时只能拥有【扑朔迷离】或【先入为主】其中一种。牌效检查你的检定数时，按当时当前身份结算。蓝：检定数 +1。粉：检定数 −1。白：每次检查时选择 +1 或 −1。临时身份可改变当前效果；长期身份改变时移除。终局目标按实际检定数计分。",
    先入为主: "结算后放置对应标记；每名玩家同时只能拥有【扑朔迷离】或【先入为主】其中一种。牌效检查你的检定数时，按当时当前身份结算。蓝：检定数 −1。粉：检定数 +1。白：每次检查时选择 +1 或 −1。临时身份可改变当前效果；长期身份改变时移除。终局目标按实际检定数计分。",
  };
  return effects[name] ?? "立即结算牌面效果。";
}

function hasEffectFace(card: SimCard) {
  return card.kind !== "present";
}

function CardFront({ card }: { card: SimCard }) {
  if (isTernaryEffectCard(card)) {
    const copy = ternaryCardCopy(card.name);
    return <div className="split-card-face ternary-card-face">
      <header><strong>{card.name}</strong></header>
      <div className="split-sections">
        <section className="split-blue"><b>蓝</b><span>{copy.blue}</span></section>
        <section className="split-white"><b>白</b><span>{copy.white}</span></section>
        <section className="split-pink"><b>粉</b><span>{copy.pink}</span></section>
      </div>
    </div>;
  }
  if (card.kind === "venue") {
    const copy = venueRuleCopy(card.name);
    const hasWhiteEffect = Boolean(copy.white);
    return <div className={`split-card-face ${hasWhiteEffect ? "ternary-card-face" : "binary-card-face"}`}>
      <header><strong>{card.name}</strong></header>
      <div className="split-sections">
        <section className="split-blue"><b>蓝</b><span>{copy.blue}</span></section>
        {copy.white && <section className="split-white"><b>白</b><span>{copy.white}</span></section>}
        <section className="split-pink"><b>粉</b><span>{copy.pink}</span></section>
      </div>
    </div>;
  }
  if (isSplitCard(card)) {
    const copy = splitCardCopy(card.name);
    return <div className="split-card-face binary-card-face">
      <header><strong>{card.name}</strong></header>
      <div className="split-sections">
        <section className="split-blue"><b>蓝</b><span>{copy.blue}</span></section>
        <section className="split-pink"><b>粉</b><span>{copy.pink}</span></section>
      </div>
    </div>;
  }
  const venueSrc = venueCardImage(card.name);
  const imageSrc = cardImage(card.name) ?? venueSrc;
  const isVenueImage = Boolean(venueSrc);
  const isPronounPin = card.name === "她" || card.name === "他";
  return <div className={`single-card-face ${card.kind === "present" ? "bare-present" : ""} ${isVenueImage ? "venue-card-face" : ""}`}>
    {card.kind !== "present" && <small>{card.kind === "venue" ? "场地" : "行动"}</small>}
    <div className={`card-art ${imageSrc ? "has-card-image" : ""} ${isVenueImage ? "has-venue-image" : ""}`} title={imageSrc ? undefined : "卡牌插画占位"}>{imageSrc ? <span className={isVenueImage ? "venue-art-image" : `presentation-art-image${isPronounPin ? " pronoun-pin-art" : ""}`} style={{ backgroundImage: `url(${imageSrc})`, ...(isVenueImage ? { backgroundPosition: venueCardImagePosition(card.name) } : {}) }} aria-hidden="true" /> : cardGlyph(card.name)}</div>
    {isVenueImage ? <footer><h3>{card.name}</h3></footer> : <h3>{card.name}</h3>}
    {card.checked && <b className="check-mark" aria-label="计入检定"><CheckPip /></b>}
  </div>;
}

function CardArtworkFace({ card }: { card: SimCard }) {
  const venueSrc = venueCardImage(card.name);
  const imageSrc = cardImage(card.name) ?? venueSrc;
  const isVenueImage = Boolean(venueSrc);
  return <div className={`artwork-back-face ${isVenueImage ? "venue-artwork-back" : ""}`}>
    <div className="artwork-back-image" title={imageSrc ? undefined : "卡牌插画占位"}>
      {imageSrc
        ? <span className={isVenueImage ? "venue-art-image" : "presentation-art-image"} style={{ backgroundImage: `url(${imageSrc})`, ...(isVenueImage ? { backgroundPosition: venueCardImagePosition(card.name) } : {}) }} aria-hidden="true" />
        : <i aria-hidden="true">{cardGlyph(card.name)}</i>}
    </div>
    <h3>{card.name}</h3>
  </div>;
}

function CardFace({ card }: { card: SimCard }) {
  const [showEffect, setShowEffect] = useState(false);
  const flippable = hasEffectFace(card);
  const hasArtworkBack = card.kind === "venue" || isTernaryEffectCard(card) || isSplitCard(card);
  if (!flippable) return <CardFront card={card} />;

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setShowEffect(event.deltaY > 0);
  };

  return <div className="action-flip-shell" onWheel={handleWheel}>
    <div className={`action-flip-card ${showEffect ? "show-effect" : ""}`}>
      <div className="action-flip-face action-flip-front"><CardFront card={card} /></div>
      <div className={`action-flip-face action-flip-back ${hasArtworkBack ? "artwork-flip-back" : ""}`}>{hasArtworkBack ? <CardArtworkFace card={card} /> : <><small>牌效</small><h3>{card.name}</h3><p>{cardEffectCopy(card.name)}</p></>}</div>
    </div>
  </div>;
}

function DecisionOverlay({
  minimized,
  onMinimizedChange,
  ariaLabel,
  ariaLabelledBy,
  children,
}: {
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
}) {
  if (minimized) {
    return <button className="choice-restore-button" type="button" onClick={() => onMinimizedChange(false)}>继续选择</button>;
  }
  return <div className="identity-choice-shade" role="dialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
    <button className="choice-minimize-button" type="button" onClick={() => onMinimizedChange(true)}>收起窗口</button>
    {children}
  </div>;
}

function GameTable({ mode, names, onExit }: { mode: Mode; names: string[]; onExit: () => void }) {
  const [game, setGame] = useState<SimGame>(() => createSimGame(names));
  const [memories, setMemories] = useState<AiMemory[]>(() => createAiMemories(4));
  const [running, setRunning] = useState(mode === "spectate");
  const [speed, setSpeed] = useState(700);
  const [debug, setDebug] = useState(true);
  const [decisionLogs, setDecisionLogs] = useState<string[]>([]);
  const [stepCount, setStepCount] = useState(0);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [pendingPronoun, setPendingPronoun] = useState<PendingPronoun | null>(null);
  const [truthReveal, setTruthReveal] = useState<TruthReveal | null>(null);
  const [goalSwapTransition, setGoalSwapTransition] = useState<GoalSwapTransition | null>(null);
  const [playedCardTransition, setPlayedCardTransition] = useState<PlayedCardTransition | null>(null);
  const [fittingRoomNotice, setFittingRoomNotice] = useState<FittingRoomNotice | null>(null);
  const [fittingRoomSelectedIds, setFittingRoomSelectedIds] = useState<string[]>([]);
  const [lastPlayAnimationDuration, setLastPlayAnimationDuration] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [choiceMinimized, setChoiceMinimized] = useState(false);
  const [inspectedHandPlayerId, setInspectedHandPlayerId] = useState<number | null>(null);
  const [movingPresent, setMovingPresent] = useState<BoardMoveSelection | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<number | null>(null);

  const decisionOwnerId = decisionPlayerId(game);
  const isHumanDecision = mode === "solo" && decisionOwnerId === 0;
  const isHumanBeautyOffer = mode === "solo" && game.beautyOffer?.playerId === 0;
  const legalActions = useMemo(() => enumerateLegalActions(game), [game]);

  const performAction = useCallback((forced?: SimAction) => {
    setChoiceMinimized(false);
    setFittingRoomSelectedIds([]);
    setGame((before) => {
      if (before.phase === "ended") return before;
      const actorId = decisionPlayerId(before);
      const actions = enumerateLegalActions(before);
      if (!actions.length) return before;
      const beforeView = visibleStateFor(before, actorId);
      const decision = forced ? null : chooseHeuristicAction(beforeView, actions, memories[actorId]);
      const chosen = forced ?? decision!.chosen;
      const playedCard = chosen.type === "play"
        ? before.forcedPlay?.card.id === chosen.cardId
          ? before.forcedPlay.card
          : before.players[actorId].hand.find((card) => card.id === chosen.cardId)
        : undefined;
      const pronounCardName = playedCard?.name === "她" || playedCard?.name === "他" ? playedCard.name : null;
      if (mode === "solo" && chosen.targetId === 0 && pronounCardName && !chosen.pronounResponse) {
        setPendingPronoun({ action: chosen, actorId, cardName: pronounCardName });
        setRunning(false);
        if (decision) setDecisionLogs((logs) => [formatDecisionLog(before.players[actorId].name, decision), ...logs].slice(0, 10));
        return before;
      }
      const after = applyLegalAction(before, chosen);
      if (chosen.type === "fitting-room-fizzle" && before.fittingRoomOffer) {
        setFittingRoomNotice({ actorId: before.fittingRoomOffer.actorId, version: Date.now() });
      }
      if (playedCard && (mode === "spectate" || actorId !== 0)) {
        const duration = mode === "spectate" ? Math.max(120, Math.min(1050, Math.round(speed * .8))) : 1050;
        const isPlayerDestination = playedCard.kind === "present"
          || ["她", "他", "扑朔迷离", "先入为主", "学吉他", "开个小证"].includes(playedCard.name);
        const destinationPlayerId = playedCard.name === "学吉他" || playedCard.name === "开个小证"
          ? actorId
          : chosen.targetId;
        setPlayedCardTransition({
          card: { ...playedCard },
          actorId,
          destination: playedCard.kind === "venue" || playedCard.name === "职场 DEI"
            ? "public"
            : isPlayerDestination && destinationPlayerId === actorId
              ? "player"
              : "fade",
          duration,
          version: Date.now(),
        });
        setLastPlayAnimationDuration(duration);
      } else {
        setLastPlayAnimationDuration(0);
      }
      if (playedCard?.name === "换一种活法" && chosen.targetId !== undefined) {
        const humanInvolved = actorId === 0 || chosen.targetId === 0;
        setGoalSwapTransition({
          actorId,
          targetId: chosen.targetId,
          ...(humanInvolved ? { humanGoal: after.players[0].goal } : {}),
          duration: mode === "spectate" ? Math.max(180, Math.min(2200, Math.round(speed * 1.25))) : 2200,
          version: Date.now(),
        });
      }
      setSelectedCardId(null);
      setSelectedTargetId(null);
      setMovingPresent(null);
      setDragOverTargetId(null);
      const afterView = visibleStateFor(after, actorId);
      const knowledgeEvents = knowledgeEventsFor(before, after, chosen);
      let updated = observePublicAction(memories, beforeView, chosen, afterView);
      updated = applyKnowledgeEvents(updated, knowledgeEvents);
      setMemories(updated);
      const reveal = knowledgeEvents.find((item) => item.type === "reveal");
      if (reveal?.type === "reveal" && (mode === "spectate" || reveal.observerId === 0)) {
        setTruthReveal({ ...reveal, version: Date.now() });
      }
      if (decision) setDecisionLogs((logs) => [formatDecisionLog(before.players[actorId].name, decision), ...logs].slice(0, 10));
      setStepCount((count) => count + 1);
      return after;
    });
  }, [memories, mode, speed]);

  useEffect(() => {
    if (!running || game.phase === "ended" || isHumanDecision || isHumanBeautyOffer || pendingPronoun || goalSwapTransition || playedCardTransition || fittingRoomNotice || stepCount > 360) return;
    const showingSelectedFittingRoomCards = game.fittingRoomOffer?.stage === "allocate";
    const delay = showingSelectedFittingRoomCards ? Math.max(900, speed) : Math.max(30, speed - lastPlayAnimationDuration);
    const timer = window.setTimeout(() => performAction(), delay);
    return () => window.clearTimeout(timer);
  }, [fittingRoomNotice, game, goalSwapTransition, isHumanBeautyOffer, isHumanDecision, lastPlayAnimationDuration, pendingPronoun, performAction, playedCardTransition, running, speed, stepCount]);

  useEffect(() => {
    if (mode !== "solo") return;
    const shouldRun = !pendingPronoun && !goalSwapTransition && !isHumanDecision && !isHumanBeautyOffer && game.phase !== "ended";
    const timer = window.setTimeout(() => setRunning(shouldRun), 0);
    return () => window.clearTimeout(timer);
  }, [game.phase, decisionOwnerId, goalSwapTransition, isHumanBeautyOffer, isHumanDecision, mode, pendingPronoun]);

  useEffect(() => {
    if (!truthReveal) return;
    const timer = window.setTimeout(() => setTruthReveal(null), mode === "spectate" ? 3200 : 5000);
    return () => window.clearTimeout(timer);
  }, [mode, truthReveal]);

  useEffect(() => {
    if (!goalSwapTransition) return;
    const timer = window.setTimeout(() => setGoalSwapTransition(null), goalSwapTransition.duration);
    return () => window.clearTimeout(timer);
  }, [goalSwapTransition]);

  useEffect(() => {
    if (!playedCardTransition) return;
    const timer = window.setTimeout(() => setPlayedCardTransition(null), playedCardTransition.duration);
    return () => window.clearTimeout(timer);
  }, [playedCardTransition]);

  useEffect(() => {
    if (!fittingRoomNotice) return;
    const timer = window.setTimeout(() => setFittingRoomNotice(null), 1400);
    return () => window.clearTimeout(timer);
  }, [fittingRoomNotice]);

  const restart = () => {
    setGame(createSimGame(names));
    setMemories(createAiMemories(4));
    setDecisionLogs([]);
    setStepCount(0);
    setRunning(mode === "spectate");
    setPendingPronoun(null);
    setTruthReveal(null);
    setGoalSwapTransition(null);
    setPlayedCardTransition(null);
    setFittingRoomNotice(null);
    setFittingRoomSelectedIds([]);
    setLastPlayAnimationDuration(0);
    setSelectedCardId(null);
    setSelectedTargetId(null);
    setChoiceMinimized(false);
    setInspectedHandPlayerId(null);
    setMovingPresent(null);
    setDragOverTargetId(null);
  };

  const answerPronoun = (response: "accept-binary" | "pay-nonbinary") => {
    if (!pendingPronoun) return;
    const action = { ...pendingPronoun.action, pronounResponse: response };
    setPendingPronoun(null);
    performAction(action);
  };

  const toggleFittingRoomCard = (card: SimCard) => {
    if (card.kind !== "present") return;
    setFittingRoomSelectedIds((selected) => selected.includes(card.id)
      ? selected.filter((id) => id !== card.id)
      : selected.length < 2 ? [...selected, card.id] : selected);
  };

  const drawActions = legalActions.filter((action) => action.type === "draw-blind" || action.type === "draw-market" || action.type === "skip-draw");
  const certificateActions = legalActions.filter((action) => action.type === "certificate-pass" || action.type === "certificate-claim");
  const truthActions = legalActions.filter((action) => action.type === "truth-allow" || action.type === "truth-resist");
  const confusionActions = legalActions.filter((action) => action.type === "confusion-pay" || action.type === "confusion-discard" || action.type === "confusion-skip");
  const beautyActions = legalActions.filter((action) => action.type === "beauty-blogger-play");
  const beautyPassAction = legalActions.find((action) => action.type === "beauty-blogger-pass");
  const fittingRoomSelectActions = legalActions.filter((action) => action.type === "fitting-room-select");
  const fittingRoomAllocateActions = legalActions.filter((action) => action.type === "fitting-room-allocate");
  const fittingRoomFizzleAction = legalActions.find((action) => action.type === "fitting-room-fizzle");
  const fittingRoomCandidateCards = game.fittingRoomOffer?.stage === "select"
    ? [...game.market, ...game.fittingRoomOffer.revealed]
    : [];
  const fittingRoomSelectedAction = fittingRoomSelectActions.find((action) => {
    const ids = action.presentIds ?? [];
    return ids.length === 2 && fittingRoomSelectedIds.length === 2 && fittingRoomSelectedIds.every((id) => ids.includes(id));
  });
  const readingActions = legalActions.filter((action) => action.type === "reading-keep" || action.type === "reading-switch");
  const checkCountActions = legalActions.filter((action) => action.type === "check-count-select");
  const dressCodeActions = legalActions.filter((action) => action.type === "dress-code-preserve" || action.type === "dress-code-discard-all");
  const venueConvertActions = legalActions.filter((action) => action.type === "venue-convert");
  const venueExchangeActions = legalActions.filter((action) => action.type === "venue-exchange-discard");
  const hasManzhanModeChoice = legalActions.some((action) => action.type === "venue-manzhan-mode");
  const manzhanModeActions = hasManzhanModeChoice
    ? legalActions.filter((action) => action.type === "venue-manzhan-mode" || action.type === "venue-manzhan-pass")
    : [];
  const manzhanOfferActions = hasManzhanModeChoice
    ? []
    : legalActions.filter((action) => action.type === "venue-manzhan-use" || action.type === "venue-manzhan-pass");
  const manzhanMoveActions = legalActions.filter((action) => action.type === "venue-manzhan-move");
  const playActions = legalActions.filter((action) => action.type === "play");
  const forcedHumanCard = game.forcedPlay?.playerId === 0 ? game.forcedPlay.card : null;
  const effectiveSelectedCardId = isHumanDecision && forcedHumanCard ? forcedHumanCard.id : selectedCardId;
  const selectedCardPlayActions = playActions.filter((action) => action.cardId === effectiveSelectedCardId);
  const selectedPlayActions = selectedCardPlayActions;
  const selectedHandCard = forcedHumanCard ?? game.players[0].hand.find((card) => card.id === effectiveSelectedCardId);
  const sharedWardrobeDragMode = isHumanDecision && selectedHandCard?.name === "共享衣橱";
  const manzhanDragMode = isHumanDecision && Boolean(game.manzhanPinkPrompt);
  const boardMoveActions = manzhanDragMode
    ? manzhanMoveActions
    : sharedWardrobeDragMode
      ? selectedPlayActions.filter((action) => action.sourcePlayerId !== undefined && action.presentId && action.targetId !== undefined)
      : [];
  const boardMoveMode = boardMoveActions.length > 0;
  const rankings = useMemo(() => [...game.players].sort(compareFinalStanding), [game.players]);
  const humanPlayer = game.players[0];
  const humanCriteria = goalCriteria(humanPlayer);
  const humanIdentity = humanPlayer.tempIdentity ?? humanPlayer.identity;
  const humanReading = humanIdentity === "nonbinary" ? humanPlayer.reading : humanIdentity;
  const humanHasDistinctTempIdentity = Boolean(humanPlayer.tempIdentity && humanPlayer.tempIdentity !== humanPlayer.identity);
  const venueExchangePlayer = game.venueExchange ? game.players[game.venueExchange.playerIds[game.venueExchange.index]] : null;
  const manzhanChooser = manzhanModeActions.length > 0 ? game.players[decisionOwnerId] : null;
  const beautyOfferPlayer = game.beautyOffer ? game.players[game.beautyOffer.playerId] : null;
  const fittingRoomActor = game.fittingRoomOffer ? game.players[game.fittingRoomOffer.actorId] : null;
  const fittingRoomTarget = game.fittingRoomOffer ? game.players[game.fittingRoomOffer.targetId] : null;
  const inspectedHandPlayer = inspectedHandPlayerId === null ? null : game.players[inspectedHandPlayerId];
  const readingCheck = game.readingPrompt?.checks[game.readingPrompt.index];
  const readingPlayer = readingCheck ? game.players[readingCheck.playerId] : null;
  const checkCountCheck = game.checkCountPrompt?.checks[game.checkCountPrompt.index];
  const checkCountPlayer = checkCountCheck ? game.players[checkCountCheck.playerId] : null;
  const dressCodePlayer = game.dressCodeOffer ? game.players[game.dressCodeOffer.playerIds[game.dressCodeOffer.index]] : null;
  const blindDrawAction = drawActions.find((action) => action.type === "draw-blind");
  const skipDrawAction = drawActions.find((action) => action.type === "skip-draw");
  const deckAction = blindDrawAction ?? skipDrawAction;
  const noTargetPlayActions = selectedPlayActions.filter((action) => action.targetId === undefined && action.marketCardId === undefined && action.presentId === undefined);

  const selectHandCard = (cardId: string) => {
    if (!isHumanDecision || game.phase !== "play") return;
    if (game.forcedPlay && game.forcedPlay.card.id !== cardId) return;
    if (effectiveSelectedCardId === cardId) {
      const immediate = playActions.filter((action) => action.cardId === cardId && action.targetId === undefined && action.marketCardId === undefined && action.presentId === undefined);
      if (immediate.length === 1) { performAction(immediate[0]); return; }
    }
    setSelectedCardId((current) => current === cardId ? null : cardId);
    setSelectedTargetId(null);
    setMovingPresent(null);
    setDragOverTargetId(null);
  };

  const choosePlayerTarget = (playerId: number) => {
    const options = selectedPlayActions.filter((action) => action.targetId === playerId);
    if (!options.length) return;
    const immediate = options.filter((action) => action.marketCardId === undefined);
    if (immediate.length === 1 && options.length === 1) performAction(immediate[0]);
    else setSelectedTargetId(playerId);
  };

  const chooseMarketCard = (cardId: string) => {
    if (!isHumanDecision) return;
    if (game.phase === "draw") {
      const draw = drawActions.find((action) => action.type === "draw-market" && action.marketCardId === cardId);
      if (draw) performAction(draw);
      return;
    }
    let options = selectedPlayActions.filter((action) => action.marketCardId === cardId);
    if (selectedTargetId !== null) options = options.filter((action) => action.targetId === selectedTargetId);
    else options = options.filter((action) => action.targetId === undefined);
    if (options.length === 1) performAction(options[0]);
  };

  const selectBoardMovePresent = (event: MouseEvent<HTMLButtonElement>, presentId: string, sourcePlayerId: number) => {
    event.stopPropagation();
    setMovingPresent((current) => current?.presentId === presentId ? null : { presentId, sourcePlayerId });
    setDragOverTargetId(null);
  };

  const beginBoardDrag = (event: DragEvent<HTMLButtonElement>, presentId: string, sourcePlayerId: number) => {
    setMovingPresent({ presentId, sourcePlayerId });
    setDragOverTargetId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${sourcePlayerId}:${presentId}`);
  };

  const moveActionToPlayer = (playerId: number) => movingPresent
    ? boardMoveActions.find((action) => action.presentId === movingPresent.presentId && action.sourcePlayerId === movingPresent.sourcePlayerId && action.targetId === playerId)
    : undefined;

  const dropBoardPresent = (playerId: number) => {
    const action = moveActionToPlayer(playerId);
    if (!action) return;
    setMovingPresent(null);
    setDragOverTargetId(null);
    performAction(action);
  };

  const handlePlayerDrop = (event: DragEvent<HTMLElement>, playerId: number) => {
    const action = moveActionToPlayer(playerId);
    if (!action) return;
    event.preventDefault();
    dropBoardPresent(playerId);
  };

  if (game.phase === "ended") {
    const winningScore = projectedScore(rankings[0]);
    const winners = rankings.filter((player) => sharesFinalStanding(player, rankings[0]));
    return (
      <main className="result-page">
        <div className="result-logo" aria-label="dress-up!">dress-<em>up!</em></div>
        <div className="result-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className="result-stage">
          <header className="result-heading">
            <span className="result-crown" aria-hidden="true" />
            <h1><span>{winners.map((player) => player.name).join("、")}获胜</span><b>{winningScore}</b><i aria-hidden="true">✦</i></h1>
          </header>
          <section className="result-goal-row" aria-label="揭开的隐藏目标">
            {rankings.map((player, index) => {
              const breakdown = finalScoreBreakdown(player);
              const scoredItems = breakdown.goalItems.filter((item) => item.points > 0);
              const scoredKeys = new Set(scoredItems.map((item) => item.key));
              const goalPoints = scoredItems.reduce((sum, item) => sum + item.points, 0);
              const standingRank = rankings.findIndex((ranked) => sharesFinalStanding(ranked, player)) + 1;
              const isWinner = sharesFinalStanding(player, rankings[0]);
              const isPrimaryWinner = index === 0;
              const isEnglishGoal = player.goal === "demi-girl" || player.goal === "enby";
              const identityLabel = player.identity === "male"
                ? "男性"
                : player.identity === "female"
                  ? "女性"
                  : "非二元";
              const routeTags = resultRouteTags(player, scoredKeys);
              const statusTags = resultStatusTags(player);
              const scoreSources = player.scoreSources ?? [];
              return <article className={`result-goal-card result-rank-${index + 1}${isPrimaryWinner ? " is-primary-winner" : ""}${isWinner ? " is-winner" : ""}`} key={player.id}>
                <header className="result-player-line">
                  <span className="result-rank">{standingRank}</span>
                  <b>{player.name}</b>
                  <strong className="result-total">{breakdown.total}</strong>
                </header>
                <div className={`revealed-goal${isEnglishGoal ? " is-latin" : ""}`}>
                  <h2>{player.goal}</h2>
                </div>
                {scoredItems.length > 0 && <div className="goal-score-lines" aria-label="实际得分的目标条款">
                  {scoredItems.map((item) => <p key={item.key}><span>✓ {item.label}</span><b>+{item.points}</b></p>)}
                </div>}
                <div className="goal-equation" aria-label={`目标 ${goalPoints}，加 Joy ${breakdown.joyPoints}，总分 ${breakdown.total}`}>
                  <span>目标 {goalPoints}</span>
                  <i>+ Joy {breakdown.joyPoints}</i>
                  <b>= {breakdown.total}</b>
                </div>
                <footer className="result-final-note" aria-label="最终状态">
                  <span className={`result-state-chip state-${player.identity}`}>{identityLabel}</span>
                  {player.identity === "nonbinary" && <span className={`result-state-chip reading-${player.reading}`}>{player.reading === "male" ? "蓝读取" : "粉读取"}</span>}
                  <span className="result-state-chip result-check-count" aria-label={`${simChecks(player)} 个检定`}><CheckPip />{simChecks(player)}</span>
                  {routeTags.map((tag) => <span className="result-state-chip result-route-chip" title="实际达成路线的关键小件" key={`route-${tag}`}>{tag}</span>)}
                  {statusTags.map((tag) => <span className="result-state-chip result-status-chip" title="终局仍有效的状态" key={`status-${tag}`}>状态 · {shortName(tag)}</span>)}
                  {scoreSources.map((source) => <span className="result-state-chip result-score-source-chip" title="实际产生 Joy 的关键跑分牌" key={`source-${source.cardName}`}>{source.cardName} +{source.joy} Joy</span>)}
                </footer>
                {isPrimaryWinner && <span className="result-winner-art" aria-hidden="true" />}
              </article>;
            })}
          </section>
          {game.warnings.length > 0 && <section className="warning-panel"><h2>规则 warning</h2>{game.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
          <div className="result-actions"><button onClick={restart}><span aria-hidden="true">↶</span>再来一局</button><button onClick={onExit}><span aria-hidden="true">☷</span>返回模式选择</button></div>
        </div>
      </main>
    );
  }

  return (
    <main className="prototype-shell tabletop-shell">
      <header className="tabletop-header">
        <div className="mini-logo"><strong>dress-<em>up!</em></strong></div>
        <div className="table-utilities">
          <button onClick={() => setRuleOpen(true)} aria-label="规则" title="规则">?</button>
          <button onClick={() => setLogOpen((value) => !value)} aria-label="对局记录" title="对局记录">☷</button>
          <button onClick={restart} aria-label="重新开局" title="重新开局">↻</button>
          <button onClick={onExit} aria-label="返回菜单" title="返回菜单">×</button>
        </div>
      </header>

      {boardMoveMode && <div className="board-move-hint" role="status"><b>{manzhanDragMode ? "漫展 · 粉" : "共享衣橱"}</b><span>拖动高亮呈现到另一名玩家区域</span><small>也可以先点呈现，再点目标区域</small></div>}

      <section className="tabletop-arena">
        <div className="player-grid">
          {game.players.map((player) => {
            const currentIdentity = player.tempIdentity ?? player.identity;
            const reading = currentIdentity === "nonbinary" ? player.reading : currentIdentity;
            const permanentIdentity = player.identity;
            const hasDistinctTempIdentity = Boolean(player.tempIdentity && player.tempIdentity !== permanentIdentity);
            const targetActions = selectedPlayActions.filter((action) => action.targetId === player.id);
            const legalDropAction = moveActionToPlayer(player.id);
            const crushGivers = game.players.filter((giver) => giver.crushTargetId === player.id);
            return <article
              className={`player-zone player-${player.id} identity-${permanentIdentity} ${player.tempIdentity ? "has-temp-identity" : ""} ${player.id === game.active ? "current-player" : ""} ${legalDropAction ? "is-legal-drop" : ""} ${dragOverTargetId === player.id ? "is-drag-over" : ""}`}
              key={player.id}
            >
              <div className="player-core">
                <div className="identity-chip avatar-placeholder" title={`${player.name}的头像`} aria-hidden="true" />
                <div className="player-name"><div className="player-name-line"><h2>{player.name}</h2>{crushGivers.length > 0 && <div className="crush-markers" aria-label="收到的心动标记">{crushGivers.map((giver) => <span className="crush-marker-token" title={`来自 ${giver.name} 的心动标记`} aria-label={`来自 ${giver.name} 的心动标记`} key={`crush-${giver.id}`}><b>♥</b><small>{giver.name}</small></span>)}</div>}</div><div className="identity-language"><IdentityHistoryStack player={player} superseded={hasDistinctTempIdentity} />{hasDistinctTempIdentity && <span className={`temp-identity-token identity-${player.tempIdentity}`} title="临时身份持续至该玩家自己的下回合结束"><b aria-label="临时身份">◷</b>{player.tempIdentity === "male" ? "男性" : player.tempIdentity === "female" ? "女性" : `非二元 · ${reading === "male" ? "蓝" : "粉"}读取`}</span>}</div></div>
                <div className="player-stats"><span className="check-count-token" aria-label={`${simChecks(player)} 个检定`}><CheckPip />{simChecks(player)}</span><div className="joy-token"><b>{player.joy}</b><span>☺</span>{player.joyLossVersion > 0 && <i className="joy-loss-pop" key={`${player.id}-${player.joyLossVersion}`}>−{player.lastJoyLoss}</i>}</div></div>
              </div>

              <div className="player-objects">
                {player.presents.map((card) => {
                  const isFresh = card.freshUntilTurnSerial !== undefined && game.turnSerial < card.freshUntilTurnSerial;
                  const isChecked = simCardChecked(card);
                  const checkAnimation = card.checkAnimationKind ? `auto-check-${card.checkAnimationKind}` : "";
                  const imageSrc = cardImage(card.name);
                  const canMove = boardMoveMode && boardMoveActions.some((action) => action.sourcePlayerId === player.id && action.presentId === card.id);
                  const isMoving = movingPresent?.sourcePlayerId === player.id && movingPresent.presentId === card.id;
                  const content = <><i>{imageSrc ? <span className="presentation-art-image" style={{ backgroundImage: `url(${imageSrc})` }} aria-hidden="true" /> : cardGlyph(card.name)}</i><small>{shortName(card.name)}</small>{isChecked && <b aria-label="计入检定"><CheckPip /></b>}</>;
                  const className = `mini-object ${isChecked ? "has-check" : ""} ${isFresh ? "fresh-present" : ""} ${checkAnimation} ${canMove ? "is-draggable-present" : ""} ${isMoving ? "is-moving-present" : ""}`;
                  return canMove
                    ? <button className={className} draggable onDragStart={(event) => beginBoardDrag(event, card.id, player.id)} onDragEnd={() => { setMovingPresent(null); setDragOverTargetId(null); }} onClick={(event) => selectBoardMovePresent(event, card.id, player.id)} aria-pressed={isMoving} key={`${card.id}-${card.checkAnimationVersion ?? 0}`}>{content}</button>
                    : <div className={className} key={`${card.id}-${card.checkAnimationVersion ?? 0}`}>{content}</div>;
                })}
                {player.removedPresents.map(({ card, untilTurnSerial }) => <div className="mini-object removing-present" aria-hidden="true" key={`${card.id}-${untilTurnSerial}`}><i>{cardGlyph(card.name)}</i><small>{shortName(card.name)}</small>{card.checked && <b><CheckPip /></b>}</div>)}
                {player.items.map((item, index) => {
                  const imageSrc = cardImage(item);
                  return <div className="mini-object item-object" key={`${item}-${index}`}><i>{imageSrc ? <span className="presentation-art-image" style={{ backgroundImage: `url(${imageSrc})` }} aria-hidden="true" /> : cardGlyph(item)}</i><small>{item}</small></div>;
                })}
                {player.ambiguityCard && <div className="mini-object ambiguity-status-object" aria-label={`${player.ambiguityCard.name}，当前${checkAdjustmentLabel(ambiguityCheckAdjustment(player.ambiguityCard.name, currentIdentity))}`}>
                  <i>{CARD_IMAGES[player.ambiguityCard.name] ? <span className="presentation-art-image ambiguity-status-image" style={{ backgroundImage: `url(${CARD_IMAGES[player.ambiguityCard.name]})` }} aria-hidden="true" /> : cardGlyph(player.ambiguityCard.name)}</i><small>{player.ambiguityCard.name}</small><CheckAdjustmentMark adjustment={ambiguityCheckAdjustment(player.ambiguityCard.name, currentIdentity)} className="ambiguity-check-marker" />
                </div>}
              </div>

              {!(mode === "solo" && player.id === 0) && (mode === "spectate"
                ? <button type="button" className="hand-fan hand-inspect-trigger" aria-label={`查看 ${player.name} 的 ${player.hand.length} 张手牌`} aria-expanded={inspectedHandPlayerId === player.id} onClick={() => setInspectedHandPlayerId((current) => current === player.id ? null : player.id)}><i /><i /><b>{player.hand.length}</b></button>
                : <div className="hand-fan" aria-label={`${player.name}有${player.hand.length}张手牌`}><i /><i /><b>{player.hand.length}</b></div>)}

              {playedCardTransition?.actorId === player.id && <div className={`ai-reveal-slot destination-${playedCardTransition.destination}`} aria-hidden="true" key={playedCardTransition.version}>
                <div className="ai-reveal-card" style={{ animationDuration: `${playedCardTransition.duration}ms` }}>
                  <div className={`ai-reveal-front table-card ${cardClass(playedCardTransition.card.kind, playedCardTransition.card.checked)} ${game.dei && playedCardTransition.card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`}><CardFront card={playedCardTransition.card} /></div>
                </div>
              </div>}

              {!(mode === "solo" && player.id === 0) && (() => {
                const knownGoal = mode === "solo" ? memories[0].knownTargets[player.id] : undefined;
                return <div className={`goal-object ${knownGoal ? "known-goal" : "face-down"}`} title={knownGoal ? `已知目标：${knownGoal}` : "目标牌背面"}>{knownGoal ?? "?"}</div>;
              })()}

              {effectiveSelectedCardId && !sharedWardrobeDragMode && selectedTargetId === null && targetActions.length > 0 && <button className="target-marker" onClick={() => choosePlayerTarget(player.id)}>使用</button>}
              {legalDropAction && <button
                type="button"
                className="player-drop-target"
                aria-label={`把${movingPresent ? "所选呈现" : "呈现"}移动给${player.name}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverTargetId(player.id); }}
                onDragLeave={() => { if (dragOverTargetId === player.id) setDragOverTargetId(null); }}
                onDrop={(event) => handlePlayerDrop(event, player.id)}
                onClick={() => dropBoardPresent(player.id)}
              ><span>放到这里</span></button>}
            </article>;
          })}
        </div>

        <section className="public-table">
          {game.venue && <div className="venue-object">
            <i className="venue-object-art" style={{ backgroundImage: `url(${venueBannerImage(game.venue.card.name)})` }} aria-hidden="true" />
            <div className="venue-object-copy"><b>{game.venue.card.name}</b><span>{venueEffectCopy(game.venue.card.name)}</span><small>持续至 {game.players[game.venue.ownerId].name} 的下回合结束</small>{isHumanDecision && venueConvertActions.length > 0 && <div className="venue-convert-actions">{venueConvertActions.map((action) => <button onClick={() => performAction(action)} key={action.id}>{action.venueIdentity === "female" ? "变为女性" : "变为非二元"}</button>)}</div>}</div>
          </div>}
          {game.dei && <div className="dei-badge" role="status" aria-label="职场 DEI 生效，职场 Dress Code 已禁用" title="职场 DEI 生效：职场 Dress Code 无效"><b>DEI</b></div>}

          <div className="public-row">
            <button className={`deck-pile ${game.deck.length === 0 ? "is-empty" : ""} ${isHumanDecision && game.phase === "draw" && deckAction ? "is-actionable" : ""}`} disabled={!isHumanDecision || game.phase !== "draw" || !deckAction} onClick={() => deckAction && performAction(deckAction)} aria-label={skipDrawAction ? "牌堆已空，继续到出牌" : "暗摸一张牌"}>
              <div className="card-back"><b>dress-<em>up!</em></b></div><span>{game.deck.length}</span>
            </button>

            <div className="market-cards">{game.market.map((card) => {
              const drawAction = drawActions.some((action) => action.type === "draw-market" && action.marketCardId === card.id);
              const playOption = selectedPlayActions.some((action) => action.marketCardId === card.id && (selectedTargetId === null ? action.targetId === undefined : action.targetId === selectedTargetId));
              const actionable = isHumanDecision && (game.phase === "draw" ? drawAction : playOption);
              return <button className={`table-card ${cardClass(card.kind, card.checked)} ${actionable ? "is-actionable" : ""} ${game.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} aria-disabled={!actionable} tabIndex={actionable ? 0 : -1} onClick={() => chooseMarketCard(card.id)} key={card.id}><CardFace card={card} />{game.locks[card.id] !== undefined && <em className="lock-mark">锁给 {game.players[game.locks[card.id]].name}</em>}</button>;
            })}</div>
          </div>
        </section>
      </section>

      {mode === "solo" && <section className="personal-table">
        <aside className="goal-card-object">
          <header><small>你的目标</small><strong>{humanPlayer.goal}</strong></header>
          <div>{humanCriteria.map((criterion) => <p className={criterion.done ? "is-done" : ""} key={criterion.text}><span>{criterion.done ? "✓ " : "□ "}{criterion.text}</span><b>{criterion.points}</b></p>)}</div>
        </aside>

         <div className="self-status"><IdentityHistoryStack player={humanPlayer} superseded={humanHasDistinctTempIdentity} />{humanHasDistinctTempIdentity && <span className={`temp-identity-token identity-${humanPlayer.tempIdentity}`} title="临时身份持续至自己的下回合结束"><strong aria-label="临时身份">◷</strong>{humanPlayer.tempIdentity === "male" ? "男性" : humanPlayer.tempIdentity === "female" ? "女性" : `非二元 · ${humanReading === "male" ? "蓝" : "粉"}读取`}</span>}<b className="self-check-count" aria-label={`${simChecks(humanPlayer)} 个检定`}><CheckPip />{simChecks(humanPlayer)}</b><b>Joy {humanPlayer.joy} ☺</b></div>

         <div className="own-hand">
          {forcedHumanCard && <button className={`own-card table-card forced-play-card ${cardClass(forcedHumanCard.kind, forcedHumanCard.checked)} ${effectiveSelectedCardId === forcedHumanCard.id ? "is-selected" : ""} ${game.dei && forcedHumanCard.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} onClick={() => selectHandCard(forcedHumanCard.id)}><em>立即打出</em><CardFace card={forcedHumanCard} /></button>}
          {humanPlayer.hand.map((card) => {
          const hasLegalPlay = playActions.some((action) => action.cardId === card.id);
          const selectable = isHumanDecision && game.phase === "play" && hasLegalPlay;
          const selected = effectiveSelectedCardId === card.id;
          return <button className={`own-card table-card ${cardClass(card.kind, card.checked)} ${selected ? "is-selected" : ""} ${game.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} aria-disabled={!selectable} tabIndex={selectable ? 0 : -1} onClick={() => selectHandCard(card.id)} title={selected && noTargetPlayActions.length ? "再次点击打出" : undefined} key={card.id}><CardFace card={card} /></button>;
        })}</div>
      </section>}

      {mode === "spectate" && <div className="spectator-controls">
        <button onClick={() => setRunning((value) => !value)} aria-label={running ? "暂停" : "播放"}>{running ? "Ⅱ" : "▶"}</button>
        <button onClick={() => performAction()} disabled={running} aria-label="单步">▷</button>
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="播放速度"><option value={1200}>慢</option><option value={700}>中</option><option value={260}>快</option><option value={80}>极快</option></select>
      </div>}

      {mode === "spectate" && inspectedHandPlayer && <aside className="spectator-hand-inspector" aria-label={`${inspectedHandPlayer.name}的手牌`}>
        <header><div><b>{inspectedHandPlayer.name} 的手牌</b><span>{inspectedHandPlayer.hand.length} 张</span></div><button type="button" onClick={() => setInspectedHandPlayerId(null)} aria-label="收起手牌">×</button></header>
        {inspectedHandPlayer.hand.length > 0
          ? <div className="spectator-hand-cards">{inspectedHandPlayer.hand.map((card) => <div className={`table-card ${cardClass(card.kind, card.checked)} ${game.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} key={card.id}><CardFace card={card} /></div>)}</div>
          : <p>暂无手牌</p>}
      </aside>}

      {logOpen && <aside className="event-drawer" aria-label="对局记录">
        <header><b>对局记录</b><button onClick={() => setLogOpen(false)} aria-label="关闭记录">×</button></header>
        {debug && decisionLogs[0] && <pre>{decisionLogs[0]}</pre>}
        {game.events.slice(0, 10).map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
        <button className="debug-toggle" onClick={() => setDebug((value) => !value)}>AI 评分 {debug ? "开" : "关"}</button>
      </aside>}

      {truthReveal && <button className="truth-reveal-toast" onClick={() => setTruthReveal(null)} key={truthReveal.version} aria-label="收起目标查看结果">
        <small>{game.players[truthReveal.observerId].name} 查看了</small>
        <strong>{game.players[truthReveal.targetId].name} 的目标</strong>
        <b>{truthReveal.goal}</b>
      </button>}

      {goalSwapTransition && <div className="goal-swap-shade" role="status" aria-live="assertive" key={goalSwapTransition.version} style={{ animationDuration: `${goalSwapTransition.duration}ms` }}>
        <section className="goal-swap-stage">
          <header><small>换一种活法</small><h2>交换隐藏目标</h2></header>
          <div className="goal-swap-track" aria-hidden="true">
            <span className="goal-swap-name goal-swap-name-left">{game.players[goalSwapTransition.actorId].name}</span>
            <span className="goal-swap-name goal-swap-name-right">{game.players[goalSwapTransition.targetId].name}</span>
            <i className="goal-swap-card goal-swap-card-a" style={{ animationDuration: `${Math.round(goalSwapTransition.duration * .64)}ms`, animationDelay: `${Math.round(goalSwapTransition.duration * .08)}ms` }}><b>?</b><small>目标</small></i>
            <i className="goal-swap-card goal-swap-card-b" style={{ animationDuration: `${Math.round(goalSwapTransition.duration * .64)}ms`, animationDelay: `${Math.round(goalSwapTransition.duration * .08)}ms` }}><b>?</b><small>目标</small></i>
            <em style={{ animationDuration: `${Math.round(goalSwapTransition.duration * .34)}ms`, animationDelay: `${Math.round(goalSwapTransition.duration * .16)}ms` }}>↔</em>
          </div>
          <p className="goal-swap-result" style={{ animationDuration: `${Math.round(goalSwapTransition.duration * .19)}ms`, animationDelay: `${Math.round(goalSwapTransition.duration * .65)}ms` }}>{goalSwapTransition.humanGoal ? <>你的新目标：<b>{goalSwapTransition.humanGoal}</b></> : <><b>{game.players[goalSwapTransition.actorId].name}</b> 与 <b>{game.players[goalSwapTransition.targetId].name}</b> 已交换目标</>}</p>
        </section>
      </div>}

      {game.certificateOffer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="小证截获选择"><section className="identity-choice-card certificate-choice"><span className="choice-kicker">一张【她】将补入公共牌列</span><h2>要用哪张手牌替换？</h2><p>弃置 1 张手牌可将【她】换入手牌并消耗截获能力；选择放行则【她】进入公共牌列，截获能力继续保留。</p><div className="certificate-actions">{certificateActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.label}</button>)}</div></section></DecisionOverlay>}

      {game.truthOffer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="真心话大冒险反制选择"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">【真心话大冒险】正在对你结算</span>
        <h2>要隐藏你的目标吗？</h2>
        <p>不反制：对方查看你的目标。支付 2 Joy：阻止查看，并改为你查看对方的目标。</p>
        <div className="certificate-actions">{truthActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.label}</button>)}</div>
      </section></DecisionOverlay>}

      {game.confusionOffer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="迷茫代价选择"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">【迷茫】正在对你结算</span>
        <h2>选择一项代价</h2>
        <p>你可以支付 1 Joy、弃置自己的一张呈现，或跳过自己的下回合。系统不会替你决定。</p>
        <div className="certificate-actions">{confusionActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.label}</button>)}</div>
      </section></DecisionOverlay>}

      {game.beautyOffer && beautyOfferPlayer && isHumanBeautyOffer && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="美妆博主展示牌选择"><section className="identity-choice-card beauty-blogger-choice">
        <span className="choice-kicker">美妆博主 · {beautyOfferPlayer.name}</span>
        <h2>展示牌堆顶 {game.beautyOffer.revealed.length} 张</h2>
        <p>你可以立即打出其中一张呈现；未选择的牌会按展示顺序置于牌堆底。</p>
        <div className="beauty-reveal-grid compact-card-context">{game.beautyOffer.revealed.map((card) => {
          const actions = beautyActions.filter((action) => action.presentId === card.id);
          return <article key={card.id}>
            <div className={`table-card ${cardClass(card.kind, card.checked)} ${game.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`}><CardFace card={card} /></div>
            {actions.length > 0
              ? <div>{actions.map((action) => <button key={action.id} onClick={() => performAction(action)}>打给 {game.players[action.targetId!].name}</button>)}</div>
              : <small>{card.kind === "present" ? "没有合法接收者" : "不是呈现，将置于牌堆底"}</small>}
          </article>;
        })}</div>
        {beautyPassAction && <button className="beauty-pass" onClick={() => performAction(beautyPassAction)}>不打出，全部置于牌堆底</button>}
      </section></DecisionOverlay>}

      {game.fittingRoomOffer?.stage === "select" && fittingRoomActor && fittingRoomTarget && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="闺蜜试衣间选择呈现"><section className="identity-choice-card fitting-room-choice">
        <span className="choice-kicker">闺蜜试衣间 · {fittingRoomActor.name} 与 {fittingRoomTarget.name}</span>
        <div className="fitting-room-choice-heading">
          <div><h2>挑两张呈现</h2><p>点击卡牌逐张选择。非呈现牌不可选；未选的牌堆顶牌会按原顺序放回。</p></div>
          <b aria-label={`已选择 ${fittingRoomSelectedIds.length} 张，共需 2 张`}>{fittingRoomSelectedIds.length}/2</b>
        </div>
        <div className="fitting-room-source-headings" aria-hidden="true"><span>公共牌列</span><span>牌堆顶 · 仅你可见</span></div>
        <div className="fitting-room-card-grid compact-card-context">{fittingRoomCandidateCards.map((card, index) => {
          const fromTop = index >= game.market.length;
          const topIndex = index - game.market.length;
          const selected = fittingRoomSelectedIds.includes(card.id);
          const canSelect = card.kind === "present";
          const selectionFull = !selected && fittingRoomSelectedIds.length >= 2;
          return <button
            type="button"
            key={card.id}
            className={`fitting-room-card-option ${fromTop ? "from-deck" : "from-market"} ${fromTop && topIndex === 0 ? "first-deck-card" : ""} ${selected ? "is-selected" : ""} ${!canSelect ? "is-ineligible" : ""}`}
            onClick={() => toggleFittingRoomCard(card)}
            disabled={!canSelect || selectionFull}
            aria-pressed={selected}
            aria-label={`${fromTop ? `牌堆顶第 ${topIndex + 1} 张` : `公共牌第 ${index + 1} 张`}，${card.name}，${selected ? "已选择" : canSelect ? "可选择" : "不可选择"}`}
          >
            <span className="fitting-room-card-source">{fromTop ? `牌堆顶 ${topIndex + 1}` : `公共牌 ${index + 1}`}</span>
            <div className={`table-card ${cardClass(card.kind, card.checked)}`}><CardFace card={card} /></div>
            <small>{selected ? "已选择" : canSelect ? "点击选择" : "不可选择"}</small>
          </button>;
        })}</div>
        <div className="fitting-room-selection-actions">
          <button className="fitting-room-confirm" disabled={!fittingRoomSelectedAction} onClick={() => fittingRoomSelectedAction && performAction(fittingRoomSelectedAction)}>确认这两张</button>
          {fittingRoomFizzleAction && <button className="fitting-room-fizzle" onClick={() => performAction(fittingRoomFizzleAction)}>没买到衣服</button>}
        </div>
      </section></DecisionOverlay>}

      {game.fittingRoomOffer?.stage === "allocate" && fittingRoomActor && fittingRoomTarget && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="闺蜜试衣间亮出并分配呈现"><section className="identity-choice-card fitting-room-choice fitting-room-allocation">
        <span className="choice-kicker">闺蜜试衣间 · {fittingRoomActor.name} 选中了</span>
        <h2>向全场亮出这两张呈现</h2>
        <div className="fitting-room-selected-cards compact-card-context">{game.fittingRoomOffer.selected.map((card) => <div className={`table-card ${cardClass(card.kind, card.checked)}`} key={card.id}><CardFace card={card} /></div>)}</div>
        <p>{isHumanDecision ? `现在由你分配：自己留一张，另一张给 ${fittingRoomActor.name}。确认后双方立即打出；衣物正常覆盖。` : `现在由 ${fittingRoomTarget.name} 分配。双方随后立即打出，衣物正常覆盖。`}</p>
        {isHumanDecision ? <div className="fitting-room-allocation-actions">{fittingRoomAllocateActions.map((action) => {
          const given = game.fittingRoomOffer!.selected.find((card) => card.id === action.presentId)!;
          const kept = game.fittingRoomOffer!.selected.find((card) => card.id !== action.presentId)!;
          return <button key={action.id} onClick={() => performAction(action)}><span><i>自己留下</i><b>{shortName(kept.name)}</b></span><span><i>给 {fittingRoomActor.name}</i><b>{shortName(given.name)}</b></span></button>;
        })}</div> : <p className="fitting-room-ai-wait">正在分配…</p>}
      </section></DecisionOverlay>}

      {fittingRoomNotice && <div className="fitting-room-result-toast" role="status" key={fittingRoomNotice.version}><small>{game.players[fittingRoomNotice.actorId].name} 的【闺蜜试衣间】</small><strong>没买到衣服</strong></div>}

      {readingCheck && readingPlayer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="非二元读取选择"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">【{readingCheck.sourceName}】即将判断身份</span>
        <h2>当前读取 → {readingPlayer.reading === "male" ? "蓝" : "粉"}</h2>
        <p>你可以保持当前方向，或支付 1 Joy 永久切换后再结算本次效果。</p>
        <div className="certificate-actions">{readingActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.label}</button>)}</div>
      </section></DecisionOverlay>}

      {checkCountCheck && checkCountPlayer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="检定数量选择"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">【{checkCountPlayer?.ambiguityCard?.name ?? "持续状态"}】白色效果</span>
        <h2>【{checkCountCheck.sourceName}】本次读到几个检定？</h2>
        <p>这次只选择 +1 或 −1；下一次读取检定数量时会再次询问。终局目标仍按真实检定数计分。</p>
        <div className="certificate-actions">{checkCountActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.checkCountAdjustment === 1 ? "+1" : "−1"} → 按 {action.selectedCheckCount} 个检定</button>)}</div>
      </section></DecisionOverlay>}

      {game.dressCodeOffer && dressCodePlayer && isHumanDecision && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="职场 Dress Code 保留呈现"><section className="identity-choice-card fulingta-choice">
        <span className="choice-kicker">职场 Dress Code · 扑朔迷离</span>
        <h2>选择保留一张检定呈现</h2>
        <p>蓝栏不计算检定数。你可以因【扑朔迷离】保留其中一张；其他带 ✦ 的呈现将被弃置。</p>
        <div className="venue-exchange-discard-grid">{dressCodeActions.filter((action) => action.type === "dress-code-preserve").map((action) => { const card = dressCodePlayer.presents.find((present) => present.id === action.presentId)!; const imageSrc = cardImage(card.name); return <button key={action.id} onClick={() => performAction(action)}><i>{imageSrc ? <span className="presentation-art-image" style={{ backgroundImage: `url(${imageSrc})` }} aria-hidden="true" /> : cardGlyph(card.name)}</i><b>保留 {shortName(card.name)}</b></button>; })}</div>
        {dressCodeActions.find((action) => action.type === "dress-code-discard-all") && <div className="certificate-actions"><button onClick={() => performAction(dressCodeActions.find((action) => action.type === "dress-code-discard-all")!)}>不保留，全部弃置</button></div>}
      </section></DecisionOverlay>}

      {game.venueExchange && isHumanDecision && venueExchangePlayer && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="福灵塔换牌选择"><section className="identity-choice-card fulingta-choice">
        <span className="choice-kicker">福灵塔 · {venueExchangePlayer.name}</span>
        <h2>选择弃置一张牌</h2>
        <p>牌已经摸入手牌；还需弃置 {game.venueExchange.discardRemaining} 张。</p>
        <div className="venue-exchange-discard-grid">{venueExchangeActions.map((action) => { const card = venueExchangePlayer.hand.find((held) => held.id === action.cardId)!; const imageSrc = cardImage(card.name); return <button key={action.id} onClick={() => performAction(action)}><i>{imageSrc ? <span className="presentation-art-image" style={{ backgroundImage: `url(${imageSrc})` }} aria-hidden="true" /> : cardGlyph(card.name)}</i><b>{shortName(card.name)}</b></button>; })}</div>
      </section></DecisionOverlay>}

      {manzhanChooser && isHumanDecision && manzhanModeActions.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="漫展效果选择"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">漫展 · {manzhanChooser.name}</span>
        <h2>选择你在本场地中的效果</h2>
        <p>此选择只属于你，不会改变其他玩家获得的效果。</p>
        <div className="certificate-actions">{manzhanModeActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.type === "venue-manzhan-pass" ? "本回合不使用" : action.venueMode === "blue" ? "蓝：对自己打检定呈现后重新拿牌" : "粉：移动场上一张呈现"}</button>)}</div>
      </section></DecisionOverlay>}

      {!game.manzhanPinkPrompt && isHumanDecision && manzhanOfferActions.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="是否使用漫展"><section className="identity-choice-card certificate-choice">
        <span className="choice-kicker">漫展 · 粉色效果</span>
        <h2>要移动场上的一张呈现吗？</h2>
        <p>移动后，你与该牌原持有者各获得 1 Joy；移动自己的牌时，你共获得 2 Joy。随后仍可正常出牌。</p>
        <div className="certificate-actions">{manzhanOfferActions.map((action) => <button key={action.id} onClick={() => performAction(action)}>{action.type === "venue-manzhan-use" ? "使用" : "跳过"}</button>)}</div>
      </section></DecisionOverlay>}

      {pendingPronoun && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabelledBy="identity-choice-title">
        <section className="identity-choice-card">
          <span className="choice-kicker">【{pendingPronoun.cardName}】正在对你结算</span>
          <h2 id="identity-choice-title">选择你的长期身份</h2>
          <p>你可以接受这张牌的二元身份；或支付 1 Joy，成为非二元，并把二元读取设为对应方向。</p>
          <div className="identity-choice-options">
            <button className={pendingPronoun.cardName === "她" ? "accept-female" : "accept-male"} onClick={() => answerPronoun("accept-binary")}><span>接受【{pendingPronoun.cardName}】</span><b>变为{pendingPronoun.cardName === "她" ? "女性" : "男性"}</b></button>
            <button className="stay-nonbinary" onClick={() => answerPronoun("pay-nonbinary")} disabled={game.players[0].joy < 1}><span>支付 1 Joy</span><b>{game.players[0].joy < 1 ? "Joy 不足" : `非二元 / ${pendingPronoun.cardName === "她" ? "粉" : "蓝"}读取`}</b></button>
          </div>
        </section>
      </DecisionOverlay>}

      {ruleOpen && <div className="drawer-shade"><aside className="rule-drawer"><header><div><span>RULE ENGINE · V0.1</span><h2>原型说明</h2></div><button onClick={() => setRuleOpen(false)}>×</button></header><section><b>拿 1 → 打 1</b><p>规则引擎枚举合法动作；AI 只能在这些动作里评分选择。其他 AI 的目标和手牌不会进入其可见状态。</p></section><section><b>终局与破平</b><p>目标分加上剩余 Joy 得到总分。总分相同时，剩余 Joy 较多者胜；若 Joy 仍相同，则并列。</p></section><section><b>启发式优先级</b><p>自己的目标完成度 ＞ 明显互卡 ＞ Joy 管理 ＞ 粗略目标推理 ＞ 小随机扰动。</p></section><section><b>长期身份历史</b><p>每次长期身份改变时，将新身份标记叠在原身份之上；最上层为当前长期身份，下方历史保持公开。临时身份不进入此栈。【detrans】移除最上层并恢复下一层；【改好证了！】阻止身份层的压入与弹出。</p></section><section><b>非二元读取</b><p>每次二切或社会环境即将判断非二元玩家的身份前，该玩家都可支付 1 Joy 永久切换蓝/粉读取，然后再结算。</p></section><section><b>enby 计分</b><p>首次触发任意白色牌效终局 +6。小件包括：宽大卫衣或亚文化裙裤（衣物类只计其中 1 件）、吉他、小证；每件终局 +2，最多计算 3 件、共 +6。</p></section><section><b>小证</b><p>当【她】将补入公共牌列时，可弃置 1 张手牌将【她】换入手牌并消耗截获能力；放行不消耗能力。小证物件始终保留用于计分。</p></section><section><b>真心话大冒险</b><p>目标可支付 2 Joy 反制；AI 会权衡目标泄露风险、当前领先程度、反查收益与 Joy 储备。</p></section><section><b>AI 记忆</b><p>目标猜测来自公开行为。真心话可建立确定记忆；换一种活法公开交换目标牌，已知目标信息会随目标牌一起移动。</p></section><section><b>规则忠实</b><p>不替设计者改牌。歧义只写入终局 warning，并按最窄字面实现。</p></section></aside></div>}
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("spectate");
  const [started, setStarted] = useState(false);
  const [humanName, setHumanName] = useState("");

  if (started) {
    const names = mode === "spectate" ? DEFAULT_AI_NAMES : [humanName.trim() || "欣娅", ...DEFAULT_SOLO_NAMES.slice(1)];
    return <GameTable mode={mode} names={names} onExit={() => setStarted(false)} />;
  }

  return (
    <main className="landing-page">
      <div className="neon-orb orb-pink" /><div className="neon-orb orb-blue" />
      <header className="landing-brand"><strong>dress-<em>up!</em></strong></header>
      <section className="landing-hero">
        <h1><span className="landing-title-main">盛装登场</span><span className="landing-title-sub">开启我们的<em>性别探索</em>之旅</span></h1>
        <div className="hero-intro"><strong>国内首款性别表达主题桌游</strong><p>一场关于身份、呈现与被看见的四人卡牌游戏。<br />穿衣、试探、观察别人，再做一点有理由的坏事。</p></div>
      </section>
      <section className="mode-card">
        <div className="mode-heading"><h2>怎么开始这局？</h2></div>
        <div className="mode-tabs"><button className={mode === "spectate" ? "selected" : ""} onClick={() => setMode("spectate")}><span><b>4 AI 观战</b><small>看四个 AI 自己玩完一局。</small></span></button><button className={mode === "solo" ? "selected" : ""} onClick={() => setMode("solo")}><span><b>1 人 + 3 AI</b><small>你来出牌，其余玩家自动行动。</small></span></button></div>
        {mode === "solo" && <label className="human-name"><span>你的名字</span><input value={humanName} placeholder="欣娅" maxLength={10} onChange={(event) => setHumanName(event.target.value)} /></label>}
        <button className="launch-button" onClick={() => setStarted(true)}><span>{mode === "spectate" ? "开始观战" : "开始游戏"}</span><b>→</b></button>
      </section>
      <div className="landing-props" aria-hidden="true"><div className="prop-card prop-one" /><div className="prop-card prop-three" /></div>
    </main>
  );
}
