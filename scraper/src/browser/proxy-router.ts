/**
 * Local forward proxy, one per browser. Chrome always connects through it, and each
 * tunnel goes either through the paid upstream proxy or straight out from this server.
 * Switching a browser to `direct` closes its paid tunnels, so Chrome reconnects from the server's own IP.
 */
import { connect, createServer, type Server, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import type { ProxySettings } from "./proxy-settings";
import type { ProxyBudget } from "./proxy-budget";

export type ProxyRoute = "upstream" | "direct";

const HEADER_END = "\r\n\r\n";
const MAX_HEADER_BYTES = 16_384;
const CONNECT_TIMEOUT_MS = 15_000;

export class ProxyRouter {
  private readonly upstreamTunnels = new Set<Socket>();

  private constructor(
    private readonly server: Server,
    private readonly upstream: ProxySettings | undefined,
    private readonly budget: ProxyBudget,
    private currentRoute: ProxyRoute,
  ) {
    server.on("connection", (client) => this.accept(client));
  }

  static async start(upstream: ProxySettings | undefined, budget: ProxyBudget, route: ProxyRoute): Promise<ProxyRouter> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    return new ProxyRouter(server, upstream, budget, upstream ? route : "direct");
  }

  /** `http://127.0.0.1:<port>`, for Chrome's `--proxy-server`. */
  get url(): string {
    const address = this.server.address();
    return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  }

  get route(): ProxyRoute {
    return this.currentRoute;
  }

  setRoute(route: ProxyRoute): void {
    this.currentRoute = this.upstream ? route : "direct";
    if (this.currentRoute === "direct") for (const tunnel of this.upstreamTunnels) tunnel.destroy();
  }

  close(): void {
    for (const tunnel of this.upstreamTunnels) tunnel.destroy();
    this.server.close();
  }

  private accept(client: Socket): void {
    client.on("error", () => undefined);
    let header = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      header = Buffer.concat([header, chunk]);
      const end = header.indexOf(HEADER_END);
      if (end < 0) {
        if (header.length > MAX_HEADER_BYTES) client.destroy();
        return;
      }
      client.off("data", onData);
      client.pause();
      const [method, target] = header.subarray(0, end).toString("latin1").split(" ");
      if (method !== "CONNECT" || !target) return void client.end("HTTP/1.1 405 Method Not Allowed\r\n\r\n");
      const { port } = splitHostPort(target);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) return void client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      const head = header.subarray(end + HEADER_END.length);
      const useUpstream = this.currentRoute === "upstream" && this.upstream && !this.budget.exhausted;
      void (useUpstream ? this.tunnelUpstream(client, target, head) : this.tunnelDirect(client, target, head));
    };
    client.on("data", onData);
  }

  private tunnelDirect(client: Socket, target: string, head: Buffer): void {
    const { host, port } = splitHostPort(target);
    const remote = connect({ host, port, timeout: CONNECT_TIMEOUT_MS }, () => {
      remote.setTimeout(0);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      splice(client, remote, head);
    });
    failTogether(client, remote);
  }

  private tunnelUpstream(client: Socket, target: string, head: Buffer): void {
    const proxy = new URL(this.upstream!.server);
    const auth = this.upstream!.username
      ? `Proxy-Authorization: Basic ${Buffer.from(`${this.upstream!.username}:${this.upstream!.password ?? ""}`).toString("base64")}\r\n`
      : "";
    const remote =
      proxy.protocol === "https:"
        ? connectTls({ host: proxy.hostname, port: Number(proxy.port || 443), servername: proxy.hostname, timeout: CONNECT_TIMEOUT_MS })
        : connect({ host: proxy.hostname, port: Number(proxy.port || 80), timeout: CONNECT_TIMEOUT_MS });
    this.upstreamTunnels.add(remote);
    // Past the cap even open tunnels close, so Chrome reconnects direct.
    const count = (chunk: Buffer) => {
      this.budget.add(chunk.length);
      if (this.budget.exhausted) remote.destroy();
    };
    remote.on("data", count);
    client.on("data", count);
    remote.once("close", () => this.upstreamTunnels.delete(remote));
    failTogether(client, remote);
    const request = `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`;
    this.budget.add(request.length);
    remote.write(request);
    let reply = Buffer.alloc(0);
    const onReply = (chunk: Buffer) => {
      reply = Buffer.concat([reply, chunk]);
      const end = reply.indexOf(HEADER_END);
      if (end < 0) return;
      remote.off("data", onReply);
      remote.setTimeout(0);
      const status = reply.subarray(0, end).toString("latin1").split(" ")[1];
      if (status !== "200") return void client.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n`);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      const rest = reply.subarray(end + HEADER_END.length);
      if (rest.length) client.write(rest);
      splice(client, remote, head);
    };
    remote.on("data", onReply);
  }
}

function splitHostPort(target: string): { host: string; port: number } {
  const index = target.lastIndexOf(":");
  return { host: target.slice(0, index).replace(/^\[|\]$/g, ""), port: Number(target.slice(index + 1)) };
}

function splice(client: Socket, remote: Socket, head: Buffer): void {
  if (head.length) remote.write(head);
  client.pipe(remote);
  remote.pipe(client);
  client.resume();
}

function failTogether(client: Socket, remote: Socket): void {
  remote.on("timeout", () => remote.destroy());
  remote.on("error", () => client.destroy());
  remote.on("close", () => client.destroy());
  client.on("close", () => remote.destroy());
}
