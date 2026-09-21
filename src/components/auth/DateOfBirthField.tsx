import { useState, useMemo, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronUp, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDisplay = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`; // mm/dd/yyyy
};
const parseDisplay = (txt: string): string | null => {
  const m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    d.getFullYear() !== Number(yyyy) ||
    d.getMonth() !== Number(mm) - 1 ||
    d.getDate() !== Number(dd)
  )
    return null;
  return toISO(d);
};
// Parse yyyy-mm-dd as a local date (new Date("yyyy-mm-dd") would be UTC midnight).
const fromISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1990, (m ?? 1) - 1, d ?? 1);
};

interface Props {
  id: string;
  label: string;
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  onBlur?: () => void;
  error?: string | null | undefined;
  helperText?: string;
  required?: boolean;
}

export function DateOfBirthField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  required,
}: Props) {
  const today = new Date();
  const MAX_YEAR = today.getFullYear();
  const MIN_YEAR = MAX_YEAR - 80;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">("days");
  const [text, setText] = useState(toDisplay(value));
  const [cursor, setCursor] = useState<Date>(
    value ? fromISO(value) : new Date(MAX_YEAR - 30, 0, 1),
  );
  const yearListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  useEffect(() => {
    if (view === "months" && yearListRef.current) {
      const el = yearListRef.current.querySelector<HTMLElement>("[data-active='true']");
      el?.scrollIntoView({ block: "center" });
    }
  }, [view]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = MAX_YEAR; y >= MIN_YEAR; y--) out.push(y);
    return out;
  }, [MAX_YEAR, MIN_YEAR]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const isDisabled = (d: Date) => d > today || d.getFullYear() < MIN_YEAR;

  const commit = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setText(toDisplay(toISO(d)));
    setOpen(false);
    setView("days");
  };

  const handleType = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(out);
    const iso = parseDisplay(out);
    if (iso) {
      onChange(iso);
      setCursor(fromISO(iso));
    } else if (out === "") onChange("");
  };

  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setView("days");
        }}
      >
        <div className="relative">
          <Input
            id={id}
            value={text}
            onChange={(e) => handleType(e.target.value)}
            onBlur={() => {
              if (text && !parseDisplay(text)) setText(toDisplay(value));
              onBlur?.();
            }}
            placeholder="mm/dd/yyyy"
            inputMode="numeric"
            aria-invalid={!!error}
            className={cn("pr-10", error && "border-destructive")}
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open date picker"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </div>

        <PopoverContent align="start" className="w-[280px] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <button
              type="button"
              onClick={() => setView(view === "days" ? "months" : "days")}
              className="flex items-center gap-1 text-sm font-semibold transition-colors hover:text-primary"
            >
              {MONTHS_LONG[cursor.getMonth()]} {cursor.getFullYear()}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {view === "days" && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {view === "months" && (
            <div ref={yearListRef} className="max-h-[260px] overflow-y-auto">
              {years.map((y) => {
                const active = y === cursor.getFullYear();
                return (
                  <div key={y} data-active={active}>
                    <div
                      className={cn(
                        "cursor-pointer bg-muted/60 px-3 py-1.5 text-sm font-medium",
                        active && "bg-muted",
                      )}
                      onClick={() => setCursor(new Date(y, cursor.getMonth(), 1))}
                    >
                      {y}
                    </div>
                    {active && (
                      <div className="grid grid-cols-4 gap-1 p-2">
                        {MONTHS_SHORT.map((m, i) => {
                          const disabled =
                            new Date(y, i, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
                          const sel = i === cursor.getMonth();
                          return (
                            <button
                              key={m}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                setCursor(new Date(y, i, 1));
                                setView("days");
                              }}
                              className={cn(
                                "h-8 rounded-md text-sm transition-colors",
                                sel
                                  ? "bg-primary font-semibold text-primary-foreground"
                                  : "hover:bg-secondary",
                                disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                              )}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === "days" && (
            <>
              <div className="grid grid-cols-7 px-2 pt-2">
                {DOW.map((d) => (
                  <div
                    key={d}
                    className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
                {grid.map((d, i) => {
                  const outside = d.getMonth() !== cursor.getMonth();
                  const selected = value && toISO(d) === value;
                  const isToday = toISO(d) === toISO(today);
                  const disabled = isDisabled(d);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => commit(d)}
                      className={cn(
                        "mx-auto h-8 w-8 rounded-md text-sm transition-colors",
                        outside && "text-muted-foreground/50",
                        !selected && !disabled && "hover:bg-secondary",
                        isToday && !selected && "ring-1 ring-primary/40",
                        selected && "bg-primary font-semibold text-primary-foreground",
                        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setText("");
                    setOpen(false);
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCursor(new Date());
                    commit(new Date());
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Today
                </button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {helperText && !error && <p className="text-xs text-muted-foreground">{helperText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
