# Exam Proctoring Backend

Flask backend for real-time cheating detection using ML models for mouse and keystroke dynamics.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update `SUPABASE_SERVICE_ROLE_KEY` with your Supabase service role key
   - The service role key can be found in: Settings → Database → Usage → Backend (don't share with users!)

3. Ensure ML models are in the `models/` folder:
   - `mouse_model.joblib`
   - `keystroke_model.joblib`
   - `scaler_mouse.joblib`
   - `scaler_keystroke.joblib`

## Running the Backend

```bash
python app.py
```

Backend will run on `http://127.0.0.1:5000`

## API Endpoints

### POST /predict
Real-time cheating prediction endpoint.

**Request Body:**
```json
{
  "mouse_features": {
    "path_length": 1234.5,
    "avg_speed": 123.4,
    ...
  },
  "keystroke_features": {
    "H.period": 0.123,
    "DD.period.t": 0.234,
    ...
  },
  "student_id": "uuid",
  "session_id": "uuid"
}
```

**Response:**
```json
{
  "fusion_score": 0.567,
  "cheating_prediction": 1,
  "user_threshold": 0.55,
  "mouse_probability": 0.45,
  "keystroke_probability": 0.67
}
```

### POST /calibration/start
Start calibration session for a student.

## Features

- **Dual Model Architecture**: Separate models for mouse and keystroke dynamics
- **Feature Scaling**: Automatic scaling using pre-trained scalers
- **Fusion Logic**: Weighted combination (45% mouse, 55% keystroke) to minimize false positives
- **Adaptive Thresholds**: Per-user thresholds based on calibration data
- **Supabase Integration**: Automatic logging of cheating incidents with severity levels
- **Production Ready**: Robust error handling and detailed logging

## Model Details

- Mouse features: 11 features including path length, speed, click patterns
- Keystroke features: 37 features including dwell times, flight times, typing speed
- Fusion weights optimized for ~0.75 accuracy with high precision and balanced recall
- Default threshold: 0.55 (adjustable per user after calibration)
