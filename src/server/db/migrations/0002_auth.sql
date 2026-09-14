-- Authentication and account lifecycle (Auth Build Package v8, on plain PostgreSQL).
-- An "account" is an employees row with a non-null account_status. Roster-only
-- employees (no account) can't sign in.

-- Four roles; the old demo "Finance" audience moves to the coordinator.
update notifications set audience = 'Head Office Coordinator' where audience = 'Finance';
alter table notifications drop constraint notifications_audience_check;
alter table notifications add constraint notifications_audience_check check (audience in
  ('All','Employee','Factory Operator','Head Office Coordinator','System Admin'));

-- Company-issued employee IDs aren't always EMP-nnnn.
alter table employees drop constraint employees_id_check;
alter table employees add constraint employees_id_check check (id ~ '^[A-Za-z0-9/-]{3,20}$');

create table business_units (
  code      text primary key,
  name      text not null,
  position  integer not null default 0,
  is_active boolean not null default true
);
insert into business_units (code, name, position) values
  ('AOPL', 'A1 Polymar', 1),
  ('AIL',  'Anwar Ispat', 2),
  ('ACSL', 'Anwar Cement Sheet', 3),
  ('AGL',  'Anwar Galvanizing Ltd Head Office', 4);

create table offices (
  code      text primary key,
  name      text not null,
  position  integer not null default 0,
  is_active boolean not null default true
);
insert into offices (code, name, position) values ('AGI_HO', 'AGI Head Office', 1);

alter table employees
  add column date_of_birth      date,
  add column business_unit_code text references business_units (code),
  add column office_code        text references offices (code),
  add column account_status     text check (account_status in
                                  ('awaiting_password','active','suspended','deactivated')),
  add column password_hash      text,
  add column activated_at       timestamptz,
  add column deactivated_at     timestamptz,
  add column last_login_at      timestamptz,
  add constraint employees_account_domain
    check (account_status is null or lower(company_email) like '%@anwargroup.net');
create index employees_account_status_idx on employees (account_status);

create table user_roles (
  id          bigint generated always as identity primary key,
  employee_id text not null references employees (id) on delete cascade on update cascade,
  role        text not null check (role in
                ('employee','factory_operator','head_office_coordinator','system_admin')),
  granted_by  text,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  text
);
create unique index user_roles_active_uniq on user_roles (employee_id, role) where revoked_at is null;

create sequence account_request_seq start 1;

create table account_requests (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique not null,
  requested_role     text not null check (requested_role in
                       ('employee','factory_operator','head_office_coordinator','system_admin')),
  granted_role       text check (granted_role in
                       ('employee','factory_operator','head_office_coordinator','system_admin')),
  business_unit_code text not null references business_units (code),
  office_code        text not null references offices (code),
  full_name          text not null,
  company_mail       text not null check (lower(company_mail) like '%@anwargroup.net'),
  employee_id        text not null,
  date_of_birth      date not null,
  status             text not null default 'pending'
                       check (status in ('pending','approved','rejected','expired')),
  submitted_at       timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '14 days',
  reviewed_by        text,
  reviewed_at        timestamptz,
  decision_note      text,
  submitted_ip       text
);
create unique index account_requests_one_pending_id
  on account_requests (lower(employee_id)) where status = 'pending';
create unique index account_requests_one_pending_mail
  on account_requests (lower(company_mail)) where status = 'pending';
create index account_requests_status_idx on account_requests (status, submitted_at);

create table password_tokens (
  id           uuid primary key default gen_random_uuid(),
  employee_id  text not null references employees (id) on delete cascade on update cascade,
  purpose      text not null check (purpose in ('setup','reset')),
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  requested_ip text,
  created_at   timestamptz not null default now()
);
create index password_tokens_employee_idx on password_tokens (employee_id, created_at desc);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  employee_id  text not null references employees (id) on delete cascade on update cascade,
  active_role  text not null check (active_role in
                 ('employee','factory_operator','head_office_coordinator','system_admin')),
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index sessions_employee_idx on sessions (employee_id) where revoked_at is null;

create table login_attempts (
  id            bigint generated always as identity primary key,
  identifier    text not null,
  ip            text,
  selected_role text,
  outcome       text not null,
  attempted_at  timestamptz not null default now()
);
create index login_attempts_identifier_idx on login_attempts (lower(identifier), attempted_at desc);
create index login_attempts_ip_idx on login_attempts (ip, attempted_at desc);

-- No foreign keys: the account history must survive an employee being deleted.
create table auth_audit (
  id          bigint generated always as identity primary key,
  actor_id    text,
  subject_id  text,
  event       text not null,
  detail      jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index auth_audit_created_idx on auth_audit (created_at desc);

create table email_outbox (
  id         bigint generated always as identity primary key,
  to_address text not null,
  subject    text not null,
  template   text not null,
  status     text not null default 'queued' check (status in ('queued','sent','failed','logged')),
  error      text,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Order notifications go to the one employee concerned, not every employee.
alter table notifications
  add column recipient_employee_id text references employees (id) on delete cascade on update cascade;

-- Read state is per person, not global.
create table notification_reads (
  notification_id text not null references notifications (id) on delete cascade,
  employee_id     text not null references employees (id) on delete cascade on update cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, employee_id)
);
alter table notifications drop column read;
