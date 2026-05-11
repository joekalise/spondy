-- Add biological sex to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS biological_sex text;

-- Add period tracking to daily logs
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS period_active boolean;
