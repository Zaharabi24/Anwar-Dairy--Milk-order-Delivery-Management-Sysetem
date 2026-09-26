import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BatchStatusBadge } from "@/components/status-badge";
import { useAppData } from "@/context/app-data";
import { dateShort, litres, taka } from "@/lib/format";

export const Route = createFileRoute("/app/operator/")({
  head: () => ({
    meta: [
      { title: "Operator dashboard — Anwar Organic" },
      { name: "description", content: "Today's litres available, booked, delivered and unsold." },
      { property: "og:title", content: "Operator dashboard — Anwar Organic" },
      {
        property: "og:description",
        content: "Today's litres available, booked, delivered and unsold.",
      },
    ],
  }),
  component: OperatorDashboard,
});

function OperatorDashboard() {
  const { batches, batchTotals, activeBatch, orders, remainingLitres, setBatchStatus } =
    useAppData();

  /**
   * The dashboard is drawn whether or not a batch is open.
   *
   * It used to be replaced wholesale by an empty state, so on a morning before the day's batch
   * exists -- which is every morning, and the whole of the first day -- the operator's own screen
   * showed one line and a button. The figures, the batch controls and the chart were not empty,
   * they were absent, and there was no way to see what the screen would come to tell you.
   *
   * So the layout is constant and the values are what change. With no batch open every figure
   * reads as a dash rather than a zero, because "0 L" is a measurement -- it would say the batch
   * sold nothing, rather than that there is no batch yet. The controls keep their place, disabled,
   * so the screen holds its shape as the day starts.
   */
  const todayOrders = activeBatch
    ? orders.filter((o) => o.batchNo === activeBatch.batchNo && o.status !== "Cancelled")
    : [];
  const booked = todayOrders.reduce((s, o) => s + o.litres, 0);
  const delivered = todayOrders
    .filter((o) => o.status === "Delivered")
    .reduce((s, o) => s + o.litres, 0);
  const unsold = activeBatch ? remainingLitres(activeBatch.batchNo) : 0;
  const revenue = todayOrders.reduce((s, o) => s + o.amount, 0);

  // An empty field, not a zero one. Applied to every figure at once, so they cannot disagree
  // about whether there is a batch.
  const blank = !activeBatch;
  const asLitres = (v: number) => (blank ? "—" : litres(v));

  const trend = batches
    .filter((b) => batchTotals[b.batchNo])
    .slice(0, 7)
    .reverse()
    .map((b) => ({
      name: dateShort(b.productionDate).slice(0, 6),
      Produced: b.producedLitres,
      Booked: batchTotals[b.batchNo]!.booked,
      Delivered: batchTotals[b.batchNo]!.delivered,
    }));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Operator dashboard"
        description={
          activeBatch
            ? `${activeBatch.batchNo} · ${activeBatch.product} · ${taka(activeBatch.ratePerLitre)}/L`
            : "No batch is open yet. Create today's batch and these figures fill in as bookings come."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {activeBatch ? <BatchStatusBadge status={activeBatch.status} /> : null}
            {/* Kept on screen with no batch, disabled rather than removed: they are what this
                header does, and a header that grows two buttons partway through the morning is a
                different screen each time you look at it. */}
            {activeBatch?.status === "Active" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchStatus(activeBatch.batchNo, "Paused")}
              >
                Pause bookings
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!activeBatch}
                onClick={() => activeBatch && setBatchStatus(activeBatch.batchNo, "Active")}
              >
                Resume bookings
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!activeBatch}
              onClick={() => activeBatch && setBatchStatus(activeBatch.batchNo, "Closed")}
            >
              Close batch
            </Button>
            {activeBatch ? null : (
              <Button asChild size="sm">
                <Link to="/app/operator/new-batch">Create batch</Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saleable"
          value={activeBatch?.saleableLitres ?? 0}
          format={asLitres}
          {...(activeBatch ? { hint: `Produced ${activeBatch.producedLitres} L` } : {})}
        />
        <StatCard
          label="Booked"
          value={booked}
          format={asLitres}
          emphasis
          {...(blank ? {} : { hint: `${todayOrders.length} orders` })}
        />
        <StatCard label="Delivered" value={delivered} format={asLitres} />
        <StatCard
          label="Unsold"
          value={unsold}
          format={asLitres}
          {...(blank ? {} : { hint: `Value ${taka(revenue)} booked` })}
        />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-bold">Last 7 batches</h2>
        {/* The frame is drawn even with nothing to plot, so the chart reads as a chart waiting
            for its first batch rather than as a piece of the page that failed to load. */}
        {trend.length === 0 ? (
          <div className="mt-4 flex h-72 w-full items-center justify-center rounded-lg border border-dashed border-border">
            <EmptyState
              title="No batches closed yet"
              hint="Produced, booked and delivered litres are charted here once a batch has been closed."
            />
          </div>
        ) : (
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: "var(--secondary)" }} />
                <Bar dataKey="Produced" fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Booked" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Delivered" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
