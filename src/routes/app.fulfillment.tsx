import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { OrderStatusBadge } from "@/components/status-badge";
import { useAppData } from "@/context/app-data";
import { litres } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  Confirmed: "Packed",
  Packed: "OutForDelivery",
  OutForDelivery: "Delivered",
};

const nextLabel: Partial<Record<OrderStatus, string>> = {
  Confirmed: "Mark packed",
  Packed: "Mark out for delivery",
  OutForDelivery: "Mark delivered",
};

export const Route = createFileRoute("/app/fulfillment")({
  head: () => ({
    meta: [
      { title: "Fulfillment — Anwar Fresh" },
      { name: "description", content: "Orders grouped by delivery point with one-tap status updates." },
      { property: "og:title", content: "Fulfillment — Anwar Fresh" },
      { property: "og:description", content: "Orders grouped by delivery point with one-tap status updates." },
    ],
  }),
  component: Fulfillment,
});

function Fulfillment() {
  const {
    orders,
    employees,
    deliveryPoints,
    activeBatch,
    updateOrder,
    addDeliveryRecord,
  } = useAppData();

  const todays = orders.filter(
    (o) =>
      (!activeBatch || o.batchNo === activeBatch.batchNo) &&
      o.status !== "Cancelled" &&
      o.status !== "Pending",
  );

  function advance(order: Order) {
    const next = nextStatus[order.status];
    if (!next) return;
    updateOrder(order.orderNo, { status: next }, "Fulfillment update");
    if (next === "Delivered") {
      const emp = employees.find((e) => e.id === order.employeeId);
      const point = deliveryPoints.find((p) => p.id === order.deliveryPointId);
      addDeliveryRecord({
        orderNo: order.orderNo,
        recipientName: emp?.name ?? order.employeeId,
        contact: emp?.phone ?? "—",
        dateTime: new Date().toISOString(),
        location: point?.name ?? "—",
        floor: point?.id === "dp-gulshan" ? "Ground floor lobby" : "Factory store",
        quantity: order.litres,
        receiverName: emp?.name ?? order.employeeId,
        remarks: "Handed over at counter",
      });
    }
    toast.success(`${order.orderNo} → ${next === "OutForDelivery" ? "out for delivery" : next.toLowerCase()}`);
  }

  const groups = deliveryPoints
    .map((p) => ({ point: p, list: todays.filter((o) => o.deliveryPointId === p.id) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Fulfillment"
        description="Pack, dispatch and hand over — grouped by collection point."
      />

      {groups.length === 0 ? (
        <EmptyState title="Nothing to fulfil" hint="Orders appear here once employees book." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map(({ point, list }) => {
            const pending = list.filter((o) => o.status !== "Delivered" && o.status !== "NotCollected");
            return (
              <section key={point.id} className="rounded-xl border border-border bg-card">
                <header className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="font-display text-lg font-bold">{point.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {list.length} orders · {litres(list.reduce((s, o) => s + o.litres, 0))}
                    </p>
                  </div>
                  <span className="rounded-md bg-secondary px-3 py-1 text-sm text-primary-deep">
                    {pending.length} pending
                  </span>
                </header>
                <ul className="divide-y divide-border/60">
                  {list.map((o) => {
                    const emp = employees.find((e) => e.id === o.employeeId);
                    return (
                      <motion.li
                        key={o.orderNo}
                        layout
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{emp?.name ?? o.employeeId}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.orderNo} · {litres(o.litres)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <OrderStatusBadge status={o.status} />
                          {nextStatus[o.status] ? (
                            <Button size="sm" onClick={() => advance(o)}>
                              {nextLabel[o.status]}
                            </Button>
                          ) : null}
                          {o.status === "OutForDelivery" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                updateOrder(o.orderNo, { status: "NotCollected" }, "Not collected at counter");
                                toast.message(`${o.orderNo} marked not collected`);
                              }}
                            >
                              Not collected
                            </Button>
                          ) : null}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
