-- Add missing DELETE RLS policies so users can remove their own records
CREATE POLICY "Users can delete own logs"
  ON public.daily_logs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health data"
  ON public.health_data FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own flares"
  ON public.flares FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own nudges"
  ON public.nudges FOR DELETE
  USING (auth.uid() = user_id);
