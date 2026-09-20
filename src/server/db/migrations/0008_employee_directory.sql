-- The Employee Database: the company directory that the batch mail goes out to.
--
-- This is the same `employees` table, not a second one. A row here has always been either a
-- roster entry or an account (migration 0002: "an account is an employees row with a non-null
-- account_status"), and the directory is the roster. Keeping it one table is what lets an order
-- placed from an emailed link attach to the person's directory record with no mapping step, and
-- what keeps every existing screen, foreign key and report working unchanged.
--
-- What the directory needs that the roster didn't:

-- Designation, which the directory carries and the roster never did.
alter table employees add column designation text not null default '';

-- Department was a list of seven made-up demo values; the real directory has thirty-six, and it
-- gains and loses them as the group reorganises. Site likewise named two demo locations. Both are
-- now free text -- the screens offer what is already in use as suggestions, which keeps entry
-- consistent without the database rejecting a department that exists.
alter table employees drop constraint employees_department_check;
alter table employees drop constraint employees_site_check;

-- Three people in the directory have no address on file and one has an address that isn't valid
-- ("...@gmail", no domain). They are still employees and still belong in the directory -- they
-- simply can't be mailed, and are carried inactive. An empty address is the one value allowed
-- past the format check, so "not on file" can be stored without pretending it is an address.
alter table employees drop constraint employees_company_email_check;
alter table employees add constraint employees_company_email_check
  check (company_email = '' or company_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Uniqueness now guards sign-in identity rather than the directory. Two people in the directory
-- genuinely share one address, and the directory has to be able to say so; an account is what
-- must be unique, because the address is how someone signs in and how a reset reaches them.
drop index employees_company_email_uniq;
create unique index employees_company_email_uniq
  on employees (lower(company_email))
  where company_email <> '' and account_status is not null;

-- The directory is read by department, by location and by name on every screen that lists it.
create index employees_department_idx on employees (department);
create index employees_site_idx on employees (site);
create index employees_active_idx on employees (active) where deleted_at is null;
