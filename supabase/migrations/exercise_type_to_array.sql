-- exercise_type was a single text value, so users could only log one exercise
-- per day. Users can genuinely do more than one (e.g. run and swim), so this
-- converts it to an array. Existing single values become one-element arrays.
ALTER TABLE daily_logs
  ALTER COLUMN exercise_type TYPE text[]
  USING CASE WHEN exercise_type IS NULL THEN NULL ELSE ARRAY[exercise_type] END;
