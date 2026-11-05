-- Speed: the ledger is read newest first, then by id, a page at a time after the last row seen
-- (keyset paging). This index matches that order exactly, so the database reads rows in index
-- order with no sort step. It replaces transactions_owner_time, which lacked the id tiebreak;
-- every query that used the old index can use this one, since it starts with the same columns
-- and has the same condition.

create index transactions_owner_time_id
  on public.transactions (owner_id, occurred_at desc, id)
  where deleted_at is null;

drop index public.transactions_owner_time;
