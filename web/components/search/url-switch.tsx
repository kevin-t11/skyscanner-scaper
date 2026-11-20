import { LinkIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function UrlSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="ml-auto flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <LinkIcon className="size-4" />
      Use URL
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-150",
          checked ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-150 ease-out motion-reduce:transition-none",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
