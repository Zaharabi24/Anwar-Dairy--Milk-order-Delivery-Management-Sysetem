-- Let the Employee Database hold the IDs the company actually issues.
--
-- The rule was three to twenty characters of letters, digits, slash or hyphen. Three was an
-- assumption nobody checked: an ID of "7" or "A1" is perfectly ordinary in a small unit, and both
-- were refused. Worse, they were refused by a database constraint, so the System Admin was shown
-- "Some values are outside the allowed range" -- which names neither the field nor the rule, and
-- reads like the system is broken rather than like the ID needs another character.
--
-- One character is now enough, up to thirty-two, and a dot and an underscore are allowed with the
-- slash and hyphen. What is still refused is whitespace and everything else, because the ID is
-- typed into a sign-in box and compared exactly: an ID with a space in it is one nobody can enter
-- the same way twice.
--
-- The message is fixed in the same change, in app code, where it can say which field and why.

alter table employees drop constraint employees_id_check;
alter table employees add constraint employees_id_check
  check (id ~ '^[A-Za-z0-9._/-]{1,32}$');
