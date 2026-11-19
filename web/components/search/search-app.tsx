"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/motion/button/base";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/motion/breadcrumb";
import type { DateRange } from "@/components/motion/date-range-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/motion/dropdown-menu";
import { Loader } from "@/components/motion/loader";
import { Pagination } from "@/components/motion/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/motion/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/motion/tooltip";
import { AlertIcon, ExternalLinkIcon, SearchIcon, SwapIcon, UserIcon } from "@/components/icons";
import { DateField } from "@/components/search/date-field";
import { PlaceField } from "@/components/search/place-field";
import { PopularRoutes } from "@/components/search/popular-routes";
import { ResultCard } from "@/components/search/result-card";
import { ResultsSkeleton } from "@/components/search/results-skeleton";
import { CABIN_LABELS, sortItineraries, type CabinClass, type Place, type SearchResponse, type SortOrder } from "@/lib/flights";

const PAGE_SIZE = 10;
const MAX_RESULTS = 300;

/** Local calendar date, so "today" matches the user's clock rather than UTC. */
const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "done"; response: SearchResponse } | { kind: "error"; message: string };

export function SearchApp() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [trip, setTrip] = useState<"oneway" | "return">("oneway");
  const [dates, setDates] = useState<DateRange | null>({ from: isoDate(14) });
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [adults, setAdults] = useState("1");
  const [sort, setSort] = useState<SortOrder>("best");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const missing = !from ? "Choose where from" : !to ? "Choose where to" : !dates?.from ? "Choose a date" : trip === "return" && !dates.to ? "Choose a return date" : null;

  async function search() {
    if (missing || !from || !to || !dates) return;
    setStatus({ kind: "loading" });
    setPage(1);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: from.code,
          to: to.code,
          departDate: dates.from,
          ...(trip === "return" && dates.to ? { returnDate: dates.to } : {}),
          cabinClass: cabin,
          adults: Number(adults),
          max: MAX_RESULTS,
          sort: "best",
        }),
      });
      const response = (await res.json()) as SearchResponse & { error?: string };
      if (response.status === "pass") setStatus({ kind: "done", response });
      else setStatus({ kind: "error", message: response.failed?.message ?? response.error ?? "Search failed" });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the search service" });
    }
  }

  const sorted = useMemo(
    () => (status.kind === "done" ? sortItineraries(status.response.result?.itineraries ?? [], sort) : []),
    [status, sort],
  );
  const badges = useMemo(() => {
    const map = new Map<string, string>();
    if (!sorted.length) return map;
    const cheapest = sortItineraries(sorted, "cheapest")[0];
    const fastest = sortItineraries(sorted, "fastest")[0];
    map.set(cheapest.id, "Cheapest");
    if (fastest.id !== cheapest.id) map.set(fastest.id, "Fastest");
    return map;
  }, [sorted]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const result = status.kind === "done" ? status.response.result : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {from && to && status.kind !== "idle" ? <BreadcrumbLink href="/search">Search</BreadcrumbLink> : <BreadcrumbPage>Search</BreadcrumbPage>}
          </BreadcrumbItem>
          {from && to && status.kind !== "idle" ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-mono">
                  {from.iata ?? from.code} → {to.iata ?? to.code}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>

      <form
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={trip} onValueChange={(v) => setTrip(v as "oneway" | "return")}>
            <TabsList>
              <TabsTrigger value="oneway">One way</TabsTrigger>
              <TabsTrigger value="return">Return</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Select value={cabin} onValueChange={(v) => setCabin(v as CabinClass)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Cabin" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CABIN_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button type="button" variant="outline" size="sm" aria-label={`${adults} adult${adults === "1" ? "" : "s"}`}>
                  <UserIcon className="size-4" />
                  <span className="tabular-nums">{adults}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={adults} onValueChange={setAdults}>
                  {["1", "2", "3", "4", "5", "6", "7", "8"].map((n) => (
                    <DropdownMenuRadioItem key={n} value={n} closeOnSelect>
                      {n} adult{n === "1" ? "" : "s"}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr_minmax(12rem,0.8fr)_auto]">
          <PlaceField label="From" direction="from" value={from} onChange={setFrom} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Swap origin and destination"
                className="mb-1 justify-self-center"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
              >
                <SwapIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Swap</TooltipContent>
          </Tooltip>
          <PlaceField label="To" direction="to" value={to} onChange={setTo} />
          <div className="space-y-1.5">
            <span className="block text-xs text-muted-foreground">{trip === "return" ? "Dates" : "Date"}</span>
            <DateField trip={trip} value={dates} onChange={setDates} min={isoDate(0)} />
          </div>
          <Button type="submit" size="lg" disabled={status.kind === "loading" || missing !== null} title={missing ?? undefined}>
            <SearchIcon className="size-4" />
            Search
          </Button>
        </div>
      </form>

      {status.kind === "idle" ? (
        <PopularRoutes
          onPick={(route) => {
            setFrom(route.from);
            setTo(route.to);
          }}
        />
      ) : null}

      {status.kind === "loading" ? (
        <section aria-live="polite" className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader variant="dots" size={16} label="Searching Skyscanner" />
            Searching Skyscanner, usually 3 to 7 seconds
          </div>
          <ResultsSkeleton />
        </section>
      ) : null}

      {status.kind === "error" ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">No results</p>
            <p className="mt-1 text-muted-foreground">{status.message}</p>
          </div>
        </div>
      ) : null}

      {status.kind === "done" && result ? (
        <section className="space-y-4" aria-label="Results">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={sort} onValueChange={(v) => { setSort(v as SortOrder); setPage(1); }}>
              <TabsList>
                <TabsTrigger value="best">Best</TabsTrigger>
                <TabsTrigger value="cheapest">Cheapest</TabsTrigger>
                <TabsTrigger value="fastest">Fastest</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Popover trigger="hover" side="bottom" align="end">
                <PopoverTrigger>
                  <button type="button" className="font-mono tabular-nums underline decoration-dotted underline-offset-4">
                    {result.counts.total} flights · {(status.response.timeElapsedMs / 1000).toFixed(1)}s
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4 text-xs leading-relaxed text-muted-foreground">
                  {result.complete
                    ? "Skyscanner finished collecting prices for this search."
                    : "Returned once no new flights arrived. A slow agent may add a few later."}
                </PopoverContent>
              </Popover>
              {result.searchUrl ? (
                <a href={result.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
                  Skyscanner <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>

          {visible.length ? (
            <ul className="space-y-2">
              {visible.map((itinerary, index) => (
                <li key={itinerary.id} className="rise-in" style={{ ["--i" as string]: index }}>
                  <ResultCard itinerary={itinerary} badge={badges.get(itinerary.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No flights on this route and date</p>
          )}

          {totalPages > 1 ? <Pagination totalPages={totalPages} page={page} onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="justify-center" /> : null}
        </section>
      ) : null}
    </div>
  );
}
