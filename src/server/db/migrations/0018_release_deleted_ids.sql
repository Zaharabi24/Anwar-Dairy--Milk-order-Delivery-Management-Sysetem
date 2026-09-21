-- Free the Employee IDs still held by employees who were deleted.
--
-- Deleting somebody with orders kept their row, because `orders.employee_id` is `on delete
-- restrict` and reconciliation, collections and the revenue reports all read those orders. But
-- the row kept their Employee ID as well, and their name, phone, department and designation with
-- it -- so a deleted employee was still in the database, and adding them back under the same ID
-- was refused by a record that was supposed to be gone.
--
-- Deletion writes a tombstone now: renamed off the ID, stripped of everything that identifies
-- the person, kept only so the orders still have something to hang off. This does the same to
-- the ones deleted before that was true.
--
-- A no-op on any database where nobody has been deleted this way.

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
  account_status = null,
  password_hash = null,
  active = false,
  updated_at = now()
where deleted_at is not null
  and id not like 'DEL-%';

-- The mail records copied their name and address at send time. Same reasoning: the send stays on
-- the record, the person does not.
update batch_emails e
set employee_name = 'Deleted employee', employee_ref = '', to_address = '',
    department = '', designation = '', phone = '', location = ''
from employees emp
where emp.id = e.employee_id and emp.deleted_at is not null;

update mail_campaign_recipients r
set employee_name = 'Deleted employee', employee_ref = '', to_address = '',
    department = '', designation = '', business_unit = '', location = ''
from employees emp
where emp.id = r.employee_id and emp.deleted_at is not null;
