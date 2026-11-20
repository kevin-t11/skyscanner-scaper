"use client";

import { useEffect, useRef, useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/motion/combobox";
import type { Place } from "@/lib/flights";

interface PlaceFieldProps {
  label: string;
  direction: "from" | "to";
  value: Place | null;
  onChange: (place: Place | null) => void;
}

/** City or airport picker backed by Skyscanner's autocomplete. The value is the place code. */
export function PlaceField({ label, direction, value, onChange }: PlaceFieldProps) {
  const [query, setQuery] = useState(value ? value.name : "");
  const [places, setPlaces] = useState<Place[]>(value ? [value] : []);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, Place[]>());
  const open = useRef(false);

  // A value set from outside (swap, popular route) shows its name; clearing it keeps what the user typed.
  const [shownCode, setShownCode] = useState(value?.code);
  if (value?.code !== shownCode) {
    setShownCode(value?.code);
    if (value) {
      setQuery(value.name);
      setPlaces((current) => (current.some((p) => p.code === value.code) ? current : [value, ...current]));
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || (value && q === value.name)) return;
    const cached = cache.current.get(q.toLowerCase());
    if (cached) {
      setPlaces(cached);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?${new URLSearchParams({ q, type: direction })}`, { signal: controller.signal });
        const body = (await res.json()) as { places?: Place[] };
        const next = (body.places ?? []).filter((place, i, all) => all.findIndex((p) => p.code === place.code) === i);
        cache.current.set(q.toLowerCase(), next);
        setPlaces(next);
      } catch {
        if (!controller.signal.aborted) setPlaces([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, direction, value]);

  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <Combobox
        value={value?.code}
        onValueChange={(code) => {
          const place = places.find((p) => p.code === code) ?? null;
          onChange(place);
          if (place) setQuery(place.name);
        }}
        query={query}
        onOpenChange={(next) => {
          open.current = next;
        }}
        onQueryChange={(next) => {
          // Closing the list resets the query to "" (after onOpenChange): keep the picked place and its name.
          if (value && !next && !open.current) return setQuery(value.name);
          setQuery(next);
          if (value && next !== value.name) onChange(null);
        }}
        filter={() => true}
      >
        <ComboboxTrigger className="w-full">
          <ComboboxInput aria-label={label} placeholder="City or airport" />
        </ComboboxTrigger>
        <ComboboxContent sideOffset={4}>
          {loading && places.length > 0 ? (
            <p aria-live="polite" className="px-3 pt-2 text-xs text-muted-foreground">Searching…</p>
          ) : null}
          <ComboboxList ariaLabel={`${label} suggestions`}>
            {places
              .filter((place, i, all) => all.findIndex((p) => p.code === place.code) === i)
              .map((place) => {
                const detail = [place.type === "city" ? null : place.city !== place.name ? place.city : null, place.country]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <ComboboxItem
                    key={place.code}
                    value={place.code}
                    textValue={place.name}
                    keywords={[place.code, place.city, place.country]}
                    className="cursor-pointer"
                  >
                    <span className="flex w-full min-w-0 items-center gap-3" title={`${place.name} · ${detail} (${place.code})`}>
                      <span className="min-w-0 flex-1 truncate">
                        <span className={place.type === "city" ? "font-medium text-foreground" : undefined}>{place.name}</span>
                        <span className="ml-1.5 text-muted-foreground">{detail}</span>
                      </span>
                      {place.type === "city" ? (
                        <span className="shrink-0 rounded-xl border border-border px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                          All airports
                        </span>
                      ) : null}
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{place.code}</span>
                    </span>
                  </ComboboxItem>
                );
              })}
          </ComboboxList>
          <ComboboxEmpty>{loading ? "Searching…" : query.trim().length < 2 ? "Type two letters" : "No matches"}</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
