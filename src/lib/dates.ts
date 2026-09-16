// Day arithmetic for date pickers and the rules around them. Local time throughout: a batch's
// day is the day the dairy is having, not UTC's.

/** Midnight, so two dates can be compared without the time of day getting in the way. */
export const startOfDay = (d: Date) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const addDays = (d: Date, days: number) => {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** A date and a "HH:mm" time, as the instant to store. */
export function atTime(date: Date, time: string): Date {
  const [h, m] = time.split(":");
  const d = startOfDay(date);
  d.setHours(Number(h ?? 0), Number(m ?? 0), 0, 0);
  return d;
}
