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
    import traceback
    from datetime import datetime
    try:
        payload = request.get_json(force=True)
        session_id = payload.get("session_id") or payload.get("calibration_session_id")
        student_id = payload.get("student_id")

        if not session_id or not student_id:
            return jsonify({"error": "Missing session_id or student_id"}), 400

        result = supabase.table("behavioral_metrics") \
            .select("*") \
            .eq("calibration_session_id", session_id) \
            .eq("student_id", student_id) \
            .execute()
        metrics = getattr(result, "data", None)
        if not metrics or len(metrics) == 0:
            print(f"[Calibration] ERROR: No behavioral metrics found for session {session_id}")
            return jsonify({"error": "No behavioral metrics found"}), 400

        print(f"[Calibration] Found {len(metrics)} metrics for session {session_id}")

        def extract_numeric_values(obj):
            numeric = []
            if obj is None:
                return numeric
            if isinstance(obj, dict):
                for v in obj.values():
                    if isinstance(v, (int, float)):
                        numeric.append(float(v))
                    elif isinstance(v, list):
                        for e in v:
                            if isinstance(e, (int, float)):
                                numeric.append(float(e))
                            elif isinstance(e, dict):
                                numeric += extract_numeric_values(e)
                    elif isinstance(v, dict):
                        numeric += extract_numeric_values(v)
            elif isinstance(obj, list):
                for e in obj:
                    if isinstance(e, (int, float)):
                        numeric.append(float(e))
                    elif isinstance(e, dict):
                        numeric += extract_numeric_values(e)
            return numeric

        mouse_scores = []
        keystroke_scores = []
        for m in metrics:
            metric_type = m.get("metric_type")
            metrics_obj = m.get("metrics") or m.get("metric") or m.get("data") or {}
            numeric = extract_numeric_values(metrics_obj)
            if not numeric:
                continue
            avg = float(np.mean(numeric))
            if metric_type == "mouse":
                mouse_scores.append(avg)
            elif metric_type == "keystroke":
                keystroke_scores.append(avg)

        if len(mouse_scores) == 0 and len(keystroke_scores) == 0:
            print("[Calibration] ERROR: Could not compute any valid predictions from calibration metrics")
            return jsonify({"error": "Could not compute any valid predictions"}), 400

        mouse_threshold = float(np.mean(mouse_scores) + 1.25 * np.std(mouse_scores)) if len(mouse_scores) > 0 else None
        keystroke_threshold = float(np.mean(keystroke_scores) + 1.25 * np.std(keystroke_scores)) if len(keystroke_scores) > 0 else None
        used_values = []
        if mouse_threshold is not None:
            used_values.append(mouse_threshold)
        if keystroke_threshold is not None:
            used_values.append(keystroke_threshold)
        fusion_mean = float(np.mean(used_values)) if used_values else None
        fusion_std = float(np.std(used_values)) if used_values else None
        final_threshold = fusion_mean if fusion_mean is not None else 0.55

        store_payload = {
            "student_id": student_id,
            "calibration_session_id": session_id,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": final_threshold,
            "created_at": datetime.utcnow().isoformat()
        }
        if mouse_threshold is not None:
            store_payload["mouse_threshold"] = mouse_threshold
        if keystroke_threshold is not None:
            store_payload["keystroke_threshold"] = keystroke_threshold

        supabase.table("personal_thresholds").insert(store_payload).execute()
        print("[Calibration] ✅ Thresholds saved:", store_payload)
        response = {
            "samples_processed": len(mouse_scores) + len(keystroke_scores),
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": final_threshold
        }
        return jsonify(response), 200
    except Exception as e:
        print("[Calibration] FATAL ERROR:", str(e))
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
