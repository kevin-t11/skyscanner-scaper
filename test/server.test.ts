import { afterAll, describe, expect, test } from "bun:test";
import { createServer } from "../src/server";
import { SessionBlocked, type FlightSearch, type SearchRequest } from "../src/service";

const calls: SearchRequest[] = [];
const search: FlightSearch = {
  async search(request) {
    calls.push(request);
    if (request.url.includes("blocked")) throw new SessionBlocked("search API returned 403");
    return { query: {} as any, sort: request.sort, complete: true, total: 0, count: 0, timings: {} as any, itineraries: [] };
  },
};
const server = createServer(search, () => ({ ready: 1 }), { port: 0 });
const base = `http://localhost:${server.port}`;
afterAll(() => server.stop());

const URL_ = "https://www.skyscanner.com/transport/flights/lhr/jfk/261215/";

describe("/url", () => {
  test("GET with defaults returns a pass envelope", async () => {
    const res = await fetch(`${base}/url?url=${encodeURIComponent(URL_)}`);
    expect(res.status).toBe(200);
    expect(calls.at(-1)).toEqual({ url: URL_, max: 50, sort: "best", fast: false });
    expect(await res.json()).toMatchObject({
      searchUrl: URL_,
      maxItems: 50,
      sorting: "best",
      status: "pass",
      results: [],
      failed: {},
    });
  });

  test("failures use the same envelope", async () => {
    const res = await fetch(`${base}/url?max=5&sort=cheapest&url=${encodeURIComponent(URL_ + "?blocked=1")}`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({
      searchUrl: URL_ + "?blocked=1",
      maxItems: 5,
      sorting: "cheapest",
      status: "fail",
      results: [],
      failed: { code: "blocked", message: "search API returned 403" },
    });
    expect(typeof body.timeElapsedMs).toBe("number");
  });

  test("POST with options", async () => {
    const res = await fetch(`${base}/url`, { method: "POST", body: JSON.stringify({ url: URL_, max: 5, sort: "fastest", fast: true }) });
    expect(res.status).toBe(200);
    expect(calls.at(-1)).toEqual({ url: URL_, max: 5, sort: "fastest", fast: true });
  });

  test.each([
    [`max=0&url=${encodeURIComponent(URL_)}`, 400],
    [`sort=random&url=${encodeURIComponent(URL_)}`, 400],
    ["url=https://example.com/", 400],
    ["", 400],
    [`url=${encodeURIComponent(URL_ + "?blocked=1")}`, 502],
  ])("GET ?%s → %d", async (query, status) => {
    const res = await fetch(`${base}/url?${query}`);
    expect(res.status).toBe(status);
  });

  test("requires x-api-key when configured", async () => {
    const locked = createServer(search, () => ({}), { port: 0, apiKey: "secret" });
    const url = `http://localhost:${locked.port}/url?url=${encodeURIComponent(URL_)}`;
    try {
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { "x-api-key": "secret" } })).status).toBe(200);
    } finally {
      locked.stop();
    }
  });

  test("health and 404", async () => {
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ready: 1 });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
