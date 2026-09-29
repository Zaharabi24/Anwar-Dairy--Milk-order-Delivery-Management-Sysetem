-- Employees adding themselves to the Employee Database from the landing page.
--
-- The form writes an inactive directory row and one of these: a one-time link mailed to the
-- company address. Following it proves the address is theirs, switches the row on, grants the
-- employee role and signs them in -- after which they are an ordinary directory entry, emailed
-- every batch and able to sign in with company email and Employee ID.
--
-- Additive only: a new table. Nothing already stored is touched.
create table employee_registrations (
  id           bigint generated always as identity primary key,
  employee_id  text not null references employees (id) on delete cascade on update cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  verified_at  timestamptz,
  -- Where the form was sent from, so it can be rate-limited per address.
  ip           text,
  created_at   timestamptz not null default now()
);
create index employee_registrations_employee_idx on employee_registrations (employee_id);
create index employee_registrations_ip_idx on employee_registrations (ip, created_at desc);
