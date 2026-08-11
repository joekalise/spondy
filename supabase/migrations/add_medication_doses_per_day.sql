-- Configurable number of daily medication doses (1-3), replacing a single
-- generic yes/no/partial toggle with per-dose tracking when doses_per_day > 1
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS medication_doses_per_day integer NOT NULL DEFAULT 1 CHECK (medication_doses_per_day BETWEEN 1 AND 3);

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS medications_taken_dose_1 text CHECK (medications_taken_dose_1 IN ('yes', 'no', 'partial')),
  ADD COLUMN IF NOT EXISTS medications_taken_dose_2 text CHECK (medications_taken_dose_2 IN ('yes', 'no', 'partial')),
  ADD COLUMN IF NOT EXISTS medications_taken_dose_3 text CHECK (medications_taken_dose_3 IN ('yes', 'no', 'partial'));
