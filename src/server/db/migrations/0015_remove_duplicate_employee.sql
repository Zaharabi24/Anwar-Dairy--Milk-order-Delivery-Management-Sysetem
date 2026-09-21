-- Remove Md. Zaharabi Bhuiyain Rafi from the Employee Database so he can be added again cleanly.
--
-- He is in it twice. He signed up before the directory was imported and got the ID "19163"; the
-- file lists him as "019163", and `on conflict (id)` could not see those as the same person. The
-- result is two rows for one man, with two different departments -- "Admin" on the account he
-- created and "Growth Analytics" from the file -- and, until the mailing list was deduplicated,
-- two copies of every batch email with a bookable link in each.
--
-- Deleting only one of the two would not let a System Admin add him fresh, because whichever ID
-- they typed would still be taken. Both go, and he is added back from the Add employee form.
--
-- Guarded on there being more than one row, so this is a no-op anywhere the duplicate does not
-- exist -- a database built from scratch has only the imported row and must keep it. Guarded on
-- nothing being attached, so it cannot quietly take an order or a cancellation with it; if
-- anything is, the delete simply doesn't happen and the rows can be sorted out by hand.

delete from employees e
where lower(e.company_email) = 'aopl.growthanalytics4@anwargroup.net'
  and (
    select count(*) from employees d
    where lower(d.company_email) = 'aopl.growthanalytics4@anwargroup.net'
  ) > 1
  and not exists (select 1 from orders o where o.employee_id = e.id)
  and not exists (select 1 from cancellation_requests c where c.employee_id = e.id);
