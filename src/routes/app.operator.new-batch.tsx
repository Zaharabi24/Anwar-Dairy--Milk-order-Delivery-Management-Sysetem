import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldRow } from "@/components/ui/field";
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
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/page-header";
import { FILTER_SEARCH } from "@/components/ui/control-styles";
import { useAppData } from "@/context/app-data";
import type { BatchAudience } from "@/lib/types";
import { taka } from "@/lib/format";

/** How many rows the picker draws at once. The directory is a few hundred people. */
const RECIPIENT_WINDOW = 500;

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
  const { batches, deliveryPoints, employees, addBatch } = useAppData();
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

  // Who hears about the batch. Everyone is the default, which is what publishing has always done.
  const [audience, setAudience] = useState<BatchAudience>("all");
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [recipientQuery, setRecipientQuery] = useState("");
  // Whether the list of who has been picked is open. Closed by default: it is a record of the
  // choice, consulted when you want to check it, not a second list competing with the search
  // results above it.
  const [showChosen, setShowChosen] = useState(false);

  const activePoints = useMemo(() => deliveryPoints.filter((p) => p.active), [deliveryPoints]);

  // Only people who can actually be written to. Offering somebody switched off, or with no
  // address, would promise a delivery that can't happen.
  const reachable = useMemo(
    () => employees.filter((e) => e.active && e.companyEmail.trim()),
    [employees],
  );
  const matchingEmployees = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q) return reachable;
    return reachable.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.companyEmail.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q),
    );
  }, [reachable, recipientQuery]);
  // The people picked, in the directory's own order rather than the order they were clicked, so
  // the list reads the same way twice and somebody checking it can find a name where they expect.
  const chosenEmployees = useMemo(
    () => reachable.filter((e) => recipients.has(e.id)),
    [reachable, recipients],
  );

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
    (audience === "selected" && recipients.size === 0) ||
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
      audience,
      recipientIds: audience === "selected" ? [...recipients] : [],
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
        <FieldRow columns={3}>
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
        </FieldRow>

        <FieldRow columns={3}>
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
        </FieldRow>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Schedule</h2>
            <p className="text-xs text-muted-foreground">
              Employees can book from the moment you publish until bookings close.
            </p>
          </div>
          <FieldRow columns={3}>
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
          </FieldRow>
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

        {/* Who is told when this is published. Decided here with the litres and the cutoff, not
            at the moment of publishing, so it is reviewed on the publish screen like everything
            else about the batch. */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Who gets the email</h2>
            <p className="text-xs text-muted-foreground">
              Everyone chosen receives their own booking link when the batch is published.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AudienceChoice
              chosen={audience === "all"}
              onChoose={() => setAudience("all")}
              title="All employees"
              detail="Everyone active in the Employee Database."
              count={reachable.length}
            />
            <AudienceChoice
              chosen={audience === "selected"}
              onChoose={() => setAudience("selected")}
              title="Selected employees"
              detail="Only the people you pick below."
              count={recipients.size}
            />
          </div>

          {audience === "selected" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  className={FILTER_SEARCH}
                  placeholder="Search by email address, Employee ID or name"
                  value={recipientQuery}
                  onChange={(e) => setRecipientQuery(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={matchingEmployees.every((e) => recipients.has(e.id))}
                  onClick={() =>
                    setRecipients((prev) => {
                      const next = new Set(prev);
                      for (const e of matchingEmployees) next.add(e.id);
                      return next;
                    })
                  }
                >
                  Select all {recipientQuery.trim() ? "matching" : ""} ({matchingEmployees.length})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={recipients.size === 0}
                  onClick={() => setRecipients(new Set())}
                >
                  Clear
                </Button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                {matchingEmployees.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="Nobody matches" hint="Try a different search." />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {matchingEmployees.slice(0, RECIPIENT_WINDOW).map((e) => (
                      <li key={e.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary">
                          <Checkbox
                            checked={recipients.has(e.id)}
                            onCheckedChange={() =>
                              setRecipients((prev) => {
                                const next = new Set(prev);
                                if (next.has(e.id)) next.delete(e.id);
                                else next.add(e.id);
                                return next;
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{e.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {e.id} · {e.companyEmail}
                            </span>
                          </span>
                          <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                            {e.department || "—"}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {matchingEmployees.length > RECIPIENT_WINDOW ? (
                <p className="text-xs text-muted-foreground">
                  Showing the first {RECIPIENT_WINDOW} of {matchingEmployees.length}. Search by name
                  or Employee ID to reach the rest &mdash; &quot;Select all matching&quot; still
                  takes every one of them.
                </p>
              ) : null}

              {/* Who has been picked so far, collected in one place.
                  Searching narrows the list above, so the people already chosen scroll out of
                  sight the moment you look for the next one -- and the only record of the choice
                  was a count. This is that record: open it to read the names back, and take
                  somebody out from here without having to search for them again. */}
              <div className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setShowChosen((open) => !open)}
                  aria-expanded={showChosen}
                  aria-controls="chosen-recipients"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      showChosen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Selected employees</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {chosenEmployees.length === 0
                        ? "Nobody picked yet"
                        : chosenEmployees.map((e) => e.name).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {chosenEmployees.length}
                  </span>
                </button>

                {showChosen ? (
                  <div id="chosen-recipients" className="border-t border-border">
                    {chosenEmployees.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Search above by name or Employee ID and tick somebody to add them here.
                      </p>
                    ) : (
                      <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                        {chosenEmployees.map((e) => (
                          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{e.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {e.id} &middot; {e.companyEmail}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setRecipients((prev) => {
                                  const next = new Set(prev);
                                  next.delete(e.id);
                                  return next;
                                })
                              }
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>

              {recipients.size === 0 ? (
                <p className="text-sm text-destructive">Pick at least one employee.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {recipients.size} {recipients.size === 1 ? "employee" : "employees"} will be
                  emailed when this batch is published.
                </p>
              )}
            </div>
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

function AudienceChoice({
  chosen,
  onChoose,
  title,
  detail,
  count,
}: {
  chosen: boolean;
  onChoose: () => void;
  title: string;
  detail: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-pressed={chosen}
      className={`rounded-lg border p-4 text-left transition-colors ${
        chosen ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}
