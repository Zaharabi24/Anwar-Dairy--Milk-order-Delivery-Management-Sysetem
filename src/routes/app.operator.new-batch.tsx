import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateField } from "@/components/ui/date-field";
import { addDays, atTime, sameDay, startOfDay } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";
import { taka } from "@/lib/format";

export const Route = createFileRoute("/app/operator/new-batch")({
  head: () => ({
    meta: [
      { title: "New batch — Anwar Organic" },
      {
        name: "description",
        content: "Create today's milk batch with rate, limits and delivery details.",
      },
      { property: "og:title", content: "New batch — Anwar Organic" },
      {
        property: "og:description",
        content: "Create today's milk batch with rate, limits and delivery details.",
      },
    ],
  }),
  component: NewBatch,
});

/** Milk can't have been produced in the future, and a week back covers a late entry. */
const PRODUCTION_WINDOW_DAYS = 7;
/** Far enough ahead to plan a fortnight of deliveries, not so far the calendar is a wall. */
const DELIVERY_WINDOW_DAYS = 14;

function to12Hour(value: string) {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr ?? 0);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${(mStr ?? "00").padStart(2, "0")} ${suffix}`;
}

function NewBatch() {
  const { batches, deliveryPoints, addBatch } = useAppData();
  const navigate = useNavigate();

  const [producedText, setProducedText] = useState("640");
  const [saleableText, setSaleableText] = useState("600");
  const [rate, setRate] = useState(92);
  const [minOrder, setMin] = useState(1);
  const [maxOrder, setMax] = useState(10);
  const [cap, setCap] = useState(10);
  const today = startOfDay(new Date());
  const [productionDate, setProductionDate] = useState(today);
  const [cutoffDate, setCutoffDate] = useState(today);
  const [cutoffTime, setCutoffTime] = useState("13:00");
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [windowFrom, setWindowFrom] = useState("16:00");
  const [windowTo, setWindowTo] = useState("18:30");
  const [note, setNote] = useState("Chilled at 4°C. Please bring your own carry bag.");
  // Selection starts as null and means "every active point". Nothing is hardcoded: the demo
  // seed's ids don't exist on a real database, and a batch saved against one is only rejected
  // once it reaches the foreign key.
  const [chosen, setChosen] = useState<string[] | null>(null);

  const activePoints = useMemo(() => deliveryPoints.filter((p) => p.active), [deliveryPoints]);
  // Filtered every render, so a point that is removed or deactivated drops out of the selection
  // instead of failing at save time.
  const points = (chosen ?? activePoints.map((p) => p.id)).filter((id) =>
    activePoints.some((p) => p.id === id),
  );

  const chosenNames = activePoints.filter((p) => points.includes(p.id)).map((p) => p.name);
  const summary =
    chosenNames.length === 0
      ? "Select delivery points"
      : chosenNames.length <= 2
        ? chosenNames.join(", ")
        : `${chosenNames.length} points selected`;

  // Delivery can't precede production, and bookings can't close after the milk is handed over.
  // Rather than let someone build an impossible schedule and then refuse it, the later dates
  // follow the earlier one.
  const setProduction = (d: Date) => {
    setProductionDate(d);
    if (deliveryDate < d) setDeliveryDate(d);
    if (cutoffDate < d) setCutoffDate(d);
  };
  const setDelivery = (d: Date) => {
    setDeliveryDate(d);
    if (cutoffDate > d) setCutoffDate(d);
  };

  const cutoffAt = atTime(cutoffDate, cutoffTime).toISOString();
  const cutoffPassed = new Date(cutoffAt).getTime() <= Date.now();

  const produced = Number(producedText) || 0;
  const saleable = Number(saleableText) || 0;
  const window = `${to12Hour(windowFrom)} – ${to12Hour(windowTo)}`;

  // Preview only — the database assigns the final number when the draft is saved.
  const nextNo = `BATCH-${
    Math.max(2400, ...batches.map((b) => Number(/^BATCH-(\d+)$/.exec(b.batchNo)?.[1] ?? 0))) + 1
  }`;
  const invalid =
    produced <= 0 ||
    saleable <= 0 ||
    saleable > produced ||
    minOrder > maxOrder ||
    points.length === 0 ||
    cutoffPassed;

  async function submit() {
    if (invalid) {
      toast.error("Please fix the highlighted values first.");
      return;
    }
    const saved = await addBatch({
      productionDate: atTime(productionDate, "06:00").toISOString(),
      product: "Fresh Whole Milk",
      producedLitres: produced,
      saleableLitres: saleable,
      ratePerLitre: rate,
      minOrder,
      maxOrder,
      employeeCap: cap,
      bookingCutoff: cutoffAt,
      deliveryDate: atTime(deliveryDate, windowFrom).toISOString(),
      deliveryWindow: window,
      deliveryPoints: points,
      note,
    });
    if (!saved) return;
    toast.success(`${saved.batchNo} saved as draft`);
    void navigate({ to: "/app/operator/publish" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="New batch"
        description={`Draft ${nextNo} — employees see it only after you publish.`}
      />

      <div className="space-y-6 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Produced litres">
            <StepperInput value={producedText} onChange={setProducedText} />
          </Field>
          <Field
            label="Saleable litres"
            error={saleable > produced ? "Cannot exceed produced" : undefined}
          >
            <StepperInput value={saleableText} onChange={setSaleableText} />
          </Field>
          <Field label="Rate per litre (৳)">
            <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum order (L)"
            error={minOrder > maxOrder ? "Above maximum" : undefined}
          >
            <Input
              type="number"
              value={minOrder}
              onChange={(e) => setMin(Number(e.target.value))}
            />
          </Field>
          <Field label="Maximum order (L)">
            <Input
              type="number"
              value={maxOrder}
              onChange={(e) => setMax(Number(e.target.value))}
            />
          </Field>
          <Field label="Per-employee cap (L)">
            <Input type="number" value={cap} onChange={(e) => setCap(Number(e.target.value))} />
          </Field>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Schedule</h2>
            <p className="text-xs text-muted-foreground">
              Employees can book from the moment you publish until bookings close.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField
              id="production-date"
              label="Production date"
              value={productionDate}
              onChange={setProduction}
              earliest={addDays(today, -PRODUCTION_WINDOW_DAYS)}
              latest={today}
              hint="When the milk was produced."
            />
            <DateField
              id="delivery-date"
              label="Delivery date"
              value={deliveryDate}
              onChange={setDelivery}
              earliest={productionDate}
              latest={addDays(today, DELIVERY_WINDOW_DAYS)}
              {...(sameDay(deliveryDate, today)
                ? { hint: "Collected today." }
                : sameDay(deliveryDate, addDays(today, 1))
                  ? { hint: "Collected tomorrow." }
                  : {})}
            />
            <div className="space-y-2">
              <DateField
                id="cutoff-date"
                label="Bookings close"
                value={cutoffDate}
                onChange={setCutoffDate}
                earliest={productionDate}
                latest={deliveryDate}
                {...(cutoffPassed ? { error: "This is already in the past." } : {})}
              />
              <Input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                aria-label="Time bookings close"
                className={cutoffPassed ? "border-destructive" : ""}
              />
            </div>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Delivery time window</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="time"
              className="w-36"
              value={windowFrom}
              onChange={(e) => setWindowFrom(e.target.value)}
              aria-label="Delivery window start time"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="time"
              className="w-36"
              value={windowTo}
              onChange={(e) => setWindowTo(e.target.value)}
              aria-label="Delivery window end time"
            />
            <span className="text-sm text-muted-foreground">{window}</span>
          </div>
        </div>

        <div>
          <Label className="mb-2 block" id="delivery-points-label">
            Delivery points
          </Label>
          {activePoints.length === 0 ? (
            <p className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
              No delivery points are set up yet. A System Admin adds them under Delivery points; a
              batch can&apos;t be saved until at least one exists.
            </p>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  aria-labelledby="delivery-points-label"
                  className="w-full justify-between font-normal sm:w-96"
                >
                  <span className="truncate">{summary}</span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              {/* Matches the trigger width so long addresses stay readable. */}
              <DropdownMenuContent
                align="start"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                {activePoints.map((p) => (
                  <DropdownMenuCheckboxItem
                    key={p.id}
                    checked={points.includes(p.id)}
                    // Without this the menu closes on the first tick, so picking a second
                    // point would mean reopening it.
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) =>
                      setChosen(v ? [...points, p.id] : points.filter((x) => x !== p.id))
                    }
                  >
                    <span className="block">
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.address}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {activePoints.length > 0 && points.length === 0 ? (
            <p className="mt-1 text-sm text-destructive">Pick at least one point.</p>
          ) : null}
        </div>

        <Field label="Note for employees">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Potential value:{" "}
            <span className="font-medium text-foreground">{taka(saleable * rate)}</span>
          </p>
          <Button onClick={submit} disabled={invalid}>
            Save draft & review
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function StepperInput({
  value,
  onChange,
  step = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  const bump = (delta: number) => onChange(String(Math.max(0, (Number(value) || 0) + delta)));
  return (
    <div className="flex items-stretch gap-2">
      <Input
        inputMode="numeric"
        className="text-center"
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
          onChange(next);
        }}
      />
      <div className="flex flex-col">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-1/2 rounded-b-none border-b-0"
          aria-label="Increase"
          onClick={() => bump(step)}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-1/2 rounded-t-none"
          aria-label="Decrease"
          onClick={() => bump(-step)}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}
