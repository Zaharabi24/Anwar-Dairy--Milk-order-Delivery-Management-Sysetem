import { Field, FilterBar } from "@/components/ui/field";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useAppData } from "@/context/app-data";
import { PeriodFilterFields } from "@/components/period-filter";
import {
  EMPTY_PERIOD,
  periodLabel,
  periodMatches,
  yearsIn,
  type PeriodFilter,
} from "@/lib/date-filter";
import { dateShort, taka, timeShort } from "@/lib/format";
import type { CollectionRecord, Order } from "@/lib/types";

export const Route = createFileRoute("/app/collections")({
  head: () => ({
    meta: [
      { title: "Collections — Anwar Organic" },
      {
        name: "description",
        content: "Track amount due, collected and outstanding for each order.",
      },
      { property: "og:title", content: "Collections — Anwar Organic" },
      {
        property: "og:description",
        content: "Record cash, bKash and payroll settlements against delivered milk orders.",
      },
    ],
  }),
  component: CollectionsPage,
});

type Method = CollectionRecord["method"];
const methods: Method[] = ["Cash", "bKash", "Payroll deduction"];

function CollectionsPage() {
  const { orders, employees, collections, batches, upsertCollection } = useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [batchNo, setBatchNo] = useState("all");
  const [period, setPeriod] = useState<PeriodFilter>(EMPTY_PERIOD);
  const [active, setActive] = useState<Order | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<Method>("Cash");
  const [reference, setReference] = useState("");

  // Due is raised only once the head office coordinator confirms the order request.
  const payable = useMemo(
    () => orders.filter((o) => o.status !== "Pending" && o.status !== "Cancelled"),
    [orders],
  );

  const collectedFor = (orderNo: string) =>
    collections.find((c) => c.orderNo === orderNo)?.amountCollected ?? 0;

  /** The batches that have anything payable against them, newest first. */
  const batchOptions = useMemo(() => {
    const withOrders = new Set(payable.map((o) => o.batchNo));
    return batches.filter((b) => withOrders.has(b.batchNo));
  }, [batches, payable]);

  const years = useMemo(() => yearsIn(payable.map((o) => o.createdAt)), [payable]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      payable
        .map((o) => ({ order: o, record: collections.find((c) => c.orderNo === o.orderNo) }))
        .filter(({ order }) => (batchNo === "all" ? true : order.batchNo === batchNo))
        // Dated by the order, not by the payment: every row has an order date, where a row nobody
        // has paid yet has no collection date at all -- and those are exactly the rows a coordinator
        // is looking for. Filtering on the payment would hide all of them the moment a month is
        // chosen.
        .filter(({ order }) => periodMatches(period, order.createdAt))
        .filter(({ record }) => {
          if (filter === "all") return true;
          const status = record?.status ?? "Unpaid";
          return status === filter;
        })
        .filter(({ order }) => {
          if (!q) return true;
          const emp = employees.find((e) => e.id === order.employeeId);
          return (
            order.orderNo.toLowerCase().includes(q) ||
            (emp?.name.toLowerCase().includes(q) ?? false)
          );
        })
    );
  }, [payable, collections, employees, filter, query, batchNo, period]);

  // Totalled over what the filters matched, not over everything payable. Cards that ignore the
  // filters answer a question nobody asked: pick a batch and "Total billed" should be that
  // batch's, or the filters are a way of looking at the table and not at the money.
  const billed = rows.reduce((s, r) => s + r.order.amount, 0);
  const collected = rows.reduce((s, r) => s + collectedFor(r.order.orderNo), 0);
  const outstanding = Math.max(0, billed - collected);
  const filtered =
    batchNo !== "all" || period.mode !== "all" || filter !== "all" || Boolean(query.trim());

  function openRecord(order: Order) {
    const existing = collections.find((c) => c.orderNo === order.orderNo);
    setActive(order);
    setAmount(Math.max(0, order.amount - (existing?.amountCollected ?? 0)));
    setMethod(existing?.method ?? order.paymentMethod ?? "Cash");
    setReference(existing?.reference ?? "");
  }

  async function save() {
    if (!active) return;
    const already = collectedFor(active.orderNo);
    const remaining = Math.max(0, active.amount - already);
    if (amount < 0 || amount > remaining) {
      toast.error(`Amount must be between ৳0 and ${taka(remaining)}.`);
      return;
    }
    const total = already + amount;
    const status: CollectionRecord["status"] =
      total === 0 ? "Unpaid" : total >= active.amount ? "Paid" : "Partial";
    // The server records the collector, audit entry and final status.
    const saved = await upsertCollection({
      orderNo: active.orderNo,
      amountCollected: total,
      method,
      reference: reference.trim() || "—",
      date: new Date().toISOString(),
    });
    if (!saved) return;
    toast.success(
      `${active.orderNo} marked ${status.toLowerCase()} — due now ${taka(active.amount - total)}`,
    );
    setActive(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Collections"
        description="Due is raised once an order request is confirmed — cash, bKash or payroll deduction."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total billed" value={billed} format={taka} />
        <StatCard label="Collected" value={collected} format={taka} emphasis />
        <StatCard label="Due" value={outstanding} format={taka} />
      </div>

      {/* A labelled grid rather than the old bare row: with a batch, a date mode and its
          dependent field alongside the status and the search, unlabelled controls stop saying
          what they narrow. Same component every other filtered screen uses. */}
      <FilterBar columns={4} className="mt-6">
        <Field label="Batch No." htmlFor="col-batch">
          <Select value={batchNo} onValueChange={setBatchNo}>
            <SelectTrigger id="col-batch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batchOptions.length === 0 ? (
                <SelectItem value="none" disabled>
                  Nothing payable yet
                </SelectItem>
              ) : null}
              {batchOptions.map((b) => (
                <SelectItem key={b.batchNo} value={b.batchNo}>
                  {b.batchNo} · {dateShort(b.productionDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <PeriodFilterFields value={period} onChange={setPeriod} years={years} idPrefix="col" />

        <Field label="Payment status" htmlFor="col-status">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger id="col-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Search" htmlFor="col-search">
          <Input
            id="col-search"
            placeholder="Order no. or employee"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            {periodLabel(period)}
            {batchNo === "all" ? "" : ` · ${batchNo}`} · {rows.length} of {payable.length}{" "}
            {payable.length === 1 ? "order" : "orders"}
          </p>
          {filtered ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBatchNo("all");
                setPeriod(EMPTY_PERIOD);
                setFilter("all");
                setQuery("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </FilterBar>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={payable.length === 0 ? "Nothing to collect" : "No collections match"}
              hint={
                payable.length === 0
                  ? "Confirmed orders will appear here."
                  : "Try a wider date filter, or set Batch No. back to All."
              }
            />
          </div>
        ) : (
          <table className="w-full min-w-[780px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Order</Th>
                <Th>Employee</Th>
                <Th>Billed</Th>
                <Th>Collected</Th>
                <Th>Due</Th>
                <Th>Method</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ order, record }, i) => {
                const emp = employees.find((e) => e.id === order.employeeId);
                const status = record?.status ?? "Unpaid";
                return (
                  <motion.tr
                    key={order.orderNo}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.012, 0.2) }}
                    className="border-b border-border/60 last:border-0"
                  >
                    <Td className="font-medium">{order.orderNo}</Td>
                    <Td>
                      {emp?.name ?? order.employeeId}
                      <span className="block text-xs text-muted-foreground">{emp?.department}</span>
                    </Td>
                    <Td>{taka(order.amount)}</Td>
                    <Td>{taka(record?.amountCollected ?? 0)}</Td>
                    <Td className="font-medium">
                      {taka(Math.max(0, order.amount - (record?.amountCollected ?? 0)))}
                    </Td>
                    {/* Orders shows the amount alone; the detail of how and when it was taken
                        belongs here, which is the screen about payments. */}
                    <Td>
                      {record?.method ?? "—"}
                      {record?.reference && record.reference !== "—" ? (
                        <span className="block text-xs text-muted-foreground">
                          {record.reference}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-muted-foreground">
                      {record ? (
                        <>
                          {dateShort(record.date)}
                          <span className="block text-xs">{timeShort(record.date)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <PayBadge status={status} />
                    </Td>
                    <Td>
                      <Button variant="outline" size="sm" onClick={() => openRecord(order)}>
                        {record ? "Update" : "Record"}
                      </Button>
                    </Td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment — {active?.orderNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Billed{" "}
              <span className="font-medium text-foreground">{taka(active?.amount ?? 0)}</span> ·
              already collected{" "}
              <span className="font-medium text-foreground">
                {taka(active ? collectedFor(active.orderNo) : 0)}
              </span>{" "}
              · due now{" "}
              <span className="font-medium text-foreground">
                {taka(active ? Math.max(0, active.amount - collectedFor(active.orderNo)) : 0)}
              </span>
            </p>
            <Field label="Amount collected now (৳)">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Due after this payment:{" "}
                {taka(
                  active
                    ? Math.max(0, active.amount - collectedFor(active.orderNo) - (amount || 0))
                    : 0,
                )}
              </p>
            </Field>
            <Field label="Method">
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference">
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt or transaction no."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button onClick={save}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayBadge({ status }: { status: CollectionRecord["status"] }) {
  const styles =
    status === "Paid"
      ? "bg-primary text-primary-foreground border-primary"
      : status === "Partial"
        ? "bg-accent/15 text-accent-foreground border-accent/40"
        : "bg-destructive/10 text-destructive border-destructive/25";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
