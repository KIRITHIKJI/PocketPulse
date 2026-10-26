-- Phase 4: onboarding, accounts and category management.
--
-- Everything here is SECURITY INVOKER: RLS and the integrity triggers apply exactly as for a
-- direct write, and the owner is always auth.uid(). Multi-row changes (default wallet swap,
-- currency change, category merge) run in one function body, so they are all-or-nothing.

-- ---------------------------------------------------------------------------------------------
-- Accounts

-- The default wallet can't be archived (pick another default first), so every form that needs
-- an account always has one to preselect.
create function public.accounts_default_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_default and new.archived_at is not null then
    perform public.raise_rule('default_account_archived',
      'Choose another default wallet before archiving this one.');
  end if;
  return new;
end;
$$;

create trigger accounts_default_guard before insert or update on public.accounts
  for each row execute function public.accounts_default_guard();

-- Returns the caller's default wallet, creating "Cash" (₹0 from today, in the user's timezone)
-- if there is none. Works for any user, whether their defaults came from the signup trigger or
-- the backfill. If an active account is already called "Cash", it becomes the default instead
-- of creating a duplicate. Safe to call repeatedly and concurrently.
create function public.ensure_default_account() returns public.accounts
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  acct public.accounts;
  tz text;
  cur text;
begin
  select * into acct from public.accounts where owner_id = uid and is_default;
  if acct.id is not null then
    return acct;
  end if;
  select p.time_zone, p.currency into tz, cur from public.profiles p where p.id = uid;

  update public.accounts set is_default = true
    where owner_id = uid and archived_at is null and lower(btrim(name)) = 'cash'
    returning * into acct;
  if acct.id is not null then
    return acct;
  end if;

  insert into public.accounts
    (owner_id, name, kind, currency, opening_balance_paise, opening_balance_date, is_default)
  values
    (uid, 'Cash', 'cash', coalesce(cur, 'INR'), 0,
     (now() at time zone coalesce(tz, 'Asia/Kolkata'))::date, true)
  on conflict do nothing
  returning * into acct;
  if acct.id is null then
    -- A concurrent call created it first.
    select * into acct from public.accounts where owner_id = uid and is_default;
  end if;
  return acct;
end;
$$;

-- Moves the default flag to another active account (the unique index allows one default).
create function public.set_default_account(p_id uuid) returns public.accounts
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  target public.accounts;
begin
  select * into target from public.accounts where owner_id = uid and id = p_id for update;
  if target.id is null then
    perform public.raise_rule('account_not_found', 'That wallet doesn''t exist.');
  end if;
  if target.archived_at is not null then
    perform public.raise_rule('account_archived', 'Restore this wallet before making it the default.');
  end if;
  update public.accounts set is_default = false where owner_id = uid and is_default and id <> p_id;
  update public.accounts set is_default = true where owner_id = uid and id = p_id
    returning * into target;
  return target;
end;
$$;

-- Onboarding's balance step, all-or-nothing: the default wallet's opening balance plus any extra
-- wallets, all as of one effective date. Extra wallets carry client-generated ids, so submitting
-- the step again updates them instead of creating duplicates.
-- p_extra: [{"id": uuid, "name": text, "kind": text, "opening_balance_paise": int}]
create function public.save_opening_balances(
  p_opening_date date, p_default_paise bigint, p_default_name text, p_extra jsonb
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  wallet public.accounts := public.ensure_default_account();
  item jsonb;
  cur text;
  n integer := 0;
begin
  if p_opening_date is null or p_default_paise is null then
    perform public.raise_rule('invalid_payload', 'Choose a date and an opening balance.');
  end if;
  if jsonb_typeof(coalesce(p_extra, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_extra, '[]'::jsonb)) > 10 then
    perform public.raise_rule('invalid_payload', 'Add at most 10 extra wallets.');
  end if;
  select p.currency into cur from public.profiles p where p.id = uid;

  update public.accounts set
    name = coalesce(nullif(btrim(p_default_name), ''), name),
    opening_balance_paise = p_default_paise,
    opening_balance_date = p_opening_date
  where owner_id = uid and id = wallet.id;

  for item in select value from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) loop
    insert into public.accounts
      (id, owner_id, name, kind, currency, opening_balance_paise, opening_balance_date, sort_order)
    values (
      (item ->> 'id')::uuid, uid, btrim(item ->> 'name'), item ->> 'kind', coalesce(cur, 'INR'),
      (item ->> 'opening_balance_paise')::bigint, p_opening_date, n + 1
    )
    on conflict (id) do update set
      name = excluded.name, kind = excluded.kind,
      opening_balance_paise = excluded.opening_balance_paise,
      opening_balance_date = excluded.opening_balance_date;
    n := n + 1;
  end loop;

  return jsonb_build_object('status', 'applied', 'default_account_id', wallet.id, 'extra', n);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Currency: one currency per user, so totals never mix currencies. It can change only before
-- the first transaction; then every account, goal, budget, template and commitment follows.

create function public.change_currency(p_currency public.currency_code) returns void
language plpgsql set search_path = '' as $$
declare uid uuid := public.require_uid();
begin
  if exists (select 1 from public.transactions where owner_id = uid) then
    perform public.raise_rule('currency_locked',
      'Currency can''t change after your first entry, so totals never mix currencies.');
  end if;
  update public.profiles set currency = p_currency where id = uid;
  update public.accounts set currency = p_currency where owner_id = uid;
  update public.savings_goals set currency = p_currency where owner_id = uid;
  update public.budgets set currency = p_currency where owner_id = uid;
  update public.recurring_templates set currency = p_currency where owner_id = uid;
  update public.commitments set currency = p_currency where owner_id = uid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Budgets: onboarding's starting monthly budgets, all-or-nothing. Each item sets (or, with a
-- null limit, archives) the one active monthly budget for its scope; category_id null = total.
-- p_items: [{"category_id": uuid | null, "limit_paise": int | null}]

create function public.set_monthly_budgets(p_items jsonb) returns integer
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  item jsonb;
  cat uuid;
  lim bigint;
  cur text;
  n integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 60 then
    perform public.raise_rule('invalid_payload', 'Send at most 60 budgets.');
  end if;
  select p.currency into cur from public.profiles p where p.id = uid;
  for item in select value from jsonb_array_elements(p_items) loop
    cat := nullif(item ->> 'category_id', '')::uuid;
    lim := (item ->> 'limit_paise')::bigint;
    if lim is null then
      update public.budgets set archived_at = now()
        where owner_id = uid and category_id is not distinct from cat and period = 'monthly'
          and archived_at is null;
    else
      update public.budgets set limit_paise = lim
        where owner_id = uid and category_id is not distinct from cat and period = 'monthly'
          and archived_at is null;
      if not found then
        insert into public.budgets (owner_id, category_id, limit_paise, currency, period)
          values (uid, cat, lim, coalesce(cur, 'INR'), 'monthly');
      end if;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Categories

-- Sets the display order of one group of siblings. p_ids must list exactly the active
-- (unarchived, unmerged) categories under p_parent (null = top level) of kind p_kind.
create function public.reorder_categories(p_parent uuid, p_kind text, p_ids uuid[]) returns void
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  expected uuid[];
begin
  select coalesce(array_agg(id order by id), '{}') into expected from public.categories
    where owner_id = uid and parent_id is not distinct from p_parent and kind = p_kind
      and archived_at is null and merged_into_id is null;
  if coalesce(array_length(p_ids, 1), 0) <> coalesce(array_length(expected, 1), 0)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) x) <> expected then
    perform public.raise_rule('reorder_mismatch',
      'The list changed on another device. Reload and try again.');
  end if;
  update public.categories c set sort_order = o.pos - 1
    from unnest(p_ids) with ordinality as o(id, pos)
    where c.owner_id = uid and c.id = o.id;
end;
$$;

-- Points every reference to subcategory p_old at (p_cat, p_sub) instead. Returns the number of
-- transactions changed.
create function public.repoint_subcategory(p_owner uuid, p_old uuid, p_cat uuid, p_sub uuid)
returns integer
language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.transactions set category_id = p_cat, subcategory_id = p_sub
    where owner_id = p_owner and subcategory_id = p_old;
  get diagnostics n = row_count;
  update public.category_rules set category_id = p_cat, subcategory_id = p_sub
    where owner_id = p_owner and subcategory_id = p_old;
  update public.quick_add_presets set category_id = p_cat, subcategory_id = p_sub
    where owner_id = p_owner and subcategory_id = p_old;
  update public.recurring_templates set category_id = p_cat, subcategory_id = p_sub
    where owner_id = p_owner and subcategory_id = p_old;
  update public.commitments set category_id = p_cat, subcategory_id = p_sub
    where owner_id = p_owner and subcategory_id = p_old;
  return n;
end;
$$;

-- Merges p_source into p_target. History stays meaningful: every transaction (and budget, rule,
-- quick-add tile, recurring template, commitment) that used the source now uses the target, so
-- totals move with it and nothing is lost. The source row is kept, archived, with
-- merged_into_id = target, as the record of what happened.
--
-- * subcategory → subcategory (any parent) or → main category (entries keep only the category).
-- * main category → main category: its subcategories move under the target; one whose name the
--   target already has is merged into that subcategory.
-- * A main category can't merge into a subcategory, and kinds (expense/income) must match.
create function public.merge_category(p_source uuid, p_target uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  uid uuid := public.require_uid();
  src public.categories;
  tgt public.categories;
  child public.categories;
  same public.categories;
  next_pos integer;
  moved integer := 0;
  n integer;
begin
  if p_source = p_target then
    perform public.raise_rule('merge_same_category', 'Choose a different category to merge into.');
  end if;
  select * into src from public.categories where owner_id = uid and id = p_source for update;
  select * into tgt from public.categories where owner_id = uid and id = p_target for update;
  if src.id is null or tgt.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if src.archived_at is not null or src.merged_into_id is not null
     or tgt.archived_at is not null or tgt.merged_into_id is not null then
    perform public.raise_rule('category_inactive', 'Restore archived categories before merging.');
  end if;
  if src.kind <> tgt.kind then
    perform public.raise_rule('category_kind_mismatch',
      'Spending and income categories can''t be merged together.');
  end if;

  if src.parent_id is null then
    if tgt.parent_id is not null then
      perform public.raise_rule('merge_main_into_sub',
        'A main category can only merge into another main category.');
    end if;
    select coalesce(max(sort_order), -1) + 1 into next_pos from public.categories
      where owner_id = uid and parent_id = tgt.id;
    for child in select * from public.categories
                 where owner_id = uid and parent_id = src.id order by sort_order, id loop
      same := null;
      if child.archived_at is null and child.merged_into_id is null then
        select * into same from public.categories
          where owner_id = uid and parent_id = tgt.id and archived_at is null
            and merged_into_id is null and lower(btrim(name)) = lower(btrim(child.name));
      end if;
      if same.id is not null then
        moved := moved + public.repoint_subcategory(uid, child.id, tgt.id, same.id);
        update public.categories set merged_into_id = same.id, archived_at = now(),
          parent_id = tgt.id where owner_id = uid and id = child.id;
        update public.categories set merged_into_id = same.id
          where owner_id = uid and merged_into_id = child.id;
      else
        update public.categories set parent_id = tgt.id, sort_order = next_pos
          where owner_id = uid and id = child.id;
        next_pos := next_pos + 1;
      end if;
    end loop;

    -- Children now sit under the target, so moving the category keeps every pair consistent.
    update public.transactions set category_id = tgt.id
      where owner_id = uid and category_id = src.id;
    get diagnostics n = row_count;
    moved := moved + n;
    update public.category_rules set category_id = tgt.id where owner_id = uid and category_id = src.id;
    update public.quick_add_presets set category_id = tgt.id where owner_id = uid and category_id = src.id;
    update public.recurring_templates set category_id = tgt.id where owner_id = uid and category_id = src.id;
    update public.commitments set category_id = tgt.id where owner_id = uid and category_id = src.id;
    -- One active budget per category and period: the target's existing budget wins.
    update public.budgets b set archived_at = now()
      where b.owner_id = uid and b.category_id = src.id and b.archived_at is null
        and b.period <> 'custom'
        and exists (select 1 from public.budgets t where t.owner_id = uid
                    and t.category_id = tgt.id and t.period = b.period and t.archived_at is null);
    update public.budgets set category_id = tgt.id where owner_id = uid and category_id = src.id;
  else
    moved := public.repoint_subcategory(uid, src.id, coalesce(tgt.parent_id, tgt.id),
      case when tgt.parent_id is null then null else tgt.id end);
  end if;

  -- Earlier merges into the source now point at the final target (no chains).
  update public.categories set merged_into_id = tgt.id
    where owner_id = uid and merged_into_id = src.id;
  update public.categories set merged_into_id = tgt.id, archived_at = now()
    where owner_id = uid and id = src.id;

  return jsonb_build_object('status', 'applied', 'transactions_moved', moved,
    'source_id', src.id, 'target_id', tgt.id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants. New functions are executable by PUBLIC by default; only signed-in users may call these.

revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.ensure_default_account(),
  public.set_default_account(uuid),
  public.save_opening_balances(date, bigint, text, jsonb),
  public.change_currency(public.currency_code),
  public.set_monthly_budgets(jsonb),
  public.reorder_categories(uuid, text, uuid[]),
  public.repoint_subcategory(uuid, uuid, uuid, uuid),
  public.merge_category(uuid, uuid)
to authenticated;
