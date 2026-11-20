import { scraperFetch } from "@/lib/scraper";

export async function POST(request: Request) {
  const body = await request.text();
  return scraperFetch("/url", { method: "POST", body, headers: { "content-type": "application/json" } });
}
