-- Speed: wallet balances from the database instead of from every ledger row on every screen.
--
-- This is a mirror of the domain's balance rules (src/domain/balances.ts), which stay the
-- specification; tests/db/wallet-balances.test.ts runs both on the same data and requires them
-- to agree. Per wallet, as of an instant (just before it):
--
--   null                     when the instant is before the wallet's tracking start
--   opening balance + income + refunds + transfers in − expenses − transfers out
--                            counting only active rows dated from the tracking start
--                            up to (not including) the instant
--
-- The tracking start is local midnight of opening_balance_date in the profile's time zone.
-- Deleted and voided rows never count; allocations and releases never move wallet money.
-- Each wallet also says how many of its active entries are dated before its tracking start
-- (they're already inside the opening balance, and the Wallets screen says so).
--
-- SECURITY INVOKER, and the owner is always auth.uid(): there is no user parameter, and RLS
-- applies to every table read here. Money is returned as text, so no amount passes through a
-- floating-point JSON number.

create function public.wallet_balances(p_closing timestamptz, p_opening timestamptz default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  zone as (
    select coalesce(
      (select p.time_zone from public.profiles p, me where p.id = me.uid),
      'Asia/Kolkata'
    ) as name
  ),
  wallets as (
    select a.id, a.opening_balance_paise,
      (a.opening_balance_date::timestamp at time zone (select name from zone)) as tracking_start
    from public.accounts a, me
    where a.owner_id = me.uid
  ),
  active as (
    select t.type, t.amount_paise, t.occurred_at, t.account_id, t.from_account_id,
      t.to_account_id
    from public.transactions t, me
    where t.owner_id = me.uid and t.deleted_at is null and t.voided_at is null
  ),
  moves as (
    select account_id as wallet_id, occurred_at,
      case when type = 'expense' then -amount_paise else amount_paise end as delta
    from active where type in ('income', 'expense', 'refund')
    union all
    select from_account_id, occurred_at, -amount_paise from active where type = 'transfer'
    union all
    select to_account_id, occurred_at, amount_paise from active where type = 'transfer'
  ),
  per_wallet as (
    select w.id,
      case when p_opening is null or p_opening < w.tracking_start then null
        else w.opening_balance_paise + coalesce(sum(m.delta) filter (
          where m.occurred_at >= w.tracking_start and m.occurred_at < p_opening), 0)
      end as opening_paise,
      case when p_closing < w.tracking_start then null
        else w.opening_balance_paise + coalesce(sum(m.delta) filter (
          where m.occurred_at >= w.tracking_start and m.occurred_at < p_closing), 0)
      end as closing_paise,
      count(m.wallet_id) filter (where m.occurred_at < w.tracking_start) as before_opening
    from wallets w left join moves m on m.wallet_id = w.id
    group by w.id, w.opening_balance_paise, w.tracking_start
  )
  select jsonb_build_object(
    'accounts', coalesce(jsonb_agg(jsonb_build_object(
      'account_id', id,
      'opening_paise', opening_paise::text,
      'closing_paise', closing_paise::text,
      'entries_before_opening', before_opening
    ) order by id), '[]'::jsonb),
    'opening_total_paise',
      case when p_opening is null then null else coalesce(sum(opening_paise), 0)::text end,
    'closing_total_paise', coalesce(sum(closing_paise), 0)::text
  )
  from per_wallet
$$;

revoke execute on function public.wallet_balances(timestamptz, timestamptz) from public, anon;
grant execute on function public.wallet_balances(timestamptz, timestamptz) to authenticated;
