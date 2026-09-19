-- A personal link, mailed to each employee when a batch is published, that opens the platform
-- already signed in so they can book.
--
-- The token is stored hashed, the same way sessions and password tokens are: the plain token
-- exists only in the email, so a copy of this table is not a set of working links.
--
-- One row per employee per batch, so re-publishing or a repeated send reuses the same link rather
-- than leaving a trail of valid ones. Every use is counted, with when and from where, because a
-- link that signs someone in is a credential and has to be answerable for.

create table booking_links (
  token_hash   text primary key,
  employee_id  text not null references employees (id) on delete cascade,
  batch_no     text not null references batches (batch_no) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  first_used_at timestamptz,
  last_used_at timestamptz,
  use_count    integer not null default 0,
  last_used_ip text,
  revoked_at   timestamptz,
  unique (employee_id, batch_no)
);

create index booking_links_batch_idx on booking_links (batch_no);
create index booking_links_expires_idx on booking_links (expires_at);
