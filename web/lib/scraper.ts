import "server-only";

/** Server-side client for the scraper API. `SCRAPER_URL` and `SCRAPER_API_KEY` never reach the browser. */
export async function scraperFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.SCRAPER_URL;
  if (!base) return Response.json({ error: "SCRAPER_URL is not set" }, { status: 500 });
  const headers = new Headers(init?.headers);
  if (process.env.SCRAPER_API_KEY) headers.set("x-api-key", process.env.SCRAPER_API_KEY);
  try {
    const upstream = await fetch(new URL(path, base), { ...init, headers, cache: "no-store" });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ error: "scraper is unreachable" }, { status: 502 });
  }
}
