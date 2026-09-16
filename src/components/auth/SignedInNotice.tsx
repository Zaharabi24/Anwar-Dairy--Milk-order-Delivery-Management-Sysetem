import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ROLE_HOME, roleLabel } from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";

/**
 * Shown on a sign-in page when this browser already holds a session — a Super Admin's, say, while
 * an employee is about to sign in. Saying so beats silently sending the new person into someone
 * else's account, and it still offers the one-click way back for whoever was already here.
 */
export function SignedInNotice({ auth }: { auth: AuthUser }) {
  return (
    <Alert className="mb-5">
      <AlertDescription className="space-y-3">
        <p>
          <strong>{auth.fullName}</strong> is signed in on this browser as{" "}
          {roleLabel(auth.activeRole)}. Signing in below replaces that session.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={ROLE_HOME[auth.activeRole]}>Continue as {auth.fullName}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
