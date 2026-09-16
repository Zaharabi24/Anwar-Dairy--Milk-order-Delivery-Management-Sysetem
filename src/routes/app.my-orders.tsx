import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/page-header";
import { OrderStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppData } from "@/context/app-data";
import { countdown, dateShort, dateTime, taka } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/my-orders")({
  head: () => ({
    meta: [
      { title: "My orders — Anwar Organic" },
      {
        name: "description",
        content: "Every order you have placed, with its full history and where to collect it.",
      },
    ],
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const {
    orders,
    currentEmployee,
    batches,
    deliveryPoints,
    requestCancellation,
    cancellationRequestFor,
  } = useAppData();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Order | null>(null);
  const mine = orders
    .filter((o) => o.employeeId === currentEmployee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="My orders"
        description={`Everything you've booked, ${currentEmployee.name.split(" ")[0]}.`}
      />

      {mine.length === 0 ? (
        <EmptyState
          title="You haven't booked any milk yet"
          hint="Today's offer shows what's available right now."
        />
      ) : (
        <div className="space-y-3">
          {mine.map((order) => {
            const batch = batches.find((b) => b.batchNo === order.batchNo);
            const point = deliveryPoints.find((d) => d.id === order.deliveryPointId);
            const request = cancellationRequestFor(order.orderNo);
            const pendingRequest = request?.status === "Pending";
            const canRequest =
              (order.status === "Pending" || order.status === "Confirmed") &&
              !pendingRequest &&
              !!batch &&
              batch.status !== "Closed" &&
              !!countdown(batch.bookingCutoff);
            return (
              <article
                key={order.orderNo}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-bold">{order.orderNo}</span>
                    <OrderStatusBadge status={order.status} />
                    {request?.status === "Rejected" && order.status !== "Cancelled" ? (
                      <span className="inline-flex items-center rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Cancellation rejected
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {order.litres} L · {taka(order.amount)} · {point?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Booked {dateTime(order.createdAt)}
                  </p>
                  {order.status === "Pending" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Waiting for head office to confirm your request.
                    </p>
                  ) : null}
                  {pendingRequest ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your cancellation request has been submitted and is waiting for Head Office
                      Coordinator approval. Request {request.requestNo} ·{" "}
                      {dateTime(request.requestedAt)}
                    </p>
                  ) : null}
                  {request?.status === "Approved" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your order cancellation has been approved.
                      {request.decidedAt ? ` (${dateTime(request.decidedAt)})` : ""}
                    </p>
                  ) : null}
                  {request?.status === "Rejected" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your cancellation request was rejected by the Head Office Coordinator.
                      {request.rejectionReason ? ` Reason: ${request.rejectionReason}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setViewing(order)}>
                    View
                  </Button>
                  {canRequest ? (
                    <Button
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirming(order.orderNo)}
                    >
                      Cancel order
                    </Button>
                  ) : pendingRequest ? (
                    <Button variant="outline" disabled>
                      Cancellation requested
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <OrderDetailSheet order={viewing} onClose={() => setViewing(null)} />

      <AlertDialog open={!!confirming} onOpenChange={(v) => !v && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to request cancellation of this order?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your order stays active until the Head Office Coordinator approves the request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my order</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirming) return;
                requestCancellation(confirming);
                toast.success(
                  `Cancellation requested for ${confirming} — waiting for coordinator approval`,
                );
                setConfirming(null);
              }}
            >
              Request cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-6">
        <Button asChild variant="outline">
          <Link to="/app/offer">See today's offer</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * One step in an order's history. `at` is only set where the database actually timestamps the
 * event: booking, a cancellation request and its decision, the handover record and the payment.
 * The rest are shown as reached or not, because no per-status timestamp is kept for an order.
 */
interface HistoryStep {
  label: string;
  at?: string;
  note?: string;
  reached: boolean;
}

/** How far an order has travelled, so earlier steps read as done once a later one is reached. */
const FLOW: OrderStatus[] = ["Pending", "Confirmed", "Packed", "OutForDelivery", "Delivered"];
const reachedStage = (status: OrderStatus, stage: OrderStatus) => {
  if (status === "Cancelled") return stage === "Pending";
  if (status === "NotCollected") return FLOW.indexOf(stage) <= FLOW.indexOf("OutForDelivery");
  if (status === "CancellationRequested") return stage === "Pending" || stage === "Confirmed";
  const at = FLOW.indexOf(status);
  const of = FLOW.indexOf(stage);
  return at >= 0 && of >= 0 && of <= at;
};

function OrderDetailSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { batches, deliveryPoints, deliveryRecords, collections, cancellationRequestFor } =
    useAppData();

  const batch = order ? batches.find((b) => b.batchNo === order.batchNo) : undefined;
  const point = order ? deliveryPoints.find((d) => d.id === order.deliveryPointId) : undefined;
  const request = order ? cancellationRequestFor(order.orderNo) : undefined;
  const handover = order ? deliveryRecords.find((d) => d.orderNo === order.orderNo) : undefined;
  const payment = order ? collections.find((c) => c.orderNo === order.orderNo) : undefined;

  const history: HistoryStep[] = order
    ? [
        { label: "Order placed", at: order.createdAt, reached: true },
        {
          label: "Confirmed by head office",
          reached: reachedStage(order.status, "Confirmed"),
          ...(order.status === "Pending" ? { note: "Waiting for confirmation." } : {}),
        },
        ...(request
          ? [
              {
                label: "Cancellation requested",
                at: request.requestedAt,
                note: `Request ${request.requestNo}`,
                reached: true,
              },
              {
                label:
                  request.status === "Pending"
                    ? "Cancellation decision"
                    : `Cancellation ${request.status.toLowerCase()}`,
                reached: request.status !== "Pending",
                ...(request.decidedAt ? { at: request.decidedAt } : {}),
                ...(request.rejectionReason ? { note: request.rejectionReason } : {}),
              },
            ]
          : []),
        { label: "Packed", reached: reachedStage(order.status, "Packed") },
        { label: "Out for delivery", reached: reachedStage(order.status, "OutForDelivery") },
        {
          label: order.status === "NotCollected" ? "Not collected" : "Collected",
          reached: order.status === "Delivered" || order.status === "NotCollected",
          ...(handover ? { at: handover.dateTime } : {}),
          ...(handover?.receiverName ? { note: `Received by ${handover.receiverName}` } : {}),
        },
        ...(order.status === "Cancelled"
          ? [{ label: "Order cancelled", reached: true, at: order.updatedAt }]
          : []),
        ...(payment
          ? [
              {
                label: `Payment ${payment.status.toLowerCase()}`,
                at: payment.date,
                note: `${taka(payment.amountCollected)} by ${payment.method}`,
                reached: true,
              },
            ]
          : []),
      ]
    : [];

  return (
    <Sheet open={!!order} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {order ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                {order.orderNo}
                <OrderStatusBadge status={order.status} />
              </SheetTitle>
              <SheetDescription>Booked {dateTime(order.createdAt)}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6 text-sm">
              <section className="space-y-3">
                <h3 className="font-display text-base font-bold">Where to collect</h3>
                {point ? (
                  <>
                    <DetailRow label="Point" value={point.name} />
                    <DetailRow label="Address" value={point.address} />
                    {point.coordinatorName ? (
                      <DetailRow label="Coordinator" value={point.coordinatorName} />
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    This collection point is no longer on the system.
                  </p>
                )}
                <DetailRow
                  label="When"
                  value={
                    batch
                      ? `${dateShort(batch.deliveryDate)} · ${order.collectionTime ?? batch.deliveryWindow}`
                      : (order.collectionTime ?? "—")
                  }
                />
              </section>

              <section className="space-y-3">
                <h3 className="font-display text-base font-bold">Order</h3>
                <DetailRow label="Quantity" value={`${order.litres} L`} />
                <DetailRow label="Rate" value={`${taka(order.rate)} / L`} />
                <DetailRow label="Amount" value={taka(order.amount)} />
                <DetailRow label="Payment" value={order.paymentMethod ?? "Cash"} />
                <DetailRow label="Batch" value={order.batchNo} />
              </section>

              <section className="space-y-3">
                <h3 className="font-display text-base font-bold">History</h3>
                <ol className="space-y-3">
                  {history.map((step, i) => (
                    <li key={`${step.label}-${i}`} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-1 size-2.5 shrink-0 rounded-full",
                          step.reached ? "bg-primary" : "border border-border bg-muted",
                        )}
                      />
                      <span>
                        <span
                          className={cn("font-medium", !step.reached && "text-muted-foreground")}
                        >
                          {step.label}
                        </span>
                        {step.at ? (
                          <span className="block text-muted-foreground">{dateTime(step.at)}</span>
                        ) : null}
                        {step.note ? (
                          <span className="block text-muted-foreground">{step.note}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Last updated {dateTime(order.updatedAt)}
                </p>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}
