/**
 * Solves PerimeterX's "Press & Hold" challenge the way a person would: move the
 * mouse to the button, hold it for ~10 s with small jitter, release. Same method
 * as the Zillow scraper's minter, over raw CDP input events.
 */
import type { ChromeBrowser } from "../browser/chrome-browser";
import { formatDuration, type Logger } from "../logging/logger";

const HOLD_BUTTON = "#px-captcha";
const BUTTON_WAIT_MS = 8_000;
const RELEASE_WAIT_MS = 8_000;

const jitter = (spread: number) => (Math.random() * 2 - 1) * spread;
const between = (min: number, max: number) => min + Math.random() * (max - min);

export const isChallengeUrl = (url: string) => url.includes("/captcha");

/** Returns true when the page left the challenge. Opens `challengeUrl` first when given. */
export async function solvePressAndHold(browser: ChromeBrowser, log: Logger, challengeUrl?: string): Promise<boolean> {
  const startedAt = performance.now();
  if (challengeUrl) await browser.navigate(challengeUrl);

  const button = await waitFor(BUTTON_WAIT_MS, () =>
    browser.evaluate<{ x: number; y: number } | null>(
      `(() => { const r = document.querySelector(${JSON.stringify(HOLD_BUTTON)})?.getBoundingClientRect();
        return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`,
    ),
  );
  if (!button) {
    log.warn("px challenge · hold button not found");
    return false;
  }

  log.info("px challenge · press & hold");
  const x = button.x + jitter(3);
  const y = button.y + jitter(3);
  await browser.mouse("mouseMoved", x + jitter(50), y + jitter(30));
  await Bun.sleep(between(200, 400));
  for (let step = 1; step <= 20; step++) await browser.mouse("mouseMoved", x + jitter(2), y + jitter(2));
  await Bun.sleep(between(100, 300));
  await browser.mouse("mousePressed", x, y);
  const releaseAt = performance.now() + between(9_500, 11_000);
  while (performance.now() < releaseAt) {
    await browser.mouse("mouseMoved", x + jitter(1), y + jitter(1), true);
    await Bun.sleep(400);
  }
  await browser.mouse("mouseReleased", x, y);

  const solved = await waitFor(RELEASE_WAIT_MS, async () =>
    isChallengeUrl(await browser.evaluate<string>("location.href")) ? null : true,
  );
  const elapsed = formatDuration(performance.now() - startedAt);
  if (solved) log.info(`px challenge solved in ${elapsed}`);
  else log.warn(`px challenge not solved after ${elapsed}`);
  return Boolean(solved);
}

async function waitFor<T>(timeoutMs: number, probe: () => Promise<T | null>): Promise<T | null> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = await probe().catch(() => null);
    if (value) return value;
    await Bun.sleep(250);
  }
  return null;
}
