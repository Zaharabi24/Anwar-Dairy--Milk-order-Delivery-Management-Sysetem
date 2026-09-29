-- Guest orders: people who work in the office and collect from a pickup point, but have no
-- company email or Employee ID, so they are not in the Employee Database and can't sign in.
--
-- They are kept in `orders` itself rather than a table of their own, so they hold litres against
-- the batch (nothing can be oversold), and are confirmed, cancelled, paid for, couponed and
-- printed exactly like any other order.
--
-- Nothing already stored changes. Every existing order keeps its employee_id; the only thing
-- loosened is that a new order may have none, and the check below means such an order must name
-- the guest instead. Nullable columns with no default, so these are catalogue changes only.

alter table orders alter column employee_id drop not null;

alter table orders
  add column guest_name    text,
  add column guest_phone   text,
  add column guest_email   text,
  add column guest_address text,
  -- Where the request came from, so the public form can be rate-limited per address.
  add column guest_ip      text;

-- Every order is somebody's: an employee, or a guest with a name and a phone number.
alter table orders add constraint orders_employee_or_guest
  check (employee_id is not null or (guest_name is not null and guest_phone is not null));

-- One open order per phone number per batch is checked against this.
create index orders_guest_phone_idx on orders (batch_no, guest_phone) where employee_id is null;
