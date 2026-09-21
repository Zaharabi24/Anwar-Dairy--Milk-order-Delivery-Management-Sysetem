// All reads and writes for the app screens. Every call checks the session and
// roles here on the server; every write runs in one transaction (with its audit
// entry and notifications) and returns a fresh snapshot for the caller.
import { getDb, type Tx } from "./db/client.server";
import { requirePermission, requireUser, type SessionUser } from "./auth/session.server";
import { recordPublication } from "./auth/booking-links.server";
import { enqueuePublication } from "./mail/mail-queue.server";
import { AppError } from "@/lib/app-error";
import { startOfDay } from "@/lib/dates";
import { isRoleValue, ROLE_LABEL } from "@/lib/auth-constants";
import { canManageAccount } from "@/lib/permissions";
import type {
  AppNotification,
  AppSettings,
  AppSnapshot,
  AuditLog,
  BatchTotals,
  CancellationRequest,
  CollectionRecord,
  DailyMilkBatch,
  DeliveryPoint,
  DeliveryRecord,
  Employee,
  Order,
} from "@/lib/types";
import type {
  BatchStatusInput,
  CollectionInput,
  ConfirmOrderInput,
  CreateBatchInput,
  DeliveryPointActiveInput,
  DeliveryRecordInput,
  EmployeeActiveInput,
  EmployeeIdInput,
  OrderActionInput,
  OrderReasonInput,
  SaveDeliveryPointInput,
  SaveEmployeeInput,
  SaveSettingsInput,
  UpdateOrderInput,
} from "@/lib/app-data.schemas";

export interface MutationResult<T> {
  result: T;
  snapshot: AppSnapshot;
}

// Raw database rows; they're mapped to the typed app models below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const iso = (value: Date | string) => new Date(value).toISOString();

// Who may do what lives in src/lib/permissions.ts; every write below checks a permission.

// Notification audiences a user sees; a Super Admin also sees what's addressed to System Admins.
const audiencesFor = (roles: SessionUser["roles"]) => [
  "All",
  ...roles.map((r) => ROLE_LABEL[r]),
  ...(roles.includes("super_admin") ? ["System Admin"] : []),
];

const isStaff = (user: SessionUser) => user.roles.some((r) => r !== "employee");

// ---------------------------------------------------------------------------
// Row mapping

const toEmployee = (r: Row): Employee => ({
  id: r.id,
  name: r.name,
  companyEmail: r.company_email,
  phone: r.phone,
  department: r.department,
  designation: r.designation ?? "",
  site: r.site,
  businessUnitCode: r.business_unit_code ?? null,
  active: r.active,
});

const toDeliveryPoint = (r: Row): DeliveryPoint => ({
  id: r.id,
  name: r.name,
  address: r.address,
  coordinatorName: r.coordinator_name,
  active: r.active,
});

const toBatch = (r: Row): DailyMilkBatch => ({
  batchNo: r.batch_no,
  productionDate: iso(r.production_date),
  product: r.product,
  producedLitres: r.produced_litres,
  saleableLitres: r.saleable_litres,
  ratePerLitre: Number(r.rate_per_litre),
  minOrder: r.min_order,
  maxOrder: r.max_order,
  employeeCap: r.employee_cap,
  bookingCutoff: iso(r.booking_cutoff),
  deliveryDate: iso(r.delivery_date),
  deliveryWindow: r.delivery_window,
  deliveryPoints: r.delivery_points ?? [],
  note: r.note,
  status: r.status,
});

const toOrder = (r: Row): Order => ({
  orderNo: r.order_no,
  employeeId: r.employee_id,
  batchNo: r.batch_no,
  litres: r.litres,
  rate: Number(r.rate),
  amount: Number(r.amount),
  deliveryPointId: r.delivery_point_id,
  status: r.status,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  ...(r.payment_method != null ? { paymentMethod: r.payment_method } : {}),
  ...(r.collection_time != null ? { collectionTime: r.collection_time } : {}),
});

const toCancellationRequest = (r: Row): CancellationRequest => ({
  requestNo: r.request_no,
  orderNo: r.order_no,
  employeeId: r.employee_id,
  requestedAt: iso(r.requested_at),
  status: r.status,
  ...(r.decided_at != null ? { decidedAt: iso(r.decided_at) } : {}),
  ...(r.decided_by != null ? { decidedBy: r.decided_by } : {}),
  ...(r.rejection_reason != null ? { rejectionReason: r.rejection_reason } : {}),
});

const toDeliveryRecord = (r: Row): DeliveryRecord => ({
  couponNo: r.coupon_no,
  orderNo: r.order_no,
  recipientName: r.recipient_name,
  contact: r.contact,
  dateTime: iso(r.date_time),
  location: r.location,
  floor: r.floor,
  quantity: r.quantity,
  receiverName: r.receiver_name,
  remarks: r.remarks,
});

const toCollection = (r: Row): CollectionRecord => ({
  orderNo: r.order_no,
  amountDue: Number(r.amount_due),
  amountCollected: Number(r.amount_collected),
  method: r.method,
  reference: r.reference,
  status: r.status,
  collectorName: r.collector_name,
  date: iso(r.date),
});

const toAuditLog = (r: Row): AuditLog => ({
  id: r.id,
  user: r.actor,
  action: r.action,
  record: r.record,
  oldValue: r.old_value,
  newValue: r.new_value,
  timestamp: iso(r.created_at),
});

const toNotification = (r: Row): AppNotification => ({
  id: r.id,
  kind: r.kind,
  audience: r.audience,
  title: r.title,
  body: r.body,
  timestamp: iso(r.created_at),
  read: r.read,
});

const toSettings = (r: Row): AppSettings => ({
  ratePerLitre: Number(r.rate_per_litre),
  bookingCutoff: r.booking_cutoff,
  employeeCap: r.employee_cap,
  minOrder: r.min_order,
  deliveryWindow: r.delivery_window,
  emailAlerts: r.email_alerts,
  smsAlerts: r.sms_alerts,
  autoClose: r.auto_close,
  terms: r.terms,
});

// ---------------------------------------------------------------------------
// Reads

/** Everything the signed-in user may see. Employees without a staff role see only their own records. */
export async function readSnapshot(user?: SessionUser): Promise<AppSnapshot> {
  const me = user ?? (await requireUser());
  const staff = isStaff(me);
  const own = staff ? null : me.employeeId; // null = no per-employee restriction
  const audiences = audiencesFor(me.roles);

  const sql = await getDb();
  const rows = await sql.begin("isolation level repeatable read read only", (tx) =>
    Promise.all([
      tx`select (extract(epoch from clock_timestamp()) * 1000000)::bigint as version`,
      // The roster: everyone who can book milk. Staff-only accounts (invited, no employee role)
      // aren't on it, and neither is anyone deleted -- a row kept back so its orders still have a
      // subject is not a member of the directory and must not be listed as one.
      tx`
        select e.* from employees e
        where (${own}::text is null or e.id = ${own})
          and e.deleted_at is null
          and (e.account_status is null
               or exists (select 1 from user_roles r
                          where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)
               or not exists (select 1 from user_roles r where r.employee_id = e.id and r.revoked_at is null))
        order by e.seq desc`,
      tx`
        select b.*,
               coalesce(array_agg(bdp.delivery_point_id order by bdp.position)
                          filter (where bdp.delivery_point_id is not null), '{}') as delivery_points
        from batches b
        left join batch_delivery_points bdp on bdp.batch_no = b.batch_no
        where ${staff} or b.status <> 'Draft'
        group by b.batch_no
        order by b.seq desc`,
      tx`select code, name from business_units where is_active order by position, name`,
      tx`select * from delivery_points order by seq`,
      tx`select * from orders where ${own}::text is null or employee_id = ${own} order by seq desc`,
      tx`select * from cancellation_requests where ${own}::text is null or employee_id = ${own} order by seq desc`,
      tx`
        select d.* from delivery_records d join orders o on o.order_no = d.order_no
        where ${own}::text is null or o.employee_id = ${own}
        order by d.seq desc`,
      tx`
        select c.* from collections c join orders o on o.order_no = c.order_no
        where ${own}::text is null or o.employee_id = ${own}
        order by c.updated_at desc, c.seq desc`,
      tx`select * from audit_logs where ${staff} order by created_at desc, seq desc`,
      tx`
        select n.*, exists (select 1 from notification_reads r
                            where r.notification_id = n.id and r.employee_id = ${me.employeeId}) as read
        from notifications n
        where n.audience = any(${audiences})
          and (n.recipient_employee_id is null or n.recipient_employee_id = ${me.employeeId})
        order by n.created_at desc, n.seq desc`,
      tx`select * from app_settings limit 1`,
      tx`
        select batch_no, final_booked_litres, final_delivered_litres from batches
        where final_booked_litres is not null`,
    ]),
  );
  const [
    clock,
    employees,
    batches,
    units,
    points,
    orders,
    requests,
    deliveries,
    collections,
    audits,
    notes,
    settings,
    totals,
  ] = rows as unknown as Row[][];

  const batchTotals: Record<string, BatchTotals> = {};
  for (const b of totals!) {
    batchTotals[b.batch_no] = {
      booked: b.final_booked_litres,
      delivered: b.final_delivered_litres ?? 0,
    };
  }

  return {
    version: Number(clock![0]!.version),
    employees: employees!.map(toEmployee),
    businessUnits: units!.map((u) => ({ code: u.code, name: u.name })),
    batches: batches!.map(toBatch),
    batchTotals,
    deliveryPoints: points!.map(toDeliveryPoint),
    orders: orders!.map(toOrder),
    cancellationRequests: requests!.map(toCancellationRequest),
    deliveryRecords: deliveries!.map(toDeliveryRecord),
    collections: collections!.map(toCollection),
    auditLogs: audits!.map(toAuditLog),
    notifications: notes!.map(toNotification),
    settings: toSettings(settings![0]!),
  };
}

// ---------------------------------------------------------------------------
// Write helpers

async function mutate<T>(
  user: SessionUser,
  work: (tx: Tx) => Promise<T>,
): Promise<MutationResult<T>> {
  const sql = await getDb();
  let result: T;
  try {
    result = (await sql.begin((tx) => work(tx))) as T;
  } catch (error) {
    throw toClientError(error);
  }
  return { result, snapshot: await readSnapshot(user) };
}

function toClientError(error: unknown): Error {
  if (error instanceof AppError) return error;
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return new AppError("That record already exists.");
  if (code === "23503")
    return new AppError("That change refers to a record that doesn't exist or is still in use.");
  if (code === "23514") return new AppError("Some values are outside the allowed range.");
  console.error("[db] write failed", error);
  return new AppError("Something went wrong saving your change. Please try again.");
}

function audit(
  tx: Tx,
  entry: { actor: string; action: string; record: string; oldValue: string; newValue: string },
) {
  return tx`
    insert into audit_logs (actor, action, record, old_value, new_value)
    values (${entry.actor}, ${entry.action}, ${entry.record}, ${entry.oldValue}, ${entry.newValue})`;
}

function notify(
  tx: Tx,
  n: {
    kind: AppNotification["kind"];
    audience: AppNotification["audience"];
    title: string;
    body: string;
    recipient?: string;
  },
) {
  return tx`
    insert into notifications (kind, audience, title, body, recipient_employee_id)
    values (${n.kind}, ${n.audience}, ${n.title}, ${n.body}, ${n.recipient ?? null})`;
}

const lock = (tx: Tx, key: number) => tx`select pg_advisory_xact_lock(${key})`;
const LOCK_BATCH_NO = 4_217_002;
const LOCK_EMPLOYEE_ID = 4_217_003;
const LOCK_DELIVERY_POINT_ID = 4_217_004;

async function lockOrder(tx: Tx, orderNo: string): Promise<Row> {
  const [order] = await tx<Row[]>`select * from orders where order_no = ${orderNo} for update`;
  if (!order) throw new AppError(`Order ${orderNo} doesn't exist.`);
  return order;
}

// ---------------------------------------------------------------------------
// Batches

export async function setBatchStatus({ batchNo, status }: BatchStatusInput) {
  const user = await requirePermission("batches.manage");
  // Queued inside the transaction, sent after it commits: the mail server must not be able to
  // hold the publish open, or roll it back by failing.
  let publicationId: string | null = null;
  const outcome = await mutate(user, async (tx) => {
    const [batch] = await tx<
      Row[]
    >`select status, rate_per_litre from batches where batch_no = ${batchNo} for update`;
    if (!batch) throw new AppError(`Batch ${batchNo} doesn't exist.`);
    if (batch.status === status) return;

    if (status === "Closed") {
      await tx`
        update batches set
          status = 'Closed',
          updated_at = now(),
          final_booked_litres = (select coalesce(sum(litres), 0) from orders
                                 where batch_no = ${batchNo} and status <> 'Cancelled'),
          final_delivered_litres = (select coalesce(sum(litres), 0) from orders
                                    where batch_no = ${batchNo} and status = 'Delivered')
        where batch_no = ${batchNo}`;
    } else {
      await tx`update batches set status = ${status}, updated_at = now() where batch_no = ${batchNo}`;
    }

    await audit(tx, {
      actor: user.fullName,
      action: "Changed batch status",
      record: batchNo,
      oldValue: batch.status,
      newValue: status,
    });
    if (status === "Active") {
      await notify(tx, {
        kind: "BatchPublished",
        audience: "All",
        title: "Fresh milk available today",
        body: `Batch ${batchNo} is live at ৳${Number(batch.rate_per_litre)}/L — book before the cut-off.`,
      });
      publicationId = await recordPublication(tx, batchNo, {
        name: user.fullName,
        employeeId: user.employeeId,
      });
    }
  });

  // The rows are committed, so the mail is safe whatever happens next. Handing them to the queue
  // is the last step: the worker sends them at the rate the provider allows, retries what it has
  // to, and carries on across restarts. The operator gets their answer in the meantime -- a full
  // directory is a quarter of an hour of paced sending, which is nobody's page load.
  if (publicationId) {
    const id = publicationId as string;
    void enqueuePublication(id).catch((error: unknown) =>
      console.error("[mail] queueing booking links failed", error),
    );
  }
  return outcome;
}

export async function createBatch({ batch }: CreateBatchInput) {
  const user = await requirePermission("batches.manage");
  return mutate(user, async (tx): Promise<DailyMilkBatch> => {
    if (batch.saleableLitres > batch.producedLitres)
      throw new AppError("Saleable litres cannot exceed produced litres.");
    if (batch.minOrder > batch.maxOrder)
      throw new AppError("Minimum order cannot be above the maximum.");

    // The schedule has to describe a day that can actually happen. The form keeps these in step
    // as they are chosen, but it is the client, so the rules are settled here.
    const produced = new Date(batch.productionDate);
    const cutoff = new Date(batch.bookingCutoff);
    const delivery = new Date(batch.deliveryDate);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (produced > endOfToday) throw new AppError("The production date can't be in the future.");
    if (delivery < startOfDay(produced))
      throw new AppError("Delivery can't be before the milk was produced.");
    if (cutoff <= new Date())
      throw new AppError("Bookings would already be closed. Choose a later cut-off.");
    if (cutoff > delivery)
      throw new AppError("Bookings must close before the milk is handed over.");

    // Checked before anything is written, so a delivery point that isn't on this system gives a
    // plain answer instead of a foreign key violation reported as "a record that doesn't exist".
    // An empty list is already refused by the schema (deliveryPoints is .min(1)).
    const points = [...new Set(batch.deliveryPoints)];
    const known = await tx<Row[]>`
      select id, active from delivery_points where id = any(${points}::text[])`;
    const missing = points.filter((id) => !known.some((p) => p.id === id));
    if (missing.length) {
      throw new AppError(
        `No delivery point exists for ${missing.join(", ")}. Add it under Delivery points, then try again.`,
      );
    }
    const inactive = known.filter((p) => !p.active).map((p) => p.id as string);
    if (inactive.length) {
      throw new AppError(`${inactive.join(", ")} is no longer active. Choose another point.`);
    }

    await lock(tx, LOCK_BATCH_NO);
    const [{ next }] = (await tx<Row[]>`
      select coalesce(max(substring(batch_no from '^BATCH-([0-9]+)$')::int), 2400) + 1 as next
      from batches`) as unknown as [{ next: number }];
    const batchNo = `BATCH-${next}`;

    await tx`insert into batches ${tx({
      batch_no: batchNo,
      production_date: batch.productionDate,
      product: batch.product,
      produced_litres: batch.producedLitres,
      saleable_litres: batch.saleableLitres,
      rate_per_litre: batch.ratePerLitre,
      min_order: batch.minOrder,
      max_order: batch.maxOrder,
      employee_cap: batch.employeeCap,
      booking_cutoff: batch.bookingCutoff,
      delivery_date: batch.deliveryDate,
      delivery_window: batch.deliveryWindow,
      note: batch.note,
      status: "Draft",
    })}`;
    await tx`insert into batch_delivery_points ${tx(
      points.map((id, position) => ({ batch_no: batchNo, delivery_point_id: id, position })),
    )}`;

    await audit(tx, {
      actor: user.fullName,
      action: "Created batch",
      record: batchNo,
      oldValue: "—",
      newValue: "Draft",
    });
    return { ...batch, deliveryPoints: points, batchNo, status: "Draft" };
  });
}

// ---------------------------------------------------------------------------
// Orders

export async function confirmOrder(input: ConfirmOrderInput) {
  // Anyone signed in books for themselves; the employee ID comes from the session.
  const user = await requirePermission("orders.book");
  return mutate(user, async (tx): Promise<Order> => {
    // Locking the batch row serialises bookings, so stock can never be oversold.
    const [batch] = await tx<
      Row[]
    >`select * from batches where batch_no = ${input.batchNo} for update`;
    if (!batch || batch.status !== "Active")
      throw new AppError("Booking isn't open for this batch right now.");
    if (new Date(batch.booking_cutoff).getTime() < Date.now()) {
      throw new AppError("Bookings closed at the cut-off time for today.");
    }

    const [employee] = await tx<Row[]>`select active from employees where id = ${user.employeeId}`;
    if (!employee?.active)
      throw new AppError("Your employee record is inactive, so you can't book milk.");

    const maxAllowed = Math.min(batch.max_order, batch.employee_cap);
    if (input.litres < batch.min_order || input.litres > maxAllowed) {
      throw new AppError(`Order between ${batch.min_order} and ${maxAllowed} L.`);
    }

    const [point] = await tx<Row[]>`
      select 1 from batch_delivery_points
      where batch_no = ${input.batchNo} and delivery_point_id = ${input.deliveryPointId}`;
    if (!point) throw new AppError("Choose one of this batch's delivery points.");

    const [{ booked }] = (await tx<Row[]>`
      select coalesce(sum(litres), 0)::int as booked from orders
      where batch_no = ${input.batchNo} and status <> 'Cancelled'`) as unknown as [
      { booked: number },
    ];
    const remaining = Math.max(0, batch.saleable_litres - booked);
    if (remaining < input.litres) {
      throw new AppError(`Only ${remaining} L are left — lower your quantity and try again.`);
    }

    const [row] = await tx<Row[]>`
      insert into orders (order_no, employee_id, batch_no, litres, rate, delivery_point_id,
                          status, payment_method, collection_time)
      values ('ORD-' || nextval('order_no_seq'), ${user.employeeId}, ${input.batchNo}, ${input.litres},
              ${batch.rate_per_litre}, ${input.deliveryPointId}, 'Pending', ${input.paymentMethod},
              ${input.collectionTime})
      returning *`;
    const order = toOrder(row);

    await audit(tx, {
      actor: user.fullName,
      action: "Placed order request",
      record: order.orderNo,
      oldValue: "—",
      newValue: `${input.litres} L`,
    });
    await notify(tx, {
      kind: "OrderRequest",
      audience: "Head Office Coordinator",
      title: `New order request ${order.orderNo}`,
      body: `${input.litres} L requested for ${batch.delivery_window} — waiting for your confirmation.`,
    });
    return order;
  });
}

export async function approveOrder({ orderNo }: OrderActionInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    if (order.status !== "Pending") return;
    await tx`update orders set status = 'Confirmed', updated_at = now() where order_no = ${orderNo}`;
    await audit(tx, {
      actor: user.fullName,
      action: "Confirmed order request",
      record: orderNo,
      oldValue: "Pending",
      newValue: "Confirmed",
    });
    await notify(tx, {
      kind: "OrderConfirmed",
      audience: "Employee",
      recipient: order.employee_id,
      title: `Order ${orderNo} confirmed`,
      body: `${order.litres} L confirmed by the head office coordinator.`,
    });
  });
}

export async function cancelOrder({ orderNo, reason }: OrderReasonInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    if (order.status === "Cancelled") return;
    await tx`update orders set status = 'Cancelled', updated_at = now() where order_no = ${orderNo}`;
    await audit(tx, {
      actor: user.fullName,
      action: `Cancelled order — ${reason}`,
      record: orderNo,
      oldValue: order.status,
      newValue: "Cancelled",
    });
    await notify(tx, {
      kind: "OrderCancelled",
      audience: "Employee",
      recipient: order.employee_id,
      title: `Order ${orderNo} cancelled`,
      body: `Reason: ${reason}. The litres are back in the pool.`,
    });
  });
}

export async function requestCancellation({ orderNo }: OrderActionInput) {
  const user = await requirePermission("orders.book");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    if (order.employee_id !== user.employeeId)
      throw new AppError("You can only cancel your own orders.");
    if (order.status === "CancellationRequested" || order.status === "Cancelled") return;
    const [pending] = await tx<Row[]>`
      select 1 from cancellation_requests where order_no = ${orderNo} and status = 'Pending'`;
    if (pending) return;

    const [request] = await tx<Row[]>`
      insert into cancellation_requests (request_no, order_no, employee_id)
      values ('CR-' || nextval('cancellation_request_no_seq'), ${orderNo}, ${order.employee_id})
      returning request_no`;
    await tx`update orders set status = 'CancellationRequested', updated_at = now() where order_no = ${orderNo}`;

    await audit(tx, {
      actor: user.fullName,
      action: `Requested order cancellation (${request.request_no})`,
      record: orderNo,
      oldValue: order.status,
      newValue: "Cancellation requested",
    });
    await notify(tx, {
      kind: "CancellationRequested",
      audience: "Head Office Coordinator",
      title: `Cancellation request ${request.request_no}`,
      body: `Order ${orderNo} (${order.litres} L) — waiting for your approval.`,
    });
  });
}

export async function approveCancellation({ orderNo }: OrderActionInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    const [request] = await tx<Row[]>`
      update cancellation_requests
      set status = 'Approved', decided_at = now(), decided_by = ${user.fullName}
      where order_no = ${orderNo} and status = 'Pending'
      returning request_no`;
    if (!request) return;
    await tx`update orders set status = 'Cancelled', updated_at = now() where order_no = ${orderNo}`;
    await audit(tx, {
      actor: user.fullName,
      action: `Approved cancellation request ${request.request_no}`,
      record: orderNo,
      oldValue: "Cancellation requested",
      newValue: "Cancelled",
    });
    await notify(tx, {
      kind: "CancellationApproved",
      audience: "Employee",
      recipient: order.employee_id,
      title: `Order ${orderNo} cancelled`,
      body: "Your order cancellation has been approved.",
    });
  });
}

export async function rejectCancellation({ orderNo, reason }: OrderReasonInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    const [request] = await tx<Row[]>`
      update cancellation_requests
      set status = 'Rejected', decided_at = now(), decided_by = ${user.fullName}, rejection_reason = ${reason}
      where order_no = ${orderNo} and status = 'Pending'
      returning request_no`;
    if (!request) return;
    await tx`update orders set status = 'Confirmed', updated_at = now() where order_no = ${orderNo}`;
    await audit(tx, {
      actor: user.fullName,
      action: `Rejected cancellation request ${request.request_no} — ${reason}`,
      record: orderNo,
      oldValue: "Cancellation requested",
      newValue: "Confirmed",
    });
    await notify(tx, {
      kind: "CancellationRejected",
      audience: "Employee",
      recipient: order.employee_id,
      title: `Cancellation rejected for ${orderNo}`,
      body: `Reason: ${reason}. Your order stays confirmed.`,
    });
  });
}

export async function updateOrder({ orderNo, patch, reason }: UpdateOrderInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx) => {
    const order = await lockOrder(tx, orderNo);
    const nextLitres = patch.litres ?? order.litres;
    const nextStatus = patch.status ?? order.status;

    if (nextLitres !== order.litres) {
      const [batch] = await tx<
        Row[]
      >`select saleable_litres from batches where batch_no = ${order.batch_no} for update`;
      const [{ others }] = (await tx<Row[]>`
        select coalesce(sum(litres), 0)::int as others from orders
        where batch_no = ${order.batch_no} and status <> 'Cancelled' and order_no <> ${orderNo}`) as unknown as [
        { others: number },
      ];
      const available = batch.saleable_litres - others;
      if (nextStatus !== "Cancelled" && nextLitres > available) {
        throw new AppError(`Only ${Math.max(0, available)} L are available for this order.`);
      }
    }

    await tx`
      update orders set litres = ${nextLitres}, status = ${nextStatus}, updated_at = now()
      where order_no = ${orderNo}`;
    await audit(tx, {
      actor: user.fullName,
      action: `Adjusted order — ${reason}`,
      record: orderNo,
      oldValue: `${order.litres} L / ${order.status}`,
      newValue: `${nextLitres} L / ${nextStatus}`,
    });
    if (patch.status === "OutForDelivery") {
      await notify(tx, {
        kind: "OutForDelivery",
        audience: "Employee",
        recipient: order.employee_id,
        title: `Order ${orderNo} is on the way`,
        body: "Your milk has left the store — please collect it from your delivery point.",
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Fulfillment and collections

export async function addDeliveryRecord(record: DeliveryRecordInput) {
  const user = await requirePermission("orders.manage");
  return mutate(user, async (tx): Promise<DeliveryRecord> => {
    const [row] = await tx<Row[]>`
      insert into delivery_records (coupon_no, order_no, recipient_name, contact, date_time,
                                    location, floor, quantity, receiver_name, remarks)
      values ('DC-' || nextval('coupon_no_seq'), ${record.orderNo}, ${record.recipientName}, ${record.contact},
              ${record.dateTime}, ${record.location}, ${record.floor}, ${record.quantity},
              ${record.receiverName}, ${record.remarks})
      returning *`;
    return toDeliveryRecord(row);
  });
}

const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

export async function upsertCollection(record: CollectionInput) {
  const user = await requirePermission("collections.manage");
  return mutate(user, async (tx) => {
    // The amount due always comes from the order itself, never from the client.
    const order = await lockOrder(tx, record.orderNo);
    const due = Number(order.amount);
    if (record.amountCollected > due)
      throw new AppError(`Collected amount can't exceed ${taka(due)}.`);
    const status =
      record.amountCollected === 0 ? "Unpaid" : record.amountCollected >= due ? "Paid" : "Partial";
    const [previous] = await tx<
      Row[]
    >`select amount_collected from collections where order_no = ${record.orderNo}`;

    await tx`
      insert into collections (order_no, amount_due, amount_collected, method, reference, status,
                               collector_name, date, updated_at)
      values (${record.orderNo}, ${due}, ${record.amountCollected}, ${record.method}, ${record.reference},
              ${status}, ${user.fullName}, ${record.date}, now())
      on conflict (order_no) do update set
        amount_due = excluded.amount_due,
        amount_collected = excluded.amount_collected,
        method = excluded.method,
        reference = excluded.reference,
        status = excluded.status,
        collector_name = excluded.collector_name,
        date = excluded.date,
        updated_at = now()`;

    await audit(tx, {
      actor: user.fullName,
      action: `Recorded payment — ${record.method}`,
      record: record.orderNo,
      oldValue: taka(Number(previous?.amount_collected ?? 0)),
      newValue: taka(record.amountCollected),
    });
    if (status !== "Paid") {
      await notify(tx, {
        kind: "PaymentDue",
        audience: "Head Office Coordinator",
        title: `Payment outstanding on ${record.orderNo}`,
        body: `${taka(due - record.amountCollected)} still to be collected.`,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Notifications

export async function markNotificationsRead() {
  const user = await requireUser();
  const audiences = audiencesFor(user.roles);
  return mutate(user, async (tx) => {
    await tx`
      insert into notification_reads (notification_id, employee_id)
      select n.id, ${user.employeeId} from notifications n
      where n.audience = any(${audiences})
        and (n.recipient_employee_id is null or n.recipient_employee_id = ${user.employeeId})
      on conflict do nothing`;
  });
}

// ---------------------------------------------------------------------------
// Employees (the roster; sign-in accounts are managed in the account console)

export async function saveEmployee({ employee, isNew }: SaveEmployeeInput) {
  const user = await requirePermission("roster.manage");
  return mutate(user, async (tx): Promise<Employee> => {
    if (!employee.name.trim()) throw new AppError("The employee needs a name.");

    // Two people in the directory genuinely share one address, so a repeat is not by itself an
    // error. What can't be shared is an address someone signs in with: it is their identity at
    // the door and where a password reset is sent.
    if (employee.companyEmail) {
      const [taken] = await tx<Row[]>`
        select id from employees
        where lower(company_email) = lower(${employee.companyEmail})
          and id <> ${employee.id} and account_status is not null`;
      if (taken) {
        throw new AppError(`${employee.companyEmail} is the sign-in address for ${taken.id}.`);
      }
    }

    if (isNew) {
      await lock(tx, LOCK_EMPLOYEE_ID);
      // Directory entries are keyed by the company's own employee ID, which is what the file
      // supplies and what everyone already knows themselves by. An ID typed on the form is used
      // as given; only when one isn't offered does the system fall back to minting an EMP- one.
      const typed = employee.id.trim();
      if (typed) {
        // Checked here rather than left to the column constraint, which can only answer "some
        // values are outside the allowed range" -- a message that names neither the field nor the
        // rule, and reads like the system is broken rather than like the ID needs fixing.
        if (!/^[A-Za-z0-9._/-]{1,32}$/.test(typed)) {
          throw new AppError(
            `"${typed}" can't be used as an Employee ID. Use letters, digits, and . _ - / only, with no spaces.`,
          );
        }
        const [clash] = await tx<Row[]>`
          select id, name from employees where lower(id) = lower(${typed})`;
        if (clash) {
          throw new AppError(
            `Employee ID ${typed} already belongs to ${clash["name"] as string}. Use a different ID, or edit that record instead.`,
          );
        }
      }
      const [{ next }] = (await tx<Row[]>`
        select coalesce(max(substring(id from '^EMP-([0-9]+)$')::int), 1000) + 1 as next
        from employees`) as unknown as [{ next: number }];
      const newId = typed || `EMP-${next}`;
      if (employee.businessUnitCode) {
        const [unit] = await tx<Row[]>`
          select code from business_units where code = ${employee.businessUnitCode}`;
        if (!unit) {
          throw new AppError(`${employee.businessUnitCode} isn't one of the business units.`);
        }
      }
      const [row] = await tx<Row[]>`
        insert into employees (id, name, company_email, phone, department, designation, site,
                               business_unit_code, active)
        values (${newId}, ${employee.name}, ${employee.companyEmail}, ${employee.phone},
                ${employee.department}, ${employee.designation}, ${employee.site},
                ${employee.businessUnitCode || null}, ${employee.active})
        returning *`;
      // Being in the directory is what makes someone bookable: it is this role that lets the link
      // mailed on publish open a booking session and place an order in their name. It grants no
      // sign-in, which needs account_status (migration 0002).
      await tx`
        insert into user_roles (employee_id, role, granted_by)
        values (${newId}, 'employee', ${user.fullName})
        on conflict do nothing`;
      await audit(tx, {
        actor: user.fullName,
        action: "Added employee",
        record: row.id,
        oldValue: "—",
        newValue: employee.name,
      });
      return toEmployee(row);
    }

    const [row] = await tx<Row[]>`
      update employees set
        name = ${employee.name}, company_email = ${employee.companyEmail}, phone = ${employee.phone},
        department = ${employee.department}, designation = ${employee.designation},
        site = ${employee.site},
        business_unit_code = ${employee.businessUnitCode || null}, active = ${employee.active},
        updated_at = now()
      where id = ${employee.id}
      returning *`;
    if (!row) throw new AppError(`Employee ${employee.id} doesn't exist.`);
    await audit(tx, {
      actor: user.fullName,
      action: "Edited employee",
      record: employee.id,
      oldValue: "Previous details",
      newValue: employee.name,
    });
    return toEmployee(row);
  });
}

/**
 * Removes someone from the Employee Database.
 *
 * "Delete" means gone from the directory: off every list, never emailed when a batch is
 * published, and unable to sign in or open a booking link. It always succeeds, whether or not the
 * person had an account or has been ordering milk for a year.
 *
 * How the row goes depends on whether anything still points at it. With nothing attached, the row
 * is deleted outright. With orders attached it is retained and marked deleted instead, because
 * `orders.employee_id` is `on delete restrict` and for good reason: batch reconciliation,
 * collections and the revenue reports all read those orders, and an order whose subject had been
 * erased would take a hole in the day's figures with it. Migration 0005 set this up -- a deleted
 * account keeps its row as a historical record that orders stay attached to. A retained row is
 * not in the directory in any sense a user can see; it exists so the books still add up.
 *
 * Either way the account is ended with it: roles revoked, sessions killed, booking links
 * withdrawn, password removed, and the address freed so it can be used again.
 */
export async function deleteEmployee({ id }: EmployeeIdInput) {
  const user = await requirePermission("roster.manage");
  return mutate(user, async (tx) => {
    const [employee] = await tx<Row[]>`
      select id, name, company_email, account_status, deleted_at
      from employees where id = ${id} for update`;
    if (!employee) throw new AppError(`Employee ${id} doesn't exist.`);
    if (employee.deleted_at) throw new AppError(`${employee.name} has already been deleted.`);
    if (id === user.employeeId) throw new AppError("You can't delete yourself.");

    // The one refusal that stays. Roster management is a System Admin's and a Super Admin's to
    // use on the directory; it is not a way around the seniority rules for accounts, which is
    // what deleting the row of somebody who outranks you would be.
    const heldRoles = (
      await tx<Row[]>`
        select role from user_roles where employee_id = ${id} and revoked_at is null`
    )
      .map((r) => r.role as string)
      .filter(isRoleValue);
    if (heldRoles.length && !canManageAccount(user.roles, heldRoles)) {
      throw new AppError(
        `${employee.name} holds ${heldRoles.map((r) => ROLE_LABEL[r]).join(", ")}, which is above what you can manage.`,
      );
    }

    // Whatever the person is holding stops working now, on either path.
    await tx`update user_roles set revoked_at = now(), revoked_by = ${user.fullName}
             where employee_id = ${id} and revoked_at is null`;
    await tx`update sessions set revoked_at = now()
             where employee_id = ${id} and revoked_at is null`;
    await tx`update booking_links set revoked_at = now()
             where employee_id = ${id} and revoked_at is null`;

    const [attached] = await tx<Row[]>`
      select exists (select 1 from orders where employee_id = ${id})
          or exists (select 1 from cancellation_requests where employee_id = ${id}) as any_orders`;

    if (attached?.any_orders) {
      // Retained, and out of the directory. The address moves to former_company_email so the same
      // person can be added again later, or a colleague can inherit it, without a clash.
      await tx`
        update employees set
          deleted_at = now(),
          deleted_by = ${user.fullName},
          former_company_email = case when company_email <> '' then company_email
                                      else former_company_email end,
          company_email = '',
          account_status = null,
          password_hash = null,
          active = false,
          updated_at = now()
        where id = ${id}`;
    } else {
      await tx`delete from employees where id = ${id}`;
    }

    await audit(tx, {
      actor: user.fullName,
      action: "Deleted employee",
      record: id,
      oldValue: employee.name as string,
      newValue: attached?.any_orders ? "Deleted (order history kept)" : "Deleted",
    });
    return { retainedForHistory: !!attached?.any_orders };
  });
}

export async function setEmployeeActive({ id, active }: EmployeeActiveInput) {
  const user = await requirePermission("roster.manage");
  return mutate(user, async (tx) => {
    const [employee] = await tx<Row[]>`select active from employees where id = ${id} for update`;
    if (!employee) throw new AppError(`Employee ${id} doesn't exist.`);
    if (employee.active === active) return;
    await tx`update employees set active = ${active}, updated_at = now() where id = ${id}`;
    await audit(tx, {
      actor: user.fullName,
      action: active ? "Activated employee" : "Deactivated employee",
      record: id,
      oldValue: active ? "Inactive" : "Active",
      newValue: active ? "Active" : "Inactive",
    });
  });
}

// ---------------------------------------------------------------------------
// Delivery points

export async function saveDeliveryPoint({ point, isNew }: SaveDeliveryPointInput) {
  const user = await requirePermission("delivery_points.manage");
  return mutate(user, async (tx): Promise<DeliveryPoint> => {
    if (isNew) {
      await lock(tx, LOCK_DELIVERY_POINT_ID);
      const slug =
        point.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "point";
      const base = `dp-${slug}`;
      const existing = new Set(
        (
          await tx<
            Row[]
          >`select id from delivery_points where id = ${base} or id like ${`${base}-%`}`
        ).map((r) => r.id),
      );
      let id = base;
      for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;

      const [row] = await tx<Row[]>`
        insert into delivery_points (id, name, address, coordinator_name, active)
        values (${id}, ${point.name}, ${point.address}, ${point.coordinatorName}, ${point.active})
        returning *`;
      await audit(tx, {
        actor: user.fullName,
        action: "Added delivery point",
        record: id,
        oldValue: "—",
        newValue: point.name,
      });
      return toDeliveryPoint(row);
    }

    const [row] = await tx<Row[]>`
      update delivery_points set
        name = ${point.name}, address = ${point.address}, coordinator_name = ${point.coordinatorName},
        active = ${point.active}, updated_at = now()
      where id = ${point.id}
      returning *`;
    if (!row) throw new AppError(`Delivery point ${point.id} doesn't exist.`);
    await audit(tx, {
      actor: user.fullName,
      action: "Edited delivery point",
      record: point.id,
      oldValue: "Previous details",
      newValue: point.name,
    });
    return toDeliveryPoint(row);
  });
}

export async function setDeliveryPointActive({ id, active }: DeliveryPointActiveInput) {
  const user = await requirePermission("delivery_points.manage");
  return mutate(user, async (tx) => {
    const [point] = await tx<Row[]>`select active from delivery_points where id = ${id} for update`;
    if (!point) throw new AppError(`Delivery point ${id} doesn't exist.`);
    if (point.active === active) return;
    await tx`update delivery_points set active = ${active}, updated_at = now() where id = ${id}`;
    await audit(tx, {
      actor: user.fullName,
      action: active ? "Enabled delivery point" : "Disabled delivery point",
      record: id,
      oldValue: active ? "Inactive" : "Active",
      newValue: active ? "Active" : "Inactive",
    });
  });
}

// ---------------------------------------------------------------------------
// Settings

export async function saveSettings({ settings }: SaveSettingsInput) {
  const user = await requirePermission("settings.manage");
  return mutate(user, async (tx) => {
    await tx`
      update app_settings set
        rate_per_litre = ${settings.ratePerLitre}, booking_cutoff = ${settings.bookingCutoff},
        employee_cap = ${settings.employeeCap}, min_order = ${settings.minOrder},
        delivery_window = ${settings.deliveryWindow}, email_alerts = ${settings.emailAlerts},
        sms_alerts = ${settings.smsAlerts}, auto_close = ${settings.autoClose}, terms = ${settings.terms},
        updated_at = now()`;
    await audit(tx, {
      actor: user.fullName,
      action: "Updated system settings",
      record: "SETTINGS",
      oldValue: "Previous defaults",
      newValue: `৳${settings.ratePerLitre}/L, cutoff ${settings.bookingCutoff}, cap ${settings.employeeCap} L`,
    });
  });
}
