-- Which business unit an invited member belongs to.
--
-- `employees.business_unit_code` has always existed, and an employee signing up chooses their
-- unit on the form. Somebody invited had no way to be given one: the invitation carried an email,
-- a role, a name and an employee ID, so an invited System Admin or Factory Operator arrived
-- attached to no unit at all and had to be edited afterwards.
--
-- Nullable, and a foreign key to the same table the sign-up form and the Employee Database read,
-- so there is one list of units and an invitation cannot name one that isn't on it. Leaving it
-- unset stays valid -- every invitation sent before now has it unset, and that is not a fault to
-- be corrected.

alter table invitations
  add column business_unit_code text references business_units (code);
