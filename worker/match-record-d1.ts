import { matchSummary, type MatchRecord } from "../lib/match-record";

export type MatchDatabase = Pick<D1Database, "prepare">;

type StoredMatchRow = {
  record_json: string;
  starred: number;
};

export async function saveMatchRecord(db: MatchDatabase, incoming: MatchRecord) {
  const existing = await getStoredRow(db, incoming.matchInfo.matchId);
  if (existing) {
    const saved = parseRecord(existing.record_json);
    if (saved) {
      const savedIsNewer = saved.events.length > incoming.events.length
        || (saved.events.length === incoming.events.length && saved.matchInfo.completed && !incoming.matchInfo.completed);
      if (savedIsNewer) return { ignoredOlderSnapshot: true };
      if (saved.admin) incoming.admin = saved.admin;
    }
  }

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO match_records (
      match_id, created_at, updated_at, rules_version, build_version, mode,
      player_ids, player_names, completed, starred, record_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      updated_at = excluded.updated_at,
      rules_version = excluded.rules_version,
      build_version = excluded.build_version,
      mode = excluded.mode,
      player_ids = excluded.player_ids,
      player_names = excluded.player_names,
      completed = excluded.completed,
      starred = excluded.starred,
      record_json = excluded.record_json
  `).bind(
    incoming.matchInfo.matchId,
    incoming.matchInfo.startTime,
    now,
    incoming.matchInfo.rulesVersion,
    incoming.matchInfo.buildVersion,
    incoming.matchInfo.mode,
    JSON.stringify(incoming.players.map((player) => player.playerId)),
    JSON.stringify(incoming.players.map((player) => player.displayName)),
    incoming.matchInfo.completed ? 1 : 0,
    incoming.admin?.starred ? 1 : 0,
    JSON.stringify(incoming),
  ).run();
  return { ignoredOlderSnapshot: false };
}

export async function getMatchRecord(db: MatchDatabase, matchId: string) {
  const row = await getStoredRow(db, matchId);
  if (!row) return null;
  const record = parseRecord(row.record_json);
  if (record) record.admin = { starred: row.starred === 1 };
  return record;
}

export async function setMatchStarred(db: MatchDatabase, matchId: string, starred: boolean) {
  const record = await getMatchRecord(db, matchId);
  if (!record) return false;
  record.admin = { starred };
  const result = await db.prepare(`
    UPDATE match_records
    SET starred = ?, record_json = ?, updated_at = ?
    WHERE match_id = ?
  `).bind(starred ? 1 : 0, JSON.stringify(record), new Date().toISOString(), matchId).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function deleteMatchRecord(db: MatchDatabase, matchId: string) {
  const result = await db.prepare("DELETE FROM match_records WHERE match_id = ?").bind(matchId).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function listMatchRecords(db: MatchDatabase, filters: { player?: string; version?: string; mode?: string } = {}) {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (filters.player) {
    clauses.push("(lower(player_ids) LIKE ? OR lower(player_names) LIKE ?)");
    const pattern = `%${filters.player.toLowerCase()}%`;
    bindings.push(pattern, pattern);
  }
  if (filters.version) { clauses.push("rules_version = ?"); bindings.push(filters.version); }
  if (filters.mode) { clauses.push("mode = ?"); bindings.push(filters.mode); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(`
    SELECT record_json, starred
    FROM match_records
    ${where}
    ORDER BY starred DESC, created_at DESC
  `).bind(...bindings).all<StoredMatchRow>();
  return result.results.flatMap((row) => {
    const record = parseRecord(row.record_json);
    if (!record) return [];
    record.admin = { starred: row.starred === 1 };
    return [record];
  });
}

export async function listMatchSummaries(db: MatchDatabase, filters: { player?: string; version?: string; mode?: string } = {}) {
  return (await listMatchRecords(db, filters)).map(matchSummary);
}

async function getStoredRow(db: MatchDatabase, matchId: string) {
  return db.prepare("SELECT record_json, starred FROM match_records WHERE match_id = ?")
    .bind(matchId)
    .first<StoredMatchRow>();
}

function parseRecord(value: string) {
  try { return JSON.parse(value) as MatchRecord; } catch { return null; }
}
