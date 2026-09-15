import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { useAppData } from "@/context/app-data";
import { dateShort, litres, taka } from "@/lib/format";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Anwar Organic" },
      { name: "description", content: "Daily reconciliation: produced, booked, delivered, collected and sell-through." },
      { property: "og:title", content: "Reports — Anwar Organic" },
      { property: "og:description", content: "Daily reconciliation: produced, booked, delivered, collected and sell-through." },
    ],
  }),
  component: ReportsPage,
});

const PALETTE = ["var(--color-primary)", "var(--color-accent)", "var(--color-info)", "var(--color-muted-foreground)"];

function ReportsPage() {
  const { batches, batchTotals, orders, collections, deliveryPoints } = useAppData();
  const [range, setRange] = useState("7");
  const [batchNo, setBatchNo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const invalidDateRange = Boolean(from && to && from > to);

  const selection = useMemo(() => {
    if (range === "batch") {
      const requestedBatch = batchNo.trim().toLocaleUpperCase();
      return batches.filter((b) => b.batchNo.toLocaleUpperCase() === requestedBatch);
    }
    if (range === "custom") {
      if (invalidDateRange) return [];
      return batches.filter((b) => {
        const productionDate = b.productionDate.slice(0, 10);
        return (!from || productionDate >= from) && (!to || productionDate <= to);
      });
    }
    return batches.slice(0, Number(range));
  }, [batches, range, batchNo, from, to, invalidDateRange]);

  const selectedBatchNos = useMemo(
    () => new Set(selection.map((batch) => batch.batchNo)),
    [selection],
  );

  const filteredOrders = useMemo(
    () => orders.filter((order) => selectedBatchNos.has(order.batchNo)),
    [orders, selectedBatchNos],
  );

  const series = useMemo(
    () =>
      selection
        .slice()
        .reverse()
        .map((b) => {
          const totals = batchTotals[b.batchNo];
          const live = filteredOrders.filter((o) => o.batchNo === b.batchNo && o.status !== "Cancelled");
          const booked = totals?.booked ?? live.reduce((s, o) => s + o.litres, 0);
          const delivered =
            totals?.delivered ??
            live.filter((o) => o.status === "Delivered").reduce((s, o) => s + o.litres, 0);
          return {
            batchNo: b.batchNo,
            date: dateShort(b.productionDate),
            name: range === "batch" ? b.batchNo : dateShort(b.productionDate).slice(0, 6),
            produced: b.producedLitres,
            booked,
            delivered,
            unsold: Math.max(0, b.saleableLitres - booked),
            revenue: delivered * b.ratePerLitre,
            sellThrough: Math.round((booked / b.saleableLitres) * 100),
          };
        }),
    [selection, filteredOrders, range, batchTotals],
  );

  const produced = series.reduce((s, r) => s + r.produced, 0);
  const booked = series.reduce((s, r) => s + r.booked, 0);
  const delivered = series.reduce((s, r) => s + r.delivered, 0);
  const revenue = series.reduce((s, r) => s + r.revenue, 0);
  const filteredOrderNos = useMemo(
    () => new Set(filteredOrders.map((order) => order.orderNo)),
    [filteredOrders],
  );
  const collected = collections
    .filter((collection) => filteredOrderNos.has(collection.orderNo))
    .reduce((s, c) => s + c.amountCollected, 0);
  const sellThrough = produced ? Math.round((booked / produced) * 100) : 0;

  const byPoint = useMemo(
    () =>
      deliveryPoints.map((p) => ({
        name: p.name,
        value: filteredOrders
          .filter((o) => o.deliveryPointId === p.id && o.status !== "Cancelled")
          .reduce((s, o) => s + o.litres, 0),
      })),
    [deliveryPoints, filteredOrders],
  );

  function exportCsv() {
    const header = "Batch No.,Date,Produced,Booked,Delivered,Unsold,Revenue\n";
    const body = series
      .map((r) => [r.batchNo, r.date, r.produced, r.booked, r.delivered, r.unsold, r.revenue].join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "anwar-fresh-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Reports"
        description="Reconcile what was produced, booked, delivered and collected."
        action={
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Range
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="h-9 w-44 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Last 5 batches</SelectItem>
                  <SelectItem value="7">Last 7 batches</SelectItem>
                  <SelectItem value="10">Last 10 batches</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Batch No.
              <Input
                list="report-batch-numbers"
                className="h-9 w-44 text-foreground"
                value={batchNo}
                onChange={(e) => {
                  setBatchNo(e.target.value);
                  setRange("batch");
                }}
                placeholder="Select or enter batch"
                aria-label="Batch number filter"
              />
              <datalist id="report-batch-numbers">
                {batches.map((batch) => (
                  <option key={batch.batchNo} value={batch.batchNo} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Start Date
              <Input
                type="date"
                className="h-9 w-40 text-foreground"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setRange("custom");
                }}
                aria-label="Start date"
              />
            </label>
            <span className="pb-2 text-sm text-muted-foreground">to</span>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              End Date
              <Input
                type="date"
                className="h-9 w-40 text-foreground"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setRange("custom");
                }}
                aria-label="End date"
              />
            </label>
            <Button variant="outline" className="h-9" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />

      {invalidDateRange ? (
        <p className="mb-4 text-sm font-medium text-destructive" role="alert">
          End Date must be on or after Start Date.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Produced" value={produced} format={litres} />
        <StatCard label="Booked" value={booked} format={litres} emphasis />
        <StatCard label="Delivered" value={delivered} format={litres} />
        <StatCard label="Sell-through" value={sellThrough} format={(v) => `${v}%`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard label="Revenue value" value={revenue} format={taka} />
        <StatCard label="Cash collected" value={collected} format={taka} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Produced vs booked vs delivered" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Legend />
              <Bar dataKey="produced" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="booked" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="delivered" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Litres by delivery point">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={byPoint} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                {byPoint.map((entry, i) => (
                  <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue trend" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip
                formatter={(v: number) => taka(v)}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#rev)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Batch No.</th>
              <th className="px-4 py-3 font-medium">Produced</th>
              <th className="px-4 py-3 font-medium">Booked</th>
              <th className="px-4 py-3 font-medium">Delivered</th>
              <th className="px-4 py-3 font-medium">Unsold</th>
              <th className="px-4 py-3 font-medium">Sell-through</th>
              <th className="px-4 py-3 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.batchNo} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">{r.date}</td>
                <td className="px-4 py-3">{r.batchNo}</td>
                <td className="px-4 py-3">{litres(r.produced)}</td>
                <td className="px-4 py-3">{litres(r.booked)}</td>
                <td className="px-4 py-3">{litres(r.delivered)}</td>
                <td className="px-4 py-3">{litres(r.unsold)}</td>
                <td className="px-4 py-3">{r.sellThrough}%</td>
                <td className="px-4 py-3">{taka(r.revenue)}</td>
              </tr>
            ))}
            {series.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No batches match the selected filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <h2 className="mb-4 font-display text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}
