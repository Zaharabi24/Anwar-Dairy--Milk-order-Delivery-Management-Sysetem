-- The Mailbox writes like a mail client: formatted text, and files attached.
--
-- Additive only. Nothing already stored is changed: every message sent before this keeps
-- `body_format = 'text'` and is rendered exactly as it was, `**bold**` and all.
--
-- `body_format = 'html'` is a message from the new editor. What is stored is not what the
-- browser sent but what the server kept of it: a short list of tags (paragraphs, bold, italic,
-- underline, lists, links) rebuilt from scratch, so nothing else can ride along under the
-- company's branding. See src/server/mail/rich-text.server.ts.
--
-- A constant default, so on PostgreSQL 11+ this is a catalogue change, not a table rewrite.
alter table mail_campaigns
  add column body_format text not null default 'text'
    check (body_format in ('text', 'html'));

-- The files, kept with the message they belong to. In the database rather than on disk because
-- the queue sends them minutes later, possibly after a restart or a redeploy, and a container's
-- disk does not survive either; and because they are small by rule (5 MB a message, checked on
-- the server) -- a mail server refuses anything much larger anyway.
create table mail_campaign_attachments (
  id            bigint generated always as identity primary key,
  campaign_id   bigint not null references mail_campaigns (id) on delete cascade,
  filename      text not null check (length(btrim(filename)) > 0),
  content_type  text not null default 'application/octet-stream',
  size_bytes    integer not null check (size_bytes >= 0),
  content       bytea not null,
  created_at    timestamptz not null default now()
);
create index mail_campaign_attachments_campaign_idx
  on mail_campaign_attachments (campaign_id, id);
