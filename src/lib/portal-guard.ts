// Shared rules for the public sign-in pages, so the employee and staff doors behave the same way.
//
// The two portals are separate front doors: `rolesForPortal` already refuses to let a staff
// session act as an employee, and vice versa. The guards have to agree with that. A session only
// counts as "already signed in here" when it belongs to *this* portal — otherwise a signed-in
// Super Admin clicking Sign In is bounced back into their own account and an employee can never
// reach the employee form on that browser.
import { redirect } from "@tanstack/react-router";
import { ROLE_HOME, type Portal } from "./auth-constants";
import type { AuthUser } from "./auth-types";
import { safeRedirect } from "./safe-redirect";

export interface SignInSearch {
  /** Where to go after signing in. Same-site paths only. */
  redirect?: string;
  /** Show the form even when someone is already signed in, so a second person can sign in. */
  switch?: true;
}

/** Validates the search params every sign-in page accepts. */
export function signInSearch(search: Record<string, unknown>): SignInSearch {
  const target = safeRedirect(search["redirect"]);
  const wantsSwitch =
    search["switch"] === true || search["switch"] === "1" || search["switch"] === "true";
  return {
    ...(target ? { redirect: target } : {}),
    ...(wantsSwitch ? { switch: true as const } : {}),
  };
}

/**
 * Sends someone who is already signed in *through this portal* to their home, because the form
 * would have nothing to offer them. Anyone else — a signed-in user from the other portal, or
 * someone who asked to switch — is shown the form.
 */
export function guardSignInPage(
  auth: AuthUser | null | undefined,
  portal: Portal,
  search: SignInSearch,
): void {
  if (search.switch) return;
  if (auth?.portal === portal) throw redirect({ to: ROLE_HOME[auth.activeRole] });
}

/** The sign-in page that owns a portal. */
export const PORTAL_SIGN_IN: Record<Portal, string> = {
  employee: "/login",
  staff: "/staff/admin",
};
