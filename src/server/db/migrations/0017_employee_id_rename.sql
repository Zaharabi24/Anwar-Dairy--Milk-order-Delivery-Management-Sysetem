-- Let an employee's ID be corrected without their history coming apart.
--
-- The ID is the primary key, and thirteen foreign keys point at it. Ten of them were already
-- declared `on update cascade` and follow a rename by themselves. Three were not: orders,
-- cancellation requests and booking links. So renaming anybody who had ever ordered milk failed
-- at the database -- which is a strange way to find out that the ID is editable in principle.
--
-- Cascade on update is the right answer for all three, and is what the rest of the schema already
-- says. It is not the same as cascade on delete and does not weaken it: `on delete` stays exactly
-- as it was, so an order still cannot be orphaned by deleting the employee, and a rename simply
-- carries every reference along with it inside the one transaction.

alter table orders drop constraint orders_employee_id_fkey;
alter table orders add constraint orders_employee_id_fkey
  foreign key (employee_id) references employees (id) on delete restrict on update cascade;

alter table cancellation_requests drop constraint cancellation_requests_employee_id_fkey;
alter table cancellation_requests add constraint cancellation_requests_employee_id_fkey
  foreign key (employee_id) references employees (id) on delete restrict on update cascade;

alter table booking_links drop constraint booking_links_employee_id_fkey;
alter table booking_links add constraint booking_links_employee_id_fkey
  foreign key (employee_id) references employees (id) on delete cascade on update cascade;
