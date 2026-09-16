-- Deleting an account must not delete the person's orders. orders.employee_id and
-- cancellation_requests.employee_id are "on delete restrict", and batch reconciliation,
-- collections, billing and the revenue reports all read those rows.
--
-- So a deleted account keeps its employees row as a non-login historical record that orders stay
-- attached to. account_status goes back to null, which is what "not an account" means everywhere
-- else in the schema: the row leaves the accounts list and can't sign in. The company email is
-- moved aside into former_company_email so the same address is free for a new account request,
-- while the original address is still on file for the audit trail.
alter table employees
  add column deleted_at           timestamptz,
  add column deleted_by           text,
  add column former_company_email text;

create index employees_deleted_idx on employees (deleted_at desc) where deleted_at is not null;
