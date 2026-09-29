// Guest orders: the public form for people who collect from a pickup point but have no company
// email or Employee ID.
//
// This is the only unauthenticated write in the app, so everything is decided here and nothing
// is taken on trust: the batch must be open to everyone and before its cutoff, the point must be
// one of the batch's own, the litres must fit the batch's limits and what is left, one phone
// number holds at most one open order per batch, and one network address can place only a few
// orders an hour. The order lands as a Pending request, like an employee's, and a head office
// coordinator confirms it.
import { getDb, type Tx } from "./db/client.server";
import { clientIp } from "./auth/session.server";
import { escapeHtml, layout, sendMail } from "./auth/mail.server";
import { AppError } from "@/lib/app-error";
import {
  guestOrderInput,
  type GuestBookingInfo,
  type GuestOrderInput,
  type GuestOrderResult,
} from "@/lib/guest-order.schemas";

type Row = Record<string, string | number | boolean | Date | null>;

/** Guest orders one network address may place in an hour, so the form can't be flooded. */
const MAX_GUEST_ORDERS_PER_HOUR = 5;

const dhakaDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" });

/**
 * A batch a guest may book: published and open, before its cutoff. The batch's audience is not
 * considered: it decides which employees are emailed, and guests are never on that list anyway.
 */
const OPEN_TO_GUESTS = (sql: Tx | Awaited<ReturnType<typeof getDb>>) => sql`
  b.status = 'Active' and b.booking_cutoff > now()`;

/** The batch the guest page books against, or null when nothing is open. */
export async function getGuestBookingInfo(): Promise<GuestBookingInfo | null> {
  const sql = await getDb();
  const [b] = await sql<Row[]>`
    select b.batch_no, b.rate_per_litre, b.saleable_litres, b.min_order, b.max_order,
           b.employee_cap, b.booking_cutoff, b.delivery_date, b.delivery_window,
           coalesce((select sum(o.litres) from orders o
                     where o.batch_no = b.batch_no and o.status <> 'Cancelled'), 0)::int as booked
    from batches b
    where ${OPEN_TO_GUESTS(sql)}
    order by b.booking_cutoff, b.seq desc
    limit 1`;
  if (!b) return null;

  const points = await sql<Row[]>`
    select p.id, p.name, p.address
    from batch_delivery_points bdp
    join delivery_points p on p.id = bdp.delivery_point_id
    where bdp.batch_no = ${b["batch_no"] as string}
    order by bdp.position, p.name`;

  return {
    batchNo: b["batch_no"] as string,
    ratePerLitre: Number(b["rate_per_litre"]),
    minLitres: Number(b["min_order"]),
    maxLitres: Math.min(Number(b["max_order"]), Number(b["employee_cap"])),
    remainingLitres: Math.max(0, Number(b["saleable_litres"]) - Number(b["booked"])),
    bookingCutoff: new Date(b["booking_cutoff"] as Date).toISOString(),
    deliveryDate: new Date(b["delivery_date"] as Date).toISOString(),
    deliveryWindow: (b["delivery_window"] as string) ?? "",
    points: points.map((p) => ({
      id: p["id"] as string,
      name: p["name"] as string,
      address: (p["address"] as string) ?? "",
    })),
  };
}

/** Places a guest's order request. */
export async function placeGuestOrder(raw: GuestOrderInput): Promise<GuestOrderResult> {
  const parsed = guestOrderInput.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const input = parsed.data;
  const ip = clientIp();
  const sql = await getDb();

  const result = await sql.begin(async (tx) => {
    // Locking the batch row serialises bookings, the same as an employee's: stock can't be
    // oversold by two requests arriving together.
    const [batch] = await tx<Row[]>`
      select b.* from batches b
      where b.batch_no = ${input.batchNo} and ${OPEN_TO_GUESTS(tx)}
      for update`;
    if (!batch) throw new AppError("Booking isn't open for this batch any more.");

    if (ip) {
      const [{ recent }] = (await tx<Row[]>`
        select count(*)::int as recent from orders
        where guest_ip = ${ip} and created_at > now() - interval '1 hour'`) as unknown as [
        { recent: number },
      ];
      if (recent >= MAX_GUEST_ORDERS_PER_HOUR) {
        throw new AppError("Too many orders from here in the last hour. Try again later.");
      }
    }

    const [open] = await tx<Row[]>`
      select order_no from orders
      where batch_no = ${input.batchNo} and employee_id is null
        and guest_phone = ${input.phone} and status <> 'Cancelled'`;
    if (open) {
      throw new AppError(
        `${input.phone} already has order ${open["order_no"] as string} for this batch.`,
      );
    }

    const min = Number(batch["min_order"]);
    const max = Math.min(Number(batch["max_order"]), Number(batch["employee_cap"]));
    if (input.litres < min || input.litres > max) {
      throw new AppError(`Order between ${min} and ${max} L.`);
    }

    const [point] = await tx<Row[]>`
      select p.name from batch_delivery_points bdp
      join delivery_points p on p.id = bdp.delivery_point_id
      where bdp.batch_no = ${input.batchNo} and bdp.delivery_point_id = ${input.deliveryPointId}`;
    if (!point) throw new AppError("Choose one of this batch's pickup points.");

    const [{ booked }] = (await tx<Row[]>`
      select coalesce(sum(litres), 0)::int as booked from orders
      where batch_no = ${input.batchNo} and status <> 'Cancelled'`) as unknown as [
      { booked: number },
    ];
    const remaining = Math.max(0, Number(batch["saleable_litres"]) - booked);
    if (remaining < input.litres) {
      throw new AppError(`Only ${remaining} L are left. Lower the quantity and try again.`);
    }

    const [row] = await tx<Row[]>`
      insert into orders (order_no, employee_id, batch_no, litres, rate, delivery_point_id,
                          status, payment_method, guest_name, guest_phone, guest_email,
                          guest_address, guest_ip)
      values ('ORD-' || nextval('order_no_seq'), null, ${input.batchNo}, ${input.litres},
              ${batch["rate_per_litre"] as string}, ${input.deliveryPointId}, 'Pending',
              ${input.paymentMethod}, ${input.name}, ${input.phone}, ${input.email},
              ${input.address}, ${ip})
      returning order_no, amount`;

    await tx`
      insert into audit_logs (actor, action, record, old_value, new_value)
      values (${`${input.name} (guest)`}, 'Placed guest order request', ${row!["order_no"] as string},
              '—', ${`${input.litres} L`})`;
    await tx`
      insert into notifications (kind, audience, title, body)
      values ('OrderRequest', 'Head Office Coordinator',
              ${`New guest order request ${row!["order_no"] as string}`},
              ${`${input.name} (${input.phone}) requested ${input.litres} L at ${point["name"] as string} — waiting for your confirmation.`})`;

    return {
      orderNo: row!["order_no"] as string,
      litres: input.litres,
      amount: Number(row!["amount"]),
      pointName: point["name"] as string,
      deliveryDate: new Date(batch["delivery_date"] as Date).toISOString(),
      deliveryWindow: (batch["delivery_window"] as string) ?? "",
    } satisfies GuestOrderResult;
  });

  // Committed, so the order stands whatever the mail server says. A receipt they can keep.
  void sendMail({
    to: input.email,
    subject: `Your milk order ${result.orderNo} is received`,
    template: "guest_order_received",
    html: layout(
      "We've received your order",
      `<p>Dear ${escapeHtml(input.name)},</p>
       <p>Your order <strong>${escapeHtml(result.orderNo)}</strong> for
       <strong>${result.litres} L</strong> (Tk ${result.amount}) is received. The head office
       coordinator confirms it before collection.</p>
       <p>Collect from <strong>${escapeHtml(result.pointName)}</strong> on
       ${escapeHtml(dhakaDate(result.deliveryDate))}, ${escapeHtml(result.deliveryWindow)}.
       Pay by ${escapeHtml(input.paymentMethod)} at collection.</p>
       <p style="font-size:13px;color:#64748B;">Quote the order number when you collect.</p>`,
    ),
  }).catch((error: unknown) => console.error("[mail] guest order receipt failed", error));

  return result;
}
