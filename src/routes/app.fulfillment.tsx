import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { orderStatusLabels } from "@/lib/order-status";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useAppData } from "@/context/app-data";
import { litres } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

/**
 * What this screen can set an order to.
 *
 * Packed and Delivered are the two steps of a counter handover. "Not collected" is here because
 * it is the only way to close an order nobody came for, and the reports reconcile on it -- it used
 * to be a separate button that only appeared once an order was out for delivery, which this
 * screen no longer routes through.
 */
const SETTABLE: OrderStatus[] = ["Packed", "Delivered", "NotCollected"];

export const Route = createFileRoute("/app/fulfillment")({
  head: () => ({
    meta: [
      { title: "Fulfillment — Anwar Organic" },
      {
        name: "description",
        content: "Orders grouped by delivery point with one-tap status updates.",
      },
      { property: "og:title", content: "Fulfillment — Anwar Organic" },
      {
        property: "og:description",
        content: "Orders grouped by delivery point with one-tap status updates.",
      },
    ],
  }),
  component: Fulfillment,
});

function Fulfillment() {
  const { orders, employees, deliveryPoints, activeBatch, updateOrder, addDeliveryRecord } =
    useAppData();

  const todays = orders.filter(
    (o) =>
      (!activeBatch || o.batchNo === activeBatch.batchNo) &&
      o.status !== "Cancelled" &&
      o.status !== "Pending",
  );

  function setStatus(order: Order, next: OrderStatus) {
    if (next === order.status) return;
    updateOrder(order.orderNo, { status: next }, "Fulfillment update");
    // A handover is a record in its own right, so it is written the moment one is declared.
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
    toast.success(`${order.orderNo} → ${orderStatusLabels[next].toLowerCase()}`);
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
            const pending = list.filter(
              (o) => o.status !== "Delivered" && o.status !== "NotCollected",
            );
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
                        <StatusSelect order={o} onChange={(next) => setStatus(o, next)} />
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

/**
 * The order's status, as a control rather than a label. The current value is always offered even
 * when it isn't one this screen sets -- a Confirmed order has to show as Confirmed -- but it is
 * disabled, because an order can move forward from here, not back.
 */
function StatusSelect({
  order,
  onChange,
}: {
  order: Order;
  onChange: (next: OrderStatus) => void;
}) {
  const options: OrderStatus[] = SETTABLE.includes(order.status)
    ? SETTABLE
    : [order.status, ...SETTABLE];

  // What is in the field is what is stored -- the change is written the moment it is picked --
  // so the saved status is shown in the brand green to say so at a glance. "Not collected" is the
  // exception: it is saved too, but it is an order nobody came for, and colouring that like a
  // success would bury the one row on the page someone has to do something about.
  const tone =
    order.status === "NotCollected"
      ? "border-destructive/50 text-destructive"
      : "border-primary/50 text-primary-deep";

  return (
    <Select value={order.status} onValueChange={(v) => onChange(v as OrderStatus)}>
      <SelectTrigger
        className={cn("w-44 font-medium", tone)}
        aria-label={`Status for order ${order.orderNo}`}
      >
        {/* The label is rendered here rather than through SelectValue, which resolves it from the
            items -- and those live in portalled content the server never renders, so the trigger
            came back empty until the page hydrated. The value is controlled, so this is always
            the order's real status. */}
        <span>{orderStatusLabels[order.status]}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((status) => (
          <SelectItem key={status} value={status} disabled={!SETTABLE.includes(status)}>
            {orderStatusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
