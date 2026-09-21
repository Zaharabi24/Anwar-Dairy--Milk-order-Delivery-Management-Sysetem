-- The System Admin's mailbox: emails written by hand and sent to the Employee Database.
--
-- Shaped deliberately like batch_publications/batch_emails, because it is the same problem: a few
-- hundred messages that Microsoft 365 will only take 30 a minute of, which have to survive a
-- restart and be answerable for afterwards. One row per campaign, one row per recipient, and the
-- recipient row is the unit of work the queue claims.
--
-- Kept as its own pair of tables rather than folded into the batch ones: a batch publication is
-- about a batch -- it carries the cutoff, the rate, the collection point, and a foreign key to
-- `batches` -- and a hand-written notice to the staff is about none of those things. Sharing the
-- table would have meant half its columns being null and the other half meaning two things.
--
-- What they do share is the sending engine. Both go through the same BullMQ worker and the same
-- rate limiter, which matters: the 30 a minute is a property of the mailbox, not of either queue,
-- so a campaign sent while a batch is still going out has to come out of the same allowance.

create table mail_campaigns (
  id            bigint generated always as identity primary key,
  subject       text not null check (length(btrim(subject)) > 0),
  -- The message as the System Admin typed it. Plain text with line breaks: it is rendered into
  -- the branded template at send time, and storing the source rather than the finished HTML is
  -- what lets the template change later without rewriting history.
  body          text not null check (length(btrim(body)) > 0),
  -- 'all' is resolved to a recipient list at send time and never re-resolved, so the record says
  -- who was actually written to rather than who would be written to today.
  audience      text not null check (audience in ('all', 'selected')),
  recipients    integer not null default 0,
  sent_count    integer not null default 0,
  failed_count  integer not null default 0,
  status        text not null default 'sending'
                  check (status in ('sending', 'sent', 'partial', 'failed', 'no_recipients')),
  -- Who sent it. Text, so the record outlives the account, the way audit_logs does.
  sent_by       text not null default '',
  sent_by_id    text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index mail_campaigns_created_idx on mail_campaigns (created_at desc);

create table mail_campaign_recipients (
  id            bigint generated always as identity primary key,
  campaign_id   bigint not null references mail_campaigns (id) on delete cascade,
  employee_id   text references employees (id) on delete set null on update cascade,
  -- Copied, not joined: this is who was written to on the day, and somebody changing department
  -- or leaving afterwards must not silently rewrite it.
  employee_name text not null default '',
  employee_ref  text not null default '',
  to_address    text not null default '',
  department    text not null default '',
  designation   text not null default '',
  business_unit text not null default '',
  location      text not null default '',
  status        text not null default 'queued'
                  check (status in ('queued','sending','sent','captured','failed','logged','skipped')),
  error         text,
  attempts      integer not null default 0,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index mail_campaign_recipients_campaign_idx
  on mail_campaign_recipients (campaign_id, employee_name);
-- The queue is always read the same way: the next unsent messages for one campaign.
create index mail_campaign_recipients_pending_idx
  on mail_campaign_recipients (campaign_id, status, id)
  where status in ('queued', 'sending');
-- One row per person per campaign, so a resume can never write to somebody twice.
create unique index mail_campaign_recipients_once
  on mail_campaign_recipients (campaign_id, employee_id)
  where employee_id is not null;
