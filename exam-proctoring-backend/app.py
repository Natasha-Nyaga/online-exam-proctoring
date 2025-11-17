# app.py
import os
import json
import joblib
import traceback
import numpy as np
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client, Client

# --- load env ---
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- FILE PATHS / CONFIG ---
MODEL_DIR = os.getenv("MODEL_DIR", "models")
MOUSE_MODEL_PATH = os.getenv("MOUSE_MODEL_PATH", os.path.join(MODEL_DIR, "mouse_model.joblib"))
KEY_MODEL_PATH = os.getenv("KEYSTROKE_MODEL_PATH", os.path.join(MODEL_DIR, "keystroke_model.joblib"))
MOUSE_SCALER_PATH = os.getenv("MOUSE_SCALER_PATH", os.path.join(MODEL_DIR, "scaler_mouse.joblib"))
KEY_SCALER_PATH = os.getenv("KEYSTROKE_SCALER_PATH", os.path.join(MODEL_DIR, "scaler_keystroke.joblib"))

DEFAULT_THRESHOLD = float(os.getenv("DEFAULT_THRESHOLD", "0.85"))

# --- LOAD MODELS & SCALERS (single time) ---
try:
    mouse_model = joblib.load(MOUSE_MODEL_PATH)
    keystroke_model = joblib.load(KEY_MODEL_PATH)
    mouse_scaler = joblib.load(MOUSE_SCALER_PATH)
    keystroke_scaler = joblib.load(KEY_SCALER_PATH)
    print("[Backend] Models + scalers loaded.")
except Exception as e:
    print("[Backend] Error loading models/scalers:", e)
    mouse_model = keystroke_model = mouse_scaler = keystroke_scaler = None

# --- Expected orders (must match frontend extractors) ---
MOUSE_FEATURE_ORDER = [
    "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
    "click_frequency", "click_interval_mean", "click_ratio_per_question",
    "trajectory_smoothness", "path_curvature", "transition_time"
]
KEYSTROKE_FEATURE_ORDER = [
  "H.period","DD.period.t","UD.period.t","H.t","DD.t.i","UD.t.i","H.i",
  "DD.i.e","UD.i.e","H.e","DD.e.five","UD.e.five","H.five",
  "DD.five.Shift.r","UD.five.Shift.r","H.Shift.r","DD.Shift.r.o","UD.Shift.r.o",
  "H.o","DD.o.a","UD.o.a","H.a","DD.a.n","UD.a.n","H.n",
  "DD.n.l","UD.n.l","H.l","DD.l.Return","UD.l.Return","H.Return",
  "typing_speed","digraph_mean","digraph_variance","trigraph_mean","trigraph_variance","error_rate"
]

# --- Helpers: DB threshold read/write ---
def save_personal_threshold(student_id: str, payload: dict):
    if not supabase:
        print("[Backend] No supabase client configured; skipping threshold save.")
        return
    try:
        payload_db = {
            "student_id": student_id,
            "calibration_session_id": payload.get("calibration_session_id"),
            "mouse_threshold": float(payload.get("mouse_threshold", DEFAULT_THRESHOLD)),
            "keystroke_threshold": float(payload.get("keystroke_threshold", DEFAULT_THRESHOLD)),
            "fusion_mean": float(payload.get("fusion_mean", 0.0)),
            "fusion_std": float(payload.get("fusion_std", 0.0)),
            "threshold": float(payload.get("threshold", DEFAULT_THRESHOLD)),
            "created_at": datetime.utcnow().isoformat()
        }
        supabase.table("personal_thresholds").insert(payload_db).execute()
        print(f"[Backend] Saved personal threshold for {student_id}")
    except Exception as e:
        print("[Backend] Error saving threshold to supabase:", e)

def load_personal_threshold(student_id: str):
    if not supabase:
        return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD, "threshold": DEFAULT_THRESHOLD}
    try:
        res = supabase.table("personal_thresholds").select("*").eq("student_id", student_id).order("created_at", desc=True).limit(1).execute()
        if res.data and len(res.data) > 0:
            row = res.data[0]
            return {
                "mouse_threshold": float(row.get("mouse_threshold", DEFAULT_THRESHOLD)),
                "keystroke_threshold": float(row.get("keystroke_threshold", DEFAULT_THRESHOLD)),
                "threshold": float(row.get("threshold", DEFAULT_THRESHOLD))
            }
    except Exception as e:
        print("[Backend] Error loading threshold:", e)
    return {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD, "threshold": DEFAULT_THRESHOLD}

# --- Endpoint: health ---
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "models_loaded": mouse_model is not None and keystroke_model is not None}), 200

# --- Endpoint: get-threshold ---
@app.route("/get-threshold", methods=["GET"])
def get_threshold():
    student_id = request.args.get("student_id")
    if not student_id:
        return jsonify({"error": "missing student_id"}), 400
    thresholds = load_personal_threshold(student_id)
    return jsonify(thresholds), 200

# --- Endpoint: calibration compute threshold ---
@app.route('/calibration/compute-threshold', methods=['POST'])
def compute_threshold():
    data = request.json
    student_id = data.get("student_id")
    session_id = data.get("session_id")

    try:
        # Load calibration data
        keystroke_vectors = np.array(data.get("keystroke_vectors", []))
        mouse_vectors = np.array(data.get("mouse_vectors", []))

        if keystroke_vectors.size == 0 or mouse_vectors.size == 0:
            return jsonify({"error": "No calibration data received"}), 400

        # Run models safely
        ks_preds = keystroke_model.predict_proba(keystroke_vectors)[:, 1]
        ms_preds = mouse_model.predict_proba(mouse_vectors)[:, 1]

        # Safety checks
        if ks_preds.size == 0 or ms_preds.size == 0:
            return jsonify({"error": "Could not compute any valid predictions"}), 400

        # Fusion
        fusion_scores = (ks_preds + ms_preds) / 2.0

        if np.isnan(fusion_scores).any():
            return jsonify({"error": "Fusion scores contain NaN"}), 400

        fusion_mean = float(np.mean(fusion_scores))
        fusion_std  = float(np.std(fusion_scores))

        # Personalized thresholds
        keystroke_threshold = float(np.mean(ks_preds) + 2 * np.std(ks_preds))
        mouse_threshold     = float(np.mean(ms_preds) + 2 * np.std(ms_preds))

        payload = {
            "student_id": student_id,
            "session_id": session_id,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "keystroke_threshold": keystroke_threshold,
            "mouse_threshold": mouse_threshold,
        }

        print("DEBUG: Writing thresholds → ", payload)

        supabase.table("personal_thresholds").insert(payload).execute()

        return jsonify(payload), 200

    except Exception as e:
        print("Threshold ERROR:", str(e))
        return jsonify({"error": str(e)}), 500

# --- Endpoint: predict (live) ---
@app.route("/predict", methods=["POST"])
def predict_route():
    try:
        data = request.get_json() or {}
        student_id = data.get("studentId") or data.get("student_id")
        question_type = data.get("questionType") or data.get("question_type")
        mouse_features = data.get("mouse_features") or data.get("mouse_features_obj_sample") or None
        keystroke_features = data.get("keystroke_features") or data.get("keystroke_features_obj_sample") or None
        session_id = data.get("sessionId") or data.get("session_id")

        # Accept either arrays or objects with 'vector' field
        def normalize_arr(x):
            if x is None: return None
            if isinstance(x, dict) and "vector" in x:
                return np.array(x["vector"], dtype=float).reshape(1, -1)
            if isinstance(x, list):
                return np.array(x, dtype=float).reshape(1, -1)
            return None

        mouse_vec = normalize_arr(mouse_features)
        key_vec = normalize_arr(keystroke_features)

        # Quick activity checks
        mouse_sum = float(np.sum(np.abs(mouse_vec))) if mouse_vec is not None else 0.0
        key_sum = float(np.sum(np.abs(key_vec))) if key_vec is not None else 0.0
        if mouse_sum < 1e-6 and key_sum < 1e-6:
            return jsonify({
                "fusion_score": 0.0,
                "cheating_prediction": 0,
                "mouse_probability": 0.0,
                "keystroke_probability": 0.0,
                "status": "idle",
                "user_threshold": DEFAULT_THRESHOLD
            }), 200

        # Scale & predict using loaded scalers/models
        p_mouse = None
        p_key = None

        try:
            if mouse_vec is not None and mouse_scaler is not None and mouse_model is not None:
                m_scaled = mouse_scaler.transform(mouse_vec)
                p_mouse = float(mouse_model.predict_proba(m_scaled)[0][1])
        except Exception as e:
            print("[Predict] mouse predict error:", e)

        try:
            if key_vec is not None and keystroke_scaler is not None and keystroke_model is not None:
                k_scaled = keystroke_scaler.transform(key_vec)
                p_key = float(keystroke_model.predict_proba(k_scaled)[0][1])
        except Exception as e:
            print("[Predict] key predict error:", e)

        # Fusion logic: if both present, weighted mean, else use available
        if p_mouse is not None and p_key is not None:
            MOUSE_W = float(os.getenv("MOUSE_WEIGHT", 0.45))
            KEY_W = float(os.getenv("KEY_WEIGHT", 0.55))
            fusion_score = MOUSE_W * p_mouse + KEY_W * p_key
        elif p_mouse is not None:
            fusion_score = p_mouse
        elif p_key is not None:
            fusion_score = p_key
        else:
            fusion_score = 0.0

        thresholds = load_personal_threshold(student_id) if student_id else {"mouse_threshold": DEFAULT_THRESHOLD, "keystroke_threshold": DEFAULT_THRESHOLD, "threshold": DEFAULT_THRESHOLD}
        # choose modality threshold by question type
        used_thresh = thresholds["keystroke_threshold"] if (question_type and question_type.lower().startswith("essay")) else thresholds["mouse_threshold"]

        cheating = 1 if fusion_score > used_thresh else 0
        status = "flagged" if cheating else ("suspicious" if fusion_score > (used_thresh - 0.05) else "normal")

        # Optionally log incidents (only log flagged)
        if cheating == 1 and session_id and supabase:
            try:
                supabase.table("cheating_incidents").insert({
                    "session_id": session_id,
                    "student_id": student_id,
                    "fusion_score": float(fusion_score),
                    "mouse_probability": float(p_mouse) if p_mouse is not None else None,
                    "keystroke_probability": float(p_key) if p_key is not None else None,
                    "created_at": datetime.utcnow().isoformat()
                }).execute()
            except Exception as e:
                print("[Predict] error logging incident:", e)

        return jsonify({
            "fusion_score": float(fusion_score),
            "cheating_prediction": int(cheating),
            "mouse_probability": float(p_mouse) if p_mouse is not None else None,
            "keystroke_probability": float(p_key) if p_key is not None else None,
            "user_threshold": float(used_thresh),
            "status": status
        }), 200

    except Exception as e:
        print("[Predict] fatal:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
