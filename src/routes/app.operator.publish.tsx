import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badge";
import { useAppData } from "@/context/app-data";
import { dateShort, taka, timeShort } from "@/lib/format";

export const Route = createFileRoute("/app/operator/publish")({
  head: () => ({
    meta: [
      { title: "Review and publish — Anwar Fresh" },
      { name: "description", content: "Preview the batch as employees see it, then publish it." },
      { property: "og:title", content: "Review and publish — Anwar Fresh" },
      { property: "og:description", content: "Preview the batch as employees see it, then publish it." },
    ],
  }),
  component: Publish,
});

function Publish() {
  const { batches, deliveryPoints, setBatchStatus } = useAppData();
  const navigate = useNavigate();
  const draft = batches.find((b) => b.status === "Draft") ?? batches.find((b) => b.status === "Active");

  if (!draft) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="Review and publish" />
        <EmptyState title="Nothing to review" hint="Create a batch first." />
      </div>
    );
  }

  const isDraft = draft.status === "Draft";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Review and publish"
        description="This is exactly what employees will see."
        action={<BatchStatusBadge status={draft.status} />}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-2xl border border-border bg-card"
      >
        <div className="bg-primary px-6 py-5 text-primary-foreground">
          <p className="text-sm opacity-80">{draft.batchNo}</p>
          <h2 className="font-display text-2xl font-extrabold">{draft.product}</h2>
          <p className="mt-1 text-sm opacity-90">
            {draft.saleableLitres} L available · {taka(draft.ratePerLitre)} per litre
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
          <Row label="Production date" value={dateShort(draft.productionDate)} />
          <Row label="Booking cutoff" value={`${dateShort(draft.bookingCutoff)}, ${timeShort(draft.bookingCutoff)}`} />
          <Row label="Delivery date" value={dateShort(draft.deliveryDate)} />
          <Row label="Delivery window" value={draft.deliveryWindow} />
          <Row label="Order limits" value={`${draft.minOrder}–${draft.maxOrder} L, cap ${draft.employeeCap} L`} />
          <Row
            label="Delivery points"
            value={draft.deliveryPoints
              .map((id) => deliveryPoints.find((p) => p.id === id)?.name ?? id)
              .join(", ")}
          />
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted-foreground">Note</dt>
            <dd className="mt-1">{draft.note}</dd>
          </div>
        </dl>
      </motion.div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          disabled={!isDraft}
          onClick={() => {
            setBatchStatus(draft.batchNo, "Active");
            toast.success(`${draft.batchNo} published — bookings are open`);
            void navigate({ to: "/app/operator" });
          }}
        >
          {isDraft ? "Publish batch" : "Already published"}
        </Button>
        <Button variant="outline" onClick={() => void navigate({ to: "/app/operator/new-batch" })}>
          Edit details
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
