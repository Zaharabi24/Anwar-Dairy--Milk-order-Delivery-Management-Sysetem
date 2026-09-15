import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";
import type { Role } from "@/lib/types";

const shortcutsByRole: Record<Role, Array<{ to: string; title: string; body: string }>> = {
  Employee: [
    { to: "/app/offer", title: "Today's offer", body: "See today's batch, rate and litres left." },
    { to: "/app/order/new", title: "Book milk", body: "Reserve your litres before the cutoff." },
    { to: "/app/my-orders", title: "My orders", body: "Track and cancel your bookings." },
  ],
  "Factory Operator": [
    { to: "/app/operator", title: "Dashboard", body: "Produced, booked, delivered and unsold." },
    { to: "/app/operator/new-batch", title: "New batch", body: "Create today's batch." },
    { to: "/app/operator/publish", title: "Review & publish", body: "Open bookings to employees." },
  ],
  "Head Office Coordinator": [
    { to: "/app/orders", title: "Orders", body: "Search, filter and adjust orders." },
    { to: "/app/fulfillment", title: "Fulfillment", body: "Update status per delivery point." },
    { to: "/app/collections", title: "Collections", body: "Record payments and dues." },
    { to: "/app/reports", title: "Reports", body: "Daily reconciliation and trends." },
  ],
  "Super Admin": [
    {
      to: "/app/admin/team",
      title: "Team & invitations",
      body: "Invite operators, coordinators and System Admins.",
    },
    {
      to: "/app/admin/account-requests",
      title: "Account requests",
      body: "Approve employee access.",
    },
    {
      to: "/app/admin/accounts",
      title: "Accounts",
      body: "Suspend, reactivate and reset accounts.",
    },
    {
      to: "/app/admin/settings",
      title: "System Admin",
      body: "Settings, employees and delivery points.",
    },
    {
      to: "/app/operator",
      title: "Factory Operator",
      body: "Batch dashboard, new batch and publish.",
    },
    {
      to: "/app/orders",
      title: "Head Office Coordinator",
      body: "Orders, fulfillment and collections.",
    },
    { to: "/app/reports", title: "Reports", body: "Production, sales and collections trends." },
  ],
  "System Admin": [
    {
      to: "/app/admin/account-requests",
      title: "Account requests",
      body: "Approve who gets access.",
    },
    { to: "/app/admin/accounts", title: "Accounts", body: "Suspend, reactivate and change roles." },
    { to: "/app/admin/employees", title: "Employees", body: "Manage the employee directory." },
    {
      to: "/app/admin/delivery-points",
      title: "Delivery points",
      body: "Manage collection points.",
    },
    { to: "/app/admin/settings", title: "Settings", body: "Defaults for new batches." },
    { to: "/app/admin/audit-log", title: "Audit log", body: "Every change, old and new value." },
  ],
};

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Home — Anwar Organic" },
      { name: "description", content: "Your daily fresh milk workspace at Anwar Agro Farms." },
      { property: "og:title", content: "Home — Anwar Organic" },
      {
        property: "og:description",
        content: "Your daily fresh milk workspace at Anwar Agro Farms.",
      },
    ],
  }),
  component: Hub,
});

function Hub() {
  const { role, currentEmployee, activeBatch, remainingLitres } = useAppData();
  const cards = shortcutsByRole[role];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={
          role === "Employee" ? `Hello, ${currentEmployee.name.split(" ")[0]}` : `Welcome, ${role}`
        }
        description={
          activeBatch
            ? `${activeBatch.batchNo} is ${activeBatch.status.toLowerCase()} — ${remainingLitres(activeBatch.batchNo)} L still available.`
            : "No batch is open right now."
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.to}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
          >
            <Link
              to={c.to}
              className="block h-full rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <p className="font-display text-lg font-bold">{c.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
