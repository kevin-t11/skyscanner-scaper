/**
 * One headless Chrome process with a single page, driven over raw CDP.
 *
 * Kept deliberately small: no Playwright, and no `Runtime.enable` (a common
 * automation signal). The page only loads what the PerimeterX sensor needs;
 * images, fonts and media are blocked to save proxy bandwidth.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { CdpConnection, CdpError } from "./cdp";

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

export interface BrowserOptions {
  chromePath: string;
  headless: boolean;
  locale: string;
  proxy?: ProxySettings;
}

const BLOCKED_RESOURCES = new Set(["Image", "Media", "Font"]);
/** Static assets come from Skyscanner's CDN; fetch them directly instead of through the paid proxy. */
const PROXY_BYPASS = "*.skyscnr.com";

/** Turns `http://user:pass@host:port` into Chrome's `--proxy-server` plus CDP auth credentials. */
export function parseProxyUrl(raw: string): ProxySettings {
  const url = new URL(raw);
  return {
    server: `${url.protocol}//${url.hostname}:${url.port}`,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

export class Browser {
  private constructor(
    private readonly proc: Subprocess,
    private readonly cdp: CdpConnection,
    private readonly sessionId: string,
    private readonly profileDir: string,
  ) {}

  static async launch(options: BrowserOptions): Promise<Browser> {
    const profileDir = await mkdtemp(join(tmpdir(), "sky-chrome-"));
    const args = [
      options.headless ? "--headless=new" : "",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=Translate,OptimizationHints,MediaRouter",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--mute-audio",
      "--window-size=1366,900",
      `--lang=${options.locale}`,
      options.proxy ? `--proxy-server=${options.proxy.server}` : "",
      options.proxy ? `--proxy-bypass-list=${PROXY_BYPASS}` : "",
      process.getuid?.() === 0 ? "--no-sandbox" : "",
      "about:blank",
    ].filter(Boolean);

    let proc: Subprocess | undefined;
    try {
      proc = Bun.spawn([options.chromePath, ...args], { stdout: "ignore", stderr: "pipe" });
      const wsUrl = await readDevToolsUrl(proc, 15_000);
      const cdp = await CdpConnection.connect(wsUrl);
      const sessionId = await attachToPage(cdp);
      const browser = new Browser(proc, cdp, sessionId, profileDir);
      await browser.configure(options);
      return browser;
    } catch (error) {
      proc?.kill();
      await rm(profileDir, { recursive: true, force: true });
      throw error;
    }
  }

  /** Navigates and waits for `load`, then gives in-page scripts `settleMs` to run. */
  async goto(url: string, timeoutMs = 30_000, settleMs = 1_500): Promise<string> {
    const { errorText } = await this.send("Page.navigate", { url });
    if (errorText) throw new CdpError(`navigation to ${url} failed: ${errorText}`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.evaluate<string>("document.readyState").catch(() => "loading");
      if (state === "complete") break;
      await Bun.sleep(100);
    }
    await Bun.sleep(settleMs);
    return this.evaluate<string>("location.href");
  }

  /** Evaluates an expression in the page; awaits promises and returns the JSON value. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new CdpError(`page evaluation failed: ${detail}`);
    }
    return result.result.value as T;
  }

  async cookieNames(url: string): Promise<string[]> {
    const { cookies } = await this.send("Network.getCookies", { urls: [url] });
    return cookies.map((cookie: { name: string }) => cookie.name);
  }

  get alive(): boolean {
    return this.proc.exitCode === null && !this.proc.killed;
  }

  async close(): Promise<void> {
    this.cdp.close();
    this.proc.kill();
    await this.proc.exited.catch(() => undefined);
    await rm(this.profileDir, { recursive: true, force: true });
  }

  private send(method: string, params: Record<string, unknown> = {}) {
    return this.cdp.send(method, params, this.sessionId);
  }

  private async configure(options: BrowserOptions): Promise<void> {
    const { product, userAgent } = await this.cdp.send("Browser.getVersion");
    if (String(product).startsWith("HeadlessChrome")) await this.hideHeadless(String(product), String(userAgent), options.locale);
    await this.interceptRequests(options.proxy);
  }

  /** Headless Chrome announces itself in its User-Agent and client hints; present as regular Chrome. */
  private async hideHeadless(product: string, userAgent: string, locale: string): Promise<void> {
    const fullVersion = product.split("/")[1] ?? "0";
    const major = fullVersion.split(".")[0] ?? "0";
    const brands = [
      { brand: "Chromium", version: major },
      { brand: "Google Chrome", version: major },
      { brand: "Not?A_Brand", version: "99" },
    ];
    await this.send("Emulation.setUserAgentOverride", {
      userAgent: userAgent.replace("HeadlessChrome", "Chrome"),
      acceptLanguage: `${locale},${locale.split("-")[0]};q=0.9`,
      platform: "Linux x86_64",
      userAgentMetadata: {
        brands,
        fullVersionList: brands.map((b) => ({ ...b, version: b.brand === "Not?A_Brand" ? "99.0.0.0" : fullVersion })),
        fullVersion,
        platform: "Linux",
        platformVersion: "",
        architecture: "x86",
        model: "",
        mobile: false,
      },
    });
  }

  /** Blocks heavy resources and answers proxy auth challenges. */
  private async interceptRequests(proxy: ProxySettings | undefined): Promise<void> {
    this.cdp.on("Fetch.requestPaused", (params, sessionId) => {
      if (sessionId !== this.sessionId) return;
      const request = BLOCKED_RESOURCES.has(params.resourceType)
        ? this.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" })
        : this.send("Fetch.continueRequest", { requestId: params.requestId });
      request.catch(() => undefined);
    });
    this.cdp.on("Fetch.authRequired", (params, sessionId) => {
      if (sessionId !== this.sessionId) return;
      const authChallengeResponse =
        proxy?.username && params.authChallenge?.source === "Proxy"
          ? { response: "ProvideCredentials", username: proxy.username, password: proxy.password ?? "" }
          : { response: "CancelAuth" };
      this.send("Fetch.continueWithAuth", { requestId: params.requestId, authChallengeResponse }).catch(() => undefined);
    });
    await this.send("Fetch.enable", { handleAuthRequests: true, patterns: [{ urlPattern: "*" }] });
  }
}

async function readDevToolsUrl(proc: Subprocess, timeoutMs: number): Promise<string> {
  const stderr = proc.stderr as ReadableStream<Uint8Array>;
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  let output = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new CdpError(`Chrome exited before DevTools was ready: ${output.slice(-500)}`);
      output += decoder.decode(value, { stream: true });
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match?.[1]) return match[1];
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
    // Keep draining so Chrome never blocks on a full stderr pipe.
    stderr.pipeTo(new WritableStream()).catch(() => undefined);
  }
}

async function attachToPage(cdp: CdpConnection): Promise<string> {
  const { targetInfos } = await cdp.send("Target.getTargets");
  const page = targetInfos.find((target: { type: string }) => target.type === "page");
  const targetId = page?.targetId ?? (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId;
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  return sessionId;
}
