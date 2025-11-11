# 🚀 Starting the ML Backend

## Prerequisites
- Python 3.8+
- All dependencies installed (see requirements.txt)

## Quick Start

### 1️⃣ Install Dependencies
```bash
cd exam-proctoring-backend
pip install -r requirements.txt
```

### 2️⃣ Configure Environment (Optional)
Edit `.env` file to customize:
- `FLASK_PORT` - Backend port (default: 5000)
- `TEST_MODE_BYPASS_SCALING` - Set to `true` to debug scaling issues
- `DEFAULT_THRESHOLD` - Default cheating threshold (default: 0.55)

### 3️⃣ Start the Backend
```bash
python app.py
```

You should see:
```
============================================================
🚀 Exam Proctoring Backend Starting
============================================================
📍 Host: 0.0.0.0
🔌 Port: 5000
🧪 Test Mode: False
🎯 Default Threshold: 0.55
============================================================
```

### 4️⃣ Verify It's Running
Open your browser to: http://127.0.0.1:5000/health

You should see:
```json
{
  "status": "healthy",
  "models_loaded": true,
  "timestamp": "2025-11-11T10:30:00.000000",
  "test_mode": false,
  "default_threshold": 0.55
}
```

## 🐛 Troubleshooting

### "Failed to fetch" Error
**Problem:** Frontend can't connect to backend  
**Solutions:**
1. Make sure backend is running: `python app.py`
2. Check the port (should be 5000)
3. Test with: `curl http://127.0.0.1:5000/health`
4. Check firewall/antivirus isn't blocking port 5000

### Models Not Loading
**Problem:** ML models fail to load  
**Solutions:**
1. Verify all `.joblib` files exist in `models/` directory
2. Check file paths in `.env`
3. Ensure models were trained with compatible sklearn version

### Constant Fusion Scores (~0.5)
**Problem:** Predictions always return same score  
**Solutions:**
1. Enable test mode: Set `TEST_MODE_BYPASS_SCALING=true` in `.env`
2. Check console logs for "WARNING: Both models near 0.5"
3. Verify feature extraction matches training data format
4. Review scaling logs to ensure features are being normalized

### "No personalized threshold found"
**Problem:** Student hasn't completed calibration  
**Solutions:**
1. Complete calibration phase first
2. System will use DEFAULT_THRESHOLD until calibration is done
3. Check `personal_thresholds` table in database

## 📊 Testing Simulation Mode

To test with simulated data:
1. Enable simulation in frontend by clicking "Simulate Cheating"
2. Watch console logs for detection
3. Verify fusion scores rise above threshold

## 🔧 Advanced Configuration

### Gray Zone Sensitivity
Modify in code (lines 418-431):
```python
GRAY_ZONE_MARGIN = 0.05  # Adjust sensitivity
```

### Fusion Weights
Modify in code (lines 54-55):
```python
MOUSE_WEIGHT = 0.45      # Mouse importance
KEYSTROKE_WEIGHT = 0.55  # Keystroke importance
```

### Threshold Formula
Modify in code (line 567):
```python
adaptive_threshold = fusion_mean + (1.25 * fusion_std)  # Sensitivity factor
```

## 📝 API Endpoints

### POST /predict
Real-time cheating prediction
```json
{
  "student_id": "uuid",
  "session_id": "uuid",
  "mouse_features": { "path_length": 1234, ... },
  "keystroke_features": { "typing_speed": 2.5, ... }
}
```

### POST /calibration/compute-threshold
Compute personalized threshold from calibration data
```json
{
  "student_id": "uuid",
  "calibration_session_id": "uuid"
}
```

### GET /health
Health check and status

### GET /
API information

## 💡 Tips
- Keep backend running during exam sessions
- Monitor console logs for detailed predictions
- Use simulation mode to test detection
- Calibration improves accuracy significantly
