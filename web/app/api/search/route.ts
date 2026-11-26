import { scraperFetch } from "@/lib/scraper";

/** A full search runs up to the scraper's 30 s deadline, and a retry on a fresh browser can double that. */
export const maxDuration = 90;

export async function POST(request: Request) {
  const body = await request.text();
  return scraperFetch("/search", { method: "POST", body, headers: { "content-type": "application/json" } });
}
