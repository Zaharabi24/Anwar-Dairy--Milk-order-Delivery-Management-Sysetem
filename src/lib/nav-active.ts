/**
 * Which navigation item the current URL belongs to.
 *
 * At most one item is ever active: the one whose path is the *longest* match for the URL. Link's
 * own `data-status` can't be used for this because it matches loosely, so "/app" -- Home -- counts
 * as a match for every page beneath it and stays lit next to whatever the person actually opened.
 * "/app/operator" does the same to its own children.
 *
 * An item can ask to match only its own address. Home does: it is a page, the dashboard, not a
 * section that owns everything under it. Without that it wins by default on any page no menu item
 * covers -- an order's confirmation, say -- and the sidebar points somewhere the reader isn't.
 * Nothing highlighted is the honest answer there; a wrong thing highlighted is not.
 *
 * Deciding it from the URL rather than from clicks means it is right however the page was reached:
 * a click, a refresh, a pasted address, or the browser's back and forward buttons.
 */
export interface NavTarget {
  /** The item's own address, and what is returned when it wins. */
  to: string;
  /**
   * What to match on, when that is wider than the item's address. Booking is the case: an order's
   * confirmation lives at /app/order/confirmation/..., which is not beneath /app/order/new, so
   * without this the step after "Book milk" belongs to no menu item at all.
   */
  match?: string;
  /** Match that address only, never the pages beneath it. */
  exact?: boolean;
}

export function activeNavPath(
  pathname: string,
  targets: readonly (NavTarget | string)[],
): string | null {
  let best: { to: string; length: number } | null = null;
  for (const target of targets) {
    const item = typeof target === "string" ? { to: target } : target;
    const base = item.match ?? item.to;
    if (!(item.exact ? isSame(pathname, base) : isUnder(pathname, base))) continue;
    const length = trim(base).length;
    if (best === null || length > best.length) best = { to: item.to, length };
  }
  return best?.to ?? null;
}

/** The same place, give or take a trailing slash. */
function isSame(pathname: string, path: string): boolean {
  return trim(pathname) === trim(path);
}

/**
 * A URL belongs to a path when it is that path, or sits beneath it at a segment boundary. The
 * boundary matters: "/app/admin/accounts" must not claim "/app/admin/account-requests".
 */
function isUnder(pathname: string, path: string): boolean {
  const url = trim(pathname);
  const base = trim(path);
  if (base === "") return url === "";
  return url === base || url.startsWith(`${base}/`);
}

/** Without a trailing slash, so "/app/offer" and "/app/offer/" are the same place. */
const trim = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
