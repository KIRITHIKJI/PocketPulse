-- Undo of a confirmed batch (typed or voice entry) as one operation, instead of one
-- set_transaction_deleted call per row.
--
-- Atomic: the function body is one database transaction, so if any row can't be removed (an
-- expense that has since been refunded, say) the raised error rolls back every row and the
-- operation record. Either the whole batch goes or none of it does.
--
-- Idempotent: the client's op id is recorded in sync_operations in that same transaction, so a
-- failed undo leaves no trace and can be retried, and a retry of one that worked returns
-- `duplicate` without touching a row. Checking row state alone wouldn't be enough: a retry must
-- not delete an entry that was restored after the first undo.
create function public.undo_transactions_batch(p_op_id uuid, p_batch_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  previous public.sync_operations;
  entry_id uuid;
  total integer := 0;
  removed integer := 0;
  outcome text;
begin
  if p_op_id is null or p_batch_id is null then
    perform public.raise_rule('missing_id', 'An undo needs its operation and batch ids.');
  end if;

  -- Concurrent undos of one batch queue here, so the check below sees the earlier one's record.
  perform 1 from public.transactions
    where owner_id = uid and batch_id = p_batch_id
    order by id
    for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into previous from public.sync_operations where owner_id = uid and id = p_op_id;
  if previous.id is not null then
    if previous.result ->> 'batch_id' is distinct from p_batch_id::text then
      return jsonb_build_object('status', 'conflict', 'reason', 'op_reused');
    end if;
    return jsonb_build_object('status', 'duplicate', 'batch_id', p_batch_id,
      'removed', 0, 'total', previous.result -> 'total');
  end if;

  for entry_id in
    select id from public.transactions
      where owner_id = uid and batch_id = p_batch_id
      order by id
  loop
    total := total + 1;
    if public.set_transaction_deleted(entry_id, true) ->> 'status' = 'applied' then
      removed := removed + 1;
    end if;
  end loop;

  outcome := case when removed = 0 then 'duplicate' else 'applied' end;
  insert into public.sync_operations (id, owner_id, operation, status, result)
    values (p_op_id, uid, 'undo_transactions_batch', outcome,
      jsonb_build_object('batch_id', p_batch_id, 'removed', removed, 'total', total));
  return jsonb_build_object('status', outcome, 'batch_id', p_batch_id,
    'removed', removed, 'total', total);
end;
$$;

-- New functions are executable by PUBLIC by default; only signed-in users may call this.
revoke execute on all functions in schema public from public, anon;

grant execute on function public.undo_transactions_batch(uuid, uuid) to authenticated;
