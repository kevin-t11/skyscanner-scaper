/**
 * Minimal Chrome DevTools Protocol client over one browser WebSocket.
 * Uses flattened sessions, so every attached page shares this connection.
 */
type Params = Record<string, unknown>;
type EventHandler = (params: any, sessionId?: string) => void;

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export class CdpError extends Error {}

export class CdpConnection {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => this.onMessage(String(event.data)));
    ws.addEventListener("close", () => this.fail(new CdpError("CDP connection closed")));
  }

  static connect(url: string, timeoutMs = 10_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => reject(new CdpError("CDP connect timeout")), timeoutMs);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CdpConnection(ws));
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new CdpError(`CDP connect failed: ${url}`));
      });
    });
  }

  send<T = any>(method: string, params: Params = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new CdpError("CDP connection closed"));
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method: string, handler: EventHandler): void {
    let set = this.handlers.get(method);
    if (!set) this.handlers.set(method, (set = new Set()));
    set.add(handler);
  }

  close(): void {
    if (!this.closed) this.ws.close();
    this.fail(new CdpError("CDP connection closed"));
  }

  private onMessage(data: string): void {
    const msg = JSON.parse(data);
    if (typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new CdpError(`${msg.error.message} (${msg.error.code})`));
      else pending.resolve(msg.result);
      return;
    }
    this.handlers.get(msg.method)?.forEach((handler) => handler(msg.params, msg.sessionId));
  }

  private fail(error: Error): void {
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}
