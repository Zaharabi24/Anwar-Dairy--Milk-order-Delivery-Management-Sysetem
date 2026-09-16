import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { authService } from "@/services/auth-service";
import { ROLE_HOME, type RoleValue } from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * The signed-in user, loaded on the server from the session cookie in the root
 * route's beforeLoad — so it's correct during SSR, not just after hydration.
 */
export function useAuth() {
  const user = useRouteContext({ from: "__root__", select: (c) => c.auth }) as AuthUser | null;
  const router = useRouter();

  const signOut = useCallback(async () => {
    // Only the Super Admin has their own door to go back to; everyone else signs in from the
    // front page.
    const superAdmin = user?.roles.includes("super_admin") ?? false;
    await authService.signOut();
    await router.invalidate();
    await router.navigate({ to: superAdmin ? "/staff/admin" : "/" });
  }, [router, user?.roles]);

  const switchRole = useCallback(
    async (role: RoleValue) => {
      const result = await authService.switchRole(role);
      if (result.ok) {
        await router.invalidate();
        await router.navigate({ to: ROLE_HOME[role] });
      }
      return result;
    },
    [router],
  );

  return {
    user,
    hasRole: (role: RoleValue) => !!user?.roles.includes(role),
    /** Same permission map the server enforces (src/lib/permissions.ts). */
    can: (permission: Permission) => !!user && hasPermission(user.roles, permission),
    isAccountAdmin: () => !!user && hasPermission(user.roles, "employee_accounts.manage"),
    signOut,
    switchRole,
    /** Re-reads the session after sign-in or password set (the server already set the cookie). */
    refresh: () => router.invalidate(),
  };
}
