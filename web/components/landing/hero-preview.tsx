import { RouteLine } from "@/components/route-line";

const ROWS = [
  { carrier: "IndiGo", flight: "6E 2131", dep: "06:10", arr: "08:20", duration: "2h 10m", stops: "Direct", price: "₹5,784", tag: "Cheapest" },
  { carrier: "Air India", flight: "AI 805", dep: "07:00", arr: "09:05", duration: "2h 05m", stops: "Direct", price: "₹6,412", tag: "Fastest" },
  { carrier: "Akasa Air", flight: "QP 1129", dep: "09:35", arr: "11:50", duration: "2h 15m", stops: "Direct", price: "₹6,090", tag: null },
];

/** A still of the results screen: the first card drawn as a boarding pass, the rest quiet. */
export function HeroPreview() {
  const [first, ...rest] = ROWS;
  return (
    <div className="relative rounded-2xl border border-border bg-card p-3 shadow-card">
      <div className="flex items-center justify-between px-3 pt-2 pb-4 text-xs text-muted-foreground">
        <span className="font-mono">BOM → DEL · Tue 15 Dec · 1 adult</span>
        <span className="font-mono tabular-nums">208 flights · 3.4s</span>
      </div>

      <article className="relative grid grid-cols-[1fr_auto] overflow-hidden rounded-lg bg-foreground text-background">
        <div className="space-y-5 p-5">
          <div className="flex items-baseline justify-between text-xs opacity-70">
            <span>{first.carrier} · <span className="font-mono">{first.flight}</span></span>
            <span>{first.tag}</span>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <p className="font-mono text-2xl tabular-nums">{first.dep}</p>
              <p className="text-xs opacity-70">BOM</p>
            </div>
            <RouteLine className="flex-1 opacity-80" label={first.duration} />
            <div className="text-right">
              <p className="font-mono text-2xl tabular-nums">{first.arr}</p>
              <p className="text-xs opacity-70">DEL</p>
            </div>
          </div>
          <p className="text-xs opacity-70">{first.stops} · Economy</p>
        </div>
        <div className="flex flex-col items-end justify-between border-l border-dashed border-background/25 p-5">
          <span className="text-xs opacity-70">from</span>
          <span className="font-mono text-xl tabular-nums">{first.price}</span>
        </div>
      </article>

      <ul className="mt-2 divide-y divide-border">
        {rest.map((row) => (
          <li key={row.flight} className="grid grid-cols-[1fr_auto] items-center gap-4 px-3 py-3.5 text-sm">
            <div className="flex items-center gap-4">
              <span className="w-24 text-muted-foreground">{row.carrier}</span>
              <span className="font-mono tabular-nums">{row.dep}</span>
              <RouteLine className="w-16 text-muted-foreground" />
              <span className="font-mono tabular-nums">{row.arr}</span>
              <span className="hidden text-xs text-muted-foreground md:inline">{row.duration}</span>
            </div>
            <span className="font-mono tabular-nums">{row.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
