-- Phase 8: the operations behind budgets, goals, commitments and recurring items, plus the tile
-- id Money Leaks needs.
--
-- Everything else in Phase 8 is a read of existing tables, or an ordinary owner-only write that
-- RLS and the existing triggers already cover. What's here is what those can't do:
--
-- * Entries remember which quick-add tile made them, so renaming a tile can't split its group.
-- * record_goal_purchase and pay_commitment are rewritten: a replay must never do new work.
-- * An occurrence of a recurring template is "recorded" while an active entry points at it, the
--   same rule as a paid commitment. Deleting the entry makes the occurrence due again, so the
--   per-occurrence unique rule now covers active rows only.

-- ---------------------------------------------------------------------------------------------
-- Which quick-add tile made an entry

alter table public.quick_add_presets
  add constraint quick_add_presets_owner_id_id_key unique (owner_id, id);

alter table public.transactions
  add column preset_id uuid,
  add constraint transactions_preset_expense_only check (preset_id is null or type = 'expense'),
  add constraint transactions_preset_fk foreign key (owner_id, preset_id)
    references public.quick_add_presets (owner_id, id) on delete no action;

create index transactions_preset on public.transactions (owner_id, preset_id)
  where preset_id is not null;

-- Old entries only recorded the tile's label as their description. An entry is linked when exactly
-- one tile of its owner has that label, hidden tiles included; a label two tiles share is left
-- alone rather than guessed. The custom tile (no category) names nothing, so it never matches.
-- The trigger is off so this bookkeeping doesn't look like an edit: no new version, no updated_at.
create function public.backfill_entry_presets() returns integer
language plpgsql set search_path = '' as $$
declare linked integer;
begin
  alter table public.transactions disable trigger transactions_guard;
  update public.transactions t set preset_id = m.preset_id
    from (
      select e.id, (array_agg(p.id))[1] as preset_id
        from public.transactions e
        join public.quick_add_presets p
          on p.owner_id = e.owner_id
         and p.category_id is not null
         and lower(btrim(p.label)) = lower(btrim(e.description))
       where e.type = 'expense' and e.source = 'quick_add' and e.preset_id is null
       group by e.id
      having count(*) = 1
    ) m
   where t.id = m.id;
  get diagnostics linked = row_count;
  alter table public.transactions enable trigger transactions_guard;
  return linked;
end;
$$;

select public.backfill_entry_presets();

-- The tile is part of what an entry is, so a replay with another tile is a conflict.
create or replace function public.tx_fingerprint(t public.transactions) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'type', t.type, 'amount_paise', t.amount_paise, 'currency', t.currency,
    'occurred_at', t.occurred_at, 'account_id', t.account_id,
    'from_account_id', t.from_account_id, 'to_account_id', t.to_account_id,
    'goal_id', t.goal_id, 'refund_of_id', t.refund_of_id, 'category_id', t.category_id,
    'subcategory_id', t.subcategory_id, 'description', t.description, 'merchant', t.merchant,
    'note', t.note, 'tags', t.tags, 'source', t.source,
    'recurring_template_id', t.recurring_template_id,
    'recurring_occurrence', t.recurring_occurrence,
    'preset_id', t.preset_id
  )
$$;

-- Same as before, with preset_id added to the fields a patch can't touch.
create or replace function public.update_transaction(
  p_id uuid, p_expected_version integer, p_patch jsonb
) returns jsonb
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
            'recurring_occurrence', 'preset_id']);
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

-- ---------------------------------------------------------------------------------------------
-- Buying what you saved for

-- The expense and its release are one database transaction and share a batch id (the release id),
-- so undo_transactions_batch reverses both or neither.
--
-- A replay does no new work. The expense already existing means this whole operation already ran,
-- so nothing is released again, even if money was set aside since then. The old version only
-- looked for the release row, so a purchase that had released nothing released on its retry.
create or replace function public.record_goal_purchase(
  p_expense jsonb, p_release_id uuid, p_goal_id uuid
) returns jsonb
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
  if p_release_id is null then
    perform public.raise_rule('missing_id', 'A goal purchase needs a client-generated release id.');
  end if;
  perform 1 from public.savings_goals where owner_id = uid and id = p_goal_id for update;
  if not found then
    perform public.raise_rule('goal_not_found', 'Goal not found.');
  end if;

  expense_result := public.insert_transaction(p_expense, p_release_id);
  if expense_result ->> 'status' = 'conflict' then
    perform public.raise_rule('conflict', 'This purchase conflicts with an existing transaction.');
  end if;

  if expense_result ->> 'status' = 'duplicate' then
    select * into existing_release from public.transactions
      where owner_id = uid and id = p_release_id;
    if expense_result -> 'transaction' ->> 'deleted_at' is not null then
      return jsonb_build_object('status', 'conflict', 'reason', 'entry_removed',
        'transaction', expense_result -> 'transaction');
    end if;
    return jsonb_build_object('status', 'duplicate',
      'transaction', expense_result -> 'transaction',
      'expense', expense_result -> 'transaction',
      'release', case when existing_release.id is null then null else to_jsonb(existing_release) end,
      'released_paise', coalesce(existing_release.amount_paise, 0));
  end if;

  select coalesce(sum(case type when 'allocation' then amount_paise else -amount_paise end), 0)
    into earmarked from public.transactions
    where owner_id = uid and goal_id = p_goal_id and deleted_at is null and voided_at is null;
  release_amount := greatest(
    least((expense_result -> 'transaction' ->> 'amount_paise')::bigint, earmarked), 0);
  if release_amount > 0 then
    release_result := public.insert_transaction(jsonb_build_object(
      'id', p_release_id, 'type', 'allocation_release', 'amount_paise', release_amount,
      'currency', expense_result -> 'transaction' ->> 'currency',
      'occurred_at', expense_result -> 'transaction' ->> 'occurred_at',
      'goal_id', p_goal_id, 'note', 'Released for a purchase'
    ), p_release_id);
    -- Raising rolls the expense back too: both happen or neither does.
    if release_result ->> 'status' <> 'applied' then
      perform public.raise_rule('conflict', 'This release id is already in use.');
    end if;
  end if;
  return jsonb_build_object('status', 'applied',
    'transaction', expense_result -> 'transaction',
    'expense', expense_result -> 'transaction',
    'release', release_result -> 'transaction',
    'released_paise', release_amount);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Paying a planned commitment

-- The expense and the link are written in one transaction, so there is no moment when the bill is
-- both in the balance and still unpaid. New here: replaying a payment whose entry was deleted is a
-- conflict. It used to answer `duplicate`, which read as paid while the bill was unpaid again.
create or replace function public.pay_commitment(p_commitment_id uuid, p_expense jsonb)
returns jsonb
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
  if c.paid_transaction_id is not null then
    select * into paid_by from public.transactions
      where owner_id = uid and id = c.paid_transaction_id;
    if public.is_active_tx(paid_by) and paid_by.id <> (p_expense ->> 'id')::uuid then
      return jsonb_build_object('status', 'conflict', 'reason', 'already_paid',
        'transaction', to_jsonb(paid_by));
    end if;
  end if;
  if c.cancelled_at is not null then
    perform public.raise_rule('commitment_cancelled', 'This commitment was cancelled.');
  end if;
  expense_result := public.insert_transaction(p_expense, null);
  if expense_result ->> 'status' = 'conflict' then
    perform public.raise_rule('conflict', 'This payment conflicts with an existing transaction.');
  end if;
  if expense_result ->> 'status' = 'duplicate'
     and expense_result -> 'transaction' ->> 'deleted_at' is not null then
    return jsonb_build_object('status', 'conflict', 'reason', 'entry_removed',
      'transaction', expense_result -> 'transaction');
  end if;
  update public.commitments set paid_transaction_id = (expense_result -> 'transaction' ->> 'id')::uuid
    where owner_id = uid and id = p_commitment_id;
  return expense_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Confirming a recurring occurrence

-- One active entry per occurrence. Deleted entries don't hold the occurrence, so a confirmation
-- that was undone can be confirmed again.
do $$
declare
  name text;
begin
  select c.conname into name
    from pg_constraint c
   where c.conrelid = 'public.transactions'::regclass and c.contype = 'u'
     and (
       select array_agg(a.attname::text order by a.attname)
         from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     ) = array['owner_id', 'recurring_occurrence', 'recurring_template_id'];
  execute format('alter table public.transactions drop constraint %I', name);
end;
$$;

create unique index transactions_one_active_occurrence
  on public.transactions (owner_id, recurring_template_id, recurring_occurrence)
  where recurring_template_id is not null and deleted_at is null and voided_at is null;

-- Records what actually happened for one due occurrence: exactly one real entry, however many
-- times this is retried and from however many devices. Upcoming lists and safe-to-spend read that
-- entry, so the occurrence stops being forecast in the same save. A skip recorded earlier is
-- removed in the same save too.
create function public.confirm_recurring(p_template_id uuid, p_occurrence date, p_tx jsonb)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  t public.recurring_templates;
  recorded public.transactions;
  result jsonb;
begin
  if p_occurrence is null or p_tx is null or jsonb_typeof(p_tx) <> 'object' then
    perform public.raise_rule('invalid_payload', 'Expected an occurrence and an entry.');
  end if;
  -- Locked so two devices confirming at once queue here and the second finds the first's entry.
  select * into t from public.recurring_templates
    where owner_id = uid and id = p_template_id for update;
  if t.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_tx ->> 'type' is distinct from t.kind then
    perform public.raise_rule('invalid_payload', 'The entry must match the template''s kind.');
  end if;

  select * into recorded from public.transactions
    where owner_id = uid and recurring_template_id = t.id and recurring_occurrence = p_occurrence
      and deleted_at is null and voided_at is null;
  if recorded.id is not null then
    return jsonb_build_object('status', 'duplicate', 'reason', 'occurrence_already_recorded',
      'transaction', to_jsonb(recorded));
  end if;
  if t.archived_at is not null then
    perform public.raise_rule('template_archived', 'This recurring item is archived.');
  end if;

  result := public.insert_transaction(
    p_tx || jsonb_build_object('recurring_template_id', t.id,
      'recurring_occurrence', p_occurrence, 'source', 'recurring'), null);
  if result ->> 'status' = 'conflict' then
    perform public.raise_rule('conflict', 'This entry conflicts with an existing transaction.');
  end if;
  if result ->> 'status' = 'duplicate' then -- the same id again, and it's been deleted since
    return jsonb_build_object('status', 'conflict', 'reason', 'entry_removed',
      'transaction', result -> 'transaction');
  end if;
  delete from public.commitments
    where owner_id = uid and recurring_template_id = t.id and recurring_occurrence = p_occurrence;
  return result;
end;
$$;

-- New functions are executable by PUBLIC by default; only signed-in users may call the RPCs.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.backfill_entry_presets() from authenticated;

grant execute on function public.confirm_recurring(uuid, date, jsonb) to authenticated;
