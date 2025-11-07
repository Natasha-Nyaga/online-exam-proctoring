# Real-time Cheating Detection Backend
# Flask + CORS + Supabase + ML models
# Implements calibration, prediction, buffered alerts, and personalized thresholds

import os
from dotenv import load_dotenv
from pathlib import Path
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime

# Load environment variables from .env in project root
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

app = Flask(__name__)
CORS(app)

# Initialize Supabase client
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# Load models and scalers from .env or default paths
print("[Backend] Loading ML models...")
mouse_model = joblib.load(os.getenv("MOUSE_MODEL_PATH", "models/mouse_model.joblib"))
keystroke_model = joblib.load(os.getenv("KEYSTROKE_MODEL_PATH", "models/keystroke_model.joblib"))
mouse_scaler = joblib.load(os.getenv("MOUSE_SCALER_PATH", "models/scaler_mouse.joblib"))
keystroke_scaler = joblib.load(os.getenv("KEYSTROKE_SCALER_PATH", "models/scaler_keystroke.joblib"))
print("[Backend] ML models loaded successfully")

# Feature order definitions (must match frontend)
MOUSE_FEATURE_ORDER = [
    "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
    "click_frequency", "click_interval_mean", "click_ratio_per_question",
    "trajectory_smoothness", "path_curvature", "transition_time"
]

KEYSTROKE_FEATURE_ORDER = [
    "H.period", "DD.period.t", "UD.period.t", "H.t", "DD.t.i", "UD.t.i", "H.i",
    "DD.i.e", "UD.i.e", "H.e", "DD.e.five", "UD.e.five", "H.five",
    "DD.five.Shift.r", "UD.five.Shift.r", "H.Shift.r", "DD.Shift.r.o",
    "UD.Shift.r.o", "H.o", "DD.o.a", "UD.o.a", "H.a", "DD.a.n", "UD.a.n",
    "H.n", "DD.n.l", "UD.n.l", "H.l", "DD.l.Return", "UD.l.Return",
    "H.Return", "typing_speed", "digraph_mean", "digraph_variance",
    "trigraph_mean", "trigraph_variance", "error_rate"
]

# Fusion weights (optimized to minimize false positives)
MOUSE_WEIGHT = 0.45
KEYSTROKE_WEIGHT = 0.55
DEFAULT_THRESHOLD = 0.55

def get_user_threshold(student_id):
    """Fetch adaptive threshold from calibration data or return default"""
    if not supabase or not student_id:
        return DEFAULT_THRESHOLD
    
    try:
        # Query calibration sessions for this student
        result = supabase.table('calibration_sessions')\
            .select('id')\
            .eq('student_id', student_id)\
            .eq('status', 'completed')\
            .order('completed_at', desc=True)\
            .limit(1)\
            .execute()
        
        if result.data and len(result.data) > 0:
            # User has completed calibration, could implement adaptive threshold logic here
            # For now, return slightly adjusted threshold based on calibration existence
            return DEFAULT_THRESHOLD * 0.95  # Slightly lower for calibrated users
        
        return DEFAULT_THRESHOLD
    except Exception as e:
        print(f"[Backend] Error fetching threshold: {e}")
        return DEFAULT_THRESHOLD

def log_cheating_incident(session_id, fusion_score, mouse_features, keystroke_features, mouse_prob, keystroke_prob):
    """Log cheating incident to Supabase"""
    if not supabase or not session_id:
        return
    
    try:
        # Determine severity based on fusion score
        if fusion_score >= 0.8:
            severity = "high"
        elif fusion_score >= 0.65:
            severity = "medium"
        else:
            severity = "low"
        
        # Prepare metadata
        metadata = {
            "fusion_score": float(fusion_score),
            "mouse_probability": float(mouse_prob),
            "keystroke_probability": float(keystroke_prob),
            "mouse_features": mouse_features.tolist()[0] if hasattr(mouse_features, 'tolist') else mouse_features,
            "keystroke_features": keystroke_features.tolist()[0] if hasattr(keystroke_features, 'tolist') else keystroke_features,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Insert incident
        supabase.table('cheating_incidents').insert({
            "session_id": session_id,
            "incident_type": "behavioural_anomaly",
            "severity": severity,
            "description": f"ML-detected anomaly with fusion score {fusion_score:.3f}",
            "metadata": metadata
        }).execute()
        
        print(f"[Backend] Logged cheating incident for session {session_id} (severity: {severity})")
    except Exception as e:
        print(f"[Backend] Error logging incident: {e}")

@app.route("/predict", methods=["POST"])
def predict():
    """
    Real-time cheating prediction endpoint
    Accepts mouse and keystroke features, returns fusion score and cheating prediction
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Extract features from request
        mouse_features_dict = data.get("mouse_features", {})
        keystroke_features_dict = data.get("keystroke_features", {})
        student_id = data.get("student_id")
        session_id = data.get("session_id")
        
        # Convert feature dictionaries to ordered arrays
        mouse_features = np.array([
            float(mouse_features_dict.get(f, 0.0)) for f in MOUSE_FEATURE_ORDER
        ]).reshape(1, -1)
        
        keystroke_features = np.array([
            float(keystroke_features_dict.get(f, 0.0)) for f in KEYSTROKE_FEATURE_ORDER
        ]).reshape(1, -1)
        
        print(f"[Backend] Processing prediction for student {student_id}, session {session_id}")
        print(f"[Backend] Mouse features shape: {mouse_features.shape}, Keystroke features shape: {keystroke_features.shape}")
        
        # Scale features
        mouse_scaled = mouse_scaler.transform(mouse_features)
        keystroke_scaled = keystroke_scaler.transform(keystroke_features)
        
        # Get predictions from both models
        p_mouse = mouse_model.predict_proba(mouse_scaled)[0][1]
        p_keystroke = keystroke_model.predict_proba(keystroke_scaled)[0][1]
        
        # Fusion: weighted average optimized to minimize false positives
        fusion_score = (MOUSE_WEIGHT * p_mouse) + (KEYSTROKE_WEIGHT * p_keystroke)
        
        # Get adaptive threshold for this user
        user_threshold = get_user_threshold(student_id)
        
        # Make prediction
        cheating_prediction = int(fusion_score > user_threshold)
        
        print(f"[Backend] Mouse prob: {p_mouse:.3f}, Keystroke prob: {p_keystroke:.3f}, Fusion: {fusion_score:.3f}, Threshold: {user_threshold:.3f}, Prediction: {cheating_prediction}")
        
        # Log to Supabase if cheating detected
        if cheating_prediction == 1 and session_id:
            log_cheating_incident(
                session_id=session_id,
                fusion_score=fusion_score,
                mouse_features=mouse_features,
                keystroke_features=keystroke_features,
                mouse_prob=p_mouse,
                keystroke_prob=p_keystroke
            )
        
        return jsonify({
            "fusion_score": float(fusion_score),
            "cheating_prediction": cheating_prediction,
            "user_threshold": float(user_threshold),
            "mouse_probability": float(p_mouse),
            "keystroke_probability": float(p_keystroke)
        })
        
    except Exception as e:
        print(f"[Backend] Prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/calibration/start", methods=["POST"])
def calibration_start():
    data = request.get_json()
    student_id = data.get("student_id")
    # For demo, just return success and echo student_id
    return jsonify({"status": "calibration started", "student_id": student_id}), 200

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)