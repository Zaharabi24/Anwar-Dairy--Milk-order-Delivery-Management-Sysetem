-- The floor someone works on, kept in the Employee Database next to their location.
--
-- Additive only. Nullable with no default, so on PostgreSQL 11+ this is a catalogue change, not a
-- table rewrite, and every existing row simply has no floor until someone fills it in. Text
-- rather than a number, because floors are called "Ground", "Mezzanine" and "3A" as often as "3".
alter table employees add column floor_no text;
