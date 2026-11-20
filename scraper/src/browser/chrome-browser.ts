/**
 * One Chrome process with a single page, driven over raw CDP.
 *
 * Kept deliberately small: no Playwright, and no `Runtime.enable` (a common
 * automation signal). The page only loads what the PerimeterX sensor needs;
 * images, fonts and media are blocked to save proxy bandwidth.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { BrowserError, PageScriptError } from "../errors";
import { CdpConnection } from "./cdp-connection";
import type { CdpCommands, CdpMethod, ResourceType } from "./cdp-protocol";
import type { ProxySettings } from "./proxy-settings";

export interface ChromeLaunchOptions {
  chromePath: string;
  headless: boolean;
  locale: string;
  proxy?: ProxySettings;
}

const BLOCKED_RESOURCE_TYPES = new Set<ResourceType>(["Image", "Media", "Font"]);
/** Static assets come from Skyscanner's CDN; fetch them directly instead of through the paid proxy. */
const PROXY_BYPASS_LIST = "*.skyscnr.com";
const DEVTOOLS_STARTUP_TIMEOUT_MS = 15_000;

export class ChromeBrowser {
  private constructor(
    private readonly process: Subprocess,
    private readonly cdp: CdpConnection,
    private readonly pageSessionId: string,
    private readonly profileDir: string,
  ) {}

  static async launch(options: ChromeLaunchOptions): Promise<ChromeBrowser> {
    const profileDir = await mkdtemp(join(tmpdir(), "sky-chrome-"));
    let chrome: Subprocess | undefined;
    try {
      chrome = Bun.spawn([options.chromePath, ...chromeArgs(options, profileDir)], { stdout: "ignore", stderr: "pipe" });
      const devToolsUrl = await waitForDevToolsUrl(chrome, DEVTOOLS_STARTUP_TIMEOUT_MS);
      const cdp = await CdpConnection.open(devToolsUrl);
      const pageSessionId = await attachToFirstPage(cdp);
      const browser = new ChromeBrowser(chrome, cdp, pageSessionId, profileDir);
      await browser.prepareSession(options);
      return browser;
    } catch (error) {
      chrome?.kill();
      await rm(profileDir, { recursive: true, force: true });
      throw error;
    }
  }

  /** False once Chrome exits or its DevTools connection drops. */
  get isAlive(): boolean {
    return this.process.exitCode === null && !this.process.killed && !this.cdp.isClosed;
  }
  /** Navigates, waits for `load`, then gives in-page scripts `settleMs` to run. Returns the final URL. */
  async navigate(url: string, timeoutMs = 30_000, settleMs = 1_500): Promise<string> {
    const { errorText } = await this.sendToPage("Page.navigate", { url });
    if (errorText) throw new BrowserError(`navigation to ${url} failed: ${errorText}`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const readyState = await this.evaluate<string>("document.readyState").catch(() => "loading");
      if (readyState === "complete") break;
      await Bun.sleep(100);
    }
    await Bun.sleep(settleMs);
    return this.evaluate<string>("location.href");
  }

  /**
   * Evaluates an expression in the page, awaiting promises, and returns its JSON value.
   * Throws `PageScriptError` if the script throws, `BrowserError` if Chrome or CDP fails.
   */
  async evaluate<T>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.sendToPage("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new PageScriptError(`page script failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    }
    return result.value as T;
  }

  /** Dispatches one mouse event at viewport coordinates; `held` keeps the left button down while moving. */
  async mouse(type: "mouseMoved" | "mousePressed" | "mouseReleased", x: number, y: number, held = false): Promise<void> {
    const pressing = type !== "mouseMoved";
    await this.sendToPage("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: pressing || held ? "left" : "none",
      buttons: type === "mousePressed" || held ? 1 : 0,
      clickCount: pressing ? 1 : 0,
    });
  }

  async close(): Promise<void> {
    this.cdp.close();
    this.process.kill();
    await this.process.exited.catch(() => undefined);
    await rm(this.profileDir, { recursive: true, force: true });
  }

  private sendToPage<M extends CdpMethod>(method: M, params: CdpCommands[M]["params"]) {
    return this.cdp.send(method, params, this.pageSessionId);
  }

  private async prepareSession(options: ChromeLaunchOptions): Promise<void> {
    const { product, userAgent } = await this.cdp.send("Browser.getVersion", {});
    if (product.startsWith("HeadlessChrome")) await this.presentAsRegularChrome(product, userAgent, options.locale);
    await this.interceptRequests(options.proxy);
  }

  /** Headless Chrome announces itself in its User-Agent and client hints. */
  private async presentAsRegularChrome(product: string, userAgent: string, locale: string): Promise<void> {
    const fullVersion = product.split("/")[1] ?? "0";
    const majorVersion = fullVersion.split(".")[0] ?? "0";
    const brands = [
      { brand: "Chromium", version: majorVersion },
      { brand: "Google Chrome", version: majorVersion },
      { brand: "Not?A_Brand", version: "99" },
    ];
    await this.sendToPage("Emulation.setUserAgentOverride", {
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

  /** Blocks heavy resources and answers proxy authentication challenges. */
  private async interceptRequests(proxy: ProxySettings | undefined): Promise<void> {
    this.cdp.on("Fetch.requestPaused", ({ requestId, resourceType }, sessionId) => {
      if (sessionId !== this.pageSessionId) return;
      const decision = BLOCKED_RESOURCE_TYPES.has(resourceType)
        ? this.sendToPage("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" })
        : this.sendToPage("Fetch.continueRequest", { requestId });
      decision.catch(() => undefined);
    });
    this.cdp.on("Fetch.authRequired", ({ requestId, authChallenge }, sessionId) => {
      if (sessionId !== this.pageSessionId) return;
      const authChallengeResponse =
        proxy?.username && authChallenge.source === "Proxy"
          ? { response: "ProvideCredentials" as const, username: proxy.username, password: proxy.password ?? "" }
          : { response: "CancelAuth" as const };
      this.sendToPage("Fetch.continueWithAuth", { requestId, authChallengeResponse }).catch(() => undefined);
    });
    await this.sendToPage("Fetch.enable", { handleAuthRequests: true, patterns: [{ urlPattern: "*" }] });
  }
}

function chromeArgs(options: ChromeLaunchOptions, profileDir: string): string[] {
  return [
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
    options.proxy ? `--proxy-bypass-list=${PROXY_BYPASS_LIST}` : "",
    process.getuid?.() === 0 ? "--no-sandbox" : "",
    "about:blank",
  ].filter(Boolean);
}

/** Chrome prints `DevTools listening on ws://…` to stderr once it accepts CDP connections. */
async function waitForDevToolsUrl(chrome: Subprocess, timeoutMs: number): Promise<string> {
  const stderr = chrome.stderr as ReadableStream<Uint8Array>;
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  const timer = setTimeout(() => chrome.kill(), timeoutMs);
  let output = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new BrowserError(`Chrome exited before DevTools was ready: ${output.slice(-500)}`);
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

async function attachToFirstPage(cdp: CdpConnection): Promise<string> {
  const { targetInfos } = await cdp.send("Target.getTargets", {});
  const page = targetInfos.find((target) => target.type === "page");
  const targetId = page?.targetId ?? (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId;
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  return sessionId;
}
