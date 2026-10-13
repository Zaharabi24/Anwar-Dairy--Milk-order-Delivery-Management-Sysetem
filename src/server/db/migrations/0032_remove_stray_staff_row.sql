-- Remove the stray "STF-0001" directory row that migration 0031 imported before it was corrected.
--
-- The October 2026 workbook has one row whose Emp No is "STF-0001" (name "Zaharabi Bhuiyain",
-- address admin@anwargroup.net). It is not a person on the roster: "STF-" ids are the ones the app
-- mints for staff accounts (migration 0003, `staff_id_seq`). Imported as a directory row it takes
-- the very first such id, so creating the first Super Admin -- and every staff invitation after it
-- -- fails with "duplicate key value violates unique constraint employees_pkey".
--
-- Migration 0031 no longer inserts it. This removes it from any database where 0031 ran before the
-- correction. It is guarded on the imported row's exact shape -- no account, that address, nothing
-- attached -- so a real staff account that happens to hold an STF-0001 id is never touched, and it
-- is a no-op where the row is not present.

delete from employees
where id = 'STF-0001'
  and account_status is null
  and company_email = 'admin@anwargroup.net'
  and deleted_at is null
  and not exists (select 1 from orders o where o.employee_id = employees.id)
  and not exists (select 1 from cancellation_requests c where c.employee_id = employees.id);
