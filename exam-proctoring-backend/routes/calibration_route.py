from flask import Blueprint, request, jsonify
import numpy as np
import joblib
from routes.threshold_route import save_thresholds_for
from flask import current_app

calibration_bp = Blueprint("calibration_bp", __name__)

@calibration_bp.route("/calibrate", methods=["POST"])
def calibrate_user():
    student_id = request.json["student_id"]
    mouse_samples = np.array(request.json.get("mouse_samples", []))
    key_samples = np.array(request.json.get("key_samples", []))

    mouse_model = joblib.load("models/mouse_model.joblib")
    key_model = joblib.load("models/keystroke_model.joblib")
    mouse_scaler = joblib.load("models/scaler_mouse.joblib")
    key_scaler = joblib.load("models/scaler_keystroke.joblib")

    mouse_probs = mouse_model.predict_proba(mouse_scaler.transform(mouse_samples))[:, 1] if len(mouse_samples) else []
    key_probs = key_model.predict_proba(key_scaler.transform(key_samples))[:, 1] if len(key_samples) else []

    mouse_threshold = float(np.mean(mouse_probs) + np.std(mouse_probs)) if len(mouse_probs) else 0.85
    key_threshold = float(np.mean(key_probs) + np.std(key_probs)) if len(key_probs) else 0.85

    thresholds = {
        "mouse_threshold": round(mouse_threshold, 3),
        "keystroke_threshold": round(key_threshold, 3)
    }
    save_thresholds_for(student_id, thresholds)
    print(f"[Calibration] Student {student_id} thresholds: {thresholds}")
    return jsonify({"student_id": student_id, **thresholds})

from supabase import create_client, Client
import os

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

@calibration_bp.route("/calibration/compute-threshold", methods=["POST"])
def compute_threshold():
    try:
        data = request.get_json()
        session_id = data.get('session_id') or data.get('calibration_session_id')
        student_id = data.get('student_id')

        if not session_id or not student_id:
            return jsonify({'error': 'Missing session_id or student_id'}), 400

        response = supabase.table("behavioral_metrics").select("*").eq("calibration_session_id", session_id).execute()
        metrics = response.data

        if not metrics or len(metrics) == 0:
            print(f"[Calibration] ERROR: No behavioral metrics found for session {session_id}")
            return jsonify({"error": "No behavioral metrics found"}), 400

        print(f"[Calibration] Found {len(metrics)} calibration metrics for {student_id}")

        mouse_scores = []
        keystroke_scores = []

        def extract_numeric_values(obj):
            """Flatten nested dict/list structure into simple numeric values."""
            numeric_values = []
            if isinstance(obj, dict):
                for v in obj.values():
                    if isinstance(v, (int, float)):
                        numeric_values.append(v)
                    elif isinstance(v, list):
                        numeric_values += [x for x in v if isinstance(x, (int, float))]
                    elif isinstance(v, dict):
                        numeric_values += extract_numeric_values(v)
            elif isinstance(obj, list):
                numeric_values += [x for x in obj if isinstance(x, (int, float))]
            return numeric_values

        for m in metrics:
            metric_type = m.get("metric_type")
            features = m.get("metrics", {})
            numeric_values = extract_numeric_values(features)
            if not numeric_values:
                continue
            avg_score = float(np.mean(numeric_values))
            if metric_type == "mouse":
                mouse_scores.append(avg_score)
            elif metric_type == "keystroke":
                keystroke_scores.append(avg_score)

        if not mouse_scores and not keystroke_scores:
            return jsonify({"error": "Could not compute any valid predictions"}), 400

        mouse_threshold = float(np.mean(mouse_scores)) if mouse_scores else 0.85
        keystroke_threshold = float(np.mean(keystroke_scores)) if keystroke_scores else 0.85
        fusion_mean = (mouse_threshold + keystroke_threshold) / 2
        fusion_std = float(np.std([mouse_threshold, keystroke_threshold]))
        threshold = fusion_mean
        from datetime import datetime
        supabase.table("personal_thresholds").upsert({
            "student_id": student_id,
            "calibration_session_id": session_id,
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": threshold,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
        print(f"[Calibration] ✅ Thresholds saved for {student_id}: mouse={mouse_threshold:.3f}, keystroke={keystroke_threshold:.3f}, fusion_mean={fusion_mean:.3f}, fusion_std={fusion_std:.3f}, threshold={threshold:.3f}")
        return jsonify({
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": threshold
        })

    except Exception as e:
        print("[Calibration] Exception:", str(e))
        return jsonify({"error": str(e)}), 500
