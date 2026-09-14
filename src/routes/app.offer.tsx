import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/context/app-data";
import { countdown, dateShort, taka } from "@/lib/format";

export const Route = createFileRoute("/app/offer")({
  head: () => ({
    meta: [
      { title: "Today's offer — Anwar Fresh" },
      {
        name: "description",
        content: "See today's batch, the live litres remaining and the booking cut-off.",
      },
    ],
  }),
  component: OfferPage,
});

function OfferPage() {
  const { activeBatch, remainingLitres, deliveryPoints, orders, currentEmployee } = useAppData();
  const reduce = useReducedMotion();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!activeBatch) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Today's offer" />
        <EmptyState
          title="No batch is open right now"
          hint="The factory publishes the day's milk each morning — check back shortly."
        />
      </div>
    );
  }

  const remaining = remainingLitres(activeBatch.batchNo);
  const left = countdown(activeBatch.bookingCutoff);
  const myOrder = orders.find(
    (o) =>
      o.employeeId === currentEmployee.id &&
      o.batchNo === activeBatch.batchNo &&
      o.status !== "Cancelled",
  );
  const closedReason =
    activeBatch.status === "Paused"
      ? "Bookings are paused by the factory. They'll reopen shortly."
      : activeBatch.status === "Closed"
        ? "This batch is closed. Today's milk has been allocated."
        : !left
          ? "Bookings closed at the cut-off time for today."
          : remaining < activeBatch.minOrder
            ? "Today's batch is sold out — every litre is booked."
            : null;

  const fill = remaining / activeBatch.saleableLitres;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Today's offer"
        description={`${activeBatch.product} · Batch ${activeBatch.batchNo}`}
        action={<BatchStatusBadge status={activeBatch.status} />}
      />

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Litres remaining</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-6xl font-extrabold">{remaining}</span>
            <span className="text-muted-foreground">of {activeBatch.saleableLitres} L</span>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${fill * 100}%` }}
              transition={{ duration: reduce ? 0 : 0.6 }}
            />
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-5 text-sm">
            <div>
              <dt className="text-muted-foreground">Price</dt>
              <dd className="mt-1 font-medium">{taka(activeBatch.ratePerLitre)} per litre</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bookings close in</dt>
              <dd className="mt-1 font-medium tabular-nums">{left ? left.label : "Closed"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="mt-1 font-medium">
                {dateShort(activeBatch.deliveryDate)}, {activeBatch.deliveryWindow}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Order size</dt>
              <dd className="mt-1 font-medium">
                {activeBatch.minOrder}–{Math.min(activeBatch.maxOrder, activeBatch.employeeCap)} L
                per person
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 md:w-72">
          <h2 className="font-semibold">Collection points</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {activeBatch.deliveryPoints.map((id) => {
              const dp = deliveryPoints.find((d) => d.id === id);
              if (!dp) return null;
              return (
                <li key={id}>
                  <p className="font-medium">{dp.name}</p>
                  <p className="text-muted-foreground">{dp.address}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
            {activeBatch.note}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        {myOrder ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              You've already booked <strong>{myOrder.litres} L</strong> on this batch (
              {myOrder.orderNo}).
            </p>
            <Button asChild variant="outline">
              <Link to="/app/my-orders">View my orders</Link>
            </Button>
          </div>
        ) : closedReason ? (
          <div>
            <p className="font-medium">Booking is closed</p>
            <p className="mt-1 text-sm text-muted-foreground">{closedReason}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Booking takes under a minute — stock updates the moment you confirm.
            </p>
            <Button asChild size="lg">
              <Link to="/app/order/new">Book now</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
