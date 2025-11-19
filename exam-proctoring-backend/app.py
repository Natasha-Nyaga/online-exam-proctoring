from pathlib import Path
from dotenv import load_dotenv
import os

# --- STEP 1: LOAD ENV VARS BEFORE ANYTHING ELSE ---
# This prevents "supabase_key is required" errors when importing routes
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

import joblib
import traceback
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime

# Import Feature Names for CatBoost Fix
from feature_definitions import KEYSTROKE_FEATURE_NAMES 

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- CONFIG & SUPABASE ---
SUPABASE_URL = os.getenv("SUPABASE_URL") 
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") 

try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        print("[Backend Warning] Supabase credentials missing in .env")
        supabase = None
except Exception as e:
    print(f"[Backend Error] Supabase init failed: {e}")
    supabase = None

# --- FILE PATHS ---
MODEL_DIR = os.getenv("MODEL_DIR", "models")
MOUSE_MODEL_PATH = os.path.join(MODEL_DIR, "mouse_model.joblib")
KEY_MODEL_PATH = os.path.join(MODEL_DIR, "keystroke_model.joblib")

# CORRECTED SCALER NAMES as per your request
MOUSE_SCALER_PATH = os.path.join(MODEL_DIR, "scaler_mouse.joblib")
KEY_SCALER_PATH = os.path.join(MODEL_DIR, "scaler_keystroke.joblib")

DEFAULT_THRESHOLD = float(os.getenv("DEFAULT_THRESHOLD", "0.70"))

# --- LOAD MODELS & SCALERS ---
# We create a global dictionary so threshold_route.py can import it
ML_ASSETS = {
    "mouse_model": None,
    "keystroke_model": None,
    "mouse_scaler": None,
    "keystroke_scaler": None
}

try:
    print("[Backend] Loading models...")
    ML_ASSETS["mouse_model"] = joblib.load(MOUSE_MODEL_PATH)
    ML_ASSETS["keystroke_model"] = joblib.load(KEY_MODEL_PATH)
    ML_ASSETS["mouse_scaler"] = joblib.load(MOUSE_SCALER_PATH)
    ML_ASSETS["keystroke_scaler"] = joblib.load(KEY_SCALER_PATH)
    print("[Backend] Models + Scalers loaded successfully.")
except Exception as e:
    print("[Backend CRITICAL] Error loading models/scalers:", e)
    # We don't exit here so the server can at least start and show the error

# --- REGISTER BLUEPRINT ---
# We import this AFTER loading env vars to avoid the crash
from routes.threshold_route import threshold_bp
app.register_blueprint(threshold_bp, url_prefix='/calibration')


# --- HELPER: Load Threshold (Read-Only for Predict) ---
def load_personal_threshold(student_id: str):
    if not supabase:
        return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD}
    try:
        res = supabase.table("personal_thresholds").select("*").eq("student_id", student_id).execute()
        if res.data and len(res.data) > 0:
            row = res.data[0]
            return {
                "mouse_threshold": float(row.get("mouse_threshold", DEFAULT_THRESHOLD)),
                "keystroke_threshold": float(row.get("keystroke_threshold", DEFAULT_THRESHOLD)),
            }
    except Exception as e:
        print("[Backend] Error loading threshold:", e)
    return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD}

# --- ROUTES ---

@app.route("/health", methods=["GET"])
def health():
    loaded = ML_ASSETS["mouse_model"] is not None
    return jsonify({"status": "healthy", "models_loaded": loaded}), 200

@app.route("/get-threshold", methods=["GET"])
def get_threshold():
    student_id = request.args.get("student_id")
    if not student_id: return jsonify({"error": "missing student_id"}), 400
    t = load_personal_threshold(student_id)
    return jsonify(t), 200

@app.route("/predict", methods=["POST"])
def predict_route():
    try:
        data = request.get_json() or {}
        student_id = data.get("studentId") or data.get("student_id")
        question_type = data.get("questionType") or data.get("question_type")
        
        # Helper to handle incoming list or object
        def normalize_arr(x):
            if x is None: return None
            if isinstance(x, dict) and "vector" in x: return np.array(x["vector"], dtype=float).reshape(1, -1)
            if isinstance(x, list): return np.array(x, dtype=float).reshape(1, -1)
            return None

        mouse_vec = normalize_arr(data.get("mouse_features") or data.get("mouse_features_obj_sample"))
        key_vec = normalize_arr(data.get("keystroke_features") or data.get("keystroke_features_obj_sample"))
        session_id = data.get("sessionId") or data.get("session_id")

        p_mouse = None
        p_key = None

        # --- MOUSE PREDICTION ---
        try:
            if mouse_vec is not None and ML_ASSETS["mouse_model"]:
                m_scaled = ML_ASSETS["mouse_scaler"].transform(mouse_vec)
                p_mouse = float(ML_ASSETS["mouse_model"].predict_proba(m_scaled)[0][1])
        except Exception as e:
            print("[Predict] Mouse error:", e)

        # --- KEYSTROKE PREDICTION (WITH CATBOOST FIX) ---
        try:
            if key_vec is not None and ML_ASSETS["keystroke_model"]:
                from feature_definitions import KEYSTROKE_FEATURE_NAMES
                feature_len = len(KEYSTROKE_FEATURE_NAMES)
                # Pad or trim to new feature length
                if key_vec.shape[1] < feature_len:
                    key_vec = np.pad(key_vec, ((0,0), (0, feature_len - key_vec.shape[1])), 'constant')
                elif key_vec.shape[1] > feature_len:
                    key_vec = key_vec[:, :feature_len]
                # Scale
                k_scaled = ML_ASSETS["keystroke_scaler"].transform(key_vec)
                # DataFrame for CatBoost
                k_input_df = pd.DataFrame(k_scaled, columns=KEYSTROKE_FEATURE_NAMES)
                # Predict
                p_key = float(ML_ASSETS["keystroke_model"].predict_proba(k_input_df)[0][1])
        except Exception as e:
            print("[Predict] Keystroke error:", e)

        # --- FUSION ---
        if p_mouse is not None and p_key is not None:
            fusion_score = (0.45 * p_mouse) + (0.55 * p_key) # weights 
        elif p_mouse is not None:
            fusion_score = p_mouse
        elif p_key is not None:
            fusion_score = p_key
        else:
            fusion_score = 0.0

        # --- DECISION ---
        thresholds = load_personal_threshold(student_id)
        # If essay question, prefer keystroke threshold, else mouse
        used_thresh = thresholds["keystroke_threshold"] if (question_type and "essay" in question_type.lower()) else thresholds["mouse_threshold"]
        
        # If threshold is 0 (fallback), make it safer
        if used_thresh < 0.1: used_thresh = DEFAULT_THRESHOLD

        cheating = 1 if fusion_score < used_thresh else 0
        status = "flagged" if cheating else "normal"

        return jsonify({
            "fusion_score": float(fusion_score),
            "cheating_prediction": int(cheating),
            "mouse_probability": p_mouse,
            "keystroke_probability": p_key,
            "user_threshold": float(used_thresh),
            "status": status
        }), 200

    except Exception as e:
        print("[Predict] Fatal:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)