type MessageHandler = (data: any) => void;
type BinaryHandler = (data: Uint8Array) => void;

const WS_BASE = "ws://localhost:3000";

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private binaryHandlers = new Set<BinaryHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private canvasId: string = "";
  private userId: string = "";
  private userName: string = "";

  connect(canvasId: string, userId: string, userName: string) {
    this.canvasId = canvasId;
    this.userId = userId;
    this.userName = userName;
    this.doConnect();
  }

  private doConnect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE}/ws/canvas/${this.canvasId}?userId=${this.userId}&userName=${encodeURIComponent(this.userName)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("[WS] Connected to canvas", this.canvasId);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      // Binary message = Yjs update
      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);
        this.binaryHandlers.forEach((h) => h(data));
        return;
      }

      // Text message = JSON
      try {
        const data = JSON.parse(event.data);
        const handlers = this.handlers.get(data.type);
        if (handlers) handlers.forEach((h) => h(data));
        const wildcards = this.handlers.get("*");
        if (wildcards) wildcards.forEach((h) => h(data));
      } catch (err) {
        console.error("[WS] Failed to parse message", err);
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected, reconnecting in 2s...");
      this.reconnectTimer = setTimeout(() => this.doConnect(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error", err);
    };
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onBinary(handler: BinaryHandler) {
    this.binaryHandlers.add(handler);
    return () => this.binaryHandlers.delete(handler);
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendBinary(data: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.binaryHandlers.clear();
  }
}

export const wsClient = new WSClient();
