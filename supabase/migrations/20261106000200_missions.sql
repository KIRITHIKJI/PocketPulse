-- Design 3: missions and the progress off switch.
--
-- 1. Four more missions in the read-only catalog. Each one is a step of the main job (log, look,
--    sort, set aside) and none asks for an amount: "set aside" means any amount, and the two
--    long-term ones count weeks and days, not rupees. 'once' is the long-term cadence.
--    "Looked at today" needs no table: like explored insights, it's a zero-XP fact in xp_events
--    ('daily_review:<date>'), written only by the server.
-- 2. profiles.show_progress: when false, Home and navigation show no XP, level or missions.
--    Owner-updatable through the existing profiles policy; nothing else changes.

insert into public.quests (code, title, description, cadence, target, xp, sort_order) values
  ('review_today', 'Look at today', 'Open today''s spending breakdown once.', 'daily', 1, 5, 4),
  ('set_aside_week', 'Move money to a goal', 'Set any amount aside for a goal this week.', 'weekly', 1, 10, 5),
  ('steady_logging', 'Steady habit', 'Log something on 20 different days.', 'once', 20, 40, 6),
  ('saving_habit', 'Saving rhythm', 'Set money aside in 4 different weeks.', 'once', 4, 30, 7)
on conflict (code) do nothing;

alter table public.profiles add column show_progress boolean not null default true;
