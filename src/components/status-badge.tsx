import type { BatchStatus, OrderStatus } from "@/lib/types";

const orderStyles: Record<OrderStatus, string> = {
  Pending: "bg-accent/15 text-accent-foreground border-accent/40",
  Confirmed: "bg-info/10 text-info border-info/30",
  CancellationRequested: "bg-destructive/10 text-destructive border-destructive/30",
  Packed: "bg-accent/15 text-accent-foreground border-accent/40",
  OutForDelivery: "bg-primary/10 text-primary border-primary/30",
  Delivered: "bg-primary text-primary-foreground border-primary",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/25",
  NotCollected: "bg-background text-destructive border-destructive",
};

const orderLabels: Record<OrderStatus, string> = {
  Pending: "Pending",
  Confirmed: "Order confirmed",
  CancellationRequested: "Cancellation requested",
  Packed: "Packed",
  OutForDelivery: "Out for delivery",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  NotCollected: "Not collected",
};

const batchStyles: Record<BatchStatus, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Active: "bg-primary/10 text-primary border-primary/30",
  Paused: "bg-accent/15 text-accent-foreground border-accent/40",
  SoldOut: "bg-info/10 text-info border-info/30",
  Closed: "bg-foreground text-background border-foreground",
};

const batchLabels: Record<BatchStatus, string> = {
  Draft: "Draft",
  Active: "Active",
  Paused: "Paused",
  SoldOut: "Sold out",
  Closed: "Closed",
};

const base =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`${base} ${orderStyles[status]}`}>{orderLabels[status]}</span>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <span className={`${base} ${batchStyles[status]}`}>{batchLabels[status]}</span>;
}
