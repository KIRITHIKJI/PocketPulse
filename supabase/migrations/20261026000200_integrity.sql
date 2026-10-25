-- Integrity triggers: the cross-row rules from src/domain that a CHECK constraint can't express.
-- They run for every write path (RPC, direct table write, service role), so the database never
-- holds a ledger the domain layer would reject.
--
-- Errors are raised with SQLSTATE P0001 and a stable machine-readable MESSAGE (e.g.
-- 'refund_exceeds_expense'); DETAIL carries the human explanation. The app maps codes to copy.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'categories', 'category_rules', 'savings_goals',
    'recurring_templates', 'commitments', 'budgets', 'quick_add_presets',
    'notification_preferences', 'user_quests', 'streak_state'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

create function public.raise_rule(code text, detail text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = code, detail = detail;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Categories: one level of nesting, subcategory shares its parent's kind, kind is fixed.

create function public.categories_guard() returns trigger
language plpgsql set search_path = '' as $$
declare parent public.categories;
begin
  if tg_op = 'UPDATE' and new.kind <> old.kind then
    perform public.raise_rule('category_kind_immutable', 'A category''s kind cannot change.');
  end if;
  if new.parent_id is not null then
    select * into parent from public.categories
      where owner_id = new.owner_id and id = new.parent_id;
    if parent.parent_id is not null then
      perform public.raise_rule('category_too_deep', 'Subcategories cannot have subcategories.');
    end if;
    if parent.kind <> new.kind then
      perform public.raise_rule('category_kind_mismatch', 'A subcategory must match its parent''s kind.');
    end if;
    if exists (select 1 from public.categories where owner_id = new.owner_id and parent_id = new.id) then
      perform public.raise_rule('category_has_children', 'A category with subcategories cannot become a subcategory.');
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_guard before insert or update on public.categories
  for each row execute function public.categories_guard();

-- Shared check: subcategory belongs to the category, both of the expected kind.
create function public.check_category_pair(
  p_owner uuid, p_category uuid, p_subcategory uuid, p_kind text
) returns void
language plpgsql set search_path = '' as $$
declare cat public.categories; sub public.categories;
begin
  if p_category is null then return; end if;
  select * into cat from public.categories where owner_id = p_owner and id = p_category;
  if cat.parent_id is not null then
    perform public.raise_rule('category_not_top_level', 'Choose a category, then optionally a subcategory.');
  end if;
  if p_kind is not null and cat.kind <> p_kind then
    perform public.raise_rule('category_kind_mismatch', format('This needs a %s category.', p_kind));
  end if;
  if p_subcategory is not null then
    select * into sub from public.categories where owner_id = p_owner and id = p_subcategory;
    if sub.parent_id is distinct from p_category then
      perform public.raise_rule('subcategory_mismatch', 'That subcategory belongs to a different category.');
    end if;
  end if;
end;
$$;

-- One small trigger function per table shape (PL/pgSQL can't reference columns a table lacks).
create function public.expense_category_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.check_category_pair(new.owner_id, new.category_id, new.subcategory_id, 'expense');
  return new;
end;
$$;

create function public.recurring_category_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.check_category_pair(new.owner_id, new.category_id, new.subcategory_id, new.kind);
  return new;
end;
$$;

create function public.budget_category_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.check_category_pair(new.owner_id, new.category_id, null, 'expense');
  return new;
end;
$$;

create function public.rule_category_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.check_category_pair(new.owner_id, new.category_id, new.subcategory_id, null);
  return new;
end;
$$;

create trigger category_guard before insert or update on public.commitments
  for each row execute function public.expense_category_guard();
create trigger category_guard before insert or update on public.quick_add_presets
  for each row execute function public.expense_category_guard();
create trigger category_guard before insert or update on public.recurring_templates
  for each row execute function public.recurring_category_guard();
create trigger category_guard before insert or update on public.budgets
  for each row execute function public.budget_category_guard();
create trigger category_guard before insert or update on public.category_rules
  for each row execute function public.rule_category_guard();

-- ---------------------------------------------------------------------------------------------
-- Accounts: currency is fixed once the ledger uses the account.

create function public.accounts_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.currency <> old.currency and exists (
    select 1 from public.transactions t
    where t.owner_id = old.owner_id
      and old.id in (t.account_id, t.from_account_id, t.to_account_id)
  ) then
    perform public.raise_rule('account_currency_locked', 'This account already has transactions in its currency.');
  end if;
  return new;
end;
$$;

create trigger accounts_guard before update on public.accounts
  for each row execute function public.accounts_guard();

-- ---------------------------------------------------------------------------------------------
-- Transactions

create function public.is_active_tx(t public.transactions) returns boolean
language sql immutable set search_path = '' as $$
  select t.deleted_at is null and t.voided_at is null
$$;

create function public.transactions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  acct_currency text;
  original public.transactions;
  goal public.savings_goals;
  refunded bigint;
  refund_predates boolean;
  new_active boolean := new.deleted_at is null and new.voided_at is null;
begin
  -- Server-owned bookkeeping fields.
  if tg_op = 'INSERT' then
    new.idempotency_key := coalesce(new.idempotency_key, new.id::text);
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
  else
    if new.id <> old.id or new.owner_id <> old.owner_id or new.type <> old.type
       or new.idempotency_key <> old.idempotency_key or new.created_at <> old.created_at
       or new.batch_id is distinct from old.batch_id then
      perform public.raise_rule('transaction_field_immutable',
        'Id, owner, type, idempotency key, batch and creation time cannot change. Delete and re-add instead.');
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  -- Currency must match every account involved.
  for acct_currency in
    select a.currency from public.accounts a
    where a.owner_id = new.owner_id
      and a.id in (new.account_id, new.from_account_id, new.to_account_id)
  loop
    if acct_currency <> new.currency then
      perform public.raise_rule('currency_mismatch',
        format('Transaction currency %s differs from the account currency %s.', new.currency, acct_currency));
    end if;
  end loop;

  -- Categories: expense categories for expenses/refunds, income categories for income.
  if new.type in ('income', 'expense', 'refund') then
    perform public.check_category_pair(
      new.owner_id, new.category_id, new.subcategory_id,
      case when new.type = 'income' then 'income' else 'expense' end);
  end if;

  -- Refunds: linked to an active expense of the same user, same currency, not earlier, and the
  -- active refunds never exceed it. The original row is locked so concurrent refunds serialize.
  if new.type = 'refund' then
    select * into original from public.transactions
      where owner_id = new.owner_id and id = new.refund_of_id for update;
    if original.type is distinct from 'expense' then
      perform public.raise_rule('refund_without_expense', 'A refund must be linked to one of your expenses.');
    end if;
    if new_active then
      if not public.is_active_tx(original) then
        perform public.raise_rule('refund_of_inactive_expense', 'That expense was deleted or voided.');
      end if;
      if original.currency <> new.currency then
        perform public.raise_rule('currency_mismatch', 'A refund must use the expense''s currency.');
      end if;
      if new.occurred_at < original.occurred_at then
        perform public.raise_rule('refund_before_expense', 'A refund cannot be dated before its expense.');
      end if;
      select coalesce(sum(amount_paise), 0) into refunded from public.transactions
        where owner_id = new.owner_id and refund_of_id = new.refund_of_id and type = 'refund'
          and id <> new.id and deleted_at is null and voided_at is null;
      if refunded + new.amount_paise > original.amount_paise then
        perform public.raise_rule('refund_exceeds_expense',
          format('Only %s paise of this expense can still be refunded.', original.amount_paise - refunded));
      end if;
    end if;
  end if;

  -- Expenses with refunds: can't shrink below, move after, or deactivate under their refunds.
  if tg_op = 'UPDATE' and new.type = 'expense' then
    select coalesce(sum(amount_paise), 0), coalesce(bool_or(occurred_at < new.occurred_at), false)
      into refunded, refund_predates
      from (select amount_paise, occurred_at from public.transactions
            where owner_id = new.owner_id and refund_of_id = new.id and type = 'refund'
              and deleted_at is null and voided_at is null) r;
    if refunded > 0 then
      if new.deleted_at is not null or new.voided_at is not null then
        perform public.raise_rule('expense_has_refunds', 'Delete its refunds first.');
      end if;
      if new.amount_paise < refunded then
        perform public.raise_rule('expense_below_refunds', 'The expense cannot be smaller than its refunds.');
      end if;
      if refund_predates then
        perform public.raise_rule('refund_before_expense', 'A refund cannot be dated before its expense.');
      end if;
      if new.currency <> old.currency then
        perform public.raise_rule('currency_mismatch', 'An expense with refunds cannot change currency.');
      end if;
    end if;
  end if;

  -- Goal earmarks: per goal, active allocations − releases never drops below zero.
  if new.type in ('allocation', 'allocation_release') then
    select * into goal from public.savings_goals
      where owner_id = new.owner_id and id = new.goal_id for update;
    if goal.currency <> new.currency then
      perform public.raise_rule('currency_mismatch', 'Use the goal''s currency.');
    end if;
    if tg_op = 'INSERT' and new.type = 'allocation' and goal.status = 'archived' then
      perform public.raise_rule('goal_archived', 'Unarchive the goal before setting money aside.');
    end if;
    perform public.check_goal_earmark(new.owner_id, new.goal_id, new);
    if tg_op = 'UPDATE' and old.goal_id <> new.goal_id then
      perform public.check_goal_earmark(old.owner_id, old.goal_id, new);
    end if;
  end if;

  return new;
end;
$$;

-- Net earmark for a goal with `candidate` replacing any stored row with the same id.
create function public.check_goal_earmark(p_owner uuid, p_goal uuid, candidate public.transactions)
returns void
language plpgsql set search_path = '' as $$
declare earmarked bigint;
begin
  select coalesce(sum(case type when 'allocation' then amount_paise else -amount_paise end), 0)
    into earmarked
    from public.transactions
    where owner_id = p_owner and goal_id = p_goal and id <> candidate.id
      and type in ('allocation', 'allocation_release')
      and deleted_at is null and voided_at is null;
  if candidate.goal_id = p_goal and public.is_active_tx(candidate) then
    earmarked := earmarked
      + case candidate.type when 'allocation' then candidate.amount_paise else -candidate.amount_paise end;
  end if;
  if earmarked < 0 then
    perform public.raise_rule('release_exceeds_allocation',
      'You cannot release more than is set aside for this goal.');
  end if;
end;
$$;

create trigger transactions_guard before insert or update on public.transactions
  for each row execute function public.transactions_guard();

-- ---------------------------------------------------------------------------------------------
-- Commitments: a payment must be an expense; paid commitments keep their link.

create function public.commitments_paid_guard() returns trigger
language plpgsql set search_path = '' as $$
declare tx public.transactions;
begin
  if new.paid_transaction_id is not null then
    select * into tx from public.transactions
      where owner_id = new.owner_id and id = new.paid_transaction_id;
    if tx.type is distinct from 'expense' then
      perform public.raise_rule('commitment_payment_not_expense', 'A bill is paid by an expense.');
    end if;
  end if;
  return new;
end;
$$;

create trigger commitments_paid_guard before insert or update on public.commitments
  for each row execute function public.commitments_paid_guard();
