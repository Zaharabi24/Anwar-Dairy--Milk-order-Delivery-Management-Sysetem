// The date filter shared by Reports and the Mail Box email history.
//
// Both screens were asked for the same four ways of narrowing by date -- a month, a year, one
// particular day, or a range between two -- and both compare against a timestamp stored in UTC.
// Written twice they would have drifted, and the way they drift is in the timezone: "which emails
// went out on the 19th" means the 19th in Dhaka, where the office is, not wherever the server
// thinks midnight falls. So the comparison lives here, once, and is done on Dhaka-local calendar
// dates throughout.
//
// Types and pure functions only: safe to import from client code.

/** How the range is being chosen. `all` is every record, which is where each screen starts. */
export type PeriodMode = "all" | "month" | "year" | "day" | "range";

export interface PeriodFilter {
  mode: PeriodMode;
  /** yyyy-MM, from a month input. */
  month: string;
  /** yyyy. */
  year: string;
  /** yyyy-MM-dd, one particular day. */
  day: string;
  /** yyyy-MM-dd, inclusive at both ends. */
  from: string;
  to: string;
}

export const EMPTY_PERIOD: PeriodFilter = {
  mode: "all",
  month: "",
  year: "",
  day: "",
  from: "",
  to: "",
};

/** A timestamp as the calendar date it fell on in Dhaka, formatted yyyy-MM-dd. */
export function dhakaDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

/** Today in Dhaka, as a yyyy-MM-dd the date inputs and this module both read the same way. */
export function dhakaToday(): string {
  return dhakaDay(new Date());
}

/** The current month in Dhaka, as yyyy-MM. */
export function dhakaMonth(): string {
  return dhakaToday().slice(0, 7);
}

/**
 * Whether the filter is asking for something impossible -- a range that ends before it starts, or
 * a mode with nothing filled in yet.
 *
 * A half-filled filter is not an error: somebody who has chosen "Monthly" and not yet picked the
 * month should see everything, not nothing, so `incomplete` is reported separately from `invalid`.
 */
export function periodState(f: PeriodFilter): { invalid: boolean; incomplete: boolean } {
  if (f.mode === "range") {
    if (f.from && f.to && f.from > f.to) return { invalid: true, incomplete: false };
    return { invalid: false, incomplete: !f.from && !f.to };
  }
  if (f.mode === "month") return { invalid: false, incomplete: !f.month };
  if (f.mode === "year") return { invalid: false, incomplete: !f.year };
  if (f.mode === "day") return { invalid: false, incomplete: !f.day };
  return { invalid: false, incomplete: false };
}

/**
 * Whether one timestamp falls inside the filter.
 *
 * An incomplete filter matches everything, so the screen stays populated while somebody is still
 * choosing. An invalid one matches nothing, because there is no honest answer to give.
 */
export function periodMatches(f: PeriodFilter, value: string | Date | null): boolean {
  if (f.mode === "all") return true;
  const { invalid, incomplete } = periodState(f);
  if (invalid) return false;
  if (incomplete) return true;
  if (!value) return false;
  const day = dhakaDay(value);
  switch (f.mode) {
    case "month":
      return day.slice(0, 7) === f.month;
    case "year":
      return day.slice(0, 4) === f.year;
    case "day":
      return day === f.day;
    case "range":
      return (!f.from || day >= f.from) && (!f.to || day <= f.to);
    default:
      return true;
  }
}

/**
 * The first and last day the filter covers, as yyyy-MM-dd, for a server query that wants bounds
 * rather than a predicate. Null at either end means unbounded.
 */
export function periodBounds(f: PeriodFilter): { from: string | null; to: string | null } {
  const { invalid, incomplete } = periodState(f);
  if (f.mode === "all" || invalid || incomplete) return { from: null, to: null };
  switch (f.mode) {
    case "month":
      return { from: `${f.month}-01`, to: lastDayOfMonth(f.month) };
    case "year":
      return { from: `${f.year}-01-01`, to: `${f.year}-12-31` };
    case "day":
      return { from: f.day, to: f.day };
    case "range":
      return { from: f.from || null, to: f.to || null };
    default:
      return { from: null, to: null };
  }
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // Day zero of the next month is the last day of this one, and the Date constructor rolls
  // December over into January for us.
  const last = new Date(Date.UTC(y!, m!, 0));
  return last.toISOString().slice(0, 10);
}

/** What the filter is currently showing, in words, for the line above a table. */
export function periodLabel(f: PeriodFilter): string {
  const { invalid, incomplete } = periodState(f);
  if (f.mode === "all") return "All dates";
  if (invalid) return "End date is before the start date";
  if (incomplete) return "All dates";
  switch (f.mode) {
    case "month": {
      const [y, m] = f.month.split("-").map(Number);
      return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-GB", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      });
    }
    case "year":
      return f.year;
    case "day":
      return f.day;
    case "range":
      return f.from && f.to ? `${f.from} to ${f.to}` : f.from ? `From ${f.from}` : `Up to ${f.to}`;
    default:
      return "All dates";
  }
}

/** The years a set of records spans, newest first, for the Yearly dropdown. */
export function yearsIn(values: (string | Date | null | undefined)[]): string[] {
  const years = new Set<string>();
  for (const v of values) if (v) years.add(dhakaDay(v).slice(0, 4));
  return [...years].sort().reverse();
}
