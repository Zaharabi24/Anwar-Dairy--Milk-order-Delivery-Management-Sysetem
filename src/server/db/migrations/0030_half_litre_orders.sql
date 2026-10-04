-- Orders in half litres: 0.5, 1, 1.5 and so on, where they were whole litres only.
--
-- No row is removed and no value changes. Every litres figure already stored is a whole number,
-- and a whole number converts to numeric exactly: 2 becomes 2.0.
--
-- orders.amount is generated from litres * rate, and PostgreSQL will not change the type of a
-- column a generated column reads. So amount is dropped and added back with the same definition;
-- it is recomputed from the same litres and the same rate, and comes out the same to the paisa.
-- Nothing else depends on it: no index, view or foreign key names orders.amount.
alter table orders drop column amount;
alter table orders alter column litres type numeric(8,1);
alter table orders
  add column amount numeric(12,2) generated always as (litres * rate) stored;

-- Half litres and nothing finer. numeric(8,1) alone would take 0.3.
alter table orders add constraint orders_litres_half_step check (litres * 2 = trunc(litres * 2));

-- The smallest order a batch takes, so a batch can open at 0.5 L. Produced, saleable, maximum and
-- per-employee cap stay whole litres. Existing batches keep the minimum they were saved with.
alter table batches
  alter column min_order type numeric(8,1),
  -- Totals of orders.litres, written when a batch closes; they have to hold a half too.
  alter column final_booked_litres type numeric(10,1),
  alter column final_delivered_litres type numeric(10,1);

alter table app_settings alter column min_order type numeric(8,1);

-- A coupon records the litres of the order it hands over.
alter table delivery_records alter column quantity type numeric(8,1);
