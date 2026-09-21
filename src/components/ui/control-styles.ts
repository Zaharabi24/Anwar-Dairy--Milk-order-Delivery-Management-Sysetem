// The one description of what a form control looks like.
//
// Input, Textarea and the Select trigger all read from here, so a text box and a dropdown sitting
// next to each other are the same height, the same corner radius, and light up the same way when
// focused. Before this each of them carried its own copy and they had drifted: the input rendered
// 16px text on a phone while the select rendered 14px, and the focus ring was a hairline on one
// and absent on the other.
//
// Written out in full rather than composed at runtime: Tailwind finds class names by reading the
// source, so a class assembled from pieces is a class that never gets generated.

/** Height, padding, border, and the type inside it. 40px is the comfortable end of the range. */
export const CONTROL_BASE =
  "w-full rounded-md border border-input bg-background text-sm shadow-sm " +
  "transition-[color,box-shadow,border-color] placeholder:text-muted-foreground";

/**
 * Focus, disabled and invalid, identical on every control.
 *
 * The ring is two pixels of the brand colour at a quarter strength with the border going solid —
 * visible enough to find with a keyboard, quiet enough to sit in a dense table. `aria-invalid` is
 * what drives the error colour, so a field that reads as invalid to a screen reader is the same
 * field that looks invalid.
 */
export const CONTROL_STATES =
  "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 " +
  "focus-visible:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 " +
  "aria-[invalid=true]:ring-destructive/20";

/** A single-line control: input, and the select trigger. */
export const CONTROL_SINGLE_LINE = `flex h-10 items-center px-3 py-2 ${CONTROL_BASE} ${CONTROL_STATES}`;

/** A multi-line control. Same shape, with the height given back to the text. */
export const CONTROL_MULTI_LINE = `flex min-h-20 px-3 py-2 ${CONTROL_BASE} ${CONTROL_STATES}`;

/**
 * The browser's own picker button inside a date or time input.
 *
 * Left alone it sits hard against the right edge at full contrast, and in dark mode it stays a
 * black glyph on a dark field.
 */
export const NATIVE_PICKER_ICON =
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
  "[&::-webkit-calendar-picker-indicator]:opacity-60 " +
  "[&::-webkit-calendar-picker-indicator]:hover:opacity-100 " +
  "dark:[&::-webkit-calendar-picker-indicator]:invert";

/** The search box in a FilterRow. Wider than the dropdowns, because names are longer than states. */
export const FILTER_SEARCH = "w-full sm:w-72";

/** A dropdown in a FilterRow. One width, so a row of them is a row rather than a staircase. */
export const FILTER_CONTROL = "w-full sm:w-52";
