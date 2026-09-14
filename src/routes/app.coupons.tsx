import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppData } from "@/context/app-data";
import { dateTime, litres } from "@/lib/format";

export const Route = createFileRoute("/app/coupons")({
  head: () => ({
    meta: [
      { title: "Delivery coupons — Anwar Fresh" },
      {
        name: "description",
        content: "Every handover recorded as a delivery coupon: recipient, floor, quantity and receiver.",
      },
      { property: "og:title", content: "Delivery coupons — Anwar Fresh" },
      {
        property: "og:description",
        content: "Every handover recorded as a delivery coupon: recipient, floor, quantity and receiver.",
      },
    ],
  }),
  component: Coupons,
});

function Coupons() {
  const { deliveryRecords } = useAppData();
  const totalLitres = deliveryRecords.reduce((s, r) => s + r.quantity, 0);
  const points = new Set(deliveryRecords.map((r) => r.location)).size;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Delivery coupons"
        description="The signed handover record for each delivered order — the source document for daily reconciliation."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Coupons issued" value={deliveryRecords.length} />
        <StatCard label="Litres handed over" value={totalLitres} format={litres} />
        <StatCard label="Collection points" value={points} />
      </div>

      {deliveryRecords.length === 0 ? (
        <EmptyState
          title="No coupons yet"
          hint="A coupon is created automatically when an order is marked delivered."
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-x-auto rounded-xl border border-border bg-card"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coupon</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Date &amp; time</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryRecords.map((r) => (
                <TableRow key={r.couponNo}>
                  <TableCell className="font-medium">{r.couponNo}</TableCell>
                  <TableCell>{r.orderNo}</TableCell>
                  <TableCell>{r.recipientName}</TableCell>
                  <TableCell className="text-muted-foreground">{r.contact}</TableCell>
                  <TableCell>{r.location}</TableCell>
                  <TableCell>{r.floor}</TableCell>
                  <TableCell className="text-right">{litres(r.quantity)}</TableCell>
                  <TableCell>{r.receiverName}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateTime(r.dateTime)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.remarks}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}
    </div>
  );
}
