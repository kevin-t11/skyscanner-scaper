import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setLogLevel } from "../../src/logging/logger";

setLogLevel("error");
import { SessionBlockedError } from "../../src/errors";
import { createHttpServer } from "../../src/http/http-server";
import type { FlightSearch, FlightSearchRequest, FlightSearchResult } from "../../src/search/flight-search-service";

const received: FlightSearchRequest[] = [];
const fakeSearch: FlightSearch = {
  async search(request) {
    received.push(request);
    if (request.searchUrl.includes("blocked")) throw new SessionBlockedError("search API returned 403");
    return { query: {}, complete: true, total: 0, itineraries: [], timings: {} } as unknown as FlightSearchResult;
  },
};
const server = createHttpServer(fakeSearch, () => ({ ready: 1 }), { port: 0 });
const baseUrl = `http://localhost:${server.port}`;
afterAll(() => server.stop());

const SEARCH_URL = "https://www.skyscanner.com/transport/flights/lhr/jfk/261215/";
const get = (query: string, headers?: HeadersInit) => fetch(`${baseUrl}/url?${query}`, { headers });

describe("/url", () => {
  test("GET with defaults returns a pass envelope", async () => {
    const response = await get(`url=${encodeURIComponent(SEARCH_URL)}`);
    expect(response.status).toBe(200);
    expect(received.at(-1)).toEqual({ searchUrl: SEARCH_URL, maxItems: 50, sort: "best", fast: false });
    expect(await response.json()).toMatchObject({
      status: "pass",
      request: { searchUrl: SEARCH_URL, maxItems: 50, sorting: "best", fast: false },
      result: { complete: true, total: 0, count: 0, itineraries: [] },
      failed: {},
    });
  });

  test("POST with options", async () => {
    const response = await fetch(`${baseUrl}/url`, {
      method: "POST",
      body: JSON.stringify({ url: SEARCH_URL, max: 5, sort: "fastest", fast: true }),
    });
    expect(response.status).toBe(200);
    expect(received.at(-1)).toEqual({ searchUrl: SEARCH_URL, maxItems: 5, sort: "fastest", fast: true });
  });

  test("a failed search echoes the options it used, with defaults applied", async () => {
    const response = await get(`url=${encodeURIComponent(SEARCH_URL + "?blocked=1")}`);
    expect(response.status).toBe(502);
    const envelope = await response.json();
    expect(envelope).toMatchObject({
      status: "fail",
      request: { searchUrl: SEARCH_URL + "?blocked=1", maxItems: 50, sorting: "best", fast: false },
      result: null,
      failed: { code: "blocked", message: "search API returned 403" },
    });
    expect(typeof envelope.timeElapsedMs).toBe("number");
  });

  test("POST with an object as max and no url still returns a 400 envelope", async () => {
    const response = await fetch(`${baseUrl}/url`, { method: "POST", body: JSON.stringify({ max: { a: 1 } }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: "fail", request: { maxItems: null }, result: null, failed: { code: "invalid_request" } });
  });

  test.each([
    [`max=0&url=${encodeURIComponent(SEARCH_URL)}`, 400],
    [`sort=random&url=${encodeURIComponent(SEARCH_URL)}`, 400],
    ["url=https://example.com/", 400],
    ["", 400],
  ])("GET ?%s → %d", async (query, status) => {
    expect((await get(query)).status).toBe(status);
  });

  test("requires x-api-key when configured", async () => {
    const locked = createHttpServer(fakeSearch, () => ({}), { port: 0, apiKey: "secret" });
    const url = `http://localhost:${locked.port}/url?url=${encodeURIComponent(SEARCH_URL)}`;
    try {
      const denied = await fetch(url);
      expect(denied.status).toBe(401);
      expect((await denied.json()).failed.code).toBe("unauthorized");
      expect((await fetch(url, { headers: { "x-api-key": "secret" } })).status).toBe(200);
    } finally {
      locked.stop();
    }
  });

  test("saves each search response to outputDir and returns x-request-id", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "http-output-"));
    const saving = createHttpServer(fakeSearch, () => ({}), { port: 0, outputDir });
    try {
      const response = await fetch(`http://localhost:${saving.port}/url?url=${encodeURIComponent(SEARCH_URL)}`);
      const requestId = response.headers.get("x-request-id");
      expect(requestId).toMatch(/^[0-9a-f]{6}$/);
      const [file] = await readdir(outputDir);
      expect(file).toEndWith(`_best_pass_${requestId}.json`);
      expect(JSON.parse(await readFile(join(outputDir, file!), "utf8"))).toEqual(await response.json());
    } finally {
      saving.stop();
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("health and 404", async () => {
    expect(await (await fetch(`${baseUrl}/health`)).json()).toEqual({ ready: 1 });
    expect((await fetch(`${baseUrl}/nope`)).status).toBe(404);
  });
});
