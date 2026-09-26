-- A resend is a new attempt, not an edit of the old one.
--
-- Resending used to revive the failed row: status back to 'queued', attempts back to zero. The
-- record of the failure was overwritten by whatever happened next, so a message that failed on
-- Tuesday and arrived on Wednesday left one row reading "sent on Wednesday" and no trace that
-- Tuesday had gone wrong. Email Records is a record; it should say what happened, twice if it
-- happened twice.
--
-- So a resend copies the row instead. The new row carries the same publication, the same person
-- and the same details that were snapshotted at publish time, and goes out as its own attempt.
-- `resent_as` on the old row points at it, which does two things: the failure stays in the history
-- exactly as it was, and the Resend list can leave it out, because something is already being
-- done about it. A copy that fails in turn has `resent_as` null and so appears in the list itself,
-- ready to be tried again.
--
-- `on delete set null` rather than cascade: deleting a retry must not delete the record of the
-- failure that caused it.

alter table batch_emails
  add column resent_as bigint references batch_emails (id) on delete set null;

-- What the Resend tab reads: the failures nothing has been done about yet.
create index batch_emails_unresolved_idx on batch_emails (created_at desc)
  where status = 'failed' and resent_as is null;
