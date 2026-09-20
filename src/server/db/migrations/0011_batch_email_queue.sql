-- Make batch_emails a queue that can be picked up again, rather than a log of a send that only
-- ever had one chance to happen.
--
-- Publishing to the Employee Database means 360 messages, not the dozen it used to be. That send
-- takes minutes against a real mail server, and it was running on a promise nobody waited for:
-- once the publish had answered the operator, the work carried on with nothing holding it up.
-- Anything that ended the process in those minutes -- a redeploy, a restart, a serverless runtime
-- freezing the isolate the moment the response went out -- stopped the send wherever it had got
-- to, and the rows left behind said 'queued' forever with nothing to come back for them.
--
-- So the row is the unit of work now. 'sending' is a claim on it, taken before the message goes
-- out and released when it is answered for; anything still claimed after a while was interrupted
-- and is free to be picked up again.

alter table batch_emails drop constraint batch_emails_status_check;
alter table batch_emails add constraint batch_emails_status_check
  check (status in ('queued','sending','sent','captured','failed','logged','skipped'));

-- When the claim was taken, so an interrupted one can be told from one still in flight.
alter table batch_emails add column claimed_at timestamptz;

-- How many times this message has been attempted, so a permanently failing address is retried a
-- few times and then left alone rather than being tried forever every time the queue is drained.
alter table batch_emails add column attempts integer not null default 0;

-- The queue is always read the same way: the next unsent messages for one publication.
create index batch_emails_pending_idx on batch_emails (publication_id, status, id)
  where status in ('queued', 'sending', 'failed');
