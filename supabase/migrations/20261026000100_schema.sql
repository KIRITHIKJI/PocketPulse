-- PocketPulse core schema.
--
-- Conventions
-- * Every private row has owner_id → auth.users(id). Deleting the auth user (explicit account
--   deletion) removes that user's data; nothing else cascades over financial history.
-- * References between private rows use composite (owner_id, id) foreign keys, so a row can only
--   point at rows owned by the same user — enforced by the database, not the UI.
-- * Money is bigint paise (> 0 for amounts). Currency codes match src/domain/money.ts.
-- * Records that history depends on (accounts, categories, goals, templates) are archived, not
--   deleted: their foreign keys are ON DELETE RESTRICT.
-- * Mirrors src/domain/schemas.ts; the domain layer stays the single source of the math.

create domain public.currency_code as text
  check (value in ('INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'));

-- ---------------------------------------------------------------------------------------------
-- Profiles & preferences (one row per user, created by the signup trigger)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  currency public.currency_code not null default 'INR',
  time_zone text not null default 'Asia/Kolkata' check (char_length(time_zone) between 1 and 64),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  motion text not null default 'system' check (motion in ('system', 'reduce', 'full')),
  small_purchase_threshold_paise bigint not null default 5000
    check (small_purchase_threshold_paise > 0),
  income_frequency text not null default 'monthly'
    check (income_frequency in ('weekly', 'biweekly', 'monthly', 'irregular', 'none')),
  next_income_date date,
  expected_income_paise bigint check (expected_income_paise > 0),
  safe_to_spend_reserve_paise bigint not null default 0 check (safe_to_spend_reserve_paise >= 0),
  -- Privacy: nothing leaves the account unless the user turns it on.
  share_reports_by_default boolean not null default false,
  include_notes_in_reports boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Accounts (tracked wallets) with opening balance + effective date

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null default 'cash' check (kind in ('cash', 'bank', 'upi_wallet', 'card', 'other')),
  currency public.currency_code not null default 'INR',
  -- Tracked balance at local midnight of opening_balance_date (may be zero or negative).
  opening_balance_paise bigint not null default 0
    check (opening_balance_paise between -999999999999 and 999999999999),
  opening_balance_date date not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create unique index accounts_one_default_per_owner on public.accounts (owner_id) where is_default;
create unique index accounts_unique_active_name
  on public.accounts (owner_id, lower(btrim(name))) where archived_at is null;

-- ---------------------------------------------------------------------------------------------
-- Categories & subcategories (one level of nesting)

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  icon text check (char_length(icon) <= 40),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  is_default boolean not null default false,
  -- When merged, history keeps pointing here; the UI follows merged_into_id.
  merged_into_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, parent_id) references public.categories (owner_id, id) on delete restrict,
  foreign key (owner_id, merged_into_id) references public.categories (owner_id, id)
    on delete restrict,
  check (parent_id is null or parent_id <> id),
  check (merged_into_id is null or merged_into_id <> id)
);
create unique index categories_unique_active_name
  on public.categories (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), kind, lower(btrim(name)))
  where archived_at is null and merged_into_id is null;
create index categories_parent on public.categories (owner_id, parent_id);

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_text text not null check (char_length(btrim(match_text)) between 1 and 80),
  match_field text not null default 'description' check (match_field in ('description', 'merchant')),
  category_id uuid not null,
  subcategory_id uuid,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, category_id) references public.categories (owner_id, id) on delete cascade,
  foreign key (owner_id, subcategory_id) references public.categories (owner_id, id)
    on delete cascade
);
create index category_rules_owner on public.category_rules (owner_id);

-- ---------------------------------------------------------------------------------------------
-- Savings goals (their allocation ledger lives in transactions: allocation / allocation_release)

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  icon text check (char_length(icon) <= 40),
  image_url text check (char_length(image_url) <= 500),
  target_paise bigint not null check (target_paise > 0 and target_paise <= 999999999999),
  currency public.currency_code not null default 'INR',
  target_date date,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived')),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id)
);
create index savings_goals_owner on public.savings_goals (owner_id, status);

-- ---------------------------------------------------------------------------------------------
-- Recurring templates (reminders/forecasts; never booked as actual until confirmed)

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 999999999999),
  currency public.currency_code not null default 'INR',
  account_id uuid,
  category_id uuid,
  subcategory_id uuid,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  anchor_date date not null,
  next_due_date date not null,
  end_date date,
  -- 'remind' only reminds; 'confirm' asks to record the actual transaction when due.
  mode text not null default 'confirm' check (mode in ('remind', 'confirm')),
  remind_days_before smallint not null default 1 check (remind_days_before between 0 and 30),
  paused_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  foreign key (owner_id, account_id) references public.accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, subcategory_id) references public.categories (owner_id, id)
    on delete restrict,
  check (subcategory_id is null or category_id is not null),
  check (end_date is null or end_date >= anchor_date)
);
create index recurring_templates_due on public.recurring_templates (owner_id, next_due_date)
  where archived_at is null and paused_at is null;

-- ---------------------------------------------------------------------------------------------
-- Transactions: the ledger. One row per income/expense/refund/transfer/allocation/release.

create table public.transactions (
  -- Client-generated UUID: the stable id across devices and offline sync.
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (
    type in ('income', 'expense', 'refund', 'transfer', 'allocation', 'allocation_release')
  ),
  amount_paise bigint not null,
  currency public.currency_code not null default 'INR',
  occurred_at timestamptz not null,
  account_id uuid,
  from_account_id uuid,
  to_account_id uuid,
  goal_id uuid,
  refund_of_id uuid,
  category_id uuid,
  subcategory_id uuid,
  description text check (char_length(description) <= 200),
  merchant text check (char_length(merchant) <= 120),
  note text check (char_length(note) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  source text not null default 'manual'
    check (source in ('manual', 'quick_add', 'parsed_text', 'voice', 'recurring', 'import')),
  -- Retry/sync key, unique per user. Defaults to the id (see transactions_defaults trigger).
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 100),
  batch_id uuid,
  recurring_template_id uuid,
  recurring_occurrence date,
  -- Optimistic concurrency: bumped on every update; edits must quote the version they saw.
  version integer not null default 1,
  deleted_at timestamptz,
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, id),
  unique (owner_id, idempotency_key),
  unique (owner_id, recurring_template_id, recurring_occurrence),

  constraint transactions_amount_positive
    check (amount_paise > 0 and amount_paise <= 999999999999),
  constraint transactions_shape check (
    case type
      when 'transfer' then
        from_account_id is not null and to_account_id is not null
        and from_account_id <> to_account_id
        and account_id is null and goal_id is null and refund_of_id is null
        and category_id is null and subcategory_id is null
      when 'allocation' then
        goal_id is not null and account_id is null and from_account_id is null
        and to_account_id is null and refund_of_id is null and category_id is null
        and subcategory_id is null
      when 'allocation_release' then
        goal_id is not null and account_id is null and from_account_id is null
        and to_account_id is null and refund_of_id is null and category_id is null
        and subcategory_id is null
      when 'refund' then
        account_id is not null and refund_of_id is not null and refund_of_id <> id
        and from_account_id is null and to_account_id is null and goal_id is null
      else -- income, expense
        account_id is not null and refund_of_id is null
        and from_account_id is null and to_account_id is null and goal_id is null
    end
  ),
  constraint transactions_subcategory_needs_category
    check (subcategory_id is null or category_id is not null),
  constraint transactions_recurring_pair
    check ((recurring_template_id is null) = (recurring_occurrence is null)),

  foreign key (owner_id, account_id) references public.accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, from_account_id) references public.accounts (owner_id, id)
    on delete restrict,
  foreign key (owner_id, to_account_id) references public.accounts (owner_id, id)
    on delete restrict,
  foreign key (owner_id, goal_id) references public.savings_goals (owner_id, id)
    on delete restrict,
  foreign key (owner_id, refund_of_id) references public.transactions (owner_id, id)
    on delete restrict,
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, subcategory_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, recurring_template_id) references public.recurring_templates (owner_id, id)
    on delete restrict
);
create index transactions_owner_time on public.transactions (owner_id, occurred_at desc)
  where deleted_at is null;
create index transactions_owner_updated on public.transactions (owner_id, updated_at);
create index transactions_category on public.transactions (owner_id, category_id, occurred_at);
create index transactions_refund_of on public.transactions (owner_id, refund_of_id)
  where refund_of_id is not null;
create index transactions_goal on public.transactions (owner_id, goal_id) where goal_id is not null;
create index transactions_account on public.transactions (owner_id, account_id);
create index transactions_from_account on public.transactions (owner_id, from_account_id)
  where from_account_id is not null;
create index transactions_to_account on public.transactions (owner_id, to_account_id)
  where to_account_id is not null;
create index transactions_batch on public.transactions (owner_id, batch_id) where batch_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Planned / committed future expenses

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 999999999999),
  currency public.currency_code not null default 'INR',
  due_date date not null,
  category_id uuid,
  subcategory_id uuid,
  account_id uuid,
  recurring_template_id uuid,
  recurring_occurrence date,
  -- The actual expense that paid it. Paid ⇔ this points at an active transaction.
  paid_transaction_id uuid unique,
  cancelled_at timestamptz,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, recurring_template_id, recurring_occurrence),
  check (subcategory_id is null or category_id is not null),
  check ((recurring_template_id is null) = (recurring_occurrence is null)),
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, subcategory_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, account_id) references public.accounts (owner_id, id) on delete restrict,
  foreign key (owner_id, recurring_template_id) references public.recurring_templates (owner_id, id)
    on delete restrict,
  foreign key (owner_id, paid_transaction_id) references public.transactions (owner_id, id)
    on delete restrict
);
create index commitments_due on public.commitments (owner_id, due_date) where cancelled_at is null;

-- ---------------------------------------------------------------------------------------------
-- Budgets (targets, not reserved cash)

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid, -- null = total budget
  limit_paise bigint not null check (limit_paise > 0 and limit_paise <= 999999999999),
  currency public.currency_code not null default 'INR',
  period text not null default 'monthly' check (period in ('weekly', 'monthly', 'custom')),
  custom_from date,
  custom_to date,
  alert_thresholds_bp integer[] not null default '{5000,8000,10000}'
    check (cardinality(alert_thresholds_bp) <= 5 and 1 <= all (alert_thresholds_bp)
      and 100000 >= all (alert_thresholds_bp)),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period <> 'custom' or (custom_from is not null and custom_to is not null)),
  check (custom_from is null or custom_to is null or custom_from <= custom_to),
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete restrict
);
create unique index budgets_one_active_per_scope
  on public.budgets (owner_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'), period)
  where archived_at is null and period <> 'custom';

-- ---------------------------------------------------------------------------------------------
-- Quick-add presets

create table public.quick_add_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 30),
  icon text check (char_length(icon) <= 40),
  -- null = ask for the amount each time (the "custom item" tile)
  amount_paise bigint check (amount_paise > 0 and amount_paise <= 999999999999),
  category_id uuid,
  subcategory_id uuid,
  account_id uuid,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subcategory_id is null or category_id is not null),
  foreign key (owner_id, category_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, subcategory_id) references public.categories (owner_id, id)
    on delete restrict,
  foreign key (owner_id, account_id) references public.accounts (owner_id, id) on delete restrict
);
create index quick_add_presets_owner on public.quick_add_presets (owner_id, sort_order);

-- ---------------------------------------------------------------------------------------------
-- Notifications (quiet by default)

create table public.notification_preferences (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  all_disabled boolean not null default false,
  missed_logging boolean not null default false,
  missed_logging_time time not null default '21:00',
  weekly_review boolean not null default false,
  weekly_review_day smallint not null default 0 check (weekly_review_day between 0 and 6),
  upcoming_income boolean not null default false,
  budget_alerts boolean not null default true,
  upcoming_commitments boolean not null default false,
  savings_review boolean not null default false,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'missed_logging', 'weekly_review', 'upcoming_income', 'budget_threshold',
    'upcoming_commitment', 'savings_review', 'achievement'
  )),
  title text not null check (char_length(title) <= 120),
  body text check (char_length(body) <= 500),
  link_path text check (link_path ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  -- e.g. 'budget:<id>:2026-10:8000' — the same alert is never created twice.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  scheduled_for timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);
create index notifications_inbox on public.notifications (owner_id, scheduled_for desc)
  where dismissed_at is null;

-- ---------------------------------------------------------------------------------------------
-- Gamification. Catalogs are public read-only; user state is written only by server functions
-- (never directly by the client), keyed so rewards can't be farmed or double-granted.

create table public.achievements (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  title text not null,
  description text not null,
  xp integer not null check (xp >= 0),
  icon text,
  sort_order integer not null default 0
);

create table public.quests (
  code text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  title text not null,
  description text not null,
  cadence text not null check (cadence in ('daily', 'weekly', 'once')),
  target integer not null check (target > 0),
  xp integer not null check (xp >= 0),
  sort_order integer not null default 0
);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  xp integer not null check (xp between -10000 and 10000),
  -- What earned it, e.g. 'tx_logged:<transaction id>' — one award per source.
  source_key text not null check (char_length(source_key) between 1 and 200),
  transaction_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, source_key),
  foreign key (owner_id, transaction_id) references public.transactions (owner_id, id)
    on delete restrict
);
create index xp_events_owner on public.xp_events (owner_id, created_at);

create table public.user_achievements (
  owner_id uuid not null references auth.users (id) on delete cascade,
  achievement_code text not null references public.achievements (code) on delete restrict,
  unlocked_at timestamptz not null default now(),
  primary key (owner_id, achievement_code)
);

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  quest_code text not null references public.quests (code) on delete restrict,
  period_key text not null check (char_length(period_key) between 1 and 20), -- '2026-10-26', '2026-W43', 'once'
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  opted_out_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, quest_code, period_key)
);

create table public.streak_state (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  current_daily integer not null default 0 check (current_daily >= 0),
  longest_daily integer not null default 0 check (longest_daily >= 0),
  last_logged_date date,
  current_weekly integer not null default 0 check (current_weekly >= 0),
  longest_weekly integer not null default 0 check (longest_weekly >= 0),
  last_logged_week text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Sync metadata: every client mutation carries an operation id; replays return the stored result.

create table public.sync_operations (
  id uuid not null, -- client-generated operation id
  owner_id uuid not null references auth.users (id) on delete cascade,
  device_id text check (char_length(device_id) <= 100),
  operation text not null check (char_length(operation) between 1 and 60),
  status text not null check (status in ('applied', 'duplicate', 'conflict', 'rejected')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table public.sync_devices (
  id text not null check (char_length(id) between 1 and 100),
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text check (char_length(label) <= 60),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);
