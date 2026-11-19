"use client";

import { CenterMorphModal, CenterMorphModalContent, CenterMorphModalTrigger } from "@/components/motion/center-morph-modal";
import { RouteLine } from "@/components/route-line";
import { FlightDetails } from "@/components/search/flight-details";
import { formatDuration, formatTime, stopsLabel, type Itinerary } from "@/lib/flights";

export function ResultCard({ itinerary, badge }: { itinerary: Itinerary; badge?: string }) {
  const [outbound, inbound] = itinerary.legs;
  const carriers = [...new Set(itinerary.legs.flatMap((leg) => leg.carriers.map((c) => c.name)))].join(", ");
  return (
    <CenterMorphModal>
      <CenterMorphModalTrigger>
        <button
          type="button"
          className="grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-[border-color,transform] duration-150 hover:border-border-strong active:scale-[0.995]"
        >
          <span className="min-w-0 space-y-2.5">
            <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <span className="truncate">{carriers}</span>
              {badge ? <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-foreground">{badge}</span> : null}
            </span>
            {[outbound, inbound].filter(Boolean).map((leg, i) => (
              <span key={i} className="flex items-center gap-3 sm:gap-4">
                <span className="w-12 text-right font-mono text-base tabular-nums sm:text-lg">{formatTime(leg.departure)}</span>
                <span className="hidden w-9 font-mono text-xs text-muted-foreground sm:inline">{leg.origin.code}</span>
                <RouteLine className="max-w-56 flex-1 text-muted-foreground" />
                <span className="hidden w-9 font-mono text-xs text-muted-foreground sm:inline">{leg.destination.code}</span>
                <span className="w-12 font-mono text-base tabular-nums sm:text-lg">{formatTime(leg.arrival)}</span>
                <span className="hidden text-xs text-muted-foreground md:inline">
                  {formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}
                </span>
              </span>
            ))}
          </span>
          <span className="text-right">
            <span className="block font-mono text-lg tabular-nums">{itinerary.priceFormatted}</span>
            <span className="text-xs text-muted-foreground">{itinerary.bookingOptions.length} agents</span>
          </span>
        </button>
      </CenterMorphModalTrigger>
      <CenterMorphModalContent ariaLabel="Flight details" className="w-[min(36rem,calc(100vw-2rem))] max-h-[85dvh] overflow-y-auto bg-card">
        <FlightDetails itinerary={itinerary} />
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
