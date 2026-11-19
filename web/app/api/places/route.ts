import type { NextRequest } from "next/server";
import { scraperFetch } from "@/lib/scraper";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = request.nextUrl.searchParams.get("type") === "to" ? "to" : "from";
  if (!q) return Response.json({ query: q, type, places: [] });
  return scraperFetch(`/places?${new URLSearchParams({ q: q.slice(0, 100), type })}`);
}
