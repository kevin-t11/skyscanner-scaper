"use client";

import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerContent,
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

/** One calendar for both trip types; one-way keeps only the day just clicked. */
export function DateField({ trip, value, onChange, min }: DateFieldProps) {
  const summary = !value?.from
    ? trip === "return" ? "Depart and return" : "Depart"
    : trip === "oneway"
      ? formatDay(value.from)
      : `${formatDay(value.from)} – ${value.to ? formatDay(value.to) : "Return"}`;
  return (
    <DateRangePicker
      value={value}
      onValueChange={(range) => {
        if (!range || trip === "return") return onChange(range);
        // The picker orders the two clicks, so the new day is whichever end differs from the current departure.
        onChange({ from: range.from !== value?.from ? range.from : (range.to ?? range.from) });
      }}
      min={min}
      className="w-full"
      closeOnSelect
      showSummary={false}
    >
      <DateRangePickerTrigger className="w-full" aria-label={`${trip === "return" ? "Dates" : "Date"}: ${summary}`}>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{summary}</span>
      </DateRangePickerTrigger>
      <DateRangePickerContent>
        <DateRangePickerCalendar className="w-full rounded-none border-0" />
      </DateRangePickerContent>
    </DateRangePicker>
  );
}
