import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAppData } from "@/context/app-data";
import { countdown, taka } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

const paymentMethods: PaymentMethod[] = ["Cash", "bKash", "Payroll deduction"];

export const Route = createFileRoute("/app/order/new")({
  head: () => ({
    meta: [
      { title: "Book milk — Anwar Organic" },
      {
        name: "description",
        content: "Choose your litres and delivery point, then confirm your order.",
      },
    ],
  }),
  component: NewOrderPage,
});

function NewOrderPage() {
  const {
    activeBatch,
    remainingLitres,
    deliveryPoints,
    currentEmployee,
    confirmOrder,
  } = useAppData();
  const navigate = useNavigate();
  const [litres, setLitres] = useState(2);
  const [point, setPoint] = useState<string>(activeBatch?.deliveryPoints[0] ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");

  if (!activeBatch || activeBatch.status !== "Active") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Book milk" />
        <EmptyState
          title="Booking isn't open"
          hint="There's no active batch right now. Today's offer page shows what's next."
        />
      </div>
    );
  }

  const remaining = remainingLitres(activeBatch.batchNo);
  const cap = Math.min(activeBatch.maxOrder, activeBatch.employeeCap, remaining);
  const left = countdown(activeBatch.bookingCutoff);

  const submit = async () => {
    if (!left) {
      toast.error("Bookings closed at the cut-off time for today.");
      return;
    }
    // The server re-checks stock inside a transaction and explains any refusal.
    const order = await confirmOrder({
      batchNo: activeBatch.batchNo,
      litres,
      deliveryPointId: point,
      paymentMethod,
      collectionTime: activeBatch.deliveryWindow,
    });
    if (!order) return;
    toast.success("Order placed");
    navigate({ to: "/app/order/confirmation/$orderId", params: { orderId: order.orderNo } });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Book milk"
        description={`Batch ${activeBatch.batchNo} · ${remaining} L left`}
      />

      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">Your details</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{currentEmployee.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Employee ID</dt>
              <dd className="font-medium">{currentEmployee.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Department</dt>
              <dd className="font-medium">{currentEmployee.department}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="font-medium">{currentEmployee.phone}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">How many litres?</h2>
          <div className="mt-4 flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              aria-label="Reduce by one litre"
              disabled={litres <= activeBatch.minOrder}
              onClick={() => setLitres((l) => Math.max(activeBatch.minOrder, l - 1))}
            >
              <Minus className="size-4" />
            </Button>
            <span className="font-display text-4xl font-extrabold tabular-nums">{litres}</span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Add one litre"
              disabled={litres >= cap}
              onClick={() => setLitres((l) => Math.min(cap, l + 1))}
            >
              <Plus className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              1 L steps · up to {cap} L for you today
            </span>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">Where will you collect it?</h2>
          <div className="mt-4 grid gap-3">
            {activeBatch.deliveryPoints.map((id) => {
              const dp = deliveryPoints.find((d) => d.id === id);
              if (!dp) return null;
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm ${
                    point === id ? "border-primary bg-secondary" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="delivery-point"
                    className="mt-1 accent-[var(--color-primary)]"
                    checked={point === id}
                    onChange={() => setPoint(id)}
                  />
                  <span>
                    <span className="block font-medium">{dp.name}</span>
                    <span className="block text-muted-foreground">{dp.address}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold">How will you pay?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {paymentMethods.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${
                  paymentMethod === m ? "border-primary bg-secondary" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  className="accent-[var(--color-primary)]"
                  checked={paymentMethod === m}
                  onChange={() => setPaymentMethod(m)}
                />
                <span className="font-medium">{m}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Collection time: <span className="font-medium text-foreground">{activeBatch.deliveryWindow}</span>
          </p>
        </section>



        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {litres} L × {taka(activeBatch.ratePerLitre)}
              </p>
              <p className="font-display text-3xl font-extrabold">
                {taka(litres * activeBatch.ratePerLitre)}
              </p>
            </div>
            <Button size="lg" onClick={submit}>
              Confirm order
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Pay at collection — cash, bKash or payroll deduction.{" "}
            <Link to="/app/offer" className="underline">
              Back to today's offer
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
