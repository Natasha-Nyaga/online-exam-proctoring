# routes/predict_route.py
from flask import Blueprint, request, jsonify
import joblib, numpy as np, traceback, os
from supabase import create_client
from datetime import datetime

predict_bp = Blueprint("predict_bp", __name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# load once
mouse_model = joblib.load("models/mouse_model.joblib")
keystroke_model = joblib.load("models/keystroke_model.joblib")
mouse_scaler = joblib.load("models/scaler_mouse.joblib")
keystroke_scaler = joblib.load("models/scaler_keystroke.joblib")

DEFAULT_THRESHOLD = 0.70
MOUSE_WEIGHT = 0.45
KEY_WEIGHT = 0.55

def to_array_safe(obj):
    EXPECTED_LEN = 245
    if obj is None: return None
    if isinstance(obj, list):
        arr = np.array([float(x) if (isinstance(x,(int,float)) and np.isfinite(x)) else 0.0 for x in obj], dtype=float).reshape(1,-1)
        # Pad or trim to 245
        if arr.shape[1] < EXPECTED_LEN:
            pad = np.zeros((1, EXPECTED_LEN - arr.shape[1]))
            arr = np.hstack([arr, pad])
        elif arr.shape[1] > EXPECTED_LEN:
            arr = arr[:, :EXPECTED_LEN]
        return arr
    # if obj is dict with vector key
    if isinstance(obj, dict) and 'vector' in obj and isinstance(obj['vector'], list):
        return to_array_safe(obj['vector'])
    return None

def load_thresholds_for(student_id):
    try:
        r = supabase.table("personal_thresholds").select("*").eq("student_id", student_id).order("created_at", desc=True).limit(1).execute()
        d = r.data and len(r.data)>0 and r.data[0]
        if not d: return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD}
        return {"mouse_threshold": float(d.get("mouse_threshold", DEFAULT_THRESHOLD)), "keystroke_threshold": float(d.get("keystroke_threshold", DEFAULT_THRESHOLD))}
    except Exception as e:
        return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD}

@predict_bp.route("/predict", methods=["POST"])
def predict_behavior():
    try:
        data = request.get_json() or {}
        student_id = data.get("studentId") or data.get("student_id")
        questionType = data.get("questionType") or data.get("question_type") or "mcq"

        # accept multiple payload names
        mouse_payload = data.get("mouse_features") or data.get("mouse_features_obj_sample") or data.get("mouse_features_obj")
        key_payload = data.get("keystroke_features") or data.get("keystroke_features_obj_sample") or data.get("keystroke_features_obj")

        mouse_arr = to_array_safe(mouse_payload)
        key_arr = to_array_safe(key_payload)

        p_mouse = None
        p_key = None
        fusion_score = 0.0

        # safe scaling & predict helper
        def safe_predict(arr, model, scaler):
            if arr is None: return None
            try:
                # if scaler expects fixed number of features, check:
                expected = getattr(scaler, 'n_features_in_', None)
                if expected and arr.shape[1] != expected:
                    # pad or trim
                    if arr.shape[1] < expected:
                        pad = np.zeros((1, expected - arr.shape[1]))
                        arr2 = np.hstack([arr, pad])
                    else:
                        arr2 = arr[:, :expected]
                else:
                    arr2 = arr
                scaled = scaler.transform(arr2)
                prob = float(model.predict_proba(scaled)[0][1])
                return prob
            except Exception as e:
                print("[predict] safe_predict exception:", e)
                return None

        p_mouse = safe_predict(mouse_arr, mouse_model, mouse_scaler)
        p_key = safe_predict(key_arr, keystroke_model, keystroke_scaler)

        # fusion logic
        if p_mouse is not None and p_key is not None:
            fusion_score = MOUSE_WEIGHT * p_mouse + KEY_WEIGHT * p_key
        elif p_mouse is not None:
            fusion_score = p_mouse
        elif p_key is not None:
            fusion_score = p_key
        else:
            return jsonify({"fusion_score": 0.0, "cheating_prediction": 0, "status":"idle"}), 200

        thresholds = load_thresholds_for(student_id)
        threshold = thresholds["mouse_threshold"] if questionType == "mcq" else thresholds["keystroke_threshold"]

        flagged = 1 if fusion_score > threshold else 0
        status = "flagged" if flagged else ("suspicious" if fusion_score > (threshold - 0.05) else "normal")

        # optional: log events if flagged
        if flagged and student_id:
            supabase.table("cheating_incidents").insert({
                "session_id": data.get("sessionId") or data.get("session_id"),
                "student_id": student_id,
                "fusion_score": fusion_score,
                "mouse_prob": p_mouse,
                "keystroke_prob": p_key,
                "created_at": datetime.utcnow().isoformat()
            }).execute()

        return jsonify({
            "cheating_prediction": flagged,
            "fusion_score": fusion_score,
            "mouse_probability": p_mouse,
            "keystroke_probability": p_key,
            "threshold": threshold,
            "status": status
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
