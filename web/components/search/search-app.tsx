"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/motion/button/base";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/motion/breadcrumb";
import type { DateRange } from "@/components/motion/date-range-picker";
import { Loader } from "@/components/motion/loader";
import { Pagination } from "@/components/motion/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/motion/tooltip";
import {
  AlertIcon,
  ExternalLinkIcon,
  LinkIcon,
  SearchIcon,
  SwapIcon,
} from "@/components/icons";
import { AdultsStepper } from "@/components/search/adults-stepper";
import { UrlSwitch } from "@/components/search/url-switch";
import { DateField } from "@/components/search/date-field";
import { PlaceField } from "@/components/search/place-field";
import { ResultCard } from "@/components/search/result-card";
import { ResultsSkeleton } from "@/components/search/results-skeleton";
import {
  CABIN_LABELS,
  sortItineraries,
  type CabinClass,
  type Place,
  type SearchResponse,
  type SortOrder,
} from "@/lib/flights";

const PAGE_SIZE = 10;
const MAX_RESULTS = 300;

/** Local calendar date, so "today" matches the user's clock rather than UTC. */
const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; response: SearchResponse }
  | { kind: "error"; message: string };

export function SearchApp() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [trip, setTrip] = useState<"oneway" | "return">("oneway");
  const [dates, setDates] = useState<DateRange | null>({ from: isoDate(14) });
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [adults, setAdults] = useState(1);
  const [sort, setSort] = useState<SortOrder>("best");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [mode, setMode] = useState<"filters" | "url">("filters");
  const [url, setUrl] = useState("");

  const missing =
    mode === "url"
      ? /^https:\/\/(www\.)?skyscanner\.[a-z.]+\/transport\/flights\//i.test(
          url.trim(),
        )
        ? null
        : "Paste a Skyscanner flight search URL"
      : !from
        ? "Choose where from"
        : !to
          ? "Choose where to"
          : !dates?.from
            ? "Choose a date"
            : trip === "return" && !dates.to
              ? "Choose a return date"
              : null;

  async function search() {
    if (missing) return;
    if (mode === "filters" && (!from || !to || !dates)) return;
    setStatus({ kind: "loading" });
    setPage(1);
    try {
      const res = await fetch(mode === "url" ? "/api/url" : "/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "url"
            ? { url: url.trim(), max: MAX_RESULTS, sort: "best" }
            : {
                from: from!.code,
                to: to!.code,
                departDate: dates!.from,
                ...(trip === "return" && dates!.to
                  ? { returnDate: dates!.to }
                  : {}),
                cabinClass: cabin,
                adults: Number(adults),
                max: MAX_RESULTS,
                sort: "best",
              },
        ),
      });
      const response = (await res.json()) as SearchResponse & {
        error?: string;
      };
      if (response.status === "pass") setStatus({ kind: "done", response });
      else
        setStatus({
          kind: "error",
          message:
            response.failed?.message ?? response.error ?? "Search failed",
        });
    } catch {
      setStatus({
        kind: "error",
        message: "Could not reach the search service",
      });
    }
  }

  const sorted = useMemo(
    () =>
      status.kind === "done"
        ? sortItineraries(status.response.result?.itineraries ?? [], sort)
        : [],
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
            {status.kind !== "idle" ? (
              <BreadcrumbLink href="/search">Search</BreadcrumbLink>
            ) : (
              <BreadcrumbPage>Search</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {mode === "filters" && from && to && status.kind !== "idle" ? (
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
        <div className="relative z-30 flex flex-wrap items-center gap-2">
          {mode === "filters" ? (
            <>
              <Tabs
                variant="segment"
                value={trip}
                onValueChange={(v) => setTrip(v as "oneway" | "return")}
              >
                <TabsList className="bg-muted">
                  <TabsTrigger value="oneway">One way</TabsTrigger>
                  <TabsTrigger value="return">Return</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex w-full gap-2 sm:w-auto">
                <Select
                  value={cabin}
                  onValueChange={(v) => setCabin(v as CabinClass)}
                  className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                >
                  <SelectTrigger>
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
                <AdultsStepper value={adults} onChange={setAdults} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Paste a Skyscanner flight search link
            </p>
          )}
          <UrlSwitch
            checked={mode === "url"}
            onChange={(on) => setMode(on ? "url" : "filters")}
          />
        </div>

        {mode === "url" ? (
          <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
            <label className="space-y-1.5">
              <span className="block text-xs text-muted-foreground">
                Search URL
              </span>
              <span className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 transition-[border-color] focus-within:border-border-strong">
                <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.skyscanner.co.in/transport/flights/bom/del/261215/"
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </span>
            </label>
            <Button
              type="submit"
              disabled={status.kind === "loading" || missing !== null}
              title={missing ?? undefined}
            >
              <SearchIcon className="size-4" />
              Search
            </Button>
          </div>
        ) : (
          <>
            <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr_minmax(12rem,0.8fr)_auto]">
              <PlaceField
                label="From"
                direction="from"
                value={from}
                onChange={setFrom}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Swap origin and destination"
                    className="justify-self-center"
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
              <PlaceField
                label="To"
                direction="to"
                value={to}
                onChange={setTo}
              />
              <div className="space-y-1.5">
                <span className="block text-xs text-muted-foreground">
                  {trip === "return" ? "Dates" : "Date"}
                </span>
                <DateField
                  trip={trip}
                  value={dates}
                  onChange={setDates}
                  min={isoDate(0)}
                />
              </div>
              <Button
                type="submit"
                disabled={status.kind === "loading" || missing !== null}
                title={missing ?? undefined}
              >
                <SearchIcon className="size-4" />
                Search
              </Button>
            </div>
          </>
        )}
      </form>

      {status.kind === "loading" ? (
        <section aria-live="polite" className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader variant="dots" size={16} label="Searching Skyscanner" />
            Searching Skyscanner, usually 5 to 10 seconds
          </div>
          <ResultsSkeleton />
        </section>
      ) : null}

      {status.kind === "error" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 text-sm"
        >
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
            <Tabs
              variant="segment"
              value={sort}
              onValueChange={(v) => {
                setSort(v as SortOrder);
                setPage(1);
              }}
            >
              <TabsList className="bg-muted">
                <TabsTrigger value="best">Best</TabsTrigger>
                <TabsTrigger value="cheapest">Cheapest</TabsTrigger>
                <TabsTrigger value="fastest">Fastest</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono text-foreground/80 tabular-nums">
                {result.counts.total} flights ·{" "}
                {(status.response.timeElapsedMs / 1000).toFixed(1)}s
              </span>
              {result.searchUrl ? (
                <a
                  href={result.searchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  Skyscanner <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>

          {visible.length ? (
            <ul className="space-y-2">
              {visible.map((itinerary, index) => (
                <li
                  key={itinerary.id}
                  className="rise-in"
                  style={{ ["--i" as string]: index }}
                >
                  <ResultCard
                    itinerary={itinerary}
                    badge={badges.get(itinerary.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              No flights on this route and date
            </p>
          )}

          {totalPages > 1 ? (
            <Pagination
              totalPages={totalPages}
              page={page}
              onPageChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="justify-center"
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
