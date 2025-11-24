-- 1. Update 'personal_thresholds' to store the calculated stats
-- We assume it links to a student. We add a JSON column for the actual numbers.
ALTER TABLE public.personal_thresholds 
ADD COLUMN IF NOT EXISTS student_id text REFERENCES public.students(student_id),
ADD COLUMN IF NOT EXISTS baseline_stats jsonb DEFAULT '{}'::jsonb, 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- 2. Update 'cheating_incidents' to store specific ML data
ALTER TABLE public.cheating_incidents
ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.exam_sessions(session_id),
ADD COLUMN IF NOT EXISTS incident_type text, -- 'mouse', 'keystroke'
ADD COLUMN IF NOT EXISTS severity_score float, -- The probability (0.0 to 1.0)
ADD COLUMN IF NOT EXISTS details jsonb; -- Extra info (e.g. "Z-score: 4.5")

-- 3. Update 'calibration_sessions'
ALTER TABLE public.calibration_sessions
ADD COLUMN IF NOT EXISTS session_id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS student_id text REFERENCES public.students(student_id),
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'; -- 'pending', 'completed'