-- Drafts in the Mailbox, and one of them chosen as the wording of the batch booking email.
--
-- Additive only. No existing row, column or constraint is changed: a new table, and three
-- nullable columns on batch_publications that stay empty for every publication made before this.
-- Nullable with no default, so on PostgreSQL 11+ adding them is a catalogue change, not a rewrite.

create table mail_drafts (
  id              bigint generated always as identity primary key,
  subject         text not null default '',
  -- The editor's HTML as the server kept it (cleanMailHtml), the same as a sent message's body.
  body            text not null default '',
  -- The draft publishing a batch uses instead of the standard booking wording. At most one.
  use_for_batches boolean not null default false,
  -- Who wrote and last changed it. Text, so the record outlives the account, like audit_logs.
  created_by      text not null default '',
  created_by_id   text,
  updated_by      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index mail_drafts_updated_idx on mail_drafts (updated_at desc);
create unique index mail_drafts_one_for_batches on mail_drafts (use_for_batches)
  where use_for_batches;

-- The wording a publication's emails were sent with, copied from the draft at publish time. A
-- copy, not a reference: editing or deleting the draft afterwards must not change what a batch
-- already said, or what its retries say. Null means the standard booking email.
alter table batch_publications
  add column mail_subject  text,
  add column mail_body     text,
  add column mail_draft_id bigint;
