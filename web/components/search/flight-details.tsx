"use client";

import { useId } from "react";
import { Button, ButtonLink } from "@/components/motion/button/base";
import { RouteLine } from "@/components/route-line";
import { ExternalLinkIcon } from "@/components/icons";
import { MODAL_ACTIONS, MODAL_DESCRIPTION, MODAL_TITLE } from "@/components/motion/modal-styles";
import { MorphingModalDialog } from "@/components/motion/morphing-modal";
import { cn } from "@/lib/utils";
import { formatDay, formatDuration, formatTime, stopsLabel, type Itinerary, type Leg } from "@/lib/flights";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// Skyscanner times are airport-local without an offset; read them as UTC so the
// viewer's own timezone (and its DST changes) can't shift the difference.
const localMs = (iso: string) => Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
const minutesBetween = (from: string, to: string) => Math.round((localMs(to) - localMs(from)) / 60000);

function LegDetails({ leg, title }: { leg: Leg; title: string }) {
  return (
    <section className="rounded-2xl border border-border bg-inset">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{title}</span>
        <span>{formatDay(leg.departure)}</span>
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-xl tabular-nums">{formatTime(leg.departure)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={leg.origin.name}>
            <span className="font-mono text-foreground">{leg.origin.code}</span> {leg.origin.name}
          </p>
        </div>
        <div className="w-24 text-center text-xs text-muted-foreground sm:w-36">
          <RouteLine className="text-muted-foreground" />
          <p className="mt-1">{formatDuration(leg.durationMinutes)} · {stopsLabel(leg.stops)}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="font-mono text-xl tabular-nums">{formatTime(leg.arrival)}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={leg.destination.name}>
            <span className="font-mono text-foreground">{leg.destination.code}</span> {leg.destination.name}
          </p>
        </div>
      </div>
      <ol className="space-y-2.5 border-t border-border px-4 py-3 text-sm">
        {leg.segments.map((segment, index) => {
          const previous = leg.segments[index - 1];
          return (
            <li key={segment.flightNumber + segment.departure} className="space-y-3">
              {previous ? (
                <p className="rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  {formatDuration(minutesBetween(previous.arrival, segment.departure))} layover in {segment.origin}
                </p>
              ) : null}
              <div className="grid grid-cols-[4.5rem_1fr_auto] gap-3">
                <span className="font-mono text-xs text-muted-foreground">{segment.flightNumber}</span>
                <span>
                  {segment.origin} {formatTime(segment.departure)} → {segment.destination} {formatTime(segment.arrival)}
                  <span className="block text-xs text-muted-foreground">
                    {segment.marketingCarrier}
                    {segment.operatingCarrier && segment.operatingCarrier !== segment.marketingCarrier
                      ? ` · operated by ${segment.operatingCarrier}`
                      : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(segment.durationMinutes)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function FlightDetails({ itinerary, onClose }: { itinerary: Itinerary; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const first = itinerary.legs[0];
  const carriers = [...new Set(itinerary.legs.flatMap((leg) => leg.carriers.map((c) => c.name)))].join(", ");
  const cheapest = itinerary.bookingOptions.reduce<Itinerary["bookingOptions"][number] | undefined>(
    (best, option) => (!best || (option.price && option.price < best.price) ? option : best),
    undefined,
  );
  const facts = [
    { label: "Total time", value: formatDuration(itinerary.durationMinutes) },
    { label: "Stops", value: stopsLabel(itinerary.stops) },
    { label: "Trip", value: itinerary.legs.length > 1 ? "Return" : "One way" },
    { label: "CO₂", value: itinerary.emissionsKg ? `${Math.round(itinerary.emissionsKg)} kg` : "—" },
  ];
  const agents = itinerary.bookingOptions.length;
  return (
    <MorphingModalDialog aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId} className={MODAL_TITLE}>
        {first.origin.city || first.origin.name} → {first.destination.city || first.destination.name}
      </h2>
      <p id={descriptionId} className={cn("mt-1", MODAL_DESCRIPTION)}>
        {carriers} · {formatDay(first.departure)}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-2xl tabular-nums">{itinerary.priceFormatted}</p>
            {itinerary.tags.length || itinerary.isSelfTransfer ? (
              <p className="flex flex-wrap gap-1.5">
                {itinerary.isSelfTransfer ? <span className="rounded-md border border-border px-1.5 py-0.5 text-xs">Self transfer</span> : null}
                {itinerary.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-xs capitalize">
                    {tag.replaceAll("_", " ").toLowerCase()}
                  </span>
                ))}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-4 divide-x divide-border rounded-2xl border border-border">
            {facts.map((fact) => (
              <div key={fact.label} className="px-3 py-2">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="mt-0.5 text-sm tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>

          {itinerary.legs.map((leg, index) => (
            <LegDetails key={index} leg={leg} title={index === 0 ? "Outbound" : "Return"} />
          ))}
        </div>

        <div className="md:border-l md:border-border md:pl-6">
          <h3 className="text-sm text-muted-foreground">
            Book with {agents} agent{agents === 1 ? "" : "s"}
          </h3>
          <ul className="mt-1 divide-y divide-border">
            {itinerary.bookingOptions.map((option) => (
              <li key={option.agentId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate" title={option.agentName}>
                  {option.agentName}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-mono tabular-nums">{option.price ? inr.format(option.price) : "—"}</span>
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

      <div className={MODAL_ACTIONS}>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {cheapest ? (
          <ButtonLink href={cheapest.url} target="_blank" rel="noreferrer">
            Book on {cheapest.agentName}
            <ExternalLinkIcon className="size-4" />
          </ButtonLink>
        ) : null}
      </div>
    </MorphingModalDialog>
  );
}
