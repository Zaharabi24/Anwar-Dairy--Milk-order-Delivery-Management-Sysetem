import { createFileRoute } from "@tanstack/react-router";
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
import { OrderStatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { useAppData } from "@/context/app-data";
import { dateTime, litres, taka } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

const statuses: OrderStatus[] = [
  "Pending",
  "Confirmed",
  "CancellationRequested",
  "Packed",
  "OutForDelivery",
  "Delivered",
  "Cancelled",
  "NotCollected",
];

export const Route = createFileRoute("/app/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Anwar Organic" },
      { name: "description", content: "Search, filter and adjust incoming employee orders." },
      { property: "og:title", content: "Orders — Anwar Organic" },
      {
        property: "og:description",
        content: "Search, filter and adjust incoming employee orders.",
      },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const {
    orders,
    employees,
    deliveryPoints,
    activeBatch,
    updateOrder,
    cancelOrder,
    approveOrder,
    cancellationRequestFor,
    approveCancellation,
    rejectCancellation,
  } = useAppData();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [point, setPoint] = useState<string>("all");
  const [editing, setEditing] = useState<Order | null>(null);
  const [editLitres, setEditLitres] = useState(0);
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState("");
  const [approvingCancel, setApprovingCancel] = useState<string | null>(null);
  const [rejectingCancel, setRejectingCancel] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => (activeBatch ? o.batchNo === activeBatch.batchNo : true))
      .filter((o) => (status === "all" ? true : o.status === status))
      .filter((o) => (point === "all" ? true : o.deliveryPointId === point))
      .filter((o) => {
        if (!q) return true;
        const emp = employees.find((e) => e.id === o.employeeId);
        return (
          o.orderNo.toLowerCase().includes(q) ||
          (emp?.name.toLowerCase().includes(q) ?? false) ||
          (emp?.department.toLowerCase().includes(q) ?? false) ||
          (emp?.designation.toLowerCase().includes(q) ?? false) ||
          (emp?.companyEmail.toLowerCase().includes(q) ?? false) ||
          (emp?.phone.toLowerCase().includes(q) ?? false) ||
          o.employeeId.toLowerCase().includes(q)
        );
      });
  }, [orders, employees, activeBatch, query, status, point]);

  const totalLitres = rows
    .filter((o) => o.status !== "Cancelled")
    .reduce((s, o) => s + o.litres, 0);
  const totalValue = rows.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.amount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Orders"
        description={activeBatch ? `Orders for ${activeBatch.batchNo}` : "All orders"}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Orders shown" value={rows.length} />
        <StatCard
          label="Requests to confirm"
          value={rows.filter((o) => o.status === "Pending").length}
        />
        <StatCard label="Litres booked" value={totalLitres} format={litres} emphasis />
        <StatCard label="Value" value={totalValue} format={taka} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search order no. or employee"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={point} onValueChange={setPoint}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Delivery point" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All delivery points</SelectItem>
            {deliveryPoints.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No orders match" hint="Try clearing the filters." />
          </div>
        ) : (
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Order</Th>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Contact</Th>
                <Th>Litres</Th>
                <Th>Amount</Th>
                <Th>Point</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const emp = employees.find((e) => e.id === o.employeeId);
                return (
                  <tr key={o.orderNo} className="border-b border-border/60 last:border-0">
                    <Td className="font-medium">{o.orderNo}</Td>
                    {/* Straight from the Employee Database, so an order placed from an emailed
                        link arrives here already identified -- name, ID, and how to reach them. */}
                    <Td>
                      {emp?.name ?? o.employeeId}
                      <span className="block text-xs text-muted-foreground">{o.employeeId}</span>
                    </Td>
                    <Td>
                      {emp?.department || "—"}
                      <span className="block text-xs text-muted-foreground">
                        {emp?.designation || "—"}
                      </span>
                    </Td>
                    <Td>
                      {emp?.companyEmail || "—"}
                      <span className="block text-xs text-muted-foreground">
                        {emp?.phone || "—"}
                      </span>
                    </Td>
                    <Td>{litres(o.litres)}</Td>
                    <Td>{taka(o.amount)}</Td>
                    <Td>{deliveryPoints.find((p) => p.id === o.deliveryPointId)?.name}</Td>
                    <Td className="text-muted-foreground">{dateTime(o.createdAt)}</Td>
                    <Td>
                      <OrderStatusBadge status={o.status} />
                      {o.status === "CancellationRequested" ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {cancellationRequestFor(o.orderNo)?.requestNo} ·{" "}
                          {dateTime(cancellationRequestFor(o.orderNo)?.requestedAt ?? o.createdAt)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        {o.status === "CancellationRequested" ? (
                          <>
                            <Button size="sm" onClick={() => setApprovingCancel(o.orderNo)}>
                              Approve cancellation
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRejectReason("");
                                setRejectingCancel(o.orderNo);
                              }}
                            >
                              Reject cancellation
                            </Button>
                          </>
                        ) : null}
                        {o.status === "Pending" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              approveOrder(o.orderNo);
                              toast.success(`${o.orderNo} confirmed`);
                            }}
                          >
                            Confirm request
                          </Button>
                        ) : null}
                        {o.status === "Cancelled" || o.status === "Delivered" ? null : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(o);
                              setEditLitres(0);
                              setDecline(false);
                              setReason("");
                            }}
                          >
                            Adjust
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust {editing?.orderNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Litres</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={editLitres}
                  disabled={decline}
                  onChange={(e) => {
                    setEditLitres(Number(e.target.value));
                    setDecline(false);
                  }}
                />
                <Button
                  type="button"
                  variant={decline ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDecline(true);
                    setEditLitres(0);
                  }}
                >
                  Decline Order
                </Button>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Reason (required)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. employee requested less"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                if (!reason.trim()) {
                  toast.error("Please give a reason.");
                  return;
                }
                if (decline) {
                  cancelOrder(editing.orderNo, reason.trim());
                  toast.success(`${editing.orderNo} declined`);
                  setEditing(null);
                  return;
                }
                if (editLitres < 1) {
                  toast.error("Litres must be at least 1.");
                  return;
                }
                updateOrder(editing.orderNo, { litres: editLitres }, reason.trim());
                toast.success(`${editing.orderNo} updated`);
                setEditing(null);
              }}
            >
              {decline ? "Decline order" : "Save change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!approvingCancel} onOpenChange={(v) => !v && setApprovingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve cancellation of {approvingCancel}?</AlertDialogTitle>
            <AlertDialogDescription>
              The order will be cancelled and removed from today's collection and distribution work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!approvingCancel) return;
                approveCancellation(approvingCancel);
                toast.success(`${approvingCancel} cancelled`);
                setApprovingCancel(null);
              }}
            >
              Approve cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectingCancel} onOpenChange={(v) => !v && setRejectingCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject cancellation of {rejectingCancel}?</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="mb-2 block">Rejection reason (required)</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. milk already packed for this order"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectingCancel(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rejectingCancel) return;
                if (!rejectReason.trim()) {
                  toast.error("Please give a reason.");
                  return;
                }
                rejectCancellation(rejectingCancel, rejectReason.trim());
                toast.success(`Cancellation rejected — ${rejectingCancel} stays confirmed`);
                setRejectingCancel(null);
              }}
            >
              Reject cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
