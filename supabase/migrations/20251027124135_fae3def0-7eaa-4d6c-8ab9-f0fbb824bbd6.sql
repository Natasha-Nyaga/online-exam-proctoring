-- Create calibration_sessions table to track student calibration completion
CREATE TABLE public.calibration_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create behavioral_metrics table to store keystroke and mouse dynamics
CREATE TABLE public.behavioral_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calibration_session_id UUID NOT NULL REFERENCES public.calibration_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  metric_type TEXT NOT NULL, -- 'keystroke' or 'mouse'
  question_type TEXT NOT NULL, -- 'essay' or 'mcq'
  question_index INTEGER NOT NULL,
  
  -- Keystroke dynamics (for essay questions)
  dwell_times JSONB, -- array of key hold durations
  flight_times JSONB, -- array of time between key presses
  typing_speed NUMERIC, -- characters per minute
  error_rate NUMERIC, -- backspace/delete ratio
  key_sequence JSONB, -- sequence of keys pressed
  
  -- Mouse dynamics (for MCQ questions)
  cursor_positions JSONB, -- array of {x, y, timestamp}
  movement_speed NUMERIC, -- pixels per second average
  acceleration NUMERIC, -- average acceleration
  click_frequency NUMERIC, -- clicks per second
  hover_times JSONB, -- array of hover durations on each option
  trajectory_smoothness NUMERIC, -- curvature metric
  click_positions JSONB, -- array of click coordinates
  
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

-- Create index for better query performance
CREATE INDEX idx_behavioral_metrics_session ON public.behavioral_metrics(calibration_session_id);
CREATE INDEX idx_behavioral_metrics_student ON public.behavioral_metrics(student_id);
CREATE INDEX idx_calibration_sessions_student ON public.calibration_sessions(student_id);