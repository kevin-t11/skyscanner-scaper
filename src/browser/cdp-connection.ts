/**
 * Minimal Chrome DevTools Protocol client over one browser WebSocket.
 * Uses flattened sessions, so every attached page shares this connection.
 */
import { BrowserError } from "../errors";
import type { CdpCommands, CdpEvent, CdpEvents, CdpMethod } from "./cdp-protocol";

type EventListener<E extends CdpEvent> = (params: CdpEvents[E], sessionId: string | undefined) => void;

interface PendingCommand {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  sessionId?: string;
  result?: unknown;
  error?: { code: number; message: string };
}

export class CdpConnection {
  private nextCommandId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly listeners = new Map<string, Set<EventListener<CdpEvent>>>();
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    socket.addEventListener("close", () => this.rejectPending(new BrowserError("CDP connection closed")));
  }

  static open(url: string, timeoutMs = 10_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new BrowserError("CDP connect timeout")), timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(new CdpConnection(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new BrowserError(`CDP connect failed: ${url}`));
      });
    });
  }

  send<M extends CdpMethod>(
    method: M,
    params: CdpCommands[M]["params"],
    sessionId?: string,
  ): Promise<CdpCommands[M]["result"]> {
    if (this.closed) return Promise.reject(new BrowserError("CDP connection closed"));
    const id = this.nextCommandId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
    });
  }

  on<E extends CdpEvent>(event: E, listener: EventListener<E>): void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as EventListener<CdpEvent>);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (!this.closed) this.socket.close();
    this.rejectPending(new BrowserError("CDP connection closed"));
  }

  private handleMessage(data: string): void {
    const message = JSON.parse(data) as CdpMessage;
    if (typeof message.id === "number") {
      const command = this.pending.get(message.id);
      if (!command) return;
      this.pending.delete(message.id);
      if (message.error) command.reject(new BrowserError(`${message.error.message} (${message.error.code})`));
      else command.resolve(message.result);
      return;
    }
    if (!message.method) return;
    this.listeners.get(message.method)?.forEach((listener) => listener(message.params as never, message.sessionId));
  }

  private rejectPending(error: Error): void {
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}
