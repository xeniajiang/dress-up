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
  assert.match(page, /isHumanBeautyOffer\s*=\s*mode === "solo" && game\.beautyOffer\?\.playerId === 0/);
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
  assert.match(page, /悬浮或滚动查看牌面效果/);
  assert.match(page, /左右滑动查看牌面效果/);
  assert.doesNotMatch(page, /ArrowLeft|ArrowRight/);
  assert.match(page, /setTimeout\(\(\) => \{[\s\S]*?setShowEffect\(true\);[\s\S]*?\}, 180\)/);
  assert.match(page, /onWheel=\{handleWheel\}/);
  assert.match(page, /onTouchStart=\{handleTouchStart\}/);
  assert.match(page, /onMouseEnter=\{handleMouseEnter\}/);
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
