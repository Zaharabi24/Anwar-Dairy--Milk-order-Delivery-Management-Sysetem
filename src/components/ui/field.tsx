import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A labelled form field: label, control, and one line underneath saying either what to put in it
 * or what went wrong.
 *
 * There is one of these so that every field in the app has the same vertical rhythm. Before it,
 * the same arrangement was written out by hand on each page and had drifted -- some labels sat 8px
 * above their control and some 4px, some hints were `text-xs text-muted-foreground` and others
 * `text-sm`, and an error under one field pushed the row taller while the field beside it stayed
 * put. Row heights that differ by a few pixels are exactly what makes a form look unconsidered.
 *
 * The label is tied to the control by `htmlFor`, so clicking it focuses the field and a screen
 * reader reads the two together. An `error` colours the message and marks the control
 * `aria-invalid`, which is what the control styles key their error appearance off -- so a field
 * that reads as invalid and a field that looks invalid can't come apart.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  labelClassName,
  children,
}: {
  label: React.ReactNode;
  /** The control's id. Given one, the label focuses it on click. */
  htmlFor?: string;
  /** Shown under the field when there is no error. */
  hint?: React.ReactNode;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
}) {
  const described = htmlFor ? `${htmlFor}-description` : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor} className={cn("flex items-center gap-1", labelClassName)}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {/* The control is given the invalid flag and the message's id without the caller having to
          wire either one up by hand on every field. */}
      {React.isValidElement(children) && (error || described)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            ...(error ? { "aria-invalid": true } : {}),
            ...(described && (hint || error) ? { "aria-describedby": described } : {}),
          })
        : children}
      {error ? (
        <p id={described} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={described} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A row of fields that wraps into a column on a narrow screen.
 *
 * `items-start` is the point of it: without that, a field carrying an error message stretches its
 * neighbours to match and the controls in the row stop lining up.
 */
export function FieldRow({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  // Written out rather than built from `columns`, so Tailwind can find the class names.
  const cols = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];
  return <div className={cn("grid items-start gap-4", cols, className)}>{children}</div>;
}

/**
 * A toggle presented as a whole row: the label and its explanation on the left, the switch on the
 * right, the whole thing clickable.
 *
 * A switch beside a bare label is the one control that can't be laid out like the others -- it
 * belongs at the end of the line it describes, not underneath it.
 */
export function SwitchField({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  /** The Switch itself. */
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border border-input bg-background px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <Label htmlFor={htmlFor} className="block cursor-pointer">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * The bar of search boxes and dropdowns above a table.
 *
 * Filters are a row of controls of different kinds, and they were laid out by hand on each page
 * with whatever widths happened to look right -- w-36 next to w-60 next to a max-w-xs search box,
 * so no two filter bars on the platform lined up. Here they share one grid: every control the same
 * width, the same gaps, wrapping the same way.
 *
 * `items-start`, for the same reason FieldRow uses it. Bottom-aligning works only while every
 * field is exactly a label and a control; the moment one carries a hint or an error it grows
 * taller, and the whole row drops to meet its bottom edge -- so on Reports, a two-line note under
 * Batch No. pushed Employee Name and Batch Range a hint's height below their own labels. Aligned
 * from the top, the labels sit on one line and the controls on the next, and a field with
 * something to say underneath simply says it without moving its neighbours.
 */
export function FilterBar({
  columns = 4,
  className,
  children,
}: {
  /** Fields across the row on a wide screen. Below that they fall into two, then one. */
  columns?: 4 | 5;
  className?: string;
  children: React.ReactNode;
}) {
  // Written out rather than built from `columns`, so Tailwind can find the class names.
  const cols = columns === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <div
      className={cn(
        "grid items-start gap-3 rounded-xl border border-border bg-card p-4",
        "sm:grid-cols-2",
        cols,
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A compact row of filters above a table: a search box and a few dropdowns, no labels.
 *
 * These were written by hand on each page as a flex row with whatever widths looked right at the
 * time -- `w-36` beside `w-60` beside a `max-w-xs` search box -- so no two filter rows on the
 * platform were the same, and within a row the controls stepped up and down in width for no
 * reason a reader could see. Here they get one set of widths, one gap, and one wrapping rule.
 *
 * Unlabelled on purpose: a filter says what it is through its placeholder and its current value,
 * and a row of labels above a table competes with the table's own headings. Fields that take
 * something *into* the system are labelled; these narrow what is already on screen.
 */
export function FilterRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
    </div>
  );
}
