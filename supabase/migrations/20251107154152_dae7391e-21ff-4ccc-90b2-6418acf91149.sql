-- Create personal_thresholds table to store computed thresholds for each student
CREATE TABLE IF NOT EXISTS public.personal_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  calibration_session_id UUID NOT NULL REFERENCES public.calibration_sessions(id) ON DELETE CASCADE,
  fusion_mean NUMERIC NOT NULL,
  fusion_std NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, calibration_session_id)
);

-- Enable Row Level Security
ALTER TABLE public.personal_thresholds ENABLE ROW LEVEL SECURITY;

-- Students can view their own thresholds
CREATE POLICY "Students can view own thresholds" 
ON public.personal_thresholds 
FOR SELECT 
USING (auth.uid() = student_id);

-- Admins can view all thresholds
CREATE POLICY "Admins can view all thresholds" 
ON public.personal_thresholds 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert thresholds (for backend service)
CREATE POLICY "System can insert thresholds" 
ON public.personal_thresholds 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_personal_thresholds_student ON public.personal_thresholds(student_id);
CREATE INDEX idx_personal_thresholds_session ON public.personal_thresholds(calibration_session_id);