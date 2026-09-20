// Loads the prototype's demo data into an empty database (SEED_DEMO_DATA, default on).
// Rows are inserted oldest-first so `order by seq desc` lists them as the screens expect.
import type postgres from "postgres";
import { hashPassword } from "../auth/crypto.server";
import type { RoleValue } from "@/lib/auth-constants";
import {
  auditLogs,
  batchTotals,
  batches,
  collections,
  deliveryPoints,
  deliveryRecords,
  employees,
  notifications,
  orders,
} from "./demo-data";

const reversed = <T>(list: T[]) => [...list].reverse();

export async function seedDemoData(tx: postgres.TransactionSql): Promise<boolean> {
  // Delivery points are seeded on their own, because a batch can't be created without one and
  // the Employee Database import (migration 0009) fills the employees table before this runs --
  // which would otherwise leave a fresh database with a full directory and nowhere to collect.
  const [points] = await tx<{ empty: boolean }[]>`
    select not exists (select 1 from delivery_points) as empty`;
  if (points?.empty) {
    await tx`insert into delivery_points ${tx(
      deliveryPoints.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        coordinator_name: p.coordinatorName,
        active: p.active,
      })),
    )}`;
  }

  // The demo roster, batches and orders only make sense on a database that has neither. Once the
  // real directory is in place, eight invented employees are not something to add beside it.
  const [state] = await tx<{ empty: boolean }[]>`
    select not exists (select 1 from employees) and not exists (select 1 from batches) as empty`;
  if (!state?.empty) return false;

  await tx`insert into employees ${tx(
    reversed(employees).map((e) => ({
      id: e.id,
      name: e.name,
      company_email: e.companyEmail,
      phone: e.phone,
      department: e.department,
      site: e.site,
      active: e.active,
    })),
  )}`;

  for (const b of reversed(batches)) {
    const totals = batchTotals[b.batchNo];
    await tx`insert into batches ${tx({
      batch_no: b.batchNo,
      production_date: b.productionDate,
      product: b.product,
      produced_litres: b.producedLitres,
      saleable_litres: b.saleableLitres,
      rate_per_litre: b.ratePerLitre,
      min_order: b.minOrder,
      max_order: b.maxOrder,
      employee_cap: b.employeeCap,
      booking_cutoff: b.bookingCutoff,
      delivery_date: b.deliveryDate,
      delivery_window: b.deliveryWindow,
      note: b.note,
      status: b.status,
      final_booked_litres: totals?.booked ?? null,
      final_delivered_litres: totals?.delivered ?? null,
    })}`;
    await tx`insert into batch_delivery_points ${tx(
      b.deliveryPoints.map((id, position) => ({
        batch_no: b.batchNo,
        delivery_point_id: id,
        position,
      })),
    )}`;
  }

  await tx`insert into orders ${tx(
    reversed(orders).map((o) => ({
      order_no: o.orderNo,
      employee_id: o.employeeId,
      batch_no: o.batchNo,
      litres: o.litres,
      rate: o.rate,
      delivery_point_id: o.deliveryPointId,
      status: o.status,
      payment_method: o.paymentMethod ?? null,
      collection_time: o.collectionTime ?? null,
      created_at: o.createdAt,
    })),
  )}`;

  await tx`insert into delivery_records ${tx(
    reversed(deliveryRecords).map((d) => ({
      coupon_no: d.couponNo,
      order_no: d.orderNo,
      recipient_name: d.recipientName,
      contact: d.contact,
      date_time: d.dateTime,
      location: d.location,
      floor: d.floor,
      quantity: d.quantity,
      receiver_name: d.receiverName,
      remarks: d.remarks,
    })),
  )}`;

  await tx`insert into collections ${tx(
    reversed(collections).map((c) => ({
      order_no: c.orderNo,
      amount_due: c.amountDue,
      amount_collected: c.amountCollected,
      method: c.method,
      reference: c.reference,
      status: c.status,
      collector_name: c.collectorName,
      date: c.date,
    })),
  )}`;

  await tx`insert into audit_logs ${tx(
    reversed(auditLogs).map((a) => ({
      id: a.id,
      actor: a.user,
      action: a.action,
      record: a.record,
      old_value: a.oldValue,
      new_value: a.newValue,
      created_at: a.timestamp,
    })),
  )}`;

  await tx`insert into notifications ${tx(
    reversed(notifications).map((n) => ({
      id: n.id,
      kind: n.kind,
      audience: n.audience,
      title: n.title,
      body: n.body,
      created_at: n.timestamp,
    })),
  )}`;

  return true;
}

// ---------------------------------------------------------------------------
// Sign-in accounts

export const DEMO_ACCOUNTS: Array<{
  id: string;
  name: string;
  email: string;
  department: string;
  site: string;
  roles: RoleValue[];
}> = [
  // Two System Admins: the person who approves everyone can't approve themselves.
  {
    id: "EMP-0001",
    name: "Farid Hasan",
    email: "farid.hasan@anwargroup.net",
    department: "IT",
    site: "Head Office – Gulshan",
    roles: ["employee", "system_admin"],
  },
  {
    id: "EMP-0002",
    name: "Sadia Rahman",
    email: "sadia.rahman@anwargroup.net",
    department: "Admin",
    site: "Head Office – Gulshan",
    roles: ["employee", "system_admin"],
  },
  {
    id: "EMP-1002",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@anwargroup.net",
    department: "Admin",
    site: "Head Office – Gulshan",
    roles: ["employee", "head_office_coordinator"],
  },
  {
    id: "EMP-1003",
    name: "Kamal Hossain",
    email: "kamal.hossain@anwargroup.net",
    department: "Production",
    site: "Savar Factory",
    roles: ["employee", "factory_operator"],
  },
  {
    id: "EMP-1006",
    name: "Ayesha Siddika",
    email: "ayesha.siddika@anwargroup.net",
    department: "HR",
    site: "Head Office – Gulshan",
    roles: ["employee"],
  },
];

async function createAccount(
  tx: postgres.TransactionSql,
  a: {
    id: string;
    name: string;
    email: string;
    department: string;
    site: string;
    roles: RoleValue[];
  },
  passwordHash: string,
) {
  await tx`
    insert into employees (id, name, company_email, department, site, active, date_of_birth,
                           business_unit_code, office_code, account_status, password_hash, activated_at)
    values (${a.id}, ${a.name}, ${a.email}, ${a.department}, ${a.site}, true, '1990-01-01',
            'AGL', 'AGI_HO', 'active', ${passwordHash}, now())
    on conflict (id) do update set
      company_email = excluded.company_email, date_of_birth = excluded.date_of_birth,
      business_unit_code = excluded.business_unit_code, office_code = excluded.office_code,
      account_status = 'active', password_hash = excluded.password_hash,
      activated_at = now(), active = true`;
  for (const role of a.roles) {
    await tx`insert into user_roles (employee_id, role) values (${a.id}, ${role}) on conflict do nothing`;
  }
}

/** Demo accounts for trying every role locally (SEED_DEMO_DATA). Password: DEMO_PASSWORD. */
export async function seedDemoAccounts(tx: postgres.TransactionSql): Promise<void> {
  // Company accounts must be @anwargroup.net; fix older demo rosters seeded with the old domain.
  await tx`
    update employees set company_email = replace(company_email, '@anwaragro.com', '@anwargroup.net')
    where company_email like '%@anwaragro.com'
      and not exists (select 1 from employees e2
                      where lower(e2.company_email) = lower(replace(employees.company_email, '@anwaragro.com', '@anwargroup.net')))`;
  const passwordHash = await hashPassword(process.env["DEMO_PASSWORD"] || "Demo@12345");
  for (const account of DEMO_ACCOUNTS) await createAccount(tx, account, passwordHash);
}

/** Demo Super Admin (staff portal only, no employee role). Password: DEMO_PASSWORD. */
export async function seedDemoSuperAdmin(tx: postgres.TransactionSql): Promise<void> {
  const passwordHash = await hashPassword(process.env["DEMO_PASSWORD"] || "Demo@12345");
  await tx`
    insert into employees (id, name, company_email, department, site, active,
                           account_status, password_hash, activated_at)
    values ('STF-0001', 'Rahima Chowdhury', 'superadmin@anwargroup.net', 'Admin', 'Head Office – Gulshan',
            false, 'active', ${passwordHash}, now())
    on conflict (id) do nothing`;
  await tx`select setval('staff_id_seq', greatest((select last_value from staff_id_seq), 1))`;
  await tx`insert into user_roles (employee_id, role) values ('STF-0001', 'super_admin') on conflict do nothing`;
}

/**
 * Legacy first System Admin (BOOTSTRAP_ADMIN_*). Prefer SUPER_ADMIN_EMAIL, which invites a
 * Super Admin who then invites System Admins. Only acts while no active System Admin exists.
 */
export async function bootstrapAdmin(tx: postgres.TransactionSql): Promise<boolean> {
  const id = process.env["BOOTSTRAP_ADMIN_EMPLOYEE_ID"]?.trim();
  const name = process.env["BOOTSTRAP_ADMIN_NAME"]?.trim();
  const email = process.env["BOOTSTRAP_ADMIN_EMAIL"]?.trim().toLowerCase();
  const password = process.env["BOOTSTRAP_ADMIN_PASSWORD"];
  if (!id || !name || !email || !password) return false;

  const [exists] = await tx`
    select 1 from user_roles r join employees e on e.id = r.employee_id
    where r.role = 'system_admin' and r.revoked_at is null and e.account_status = 'active'`;
  if (exists) return false;
  if (password.length < 8)
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.");

  await createAccount(
    tx,
    {
      id,
      name,
      email,
      department: "Admin",
      site: "Head Office – Gulshan",
      roles: ["employee", "system_admin"],
    },
    await hashPassword(password),
  );
  return true;
}
