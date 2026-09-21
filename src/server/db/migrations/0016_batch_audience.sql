-- Who a batch is announced to.
--
-- Publishing has always written to the whole Employee Database. A Factory Operator now chooses
-- when the batch is created: everyone, or a list of people. A small run, a trial, or a batch for
-- one floor should not put a booking link in three hundred and sixty inboxes.
--
-- The choice lives on the batch rather than on the publish, because it is part of what the batch
-- is -- decided with the litres and the cutoff, reviewed on the publish screen, and the same
-- answer if the batch is paused and opened again.
--
-- 'all' is the default, so every batch that already exists keeps behaving exactly as it did.

alter table batches add column audience text not null default 'all'
  check (audience in ('all', 'selected'));

-- The chosen recipients, when the audience is 'selected'. Resolved against the directory again at
-- publish time: somebody switched off or deleted between creating the batch and publishing it is
-- not written to, the same rule the whole-directory send follows.
create table batch_recipients (
  batch_no    text not null references batches (batch_no) on delete cascade,
  employee_id text not null references employees (id) on delete cascade on update cascade,
  primary key (batch_no, employee_id)
);
create index batch_recipients_employee_idx on batch_recipients (employee_id);
