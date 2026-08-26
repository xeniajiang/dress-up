/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { GameRoom } from "./game-room";

interface DurableObjectIdLike {}
interface DurableObjectStubLike { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  ROOMS: DurableObjectNamespaceLike;
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
