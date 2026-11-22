"use client";

import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "@/components/motion/popover-morph";
import { ChevronDownIcon, MinusIcon, PlusIcon, UserIcon, UsersIcon } from "@/components/icons";
import { INFANT_AGE_LIMIT, type Travellers } from "@/lib/flights";

const MAX_ADULTS = 8;
const MAX_CHILDREN = 8;
const MAX_CHILD_AGE = 17;
const DEFAULT_CHILD_AGE = 5;

const stepClass =
  "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const ageLabel = (age: number) => (age < INFANT_AGE_LIMIT ? "Under 2" : `${age} years`);

export function travellersSummary({ adults, childAges }: Travellers) {
  const infants = childAges.filter((age) => age < INFANT_AGE_LIMIT).length;
  const children = childAges.length - infants;
  return [
    plural(adults, "adult", "adults"),
    children ? plural(children, "child", "children") : "",
    infants ? plural(infants, "infant", "infants") : "",
  ].filter(Boolean).join(", ");
}

interface StepperProps {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
}

function Stepper({ label, value, onDecrement, onIncrement, canDecrement, canIncrement }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="flex h-9 items-center gap-1 rounded-lg border border-border p-1">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} className={stepClass} disabled={!canDecrement} onClick={onDecrement}>
        <MinusIcon className="size-4" />
      </button>
      <span aria-live="polite" className="min-w-16 text-center text-sm tabular-nums">{value}</span>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} className={stepClass} disabled={!canIncrement} onClick={onIncrement}>
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Adults, children and each child's age; a child under 2 is an infant on an adult's lap. */
export function TravellersField({ value, onChange }: { value: Travellers; onChange: (next: Travellers) => void }) {
  const { adults, childAges } = value;
  const infants = childAges.filter((age) => age < INFANT_AGE_LIMIT).length;
  const summary = travellersSummary(value);
  const total = adults + childAges.length;
  const setAge = (index: number, age: number) =>
    onChange({ adults, childAges: childAges.map((current, i) => (i === index ? age : current)) });

  return (
    <MorphPopover>
      <MorphPopoverTrigger>
        <button
          type="button"
          aria-label={`Travellers: ${summary}`}
          className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:border-(--color-border-strong)"
        >
          {total === 1 ? <UserIcon className="size-4 text-muted-foreground" /> : <UsersIcon className="size-4 text-muted-foreground" />}
          <span className="tabular-nums">{plural(total, "traveller", "travellers")}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent align="end" radius={12} className="w-80 space-y-4 p-4">
        <Row title="Adults" hint="18 and over">
          <Stepper
            label="Adults"
            value={String(adults)}
            canDecrement={adults > 1 && adults > infants}
            canIncrement={adults < MAX_ADULTS}
            onDecrement={() => onChange({ adults: adults - 1, childAges })}
            onIncrement={() => onChange({ adults: adults + 1, childAges })}
          />
        </Row>
        <Row title="Children" hint="0 to 17">
          <Stepper
            label="Children"
            value={String(childAges.length)}
            canDecrement={childAges.length > 0}
            canIncrement={childAges.length < MAX_CHILDREN}
            onDecrement={() => onChange({ adults, childAges: childAges.slice(0, -1) })}
            onIncrement={() => onChange({ adults, childAges: [...childAges, DEFAULT_CHILD_AGE] })}
          />
        </Row>
        {childAges.length ? (
          <div className="space-y-2 border-t border-border pt-4">
            {childAges.map((age, index) => (
              <Row key={index} title={`Child ${index + 1}`} hint={age < INFANT_AGE_LIMIT ? "Infant, on an adult's lap" : "Age on the return date"}>
                <Stepper
                  label={`Child ${index + 1} age`}
                  value={ageLabel(age)}
                  // An infant needs a free adult lap.
                  canDecrement={age > 0 && (age !== INFANT_AGE_LIMIT || infants < adults)}
                  canIncrement={age < MAX_CHILD_AGE}
                  onDecrement={() => setAge(index, age - 1)}
                  onIncrement={() => setAge(index, age + 1)}
                />
              </Row>
            ))}
            <p className="text-xs text-muted-foreground">One infant (under 2) per adult.</p>
          </div>
        ) : null}
      </MorphPopoverContent>
    </MorphPopover>
  );
}
