-- Create calibration_sessions table to track student calibration completion
CREATE TABLE public.calibration_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create behavioral_metrics table WITH OLD FIELDS REMOVED AND NEW FIELDS ONLY
CREATE TABLE public.behavioral_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calibration_session_id UUID NOT NULL REFERENCES public.calibration_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  metric_type TEXT NOT NULL,       -- 'keystroke' or 'mouse'
  question_type TEXT NOT NULL,     -- 'essay' or 'mcq'
  question_index INTEGER NOT NULL,

  ---------------------------------------------------------------------------
  -- 🔹 NEW KEYSTROKE FEATURES (ONLY)
  ---------------------------------------------------------------------------

  mean_du_key1_key1 NUMERIC,
  mean_dd_key1_key2 NUMERIC,
  mean_du_key1_key2 NUMERIC,
  mean_ud_key1_key2 NUMERIC,
  mean_uu_key1_key2 NUMERIC,

  std_du_key1_key1 NUMERIC,
  std_dd_key1_key2 NUMERIC,
  std_du_key1_key2 NUMERIC,
  std_ud_key1_key2 NUMERIC,
  std_uu_key1_key2 NUMERIC,

  keystroke_count INTEGER,

  ---------------------------------------------------------------------------
  -- 🔹 NEW MOUSE FEATURES (ONLY)
  ---------------------------------------------------------------------------

  inactive_duration NUMERIC,
  copy_cut INTEGER,
  paste INTEGER,
  double_click INTEGER,

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.calibration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavioral_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calibration_sessions
CREATE POLICY "Students can view their own calibration sessions"
  ON public.calibration_sessions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create their own calibration sessions"
  ON public.calibration_sessions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update their own calibration sessions"
  ON public.calibration_sessions FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can view all calibration sessions"
  ON public.calibration_sessions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for behavioral_metrics
CREATE POLICY "Students can view their own behavioral metrics"
  ON public.behavioral_metrics FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can insert their own behavioral metrics"
  ON public.behavioral_metrics FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Admins can view all behavioral metrics"
  ON public.behavioral_metrics FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for performance
CREATE INDEX idx_behavioral_metrics_session ON public.behavioral_metrics(calibration_session_id);
CREATE INDEX idx_behavioral_metrics_student ON public.behavioral_metrics(student_id);
CREATE INDEX idx_calibration_sessions_student ON public.calibration_sessions(student_id);
