-- Signing in by matching the Employee Database.
--
-- An employee gives their company email and their employee ID; if the two belong to the same
-- active person in the directory, they get a session. There is no password and no account --
-- eligibility is the directory, which is exactly what the booking link already relies on.
--
-- Recorded as its own session origin because it is neither of the two that existed. It is not a
-- password sign-in: there is no account_status to check, and the person may never have had an
-- account. It is not a booking link either: that one is tied to a single batch and dies at its
-- cutoff, while this is an ordinary session that lapses when it goes unused.
--
-- Worth being plain about what this is. A company email and an employee ID are both things
-- colleagues know and neither is secret, so this identifies somebody rather than authenticating
-- them: it establishes who is ordering, not that they are who they say. For milk that is a
-- reasonable trade, and it is the same trust the emailed booking link already extends. What it
-- must not become is the way anything consequential is reached -- staff still sign in with a
-- password, and this origin grants the employee role and nothing else.

alter table sessions drop constraint sessions_origin_check;
alter table sessions add constraint sessions_origin_check
  check (origin in ('password', 'booking_link', 'directory'));
