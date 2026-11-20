"use client";

import { useState } from "react";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerContent,
  DateRangePickerGrid,
  DateRangePickerHeader,
  DateRangePickerTrigger,
  type DateRange,
} from "@/components/motion/date-range-picker";
import { CalendarIcon } from "@/components/icons";
import { formatDay } from "@/lib/flights";

interface DateFieldProps {
  trip: "oneway" | "return";
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  min: string;
}

/** One calendar for both trip types; one-way is a single-day picker with no range preview. */
export function DateField({ trip, value, onChange, min }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const oneWay = trip === "oneway";
  const summary = !value?.from
    ? oneWay ? "Depart" : "Depart and return"
    : oneWay
      ? formatDay(value.from)
      : `${formatDay(value.from)} – ${value.to ? formatDay(value.to) : "Return"}`;
  return (
    <DateRangePicker
      // A one-way day is shown as a closed one-day range, so hovering never previews a range.
      value={oneWay && value?.from ? { from: value.from, to: value.from } : value}
      onValueChange={(range) => {
        if (!oneWay || !range) return onChange(range);
        // The picker orders the two clicks, so the new day is whichever end differs from the current departure.
        onChange({ from: range.from !== value?.from ? range.from : (range.to ?? range.from) });
        setOpen(false);
      }}
      open={open}
      onOpenChange={setOpen}
      min={min}
      className="w-full"
      closeOnSelect
      showSummary={false}
    >
      <DateRangePickerTrigger className="w-full" aria-label={`${oneWay ? "Date" : "Dates"}: ${summary}`}>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{summary}</span>
      </DateRangePickerTrigger>
      <DateRangePickerContent>
        <DateRangePickerCalendar className="w-full rounded-none border-0">
          {oneWay ? (
            <>
              <DateRangePickerHeader />
              <DateRangePickerGrid />
            </>
          ) : undefined}
        </DateRangePickerCalendar>
      </DateRangePickerContent>
    </DateRangePicker>
  );
}
