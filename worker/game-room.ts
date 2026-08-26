import { MultiplayerRoomCore, createRoomRecord, type RoomRecord } from "../lib/multiplayer-room";
import type { ClientMessage, ServerMessage } from "../lib/multiplayer-protocol";

type SocketAttachment = { playerToken?: string };

interface DurableSocket extends WebSocket {
  serializeAttachment(value: SocketAttachment): void;
  deserializeAttachment(): SocketAttachment | null;
}

interface DurableStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface DurableStateLike {
  storage: DurableStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): DurableSocket[];
}

declare const WebSocketPair: {
  new(): { 0: WebSocket; 1: DurableSocket };
};

export class GameRoom {
  private core: MultiplayerRoomCore | null = null;

  constructor(private state: DurableStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/init") {
      if (await this.state.storage.get<RoomRecord>("room")) return Response.json({ error: "collision" }, { status: 409 });
      const roomId = String((await request.json() as { roomId?: string }).roomId ?? "");
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(roomId)) return Response.json({ error: "invalid room id" }, { status: 400 });
      this.core = new MultiplayerRoomCore(createRoomRecord(roomId));
      await this.save();
      return Response.json({ roomId });
    }

    if (url.pathname !== "/websocket" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Not found", { status: 404 });
    }
    await this.load();
    if (!this.core) return new Response("Room not found", { status: 404 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({});
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(socket: DurableSocket, raw: string | ArrayBuffer) {
    try {
      await this.load();
      if (!this.core) throw new Error("房间不存在。");
      const message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientMessage;
      const attachment = socket.deserializeAttachment() ?? {};
      if (message.type === "JOIN" || message.type === "RESUME") {
        if (!/^[a-f0-9-]{20,80}$/i.test(message.playerToken)) throw new Error("无效的玩家凭证。");
        this.core.join(message.playerToken, message.nickname);
        for (const existing of this.state.getWebSockets()) {
          if (existing !== socket && existing.deserializeAttachment()?.playerToken === message.playerToken) existing.close(4001, "已在新连接恢复");
        }
        socket.serializeAttachment({ playerToken: message.playerToken });
      } else {
        const token = attachment.playerToken;
        if (!token) throw new Error("请先加入房间。");
        if (message.type === "READY") this.core.setReady(token, message.ready);
        else if (message.type === "START_GAME") this.core.start(token);
        else if (message.type === "ACTION") this.core.submitAction(token, message.actionId, undefined, message.requestId, message.expectedStateVersion);
        else if (message.type === "SET_SELF_CONTROL") this.core.setSelfControl(token, message.controlMode);
        else if (message.type === "HOST_SET_CONTROL") this.core.hostSetControl(token, message.playerId, message.enabled);
        else if (message.type === "HOST_RESOLVE_ONE") this.core.hostResolveOne(token);
        else if (message.type === "HOST_SET_PAUSED") this.core.hostSetPaused(token, message.paused);
        else if (message.type === "EXPORT_TEST_RECORD") {
          const record = this.core.exportTestRecord(token);
          this.send(socket, { type: "TEST_RECORD", ...record });
        }
      }
      this.core.updateConnections(this.connectedTokens());
      await this.save();
      this.broadcast();
    } catch (error) {
      this.send(socket, { type: "ERROR", message: error instanceof Error ? error.message : "房间操作失败。" });
      const token = socket.deserializeAttachment()?.playerToken;
      if (token && this.core?.playerIdForToken(token) !== undefined) {
        this.send(socket, this.core.roomStateFor(token, this.connectedTokens()));
        const latest = this.core.gameStateFor(token);
        if (latest) this.send(socket, latest);
      }
    }
  }

  async webSocketClose() {
    await this.load();
    this.core?.updateConnections(this.connectedTokens());
    await this.save();
    this.broadcast();
  }

  async webSocketError() {
    await this.load();
    this.core?.updateConnections(this.connectedTokens());
    await this.save();
    this.broadcast();
  }

  private async load() {
    if (this.core) return;
    const stored = await this.state.storage.get<RoomRecord>("room");
    if (stored) this.core = new MultiplayerRoomCore(stored);
  }

  private async save() {
    if (this.core) await this.state.storage.put("room", this.core.record);
  }

  private connectedTokens() {
    return new Set(this.state.getWebSockets().map((socket) => socket.deserializeAttachment()?.playerToken).filter((token): token is string => Boolean(token)));
  }

  private broadcast() {
    if (!this.core) return;
    const connected = this.connectedTokens();
    for (const socket of this.state.getWebSockets()) {
      const token = socket.deserializeAttachment()?.playerToken;
      if (!token || this.core.playerIdForToken(token) === undefined) continue;
      this.send(socket, this.core.roomStateFor(token, connected));
      const gameState = this.core.gameStateFor(token);
      if (gameState) this.send(socket, gameState);
    }
  }

  private send(socket: WebSocket, message: ServerMessage) {
    try { socket.send(JSON.stringify(message)); } catch { /* 断开的连接由运行时清理。 */ }
  }
}
