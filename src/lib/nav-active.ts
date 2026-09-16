/**
 * Which navigation item the current URL belongs to.
 *
 * Exactly one item is ever active: the one whose path is the *longest* match for the URL. Link's
 * own `data-status` can't be used for this because it matches loosely, so "/app" -- Home -- counts
 * as a match for every page beneath it and stays lit next to whatever the person actually opened.
 * "/app/operator" does the same to its own children.
 *
 * Deciding it from the URL rather than from clicks means it is right however the page was reached:
 * a click, a refresh, a pasted address, or the browser's back and forward buttons.
 */
export function activeNavPath(pathname: string, paths: readonly string[]): string | null {
  let best: string | null = null;
  for (const path of paths) {
    if (!isUnder(pathname, path)) continue;
    if (best === null || trim(path).length > trim(best).length) best = path;
  }
  return best;
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
