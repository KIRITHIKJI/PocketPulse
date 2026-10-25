-- Per-user defaults (spec §9 category hierarchy, quick-add tiles, preferences) created when an
-- auth user is created, plus the global gamification catalogs.
--
-- No account/wallet is created here: onboarding (Phase 4) creates the default "Cash" wallet
-- together with the opening balance and its effective date, which only the user knows.
-- Quick-add tiles are seeded without amounts — the app never invents prices; a tile remembers
-- the amount the user saves for it.

create function public.seed_user_defaults(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cat jsonb;
  sub text;
  parent uuid;
  pos integer;
  sub_pos integer;
begin
  insert into public.profiles (id, display_name)
    select p_user, nullif(btrim(u.raw_user_meta_data ->> 'display_name'), '')
    from auth.users u where u.id = p_user
    on conflict (id) do nothing;
  insert into public.notification_preferences (owner_id) values (p_user)
    on conflict (owner_id) do nothing;
  insert into public.streak_state (owner_id) values (p_user)
    on conflict (owner_id) do nothing;

  if not exists (select 1 from public.categories where owner_id = p_user) then
    pos := 0;
    for cat in select value from jsonb_array_elements($json$[
      {"name": "Food & Drinks", "kind": "expense", "icon": "utensils", "color": "#F59E0B",
       "subs": ["Tea", "Coffee", "Snacks", "Breakfast", "Lunch", "Dinner", "Groceries", "Cafe", "Delivery"]},
      {"name": "College", "kind": "expense", "icon": "graduation-cap", "color": "#8B5CF6",
       "subs": ["Fees", "Books", "Stationery", "Printing", "Assignments", "Project components", "Events"]},
      {"name": "Transport", "kind": "expense", "icon": "bus", "color": "#06B6D4",
       "subs": ["Bus", "Train", "Auto", "Cab", "Fuel", "Parking"]},
      {"name": "Personal", "kind": "expense", "icon": "shirt", "color": "#EC4899",
       "subs": ["Clothes", "Grooming", "Personal care", "Shopping"]},
      {"name": "Entertainment", "kind": "expense", "icon": "clapperboard", "color": "#F97316",
       "subs": ["Movies", "Games", "Outings", "Hobbies"]},
      {"name": "Bills & Subscriptions", "kind": "expense", "icon": "receipt", "color": "#3B82F6",
       "subs": ["Mobile recharge", "Mobile data", "Subscriptions"]},
      {"name": "Health & Fitness", "kind": "expense", "icon": "heart-pulse", "color": "#10B981",
       "subs": ["Medicines", "Appointments", "Gym", "Fitness"]},
      {"name": "Other", "kind": "expense", "icon": "circle-ellipsis", "color": "#94A3B8",
       "subs": ["General", "Miscellaneous"]},
      {"name": "Allowance", "kind": "income", "icon": "wallet", "color": "#84CC16", "subs": []},
      {"name": "Part-time work", "kind": "income", "icon": "briefcase", "color": "#22C55E", "subs": []},
      {"name": "Scholarship", "kind": "income", "icon": "award", "color": "#14B8A6", "subs": []},
      {"name": "Gifts", "kind": "income", "icon": "gift", "color": "#A855F7", "subs": []},
      {"name": "Other income", "kind": "income", "icon": "circle-plus", "color": "#94A3B8", "subs": []}
    ]$json$::jsonb) loop
      insert into public.categories (owner_id, kind, name, icon, color, sort_order, is_default)
        values (p_user, cat ->> 'kind', cat ->> 'name', cat ->> 'icon', cat ->> 'color', pos, true)
        returning id into parent;
      sub_pos := 0;
      for sub in select jsonb_array_elements_text(cat -> 'subs') loop
        insert into public.categories (owner_id, parent_id, kind, name, sort_order, is_default)
          values (p_user, parent, cat ->> 'kind', sub, sub_pos, true);
        sub_pos := sub_pos + 1;
      end loop;
      pos := pos + 1;
    end loop;
  end if;

  if not exists (select 1 from public.quick_add_presets where owner_id = p_user) then
    insert into public.quick_add_presets (owner_id, label, icon, category_id, subcategory_id, sort_order)
    select p_user, p.label, p.icon, c.id, s.id, p.ord
    from (values
      ('Tea', 'coffee', 'Food & Drinks', 'Tea', 0),
      ('Coffee', 'coffee', 'Food & Drinks', 'Coffee', 1),
      ('Snacks', 'cookie', 'Food & Drinks', 'Snacks', 2),
      ('Breakfast', 'egg-fried', 'Food & Drinks', 'Breakfast', 3),
      ('Lunch', 'utensils', 'Food & Drinks', 'Lunch', 4),
      ('Dinner', 'soup', 'Food & Drinks', 'Dinner', 5),
      ('Bus', 'bus', 'Transport', 'Bus', 6),
      ('Train', 'train-front', 'Transport', 'Train', 7),
      ('Auto/Cab', 'car-taxi-front', 'Transport', 'Auto', 8),
      ('Recharge', 'smartphone', 'Bills & Subscriptions', 'Mobile recharge', 9),
      ('Groceries', 'shopping-basket', 'Food & Drinks', 'Groceries', 10),
      ('Custom', 'plus', null, null, 11)
    ) as p(label, icon, cat_name, sub_name, ord)
    left join public.categories c
      on c.owner_id = p_user and c.parent_id is null and c.kind = 'expense' and c.name = p.cat_name
    left join public.categories s
      on s.owner_id = p_user and s.parent_id = c.id and s.name = p.sub_name;
  end if;
end;
$$;

-- Runs inside the auth signup transaction.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_user_defaults(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- For users created before this migration: seeds the caller's own defaults (idempotent).
create function public.ensure_my_defaults() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    perform public.raise_rule('not_authenticated', 'Sign in first.');
  end if;
  perform public.seed_user_defaults(uid);
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.seed_user_defaults(uuid), public.handle_new_user()
  from authenticated;
grant execute on function public.ensure_my_defaults() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Gamification catalogs (rewards logging, categorising, reviewing and saving — never spending)

insert into public.achievements (code, title, description, xp, icon, sort_order) values
  ('first_10_transactions', 'First 10 Transactions', 'Logged your first 10 entries.', 50, 'list-checks', 0),
  ('streak_7_day', '7-Day Logging Streak', 'Logged something on 7 days in a row.', 70, 'flame', 1),
  ('no_mystery_money', 'No Mystery Money', 'A full week with every expense categorised.', 60, 'search-check', 2),
  ('first_savings_goal', 'First Savings Goal', 'Created a savings goal and set money aside.', 40, 'piggy-bank', 3),
  ('monthly_budget_achieved', 'Monthly Budget Achieved', 'Finished a month within your total budget.', 100, 'target', 4),
  ('spending_detective', 'Spending Detective', 'Explored the transactions behind 5 insights.', 40, 'scan-search', 5),
  ('weekly_review_complete', 'Weekly Review Complete', 'Reviewed a week of spending.', 30, 'calendar-check', 6);

insert into public.quests (code, title, description, cadence, target, xp, sort_order) values
  ('log_today', 'Log today', 'Record at least one entry today.', 'daily', 1, 5, 0),
  ('categorise_week', 'Clear the uncategorised queue', 'Leave no expense uncategorised this week.', 'weekly', 1, 20, 1),
  ('weekly_review', 'Weekly review', 'Look over this week''s spending.', 'weekly', 1, 15, 2),
  ('set_a_goal', 'Save on purpose', 'Create your first savings goal.', 'once', 1, 20, 3);
