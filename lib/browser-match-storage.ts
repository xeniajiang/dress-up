"use client";

import type { MatchRecord } from "./match-record";

const DATABASE = "dress-up-match-records";
const STORE = "matches";
const PLAYER_ID_KEY = "dress-up:player-id";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "matchInfo.matchId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getOrCreateWebsitePlayerId() {
  const existing = window.localStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const created = `player_${crypto.randomUUID().replace(/-/g, "")}`;
  window.localStorage.setItem(PLAYER_ID_KEY, created);
  return created;
}

export async function storeMatchRecord(record: MatchRecord) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function uploadMatchRecord(record: MatchRecord, keepalive = false) {
  const upload = fetch("/api/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
    keepalive,
  });
  const [, response] = await Promise.all([storeMatchRecord(record), upload]);
  if (!response.ok) throw new Error(`Match upload failed: ${response.status}`);
}

export async function retryStoredMatchRecords() {
  const database = await openDatabase();
  const records = await new Promise<MatchRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as MatchRecord[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  await Promise.allSettled(records.map((record) => fetch("/api/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  })));
}
