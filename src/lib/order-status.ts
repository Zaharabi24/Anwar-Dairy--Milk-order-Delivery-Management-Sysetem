import type { OrderStatus } from "./types";

/** How each status reads on screen. Shared so a badge and a picker never disagree. */
export const orderStatusLabels: Record<OrderStatus, string> = {
  Pending: "Pending",
  Confirmed: "Order confirmed",
  CancellationRequested: "Cancellation requested",
  Packed: "Packed",
  OutForDelivery: "Out for delivery",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  NotCollected: "Not collected",
};
