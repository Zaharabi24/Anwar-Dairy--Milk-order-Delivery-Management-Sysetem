import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { periodState, type PeriodFilter, type PeriodMode } from "@/lib/date-filter";

/**
 * The date filter, as two fields: how to narrow, and what to narrow to.
 *
 * One control for the mode and one that changes shape beneath it, rather than a month box, a year
 * box, a day box and two range boxes all on screen at once with four of them empty. Which of them
 * applies is then never in question -- the filter bar shows the one that does.
 *
 * Custom range is the exception and takes two fields, because a range is two dates.
 */
export function PeriodFilterFields({
  value,
  onChange,
  years,
  idPrefix,
  /** What the "All" option is called on this screen. */
  allLabel = "All dates",
}: {
  value: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
  /** The years the records span, for the Yearly dropdown. Newest first. */
  years: string[];
  idPrefix: string;
  allLabel?: string;
}) {
  const { invalid } = periodState(value);
  const set = (patch: Partial<PeriodFilter>) => onChange({ ...value, ...patch });

  return (
    <>
      <Field label="Date filter" htmlFor={`${idPrefix}-mode`}>
        <Select value={value.mode} onValueChange={(v) => set({ mode: v as PeriodMode })}>
          <SelectTrigger id={`${idPrefix}-mode`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{allLabel}</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
            <SelectItem value="year">Yearly</SelectItem>
            <SelectItem value="day">Specific date</SelectItem>
            <SelectItem value="range">Custom date range</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {value.mode === "month" ? (
        <Field label="Month" htmlFor={`${idPrefix}-month`}>
          <Input
            id={`${idPrefix}-month`}
            type="month"
            value={value.month}
            onChange={(e) => set({ month: e.target.value })}
          />
        </Field>
      ) : null}

      {value.mode === "year" ? (
        <Field label="Year" htmlFor={`${idPrefix}-year`}>
          {/* A dropdown of the years that actually have records, not a free-text box that can be
              set to a year nothing happened in. */}
          <Select value={value.year || "none"} onValueChange={(v) => set({ year: v })}>
            <SelectTrigger id={`${idPrefix}-year`}>
              <SelectValue placeholder="Choose a year" />
            </SelectTrigger>
            <SelectContent>
              {years.length === 0 ? <SelectItem value="none">No records yet</SelectItem> : null}
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {value.mode === "day" ? (
        <Field label="Date" htmlFor={`${idPrefix}-day`}>
          <Input
            id={`${idPrefix}-day`}
            type="date"
            value={value.day}
            onChange={(e) => set({ day: e.target.value })}
          />
        </Field>
      ) : null}

      {value.mode === "range" ? (
        <>
          <Field label="From date" htmlFor={`${idPrefix}-from`}>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              value={value.from}
              max={value.to || undefined}
              onChange={(e) => set({ from: e.target.value })}
            />
          </Field>
          <Field
            label="To date"
            htmlFor={`${idPrefix}-to`}
            {...(invalid ? { error: "Must be on or after the From date." } : {})}
          >
            <Input
              id={`${idPrefix}-to`}
              type="date"
              value={value.to}
              min={value.from || undefined}
              onChange={(e) => set({ to: e.target.value })}
            />
          </Field>
        </>
      ) : null}
    </>
  );
}
