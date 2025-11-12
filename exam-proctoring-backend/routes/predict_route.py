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
    try:
        import numpy as np
        import joblib
        from routes.threshold_route import load_thresholds_for
        data = request.get_json()
        student_id = data.get("studentId")
        question_type = data.get("questionType")
        mouse_features = data.get("mouse_features_obj_sample")
        key_features = data.get("keystroke_features_obj_sample")

        mouse_model = joblib.load("models/mouse_model.joblib")
        key_model = joblib.load("models/keystroke_model.joblib")
        mouse_scaler = joblib.load("models/scaler_mouse.joblib")
        key_scaler = joblib.load("models/scaler_keystroke.joblib")

        mouse_df = np.array([mouse_features]) if mouse_features else None
        key_df = np.array([key_features]) if key_features else None
        mouse_scaled = mouse_scaler.transform(mouse_df) if mouse_df is not None else None
        key_scaled = key_scaler.transform(key_df) if key_df is not None else None

        p_mouse, p_key, fusion_score = None, None, 0.0
        if question_type == "mcq" and mouse_scaled is not None:
            p_mouse = float(mouse_model.predict_proba(mouse_scaled)[0][1])
            fusion_score = p_mouse
            print(f"[Backend] Student {student_id} used MCQ (mouse) modality.")
        elif question_type == "essay" and key_scaled is not None:
            p_key = float(key_model.predict_proba(key_scaled)[0][1])
            fusion_score = p_key
            print(f"[Backend] Student {student_id} used essay (keystroke) modality.")
        elif mouse_scaled is not None and key_scaled is not None:
            p_mouse = float(mouse_model.predict_proba(mouse_scaled)[0][1])
            p_key = float(key_model.predict_proba(key_scaled)[0][1])
            fusion_score = 0.5 * (p_mouse + p_key)
            print(f"[Backend] Student {student_id} used fusion modality.")

        thresholds = load_thresholds_for(student_id)
        mouse_threshold = thresholds.get("mouse_threshold", 0.85)
        key_threshold = thresholds.get("keystroke_threshold", 0.85)
        threshold = mouse_threshold if question_type == "mcq" else key_threshold
        flagged = int(fusion_score > threshold)

        print(f"[Backend] fusion_score={fusion_score:.2f} | mouse={p_mouse} | key={p_key} | threshold={threshold} | flagged={flagged}")

        return jsonify({
            "cheating_prediction": flagged,
            "fusion_score": fusion_score,
            "mouse_probability": p_mouse,
            "keystroke_probability": p_key,
            "threshold": threshold,
            "status": "active"
        })
    except Exception as e:
        print("[Backend] Prediction error:", traceback.format_exc())
        return jsonify({"error": str(e)}), 500
