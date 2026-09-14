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
import { useAppData } from "@/context/app-data";
import { countdown, dateTime, taka } from "@/lib/format";

export const Route = createFileRoute("/app/my-orders")({
  head: () => ({
    meta: [
      { title: "My orders — Anwar Fresh" },
      {
        name: "description",
        content: "Your booking history and the option to request cancellation before cut-off.",
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
  const mine = orders
    .filter((o) => o.employeeId === currentEmployee.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My orders" description={`Everything you've booked, ${currentEmployee.name.split(" ")[0]}.`} />

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
                  <p className="text-sm text-muted-foreground">Booked {dateTime(order.createdAt)}</p>
                  {order.status === "Pending" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Waiting for head office to confirm your request.
                    </p>
                  ) : null}
                  {pendingRequest ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your cancellation request has been submitted and is waiting for Head Office
                      Coordinator approval. Request {request.requestNo} · {dateTime(request.requestedAt)}
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
                {canRequest ? (
                  <Button variant="outline" onClick={() => setConfirming(order.orderNo)}>
                    Cancel order
                  </Button>
                ) : pendingRequest ? (
                  <Button variant="outline" disabled>
                    Cancellation requested
                  </Button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

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
