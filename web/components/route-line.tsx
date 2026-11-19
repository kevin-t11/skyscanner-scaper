import { cn } from "@/lib/utils";

/** The signature: origin dot, dashed route, destination dot. */
export function RouteLine({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("relative flex h-2 items-center", className)} aria-hidden={label ? undefined : true}>
      <span className="size-1.5 shrink-0 rounded-full border border-current" />
      <span className="mx-0.5 h-px flex-1 bg-[repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_6px)] opacity-50" />
      {label ? <span className="px-1.5 font-mono text-[11px] whitespace-nowrap opacity-70">{label}</span> : null}
      {label ? <span className="mx-0.5 h-px flex-1 bg-[repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_6px)] opacity-50" /> : null}
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
    </span>
  );
}
