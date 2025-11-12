-- Migration: Update behavioral_metrics table to use a single metrics JSONB column
ALTER TABLE public.behavioral_metrics
    ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Optional: Remove individual metric columns if you want to store all metrics in the single metrics column
ALTER TABLE public.behavioral_metrics
    DROP COLUMN IF EXISTS dwell_times,
    DROP COLUMN IF EXISTS flight_times,
    DROP COLUMN IF EXISTS typing_speed,
    DROP COLUMN IF EXISTS error_rate,
    DROP COLUMN IF EXISTS key_sequence,
    DROP COLUMN IF EXISTS cursor_positions,
    DROP COLUMN IF EXISTS movement_speed,
    DROP COLUMN IF EXISTS acceleration,
    DROP COLUMN IF EXISTS click_frequency,
    DROP COLUMN IF EXISTS hover_times,
    DROP COLUMN IF EXISTS trajectory_smoothness,
    DROP COLUMN IF EXISTS click_positions;

-- Ensure required columns exist and are correctly typed
ALTER TABLE public.behavioral_metrics
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN student_id SET NOT NULL,
    ALTER COLUMN calibration_session_id SET NOT NULL,
    ALTER COLUMN question_index SET NOT NULL,
    ALTER COLUMN question_type SET NOT NULL,
    ALTER COLUMN metric_type SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT NOW();

-- Example final schema for behavioral_metrics:
-- id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- student_id UUID NOT NULL
-- calibration_session_id UUID NOT NULL
-- question_index INTEGER NOT NULL
-- question_type TEXT NOT NULL
-- metric_type TEXT NOT NULL
-- metrics JSONB NOT NULL
-- created_at TIMESTAMPTZ DEFAULT NOW()
