-- Ledger RPCs. All are SECURITY INVOKER: they run as the signed-in user, so RLS and the
-- integrity triggers apply exactly as for a direct write. The owner is always auth.uid() —
-- any owner_id in the payload is ignored.
--
-- Idempotency: the client-generated transaction id (and per-user idempotency_key) make every
-- create safe to retry. Results are jsonb: {"status": "applied" | "duplicate" | "conflict" |
-- "not_found", "transaction": {...}, "reason": "..."}. A function body runs in one database
-- transaction, so multi-row operations are all-or-nothing: any raised error rolls back every row.

-- Fields that define what a transaction *is* (used to tell a harmless replay from a conflict).
create function public.tx_fingerprint(t public.transactions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'type', t.type, 'amount_paise', t.amount_paise, 'currency', t.currency,
    'occurred_at', t.occurred_at, 'account_id', t.account_id,
    'from_account_id', t.from_account_id, 'to_account_id', t.to_account_id,
    'goal_id', t.goal_id, 'refund_of_id', t.refund_of_id, 'category_id', t.category_id,
    'subcategory_id', t.subcategory_id, 'description', t.description, 'merchant', t.merchant,
    'note', t.note, 'tags', t.tags, 'source', t.source,
    'recurring_template_id', t.recurring_template_id,
    'recurring_occurrence', t.recurring_occurrence
  )
$$;

create function public.require_uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    perform public.raise_rule('not_authenticated', 'Sign in to change your data.');
  end if;
  return uid;
end;
$$;

-- Core idempotent insert used by every create RPC.
create function public.insert_transaction(p_tx jsonb, p_batch_id uuid default null)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  candidate public.transactions;
  inserted public.transactions;
  existing public.transactions;
begin
  if p_tx is null or jsonb_typeof(p_tx) <> 'object' then
    perform public.raise_rule('invalid_payload', 'Expected a transaction object.');
  end if;
  candidate := jsonb_populate_record(null::public.transactions, p_tx);
  if candidate.id is null then
    perform public.raise_rule('missing_id', 'Every transaction needs a client-generated id.');
  end if;
  -- Server-owned fields: never taken from the client.
  candidate.owner_id := uid;
  candidate.batch_id := p_batch_id;
  candidate.idempotency_key := coalesce(candidate.idempotency_key, candidate.id::text);
  candidate.currency := coalesce(candidate.currency, 'INR');
  candidate.tags := coalesce(candidate.tags, '{}');
  candidate.source := coalesce(candidate.source, 'manual');
  candidate.deleted_at := null;
  candidate.voided_at := null;
  candidate.void_reason := null;

  insert into public.transactions values (candidate.*)
    on conflict do nothing
    returning * into inserted;
  if inserted.id is not null then
    return jsonb_build_object('status', 'applied', 'transaction', to_jsonb(inserted));
  end if;

  -- Nothing inserted: find what it collided with (only the caller's rows are visible).
  select * into existing from public.transactions
    where owner_id = uid and id = candidate.id;
  if existing.id is null then
    select * into existing from public.transactions
      where owner_id = uid and idempotency_key = candidate.idempotency_key;
  end if;
  if existing.id is null and candidate.recurring_template_id is not null then
    select * into existing from public.transactions
      where owner_id = uid and recurring_template_id = candidate.recurring_template_id
        and recurring_occurrence = candidate.recurring_occurrence;
    if existing.id is not null then
      return jsonb_build_object('status', 'conflict', 'reason', 'occurrence_already_recorded',
        'transaction', to_jsonb(existing));
    end if;
  end if;
  if existing.id is null then
    return jsonb_build_object('status', 'conflict', 'reason', 'id_in_use');
  end if;
  if existing.id = candidate.id
     and public.tx_fingerprint(existing) = public.tx_fingerprint(candidate) then
    return jsonb_build_object('status', 'duplicate', 'transaction', to_jsonb(existing));
  end if;
  return jsonb_build_object('status', 'conflict', 'reason', 'different_content',
    'transaction', to_jsonb(existing));
end;
$$;

create function public.create_transaction(p_tx jsonb) returns jsonb
language sql set search_path = '' as $$
  select public.insert_transaction(p_tx, null)
$$;

-- Logs several income/expense entries (e.g. "tea 15, bus 20, snacks 35") all-or-nothing.
create function public.log_transactions_batch(p_batch_id uuid, p_items jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  item jsonb;
  idx integer := 0;
  r jsonb;
  results jsonb := '[]'::jsonb;
  applied integer := 0;
begin
  perform public.require_uid();
  if p_batch_id is null then
    perform public.raise_rule('missing_id', 'A batch needs a client-generated id.');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    perform public.raise_rule('invalid_payload', 'Send between 1 and 50 entries.');
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item ->> 'type' not in ('expense', 'income') then
      perform public.raise_rule('invalid_payload', format('Entry %s must be an expense or income.', idx + 1));
    end if;
    r := public.insert_transaction(item, p_batch_id);
    if r ->> 'status' = 'conflict' then
      perform public.raise_rule('batch_conflict',
        format('Entry %s conflicts with an existing transaction (%s); nothing was saved.', idx + 1, r ->> 'reason'));
    end if;
    if r ->> 'status' = 'applied' then applied := applied + 1; end if;
    results := results || jsonb_build_array(r);
    idx := idx + 1;
  end loop;
  return jsonb_build_object(
    'status', case when applied = 0 then 'duplicate' else 'applied' end,
    'batch_id', p_batch_id, 'results', results);
end;
$$;

-- Money between two of the user's own accounts. One row; the consolidated balance is unchanged.
create function public.create_transfer(
  p_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount_paise bigint,
  p_occurred_at timestamptz, p_note text default null, p_source text default 'manual'
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  from_acct public.accounts;
  to_acct public.accounts;
begin
  select * into from_acct from public.accounts where owner_id = uid and id = p_from_account_id;
  select * into to_acct from public.accounts where owner_id = uid and id = p_to_account_id;
  if from_acct.id is null or to_acct.id is null then
    perform public.raise_rule('account_not_found', 'Choose two of your own accounts.');
  end if;
  if from_acct.archived_at is not null or to_acct.archived_at is not null then
    perform public.raise_rule('account_archived', 'Unarchive the account first.');
  end if;
  return public.insert_transaction(jsonb_build_object(
    'id', p_id, 'type', 'transfer', 'amount_paise', p_amount_paise,
    'currency', from_acct.currency, 'occurred_at', p_occurred_at,
    'from_account_id', p_from_account_id, 'to_account_id', p_to_account_id,
    'note', p_note, 'source', p_source
  ));
end;
$$;

-- Earmark money for a goal (allocation) or give it back to flexible money (release).
create function public.move_goal_money(
  p_id uuid, p_goal_id uuid, p_type text, p_amount_paise bigint, p_occurred_at timestamptz,
  p_note text default null
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  goal public.savings_goals;
begin
  if p_type not in ('allocation', 'allocation_release') then
    perform public.raise_rule('invalid_payload', 'Type must be allocation or allocation_release.');
  end if;
  select * into goal from public.savings_goals where owner_id = uid and id = p_goal_id;
  if goal.id is null then
    perform public.raise_rule('goal_not_found', 'Goal not found.');
  end if;
  return public.insert_transaction(jsonb_build_object(
    'id', p_id, 'type', p_type, 'amount_paise', p_amount_paise, 'currency', goal.currency,
    'occurred_at', p_occurred_at, 'goal_id', p_goal_id, 'note', p_note
  ));
end;
$$;

-- Buying what you saved for: the real expense + releasing up to that amount from the goal, in
-- one transaction, so the money is neither double-counted nor left earmarked.
create function public.record_goal_purchase(p_expense jsonb, p_release_id uuid, p_goal_id uuid)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  expense_result jsonb;
  release_result jsonb;
  existing_release public.transactions;
  earmarked bigint;
  release_amount bigint;
begin
  if p_expense ->> 'type' is distinct from 'expense' then
    perform public.raise_rule('invalid_payload', 'The purchase must be an expense.');
  end if;
  perform 1 from public.savings_goals where owner_id = uid and id = p_goal_id for update;
  if not found then
    perform public.raise_rule('goal_not_found', 'Goal not found.');
  end if;
  expense_result := public.insert_transaction(p_expense, null);
  if expense_result ->> 'status' = 'conflict' then
    perform public.raise_rule('conflict', 'This purchase conflicts with an existing transaction.');
  end if;

  select * into existing_release from public.transactions where owner_id = uid and id = p_release_id;
  if existing_release.id is not null then -- replay: the release was already recorded
    return jsonb_build_object('status', 'duplicate', 'expense', expense_result -> 'transaction',
      'release', to_jsonb(existing_release));
  end if;

  select coalesce(sum(case type when 'allocation' then amount_paise else -amount_paise end), 0)
    into earmarked from public.transactions
    where owner_id = uid and goal_id = p_goal_id and deleted_at is null and voided_at is null;
  release_amount := least((expense_result -> 'transaction' ->> 'amount_paise')::bigint, earmarked);
  if release_amount > 0 then
    release_result := public.insert_transaction(jsonb_build_object(
      'id', p_release_id, 'type', 'allocation_release', 'amount_paise', release_amount,
      'currency', expense_result -> 'transaction' ->> 'currency',
      'occurred_at', expense_result -> 'transaction' ->> 'occurred_at',
      'goal_id', p_goal_id, 'note', 'Released for a purchase'
    ), null);
  end if;
  return jsonb_build_object('status', expense_result ->> 'status',
    'expense', expense_result -> 'transaction', 'release', release_result -> 'transaction',
    'released_paise', greatest(release_amount, 0));
end;
$$;

-- Pays a planned commitment: records the actual expense and links it, atomically. Once linked,
-- safe-to-spend stops subtracting the commitment (the expense is already in the balance).
create function public.pay_commitment(p_commitment_id uuid, p_expense jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  c public.commitments;
  expense_result jsonb;
  paid_by public.transactions;
begin
  if p_expense ->> 'type' is distinct from 'expense' then
    perform public.raise_rule('invalid_payload', 'A bill is paid by an expense.');
  end if;
  select * into c from public.commitments where owner_id = uid and id = p_commitment_id for update;
  if c.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if c.cancelled_at is not null then
    perform public.raise_rule('commitment_cancelled', 'This commitment was cancelled.');
  end if;
  if c.paid_transaction_id is not null then
    select * into paid_by from public.transactions where owner_id = uid and id = c.paid_transaction_id;
    if public.is_active_tx(paid_by) and paid_by.id <> (p_expense ->> 'id')::uuid then
      return jsonb_build_object('status', 'conflict', 'reason', 'already_paid',
        'transaction', to_jsonb(paid_by));
    end if;
  end if;
  expense_result := public.insert_transaction(p_expense, null);
  if expense_result ->> 'status' = 'conflict' then
    perform public.raise_rule('conflict', 'This payment conflicts with an existing transaction.');
  end if;
  update public.commitments set paid_transaction_id = (expense_result -> 'transaction' ->> 'id')::uuid
    where owner_id = uid and id = p_commitment_id;
  return expense_result;
end;
$$;

-- Edits with optimistic concurrency. Identity, type and bookkeeping fields can't be patched.
create function public.update_transaction(p_id uuid, p_expected_version integer, p_patch jsonb)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  current_row public.transactions;
  candidate public.transactions;
  updated public.transactions;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform public.raise_rule('invalid_payload', 'Expected an object of changes.');
  end if;
  select * into current_row from public.transactions where owner_id = uid and id = p_id for update;
  if current_row.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  candidate := jsonb_populate_record(current_row, p_patch
    - array['id', 'owner_id', 'type', 'idempotency_key', 'batch_id', 'version', 'created_at',
            'updated_at', 'deleted_at', 'voided_at', 'void_reason', 'recurring_template_id',
            'recurring_occurrence']);
  if public.tx_fingerprint(candidate) = public.tx_fingerprint(current_row) then
    return jsonb_build_object('status', 'duplicate', 'transaction', to_jsonb(current_row));
  end if;
  if current_row.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict', 'reason', 'stale_version',
      'transaction', to_jsonb(current_row));
  end if;
  update public.transactions set
    amount_paise = candidate.amount_paise, currency = candidate.currency,
    occurred_at = candidate.occurred_at, account_id = candidate.account_id,
    from_account_id = candidate.from_account_id, to_account_id = candidate.to_account_id,
    goal_id = candidate.goal_id, refund_of_id = candidate.refund_of_id,
    category_id = candidate.category_id, subcategory_id = candidate.subcategory_id,
    description = candidate.description, merchant = candidate.merchant, note = candidate.note,
    tags = candidate.tags, source = candidate.source
  where owner_id = uid and id = p_id
  returning * into updated;
  return jsonb_build_object('status', 'applied', 'transaction', to_jsonb(updated));
end;
$$;

-- Soft delete (p_deleted = true) or undo it (false). Repeating either is a harmless duplicate.
create function public.set_transaction_deleted(p_id uuid, p_deleted boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  current_row public.transactions;
  updated public.transactions;
begin
  select * into current_row from public.transactions where owner_id = uid and id = p_id for update;
  if current_row.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if (current_row.deleted_at is not null) = p_deleted then
    return jsonb_build_object('status', 'duplicate', 'transaction', to_jsonb(current_row));
  end if;
  update public.transactions
    set deleted_at = case when p_deleted then now() else null end
    where owner_id = uid and id = p_id
    returning * into updated;
  return jsonb_build_object('status', 'applied', 'transaction', to_jsonb(updated));
end;
$$;

-- New functions are executable by PUBLIC by default; only signed-in users may call these.
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.tx_fingerprint(public.transactions),
  public.require_uid(),
  public.insert_transaction(jsonb, uuid),
  public.create_transaction(jsonb),
  public.log_transactions_batch(uuid, jsonb),
  public.create_transfer(uuid, uuid, uuid, bigint, timestamptz, text, text),
  public.move_goal_money(uuid, uuid, text, bigint, timestamptz, text),
  public.record_goal_purchase(jsonb, uuid, uuid),
  public.pay_commitment(uuid, jsonb),
  public.update_transaction(uuid, integer, jsonb),
  public.set_transaction_deleted(uuid, boolean)
to authenticated;
