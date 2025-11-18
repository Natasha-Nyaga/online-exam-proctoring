import os
import numpy as np
import os
import numpy as np
import pandas as pd  # <--- NEW IMPORT
from flask import Blueprint, request, jsonify
from supabase import create_client, Client
from feature_definitions import KEYSTROKE_FEATURE_NAMES  # <--- IMPORT THE LIST

threshold_bp = Blueprint("threshold_bp", __name__)

# --- SUPABASE CONFIG ---
url: str = os.environ.get("VITE_SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

def pad_vector(vector, target_length):
    """Ensures vector is exactly target_length."""
    if not vector: return np.zeros(target_length)
    arr = np.array(vector, dtype=np.float32)
    if len(arr) < target_length:
        return np.pad(arr, (0, target_length - len(arr)), 'constant')
    return arr[:target_length]

@threshold_bp.route("/compute-threshold", methods=["POST"])
def compute_threshold():
    from app import ML_ASSETS 
    
    try:
        data = request.get_json()
        session_id = data.get("session_id")
        student_id = data.get("student_id")

        if not session_id or not student_id:
            return jsonify({"error": "Missing session_id or student_id"}), 400

        # 1. Fetch Calibration Data
        print(f"[Backend] Fetching calibration: {session_id}")
        response = supabase.table("behavioral_metrics").select("*").eq("session_id", session_id).execute()
        records = response.data
        
        if not records:
             return jsonify({"error": "No calibration data found"}), 404

        # 2. Extract & Aggregate Vectors
        # Get the expected feature count from the scaler (usually reliable)
        # or default to your known counts: 245 for keys, 11 for mouse
        k_vectors = [pad_vector(r.get("keystroke_vector"), 245) for r in records if r.get("keystroke_vector")]
        m_vectors = [pad_vector(r.get("mouse_vector"), 11) for r in records if r.get("mouse_vector")]

        # Average the vectors (Mean aggregation)
        avg_k_vector = np.mean(k_vectors, axis=0) if k_vectors else np.zeros(245)
        avg_m_vector = np.mean(m_vectors, axis=0) if m_vectors else np.zeros(11)

        # 3. PREPARE DATA FOR CATBOOST (CRITICAL FIX)
        # We must use a DataFrame with the exact feature names from the model
        k_model = ML_ASSETS['keystroke_model']
        
        # Scale first (Scalers usually return arrays, which is fine)
        k_scaled_array = ML_ASSETS['scaler_keystroke'].transform(avg_k_vector.reshape(1, -1))
        
        # WRAP IN DATAFRAME: Check if model has feature_names_
        if hasattr(k_model, 'feature_names_'):
            k_input = pd.DataFrame(k_scaled_array, columns=k_model.feature_names_)
        else:
            # Fallback if names aren't stored, but CatBoost usually stores them
            k_input = k_scaled_array

        # Do the same for Mouse (Mouse is likely Scikit-Learn, simpler, but safety first)
        m_scaled = ML_ASSETS['scaler_mouse'].transform(avg_m_vector.reshape(1, -1))

        # 4. Predict
        k_input_df = pd.DataFrame(k_scaled_array, columns=KEYSTROKE_FEATURE_NAMES)
        prob_keystroke = float(k_model.predict_proba(k_input_df)[0][1])
        prob_mouse = float(ML_ASSETS['mouse_model'].predict_proba(m_scaled)[0][1])

        # 5. Fusion & Threshold
        baseline_score = (0.6 * prob_mouse) + (0.4 * prob_keystroke)
        # Threshold logic: 15% buffer below baseline, floor at 0.5
        calculated_threshold = max(0.50, baseline_score - 0.15)

        print(f"[Backend] Baseline: {baseline_score:.4f} -> Threshold: {calculated_threshold:.4f}")

        # 6. Save
        upsert_data = {
            "student_id": student_id,
            "fusion_threshold": round(calculated_threshold, 4),
            "mouse_threshold": round(prob_mouse, 4),
            "keystroke_threshold": round(prob_keystroke, 4)
        }
        supabase.table("personal_thresholds").upsert(upsert_data).execute()

        return jsonify({
            "message": "Threshold generated",
            "threshold": round(calculated_threshold, 4)
        }), 200

    except Exception as e:
        print(f"[Backend Error] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500