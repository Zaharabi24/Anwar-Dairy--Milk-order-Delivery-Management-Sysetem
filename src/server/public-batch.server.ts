// What the landing page shows about today's batch.
//
// This is the only unauthenticated read in the app, so it returns the few fields the widget
// displays and nothing else: no employee, no order, no delivery-point address. Anyone who can
// reach the site can already see the batch number and rate on the sign-in screens' sibling pages,
// and employees need today's numbers before they sign in -- but it is a deliberate line, and
// widening it means widening this query, not adding a caller.
import { getDb } from "./db/client.server";

export interface PublicBatchStatus {
  batchNo: string;
  ratePerLitre: number;
  saleableLitres: number;
  /** Saleable litres less everything booked and not cancelled. */
  remainingLitres: number;
  /** Null once the cut-off has passed. */
  bookingCutoff: string;
  deliveryDate: string;
  deliveryWindow: string;
  deliveryPoints: string[];
  status: "Active" | "Paused";
}

/** Today's open batch, or null when nothing is published. */
export async function getPublicBatchStatus(): Promise<PublicBatchStatus | null> {
  const sql = await getDb();
  const [row] = await sql<Record<string, string>[]>`
    select b.batch_no, b.rate_per_litre, b.saleable_litres, b.booking_cutoff, b.delivery_date,
           b.delivery_window, b.status,
           -- The same rule the signed-in screens use (app-data.tsx remainingLitres): a booking
           -- holds its litres until it is cancelled, whatever stage it has reached.
           coalesce((select sum(o.litres) from orders o
                     where o.batch_no = b.batch_no and o.status <> 'Cancelled'), 0) as booked,
           coalesce((select array_agg(dp.name order by bdp.position)
                     from batch_delivery_points bdp
                     join delivery_points dp on dp.id = bdp.delivery_point_id
                     where bdp.batch_no = b.batch_no), '{}') as points
    from batches b
    where b.status in ('Active', 'Paused')
    order by b.seq desc
    limit 1`;
  if (!row) return null;

  const saleable = Number(row["saleable_litres"]);
  const booked = Number(row["booked"]);
  return {
    batchNo: row["batch_no"]!,
    ratePerLitre: Number(row["rate_per_litre"]),
    saleableLitres: saleable,
    remainingLitres: Math.max(0, saleable - booked),
    bookingCutoff: new Date(row["booking_cutoff"]!).toISOString(),
    deliveryDate: new Date(row["delivery_date"]!).toISOString(),
    deliveryWindow: row["delivery_window"]!,
    deliveryPoints: (row["points"] as unknown as string[]) ?? [],
    status: row["status"] as PublicBatchStatus["status"],
  };
}
