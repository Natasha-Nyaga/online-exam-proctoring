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
    import numpy as np
    from datetime import datetime
    student_id = request.json.get("student_id")
    session_id = request.json.get("calibration_session_id")
    if not student_id or not session_id:
        return jsonify({"error": "Missing student_id or calibration_session_id"}), 400

    # Fetch behavioral metrics for this calibration session
    result = supabase.table('behavioral_metrics')\
        .select('*')\
        .eq('calibration_session_id', session_id)\
        .eq('student_id', student_id)\
        .execute()

    if not result.data or len(result.data) == 0:
        print(f"[Calibration] ERROR: No behavioral metrics found for session {session_id}")
        return jsonify({"error": "No behavioral metrics found for calibration session"}), 400

    # Group metrics by question_index
    metrics_by_question = {}
    for metric in result.data:
        q_idx = metric.get('question_index')
        if q_idx not in metrics_by_question:
            metrics_by_question[q_idx] = {'mouse': None, 'keystroke': None}
        metric_type = metric.get('metric_type')
        if metric_type in ['mouse', 'keystroke']:
            metrics_by_question[q_idx][metric_type] = metric

    fusion_scores = []
    mouse_model = joblib.load("models/mouse_model.joblib")
    key_model = joblib.load("models/keystroke_model.joblib")
    mouse_scaler = joblib.load("models/scaler_mouse.joblib")
    key_scaler = joblib.load("models/scaler_keystroke.joblib")

    for q_idx, pair in metrics_by_question.items():
        mouse_metric = pair['mouse']
        keystroke_metric = pair['keystroke']
        p_mouse = None
        p_key = None
        # Extract features and predict probabilities
        if mouse_metric:
            try:
                mouse_features = [mouse_metric.get(f) for f in mouse_metric if isinstance(mouse_metric.get(f), (int, float))]
                if mouse_features and np.sum(np.abs(mouse_features)) > 0.001:
                    mouse_scaled = mouse_scaler.transform([mouse_features])
                    p_mouse = mouse_model.predict_proba(mouse_scaled)[0][1]
            except Exception as e:
                print(f"[Calibration] Mouse feature extraction failed for Q{q_idx}: {e}")
        if keystroke_metric:
            try:
                key_features = [keystroke_metric.get(f) for f in keystroke_metric if isinstance(keystroke_metric.get(f), (int, float))]
                if key_features and np.sum(np.abs(key_features)) > 0.001:
                    key_scaled = key_scaler.transform([key_features])
                    p_key = key_model.predict_proba(key_scaled)[0][1]
            except Exception as e:
                print(f"[Calibration] Keystroke feature extraction failed for Q{q_idx}: {e}")
        # Compute fusion score
        if p_mouse is not None and p_key is not None:
            fusion = (0.5 * p_mouse) + (0.5 * p_key)
            fusion_scores.append(fusion)
        elif p_mouse is not None:
            fusion_scores.append(p_mouse)
        elif p_key is not None:
            fusion_scores.append(p_key)

    if len(fusion_scores) == 0:
        print(f"[Calibration] ERROR: No valid fusion scores computed")
        return jsonify({"error": "Could not compute any valid predictions"}), 400

    fusion_mean = float(np.mean(fusion_scores))
    fusion_std = float(np.std(fusion_scores))
    adaptive_threshold = fusion_mean + (1.25 * fusion_std)
    adaptive_threshold = float(np.clip(adaptive_threshold, 0.35, 0.85))

    supabase.table('personal_thresholds').insert({
        "student_id": student_id,
        "calibration_session_id": session_id,
        "fusion_mean": fusion_mean,
        "fusion_std": fusion_std,
        "threshold": adaptive_threshold,
        "created_at": datetime.utcnow().isoformat()
    }).execute()
    print(f"[Calibration] Personalized threshold for {student_id}: {adaptive_threshold}")
    return jsonify({"status": "success", "threshold": adaptive_threshold})
