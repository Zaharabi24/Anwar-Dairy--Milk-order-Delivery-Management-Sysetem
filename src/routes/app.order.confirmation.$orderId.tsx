import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/context/app-data";
import { dateShort, dateTime, taka } from "@/lib/format";

export const Route = createFileRoute("/app/order/confirmation/$orderId")({
  head: () => ({
    meta: [
      { title: "Order confirmed — Anwar Organic" },
      { name: "description", content: "Your order code, summary and collection instructions." },
    ],
  }),
  component: ConfirmationPage,
});

function QrBlock({ seed }: { seed: string }) {
  const cells = Array.from({ length: 144 }, (_, i) => {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    return code % 3 === 0;
  });
  return (
    <div className="grid w-32 grid-cols-12 gap-px rounded-md border border-border bg-card p-2">
      {cells.map((on, i) => (
        <span key={i} className={`aspect-square ${on ? "bg-foreground" : "bg-transparent"}`} />
      ))}
    </div>
  );
}

function ConfirmationPage() {
  const { orderId } = Route.useParams();
  const { orders, batches, deliveryPoints, currentEmployee } = useAppData();
  const order = orders.find((o) => o.orderNo === orderId);

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Order not found" />
        <EmptyState
          title={`We couldn't find order ${orderId}`}
          hint="It may have been cancelled. Your order list has everything that's active."
        />
      </div>
    );
  }

  const batch = batches.find((b) => b.batchNo === order.batchNo);
  const point = deliveryPoints.find((d) => d.id === order.deliveryPointId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check className="size-7" />
        </motion.div>
        <h1 className="mt-5 text-2xl font-bold">Your order is placed</h1>
        <p className="mt-1 text-muted-foreground">
          Waiting for the head office coordinator to confirm your request.
        </p>

        <div className="mt-6 flex flex-col items-center gap-4">
          <QrBlock seed={order.orderNo} />
          <p className="font-display text-2xl font-extrabold tracking-wide">{order.orderNo}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Payment &amp; collection</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">Payment Method:</dt>
            <dd className="font-medium">{order.paymentMethod ?? "Cash"}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">Place Order:</dt>
            <dd className="font-medium">{point?.name ?? "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-muted-foreground">Collection Time:</dt>
            <dd className="font-medium">{order.collectionTime ?? batch?.deliveryWindow ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Order summary</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{currentEmployee.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="font-medium">{order.litres} L</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Amount payable</dt>
            <dd className="font-medium">{taka(order.amount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Booked at</dt>
            <dd className="font-medium">{dateTime(order.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Collect on</dt>
            <dd className="font-medium">
              {batch ? `${dateShort(batch.deliveryDate)}, ${batch.deliveryWindow}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Collection point</dt>
            <dd className="font-medium">{point?.name}</dd>
          </div>
        </dl>
        <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
          {point?.address}
        </p>
        <div className="mt-5">
          <Button asChild size="lg">
            <Link to="/app/my-orders">View My Orders</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
