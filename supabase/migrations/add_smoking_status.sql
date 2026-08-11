ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS smoking_status text CHECK (smoking_status IN ('never', 'former', 'current'));
