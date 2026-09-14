-- Anwar Fresh core schema.
-- `seq` columns keep insertion order so lists render newest-first (or in the
-- order they were added) exactly as the screens expect.

create table employees (
  seq           bigint generated always as identity,
  id            text primary key check (id ~ '^EMP-[0-9]+$'),
  name          text not null check (length(btrim(name)) > 0),
  company_email text not null check (company_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text not null default '',
  department    text not null check (department in
                  ('Production','Finance','HR','Sales','IT','Admin','Procurement')),
  site          text not null check (site in ('Head Office – Gulshan','Savar Factory')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index employees_company_email_uniq on employees (lower(company_email));

create table delivery_points (
  seq              bigint generated always as identity,
  id               text primary key check (id ~ '^dp-[a-z0-9-]+$'),
  name             text not null check (length(btrim(name)) > 0),
  address          text not null check (length(btrim(address)) > 0),
  coordinator_name text not null default '',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table batches (
  seq                    bigint generated always as identity,
  batch_no               text primary key check (batch_no ~ '^BATCH-[0-9]+$'),
  production_date        timestamptz not null,
  product                text not null default 'Fresh Whole Milk',
  produced_litres        integer not null check (produced_litres > 0),
  saleable_litres        integer not null check (saleable_litres > 0),
  rate_per_litre         numeric(10,2) not null check (rate_per_litre >= 0),
  min_order              integer not null check (min_order > 0),
  max_order              integer not null,
  employee_cap           integer not null check (employee_cap > 0),
  booking_cutoff         timestamptz not null,
  delivery_date          timestamptz not null,
  delivery_window        text not null,
  note                   text not null default '',
  status                 text not null default 'Draft'
                           check (status in ('Draft','Active','Paused','SoldOut','Closed')),
  final_booked_litres    integer,
  final_delivered_litres integer,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (saleable_litres <= produced_litres),
  check (max_order >= min_order)
);
create index batches_status_idx on batches (status);

create table batch_delivery_points (
  batch_no          text not null references batches (batch_no) on delete cascade,
  delivery_point_id text not null references delivery_points (id) on delete restrict,
  position          integer not null default 0,
  primary key (batch_no, delivery_point_id)
);

create sequence order_no_seq start 10001;

create table orders (
  seq               bigint generated always as identity,
  order_no          text primary key,
  employee_id       text not null references employees (id) on delete restrict,
  batch_no          text not null references batches (batch_no) on delete restrict,
  litres            integer not null check (litres > 0),
  rate              numeric(10,2) not null check (rate >= 0),
  amount            numeric(12,2) generated always as (litres * rate) stored,
  delivery_point_id text not null references delivery_points (id) on delete restrict,
  status            text not null default 'Pending' check (status in
                      ('Pending','Confirmed','CancellationRequested','Packed',
                       'OutForDelivery','Delivered','Cancelled','NotCollected')),
  payment_method    text check (payment_method in ('Cash','bKash','Payroll deduction')),
  collection_time   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_batch_idx on orders (batch_no, status);
create index orders_employee_idx on orders (employee_id);

create sequence cancellation_request_no_seq start 1001;

create table cancellation_requests (
  seq              bigint generated always as identity,
  request_no       text primary key,
  order_no         text not null references orders (order_no) on delete cascade,
  employee_id      text not null references employees (id) on delete restrict,
  requested_at     timestamptz not null default now(),
  status           text not null default 'Pending'
                     check (status in ('Pending','Approved','Rejected')),
  decided_at       timestamptz,
  decided_by       text,
  rejection_reason text
);
create unique index cancellation_requests_one_pending
  on cancellation_requests (order_no) where status = 'Pending';

create sequence coupon_no_seq start 3001;

create table delivery_records (
  seq           bigint generated always as identity,
  coupon_no     text primary key,
  order_no      text not null references orders (order_no) on delete cascade,
  recipient_name text not null,
  contact       text not null default '',
  date_time     timestamptz not null default now(),
  location      text not null default '',
  floor         text not null default '',
  quantity      integer not null check (quantity > 0),
  receiver_name text not null default '',
  remarks       text not null default ''
);
create index delivery_records_order_idx on delivery_records (order_no);

create table collections (
  seq              bigint generated always as identity,
  order_no         text primary key references orders (order_no) on delete cascade,
  amount_due       numeric(12,2) not null check (amount_due >= 0),
  amount_collected numeric(12,2) not null check (amount_collected >= 0),
  method           text not null check (method in ('Cash','bKash','Payroll deduction')),
  reference        text not null default '',
  status           text not null check (status in ('Paid','Unpaid','Partial')),
  collector_name   text not null default '',
  date             timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (amount_collected <= amount_due)
);

create sequence audit_log_id_seq start 1001;

create table audit_logs (
  seq        bigint generated always as identity,
  id         text primary key default ('AL-' || nextval('audit_log_id_seq')),
  actor      text not null,
  action     text not null,
  record     text not null,
  old_value  text not null default '',
  new_value  text not null default '',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);

create sequence notification_id_seq start 1001;

create table notifications (
  seq        bigint generated always as identity,
  id         text primary key default ('NT-' || nextval('notification_id_seq')),
  kind       text not null check (kind in
               ('BatchPublished','CutoffReminder','OrderRequest','CancellationRequested',
                'CancellationApproved','CancellationRejected','OrderConfirmed',
                'OrderCancelled','OutForDelivery','PaymentDue')),
  audience   text not null check (audience in
               ('All','Employee','Factory Operator','Head Office Coordinator',
                'Finance','System Admin')),
  title      text not null,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Single-row table of system defaults.
create table app_settings (
  id              boolean primary key default true check (id),
  rate_per_litre  numeric(10,2) not null default 92 check (rate_per_litre >= 0),
  booking_cutoff  text not null default '13:00' check (booking_cutoff ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  employee_cap    integer not null default 10 check (employee_cap > 0),
  min_order       integer not null default 1 check (min_order > 0),
  delivery_window text not null default '4:00 PM – 6:30 PM',
  email_alerts    boolean not null default true,
  sms_alerts      boolean not null default false,
  auto_close      boolean not null default true,
  terms           text not null default 'Milk is sold to employees at cost. Orders are binding after the daily cutoff and settled through payroll unless paid at collection.',
  updated_at      timestamptz not null default now()
);
insert into app_settings default values;
