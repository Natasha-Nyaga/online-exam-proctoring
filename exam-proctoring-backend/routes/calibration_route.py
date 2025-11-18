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
    # Pad/trim keystroke samples to 245 features per sample
    EXPECTED_LEN = 245
    if key_samples.ndim == 2:
        if key_samples.shape[1] < EXPECTED_LEN:
            pad = np.zeros((key_samples.shape[0], EXPECTED_LEN - key_samples.shape[1]))
            key_samples = np.hstack([key_samples, pad])
        elif key_samples.shape[1] > EXPECTED_LEN:
            key_samples = key_samples[:, :EXPECTED_LEN]

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

def flatten_numeric(obj):
    import numpy as np
    out = []
    if obj is None:
        return out
    if isinstance(obj, (int, float, np.number)):
        return [float(obj)]
    if isinstance(obj, dict):
        # prefer vector key if exists
        if "vector" in obj and isinstance(obj["vector"], list):
            obj = obj["vector"]
        else:
            for v in obj.values():
                out.extend(flatten_numeric(v))
    if isinstance(obj, list):
        for v in obj:
            out.extend(flatten_numeric(v))
    return [float(x) for x in out if isinstance(x, (int, float, np.number)) and np.isfinite(x)]

@calibration_bp.route("/calibration/compute-threshold", methods=["POST"])
def compute_threshold():
    try:
        data = request.get_json() or {}
        session_id = data.get("calibration_session_id") or data.get("session_id")
        student_id = data.get("student_id")
        if not session_id or not student_id:
            return jsonify({"error":"Missing session_id or student_id"}), 400

        res = supabase.table("behavioral_metrics").select("*").eq("calibration_session_id", session_id).execute()
        rows = res.data or []
        if len(rows) == 0:
            print(f"[Calibration] ERROR: No behavioral metrics found for session {session_id}")
            return jsonify({"error":"No calibration data received"}), 400

        mouse_scores = []
        keystroke_scores = []

        for r in rows:
            metric_type = r.get("metric_type")
            metrics_field = r.get("metrics")
            values = flatten_numeric(metrics_field)
            if not values:
                continue
            # use mean of numeric values as a scalar per-question sample
            sample_val = float(np.mean(values))
            if metric_type == "mouse":
                mouse_scores.append(sample_val)
            elif metric_type == "keystroke":
                keystroke_scores.append(sample_val)

        if not mouse_scores and not keystroke_scores:
            return jsonify({"error":"Could not compute any valid predictions"}), 400

        # compute thresholds per modality
        mouse_threshold = float(np.mean(mouse_scores)) if mouse_scores else 0.55
        keystroke_threshold = float(np.mean(keystroke_scores)) if keystroke_scores else 0.55

        # fusion statistics
        fusion_mean = (mouse_threshold + keystroke_threshold) / 2.0
        fusion_std = float(np.std([mouse_threshold, keystroke_threshold]))

        # clamp sensible range
        lower = 0.2
        upper = 0.95
        adaptive_threshold = float(max(lower, min(upper, fusion_mean + 1.25 * fusion_std)))

        # upsert into personal_thresholds - make sure table and columns exist
        from datetime import datetime
        payload = {
            "student_id": student_id,
            "calibration_session_id": session_id,
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": adaptive_threshold,
            "created_at": datetime.utcnow().isoformat()
        }
        supabase.table("personal_thresholds").upsert(payload).execute()

        print(f"[Calibration] Saved thresholds for {student_id}: mouse={mouse_threshold:.3f} key={keystroke_threshold:.3f} threshold={adaptive_threshold:.3f}")
        return jsonify({
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": adaptive_threshold,
            "samples_processed": len(mouse_scores)+len(keystroke_scores)
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
