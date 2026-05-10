-- BASDAI scores
CREATE TABLE IF NOT EXISTS basdai_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  q1 numeric(4,1) NOT NULL DEFAULT 0,
  q2 numeric(4,1) NOT NULL DEFAULT 0,
  q3 numeric(4,1) NOT NULL DEFAULT 0,
  q4 numeric(4,1) NOT NULL DEFAULT 0,
  q5 numeric(4,1) NOT NULL DEFAULT 0,
  q6 numeric(4,1) NOT NULL DEFAULT 0,
  score numeric(4,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);
ALTER TABLE basdai_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own basdai" ON basdai_scores FOR ALL USING (auth.uid() = user_id);

-- Biologic injections
CREATE TABLE IF NOT EXISTS biologic_injections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medication_name text NOT NULL,
  injected_at date NOT NULL,
  interval_days integer NOT NULL DEFAULT 14,
  lot_number text DEFAULT '',
  notes text DEFAULT '',
  response_rating integer CHECK (response_rating IS NULL OR (response_rating BETWEEN 1 AND 5)),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE biologic_injections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own biologic injections" ON biologic_injections FOR ALL USING (auth.uid() = user_id);

-- Uveitis episodes
CREATE TABLE IF NOT EXISTS uveitis_episodes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_date date NOT NULL,
  end_date date,
  affected_eye text NOT NULL DEFAULT 'left',
  severity text NOT NULL DEFAULT 'moderate',
  symptoms text[] DEFAULT '{}',
  treatment_received boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE uveitis_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own uveitis episodes" ON uveitis_episodes FOR ALL USING (auth.uid() = user_id);

-- Exercise tracking on daily logs
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS exercise_done boolean DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS exercise_minutes integer;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS exercise_type text;
