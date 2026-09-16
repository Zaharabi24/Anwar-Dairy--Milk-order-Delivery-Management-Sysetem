import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AppDataProvider, useAppData } from "@/context/app-data";
import { getAppSnapshot } from "@/functions/app-data.functions";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME, isStaffRole, type Portal, type RoleValue } from "@/lib/auth-constants";
import { PORTAL_SIGN_IN } from "@/lib/portal-guard";
import { timeShort } from "@/lib/format";
import logoUrl from "@/assets/anwar-organic-logo.png";
import type { Role } from "@/lib/types";

export const Route = createFileRoute("/app")({
  // The session cookie travels with the SSR request, so this guard works on the server.
  beforeLoad: ({ context, location }) => {
    if (!context.auth) {
      // Staff areas send people to the staff portal; everything else to the employee sign-in.
      const allowed = rolesFor(location.pathname);
      const staffArea = !!allowed && !allowed.includes("employee");
      throw redirect({
        to: staffArea ? "/staff/admin" : "/login",
        search: { redirect: location.href },
      });
    }
  },
  loader: () => getAppSnapshot(),
  component: AppLayout,
});

/** `section` starts a labelled group in the sidebar (used for the Super Admin's combined menu). */
type NavItem = { label: string; to: string; section?: string };

const commonTail: NavItem[] = [{ label: "Notifications", to: "/app/notifications" }];

const reportsNav: NavItem = { label: "Reports", to: "/app/reports" };

const systemAdminPages: NavItem[] = [
  { label: "Account Requests", to: "/app/admin/account-requests" },
  { label: "Accounts", to: "/app/admin/accounts" },
  { label: "Password Resets", to: "/app/admin/password-resets" },
  { label: "Account audit", to: "/app/admin/account-audit" },
  { label: "Employees", to: "/app/admin/employees" },
  { label: "Delivery points", to: "/app/admin/delivery-points" },
  { label: "Settings", to: "/app/admin/settings" },
  { label: "Audit log", to: "/app/admin/audit-log" },
];

const operatorPages: NavItem[] = [
  { label: "Dashboard", to: "/app/operator" },
  { label: "New batch", to: "/app/operator/new-batch" },
  { label: "Publish", to: "/app/operator/publish" },
];

const coordinatorPages: NavItem[] = [
  { label: "Orders", to: "/app/orders" },
  { label: "Fulfillment", to: "/app/fulfillment" },
  { label: "Coupons", to: "/app/coupons" },
  { label: "Collections", to: "/app/collections" },
];

const section = (name: string, items: NavItem[]): NavItem[] =>
  items.map((item, i) => (i === 0 ? { ...item, section: name } : item));

const navByRole: Record<Role, NavItem[]> = {
  Employee: [
    { label: "Today's offer", to: "/app/offer" },
    { label: "Book milk", to: "/app/order/new" },
    { label: "My orders", to: "/app/my-orders" },
  ],
  "Factory Operator": [...operatorPages, reportsNav],
  "Head Office Coordinator": [...coordinatorPages, reportsNav],
  "System Admin": [...systemAdminPages, reportsNav],
  // Super Admin oversees every staff area: its own team page, plus the System Admin,
  // Factory Operator and Head Office Coordinator workspaces.
  "Super Admin": [
    ...section("Super Admin", [{ label: "Team & invitations", to: "/app/admin/team" }]),
    ...section("System Admin", systemAdminPages),
    ...section("Factory Operator", operatorPages),
    ...section("Head Office Coordinator", coordinatorPages),
    ...section("Insights", [reportsNav]),
  ],
};

// Which active roles each area is for. This is UX only — the server checks permissions on every call.
const OPERATOR: RoleValue[] = ["factory_operator", "super_admin"];
const COORDINATOR: RoleValue[] = ["head_office_coordinator", "super_admin"];
const ADMINS: RoleValue[] = ["system_admin", "super_admin"];
const routeRoles: Array<[prefix: string, roles: RoleValue[]]> = [
  ["/app/admin/team", ["super_admin"]],
  ["/app/admin", ADMINS],
  ["/app/operator", OPERATOR],
  ["/app/orders", COORDINATOR],
  ["/app/fulfillment", COORDINATOR],
  ["/app/coupons", COORDINATOR],
  ["/app/collections", COORDINATOR],
  ["/app/reports", ["factory_operator", "head_office_coordinator", ...ADMINS]],
  ["/app/offer", ["employee"]],
  ["/app/order", ["employee"]],
  ["/app/my-orders", ["employee"]],
];

function rolesFor(pathname: string): RoleValue[] | null {
  const match = routeRoles.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match[1] : null;
}

function AppLayout() {
  const snapshot = Route.useLoaderData();
  return (
    <AppDataProvider initialSnapshot={snapshot}>
      <AppShell />
    </AppDataProvider>
  );
}

/**
 * `wrongPortal` is set when the page belongs to the other front door entirely — an employee-portal
 * session on a staff page, say. Offering that portal's sign-in beats a dead end, because no amount
 * of role switching inside this session can reach the page.
 */
function NotAvailable({ home, wrongPortal }: { home: string; wrongPortal: Portal | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <h1 className="font-display text-xl font-bold">Not available for your role</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {wrongPortal === "staff"
          ? "This page is part of the staff area. Sign in through the staff portal to open it."
          : wrongPortal === "employee"
            ? "This page is part of the employee area. Sign in with an employee account to open it."
            : "This page belongs to a different role. Switch role from the header if you hold it, or go back to your own workspace."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {wrongPortal ? (
          <Button asChild>
            <Link to={PORTAL_SIGN_IN[wrongPortal]} search={{ switch: true, redirect: pathname }}>
              Go to that sign-in
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={wrongPortal ? "outline" : "default"}>
          <Link to={home}>Back to my home</Link>
        </Button>
      </div>
    </div>
  );
}

const linkClass =
  "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:font-medium data-[status=active]:text-primary-deep";

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2">
      <img src={logoUrl} alt="Anwar Organic" width={50} height={48} className="h-12 w-auto" />
      <span className="font-display text-lg font-extrabold">Anwar Organic</span>
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      <Link to="/app" className={linkClass} onClick={onNavigate}>
        Home
      </Link>
      {[...items, ...commonTail].map((item) => (
        <div key={item.to} className="flex flex-col">
          {item.section ? (
            <p className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {item.section}
            </p>
          ) : null}
          <Link to={item.to} className={linkClass} onClick={onNavigate}>
            {item.label}
          </Link>
        </div>
      ))}
    </nav>
  );
}

function AppShell() {
  const { role, roles, setRole, notifications, unreadCount, markNotificationsRead } = useAppData();
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navByRole[role];
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const allowed = rolesFor(pathname);
  const permitted = !allowed || (!!user && allowed.includes(user.activeRole));
  // Which portal owns this page, when the current session can't reach it at all.
  const wrongPortal: Portal | null =
    !allowed || permitted || !user
      ? null
      : !allowed.includes("employee") && user.portal === "employee"
        ? "staff"
        : !allowed.some(isStaffRole) && user.portal === "staff"
          ? "employee"
          : null;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Warm every page this role can reach while the browser is idle, so the
  // first click on any menu item renders with no chunk-loading pause.
  useEffect(() => {
    const targets = ["/app", ...items.map((i) => i.to), ...commonTail.map((i) => i.to)];
    const warm = () => {
      for (const to of targets) void router.preloadRoute({ to }).catch(() => {});
    };
    const idle = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
    if (idle) {
      idle(warm);
      return;
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, [items, router]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6 md:flex">
        <Brand />
        <div className="mt-8">
          <NavLinks items={items} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar px-4 py-6">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
                <div className="mt-8">
                  <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="truncate rounded-md bg-secondary px-3 py-1 text-sm font-medium text-primary-deep">
              {role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {roles.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <span className="hidden sm:inline">Switch role</span>
                    <span className="sm:hidden">Role</span>
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Your roles</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {roles.map((r) => (
                    <DropdownMenuItem key={r} onSelect={() => setRole(r)} disabled={r === role}>
                      {r}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                  className="relative"
                >
                  <Bell className="size-5" />
                  {unreadCount > 0 ? (
                    <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notifications
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary-deep hover:underline"
                      onClick={markNotificationsRead}
                    >
                      Mark all read
                    </button>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="px-2 py-2">
                    <p className="flex items-start justify-between gap-2 text-sm font-medium">
                      <span>{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeShort(n.timestamp)}
                      </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  </div>
                ))}
                {notifications.length === 0 ? (
                  <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nothing yet</p>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/app/notifications">View all notifications</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="max-w-40">
                  <span className="truncate">{user?.fullName}</span>
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user?.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user?.employeeId} · {user?.companyMail}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-5">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {permitted ? (
              <Outlet />
            ) : (
              <NotAvailable
                home={ROLE_HOME[user?.activeRole ?? "employee"]}
                wrongPortal={wrongPortal}
              />
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
