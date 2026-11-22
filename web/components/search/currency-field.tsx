"use client";

import { useState } from "react";
import { ChevronDownIcon, SearchIcon, TickIcon } from "@/components/icons";
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "@/components/motion/popover-morph";
import { cn } from "@/lib/utils";
import { CURRENCIES, currencyName } from "@/lib/currency";

const OPTIONS = CURRENCIES.map((code) => ({ code, name: currencyName(code) }));
const LIST_ID = "currency-options";

/** Currency button; its popover is a combobox searching code and name. */
export function CurrencyField({ value, onChange }: { value: string | null; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const matches = q
    ? OPTIONS.filter(({ code, name }) => code.toLowerCase().includes(q) || name.toLowerCase().includes(q))
    : OPTIONS;

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(Math.max(0, OPTIONS.findIndex((option) => option.code === value)));
    }
  };
  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };
  const move = (step: number) => {
    if (!matches.length) return;
    const next = (active + step + matches.length) % matches.length;
    setActive(next);
    document.getElementById(`${LIST_ID}-${matches[next].code}`)?.scrollIntoView({ block: "nearest" });
  };

  return (
    <MorphPopover open={open} onOpenChange={openChange}>
      <MorphPopoverTrigger>
        <button
          type="button"
          aria-label={`Currency: ${value ?? "not set"}`}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:border-(--color-border-strong)"
        >
          <span className="w-9 text-left font-mono">{value ?? "—"}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent
        align="end"
        radius={12}
        className="w-72 p-1.5"
        onOpenAutoFocus={(content) => content.querySelector("input")?.focus()}
      >
        <label className="flex h-9 items-center gap-2 border-b border-border px-2.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            role="combobox"
            aria-label="Search currencies"
            aria-expanded
            aria-controls={LIST_ID}
            aria-activedescendant={matches[active] ? `${LIST_ID}-${matches[active].code}` : undefined}
            autoComplete="off"
            placeholder="Search currency"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                move(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter" && matches[active]) {
                event.preventDefault();
                pick(matches[active].code);
              }
            }}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div id={LIST_ID} role="listbox" aria-label="Currencies" className="mt-1 max-h-64 overflow-y-auto overscroll-contain">
          {matches.map(({ code, name }, index) => (
            <div
              key={code}
              id={`${LIST_ID}-${code}`}
              role="option"
              aria-selected={code === value}
              onPointerMove={() => setActive(index)}
              onClick={() => pick(code)}
              className={cn(
                "flex h-9 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm",
                index === active && "bg-muted",
              )}
            >
              <span className="w-9 shrink-0 font-mono">{code}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{name}</span>
              {code === value ? <TickIcon className="size-4 shrink-0" /> : null}
            </div>
          ))}
          {matches.length ? null : <p className="px-2.5 py-3 text-sm text-muted-foreground">No matches</p>}
        </div>
      </MorphPopoverContent>
    </MorphPopover>
  );
}
