import { MinusIcon, PlusIcon, UserIcon } from "@/components/icons";

const MIN = 1;
const MAX = 8;

const stepClass =
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

export function AdultsStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div role="group" aria-label="Adults" className="flex h-9 items-center gap-1 rounded-lg border border-border px-1">
      <button type="button" aria-label="Remove an adult" className={stepClass} disabled={value <= MIN} onClick={() => onChange(value - 1)}>
        <MinusIcon className="size-4" />
      </button>
      <span aria-live="polite" className="flex min-w-18 items-center justify-center gap-1.5 text-sm tabular-nums">
        <UserIcon className="size-4 text-muted-foreground" />
        {value} adult{value === 1 ? "" : "s"}
      </span>
      <button type="button" aria-label="Add an adult" className={stepClass} disabled={value >= MAX} onClick={() => onChange(value + 1)}>
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
