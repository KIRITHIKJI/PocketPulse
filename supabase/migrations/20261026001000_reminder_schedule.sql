-- Phase 9: how often each optional reminder comes. Rewards, reports and exports need no schema
-- change: the reward tables and catalogs already exist, and clients still can't write to them.
-- Everything stays off by default, and "turn off all" still beats every setting here.

alter table public.notification_preferences
  add column missed_logging_days text not null default 'daily'
    check (missed_logging_days in ('daily', 'weekdays')),
  add column upcoming_income_days smallint not null default 1
    check (upcoming_income_days between 0 and 14),
  add column upcoming_commitment_days smallint not null default 2
    check (upcoming_commitment_days between 0 and 14),
  add column savings_review_frequency text not null default 'monthly'
    check (savings_review_frequency in ('weekly', 'monthly'));
