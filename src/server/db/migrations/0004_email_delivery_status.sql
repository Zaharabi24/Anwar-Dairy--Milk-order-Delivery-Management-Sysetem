-- 'captured': accepted by a local test inbox (MAIL_CAPTURE=true, e.g. Mailpit) and not delivered
-- to the real mailbox. Kept separate from 'sent' so the outbox never claims a real delivery.
alter table email_outbox drop constraint email_outbox_status_check;
alter table email_outbox add constraint email_outbox_status_check
  check (status in ('queued','sent','captured','failed','logged'));
