"use client";

import { Collapsible, CollapsibleContent, CollapsibleIndicator, CollapsibleTrigger } from "@/components/motion/collapsible";
import { ButtonLink } from "@/components/motion/button/base";
import { RouteLine } from "@/components/route-line";
import { ExternalLinkIcon } from "@/components/icons";
import { formatDay, formatDuration, formatTime, stopsLabel, type Itinerary } from "@/lib/flights";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function FlightDetails({ itinerary }: { itinerary: Itinerary }) {
  return (
    <div className="space-y-6 p-6 sm:p-8">
      <header>
        <p className="font-mono text-2xl tabular-nums">{itinerary.priceFormatted}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDuration(itinerary.durationMinutes)} in total · {stopsLabel(itinerary.stops)}
          {itinerary.isSelfTransfer ? " · self transfer" : ""}
          {itinerary.emissionsKg ? ` · ${Math.round(itinerary.emissionsKg)} kg CO₂` : ""}
        </p>
      </header>

      <div className="space-y-3">
        {itinerary.legs.map((leg, index) => (
          <Collapsible key={index} defaultOpen={index === 0} className="rounded-xl border border-border bg-inset">
            <CollapsibleTrigger className="flex w-full items-center gap-4 px-4 py-3.5 text-left text-sm">
              <span className="w-16 text-xs text-muted-foreground">{index === 0 ? "Outbound" : "Return"}</span>
              <span className="font-mono tabular-nums">{formatTime(leg.departure)}</span>
              <RouteLine className="flex-1 text-muted-foreground" label={formatDuration(leg.durationMinutes)} />
              <span className="font-mono tabular-nums">{formatTime(leg.arrival)}</span>
              <CollapsibleIndicator className="text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ol className="space-y-3 border-t border-border px-4 py-4 text-sm">
                {leg.segments.map((segment) => (
                  <li key={segment.flightNumber + segment.departure} className="grid grid-cols-[4rem_1fr_auto] gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{segment.flightNumber}</span>
                    <span>
                      {segment.origin} {formatTime(segment.departure)} → {segment.destination} {formatTime(segment.arrival)}
                      <span className="block text-xs text-muted-foreground">
                        {formatDay(segment.departure)} · {segment.operatingCarrier || segment.marketingCarrier}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(segment.durationMinutes)}</span>
                  </li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <div>
        <h3 className="text-sm text-muted-foreground">Book with</h3>
        <ul className="mt-2 divide-y divide-border">
          {itinerary.bookingOptions.map((option) => (
            <li key={option.agentId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>{option.agentName}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono tabular-nums">{inr.format(option.price)}</span>
                <ButtonLink href={option.url} target="_blank" rel="noreferrer" size="sm" variant="outline">
                  Book
                  <ExternalLinkIcon className="size-3.5" />
                </ButtonLink>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
