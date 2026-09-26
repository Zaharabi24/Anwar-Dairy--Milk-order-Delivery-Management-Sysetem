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
import { Field, FilterBar } from "@/components/ui/field";
import { PageHeader } from "@/components/page-header";
import { PeriodFilterFields } from "@/components/period-filter";
import { StatCard } from "@/components/stat-card";
import { useAppData } from "@/context/app-data";
import {
  EMPTY_PERIOD,
  periodLabel,
  periodMatches,
  periodState,
  yearsIn,
  type PeriodFilter,
} from "@/lib/date-filter";
import { dateShort, litres, taka } from "@/lib/format";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Anwar Organic" },
      {
        name: "description",
        content: "Daily reconciliation: produced, sealed, sold, ordered and collected.",
      },
      { property: "og:title", content: "Reports — Anwar Organic" },
      {
        property: "og:description",
        content: "Daily reconciliation: produced, sealed, sold, ordered and collected.",
      },
    ],
  }),
  component: ReportsPage,
});

const PALETTE = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-info)",
  "var(--color-muted-foreground)",
];

/**
 * How many batches the Batch Range covers. "All" is the default so the report opens on everything
 * the date filter matched rather than on an arbitrary last-seven.
 */
/** Room for the axis labels, and a little air above the tallest bar. */
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

/**
 * The three measures, drawn side by side for each date.
 *
 * Produced, sealed and sold are one story read across: what came out of the dairy, how much of it
 * was put up for sale, and how much of that went. Apart they are three numbers; together the gap
 * between each pair is the thing worth seeing.
 */
const METRICS: { value: "produced" | "sealed" | "sold"; label: string; colour: string }[] = [
  { value: "produced", label: "Produced", colour: "var(--color-muted-foreground)" },
  { value: "sealed", label: "Sealed", colour: "var(--color-info)" },
  { value: "sold", label: "Sold", colour: "var(--color-primary)" },
];

const BATCH_RANGES = [
  { value: "all", label: "All batches" },
  { value: "5", label: "Last 5 batches" },
  { value: "7", label: "Last 7 batches" },
  { value: "10", label: "Last 10 batches" },
  { value: "20", label: "Last 20 batches" },
] as const;

function ReportsPage() {
  const { batches, orders, collections, deliveryPoints, employees } = useAppData();

  // Date first, because it is the axis a report is normally read along; the batch range narrows
  // whatever the dates matched, which is why it comes last.
  const [period, setPeriod] = useState<PeriodFilter>(EMPTY_PERIOD);
  const [orderNo, setOrderNo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [batchNo, setBatchNo] = useState("all");
  const [batchRange, setBatchRange] = useState<string>("all");

  const { invalid } = periodState(period);
  const years = useMemo(() => yearsIn(batches.map((b) => b.productionDate)), [batches]);

  /**
   * The batch numbers the Batch No. dropdown offers: every batch that has been published.
   *
   * Read from the batches the page already holds rather than fetched, which is what makes it keep
   * itself up to date -- publishing a batch moves it off Draft, the snapshot refreshes, and the
   * number is in the list. A draft is left out on purpose: nobody has been told about it, so there
   * is nothing to report on yet.
   */
  const publishedBatches = useMemo(() => batches.filter((b) => b.status !== "Draft"), [batches]);

  /**
   * The batches in scope: those produced inside the date filter, then cut to the batch range.
   *
   * `batches` arrives newest first, so "last 10" is the first ten of what the dates matched --
   * the ten most recent, not the ten most recent overall, which would ignore the date filter it
   * is meant to be narrowing.
   */
  const selection = useMemo(() => {
    // Batch No. names one batch, so it answers on its own: the dates and the range are there to
    // find a batch, and once one has been named there is nothing left for them to narrow.
    if (batchNo !== "all") return batches.filter((b) => b.batchNo === batchNo);
    const matched = batches.filter((b) => periodMatches(period, b.productionDate));
    return batchRange === "all" ? matched : matched.slice(0, Number(batchRange) || matched.length);
  }, [batches, period, batchNo, batchRange]);

  const selectedBatchNos = useMemo(
    () => new Set(selection.map((batch) => batch.batchNo)),
    [selection],
  );

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name.toLowerCase());
    return map;
  }, [employees]);

  /**
   * The orders in scope.
   *
   * The batch filters decide which batches are being reported on; Order No, Employee ID and
   * Employee Name narrow the orders *within* them. Cancelled orders are left out throughout --
   * nothing was sold, so counting them would overstate every figure on the page.
   */
  const filteredOrders = useMemo(() => {
    const no = orderNo.trim().toLowerCase();
    const id = employeeId.trim().toLowerCase();
    const name = employeeName.trim().toLowerCase();
    return orders
      .filter((o) => selectedBatchNos.has(o.batchNo))
      .filter((o) => o.status !== "Cancelled")
      .filter((o) => (no ? o.orderNo.toLowerCase().includes(no) : true))
      .filter((o) => (id ? o.employeeId.toLowerCase().includes(id) : true))
      .filter((o) => (name ? (nameById.get(o.employeeId) ?? "").includes(name) : true));
  }, [orders, selectedBatchNos, orderNo, employeeId, employeeName, nameById]);

  /** Whether the orders on screen are a subset of the batches', which changes how to read them. */
  const narrowedToOrders = Boolean(orderNo.trim() || employeeId.trim() || employeeName.trim());

  /**
   * One row per batch, computed from the filtered orders — so every chart and the table below
   * move together when a filter changes, instead of the charts showing the batch's whole story
   * beside cards showing one employee's part of it.
   *
   * Sold, Orders and Revenue all come from the same orders. They used to disagree: Sold preferred
   * a closed batch's recorded `final_booked_litres` while Revenue was summed from the order rows,
   * so the dashboard could read 5,135 litres sold for ৳18,400 — about ৳3.58 a litre, against a
   * rate of ৳92. Three figures presented side by side have to be three views of one set of
   * orders, or each of them quietly contradicts the other two. Produced and Sealed are properties
   * of the batch and come from the batch.
   */
  const series = useMemo(
    () =>
      selection
        .slice()
        .reverse()
        .map((b) => {
          const live = filteredOrders.filter((o) => o.batchNo === b.batchNo);
          const sold = live.reduce((s, o) => s + o.litres, 0);
          return {
            batchNo: b.batchNo,
            date: dateShort(b.productionDate),
            name: dateShort(b.productionDate).slice(0, 6),
            produced: b.producedLitres,
            sealed: b.saleableLitres,
            sold,
            orders: live.length,
            unsold: Math.max(0, b.saleableLitres - sold),
            revenue: live.reduce((s, o) => s + o.amount, 0),
            sellThrough: b.saleableLitres ? Math.round((sold / b.saleableLitres) * 100) : 0,
          };
        }),
    [selection, filteredOrders],
  );

  /**
   * The chart's rows: one per production date, not one per batch.
   *
   * The x-axis is a date, so two batches produced on the same day drew two bars labelled the same
   * thing -- four of them on a busy day, indistinguishable, each holding a slice of the day's
   * figures. Reading the day's production off it meant adding the bars up by eye. Batches on one
   * date are summed into one bar; the table below still lists them separately, which is where the
   * batch-by-batch detail belongs.
   */
  const byDate = useMemo(() => {
    const days = new Map<
      string,
      { name: string; produced: number; sealed: number; sold: number }
    >();
    for (const r of series) {
      const day = days.get(r.date) ?? { name: r.name, produced: 0, sealed: 0, sold: 0 };
      day.produced += r.produced;
      day.sealed += r.sealed;
      day.sold += r.sold;
      days.set(r.date, day);
    }
    return [...days.values()];
  }, [series]);

  // The five dashboard figures. Each one is a sum of the same rows the charts are drawn from, so
  // a card and the bar above it can never disagree.
  const totalProduced = series.reduce((s, r) => s + r.produced, 0);
  const totalSealed = series.reduce((s, r) => s + r.sealed, 0);
  const totalOrders = filteredOrders.length;
  const totalSold = series.reduce((s, r) => s + r.sold, 0);
  const totalRevenue = series.reduce((s, r) => s + r.revenue, 0);

  const filteredOrderNos = useMemo(
    () => new Set(filteredOrders.map((order) => order.orderNo)),
    [filteredOrders],
  );
  const collected = collections
    .filter((collection) => filteredOrderNos.has(collection.orderNo))
    .reduce((s, c) => s + c.amountCollected, 0);
  const sellThrough = totalSealed ? Math.round((totalSold / totalSealed) * 100) : 0;

  const byPoint = useMemo(
    () =>
      deliveryPoints
        .map((p) => ({
          name: p.name,
          value: filteredOrders
            .filter((o) => o.deliveryPointId === p.id)
            .reduce((s, o) => s + o.litres, 0),
        }))
        .filter((slice) => slice.value > 0),
    [deliveryPoints, filteredOrders],
  );

  const dirty =
    period.mode !== "all" ||
    batchNo !== "all" ||
    batchRange !== "all" ||
    Boolean(orderNo.trim() || employeeId.trim() || employeeName.trim());

  function clearFilters() {
    setPeriod(EMPTY_PERIOD);
    setOrderNo("");
    setEmployeeId("");
    setEmployeeName("");
    setBatchNo("all");
    setBatchRange("all");
  }

  function exportCsv() {
    const header = "Batch No.,Date,Produced,Sealed,Orders,Sold,Unsold,Sell-through,Revenue\n";
    const body = series
      .map((r) =>
        [
          r.batchNo,
          r.date,
          r.produced,
          r.sealed,
          r.orders,
          r.sold,
          r.unsold,
          `${r.sellThrough}%`,
          r.revenue,
        ].join(","),
      )
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
        description="Reconcile what was produced, sealed, sold and collected."
        action={
          <Button variant="outline" onClick={exportCsv} disabled={series.length === 0}>
            Export CSV
          </Button>
        }
      />

      {/* The filters were in the page header, five controls of four different heights wrapping
          against the title. They are a row of their own now: one grid, one width, one baseline. */}
      <FilterBar columns={4} className="mb-4">
        <PeriodFilterFields value={period} onChange={setPeriod} years={years} idPrefix="report" />
        <Field label="Order No." htmlFor="report-order">
          <Input
            id="report-order"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            placeholder="e.g. ORD-1042"
          />
        </Field>
        <Field label="Employee ID" htmlFor="report-employee-id">
          <Input
            id="report-employee-id"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="e.g. 019163"
          />
        </Field>
        <Field label="Employee Name" htmlFor="report-employee-name">
          <Input
            id="report-employee-name"
            list="report-employee-names"
            value={employeeName}
            onChange={(e) => setEmployeeName(e.target.value)}
            placeholder="Any part of the name"
          />
        </Field>
        {/* One named batch. Its contents are every batch that has been published, so a batch
            published today is in the list without anyone having to add it. */}
        <Field
          label="Batch No."
          htmlFor="report-batch-no"
          {...(batchNo !== "all"
            ? { hint: "Reporting on this batch alone — the date and range filters don't apply." }
            : {})}
        >
          <Select value={batchNo} onValueChange={setBatchNo}>
            <SelectTrigger id="report-batch-no">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batch numbers</SelectItem>
              {publishedBatches.length === 0 ? (
                <SelectItem value="none" disabled>
                  No batch published yet
                </SelectItem>
              ) : null}
              {publishedBatches.map((b) => (
                <SelectItem key={b.batchNo} value={b.batchNo}>
                  {b.batchNo} · {dateShort(b.productionDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {/* Last, because it narrows what the other filters matched rather than choosing it. */}
        <Field label="Batch Range" htmlFor="report-batch-range">
          <Select value={batchRange} onValueChange={setBatchRange}>
            <SelectTrigger id="report-batch-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <datalist id="report-employee-names">
          {employees.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            {batchNo === "all" ? periodLabel(period) : batchNo} ·{" "}
            {batchNo !== "all" || batchRange === "all"
              ? `${series.length} batch${series.length === 1 ? "" : "es"}`
              : (BATCH_RANGES.find((r) => r.value === batchRange)?.label ?? batchRange)}{" "}
            · {totalOrders} order{totalOrders === 1 ? "" : "s"}
          </p>
          <Button variant="outline" size="sm" disabled={!dirty} onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Produced (L)" value={totalProduced} format={litres} />
        <StatCard label="Total Sealed (L)" value={totalSealed} format={litres} />
        <StatCard label="Total Orders" value={totalOrders} />
        <StatCard label="Total Sold (L)" value={totalSold} format={litres} emphasis />
        <StatCard label="Total Revenue" value={totalRevenue} format={taka} />
        <StatCard label="Cash collected" value={collected} format={taka} />
      </div>

      {narrowedToOrders ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Produced and Sealed are the whole of each batch in range. Orders, Sold and Revenue cover
          only the orders matching the Order No., Employee ID and Employee Name filters.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Sell-through {sellThrough}% of sealed litres. Cancelled orders are excluded throughout.
        </p>
      )}

      {invalid ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The custom range ends before it starts, so there is nothing to report. Correct the dates
          to see the figures.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Produced vs sealed vs sold by date" className="lg:col-span-2">
          {byDate.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              {/* `barCategoryGap` is what gives a bar its width when there is only one of them.
                  Left to itself the single bar takes the whole band, so one production day drew a
                  slab across the card -- the shape of the plot area rather than a reading of
                  anything. With a gap and a ceiling it stays a bar whether there is one day on the
                  chart or thirty, and the rounded top is visible at last. */}
              <BarChart data={byDate} barCategoryGap="28%" barGap={6} margin={CHART_MARGIN}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  tickMargin={10}
                  stroke="var(--color-muted-foreground)"
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={56}
                  tickMargin={8}
                  allowDecimals={false}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v: number) => v.toLocaleString("en-BD")}
                />
                <Tooltip
                  // The default cursor is an opaque grey block the width of the whole band, which
                  // covered the bar it was meant to be pointing at.
                  cursor={{ fill: "var(--color-muted-foreground)", fillOpacity: 0.08 }}
                  separator=": "
                  formatter={(v: number) => litres(v)}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
                  }}
                  labelStyle={{ fontWeight: 600, marginBottom: 2 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
                />
                {/* The three side by side within each date. `maxBarSize` is per bar, so a day on
                    its own gets three readable bars rather than three slabs filling the card. */}
                {METRICS.map((m) => (
                  <Bar
                    key={m.value}
                    dataKey={m.value}
                    name={m.label}
                    fill={m.colour}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={42}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Litres by delivery point">
          {byPoint.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={byPoint}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
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
          )}
        </Card>

        <Card title="Revenue trend" className="lg:col-span-3">
          {series.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
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
          )}
        </Card>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Batch No.</th>
              <th className="px-4 py-3 font-medium">Produced</th>
              <th className="px-4 py-3 font-medium">Sealed</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Sold</th>
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
                <td className="px-4 py-3">{litres(r.sealed)}</td>
                <td className="px-4 py-3">{r.orders}</td>
                <td className="px-4 py-3">{litres(r.sold)}</td>
                <td className="px-4 py-3">{litres(r.unsold)}</td>
                <td className="px-4 py-3">{r.sellThrough}%</td>
                <td className="px-4 py-3">{taka(r.revenue)}</td>
              </tr>
            ))}
            {series.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No batches match the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NoData() {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      Nothing to chart for these filters.
    </div>
  );
}

function Card({
  title,
  className = "",
  action,
  children,
}: {
  title: string;
  className?: string;
  /** A control belonging to this chart, sitting on the title's line. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
