-- A guest's floor and a short description of who they are, both optional on the guest order
-- form, so the coordinator can tell guests apart and knows where they work.
--
-- Additive only. Nullable with no default, so on PostgreSQL 11+ this is a catalogue change, not a
-- table rewrite: every existing order is left exactly as it is, with no floor or description.
-- Floor is text, as on employees.floor_no, because floors are called "Ground" and "3A" as often
-- as "3". guest_email was always nullable; the form simply stops requiring it.
alter table orders
  add column guest_floor   text,
  add column guest_profile text;
