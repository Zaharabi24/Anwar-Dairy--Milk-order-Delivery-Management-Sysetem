-- Publish records, the mail that went out with them, and the sessions those links open.
--
-- Publishing a batch is now an event with a history, not just a status change: it decides who
-- gets told, and a link that places an order in someone's name goes out to every one of them.
-- Both halves have to be answerable for afterwards -- by the operator who published, and by the
-- System Admin asked whether a given person was told about a given batch.

-- One row per publish. Re-publishing the same batch (paused, then opened again) writes another
-- row, because it is another send to another set of people at another time.
create table batch_publications (
  id               bigint generated always as identity primary key,
  batch_no         text not null references batches (batch_no) on delete cascade,
  published_at     timestamptz not null default now(),
  -- Who published, kept as text: the record outlives the account, the way audit_logs does.
  published_by     text not null default '',
  published_by_id  text,
  -- Copied from the batch as it stood at publish time. The batch can be edited afterwards; what
  -- the recipients were actually told cannot change retrospectively.
  booking_cutoff   timestamptz not null,
  delivery_date    timestamptz not null,
  delivery_window  text not null default '',
  rate_per_litre   numeric(10,2) not null default 0,
  saleable_litres  integer not null default 0,
  collection_points text not null default '',
  recipients       integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  -- 'sending' until the last message has been attempted; the operator sees it finish live.
  status           text not null default 'sending'
                     check (status in ('sending', 'sent', 'partial', 'failed', 'no_recipients')),
  completed_at     timestamptz
);
create index batch_publications_batch_idx on batch_publications (batch_no, published_at desc);
create index batch_publications_date_idx on batch_publications (published_at desc);

-- One row per person per publish: what was sent, to whom, and whether it arrived.
--
-- The directory fields are copied, not joined. This is the record of what was sent on the day,
-- and a person who later changes department, or leaves and is deleted, must not silently rewrite
-- it. employee_id keeps the link to the live record where there still is one.
create table batch_emails (
  id             bigint generated always as identity primary key,
  publication_id bigint not null references batch_publications (id) on delete cascade,
  batch_no       text not null,
  employee_id    text references employees (id) on delete set null on update cascade,
  employee_name  text not null default '',
  employee_ref   text not null default '',
  to_address     text not null default '',
  department     text not null default '',
  designation    text not null default '',
  phone          text not null default '',
  location       text not null default '',
  -- Mirrors email_outbox: queued -> sent | captured | failed | logged. 'skipped' is ours, for
  -- someone in the directory who had no address to send to.
  status         text not null default 'queued'
                   check (status in ('queued','sent','captured','failed','logged','skipped')),
  error          text,
  link_expires_at timestamptz,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
create index batch_emails_publication_idx on batch_emails (publication_id, employee_name);
create index batch_emails_employee_idx on batch_emails (employee_id, created_at desc);
create index batch_emails_created_idx on batch_emails (created_at desc);
create index batch_emails_batch_idx on batch_emails (batch_no);

-- How a session was started. A booking-link session belongs to someone who has no account and
-- never will: they are in the directory, they were mailed a link, and that link is their whole
-- authorisation. It must therefore be told apart from a session someone signed in for --
-- to let it exist at all for an accountless employee, to end it exactly when the booking closes
-- rather than rolling it forward, and to let the landing page drop Sign In and Sign Up for it.
alter table sessions add column origin text not null default 'password'
  check (origin in ('password', 'booking_link'));
