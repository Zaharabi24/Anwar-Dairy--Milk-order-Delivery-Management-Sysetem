import { Field } from "@/components/ui/field";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { useAppData } from "@/context/app-data";
import type { DeliveryPoint } from "@/lib/types";

export const Route = createFileRoute("/app/admin/delivery-points")({
  head: () => ({
    meta: [
      { title: "Delivery points — Anwar Organic" },
      { name: "description", content: "Manage pickup locations and their coordinators." },
      { property: "og:title", content: "Delivery points — Anwar Organic" },
      { property: "og:description", content: "Manage pickup locations and their coordinators." },
    ],
  }),
  component: DeliveryPointsPage,
});

const blank: DeliveryPoint = {
  id: "",
  name: "",
  address: "",
  coordinatorName: "",
  active: true,
};

function DeliveryPointsPage() {
  const { deliveryPoints, saveDeliveryPoint, setDeliveryPointActive, orders } = useAppData();
  const [draft, setDraft] = useState<DeliveryPoint | null>(null);
  const [isNew, setIsNew] = useState(false);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.address.trim()) {
      toast.error("Name and address are required.");
      return;
    }
    // The database assigns the point's ID and records the audit entry.
    const saved = await saveDeliveryPoint(draft, isNew);
    if (!saved) return;
    toast.success(`${saved.name} ${isNew ? "added" : "updated"}`);
    setDraft(null);
  }

  function toggle(point: DeliveryPoint) {
    void setDeliveryPointActive(point.id, !point.active);
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Delivery points"
        description="Where employees collect their milk each evening."
        action={
          <Button
            onClick={() => {
              setDraft(blank);
              setIsNew(true);
            }}
          >
            Add point
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {deliveryPoints.map((p, i) => {
          const count = orders.filter(
            (o) => o.deliveryPointId === p.id && o.status !== "Cancelled",
          ).length;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-bold">{p.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.address}</p>
                </div>
                <Switch checked={p.active} onCheckedChange={() => toggle(p)} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Coordinator</dt>
                  <dd className="font-medium">{p.coordinatorName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Orders routed</dt>
                  <dd className="font-medium">{count}</dd>
                </div>
              </dl>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setDraft(p);
                  setIsNew(false);
                }}
              >
                Edit
              </Button>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "Add delivery point" : `Edit ${draft?.name}`}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <Field label="Name">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Address">
                <Input
                  value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                />
              </Field>
              <Field label="Coordinator">
                <Input
                  value={draft.coordinatorName}
                  onChange={(e) => setDraft({ ...draft, coordinatorName: e.target.value })}
                />
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
