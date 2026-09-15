import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bell, BellRing, CircleX, ClipboardList, PackageCheck, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { useAppData } from "@/context/app-data";
import { dateTime } from "@/lib/format";
import type { NotificationKind } from "@/lib/types";

const icons: Record<NotificationKind, typeof Bell> = {
  BatchPublished: BellRing,
  CutoffReminder: Bell,
  OrderRequest: ClipboardList,
  CancellationRequested: ClipboardList,
  CancellationApproved: CircleX,
  CancellationRejected: PackageCheck,
  OrderConfirmed: PackageCheck,
  OrderCancelled: CircleX,
  OutForDelivery: Truck,
  PaymentDue: Wallet,
};

export const Route = createFileRoute("/app/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Anwar Organic" },
      {
        name: "description",
        content: "Batch publications, cut-off reminders, order updates and payment alerts in one feed.",
      },
      { property: "og:title", content: "Notifications — Anwar Organic" },
      {
        property: "og:description",
        content: "Batch publications, cut-off reminders, order updates and payment alerts in one feed.",
      },
    ],
  }),
  component: Notifications,
});

function Notifications() {
  const { notifications, markNotificationsRead, unreadCount } = useAppData();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Every automated alert the system raises across the daily milk cycle."
        action={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={markNotificationsRead}>
              Mark all read
            </Button>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState title="No notifications yet" hint="Alerts appear as batches and orders move." />
      ) : (
        <ul className="space-y-3">
          {notifications.map((n, i) => {
            const Icon = icons[n.kind];
            return (
              <motion.li
                key={n.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.24) }}
                className={`flex gap-4 rounded-xl border bg-card p-4 ${
                  n.read ? "border-border" : "border-primary/40 bg-secondary/40"
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary-deep">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {dateTime(n.timestamp)} · {n.audience === "All" ? "All staff" : n.audience}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
