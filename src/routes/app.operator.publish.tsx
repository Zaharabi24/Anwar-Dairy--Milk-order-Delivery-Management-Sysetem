import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, EmptyState } from "@/components/page-header";
import { BatchStatusBadge } from "@/components/status-badge";
import { useAppData } from "@/context/app-data";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/permissions";
import { dateShort, taka, timeShort } from "@/lib/format";

export const Route = createFileRoute("/app/operator/publish")({
  head: () => ({
    meta: [
      { title: "Review and publish — Anwar Organic" },
      { name: "description", content: "Preview the batch as employees see it, then publish it." },
      { property: "og:title", content: "Review and publish — Anwar Organic" },
      {
        property: "og:description",
        content: "Preview the batch as employees see it, then publish it.",
      },
    ],
  }),
  component: Publish,
});

function Publish() {
  const { batches, deliveryPoints, setBatchStatus, deleteBatch } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  // A draft has never been published, so it is not in Publish records, which is where a batch is
  // otherwise deleted from. Without this there would be one kind of batch a Super Admin could not
  // remove -- the only kind with nothing behind it.
  const canDelete = hasPermission(user?.roles ?? [], "batches.delete");
  const draft =
    batches.find((b) => b.status === "Draft") ?? batches.find((b) => b.status === "Active");

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
          <Row
            label="Booking cutoff"
            value={`${dateShort(draft.bookingCutoff)}, ${timeShort(draft.bookingCutoff)}`}
          />
          <Row label="Delivery date" value={dateShort(draft.deliveryDate)} />
          <Row label="Delivery window" value={draft.deliveryWindow} />
          <Row
            label="Order limits"
            value={`${draft.minOrder}–${draft.maxOrder} L, cap ${draft.employeeCap} L`}
          />
          <Row
            label="Delivery points"
            value={draft.deliveryPoints
              .map((id) => deliveryPoints.find((p) => p.id === id)?.name ?? id)
              .join(", ")}
          />
          {/* The last thing to check before it goes out, and the one that can't be taken back. */}
          <Row
            label="Email goes to"
            value={
              draft.audience === "selected"
                ? `${draft.recipientIds.length} selected ${
                    draft.recipientIds.length === 1 ? "employee" : "employees"
                  }`
                : "All active employees"
            }
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
        {canDelete ? (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Delete batch
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {draft.batchNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isDraft
                ? "This draft has not been published, so nothing has been sent and nobody has booked against it. It will be removed entirely."
                : "This batch is live. Deleting it removes every order placed against it, the payments collected, the coupons handed out, the booking links and the email records. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void deleteBatch(draft.batchNo, draft.batchNo).then((removed) => {
                  if (!removed) return;
                  toast.success(`${draft.batchNo} deleted`);
                  void navigate({ to: "/app/operator" });
                });
              }}
            >
              Delete batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
