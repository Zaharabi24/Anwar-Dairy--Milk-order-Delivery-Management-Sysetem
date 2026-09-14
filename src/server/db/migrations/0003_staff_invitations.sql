-- Staff invitations and the Super Admin role.
-- Employees still self-register (account requests); staff roles are granted only by invitation.

-- Super Admin joins the role set.
alter table user_roles drop constraint user_roles_role_check;
alter table user_roles add constraint user_roles_role_check check (role in
  ('employee','factory_operator','head_office_coordinator','system_admin','super_admin'));

alter table sessions drop constraint sessions_active_role_check;
alter table sessions add constraint sessions_active_role_check check (active_role in
  ('employee','factory_operator','head_office_coordinator','system_admin','super_admin'));

-- Which sign-in portal a session came from. An employee-portal session can only act as an
-- employee, even when the same person also holds a staff role.
alter table sessions add column portal text not null default 'employee'
  check (portal in ('employee','staff'));
update sessions set portal = 'staff' where active_role <> 'employee';

-- Which portal a password setup/reset link signs the user into.
alter table password_tokens add column portal text not null default 'employee'
  check (portal in ('employee','staff'));

-- Staff who aren't on the employee roster get an internal ID (STF-0001, ...).
create sequence staff_id_seq start 1;

create table invitations (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null check (email = lower(email) and email like '%@anwargroup.net'),
  full_name            text,
  employee_id          text check (employee_id ~ '^[A-Za-z0-9/-]{3,20}$'),
  role                 text not null check (role in
                         ('factory_operator','head_office_coordinator','system_admin','super_admin')),
  -- Only the SHA-256 of the emailed token is stored; resending rotates it.
  token_hash           text not null unique,
  status               text not null default 'pending'
                         check (status in ('pending','accepted','revoked','expired')),
  invited_by           text references employees (id) on delete set null on update cascade,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  last_sent_at         timestamptz not null default now(),
  send_count           integer not null default 1,
  accepted_at          timestamptz,
  accepted_employee_id text references employees (id) on delete set null on update cascade,
  revoked_at           timestamptz,
  revoked_by           text
);
create unique index invitations_one_pending_per_email on invitations (email) where status = 'pending';
create index invitations_status_idx on invitations (status, created_at desc);
create index invitations_invited_by_idx on invitations (invited_by, created_at desc);
