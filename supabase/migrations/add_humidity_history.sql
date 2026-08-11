-- Persist daily humidity alongside HealthKit data so it can be correlated
-- against pain/fatigue logs at a lag (evidence points to 1 and 7 days),
-- instead of only ever holding today's snapshot in a device-local cache.
ALTER TABLE health_data
  ADD COLUMN IF NOT EXISTS humidity integer;
