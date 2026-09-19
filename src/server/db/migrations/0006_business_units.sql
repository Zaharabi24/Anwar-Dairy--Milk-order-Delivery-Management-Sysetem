-- The group's current list of business units, as offered on the account creation form.
--
-- The four already here are renamed in place rather than dropped and re-added. Employees and
-- account requests point at these codes, and each one is the same company under its full name:
-- "Anwar Ispat" is "Anwar Ispat Limited", "A1 Polymar" is "A-One Polymer Limited". Renaming keeps
-- every employee attached to the unit they actually work for; deleting would either break those
-- references or quietly strip them.
--
-- Anything else that was here is deactivated rather than deleted, for the same reason: the
-- foreign keys still hold it. An inactive unit is not offered anywhere, which is what "removed"
-- means from the form's side.

insert into business_units (code, name, position, is_active) values
  ('ACL',   'Anwar Cement Limited',               1, true),
  ('ACSL',  'Anwar Cement Sheet Limited',         2, true),
  ('AIL',   'Anwar Ispat Limited',                3, true),
  ('AGL',   'Anwar Galvanizing Limited',          4, true),
  ('AOPL',  'A-One Polymer Limited',              5, true),
  ('ATXL',  'Anwar Textile',                      6, true),
  ('ALML',  'Anwar Landmark',                     7, true),
  ('AJSML', 'Anwar Jute Spinning Mills Limited',  8, true),
  ('ATECH', 'Anwar Technologies',                 9, true),
  ('AORG',  'Anwar Organic',                     10, true)
on conflict (code) do update
  set name = excluded.name, position = excluded.position, is_active = true;

update business_units set is_active = false
where code not in
  ('ACL', 'ACSL', 'AIL', 'AGL', 'AOPL', 'ATXL', 'ALML', 'AJSML', 'ATECH', 'AORG');
