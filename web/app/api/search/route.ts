import { scraperFetch } from "@/lib/scraper";

export async function POST(request: Request) {
  const body = await request.text();
  return scraperFetch("/search", { method: "POST", body, headers: { "content-type": "application/json" } });
}
