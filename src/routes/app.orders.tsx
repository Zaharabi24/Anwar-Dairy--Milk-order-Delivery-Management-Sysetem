import { Field, FilterRow } from "@/components/ui/field";
import { FILTER_CONTROL, FILTER_SEARCH } from "@/components/ui/control-styles";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@/lib/permissions";
import { dateTime, litres, taka } from "@/lib/format";
import { orderStatusLabels } from "@/lib/order-status";
import type { CollectionRecord, Order, OrderStatus, PaymentMethod } from "@/lib/types";

const paymentMethods: PaymentMethod[] = ["Cash", "bKash", "Payroll deduction"];

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
    collections,
    upsertCollection,
    deleteOrder,
    activeBatch,
    updateOrder,
    cancelOrder,
    approveOrder,
    deliverOrder,
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
  const { user } = useAuth();
  // Removing an order is the Super Admin's. The server refuses anyone else either way; this is so
  // a coordinator isn't shown a button that will only tell them no.
  const canDelete = hasPermission(user?.roles ?? [], "orders.delete");
  const [deleting, setDeleting] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("Cash");
  const [payReference, setPayReference] = useState("");

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
          (emp?.floorNo.toLowerCase().includes(q) ?? false) ||
          (emp?.companyEmail.toLowerCase().includes(q) ?? false) ||
          (emp?.phone.toLowerCase().includes(q) ?? false) ||
          (o.guest?.name.toLowerCase().includes(q) ?? false) ||
          (o.guest?.phone.includes(q) ?? false) ||
          (o.guest?.email.includes(q) ?? false) ||
          (o.guest?.floor.toLowerCase().includes(q) ?? false) ||
          (o.guest?.profile.toLowerCase().includes(q) ?? false) ||
          o.employeeId.toLowerCase().includes(q)
        );
      });
  }, [orders, employees, activeBatch, query, status, point]);

  // Collections is keyed by order, so the payment shown here and the row in the Collection
  // section are the same record read twice -- not a copy that has to be kept in step.
  const paymentFor = (orderNo: string) => collections.find((c) => c.orderNo === orderNo);

  /** Due is raised once the coordinator confirms the request, which is when it can be paid. */
  const payable = (o: Order) => o.status !== "Pending" && o.status !== "Cancelled";

  function paymentStatus(o: Order): CollectionRecord["status"] | null {
    if (!payable(o)) return null;
    return paymentFor(o.orderNo)?.status ?? "Unpaid";
  }

  function openPayment(o: Order) {
    const existing = paymentFor(o.orderNo);
    setPaying(o);
    setPayAmount(Math.max(0, o.amount - (existing?.amountCollected ?? 0)));
    setPayMethod(existing?.method ?? o.paymentMethod ?? "Cash");
    setPayReference(existing?.reference ?? "");
  }

  async function savePayment() {
    if (!paying) return;
    const already = paymentFor(paying.orderNo)?.amountCollected ?? 0;
    const remaining = Math.max(0, paying.amount - already);
    if (payAmount < 0 || payAmount > remaining) {
      toast.error(`Amount must be between ৳0 and ${taka(remaining)}.`);
      return;
    }
    const total = already + payAmount;
    // One call, one record: what is saved here is what the Collection section shows, because
    // both read the same row. The server sets the status, the collector and the audit entry.
    const saved = await upsertCollection({
      orderNo: paying.orderNo,
      amountCollected: total,
      method: payMethod,
      reference: payReference.trim() || "—",
      date: new Date().toISOString(),
    });
    if (!saved) return;
    toast.success(
      total >= paying.amount
        ? `${paying.orderNo} paid in full — also recorded in Collections`
        : `${taka(total)} recorded against ${paying.orderNo} — ${taka(paying.amount - total)} still due`,
    );
    setPaying(null);
  }

  const totalLitres = rows
    .filter((o) => o.status !== "Cancelled")
    .reduce((s, o) => s + o.litres, 0);
  const totalValue = rows.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + o.amount, 0);

  /**
   * Prints the list as it is filtered on screen. The page itself stays hidden; what prints is the
   * sheet below, which has no buttons and fits A4 landscape. The title becomes the file name when
   * the browser saves it as a PDF.
   */
  function printOrders() {
    const previous = document.title;
    const stamp = new Date().toISOString().slice(0, 10);
    document.title = `Orders ${activeBatch?.batchNo ?? "all"} ${stamp}`;
    window.print();
    document.title = previous;
  }

  const printFilters = [
    status === "all" ? null : `Status: ${orderStatusLabels[status as OrderStatus]}`,
    point === "all"
      ? null
      : `Delivery point: ${deliveryPoints.find((p) => p.id === point)?.name ?? point}`,
    query.trim() ? `Search: "${query.trim()}"` : null,
  ].filter((f): f is string => f !== null);

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

      <FilterRow className="mt-6">
        <Input
          className={FILTER_SEARCH}
          placeholder="Search order no. or employee"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className={FILTER_CONTROL}>
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
          <SelectTrigger className={FILTER_CONTROL}>
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
      </FilterRow>

      <div className="mt-4 flex">
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={printOrders}>
          <Printer />
          Print order
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No orders match" hint="Try clearing the filters." />
          </div>
        ) : (
          <table className="w-full min-w-[1480px] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <Th>Order</Th>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Floor</Th>
                <Th>Contact</Th>
                <Th>Litres</Th>
                <Th>Amount</Th>
                <Th>Point</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th>Payment Status</Th>
                <Th>Payment Record</Th>
                <Th>Actions</Th>
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
                      {o.guest ? o.guest.name : (emp?.name ?? o.employeeId)}
                      {o.guest ? (
                        <span className="mt-0.5 block">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Guest
                          </span>
                        </span>
                      ) : (
                        <span className="block text-xs text-muted-foreground">{o.employeeId}</span>
                      )}
                    </Td>
                    <Td>
                      {o.guest ? o.guest.profile || "—" : emp?.department || "—"}
                      <span className="block max-w-[14rem] text-xs text-muted-foreground">
                        {o.guest ? o.guest.address || "—" : emp?.designation || "—"}
                      </span>
                    </Td>
                    <Td>{(o.guest ? o.guest.floor : emp?.floorNo) || "—"}</Td>
                    <Td>
                      {o.guest ? o.guest.email || "—" : emp?.companyEmail || "—"}
                      <span className="block text-xs text-muted-foreground">
                        {o.guest ? o.guest.phone : emp?.phone || "—"}
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
                    {/* Payment sits beside the order it belongs to, so a coordinator confirming
                        a request can settle it without leaving the screen. Both columns read the
                        Collection record for this order -- the same row the Collections section
                        shows -- so the two can never disagree. */}
                    <Td>
                      {paymentStatus(o) ? (
                        <PayBadge status={paymentStatus(o)!} />
                      ) : (
                        <span className="text-muted-foreground">
                          {o.status === "Cancelled" ? "—" : "Not due yet"}
                        </span>
                      )}
                    </Td>
                    {/* The amount, and nothing else. Method, time and reference are what the
                        Collection section is for -- repeating them here made the widest column on
                        the page out of the smallest fact in it. */}
                    <Td>
                      {(() => {
                        const paid = paymentFor(o.orderNo);
                        if (!payable(o) || !paid)
                          return <span className="text-muted-foreground">—</span>;
                        return <span className="font-medium">{taka(paid.amountCollected)}</span>;
                      })()}
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        {payable(o) ? (
                          <Button variant="outline" size="sm" onClick={() => openPayment(o)}>
                            {paymentFor(o.orderNo) ? "Update payment" : "Record payment"}
                          </Button>
                        ) : null}
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
                        {/* The handover, offered once the order is confirmed and paid in full.
                            The server refuses it otherwise, whatever the button says. */}
                        {o.status === "Confirmed" && paymentStatus(o) === "Paid" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              void deliverOrder(o.orderNo).then((done) => {
                                if (done) toast.success(`${o.orderNo} delivered`);
                              });
                            }}
                          >
                            Deliver
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button variant="outline" size="sm" onClick={() => setDeleting(o)}>
                            Delete
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

      <OrdersPrintSheet
        batchNo={activeBatch?.batchNo}
        filters={printFilters}
        totalLitres={totalLitres}
        totalValue={totalValue}
        rows={rows.map((o) => {
          const emp = employees.find((e) => e.id === o.employeeId);
          return {
            orderNo: o.orderNo,
            name: o.guest ? o.guest.name : (emp?.name ?? o.employeeId),
            employeeId: o.guest ? "Guest" : o.employeeId,
            department: o.guest ? o.guest.profile || "—" : emp?.department || "—",
            floor: (o.guest ? o.guest.floor : emp?.floorNo) || "—",
            phone: o.guest ? o.guest.phone : emp?.phone || "—",
            point: deliveryPoints.find((p) => p.id === o.deliveryPointId)?.name ?? "—",
            litres: o.litres,
            amount: o.amount,
            placed: dateTime(o.createdAt),
            status: orderStatusLabels[o.status],
            payment: paymentStatus(o) ?? (o.status === "Cancelled" ? "—" : "Not due yet"),
          };
        })}
      />

      <Dialog open={!!paying} onOpenChange={(v) => !v && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment — {paying?.orderNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Billed{" "}
              <span className="font-medium text-foreground">{taka(paying?.amount ?? 0)}</span> ·
              already collected{" "}
              <span className="font-medium text-foreground">
                {taka(paying ? (paymentFor(paying.orderNo)?.amountCollected ?? 0) : 0)}
              </span>{" "}
              · due now{" "}
              <span className="font-medium text-foreground">
                {taka(
                  paying
                    ? Math.max(
                        0,
                        paying.amount - (paymentFor(paying.orderNo)?.amountCollected ?? 0),
                      )
                    : 0,
                )}
              </span>
            </p>
            <Field label="Amount collected now (৳)">
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
              />
            </Field>
            <Field label="Method">
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference">
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Receipt or transaction no."
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Saving this also records it in the Collection section against this order.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button onClick={() => void savePayment()}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust {editing?.orderNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Litres">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
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
            </Field>
            <Field label="Reason (required)">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. employee requested less"
              />
            </Field>
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
                if (editLitres < 0.5 || !Number.isInteger(editLitres * 2)) {
                  toast.error("Litres go in steps of 0.5, starting at 0.5.");
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

      {/* Deleting is not cancelling. Cancelling leaves the order on the record, keeps its number
          and still reconciles; this removes it, for a row that should not have existed. The
          dialog says what goes with it, because the money already collected against an order is
          not something to discover missing afterwards. */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.orderNo}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  This cannot be undone. The order and everything recorded against it are removed:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    {litres(deleting?.litres ?? 0)} booked, {taka(deleting?.amount ?? 0)} billed
                  </li>
                  <li>
                    {deleting && paymentFor(deleting.orderNo)
                      ? `the ${taka(paymentFor(deleting.orderNo)!.amountCollected)} collected against it, and its entry in Collections`
                      : "its entry in Collections, once there is one"}
                  </li>
                  <li>the delivery coupon and any cancellation request</li>
                </ul>
                <p className="mt-2">
                  The batch, the employee and every other order are untouched. To stop an order
                  without erasing it, use Adjust &rarr; Decline Order instead.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                const no = deleting.orderNo;
                void deleteOrder(no).then((removed) => {
                  if (!removed) return;
                  toast.success(
                    removed["collections"]
                      ? `${no} deleted — ${taka(removed["collected"] ?? 0)} collected and ${removed["coupons"]} coupon(s) went with it.`
                      : `${no} deleted.`,
                  );
                  setDeleting(null);
                });
              }}
            >
              Delete order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <Field label="Rejection reason (required)">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. milk already packed for this order"
            />
          </Field>
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

interface PrintRow {
  orderNo: string;
  name: string;
  employeeId: string;
  department: string;
  floor: string;
  phone: string;
  point: string;
  litres: number;
  amount: number;
  placed: string;
  status: string;
  payment: string;
}

/**
 * The order list as paper. Rendered straight into <body> so the print stylesheet can hide the
 * whole app around it (`.print-sheet` in styles.css); on screen it is never shown. Mounted only in
 * the browser, since the portal needs `document`.
 */
function OrdersPrintSheet({
  batchNo,
  filters,
  totalLitres,
  totalValue,
  rows,
}: {
  batchNo: string | undefined;
  filters: string[];
  totalLitres: number;
  totalValue: number;
  rows: PrintRow[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="print-sheet">
      <header className="print-sheet-head">
        <div>
          <h1>Anwar Organic — Orders</h1>
          <p>{batchNo ? `Batch ${batchNo}` : "All orders"}</p>
          {filters.length ? <p>{filters.join(" · ")}</p> : null}
        </div>
        <div className="print-sheet-meta">
          <p>Printed {dateTime(new Date().toISOString())}</p>
          <p>
            {rows.length} orders · {litres(totalLitres)} · {taka(totalValue)}
          </p>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Order</th>
            <th>Employee</th>
            <th>Department</th>
            <th>Floor</th>
            <th>Phone</th>
            <th>Point</th>
            <th className="num">Litres</th>
            <th className="num">Amount</th>
            <th>Placed</th>
            <th>Status</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.orderNo}>
              <td>{i + 1}</td>
              <td>{r.orderNo}</td>
              <td>
                {r.name}
                <span className="sub">{r.employeeId}</span>
              </td>
              <td>{r.department}</td>
              <td>{r.floor}</td>
              <td>{r.phone}</td>
              <td>{r.point}</td>
              <td className="num">{litres(r.litres)}</td>
              <td className="num">{taka(r.amount)}</td>
              <td>{r.placed}</td>
              <td>{r.status}</td>
              <td>{r.payment}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>Total (excluding cancelled)</td>
            <td className="num">{litres(totalLitres)}</td>
            <td className="num">{taka(totalValue)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>,
    document.body,
  );
}

/** The same three states, and the same colours, the Collection section uses. */
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
