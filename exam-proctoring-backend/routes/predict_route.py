from flask import Blueprint, request, jsonify
import numpy as np
import joblib
import traceback
from sklearn.preprocessing import StandardScaler
from routes.threshold_route import load_thresholds_for

predict_bp = Blueprint('predict_bp', __name__)

# ----------- LOAD MODELS + SCALERS -----------
try:
    mouse_model = joblib.load("models/mouse_model.joblib")
    keystroke_model = joblib.load("models/keystroke_model.joblib")
    mouse_scaler = joblib.load("models/scaler_mouse.joblib")
    keystroke_scaler = joblib.load("models/scaler_keystroke.joblib")
    print("[Backend] Models and scalers loaded successfully ✅")
except Exception as e:
    print(f"[Backend] Error loading models/scalers: {e}")

# ----------- DEFAULT THRESHOLD -----------
DEFAULT_THRESHOLD = 0.85

# ----------- SMOOTH FUSION HELPER -----------
def compute_fusion_score(mouse_prob, key_prob, adaptive_weight=0.5):
    # balance both probabilities adaptively
    fusion_score = (adaptive_weight * key_prob) + ((1 - adaptive_weight) * mouse_prob)
    return round(float(fusion_score), 4)

# ----------- PREDICT ROUTE -----------
@predict_bp.route("/predict", methods=["POST"])
def predict_behavior():
    import traceback
    try:
        data = request.get_json(force=True)
        student_id = data.get("studentId") or data.get("student_id")
        session_id = data.get("sessionId") or data.get("session_id")
        question_type = data.get("questionType") or data.get("question_type")

        mouse_features_obj = data.get("mouse_features_obj_sample") or data.get("mouse_features") or data.get("mouse_features_obj")
        keystroke_features_obj = data.get("keystroke_features_obj_sample") or data.get("keystroke_features") or data.get("keystroke_features_obj")

        def dict_to_array(d, feature_order):
            if d is None:
                return None
            if isinstance(d, list):
                arr = np.array(d, dtype=float).reshape(1, -1)
                return arr
            try:
                vals = [float(d.get(k, 0.0)) for k in feature_order]
                return np.array(vals, dtype=float).reshape(1, -1)
            except Exception:
                nums = []
                if isinstance(d, dict):
                    for v in d.values():
                        if isinstance(v, (int, float)):
                            nums.append(float(v))
                        elif isinstance(v, list):
                            for e in v:
                                if isinstance(e, (int, float)):
                                    nums.append(float(e))
                if len(nums) == 0:
                    return None
                return np.array(nums, dtype=float).reshape(1, -1)

        MOUSE_FEATURE_ORDER = ["path_length", "avg_speed", "idle_time", "dwell_time",
                               "hover_time", "click_frequency", "click_interval_mean",
                               "click_ratio_per_question", "trajectory_smoothness",
                               "path_curvature", "transition_time"]

        KEYSTROKE_FEATURE_ORDER = [
            "H.period","DD.period.t","UD.period.t","H.t","DD.t.i","UD.t.i","H.i",
            "DD.i.e","UD.i.e","H.e","DD.e.five","UD.e.five","H.five",
            "DD.five.Shift.r","UD.five.Shift.r","H.Shift.r","DD.Shift.r.o",
            "UD.Shift.r.o","H.o","DD.o.a","UD.o.a","H.a","DD.a.n","UD.a.n",
            "H.n","DD.n.l","UD.n.l","H.l","DD.l.Return","UD.l.Return",
            "H.Return","typing_speed","digraph_mean","digraph_variance",
            "trigraph_mean","trigraph_variance","error_rate"
        ]

        mouse_arr = dict_to_array(mouse_features_obj, MOUSE_FEATURE_ORDER)
        key_arr = dict_to_array(keystroke_features_obj, KEYSTROKE_FEATURE_ORDER)

        print("[Backend] Received prediction request:", {
            "student_id": student_id, "session_id": session_id,
            "qtype": question_type,
            "mouse_shape": None if mouse_arr is None else mouse_arr.shape,
            "key_shape": None if key_arr is None else key_arr.shape
        })

        def arr_sum(a):
            if a is None:
                return 0.0
            return float(np.sum(np.abs(a)))

        if arr_sum(mouse_arr) == 0.0 and arr_sum(key_arr) == 0.0:
            return jsonify({
                "fusion_score": 0.0,
                "cheating_prediction": 0,
                "mouse_probability": 0.0,
                "keystroke_probability": 0.0,
                "status": "idle"
            }), 200

        p_mouse = None
        p_key = None

        if mouse_arr is not None:
            if mouse_arr.shape[1] != getattr(mouse_scaler, 'n_features_in_', mouse_arr.shape[1]):
                print("[Backend] WARNING: mouse input dimension mismatch:", mouse_arr.shape, getattr(mouse_scaler, 'n_features_in_', None))
            try:
                mouse_scaled = mouse_scaler.transform(mouse_arr)
                p_mouse = float(mouse_model.predict_proba(mouse_scaled)[0][1])
            except Exception as e:
                print("[Backend] mouse predict error:", e)
                p_mouse = None

        if key_arr is not None:
            if key_arr.shape[1] != getattr(keystroke_scaler, 'n_features_in_', key_arr.shape[1]):
                print("[Backend] WARNING: keystroke input dimension mismatch:", key_arr.shape, getattr(keystroke_scaler, 'n_features_in_', None))
            try:
                key_scaled = keystroke_scaler.transform(key_arr)
                p_key = float(keystroke_model.predict_proba(key_scaled)[0][1])
            except Exception as e:
                print("[Backend] keystroke predict error:", e)
                p_key = None

        if p_mouse is not None and p_key is not None:
            fusion_score = 0.45 * p_mouse + 0.55 * p_key
        elif p_mouse is not None:
            fusion_score = p_mouse
        elif p_key is not None:
            fusion_score = p_key
        else:
            fusion_score = 0.0

        thresholds = load_thresholds_for(student_id) or {}
        mouse_thr = thresholds.get("mouse_threshold", 0.85)
        key_thr = thresholds.get("keystroke_threshold", 0.85)
        used_thr = key_thr if question_type == "essay" else mouse_thr

        flagged = int(fusion_score > float(used_thr))

        return jsonify({
            "cheating_prediction": flagged,
            "fusion_score": float(fusion_score),
            "mouse_probability": p_mouse,
            "keystroke_probability": p_key,
            "threshold": float(used_thr),
            "status": "active"
        }), 200
    except Exception as e:
        print("[Backend] Prediction exception:", str(e))
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
