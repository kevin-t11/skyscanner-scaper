"use client";

import { useRef } from "react";
import { CylinderCarousel } from "@/components/motion/cylinder-carousel";
import { RouteLine } from "@/components/route-line";
import type { Place } from "@/lib/flights";

const city = (code: string, name: string, country: string): Place => ({ code, name, iata: code, type: "airport", entityId: "", city: name, country });

export const POPULAR_ROUTES: { from: Place; to: Place }[] = [
  { from: city("BOM", "Mumbai", "India"), to: city("DEL", "Delhi", "India") },
  { from: city("BLR", "Bengaluru", "India"), to: city("GOI", "Goa", "India") },
  { from: city("DEL", "Delhi", "India"), to: city("DXB", "Dubai", "United Arab Emirates") },
  { from: city("BOM", "Mumbai", "India"), to: city("LHR", "London Heathrow", "United Kingdom") },
  { from: city("MAA", "Chennai", "India"), to: city("SIN", "Singapore Changi", "Singapore") },
  { from: city("HYD", "Hyderabad", "India"), to: city("CCU", "Kolkata", "India") },
  { from: city("DEL", "Delhi", "India"), to: city("JFK", "New York JFK", "United States") },
];

export function PopularRoutes({ onPick }: { onPick: (route: { from: Place; to: Place }) => void }) {
  // The carousel captures the pointer to drag, so a mouse click never reaches the card: treat a still press as a tap.
  const press = useRef<{ x: number; index: number } | null>(null);
  return (
    <section
      aria-label="Popular routes"
      className="space-y-4"
      onPointerDownCapture={(event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-route]");
        press.current = card ? { x: event.clientX, index: Number(card.dataset.route) } : null;
      }}
      onPointerUpCapture={(event) => {
        const start = press.current;
        press.current = null;
        if (start && Math.abs(event.clientX - start.x) < 6) onPick(POPULAR_ROUTES[start.index]);
      }}
    >
      <h2 className="text-sm text-muted-foreground">Popular routes</h2>
      <CylinderCarousel itemSize={160} visibleItems={5} variant="convex" height={200}>
        {POPULAR_ROUTES.map((route, index) => (
          <button
            key={`${route.from.code}-${route.to.code}`}
            type="button"
            data-route={index}
            onClick={() => onPick(route)}
            className="flex size-full flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-border-strong"
          >
            <span className="flex items-center gap-2 font-mono text-sm">
              {route.from.code}
              <RouteLine className="flex-1 text-muted-foreground" />
              {route.to.code}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">
              {route.from.city} to {route.to.city}
            </span>
          </button>
        ))}
      </CylinderCarousel>
    </section>
  );
}
