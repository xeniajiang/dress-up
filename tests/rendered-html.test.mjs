import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the dress-up prototype landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /DRESS-UP! · 四人身份卡牌游戏/i);
  assert.match(html, /4 AI 观战/);
  assert.match(html, /1 人 \+ 3 AI/);
  assert.match(html, /酷<\/span>装登场/);
  assert.match(html, /性别探索/);
  assert.match(html, /国内首款性别表达主题桌游/);
  assert.match(html, /开始观战/);
  assert.doesNotMatch(html, /HEURISTIC AI CARD GAME|NO ROLLOUT|CHOOSE A TABLE|AI_DEBUG/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps local game modes, three card categories, and metadata in the application source", async () => {
  const [page, layout, styles, engine] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai-engine.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /4 AI 观战/);
  assert.match(page, /1 人 \+ 3 AI/);
  assert.match(page, /chooseHeuristicAction/);
  assert.match(page, /\["欣娅", "花雨", "晓山", "姬姐"\]/);
  assert.match(page, /humanName\.trim\(\) \|\| "欣娅"/);
  assert.match(page, /choice-restore-button/);
  assert.match(page, /SOLO_CONTROLLERS:[^=]+\s*=\s*\["human", "ai", "ai", "ai"\]/);
  assert.match(page, /controllerForDecision\(game\)/);
  assert.match(page, /shouldWaitForHuman\s*=\s*decisionController === "human"/);
  assert.doesNotMatch(page, /decisionOwnerId\s*===\s*0/);
  assert.match(page, /展示牌堆顶 \{game\.beautyOffer\.revealed\.length\} 张/);
  assert.match(page, /不打出，全部置于牌堆底/);
  assert.match(page, /sharedWardrobeDragMode/);
  assert.match(page, /draggable onDragStart=\{\(event\) => beginBoardDrag/);
  assert.match(page, /className="player-drop-target"/);
  assert.match(page, /拖动高亮呈现到另一名玩家区域/);
  assert.doesNotMatch(page, /manzhanMoveActions\.map/);
  assert.match(page, /你pass吗？/);
  assert.match(page, /身份肯定/);
  assert.match(page, /temp-identity-token/);
  assert.doesNotMatch(page, /悬浮或滚动查看牌面效果/);
  assert.match(page, /左右滑动查看牌面效果/);
  assert.match(page, /30 秒知道你在干嘛/);
  assert.match(page, /每个人都只知道自己的目标/);
  assert.match(page, /这些行动都会泄露一点信息/);
  assert.match(page, /每个人心里藏着什么/);
  assert.match(page, /不用背。知道大家可能在追什么，就可以开始猜了/);
  assert.match(page, /知道了，开始玩/);
  assert.match(page, /className="goal-guide-trigger"/);
  assert.match(page, /终局身份为男性；留长发；检定不要太高；拿到吉他/);
  assert.match(page, /终局身份为非二元；触发白色效果；收集宽大卫衣或亚文化裙裤、吉他、小证/);
  assert.match(page, /边做自己的目标，边猜别人想干嘛/);
  assert.doesNotMatch(page, /先开一局/);
  assert.doesNotMatch(page, /身份、检定、二切牌这些规则，遇到时再告诉你/);
  assert.match(page, /继续：看看五种目标/);
  assert.match(page, /跳过全部教学/);
  assert.match(page, /重新开启教学/);
  assert.match(page, /心动标记会持续产生 Joy/);
  assert.match(page, /是主要跑分牌/);
  assert.match(page, /TUTORIAL_SCORING_CARDS = new Set\(\["美妆博主"/);
  assert.match(page, /秘密目标可以交换/);
  assert.match(page, /可以固定临时身份/);
  assert.match(page, /Dress Code 会检查全场/);
  assert.match(page, /DEI 会改变之后的职场规则/);
  assert.match(page, /自由职业者退出职场结算/);
  assert.match(page, /tutorialObservedCard/);
  assert.match(page, /tutorialHistoryLoaded/);
  assert.match(page, /暗牌库和明牌库完全耗尽时，由最后一名玩家完成出牌，然后游戏结束/);
  assert.match(page, /className="tutorial-log-access"/);
  assert.doesNotMatch(page, /setRunning\(false\)/);
  assert.match(page, /TUTORIAL_INTRO_KEY/);
  assert.match(page, /ruleView === "quick"/);
  assert.match(page, /ruleView === "full"/);
  assert.doesNotMatch(page, /ArrowLeft|ArrowRight/);
  assert.match(page, /setTimeout\(\(\) => \{[\s\S]*?setShowEffect\(true\);[\s\S]*?\}, 180\)/);
  assert.match(page, /onWheel=\{handleWheel\}/);
  assert.match(page, /onTouchStart=\{handleTouchStart\}/);
  assert.match(page, /onMouseEnter=\{handleMouseEnter\}/);
  assert.match(page, /const nextScale = Math\.min\(1, availableHeight \/ Math\.max\(1, stage\.scrollHeight\)\)/);
  assert.match(page, /new ResizeObserver\(fitToViewport\)/);
  assert.match(page, /ref=\{resultStageRef\}/);
  assert.match(styles, /\.result-stage\s*\{[^}]*display:\s*flow-root;[^}]*transform-origin:\s*top center;/);
  assert.match(page, /BINARY_EFFECT_CARDS = new Set\(\["美妆博主", "你pass吗？", "老男人看了你一眼", "职场 Dress Code"\]\)/);
  assert.match(page, /TERNARY_EFFECT_CARDS = new Set\(\["扑朔迷离", "先入为主"\]\)/);
  assert.doesNotMatch(page, /还好试了一下/);
  assert.match(engine, /kind: "present" \| "action" \| "venue";/);
  assert.match(engine, /name: "她", count: 3, kind: "action"/);
  assert.match(engine, /name: "他", count: 2, kind: "action"/);
  assert.doesNotMatch(engine, /kind: "(?:identity|binary|object|social|workplace|ternary)"/);
  assert.doesNotMatch(styles, /\.card-(?:blue|split)\s*\{/);
  assert.match(styles, /\.temp-identity-token/);
  assert.match(styles, /\.tabletop-shell\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-y:\s*hidden;/);
  assert.match(styles, /overscroll-behavior:\s*none;/);
  assert.match(layout, /DRESS-UP! · 四人身份卡牌游戏/);
  assert.match(layout, /lang="zh-CN"/);
});

test("online room reuses the tabletop and never mounts the solo tutorial", async () => {
  const roomClient = await readFile(new URL("../app/room/room-client.tsx", import.meta.url), "utf8");
  assert.match(roomClient, /prototype-shell tabletop-shell multiplayer-tabletop/);
  assert.match(roomClient, /className="player-grid"/);
  assert.match(roomClient, /className="public-table"/);
  assert.match(roomClient, /personal-table desktop-personal-table/);
  assert.match(roomClient, /GoalGuide onboarding=\{false\}/);
  assert.doesNotMatch(roomClient, /TutorialIntro|TutorialCoachmark|startTutorial|tutorialEnabled|重新开启教学/);
});
