"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import {
  CardFace,
  CheckAdjustmentMark,
  CheckPip,
  DecisionOverlay,
  GoalGuide,
  IdentityHistoryStack,
  ambiguityCheckAdjustment,
  cardClass,
  cardGlyph,
  cardImage,
  goalCriteria,
  persistentItemHelp,
  resultRouteTags,
  resultStatusTags,
  shortName,
  venueBannerImage,
  venueEffectCopy,
} from "../page";
import { compareFinalStanding, finalScoreBreakdown, projectedScore, sharesFinalStanding, simCardChecked, simChecks, type SimAction, type SimPlayer } from "../../lib/ai-engine";
import type { GameStateMessage, ObserverVisualSnapshot, PlayAnimation, RoomStateMessage, ServerMessage, VisualSegment } from "../../lib/multiplayer-protocol";
import { shouldAcceptGameState } from "../../lib/multiplayer-protocol";
import { CARD_PLAY_REVEAL_DURATION_MS } from "../../lib/ui-timing";

const tokenKey = (roomId: string) => `dress-up:room:${roomId}:token`;
const nameKey = "dress-up:multiplayer-name";

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function RoomClient({ roomId }: { roomId: string }) {
  const socketRef = useRef<WebSocket | null>(null);
  const latestStateVersionRef = useRef(-1);
  const [nickname, setNickname] = useState("");
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [connection, setConnection] = useState<"idle" | "connecting" | "connected" | "closed">("idle");
  const [room, setRoom] = useState<RoomStateMessage | null>(null);
  const [game, setGame] = useState<GameStateMessage | null>(null);
  const [error, setError] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const connect = useCallback((token: string, name: string) => {
    socketRef.current?.close();
    setConnection("connecting");
    setError("");
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${window.location.host}/api/rooms/${roomId}/ws`);
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      setConnection("connected");
      socket.send(JSON.stringify({ type: "JOIN", playerToken: token, nickname: name || "欣娅" }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "ERROR") setError(message.message);
      else if (message.type === "ROOM_STATE") setRoom(message);
      else if (message.type === "GAME_STATE") {
        if (!shouldAcceptGameState(latestStateVersionRef.current, message.stateVersion)) return;
        latestStateVersionRef.current = message.stateVersion;
        setGame(message);
        setSelectedCardId((selected) => message.view.selfHand.some((card) => card.id === selected) ? selected : null);
      } else if (message.type === "TEST_RECORD") {
        downloadText(`${message.filename}.json`, message.json, "application/json");
        downloadText(`${message.filename}.txt`, message.txt, "text/plain");
      }
    });
    socket.addEventListener("close", () => setConnection("closed"));
    socket.addEventListener("error", () => setError("无法连接房间。请检查房间码后重试。"));
  }, [roomId]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(tokenKey(roomId));
    const savedName = window.localStorage.getItem(nameKey) ?? "";
    setNickname(savedName);
    if (savedToken) { setPlayerToken(savedToken); connect(savedToken, savedName); }
    return () => socketRef.current?.close();
  }, [connect, roomId]);

  const join = () => {
    const token = crypto.randomUUID();
    const name = nickname.trim() || "欣娅";
    window.localStorage.setItem(tokenKey(roomId), token);
    window.localStorage.setItem(nameKey, name);
    setPlayerToken(token);
    setNickname(name);
    connect(token, name);
  };

  const send = (message: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("连接尚未恢复。"); return; }
    socketRef.current.send(JSON.stringify(message));
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  if (!room) {
    return <main className="room-shell room-join-shell"><header className="room-brand"><a href="/">dress-<em>up!</em></a></header><section className="room-join-card"><p>联机房间</p><h1>{roomId || "无效房间码"}</h1>{!playerToken && <><label><span>你的名字</span><input value={nickname} maxLength={10} placeholder="欣娅" onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") join(); }} /></label><button onClick={join} disabled={roomId.length !== 5}>加入房间</button></>}{playerToken && <div className="room-connecting">{connection === "closed" ? <button onClick={() => connect(playerToken, nickname)}>重新连接</button> : "正在进入房间…"}</div>}{error && <p className="room-error">{error}</p>}<a className="room-back" href="/">返回首页</a></section></main>;
  }

  if (room.status === "lobby") {
    const self = room.seats[room.selfPlayerId];
    return <main className="room-shell"><header className="room-brand"><a href="/">dress-<em>up!</em></a><span className={`connection-state ${connection}`}>{connection === "connected" ? "已连接" : "连接中断"}</span></header><section className="lobby-card"><p>房间码</p><h1>{room.roomId}</h1><div className="room-copy-actions"><button onClick={() => copy(room.roomId)}>复制房间码</button><button onClick={() => copy(window.location.href)}>复制邀请链接</button></div><div className="lobby-seats">{room.seats.map((seat) => <article key={seat.playerId} className={seat.playerId === room.selfPlayerId ? "self" : ""}><b>{seat.playerId + 1}</b><span>{seat.name}</span><small>{seat.controller === "empty" ? "开局时由 AI 补齐" : seat.ready ? "已准备" : "未准备"}</small></article>)}</div><div className="lobby-actions"><button className="ready-button" onClick={() => send({ type: "READY", ready: !self.ready })}>{self.ready ? "取消准备" : "准备"}</button>{room.isHost && <button className="start-room-button" disabled={!room.canStart} onClick={() => send({ type: "START_GAME" })}>开始游戏</button>}</div>{room.isHost && !room.canStart && <p className="lobby-note">至少两名真人加入且全部准备后可以开始。</p>}{error && <p className="room-error">{error}</p>}</section></main>;
  }

  if (!game) return <main className="room-shell"><p className="room-loading">正在同步桌面…</p></main>;
  return <OnlineTable room={room} game={game} selectedCardId={selectedCardId} onSelectCard={setSelectedCardId} onAction={(action) => { setSelectedCardId(null); send({ type: "ACTION", actionId: action.id, requestId: crypto.randomUUID(), expectedStateVersion: game.stateVersion }); }} onControl={send} error={error} connection={connection} />;
}

function OnlineTable({ room, game, selectedCardId, onSelectCard, onAction, onControl, error, connection }: { room: RoomStateMessage; game: GameStateMessage; selectedCardId: string | null; onSelectCard: (id: string | null) => void; onAction: (action: SimAction) => void; onControl: (message: object) => void; error: string; connection: string }) {
  const { actions } = game;
  const [logOpen, setLogOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [choiceMinimizedAtVersion, setChoiceMinimizedAtVersion] = useState<number | null>(null);
  const [goalGuideAnchor, setGoalGuideAnchor] = useState<{ x: number; y: number } | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [fittingRoomSelectedIds, setFittingRoomSelectedIds] = useState<string[]>([]);
  const [movingPresent, setMovingPresent] = useState<{ presentId: string; sourcePlayerId: number } | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<number | null>(null);
  const [testToolsOpen, setTestToolsOpen] = useState(false);
  const resultStageRef = useRef<HTMLDivElement>(null);
  const [resultScale, setResultScale] = useState<number | null>(null);
  const seenVisualSegmentIdsRef = useRef(new Set<string>());
  const [visualSegmentQueue, setVisualSegmentQueue] = useState<VisualSegment[]>([]);
  const [activeVisualSegment, setActiveVisualSegment] = useState<VisualSegment | null>(null);
  const [playbackSnapshot, setPlaybackSnapshot] = useState<ObserverVisualSnapshot | null>(null);
  const [replayMode, setReplayMode] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const choiceMinimized = choiceMinimizedAtVersion === game.stateVersion;
  const setChoiceMinimized = (minimized: boolean) => setChoiceMinimizedAtVersion(minimized ? game.stateVersion : null);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const unseen = game.liveVisualSegments.filter((segment) => !seenVisualSegmentIdsRef.current.has(segment.segmentId));
    unseen.forEach((segment) => seenVisualSegmentIdsRef.current.add(segment.segmentId));
    if (replayMode || unseen.length === 0) return;
    setPlaybackSnapshot((snapshot) => snapshot ?? unseen[0].before);
    setVisualSegmentQueue((queue) => [...queue, ...unseen]);
  }, [game.liveVisualSegments, replayMode]);
  useEffect(() => {
    if (activeVisualSegment || visualSegmentQueue.length === 0) return;
    const next = visualSegmentQueue[0];
    setVisualSegmentQueue((queue) => queue.slice(1));
    const hasCardReveal = next.commands.some((command) => command.play !== null);
    const reachesEnd = next.after.view.phase === "ended";
    setPlaybackSnapshot(hasCardReveal || reachesEnd ? next.before : next.after);
    setActiveVisualSegment(next);
  }, [activeVisualSegment, visualSegmentQueue]);
  useEffect(() => {
    if (!activeVisualSegment) return;
    const duration = activeVisualSegment.commands.reduce((longest, command) => Math.max(longest, command.durationMs), 0);
    const timer = window.setTimeout(() => {
      setPlaybackSnapshot(activeVisualSegment.after);
      setActiveVisualSegment(null);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [activeVisualSegment]);
  useEffect(() => {
    if (activeVisualSegment || visualSegmentQueue.length > 0 || !playbackSnapshot) return;
    if (replayMode) setReplayMode(false);
    setPlaybackSnapshot(null);
  }, [activeVisualSegment, playbackSnapshot, replayMode, visualSegmentQueue.length]);
  const startReplay = () => {
    if (!game.replayBuffer || game.replayBuffer.segments.length === 0) return;
    setActiveVisualSegment(null);
    setPlaybackSnapshot(game.replayBuffer.anchor);
    setVisualSegmentQueue(game.replayBuffer.segments);
    setReplayMode(true);
  };
  const stopReplay = () => {
    setActiveVisualSegment(null);
    setVisualSegmentQueue([]);
    setPlaybackSnapshot(null);
    setReplayMode(false);
  };
  const pendingLiveSnapshot = !replayMode && !playbackSnapshot
    ? game.liveVisualSegments.find((segment) => !seenVisualSegmentIdsRef.current.has(segment.segmentId))?.before
    : null;
  const visibleSnapshot = playbackSnapshot ?? pendingLiveSnapshot;
  const view = visibleSnapshot?.view ?? game.view;
  const displayedKnownGoals = visibleSnapshot?.knownGoals ?? game.knownGoals;
  const activePlayAnimation: PlayAnimation | null = activeVisualSegment?.commands.find((command) => command.play)?.play ?? null;
  const hasUnqueuedVisualSegment = game.liveVisualSegments.some((segment) => !seenVisualSegmentIdsRef.current.has(segment.segmentId));
  const animationBusy = replayMode || activeVisualSegment !== null || visualSegmentQueue.length > 0 || hasUnqueuedVisualSegment;
  const availableActions = animationBusy ? [] : actions;
  const self = view.players[room.selfPlayerId];
  const rankings = useMemo(() => [...view.players].sort((a, b) => compareFinalStanding(a as unknown as SimPlayer, b as unknown as SimPlayer)), [view.players]);
  const currentDecisionSeat = room.currentDecision ? room.seats[room.currentDecision.playerId] : null;
  const decisionClockNow = room.paused && room.pausedAt ? room.pausedAt : clockNow;
  const currentWaitSeconds = room.currentDecision ? Math.max(0, Math.floor((decisionClockNow - room.currentDecision.startedAt) / 1000)) : 0;
  const secondsSince = (timestamp?: number | null) => timestamp ? Math.max(0, Math.floor((clockNow - timestamp) / 1000)) : 0;
  const criteria = useMemo(() => goalCriteria(self as unknown as SimPlayer), [self]);
  const drawActions = availableActions.filter((action) => action.type === "draw-blind" || action.type === "draw-market" || action.type === "skip-draw");
  const deckAction = drawActions.find((action) => action.type === "draw-blind" || action.type === "skip-draw");
  const selectedActions = selectedCardId ? availableActions.filter((action) => action.cardId === selectedCardId) : [];
  const venueConvertActions = availableActions.filter((action) => action.type === "venue-convert");
  const finalPlayPassAction = availableActions.find((action) => action.type === "final-play-pass");
  const beautyActions = availableActions.filter((action) => action.type === "beauty-blogger-play");
  const beautyPassAction = availableActions.find((action) => action.type === "beauty-blogger-pass");
  const fittingRoomSelectActions = availableActions.filter((action) => action.type === "fitting-room-select");
  const fittingRoomSoloAction = availableActions.find((action) => action.type === "fitting-room-solo-play");
  const fittingRoomAllocateActions = availableActions.filter((action) => action.type === "fitting-room-allocate");
  const fittingRoomFizzleAction = availableActions.find((action) => action.type === "fitting-room-fizzle");
  const sharedWardrobeSelectActions = availableActions.filter((action) => action.type === "shared-wardrobe-select");
  const sharedWardrobePassAction = availableActions.find((action) => action.type === "shared-wardrobe-pass");
  const sharedWardrobeChoiceActions = availableActions.filter((action) => action.type === "shared-wardrobe-transfer" || action.type === "shared-wardrobe-lose-joy");
  const dressCodeActions = availableActions.filter((action) => action.type === "dress-code-preserve" || action.type === "dress-code-discard-all");
  const venueExchangeActions = availableActions.filter((action) => action.type === "venue-exchange-discard");
  const manzhanMoveActions = availableActions.filter((action) => action.type === "venue-manzhan-move");
  const manzhanDragMode = view.manzhanPinkPrompt?.playerId === self.id && manzhanMoveActions.length > 0;
  const selectedHandCard = view.forcedPlay?.card.id === selectedCardId
    ? view.forcedPlay.card
    : view.selfHand.find((card) => card.id === selectedCardId);
  const sharedWardrobeDragMode = selectedHandCard?.name === "共享衣橱";
  const sharedWardrobeResponseMode = view.sharedWardrobeOffer?.stage === "target-select" && (sharedWardrobeSelectActions.length > 0 || Boolean(sharedWardrobePassAction));
  const sharedWardrobeActorChoiceMode = view.sharedWardrobeOffer?.stage === "actor-choice" && sharedWardrobeChoiceActions.length > 0;
  const boardMoveActions = manzhanDragMode
    ? manzhanMoveActions
    : sharedWardrobeResponseMode
      ? sharedWardrobeSelectActions
      : sharedWardrobeDragMode
        ? selectedActions.filter((action) => action.sourcePlayerId !== undefined && action.presentId && action.destinationPlayerId !== undefined)
        : [];
  const boardMoveMode = boardMoveActions.length > 0;
  const fittingRoomCandidateCards = view.fittingRoomOffer?.stage === "select" ? [...view.market, ...view.fittingRoomOffer.revealed] : [];
  const fittingRoomSelectedAction = fittingRoomSelectActions.find((action) => {
    const ids = action.presentIds ?? [];
    return ids.length === 2 && fittingRoomSelectedIds.length === 2 && fittingRoomSelectedIds.every((id) => ids.includes(id));
  });
  const specialActionTypes = [
    "beauty-blogger-play", "beauty-blogger-pass",
    "fitting-room-select", "fitting-room-solo-play", "fitting-room-allocate", "fitting-room-fizzle",
    "shared-wardrobe-select", "shared-wardrobe-pass", "shared-wardrobe-transfer", "shared-wardrobe-lose-joy",
    "dress-code-preserve", "dress-code-discard-all", "venue-exchange-discard", "venue-manzhan-move",
  ];
  const promptActions = availableActions.filter((action) => !["play", "draw-blind", "draw-market", "skip-draw", "final-play-pass", "venue-convert", ...specialActionTypes].includes(action.type));
  const actionChoices = promptActions;
  const responseType = actionChoices[0]?.type;
  const responseCopy = (() => {
    if (game.pendingPronounCardName) return { kicker: `【${game.pendingPronounCardName}】正在对你结算`, title: "选择你的长期身份", body: "接受这张牌的二元身份；或支付 1 Joy，成为非二元并设定对应读取。" };
    if (responseType?.startsWith("certificate-")) return { kicker: "一张【她】将补入公共牌列", title: "要用哪张手牌替换？", body: "弃置 1 张手牌可将【她】换入手牌；放行不会消耗小证的截获能力。" };
    if (responseType?.startsWith("truth-")) return { kicker: "【真心话大冒险】正在对你结算", title: "要隐藏你的目标吗？", body: "不反制：对方查看你的目标。支付 2 Joy：阻止查看，并改为你查看对方的目标。" };
    if (responseType?.startsWith("confusion-")) return { kicker: "【迷茫】正在对你结算", title: "选择一项代价", body: "支付 1 Joy、弃置自己的一张呈现，或跳过自己的下回合。" };
    if (responseType?.startsWith("beauty-blogger-")) return { kicker: "【美妆博主】", title: `展示牌堆顶 ${view.beautyOffer?.revealed.length ?? 0} 张`, body: "可以立即打出其中一张呈现；未选择的牌按展示顺序置于牌堆底。" };
    if (responseType?.startsWith("fitting-room-")) return { kicker: "【闺蜜试衣间】", title: view.fittingRoomOffer?.stage === "allocate" ? "分配亮出的呈现" : "选择呈现", body: "牌堆顶牌仅打牌者可见；选中的呈现会向全场亮出并立即打出。" };
    if (responseType?.startsWith("shared-wardrobe-")) return { kicker: "【共享衣橱】", title: "选择移动的呈现", body: "按牌面顺序完成双方的呈现移动。" };
    if (responseType?.startsWith("reading-")) return { kicker: `【${view.readingPrompt?.checks[view.readingPrompt.index]?.sourceName ?? game.pendingPronounCardName ?? "牌效"}】即将判断身份`, title: "确认非二元读取", body: "保持当前方向，或支付 1 Joy 永久切换后再结算。" };
    if (responseType === "check-count-select") return { kicker: "持续状态的白色效果", title: `【${view.checkCountPrompt?.checks[view.checkCountPrompt.index]?.sourceName ?? "牌效"}】本次读到几个检定？`, body: "本次选择 +1 或 −1；终局目标仍按真实检定数计分。" };
    if (responseType?.startsWith("dress-code-")) return { kicker: "职场 Dress Code · 扑朔迷离", title: "选择保留一张检定呈现", body: "可以因【扑朔迷离】保留其中一张；其他带 ✦ 的呈现将被弃置。" };
    if (responseType === "venue-exchange-discard") return { kicker: "【福灵塔】", title: "选择弃置一张牌", body: `牌已经摸入手牌；还需弃置 ${view.venueExchange?.discardRemaining ?? 1} 张。` };
    if (responseType?.startsWith("venue-manzhan-")) return { kicker: "【漫展】", title: "选择本回合的场地效果", body: "按当前身份选择并完整结算，然后继续原本的回合。" };
    return { kicker: "牌效响应", title: "完成当前选择", body: "" };
  })();
  const forcedSelfCard = view.forcedPlay?.playerId === self.id ? view.forcedPlay.card : null;

  useEffect(() => {
    if (view.phase !== "ended") {
      setResultScale(null);
      return;
    }
    const stage = resultStageRef.current;
    const page = stage?.parentElement;
    if (!stage || !page) return;
    let frame = 0;
    const fitToViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const paddingBottom = Number.parseFloat(window.getComputedStyle(page).paddingBottom) || 0;
        const availableHeight = Math.max(1, page.clientHeight - stage.offsetTop - paddingBottom);
        const nextScale = Math.min(1, availableHeight / Math.max(1, stage.scrollHeight));
        setResultScale((current) => current !== null && Math.abs(current - nextScale) < 0.005 ? current : nextScale);
      });
    };
    fitToViewport();
    const observer = new ResizeObserver(fitToViewport);
    observer.observe(stage);
    window.addEventListener("resize", fitToViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fitToViewport);
    };
  }, [view.phase]);

  useEffect(() => {
    if (!boardMoveMode) {
      setMovingPresent(null);
      setDragOverTargetId(null);
    }
  }, [boardMoveMode, game.stateVersion]);
  useEffect(() => {
    setFittingRoomSelectedIds([]);
  }, [view.fittingRoomOffer?.stage, view.fittingRoomOffer?.actorId]);

  const selectBoardPresent = (event: MouseEvent<HTMLButtonElement>, presentId: string, sourcePlayerId: number) => {
    event.stopPropagation();
    setMovingPresent((current) => current?.presentId === presentId && current.sourcePlayerId === sourcePlayerId ? null : { presentId, sourcePlayerId });
    setDragOverTargetId(null);
  };
  const beginBoardDrag = (event: DragEvent<HTMLButtonElement>, presentId: string, sourcePlayerId: number) => {
    setMovingPresent({ presentId, sourcePlayerId });
    setDragOverTargetId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${sourcePlayerId}:${presentId}`);
  };
  const boardMoveToPlayer = (playerId: number) => movingPresent
    ? boardMoveActions.find((action) => action.presentId === movingPresent.presentId && action.sourcePlayerId === movingPresent.sourcePlayerId && (action.destinationPlayerId ?? action.targetId) === playerId)
    : undefined;
  const finishBoardMove = (playerId: number) => {
    const action = boardMoveToPlayer(playerId);
    if (!action) return;
    setMovingPresent(null);
    setDragOverTargetId(null);
    onAction(action);
  };
  const dropBoardPresent = (event: DragEvent<HTMLElement>, playerId: number) => {
    if (!boardMoveToPlayer(playerId)) return;
    event.preventDefault();
    finishBoardMove(playerId);
  };
  const toggleFittingRoomCard = (card: { id: string; kind: string }) => {
    if (card.kind !== "present") return;
    setFittingRoomSelectedIds((selected) => selected.includes(card.id)
      ? selected.filter((id) => id !== card.id)
      : selected.length < 2 ? [...selected, card.id] : selected);
  };

  if (view.phase === "ended") {
    const winningScore = projectedScore(rankings[0] as unknown as SimPlayer);
    const winners = rankings.filter((player) => sharesFinalStanding(player as unknown as SimPlayer, rankings[0] as unknown as SimPlayer));
    return <main className="result-page">
      <div className="result-logo" aria-label="dress-up!">dress-<em>up!</em></div>
      <div className="result-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className="result-stage" ref={resultStageRef} style={resultScale === null ? undefined : { transform: `scale(${resultScale})` }}>
        <header className="result-heading"><span className="result-crown" aria-hidden="true" /><h1><span>{winners.map((player) => player.name).join("、")}获胜</span><b>{winningScore}</b><i aria-hidden="true">✦</i></h1></header>
        <section className="result-goal-row" aria-label="揭开的隐藏目标">{rankings.map((visiblePlayer, index) => {
          const player = visiblePlayer as unknown as SimPlayer;
          const breakdown = finalScoreBreakdown(player);
          const scoredItems = breakdown.goalItems.filter((item) => item.points > 0);
          const scoredKeys = new Set(scoredItems.map((item) => item.key));
          const goalPoints = scoredItems.reduce((sum, item) => sum + item.points, 0);
          const standingRank = rankings.findIndex((ranked) => sharesFinalStanding(ranked as unknown as SimPlayer, player)) + 1;
          const isWinner = sharesFinalStanding(player, rankings[0] as unknown as SimPlayer);
          const identityLabel = player.identity === "male" ? "男性" : player.identity === "female" ? "女性" : "非二元";
          return <article className={`result-goal-card result-rank-${index + 1}${index === 0 ? " is-primary-winner" : ""}${isWinner ? " is-winner" : ""}`} key={player.id}>
            <header className="result-player-line"><span className="result-rank">{standingRank}</span><b>{player.name}</b><strong className="result-total">{breakdown.total}</strong></header>
            <div className={`revealed-goal${player.goal === "demi-girl" || player.goal === "enby" ? " is-latin" : ""}`}><h2>{player.goal}</h2></div>
            {scoredItems.length > 0 && <div className="goal-score-lines" aria-label="实际得分的目标条款">{scoredItems.map((item) => <p key={item.key}><span>✓ {item.label}</span><b>+{item.points}</b></p>)}</div>}
            <div className="goal-equation" aria-label={`目标 ${goalPoints}，加 Joy ${breakdown.joyPoints}，总分 ${breakdown.total}`}><span>目标 {goalPoints}</span><i>+ Joy {breakdown.joyPoints}</i><b>= {breakdown.total}</b></div>
            <footer className="result-final-note" aria-label="最终状态"><span className={`result-state-chip state-${player.identity}`}>{identityLabel}</span>{player.identity === "nonbinary" && <span className={`result-state-chip reading-${player.reading}`}>{player.reading === "male" ? "蓝读取" : "粉读取"}</span>}<span className="result-state-chip result-check-count"><CheckPip />{simChecks(player)}</span>{resultRouteTags(player, scoredKeys).map((tag) => <span className="result-state-chip result-route-chip" key={`route-${tag}`}>{tag}</span>)}{resultStatusTags(player).map((tag) => <span className="result-state-chip result-status-chip" key={`status-${tag}`}>状态 · {shortName(tag)}</span>)}{(player.scoreSources ?? []).map((source) => <span className="result-state-chip result-score-source-chip" key={`source-${source.cardName}`}>{source.cardName} +{source.joy} Joy</span>)}</footer>
            {index === 0 && <span className="result-winner-art" aria-hidden="true" />}
          </article>;
        })}</section>
        {view.warnings.length > 0 && <section className="warning-panel"><h2>规则 warning</h2>{view.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section>}
        <div className="result-actions"><a href="/"><span aria-hidden="true">☷</span>返回模式选择</a></div>
      </div>
    </main>;
  }

  const ownHand = (className: string) => <div className={`own-hand ${className}`}>{forcedSelfCard && (() => {
    const selected = selectedCardId === forcedSelfCard.id;
    const selectable = availableActions.some((action) => action.cardId === forcedSelfCard.id);
    return <button type="button" className={`own-card table-card forced-play-card ${cardClass(forcedSelfCard.kind, forcedSelfCard.checked)} ${selected ? "is-selected" : ""} ${view.dei && forcedSelfCard.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} aria-disabled={!selectable} tabIndex={selectable ? 0 : -1} onClick={() => {
      if (!selectable) return;
      onSelectCard(selected ? null : forcedSelfCard.id);
      setSelectedTargetId(null);
    }} key={`forced-${forcedSelfCard.id}`}><em>立即打出</em><CardFace card={forcedSelfCard} /></button>;
  })()}{view.selfHand.map((card) => {
    const selectable = availableActions.some((action) => action.cardId === card.id);
    const selected = selectedCardId === card.id;
    return <button type="button" className={`own-card table-card ${cardClass(card.kind, card.checked)} ${selected ? "is-selected" : ""} ${view.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} aria-disabled={!selectable} tabIndex={selectable ? 0 : -1} onClick={() => {
      if (!selectable) return;
      if (selected) {
        const immediate = selectedActions.filter((action) => action.targetId === undefined && action.marketCardId === undefined && action.presentId === undefined);
        if (immediate.length === 1) { onAction(immediate[0]); setSelectedTargetId(null); return; }
      }
      onSelectCard(selected ? null : card.id);
      setSelectedTargetId(null);
    }} title={selected && selectedActions.some((action) => action.targetId === undefined && action.marketCardId === undefined && action.presentId === undefined) ? "再次点击打出" : undefined} key={card.id}><CardFace card={card} /></button>;
  })}</div>;

  const selfHasDistinctTempIdentity = Boolean(self.tempIdentity && self.tempIdentity !== self.identity);
  const selfReading = (self.tempIdentity ?? self.identity) === "nonbinary" ? self.reading : (self.tempIdentity ?? self.identity);
  const goalAndStatus = () => <><aside className="goal-card-object"><header><small>你的目标</small><strong>{self.goal}</strong><button className="goal-guide-trigger" type="button" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setGoalGuideAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }); }}>五种目标</button></header><div>{criteria.map((criterion) => <p className={criterion.done ? "is-done" : ""} key={criterion.text}><span>{criterion.done ? "✓ " : "□ "}{criterion.text}</span><b>{criterion.points}</b></p>)}</div></aside><div className="self-status"><IdentityHistoryStack player={self as unknown as SimPlayer} superseded={selfHasDistinctTempIdentity} />{selfHasDistinctTempIdentity && <span className={`temp-identity-token identity-${self.tempIdentity}`} title="临时身份持续至自己的下回合结束"><strong aria-label="临时身份">◷</strong>{self.tempIdentity === "male" ? "男性" : self.tempIdentity === "female" ? "女性" : `非二元 · ${selfReading === "male" ? "蓝" : "粉"}读取`}</span>}<b className="self-check-count"><CheckPip />{simChecks(self as unknown as SimPlayer)}</b><b>Joy {self.joy} ☺</b></div></>;

  return <main className="prototype-shell tabletop-shell multiplayer-tabletop">
    <header className="tabletop-header"><div className="mini-logo"><strong>dress-<em>up!</em></strong></div><div className="table-utilities online-table-utilities">
      <button onClick={() => setRuleOpen(true)} aria-label="规则" title="规则">?</button>
      {!replayMode && Boolean(game.replayBuffer?.segments.length) && <button className="online-replay-button" onClick={startReplay} disabled={animationBusy} aria-label="回看刚才" title="回看刚才">↶ 回看刚才</button>}
      {replayMode && <button className="online-replay-button is-active" onClick={stopReplay} aria-label="退出回看" title="退出回看">退出回看</button>}
      <button className={`online-control-button ${game.controlMode !== "manual" ? "is-active" : ""}`} disabled={game.controlMode === "ai-host"} onClick={() => onControl({ type: "SET_SELF_CONTROL", controlMode: game.controlMode === "ai-self" ? "manual" : "ai-self" })} aria-label={game.controlMode === "manual" ? "托管给 AI" : game.controlMode === "ai-host" ? "房主托管中" : "取消托管"} title={game.controlMode === "manual" ? "托管给 AI" : game.controlMode === "ai-host" ? "房主托管中" : "取消托管"}>{game.controlMode === "manual" ? "托管" : game.controlMode === "ai-host" ? "房主托管" : "取消托管"}</button>
      {room.isHost && <button className={testToolsOpen ? "is-active" : ""} onClick={() => setTestToolsOpen((open) => !open)} aria-label="测试工具" title="测试工具">⚙</button>}
      <button onClick={() => setLogOpen((value) => !value)} aria-label="对局记录" title={`对局记录 · 房间 ${room.roomId} · ${connection === "connected" ? "已连接" : "连接中断"}`}>☷</button><a href="/" aria-label="返回菜单" title="返回菜单">×</a></div></header>
    {room.paused && <div className="online-pause-banner" role="status">对局暂停中</div>}
    <section className="tabletop-arena">
      {(boardMoveMode || sharedWardrobeResponseMode) && <div className="board-move-hint" role="status"><b>{manzhanDragMode ? "漫展 · 粉" : sharedWardrobeResponseMode ? "共享衣橱 · 指定" : "共享衣橱"}</b><span>{manzhanDragMode ? "拖动高亮呈现到另一名玩家区域" : sharedWardrobeResponseMode ? sharedWardrobeSelectActions.length > 0 ? "从对方呈现区指定另一张牌" : "没有可以指定的另一张呈现" : "从另一名玩家的呈现区拖一张牌给自己"}</span>{boardMoveMode && <small>也可以先点呈现，再点目标区域</small>}{sharedWardrobeResponseMode && sharedWardrobePassAction && <button type="button" onClick={() => onAction(sharedWardrobePassAction)}>不指定</button>}</div>}
      <div className="player-grid">{view.players.map((player) => {
        const targetActions = selectedActions.filter((action) => action.targetId === player.id);
        const legalDropAction = boardMoveToPlayer(player.id);
        const currentIdentity = player.tempIdentity ?? player.identity;
        const reading = currentIdentity === "nonbinary" ? player.reading : currentIdentity;
        const hasDistinctTempIdentity = Boolean(player.tempIdentity && player.tempIdentity !== player.identity);
        const crushGivers = view.players.filter((giver) => giver.crushTargetIds.includes(player.id));
        return <article className={`player-zone player-${player.id} ${player.id === room.selfPlayerId ? "viewer-player" : ""} identity-${player.identity} ${player.tempIdentity ? "has-temp-identity" : ""} ${player.id === view.active ? "current-player" : ""} ${legalDropAction ? "is-legal-drop" : ""} ${dragOverTargetId === player.id ? "is-drag-over" : ""}`} key={player.id}>
          <div className="player-core"><div className="identity-chip avatar-placeholder" /><div className="player-name"><div className="player-name-line"><h2>{player.name}</h2>{crushGivers.length > 0 && <div className="crush-markers" aria-label="收到的心动标记">{crushGivers.map((giver) => <span className="crush-marker-token" title={`来自 ${giver.name} 的心动标记`} aria-label={`来自 ${giver.name} 的心动标记`} key={`crush-${giver.id}`}><b>♥</b><small>{giver.name}</small></span>)}</div>}</div><div className="identity-language"><IdentityHistoryStack player={player as unknown as SimPlayer} superseded={hasDistinctTempIdentity} />{hasDistinctTempIdentity && <span className={`temp-identity-token identity-${player.tempIdentity}`} title="临时身份持续至该玩家自己的下回合结束"><b aria-label="临时身份">◷</b>{player.tempIdentity === "male" ? "男性" : player.tempIdentity === "female" ? "女性" : `非二元 · ${reading === "male" ? "蓝" : "粉"}读取`}</span>}</div></div><div className="player-stats"><span className="check-count-token" aria-label={`${simChecks(player as unknown as SimPlayer)} 个检定`}><CheckPip />{simChecks(player as unknown as SimPlayer)}</span><div className="joy-token"><b>{player.joy}</b><span>☺</span>{player.joyLossVersion > 0 && <i className="joy-loss-pop" key={`${player.id}-${player.joyLossVersion}`}>−{player.lastJoyLoss}</i>}</div></div></div>
          <div className="player-objects">{player.presents.map((card) => {
            const image = cardImage(card.name);
            const isChecked = simCardChecked(card);
            const isFresh = card.freshUntilTurnSerial !== undefined && view.turnSerial < card.freshUntilTurnSerial;
            const checkAnimation = card.checkAnimationKind ? `auto-check-${card.checkAnimationKind}` : "";
            const canMove = boardMoveMode && boardMoveActions.some((action) => action.sourcePlayerId === player.id && action.presentId === card.id);
            const isMoving = movingPresent?.sourcePlayerId === player.id && movingPresent.presentId === card.id;
            const content = <><i>{image ? <span className="presentation-art-image" style={{ backgroundImage: `url(${image})` }} aria-hidden="true" /> : cardGlyph(card.name)}</i><small>{shortName(card.name)}</small>{isChecked && <b aria-label="计入检定"><CheckPip /></b>}</>;
            const className = `mini-object ${isChecked ? "has-check" : ""} ${isFresh ? "fresh-present" : ""} ${checkAnimation} ${canMove ? "is-draggable-present" : ""} ${isMoving ? "is-moving-present" : ""}`;
            return canMove
              ? <button className={className} draggable onDragStart={(event) => beginBoardDrag(event, card.id, player.id)} onDragEnd={() => { setMovingPresent(null); setDragOverTargetId(null); }} onClick={(event) => selectBoardPresent(event, card.id, player.id)} aria-pressed={isMoving} key={`${card.id}-${card.checkAnimationVersion ?? 0}`}>{content}</button>
              : <div className={className} key={`${card.id}-${card.checkAnimationVersion ?? 0}`}>{content}</div>;
          })}{player.removedPresents.map(({ card, untilTurnSerial }) => <div className="mini-object removing-present" aria-hidden="true" key={`${card.id}-${untilTurnSerial}`}><i>{cardGlyph(card.name)}</i><small>{shortName(card.name)}</small>{card.checked && <b><CheckPip /></b>}</div>)}{player.items.map((item, index) => {
            const image = cardImage(item);
            const help = persistentItemHelp(item);
            return <div className={`mini-object item-object ${help ? "has-hover-help" : ""}`} title={help} aria-label={help ? `${item}：${help}` : undefined} key={`${item}-${index}`}><i>{image ? <span className="presentation-art-image" style={{ backgroundImage: `url(${image})` }} aria-hidden="true" /> : cardGlyph(item)}</i><small>{item}</small></div>;
          })}{player.ambiguityCard && <div className="mini-object ambiguity-status-object" aria-label={player.ambiguityCard.name}><i>{cardImage(player.ambiguityCard.name) ? <span className="presentation-art-image ambiguity-status-image" style={{ backgroundImage: `url(${cardImage(player.ambiguityCard.name)})` }} aria-hidden="true" /> : cardGlyph(player.ambiguityCard.name)}</i><small>{player.ambiguityCard.name}</small><CheckAdjustmentMark adjustment={ambiguityCheckAdjustment(player.ambiguityCard.name, currentIdentity)} className="ambiguity-check-marker" /></div>}</div>
          {player.id !== room.selfPlayerId && <div className="hand-fan" aria-label={`${player.name}有${player.handCount}张手牌`}><i /><i /><b>{player.handCount}</b></div>}
          {activePlayAnimation?.actorId === player.id && <div className={`ai-reveal-slot destination-${activePlayAnimation.destination}`} aria-hidden="true" key={activePlayAnimation.version}><div className="ai-reveal-card" style={{ animationDuration: `${CARD_PLAY_REVEAL_DURATION_MS}ms` }}><div className={`ai-reveal-front table-card ${cardClass(activePlayAnimation.card.kind, activePlayAnimation.card.checked)} ${view.dei && activePlayAnimation.card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`}><CardFace card={activePlayAnimation.card} /></div></div></div>}
          {player.id !== room.selfPlayerId && <div className={`goal-object ${displayedKnownGoals[player.id] ? "known-goal" : "face-down"}`}>{displayedKnownGoals[player.id] ?? "?"}</div>}
          {selectedCardId && !sharedWardrobeDragMode && selectedTargetId === null && targetActions.length > 0 && <button className="target-marker" onClick={() => { const immediate = targetActions.filter((action) => action.marketCardId === undefined); if (immediate.length === 1 && targetActions.length === 1) onAction(immediate[0]); else setSelectedTargetId(player.id); }}>使用</button>}
          {legalDropAction && <button type="button" className="player-drop-target" aria-label={`把所选呈现移动给${player.name}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverTargetId(player.id); }} onDragLeave={() => { if (dragOverTargetId === player.id) setDragOverTargetId(null); }} onDrop={(event) => dropBoardPresent(event, player.id)} onClick={() => finishBoardMove(player.id)}><span>放到这里</span></button>}
        </article>;
      })}</div>
      <section className="public-table">
        {view.poolNotice && <div className="pool-notice" role="status">{view.poolNotice}</div>}
        {view.venue && <div className="venue-object">
          <i className="venue-object-art" style={{ backgroundImage: `url(${venueBannerImage(view.venue.card.name)})` }} aria-hidden="true" />
          <div className="venue-object-copy"><b>{view.venue.card.name}</b><span>{venueEffectCopy(view.venue.card.name)}</span><small>持续至 {view.players[view.venue.ownerId].name} 的下回合结束</small>{venueConvertActions.length > 0 && <div className="venue-convert-actions">{venueConvertActions.map((action) => <button onClick={() => onAction(action)} key={action.id}>{action.venueIdentity === "female" ? "变为女性" : "变为非二元"}</button>)}</div>}</div>
        </div>}
        {view.dei && <div className="dei-badge" role="status" aria-label="职场 DEI 生效，职场 Dress Code 已禁用" title="职场 DEI 生效：职场 Dress Code 无效"><b>DEI</b></div>}
        {view.phase === "final-play" ? (
          <div className="final-play-banner" role="status"><b>最后一次出牌</b><span>{finalPlayPassAction ? "你没有手牌，可以结束最后行动。" : "牌已拿完，直接打出你最后的牌。"}</span>{finalPlayPassAction && <button type="button" onClick={() => onAction(finalPlayPassAction)}>结束最后行动</button>}</div>
        ) : (
        <div className="public-row"><button className={`deck-pile ${view.deckCount === 0 ? "is-empty" : ""} ${deckAction ? "is-actionable" : ""}`} disabled={!deckAction} onClick={() => deckAction && onAction(deckAction)} aria-label={deckAction?.type === "skip-draw" ? "牌堆已空，继续到出牌" : "暗摸一张牌"}><div className="card-back"><b>dress-<em>up!</em></b></div><span>{view.deckCount}</span></button><div className="market-cards">{view.market.map((card) => { const drawAction = drawActions.find((candidate) => candidate.type === "draw-market" && candidate.marketCardId === card.id); let playOptions = selectedActions.filter((candidate) => candidate.marketCardId === card.id); playOptions = selectedTargetId === null ? playOptions.filter((candidate) => candidate.targetId === undefined) : playOptions.filter((candidate) => candidate.targetId === selectedTargetId); const action = drawAction ?? (playOptions.length === 1 ? playOptions[0] : undefined); return <button className={`table-card ${cardClass(card.kind, card.checked)} ${action ? "is-actionable" : ""} ${view.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`} aria-disabled={!action} tabIndex={action ? 0 : -1} onClick={() => action && onAction(action)} key={card.id}><CardFace card={card} />{view.locks[card.id] !== undefined && <em className="lock-mark">锁给 {view.players[view.locks[card.id]].name}</em>}</button>; })}</div></div>
        )}
      </section>
      {ownHand("mobile-own-hand")}<section className="mobile-personal-summary">{goalAndStatus()}</section>
    </section>
    <section className="personal-table desktop-personal-table">{goalAndStatus()}{ownHand("desktop-own-hand")}</section>
    {goalGuideAnchor && <GoalGuide onboarding={false} targetAnchor={goalGuideAnchor} onClose={() => setGoalGuideAnchor(null)} />}
    {ruleOpen && <div className="drawer-shade"><aside className="rule-drawer"><header><div><span>HOW TO PLAY</span><h2>怎么玩？</h2></div><button onClick={() => setRuleOpen(false)}>×</button></header><p className="card-effect-gesture card-effect-gesture-mobile-only" role="note">左右滑动查看牌面效果</p><div className="quick-rules"><section><b>回合</b><p>拿 1 张 → 打 1 张</p></section><section><b>呈现</b><p>留在玩家面前；✦ 是检定；服装最多保留一件。</p></section><section><b>行动</b><p>通常结算后弃置；写有“留在你面前”的牌持续生效。</p></section><section><b>场地</b><p>场上同时只有一个，新场地会替换旧场地。</p></section><section><b>读取</b><p>蓝看蓝，粉看粉；非二元二切看读取，三切看白。</p></section><section><b>终局</b><p>明牌与暗牌都拿完后，尚未行动的玩家各打最后一张牌；总分 = 目标得分 + Joy。</p></section></div></aside></div>}
    {view.beautyOffer?.playerId === self.id && (beautyActions.length > 0 || beautyPassAction) && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="美妆博主展示牌选择"><section className="identity-choice-card beauty-blogger-choice">
      <span className="choice-kicker">美妆博主 · {self.name}</span><h2>展示牌堆顶 {view.beautyOffer.revealed.length} 张</h2><p>你可以立即打出其中一张呈现；未选择的牌会按展示顺序置于牌堆底。</p>
      <div className="beauty-reveal-grid compact-card-context">{view.beautyOffer.revealed.map((card) => {
        const cardActions = beautyActions.filter((action) => action.presentId === card.id);
        return <article key={card.id}><div className={`table-card ${cardClass(card.kind, card.checked)} ${view.dei && card.name === "职场 Dress Code" ? "is-dei-disabled" : ""}`}><CardFace card={card} /></div>{cardActions.length > 0 ? <div>{cardActions.map((action) => <button key={action.id} onClick={() => onAction(action)}>打给 {view.players[action.targetId!].name}</button>)}</div> : <small>{card.kind === "present" ? "没有合法接收者" : "不是呈现，将置于牌堆底"}</small>}</article>;
      })}</div>
      {beautyPassAction && <button className="beauty-pass" onClick={() => onAction(beautyPassAction)}>不打出，全部置于牌堆底</button>}
    </section></DecisionOverlay>}
    {view.fittingRoomOffer?.stage === "select" && view.fittingRoomOffer.actorId === self.id && (fittingRoomSelectActions.length > 0 || fittingRoomSoloAction || fittingRoomFizzleAction) && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="闺蜜试衣间选择呈现"><section className="identity-choice-card fitting-room-choice">
      <span className="choice-kicker">闺蜜试衣间 · {self.name} 与 {view.players[view.fittingRoomOffer.targetId].name}</span>
      <div className="fitting-room-choice-heading"><div><h2>{fittingRoomSoloAction ? "只找到一张呈现" : "挑两张呈现"}</h2><p>{fittingRoomSoloAction ? "可以将这张呈现立即打给自己；未选的牌堆顶牌会按原顺序放回。" : "点击卡牌逐张选择。非呈现牌不可选；未选的牌堆顶牌会按原顺序放回。"}</p></div>{!fittingRoomSoloAction && <b>{fittingRoomSelectedIds.length}/2</b>}</div>
      <div className="fitting-room-source-headings" aria-hidden="true"><span>公共牌列</span><span>牌堆顶 · 仅你可见</span></div>
      <div className="fitting-room-card-grid compact-card-context">{fittingRoomCandidateCards.map((card, index) => {
        const fromTop = index >= view.market.length;
        const topIndex = index - view.market.length;
        const selected = fittingRoomSelectedIds.includes(card.id);
        const canSelect = card.kind === "present";
        return <button type="button" key={card.id} className={`fitting-room-card-option ${fromTop ? "from-deck" : "from-market"} ${fromTop && topIndex === 0 ? "first-deck-card" : ""} ${selected ? "is-selected" : ""} ${!canSelect ? "is-ineligible" : ""}`} onClick={() => toggleFittingRoomCard(card)} disabled={!canSelect || (!selected && fittingRoomSelectedIds.length >= 2)} aria-pressed={selected}><span className="fitting-room-card-source">{fromTop ? `牌堆顶 ${topIndex + 1}` : `公共牌 ${index + 1}`}</span><div className={`table-card ${cardClass(card.kind, card.checked)}`}><CardFace card={card} /></div><small>{fittingRoomSoloAction && canSelect ? "可立即打给自己" : selected ? "已选择" : canSelect ? "点击选择" : "不可选择"}</small></button>;
      })}</div>
      <div className="fitting-room-selection-actions">{fittingRoomSoloAction ? <button className="fitting-room-confirm" onClick={() => { setFittingRoomSelectedIds([]); onAction(fittingRoomSoloAction); }}>立即打给自己</button> : <button className="fitting-room-confirm" disabled={!fittingRoomSelectedAction} onClick={() => { if (!fittingRoomSelectedAction) return; setFittingRoomSelectedIds([]); onAction(fittingRoomSelectedAction); }}>确认这两张</button>}{fittingRoomFizzleAction && <button className="fitting-room-fizzle" onClick={() => { setFittingRoomSelectedIds([]); onAction(fittingRoomFizzleAction); }}>没买到衣服</button>}</div>
    </section></DecisionOverlay>}
    {view.fittingRoomOffer?.stage === "allocate" && fittingRoomAllocateActions.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="闺蜜试衣间亮出并分配呈现"><section className="identity-choice-card fitting-room-choice fitting-room-allocation">
      <span className="choice-kicker">闺蜜试衣间 · {view.players[view.fittingRoomOffer.actorId].name} 选中了</span><h2>向全场亮出这两张呈现</h2><div className="fitting-room-selected-cards compact-card-context">{view.fittingRoomOffer.selected.map((card) => <div className={`table-card ${cardClass(card.kind, card.checked)}`} key={card.id}><CardFace card={card} /></div>)}</div><p>现在由你分配：自己留一张，另一张给 {view.players[view.fittingRoomOffer.actorId].name}。确认后双方立即打出；衣物正常覆盖。</p>
      <div className="fitting-room-allocation-actions">{fittingRoomAllocateActions.map((action) => { const given = view.fittingRoomOffer!.selected.find((card) => card.id === action.presentId)!; const kept = view.fittingRoomOffer!.selected.find((card) => card.id !== action.presentId)!; return <button key={action.id} onClick={() => onAction(action)}><span><i>自己留下</i><b>{shortName(kept.name)}</b></span><span><i>给 {view.players[view.fittingRoomOffer!.actorId].name}</i><b>{shortName(given.name)}</b></span></button>; })}</div>
    </section></DecisionOverlay>}
    {sharedWardrobeActorChoiceMode && view.sharedWardrobeOffer && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="共享衣橱移交选择"><section className="identity-choice-card certificate-choice">
      <span className="choice-kicker">共享衣橱 · {view.players[view.sharedWardrobeOffer.targetId].name} 指定了</span><h2>【{shortName(view.players[view.sharedWardrobeOffer.actorId].presents.find((card) => card.id === view.sharedWardrobeOffer?.selectedPresentId)?.name ?? "呈现")}】</h2><p>将这张牌移给 {view.players[view.sharedWardrobeOffer.targetId].name}，或失去 2 Joy 并保留它。</p><div className="certificate-actions">{sharedWardrobeChoiceActions.map((action) => <button key={action.id} onClick={() => onAction(action)}>{action.type === "shared-wardrobe-transfer" ? `移给 ${view.players[view.sharedWardrobeOffer!.targetId].name}` : "失去 2 Joy，保留"}</button>)}</div>
    </section></DecisionOverlay>}
    {dressCodeActions.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="职场 Dress Code 保留呈现"><section className="identity-choice-card fulingta-choice"><span className="choice-kicker">职场 Dress Code · 扑朔迷离</span><h2>选择保留一张检定呈现</h2><p>可以因【扑朔迷离】保留其中一张；其他带 ✦ 的呈现将被弃置。</p><div className="venue-exchange-discard-grid">{dressCodeActions.filter((action) => action.type === "dress-code-preserve").map((action) => { const card = self.presents.find((present) => present.id === action.presentId)!; const image = cardImage(card.name); return <button key={action.id} onClick={() => onAction(action)}><i>{image ? <span className="presentation-art-image" style={{ backgroundImage: `url(${image})` }} /> : cardGlyph(card.name)}</i><b>保留 {shortName(card.name)}</b></button>; })}</div>{dressCodeActions.some((action) => action.type === "dress-code-discard-all") && <div className="certificate-actions"><button onClick={() => onAction(dressCodeActions.find((action) => action.type === "dress-code-discard-all")!)}>不保留，全部弃置</button></div>}</section></DecisionOverlay>}
    {venueExchangeActions.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel="福灵塔换牌选择"><section className="identity-choice-card fulingta-choice"><span className="choice-kicker">福灵塔 · {self.name}</span><h2>选择弃置一张牌</h2><p>牌已经摸入手牌；还需弃置 {view.venueExchange?.discardRemaining ?? 1} 张。</p><div className="venue-exchange-discard-grid">{venueExchangeActions.map((action) => { const card = view.selfHand.find((held) => held.id === action.cardId)!; const image = cardImage(card.name); return <button key={action.id} onClick={() => onAction(action)}><i>{image ? <span className="presentation-art-image" style={{ backgroundImage: `url(${image})` }} /> : cardGlyph(card.name)}</i><b>{shortName(card.name)}</b></button>; })}</div></section></DecisionOverlay>}
    {actionChoices.length > 0 && <DecisionOverlay minimized={choiceMinimized} onMinimizedChange={setChoiceMinimized} ariaLabel={responseCopy.kicker}><section className="identity-choice-card certificate-choice"><span className="choice-kicker">{responseCopy.kicker}</span><h2>{responseCopy.title}</h2>{responseCopy.body && <p>{responseCopy.body}</p>}<div className="certificate-actions">{actionChoices.map((action) => <button key={action.id} onClick={() => onAction(action)}>{action.label}</button>)}</div></section></DecisionOverlay>}
    {logOpen && <aside className="event-drawer" aria-label="对局记录"><header><b>对局记录</b><button onClick={() => setLogOpen(false)}>×</button></header>{game.recentEvents.map((event, index) => <p key={`${event}-${index}`}>{event}</p>)}</aside>}
    {testToolsOpen && room.isHost && <aside className="host-test-tools" aria-label="真人试玩测试工具">
      <header><div><small>房间 {room.roomId}</small><b>测试工具</b></div><button onClick={() => setTestToolsOpen(false)} aria-label="关闭测试工具">×</button></header>
      <div className="host-seat-list">{room.seats.map((seat) => <article key={seat.playerId}>
        <div><b>{seat.name}</b><span>{seat.controller === "ai" ? "AI" : seat.connected ? "在线" : `断线 ${secondsSince(seat.disconnectedSince)}s`}</span><small>{seat.controller === "ai" ? "AI 座位" : seat.controlMode === "ai-self" ? "玩家托管" : seat.controlMode === "ai-host" ? "房主托管" : "manual"}{room.currentDecision?.playerId === seat.playerId ? " · 当前决策" : ""}</small></div>
        {seat.controller === "human" && <button onClick={() => onControl({ type: "HOST_SET_CONTROL", playerId: seat.playerId, enabled: seat.controlMode !== "ai-host" })}>{seat.controlMode === "ai-host" ? "恢复真人" : "持续托管"}</button>}
      </article>)}</div>
      <p className="host-current-wait">{room.currentDecision ? <>当前等待：<b>{currentDecisionSeat?.name}</b><strong>{currentWaitSeconds}s</strong><small>{room.currentDecision.detail}</small></> : "当前没有等待中的真人选择"}</p>
      {room.decisionStats && <div className="host-decision-stats"><span>总时长 <b>{Math.round(room.decisionStats.totalDurationMs / 1000)}s</b></span><span>平均决策 <b>{Math.round(room.decisionStats.averageDecisionMs / 1000)}s</b></span><span>拿牌 <b>{Math.round(room.decisionStats.averageDrawMs / 1000)}s</b></span><span>出牌 <b>{Math.round(room.decisionStats.averagePlayMs / 1000)}s</b></span><span>响应 <b>{Math.round(room.decisionStats.averageResponseMs / 1000)}s</b></span><span>最长 <b>{Math.round(room.decisionStats.longestDecisionMs / 1000)}s</b></span><span>托管决策 <b>{room.decisionStats.delegatedDecisions}</b></span></div>}
      <div className="host-tool-actions"><button disabled={!room.currentDecision || currentDecisionSeat?.controller !== "human" || room.paused} onClick={() => onControl({ type: "HOST_RESOLVE_ONE" })}>AI 处理当前选择</button><button onClick={() => onControl({ type: "HOST_SET_PAUSED", paused: !room.paused })}>{room.paused ? "继续对局" : "暂停对局"}</button><button onClick={() => onControl({ type: "EXPORT_TEST_RECORD" })}>导出测试记录</button></div>
    </aside>}
    {error && <p className="room-error online-error">{error}</p>}
  </main>;
}
