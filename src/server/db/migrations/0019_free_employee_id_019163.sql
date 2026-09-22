-- Free Employee ID 019163, whatever state the record is in.
--
-- Migration 0015 tried to clear this and could still fail to. It only removed rows with nothing
-- attached, so if Md. Zaharabi Bhuiyain Rafi has since ordered milk through a booking link -- he
-- has been the one testing it -- his row survives and the ID stays taken. It also required two
-- rows sharing the address, so it does nothing once one of them has gone.
--
-- This frees the ID rather than trying to delete a person, which is the thing actually being
-- asked for. The same two paths as an ordinary delete (0018): a row with orders behind it is
-- renamed to a tombstone and stripped of everything personal, because reconciliation and the
-- revenue reports read those orders and `orders.employee_id` is `on delete restrict`; a row with
-- nothing attached goes entirely. Either way 019163 is available to be added again afterwards.
--
-- Idempotent, and a no-op on a database where the ID is already free.

-- Anything the mail records copied about them, before the rename moves employee_id.
update batch_emails e
set employee_name = 'Deleted employee', employee_ref = '', to_address = '',
    department = '', designation = '', phone = '', location = ''
where e.employee_id in (
  select id from employees
  where lower(id) in ('019163', '19163')
     or lower(company_email) = 'aopl.growthanalytics4@anwargroup.net'
);

update mail_campaign_recipients r
set employee_name = 'Deleted employee', employee_ref = '', to_address = '',
    department = '', designation = '', business_unit = '', location = ''
where r.employee_id in (
  select id from employees
  where lower(id) in ('019163', '19163')
     or lower(company_email) = 'aopl.growthanalytics4@anwargroup.net'
);

-- Rows that something still points at: kept as an anonymous ledger entry, renamed off the ID.
update employees set
  id = 'DEL-' || seq::text,
  name = 'Deleted employee',
  company_email = '',
  former_company_email = null,
  phone = '',
  department = '',
  designation = '',
  site = '',
  business_unit_code = null,
  date_of_birth = null,
  deleted_at = coalesce(deleted_at, now()),
  deleted_by = 'Migration 0019',
  account_status = null,
  password_hash = null,
  active = false,
  updated_at = now()
where (lower(id) in ('019163', '19163')
       or lower(company_email) = 'aopl.growthanalytics4@anwargroup.net')
  and (exists (select 1 from orders o where o.employee_id = employees.id)
       or exists (select 1 from cancellation_requests c where c.employee_id = employees.id));

-- Rows with nothing attached: gone.
delete from employees
where (lower(id) in ('019163', '19163')
       or lower(company_email) = 'aopl.growthanalytics4@anwargroup.net')
  and not exists (select 1 from orders o where o.employee_id = employees.id)
  and not exists (select 1 from cancellation_requests c where c.employee_id = employees.id);
