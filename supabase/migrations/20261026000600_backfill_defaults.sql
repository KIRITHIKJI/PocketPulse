-- Backfill per-user defaults for auth users that existed before the on_auth_user_created trigger
-- (e.g. users added in the Dashboard before the first `db push`). seed_user_defaults is
-- idempotent: profile, notification preferences and streak state use ON CONFLICT DO NOTHING, and
-- categories / quick-add tiles are only created for a user who has none. Users who already have
-- defaults are unaffected, so this is safe to run again.

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.seed_user_defaults(u.id);
  end loop;
end;
$$;
