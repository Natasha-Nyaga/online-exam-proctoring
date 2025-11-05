
# Real-Time Cheating Detection System Integration

This project implements a robust, multimodal cheating detection system for web-based online exams, combining mouse and keystroke dynamics, calibration, personalized thresholds, and buffered alerts.

## Stack
- **Frontend:** React + Vite (`src/components/ExamMonitor.tsx`)
- **Backend:** Flask (`exam-proctoring-backend/app.py`)
- **Database:** Supabase (see schema below)
- **ML Models:** `mouse_model.joblib`, `keystroke_model.joblib` and their scalers

---

## Setup Instructions

### 1. Backend (Flask)

**Install dependencies:**

```sh
cd exam-proctoring-backend
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt
```

**Configure environment:**

Copy `.env.example` to `.env` and fill in your Supabase project URL and service role key:

```
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-service-role-key
```

**Run backend:**

```sh
python app.py
```

---

### 2. Frontend (React)

**Install dependencies:**

```sh
npm install
```

**Run frontend:**

```sh
npm run dev
```

---

### 3. Supabase Integration

**Create personal_thresholds table:**

See `exam-proctoring-backend/personal_thresholds.sql` for SQL and policy examples.

```sql
CREATE TABLE public.personal_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  fusion_mean NUMERIC NOT NULL,
  fusion_std NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Policies:**
- Students can SELECT own
- Admins SELECT all
- System INSERT

---

## Testing & Usage

1. **Calibration:**
	- Enter Student ID, click "Start Calibration" in ExamMonitor.
	- Calibration data is sent every 10s to `/calibration/submit`.
	- Click "Complete Calibration" to compute and store personalized threshold.

2. **Exam Monitoring:**
	- After calibration, monitoring starts automatically.
	- Mouse and keystroke features are sent every 10s to `/predict`.
	- Fusion score and status are displayed live. Sonner toasts show alerts.
	- After 3 consecutive suspicious intervals, a cheating incident is recorded in Supabase and a "🚨 Cheating incident recorded" toast is shown.

3. **Backend Endpoints:**
	- `GET /health` — health check
	- `POST /calibration/start` — start calibration session
	- `POST /calibration/submit` — submit calibration features
	- `POST /calibration/complete` — compute/store threshold
	- `POST /predict` — real-time prediction

4. **Supabase Tables:**
	- `personal_thresholds` — stores per-user fusion mean, std, threshold
	- `cheating_incidents` — records suspicious/cheating events
	- `behavioral_metrics` — stores feature batches

---

## Behavioral Logic Summary

- **Fusion:** `0.1 × P_mouse + 0.9 × P_keystroke`
- **Threshold:** `mean + 1.0 × std` (per student)
- **Buffered alerts:** 3 consecutive intervals
- **Calibration required before exam start**
- **Low false positives:** user adaptation + multimodal fusion

---

## Troubleshooting

- Ensure models and scalers are present in `exam-proctoring-backend/models/`
- Check `.env` for correct Supabase credentials
- Confirm Supabase tables and policies are set up
- Use browser dev tools and backend logs for debugging

---

## File Reference

- `exam-proctoring-backend/app.py` — Flask backend
- `exam-proctoring-backend/requirements.txt` — Python dependencies
- `exam-proctoring-backend/.env.example` — environment variable template
- `src/components/ExamMonitor.tsx` — frontend monitoring component
- `exam-proctoring-backend/personal_thresholds.sql` — Supabase table SQL

---

## Contact

For support, open an issue or contact the project maintainer.
