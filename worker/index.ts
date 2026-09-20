/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { MATCH_SCHEMA_VERSION, type MatchRecord } from "../lib/match-record";
import { deleteMatchRecord, getMatchRecord, listMatchRecords, listMatchSummaries, saveMatchRecord, setMatchStarred } from "./match-record-d1";
export { GameRoom } from "./game-room";

type DurableObjectIdLike = object;
interface DurableObjectStubLike { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  ROOMS: DurableObjectNamespaceLike;
  ADMIN_USER_IDS?: string;
  ADMIN_TOKEN?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/matches") {
      if (!env.DB) return Response.json({ error: "match storage unavailable" }, { status: 503 });
      const declaredSize = Number(request.headers.get("content-length") ?? 0);
      if (declaredSize > 8_000_000) return Response.json({ error: "record too large" }, { status: 413 });
      const text = await request.text();
      if (text.length > 8_000_000) return Response.json({ error: "record too large" }, { status: 413 });
      let record: MatchRecord;
      try { record = JSON.parse(text) as MatchRecord; } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
      const matchId = record?.matchInfo?.matchId;
      if (record?.schemaVersion !== MATCH_SCHEMA_VERSION || !/^match_[a-f0-9]{32}$/i.test(matchId ?? "") || !Array.isArray(record.events) || !Array.isArray(record.players)) {
        return Response.json({ error: "invalid match record" }, { status: 400 });
      }
      const result = await saveMatchRecord(env.DB, record);
      return Response.json({ ok: true, matchId, ...result });
    }

    if (url.pathname.startsWith("/api/admin/matches")) {
      if (!isAdminRequest(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
      if (!env.DB) return Response.json({ error: "match storage unavailable" }, { status: 503 });
      const detail = url.pathname.match(/^\/api\/admin\/matches\/(match_[a-f0-9]{32})$/i);
      if (detail) {
        if (request.method === "DELETE") {
          await deleteMatchRecord(env.DB, detail[1]);
          return Response.json({ ok: true, matchId: detail[1] });
        }
        if (request.method === "PATCH") {
          let update: { starred?: boolean };
          try { update = await request.json() as { starred?: boolean }; } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
          if (typeof update.starred !== "boolean") return Response.json({ error: "invalid update" }, { status: 400 });
          if (!await setMatchStarred(env.DB, detail[1], update.starred)) return Response.json({ error: "not found" }, { status: 404 });
          return Response.json({ ok: true, matchId: detail[1], starred: update.starred });
        }
        if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
        const record = await getMatchRecord(env.DB, detail[1]);
        if (!record) return Response.json({ error: "not found" }, { status: 404 });
        return new Response(JSON.stringify(record), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...(url.searchParams.get("download") === "1" ? { "content-disposition": `attachment; filename="${detail[1]}.json"` } : {}),
          },
        });
      }
      if (url.searchParams.get("download") === "all") {
        const records = await listMatchRecords(env.DB);
        return new Response(records.map((record) => JSON.stringify(record)).join("\n"), {
          headers: { "content-type": "application/x-ndjson; charset=utf-8", "content-disposition": "attachment; filename=\"dress-up-matches.ndjson\"" },
        });
      }
      const player = (url.searchParams.get("player") ?? "").trim().toLowerCase();
      const version = (url.searchParams.get("version") ?? "").trim();
      const mode = (url.searchParams.get("mode") ?? "").trim();
      const summaries = await listMatchSummaries(env.DB, { player, version, mode });
      return Response.json({ matches: summaries });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const bytes = crypto.getRandomValues(new Uint8Array(5));
        const roomId = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
        const initialized = await stub.fetch(new Request("https://room.internal/init", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId }),
        }));
        if (initialized.ok) return Response.json({ roomId });
        if (initialized.status !== 409) return new Response("Unable to create room", { status: 500 });
      }
      return new Response("Unable to allocate room code", { status: 503 });
    }

    const roomSocketMatch = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{5})\/ws$/);
    if (roomSocketMatch) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomSocketMatch[1]));
      return stub.fetch(new Request(`https://room.internal/websocket${url.search}`, request));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

function isAdminRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (env.ADMIN_TOKEN && bearer === env.ADMIN_TOKEN) return true;
  const userId = request.headers.get("oai-authenticated-user-id");
  const allowed = (env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return Boolean(userId && allowed.includes(userId));
}
