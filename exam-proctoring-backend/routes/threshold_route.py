import os
import numpy as np
import os
import numpy as np
import pandas as pd  # <--- NEW IMPORT
from flask import Blueprint, request, jsonify
from feature_definitions import KEYSTROKE_FEATURE_NAMES  # <--- IMPORT THE LIST

threshold_bp = Blueprint("threshold_bp", __name__)


# --- SUPABASE CLIENT IS NOW ACCESSED VIA APP ---

def pad_vector(vector, target_length):
    """Ensures vector is exactly target_length."""
    if not vector: return np.zeros(target_length)
    arr = np.array(vector, dtype=np.float32)
    if len(arr) < target_length:
        return np.pad(arr, (0, target_length - len(arr)), 'constant')
    return arr[:target_length]

@threshold_bp.route("/compute-threshold", methods=["POST"])
def compute_threshold():
    from app import ML_ASSETS, supabase as global_supabase
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        student_id = data.get("student_id")

        if not session_id or not student_id:
            return jsonify({"error": "Missing session_id or student_id"}), 400

        print(f"[Backend] Fetching calibration: {session_id}")
        if not global_supabase:
            return jsonify({"error": "Backend configuration error: Supabase not initialized"}), 500
        response = global_supabase.table("behavioral_metrics").select("*").eq("calibration_session_id", session_id).execute()
        records = response.data

        if not records:
            return jsonify({"error": "No calibration data found"}), 404

        feature_len = len(KEYSTROKE_FEATURE_NAMES)
        k_vectors = [pad_vector(r.get("keystroke_vector"), feature_len) for r in records if r.get("keystroke_vector")]
        m_vectors = [pad_vector(r.get("mouse_vector"), 11) for r in records if r.get("mouse_vector")]

        avg_k_vector = np.mean(k_vectors, axis=0) if k_vectors else np.zeros(feature_len)
        avg_m_vector = np.mean(m_vectors, axis=0) if m_vectors else np.zeros(11)

        k_model = ML_ASSETS['keystroke_model']
        k_scaled_array = ML_ASSETS['keystroke_scaler'].transform(avg_k_vector.reshape(1, -1))
        k_input_df = pd.DataFrame(k_scaled_array, columns=KEYSTROKE_FEATURE_NAMES)
        prob_keystroke = float(k_model.predict_proba(k_input_df)[0][1])
        m_scaled = ML_ASSETS['mouse_scaler'].transform(avg_m_vector.reshape(1, -1))
        prob_mouse = float(ML_ASSETS['mouse_model'].predict_proba(m_scaled)[0][1])

        baseline_score = (0.6 * prob_mouse) + (0.4 * prob_keystroke)
        calculated_threshold = max(0.50, baseline_score - 0.15)

        print(f"[Backend] Baseline: {baseline_score:.4f} -> Threshold: {calculated_threshold:.4f}")

        upsert_data = {
            "student_id": student_id,
            "fusion_threshold": round(calculated_threshold, 4),
            "mouse_threshold": round(prob_mouse, 4),
            "keystroke_threshold": round(prob_keystroke, 4)
        }
        global_supabase.table("personal_thresholds").upsert(upsert_data, on_conflict="student_id").execute()

        return jsonify({
            "message": "Threshold generated",
            "threshold": round(calculated_threshold, 4)
        }), 200

    except Exception as e:
        print(f"[Backend Error] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500