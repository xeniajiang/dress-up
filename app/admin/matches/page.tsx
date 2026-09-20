"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchRecord } from "../../../lib/match-record";

type Summary = {
  matchId: string;
  startTime: string;
  endTime: string | null;
  completed: boolean;
  mode: string;
  rulesVersion: string;
  buildVersion: string;
  starred: boolean;
  players: Array<{ playerId: string; displayName: string; humanOrAI: string; goal: string; totalScore: number | null }>;
  eventCount: number;
};

const modeName = (mode: string) => mode === "multiplayer" ? "联机" : mode === "spectator" ? "4 AI" : "1 人 + 3 AI";

export default function MatchAdminPage() {
  const [matches, setMatches] = useState<Summary[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<MatchRecord | null>(null);
  const [raw, setRaw] = useState(false);
  const [player, setPlayer] = useState("");
  const [version, setVersion] = useState("");
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : window.sessionStorage.getItem("dress-up:admin-token") ?? "");
  const [needsToken, setNeedsToken] = useState(false);
  const [error, setError] = useState("");

  const headers = useMemo(() => token ? { authorization: `Bearer ${token}` } : undefined, [token]);
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const allVisibleChecked = matches.length > 0 && matches.every((match) => checkedSet.has(match.matchId));

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (player) query.set("player", player);
    if (version) query.set("version", version);
    if (mode) query.set("mode", mode);
    const response = await fetch(`/api/admin/matches?${query}`, { headers });
    if (response.status === 401) { setNeedsToken(true); return; }
    if (!response.ok) { setError("无法读取对局记录。请确认 D1 数据库已绑定并应用迁移。"); return; }
    const nextMatches = ((await response.json()) as { matches: Summary[] }).matches;
    setMatches(nextMatches);
    setCheckedIds((current) => current.filter((id) => nextMatches.some((match) => match.matchId === id)));
    setNeedsToken(false);
    setError("");
  }, [headers, mode, player, version]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openMatch = async (matchId: string) => {
    const response = await fetch(`/api/admin/matches/${matchId}`, { headers });
    if (!response.ok) { setError("无法打开这一局。"); return; }
    setSelected((await response.json()) as MatchRecord);
    setRaw(false);
  };

  const toggleChecked = (matchId: string) => {
    setCheckedIds((current) => current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId]);
  };

  const toggleAllVisible = () => {
    setCheckedIds((current) => allVisibleChecked
      ? current.filter((id) => !matches.some((match) => match.matchId === id))
      : Array.from(new Set([...current, ...matches.map((match) => match.matchId)])));
  };

  const setStarred = async (matchIds: string[], starred: boolean) => {
    if (!matchIds.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const responses = await Promise.all(matchIds.map((matchId) => fetch(`/api/admin/matches/${matchId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ starred }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error("star update failed");
      await load();
      if (selected && matchIds.includes(selected.matchInfo.matchId)) setSelected({ ...selected, admin: { starred } });
    } catch {
      setError("星标更新失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  const deleteChecked = async () => {
    if (!checkedIds.length || busy) return;
    if (!window.confirm(`确定永久删除选中的 ${checkedIds.length} 局记录吗？此操作无法撤销。`)) return;
    setBusy(true);
    setError("");
    try {
      const deleting = [...checkedIds];
      const responses = await Promise.all(deleting.map((matchId) => fetch(`/api/admin/matches/${matchId}`, { method: "DELETE", headers })));
      if (responses.some((response) => !response.ok)) throw new Error("delete failed");
      if (selected && deleting.includes(selected.matchInfo.matchId)) setSelected(null);
      setCheckedIds([]);
      await load();
    } catch {
      setError("删除失败；未成功删除的记录仍会保留在列表中。");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => { window.sessionStorage.setItem("dress-up:admin-token", token); void load(); };
  const download = async (url: string, filename: string) => {
    const response = await fetch(url, { headers });
    if (!response.ok) { setError("下载失败。"); return; }
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  if (needsToken) return (
    <main className="match-admin-page"><section className="admin-auth-card">
      <Link href="/">dress-<em>up!</em></Link><h1>对局数据</h1><p>请输入管理员访问令牌。</p>
      <input type="password" value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveToken(); }} />
      <button onClick={saveToken}>进入</button>{error && <small>{error}</small>}
    </section></main>
  );

  return <main className="match-admin-page">
    <header className="match-admin-header"><div><Link href="/">dress-<em>up!</em></Link><h1>对局数据</h1></div><button className="admin-export" onClick={() => void download("/api/admin/matches?download=all", "dress-up-matches.ndjson")}>下载全部 NDJSON</button></header>
    <section className="match-admin-filters">
      <label>玩家 ID 或昵称<input value={player} onChange={(event) => setPlayer(event.target.value)} /></label>
      <label>规则版本<input value={version} onChange={(event) => setVersion(event.target.value)} /></label>
      <label>模式<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="">全部</option><option value="single">1 人 + 3 AI</option><option value="spectator">4 AI</option><option value="multiplayer">联机</option></select></label>
      <button onClick={() => void load()}>筛选</button>
    </section>
    <section className="admin-batch-actions" aria-label="批量管理对局">
      <button onClick={toggleAllVisible} disabled={!matches.length || busy}>{allVisibleChecked ? "取消全选" : "全选本页"}</button>
      <span>{checkedIds.length ? `已选 ${checkedIds.length} 局` : "选择对局后可批量管理"}</span>
      <div><button onClick={() => void setStarred(checkedIds, true)} disabled={!checkedIds.length || busy}>星标</button><button onClick={() => void setStarred(checkedIds, false)} disabled={!checkedIds.length || busy}>取消星标</button><button className="danger" onClick={() => void deleteChecked()} disabled={!checkedIds.length || busy}>删除</button></div>
    </section>
    {error && <p className="admin-error">{error}</p>}
    <section className="match-admin-list"><table><thead><tr>
      <th className="admin-select-cell"><input type="checkbox" aria-label="全选当前列表" checked={allVisibleChecked} onChange={toggleAllVisible} /></th><th className="admin-star-cell">星标</th><th>时间</th><th>Match ID</th><th>玩家</th><th>模式</th><th>目标与分数</th><th>规则版本</th><th>状态</th><th></th>
    </tr></thead><tbody>{matches.map((match) => <tr key={match.matchId} className={checkedSet.has(match.matchId) ? "is-selected" : ""}>
      <td className="admin-select-cell"><input type="checkbox" aria-label={`选择 ${match.matchId}`} checked={checkedSet.has(match.matchId)} onChange={() => toggleChecked(match.matchId)} /></td>
      <td className="admin-star-cell"><button className={`admin-star-button${match.starred ? " is-starred" : ""}`} aria-label={match.starred ? "取消星标" : "添加星标"} title={match.starred ? "取消星标" : "添加星标"} disabled={busy} onClick={() => void setStarred([match.matchId], !match.starred)}>{match.starred ? "★" : "☆"}</button></td>
      <td>{new Date(match.startTime).toLocaleString("zh-CN")}</td><td><code>{match.matchId.slice(6, 14)}</code></td><td>{match.players.filter((seat) => seat.humanOrAI === "human").map((seat) => seat.displayName).join(" / ") || "AI"}</td><td>{modeName(match.mode)}</td><td>{match.players.map((seat) => `${seat.goal} ${seat.totalScore ?? "—"}`).join(" · ")}</td><td>{match.rulesVersion}</td><td>{match.completed ? "完成" : "进行中 / 中断"}</td><td><button className="admin-view-button" onClick={() => void openMatch(match.matchId)}>查看</button></td>
    </tr>)}</tbody></table>{!matches.length && <p className="admin-empty">还没有符合条件的对局。</p>}</section>
    {selected && <div className="admin-detail-shade"><article className="admin-match-detail">
      <header><div><small>MATCH</small><h2>{selected.matchInfo.matchId}</h2></div><button aria-label="关闭" onClick={() => setSelected(null)}>×</button></header>
      <div className="admin-detail-meta"><span>{new Date(selected.matchInfo.startTime).toLocaleString("zh-CN")}</span><span>{modeName(selected.matchInfo.mode)}</span><span>规则 {selected.matchInfo.rulesVersion}</span><span>{selected.matchInfo.completed ? "已完成" : "未完成"}</span>{selected.admin?.starred && <span>★ 已星标</span>}</div>
      <div className="admin-player-results">{selected.players.map((seat) => { const result = selected.finalState?.players.find((playerResult) => playerResult.seat === seat.seat); return <section key={seat.seat}><b>P{seat.seat + 1} {seat.displayName}</b><span>{seat.playerId}</span><strong>{seat.goal}</strong><em>{result ? `${result.totalScore} 分` : "—"}</em></section>; })}</div>
      <nav><button className={!raw ? "selected" : ""} onClick={() => setRaw(false)}>事件 Log</button><button className={raw ? "selected" : ""} onClick={() => setRaw(true)}>Raw JSON</button><button onClick={() => void setStarred([selected.matchInfo.matchId], !selected.admin?.starred)}>{selected.admin?.starred ? "取消星标" : "星标这一局"}</button><button onClick={() => void download(`/api/admin/matches/${selected.matchInfo.matchId}?download=1`, `${selected.matchInfo.matchId}.json`)}>下载这一局 JSON</button></nav>
      {raw ? <pre className="admin-raw-json">{JSON.stringify(selected, null, 2)}</pre> : <div className="admin-event-log">{selected.events.map((event) => <section key={event.seq}><span>#{event.seq} · Turn {event.turn}</span><b>P{event.actor + 1} {event.label}</b>{event.messages.map((message, index) => <p key={`${event.seq}-${index}`}>{message}</p>)}{event.changes.map((change, index) => <small key={`${event.seq}-change-${index}`}>{change.type === "joy_change" ? `P${change.player + 1} Joy ${change.delta! > 0 ? "+" : ""}${change.delta} · ${change.source ?? ""}` : `P${change.player + 1} ${change.type}: ${change.value ?? ""}`}</small>)}</section>)}</div>}
    </article></div>}
  </main>;
}
