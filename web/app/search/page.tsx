import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { SearchApp } from "@/components/search/search-app";
import { regionCurrency } from "@/lib/currency";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage() {
  const country = (await headers()).get("x-vercel-ip-country");
  return (
    <>
      <SiteHeader />
      <main>
        <SearchApp defaultCurrency={regionCurrency(country)} />
      </main>
    </>
  );
}
