import { RouteLine } from "@/components/route-line";
import { cn } from "@/lib/utils";

export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-medium tracking-tight",
        large ? "gap-2.5 text-xl" : "text-[15px]",
      )}
    >
      <RouteLine className={large ? "w-8" : "w-6"} />
      Fareline
    </span>
  );
}
