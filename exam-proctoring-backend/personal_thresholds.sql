-- Supabase personal_thresholds table
CREATE TABLE public.personal_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  fusion_mean NUMERIC NOT NULL,
  fusion_std NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies:
-- Students can SELECT own; Admins SELECT all; System INSERT
-- Example policy (adjust for your Supabase roles):
--
-- CREATE POLICY "Students can view own thresholds" ON public.personal_thresholds
--   FOR SELECT USING (auth.uid() = student_id);
-- CREATE POLICY "Admins can view all thresholds" ON public.personal_thresholds
--   FOR SELECT USING (is_admin(auth.uid()));
-- CREATE POLICY "System can insert" ON public.personal_thresholds
--   FOR INSERT WITH CHECK (true);
