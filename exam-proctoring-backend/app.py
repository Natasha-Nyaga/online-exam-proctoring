
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

import os
import json
import joblib
import traceback
import numpy as np
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


from feature_definitions import KEYSTROKE_FEATURE_NAMES # Import here too
import pandas as pd
from routes.threshold_route import threshold_bp

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
        'sessionIndex',
        'rep',
        'H.period', 'DD.period.t', 'UD.period.t', 'H.t', 'DD.t.i', 'UD.t.i', 'H.i', 'DD.i.e', 'UD.i.e', 'H.e',
        'DD.e.five', 'UD.e.five', 'H.five', 'DD.five.Shift.r', 'UD.five.Shift.r', 'H.Shift.r', 'DD.Shift.r.o', 'UD.Shift.r.o',
        'H.o', 'DD.o.a', 'UD.o.a', 'H.a', 'DD.a.n', 'UD.a.n', 'H.n', 'DD.n.l', 'UD.n.l', 'H.l', 'DD.l.Return', 'UD.l.Return', 'H.Return',
        'typing_speed', 'digraph_mean', 'digraph_variance', 'trigraph_mean', 'trigraph_variance', 'error_rate',
        'sessionIndex_mean', 'sessionIndex_std', 'sessionIndex_var', 'sessionIndex_min', 'sessionIndex_max', 'sessionIndex_median',
        'rep_mean', 'rep_std', 'rep_var', 'rep_min', 'rep_max', 'rep_median',
        'H.period_mean', 'H.period_std', 'H.period_var', 'H.period_min', 'H.period_max', 'H.period_median',
        'DD.period.t_mean', 'DD.period.t_std', 'DD.period.t_var', 'DD.period.t_min', 'DD.period.t_max', 'DD.period.t_median',
        'UD.period.t_mean', 'UD.period.t_std', 'UD.period.t_var', 'UD.period.t_min', 'UD.period.t_max', 'UD.period.t_median',
        'H.t_mean', 'H.t_std', 'H.t_var', 'H.t_min', 'H.t_max', 'H.t_median',
        'DD.t.i_mean', 'DD.t.i_std', 'DD.t.i_var', 'DD.t.i_min', 'DD.t.i_max', 'DD.t.i_median',
        'UD.t.i_mean', 'UD.t.i_std', 'UD.t.i_var', 'UD.t.i_min', 'UD.t.i_max', 'UD.t.i_median',
        'H.i_mean', 'H.i_std', 'H.i_var', 'H.i_min', 'H.i_max', 'H.i_median',
        'DD.i.e_mean', 'DD.i.e_std', 'DD.i.e_var', 'DD.i.e_min', 'DD.i.e_max', 'DD.i.e_median',
        'UD.i.e_mean', 'UD.i.e_std', 'UD.i.e_var', 'UD.i.e_min', 'UD.i.e_max', 'UD.i.e_median',
        'H.e_mean', 'H.e_std', 'H.e_var', 'H.e_min', 'H.e_max', 'H.e_median',
        'DD.e.five_mean', 'DD.e.five_std', 'DD.e.five_var', 'DD.e.five_min', 'DD.e.five_max', 'DD.e.five_median',
        'UD.e.five_mean', 'UD.e.five_std', 'UD.e.five_var', 'UD.e.five_min', 'UD.e.five_max', 'UD.e.five_median',
        'H.five_mean', 'H.five_std', 'H.five_var', 'H.five_min', 'H.five_max', 'H.five_median',
        'DD.five.Shift.r_mean', 'DD.five.Shift.r_std', 'DD.five.Shift.r_var', 'DD.five.Shift.r_min', 'DD.five.Shift.r_max', 'DD.five.Shift.r_median',
        'UD.five.Shift.r_mean', 'UD.five.Shift.r_std', 'UD.five.Shift.r_var', 'UD.five.Shift.r_min', 'UD.five.Shift.r_max', 'UD.five.Shift.r_median',
        'H.Shift.r_mean', 'H.Shift.r_std', 'H.Shift.r_var', 'H.Shift.r_min', 'H.Shift.r_max', 'H.Shift.r_median',
        'DD.Shift.r.o_mean', 'DD.Shift.r.o_std', 'DD.Shift.r.o_var', 'DD.Shift.r.o_min', 'DD.Shift.r.o_max', 'DD.Shift.r.o_median',
        'UD.Shift.r.o_mean', 'UD.Shift.r.o_std', 'UD.Shift.r.o_var', 'UD.Shift.r.o_min', 'UD.Shift.r.o_max', 'UD.Shift.r.o_median',
        'H.o_mean', 'H.o_std', 'H.o_var', 'H.o_min', 'H.o_max', 'H.o_median',
        'DD.o.a_mean', 'DD.o.a_std', 'DD.o.a_var', 'DD.o.a_min', 'DD.o.a_max', 'DD.o.a_median',
        'UD.o.a_mean', 'UD.o.a_std', 'UD.o.a_var', 'UD.o.a_min', 'UD.o.a_max', 'UD.o.a_median',
        'H.a_mean', 'H.a_std', 'H.a_var', 'H.a_min', 'H.a_max', 'H.a_median',
        'DD.a.n_mean', 'DD.a.n_std', 'DD.a.n_var', 'DD.a.n_min', 'DD.a.n_max', 'DD.a.n_median',
        'UD.a.n_mean', 'UD.a.n_std', 'UD.a.n_var', 'UD.a.n_min', 'UD.a.n_max', 'UD.a.n_median',
        'H.n_mean', 'H.n_std', 'H.n_var', 'H.n_min', 'H.n_max', 'H.n_median',
        'DD.n.l_mean', 'DD.n.l_std', 'DD.n.l_var', 'DD.n.l_min', 'DD.n.l_max', 'DD.n.l_median',
        'UD.n.l_mean', 'UD.n.l_std', 'UD.n.l_var', 'UD.n.l_min', 'UD.n.l_max', 'UD.n.l_median',
        'H.l_mean', 'H.l_std', 'H.l_var', 'H.l_min', 'H.l_max', 'H.l_median',
        'DD.l.Return_mean', 'DD.l.Return_std', 'DD.l.Return_var', 'DD.l.Return_min', 'DD.l.Return_max', 'DD.l.Return_median',
        'UD.l.Return_mean', 'UD.l.Return_std', 'UD.l.Return_var', 'UD.l.Return_min', 'UD.l.Return_max', 'UD.l.Return_median',
        'H.Return_mean', 'H.Return_std', 'H.Return_var', 'H.Return_min', 'H.Return_max', 'H.Return_median',
        'typing_speed_mean', 'typing_speed_std', 'typing_speed_var', 'typing_speed_min', 'typing_speed_max', 'typing_speed_median',
        'digraph_mean_mean', 'digraph_mean_std', 'digraph_mean_var', 'digraph_mean_min', 'digraph_mean_max', 'digraph_mean_median',
        'digraph_variance_mean', 'digraph_variance_std', 'digraph_variance_var', 'digraph_variance_min', 'digraph_variance_max', 'digraph_variance_median',
        'trigraph_mean_mean', 'trigraph_mean_std', 'trigraph_mean_var', 'trigraph_mean_min', 'trigraph_mean_max', 'trigraph_mean_median',
        'trigraph_variance_mean', 'trigraph_variance_std', 'trigraph_variance_var', 'trigraph_variance_min', 'trigraph_variance_max', 'trigraph_variance_median',
        'error_rate_mean', 'error_rate_std', 'error_rate_var', 'error_rate_min', 'error_rate_max', 'error_rate_median',
        'sessionIndex_skew', 'rep_skew', 'H.period_skew', 'DD.period.t_skew', 'UD.period.t_skew', 'H.t_skew', 'DD.t.i_skew', 'UD.t.i_skew', 'H.i_skew', 'DD.i.e_skew', 'UD.i.e_skew', 'H.e_skew', 'DD.e.five_skew', 'UD.e.five_skew', 'H.five_skew', 'DD.five.Shift.r_skew', 'UD.five.Shift.r_skew', 'H.Shift.r_skew', 'DD.Shift.r.o_skew', 'UD.Shift.r.o_skew', 'H.o_skew', 'DD.o.a_skew', 'UD.o.a_skew', 'H.a_skew', 'DD.a.n_skew', 'UD.a.n_skew', 'H.n_skew', 'DD.n.l_skew', 'UD.n.l_skew', 'H.l_skew', 'DD.l.Return_skew', 'UD.l.Return_skew', 'H.Return_skew', 'typing_speed_skew', 'digraph_mean_skew', 'digraph_variance_skew', 'trigraph_mean_skew', 'trigraph_variance_skew', 'error_rate_skew',
        'sessionIndex_kurtosis', 'rep_kurtosis', 'H.period_kurtosis', 'DD.period.t_kurtosis', 'UD.period.t_kurtosis', 'H.t_kurtosis', 'DD.t.i_kurtosis', 'UD.t.i_kurtosis', 'H.i_kurtosis', 'DD.i.e_kurtosis', 'UD.i.e_kurtosis', 'H.e_kurtosis', 'DD.e.five_kurtosis', 'UD.e.five_kurtosis', 'H.five_kurtosis', 'DD.five.Shift.r_kurtosis', 'UD.five.Shift.r_kurtosis', 'H.Shift.r_kurtosis', 'DD.Shift.r.o_kurtosis', 'UD.Shift.r.o_kurtosis', 'H.o_kurtosis', 'DD.o.a_kurtosis', 'UD.o.a_kurtosis', 'H.a_kurtosis', 'DD.a.n_kurtosis', 'UD.a.n_kurtosis', 'H.n_kurtosis', 'DD.n.l_kurtosis', 'UD.n.l_kurtosis', 'H.l_kurtosis', 'DD.l.Return_kurtosis', 'UD.l.Return_kurtosis', 'H.Return_kurtosis', 'typing_speed_kurtosis', 'digraph_mean_kurtosis', 'digraph_variance_kurtosis', 'trigraph_mean_kurtosis', 'trigraph_variance_kurtosis', 'error_rate_kurtosis'
]
# NOTE: This order MUST match the frontend src/utils/featureExtractors.ts exactly (length=245)

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
    # Robust error handling for missing/invalid student_id
    import re
    uuid_regex = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    if not student_id or not isinstance(student_id, str) or not uuid_regex.match(student_id):
        return jsonify({"error": "Missing or invalid student_id in payload"}), 400
    if not session_id or not isinstance(session_id, str):
        return jsonify({"error": "Missing session_id in payload"}), 400
    try:
        # --- Step 1: Fetch all 6 behavioral_metrics for this session ---
        res = supabase.table("behavioral_metrics").select("*").eq("calibration_session_id", session_id).eq("student_id", student_id).execute()
        rows = res.data or []
        if len(rows) != 6:
            return jsonify({"error": f"Expected 6 calibration records, got {len(rows)}"}), 400

        # --- Step 2: Isolate 39 base features ---
        # Each row: metrics.vector is a list of 245 features
        # The first 39 are the base features
        base_feature_samples = [[] for _ in range(39)]
        mouse_vectors = []
        for r in rows:
            metrics = r.get("metrics", {})
            vector = metrics.get("vector") if isinstance(metrics, dict) else None
            if not vector or len(vector) < 39:
                continue
            for i in range(39):
                base_feature_samples[i].append(vector[i])
            # Also collect mouse vector if present
            if r.get("metric_type") == "mouse":
                mvec = metrics.get("vector") if isinstance(metrics, dict) else None
                if mvec: mouse_vectors.append(mvec)

        # --- Step 3: Calculate aggregates for each base feature ---
        from scipy.stats import skew, kurtosis
        agg_vector = []
        for samples in base_feature_samples:
            arr = np.array(samples, dtype=float)
            mean = np.mean(arr)
            std = np.std(arr, ddof=1) if len(arr) > 1 else 0.0
            var = np.var(arr, ddof=1) if len(arr) > 1 else 0.0
            min_ = np.min(arr)
            max_ = np.max(arr)
            median = np.median(arr)
            skewness = skew(arr) if len(arr) > 2 else 0.0
            kurt = kurtosis(arr) if len(arr) > 3 else 0.0
            agg_vector.extend([mean, std, var, min_, max_, median, skewness, kurt])
        # --- Step 4: Assemble final 245-element vector ---
        # The first 39 are the means, next 39 std, ...
        # Already flattened in agg_vector order
        keystroke_vector = np.array(agg_vector, dtype=float).reshape(1, -1)
        mouse_vectors = np.array(mouse_vectors, dtype=float)
        if mouse_vectors.ndim == 1:
            mouse_vectors = mouse_vectors.reshape(1, -1)

        # --- Step 5: Pass through models ---
        ks_pred = float(keystroke_model.predict_proba(keystroke_vector)[0][1])
        ms_preds = mouse_model.predict_proba(mouse_vectors)[:, 1] if mouse_vectors.size else np.array([0.0]*len(rows))
        ms_pred = float(np.mean(ms_preds))

        # --- Step 6: Calculate threshold (μ−k⋅σ) ---
        fusion_score = (ks_pred + ms_pred) / 2.0
        fusion_std = float(np.std([ks_pred, ms_pred]))
        k = 1.25
        adaptive_threshold = float(max(0.2, min(0.95, fusion_score - k * fusion_std)))

        payload = {
            "student_id": student_id,
            "session_id": session_id,
            "fusion_threshold": adaptive_threshold,
            "mouse_threshold": ms_pred,
            "keystroke_threshold": ks_pred,
            "created_at": datetime.utcnow().isoformat()
        }
        print("[Calibration] Writing thresholds → ", payload)
        # --- Direct Supabase REST API upsert ---
        import requests
        SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
        SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        url = f"{SUPABASE_URL}/rest/v1/personal_thresholds"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        try:
            response = requests.post(url, headers=headers, json=payload)
            if response.status_code in (201, 200):
                print(f"Threshold for Student {student_id} inserted/updated successfully.")
            else:
                print(f"SUPABASE INSERT ERROR ({response.status_code}): {response.text}")
        except requests.RequestException as e:
            print(f"Network error during Supabase threshold insert: {e}")
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
                # --- KEYSTROKE FIX ---
                k_input_df = pd.DataFrame(k_scaled, columns=KEYSTROKE_FEATURE_NAMES)
                p_key = float(keystroke_model.predict_proba(k_input_df)[0][1])
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

        cheating = 1 if fusion_score < used_thresh else 0
        status = "flagged" if cheating else "normal"

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


from routes.threshold_route import threshold_bp
app.register_blueprint(threshold_bp, url_prefix='/calibration')

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
