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
        const next = body.places ?? [];
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
        onQueryChange={(next) => {
          setQuery(next);
          if (value && next !== value.name) onChange(null);
        }}
        filter={() => true}
      >
        <ComboboxTrigger className="w-full">
          <ComboboxInput aria-label={label} placeholder="City or airport" />
        </ComboboxTrigger>
        <ComboboxContent className="w-[var(--anchor-width,20rem)] min-w-72">
          <ComboboxList ariaLabel={`${label} suggestions`}>
            {places.map((place) => (
              <ComboboxItem key={place.code} value={place.code} textValue={place.name} keywords={[place.code, place.city, place.country]}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {place.name}
                    <span className="ml-1.5 text-muted-foreground">
                      {place.type === "city" ? "all airports" : place.city !== place.name ? place.city : ""}
                      {place.type === "city" || place.city !== place.name ? " · " : ""}
                      {place.country}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{place.code}</span>
                </span>
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>{loading ? "Searching" : query.trim().length < 2 ? "Type two letters" : "No matches"}</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
