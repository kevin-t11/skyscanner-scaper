import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SearchApp } from "@/components/search/search-app";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <SearchApp />
      </main>
    </>
  );
}
