import { Link } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME, ROLE_HOME_LABEL, roleLabel } from "@/lib/auth-constants";

/** First letters of the first and last word, which is what an avatar shows when there's no photo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

/**
 * The account menu for the public header. The trigger is the avatar alone -- who is signed in
 * belongs inside a menu someone opens, not written across the page -- and it opens onto the same
 * three places every role has: their own workspace, Profile, and Privacy & security.
 *
 * Renders nothing when nobody is signed in, so the header can show Sign In and Sign Up instead.
 */
export function AccountMenu() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="size-9 rounded-full p-0"
          aria-label="Your account"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user.fullName)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.companyMail}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.employeeId} · {roleLabel(user.activeRole)}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={ROLE_HOME[user.activeRole]}>
            <LayoutDashboard className="size-4" />
            {ROLE_HOME_LABEL[user.activeRole]}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/profile">
            <User className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app/security">
            <ShieldCheck className="size-4" />
            Privacy &amp; security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
