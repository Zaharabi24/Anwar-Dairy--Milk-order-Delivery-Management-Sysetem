import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { Matcher } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sameDay, startOfDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * A labelled date picker: the chosen date on a button, a month calendar in a popover.
 *
 * The range a date may fall in is expressed as `earliest`/`latest` rather than as a validation
 * message, so a day that can't be chosen simply isn't clickable. Saying no before the click is
 * kinder than saying it after, and it means the caller's rules and what the calendar shows can't
 * drift apart.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  earliest,
  latest,
  disabled,
  hint,
  error,
  className,
}: {
  id: string;
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  /** First selectable day, inclusive. */
  earliest?: Date;
  /** Last selectable day, inclusive. */
  latest?: Date;
  /** Anything else that can't be picked, e.g. a weekend the dairy doesn't deliver on. */
  disabled?: Matcher | Matcher[];
  hint?: string;
  error?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());
  const outOfRange: Matcher[] = [
    ...(earliest ? [{ before: startOfDay(earliest) }] : []),
    ...(latest ? [{ after: startOfDay(latest) }] : []),
  ];
  const blocked = [
    ...outOfRange,
    ...(Array.isArray(disabled) ? disabled : disabled ? [disabled] : []),
  ];
  const todayPickable =
    (!earliest || startOfDay(earliest) <= today) && (!latest || startOfDay(latest) >= today);

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("w-full justify-start gap-2 font-normal", error && "border-destructive")}
          >
            <CalendarDays className="size-4 shrink-0 opacity-70" />
            <span className="truncate">{LONG.format(value)}</span>
            {sameDay(value, today) ? (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">Today</span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value}
            captionLayout="dropdown"
            {...(earliest ? { startMonth: startOfDay(earliest) } : {})}
            {...(latest ? { endMonth: startOfDay(latest) } : {})}
            disabled={blocked}
            onSelect={(date) => {
              if (!date) return;
              onChange(startOfDay(date));
              setOpen(false);
            }}
          />
          {todayPickable ? (
            <div className="border-t border-border p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange(today);
                  setOpen(false);
                }}
              >
                Today
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
