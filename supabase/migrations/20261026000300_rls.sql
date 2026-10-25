-- Row Level Security: every private table is owner-only. owner_id is compared with auth.uid()
-- from the verified JWT; a client-supplied owner_id that isn't the caller's fails WITH CHECK.
-- `anon` gets nothing. Writes the client must not make directly (ledger hard-deletes,
-- gamification state) have no policy and no grant.

-- Supabase grants broad table privileges to anon/authenticated by default; narrow them.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all functions in schema public from public, anon;

do $$
declare
  t text;
begin
  -- Ordinary owner-only tables: full CRUD on own rows.
  foreach t in array array[
    'accounts', 'categories', 'category_rules', 'savings_goals', 'recurring_templates',
    'commitments', 'budgets', 'quick_add_presets', 'notifications', 'sync_operations',
    'sync_devices'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
         using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy owner_update on public.%I for update to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
         using (owner_id = (select auth.uid()))', t);
  end loop;

  -- Read-only for the owner; written by server functions (signup trigger, rewards engine).
  foreach t in array array['xp_events', 'user_achievements', 'user_quests', 'streak_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
         using (owner_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Transactions: no hard delete from clients (soft delete via deleted_at keeps history and sync
-- correct). Account deletion removes them through auth.users.
alter table public.transactions enable row level security;
grant select, insert, update on public.transactions to authenticated;
create policy owner_select on public.transactions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy owner_insert on public.transactions for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy owner_update on public.transactions for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Profiles and notification preferences: keyed by the user id, created at signup, never deleted
-- by the client.
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;
create policy own_profile_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy own_profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.notification_preferences enable row level security;
grant select, update on public.notification_preferences to authenticated;
create policy owner_select on public.notification_preferences for select to authenticated
  using (owner_id = (select auth.uid()));
create policy owner_update on public.notification_preferences for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Public catalogs: readable by signed-in users, writable only by migrations.
alter table public.achievements enable row level security;
alter table public.quests enable row level security;
grant select on public.achievements, public.quests to authenticated;
create policy catalog_read on public.achievements for select to authenticated using (true);
create policy catalog_read on public.quests for select to authenticated using (true);

-- Helpers called from triggers run with the caller's privileges.
grant execute on function
  public.raise_rule(text, text),
  public.check_category_pair(uuid, uuid, uuid, text),
  public.check_goal_earmark(uuid, uuid, public.transactions),
  public.is_active_tx(public.transactions)
to authenticated;

-- The currency domain is used in column types; signed-in users need to resolve it.
grant usage on domain public.currency_code to authenticated;
