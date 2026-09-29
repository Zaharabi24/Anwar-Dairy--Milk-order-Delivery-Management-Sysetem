import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthHeading, AuthShell, FieldError } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { guestBookingInfoFn, placeGuestOrderFn } from "@/functions/public.functions";
import {
  guestOrderInput,
  type GuestBookingInfo,
  type GuestOrderResult,
} from "@/lib/guest-order.schemas";

export const Route = createFileRoute("/guest-order")({
  head: () => ({
    meta: [
      { title: "Non-Management Order — Anwar Organic" },
      {
        name: "description",
        content:
          "For people who work in the office and collect from a pickup point, but have no company email or Employee ID.",
      },
    ],
  }),
  loader: async () => {
    try {
      return { batch: await guestBookingInfoFn() };
    } catch {
      return { batch: null as GuestBookingInfo | null };
    }
  },
  component: GuestOrderPage,
});

type Field = "name" | "phone" | "email" | "address" | "deliveryPointId" | "litres";

const dhakaDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });
const dhakaDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" });

function GuestOrderPage() {
  const { batch } = Route.useLoaderData();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    deliveryPointId: "",
    litres: batch ? String(batch.minLitres) : "1",
    paymentMethod: "Cash" as "Cash" | "bKash",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<GuestOrderResult | null>(null);

  if (!batch) {
    return (
      <AuthShell width="wide">
        <AuthHeading
          title="No batch is open right now"
          description="Guest orders open when today's batch is published. Please check back later."
        />
        <Button asChild variant="outline" className="w-full">
          <Link to="/">Back to home</Link>
        </Button>
      </AuthShell>
    );
  }

  const maxLitres = Math.min(batch.maxLitres, batch.remainingLitres);
  const soldOut = maxLitres < batch.minLitres;
  const litres = Number(form.litres) || 0;
  const point = batch.points.find((p) => p.id === form.deliveryPointId);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!batch) return;
    setMessage(null);
    const candidate = {
      batchNo: batch.batchNo,
      name: form.name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      deliveryPointId: form.deliveryPointId,
      litres,
      paymentMethod: form.paymentMethod,
    };
    const checked = guestOrderInput.safeParse(candidate);
    const next: Partial<Record<Field, string>> = {};
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const key = issue.path[0] as Field;
        next[key] ??= issue.message;
      }
    }
    if (litres < batch.minLitres || litres > maxLitres) {
      next.litres = `Choose between ${batch.minLitres} and ${maxLitres} L.`;
    }
    if (!form.deliveryPointId) next.deliveryPointId = "Choose a pickup point.";
    if (Object.keys(next).length) {
      setErrors(next);
      setMessage("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      setPlaced(await placeGuestOrderFn({ data: candidate }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your order couldn't be placed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <AuthShell width="wide">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Order received</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Your order number is <strong className="text-foreground">{placed.orderNo}</strong>. The
            head office coordinator confirms it before collection. A copy was sent to {form.email}.
          </p>
        </div>
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-border bg-secondary/50 p-4 text-sm">
          <dt className="text-muted-foreground">Quantity</dt>
          <dd>{placed.litres} L</dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd>Tk {placed.amount}</dd>
          <dt className="text-muted-foreground">Pickup point</dt>
          <dd>{placed.pointName}</dd>
          <dt className="text-muted-foreground">Collect on</dt>
          <dd>
            {dhakaDate(placed.deliveryDate)}, {placed.deliveryWindow}
          </dd>
          <dt className="text-muted-foreground">Payment</dt>
          <dd>{form.paymentMethod} at collection</dd>
        </dl>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Quote the order number when you collect.
        </p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/">Back to home</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell width="wide">
      <AuthHeading
        title="Non-Management Order"
        description="For people who work in the office and collect from a pickup point, but have no company email or Employee ID."
      />

      <div className="-mt-3 mb-5 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm">
        <p className="font-medium">Batch {batch.batchNo}</p>
        <p className="mt-1 text-muted-foreground">
          Tk {batch.ratePerLitre}/litre · {batch.remainingLitres} L left · bookings close{" "}
          {dhakaDateTime(batch.bookingCutoff)} (Dhaka) · collect on {dhakaDate(batch.deliveryDate)},{" "}
          {batch.deliveryWindow}
        </p>
      </div>

      {message ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {soldOut ? (
        <Alert className="mb-5">
          <AlertDescription>This batch is fully booked. Please try the next one.</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guest-name">Full Name</Label>
            <Input
              id="guest-name"
              value={form.name}
              autoComplete="name"
              placeholder="Enter your full name"
              onChange={(e) => set("name", e.target.value)}
              className={errors.name ? "border-destructive" : ""}
            />
            <FieldError message={errors.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-phone">Phone Number</Label>
            <Input
              id="guest-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              autoComplete="tel"
              placeholder="01712345678"
              onChange={(e) => set("phone", e.target.value)}
              className={errors.phone ? "border-destructive" : ""}
            />
            <FieldError message={errors.phone} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="guest-email">Personal Email</Label>
          <Input
            id="guest-email"
            type="email"
            value={form.email}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => set("email", e.target.value)}
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email ? (
            <FieldError message={errors.email} />
          ) : (
            <p className="text-xs text-muted-foreground">Your order confirmation is sent here.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="guest-address">Address</Label>
          <Textarea
            id="guest-address"
            rows={2}
            value={form.address}
            autoComplete="street-address"
            placeholder="House, road, area"
            onChange={(e) => set("address", e.target.value)}
            className={errors.address ? "border-destructive" : ""}
          />
          <FieldError message={errors.address} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="guest-point">Pickup Point</Label>
          <Select value={form.deliveryPointId} onValueChange={(v) => set("deliveryPointId", v)}>
            <SelectTrigger
              id="guest-point"
              className={errors.deliveryPointId ? "border-destructive" : ""}
            >
              <SelectValue placeholder="Select pickup point" />
            </SelectTrigger>
            <SelectContent>
              {batch.points.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.deliveryPointId ? (
            <FieldError message={errors.deliveryPointId} />
          ) : point?.address ? (
            <p className="text-xs text-muted-foreground">{point.address}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="guest-litres">Quantity (litres)</Label>
            <Input
              id="guest-litres"
              type="number"
              inputMode="numeric"
              min={batch.minLitres}
              max={Math.max(batch.minLitres, maxLitres)}
              step={1}
              value={form.litres}
              onChange={(e) => set("litres", e.target.value)}
              className={errors.litres ? "border-destructive" : ""}
            />
            {errors.litres ? (
              <FieldError message={errors.litres} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {batch.minLitres}–{Math.max(batch.minLitres, maxLitres)} L
                {litres > 0 ? ` · Tk ${litres * batch.ratePerLitre}` : ""}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-payment">Payment at Collection</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => set("paymentMethod", v as "Cash" | "bKash")}
            >
              <SelectTrigger id="guest-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="bKash">bKash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={submitting || soldOut}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Place Order
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Have a company email?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in to Book Milk
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
