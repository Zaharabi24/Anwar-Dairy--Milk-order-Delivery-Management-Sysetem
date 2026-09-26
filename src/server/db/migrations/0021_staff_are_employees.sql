-- Staff are employees too.
--
-- A System Admin, Factory Operator or Head Office Coordinator held only their staff role. Two
-- things followed from that, neither of them intended:
--
--   They could not order milk. `orders.book` belongs to the `employee` role and to nothing else,
--   so the people running the platform were the only people on it who could not buy from it.
--
--   They were not in the Employee Database. The roster lists an account only if it holds the
--   employee role, so an invited admin was absent from the directory, absent from the batch
--   email, and had no booking link.
--
-- The employee role is not a rank -- it is what says somebody works here and can buy milk, which
-- is true of every member of staff. Holding it alongside a staff role is already supported
-- everywhere: a staff-portal session may use every role the person holds, the header offers
-- Switch role when there is more than one, and each role keeps its own screens.
--
-- `active` is set with it. Inactive is what stops the batch email reaching somebody, and an
-- account that can order but is never told a batch exists is half a member of the directory.
-- Only accounts that are live and not deleted are touched; a suspended or deactivated one stays
-- exactly as it is, because that state was chosen deliberately.

insert into user_roles (employee_id, role, granted_by)
select e.id, 'employee', 'Migration 0021'
from employees e
where e.account_status = 'active'
  and e.deleted_at is null
  and exists (select 1 from user_roles r
              where r.employee_id = e.id and r.revoked_at is null
                and r.role in ('factory_operator', 'head_office_coordinator',
                               'system_admin', 'super_admin'))
  and not exists (select 1 from user_roles r
                  where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)
on conflict do nothing;

update employees e set active = true, updated_at = now()
where e.account_status = 'active'
  and e.deleted_at is null
  and not e.active
  and exists (select 1 from user_roles r
              where r.employee_id = e.id and r.revoked_at is null
                and r.role in ('factory_operator', 'head_office_coordinator',
                               'system_admin', 'super_admin'));
