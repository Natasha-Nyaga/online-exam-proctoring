# Real-time Cheating Detection Backend
# Flask + CORS + Supabase + ML models
# Implements calibration, prediction, buffered alerts, and personalized thresholds


import os
from dotenv import load_dotenv
from pathlib import Path
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime
import random

# Load environment variables from .env in project root
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

app = Flask(__name__)
CORS(app)

# Initialize Supabase client
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# Load models and scalers from .env or default paths
print("[Backend] Loading ML models...")
mouse_model = joblib.load(os.getenv("MOUSE_MODEL_PATH", "models/mouse_model.joblib"))
keystroke_model = joblib.load(os.getenv("KEYSTROKE_MODEL_PATH", "models/keystroke_model.joblib"))
mouse_scaler = joblib.load(os.getenv("MOUSE_SCALER_PATH", "models/scaler_mouse.joblib"))
keystroke_scaler = joblib.load(os.getenv("KEYSTROKE_SCALER_PATH", "models/scaler_keystroke.joblib"))
print("[Backend] ML models loaded successfully")

# Feature order definitions (must match frontend)
MOUSE_FEATURE_ORDER = [
    "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
    "click_frequency", "click_interval_mean", "click_ratio_per_question",
    "trajectory_smoothness", "path_curvature", "transition_time"
]

KEYSTROKE_FEATURE_ORDER = [
    "H.period", "DD.period.t", "UD.period.t", "H.t", "DD.t.i", "UD.t.i", "H.i",
    "DD.i.e", "UD.i.e", "H.e", "DD.e.five", "UD.e.five", "H.five",
    "DD.five.Shift.r", "UD.five.Shift.r", "H.Shift.r", "DD.Shift.r.o",
    "UD.Shift.r.o", "H.o", "DD.o.a", "UD.o.a", "H.a", "DD.a.n", "UD.a.n",
    "H.n", "DD.n.l", "UD.n.l", "H.l", "DD.l.Return", "UD.l.Return",
    "H.Return", "typing_speed", "digraph_mean", "digraph_variance",
    "trigraph_mean", "trigraph_variance", "error_rate"
]

# Fusion weights (optimized to minimize false positives)
MOUSE_WEIGHT = 0.45
KEYSTROKE_WEIGHT = 0.55

# Configurable threshold and simulation mode
DEFAULT_THRESHOLD = float(os.getenv("DEFAULT_THRESHOLD", "0.55"))
SIMULATION_MODE = os.getenv("SIMULATION_MODE", "off").lower() == "on"
def generate_simulated_features(mode="cheating"):
    """
    Generate simulated feature arrays for mouse and keystroke models.
    mode: "cheating" or "normal"
    Returns: mouse_features, keystroke_features (np.array shape (1, n_features))
    """
    # Mouse features
    if mode == "cheating":
        mouse = [
            random.uniform(500, 1200),   # path_length (spike)
            random.uniform(80, 200),     # avg_speed (spike)
            random.uniform(0, 2),        # idle_time
            random.uniform(0, 2),        # dwell_time
            random.uniform(0, 1),        # hover_time
            random.uniform(10, 30),      # click_frequency (spike)
            random.uniform(0.1, 0.5),    # click_interval_mean
            random.uniform(0, 1),        # click_ratio_per_question
            random.uniform(0.5, 1.5),    # trajectory_smoothness
            random.uniform(0, 1),        # path_curvature
            random.uniform(0, 1)         # transition_time
        ]
        keystroke = [
            *(random.uniform(0.1, 0.5) for _ in range(31)),
            random.uniform(8, 15),       # typing_speed (spike)
            random.uniform(0.1, 0.3),    # digraph_mean
            random.uniform(0.05, 0.2),   # digraph_variance
            random.uniform(0.1, 0.3),    # trigraph_mean
            random.uniform(0.05, 0.2),   # trigraph_variance
            random.uniform(0.1, 0.3)     # error_rate (spike)
        ]
    else:
        mouse = [
            random.uniform(100, 300),    # path_length
            random.uniform(10, 40),      # avg_speed
            random.uniform(0, 2),        # idle_time
            random.uniform(0, 2),        # dwell_time
            random.uniform(0, 1),        # hover_time
            random.uniform(1, 5),        # click_frequency
            random.uniform(0.2, 0.8),    # click_interval_mean
            random.uniform(0, 1),        # click_ratio_per_question
            random.uniform(0.2, 0.7),    # trajectory_smoothness
            random.uniform(0, 1),        # path_curvature
            random.uniform(0, 1)         # transition_time
        ]
        keystroke = [
            *(random.uniform(0.01, 0.15) for _ in range(31)),
            random.uniform(2, 6),        # typing_speed
            random.uniform(0.01, 0.08),  # digraph_mean
            random.uniform(0.01, 0.05),  # digraph_variance
            random.uniform(0.01, 0.08),  # trigraph_mean
            random.uniform(0.01, 0.05),  # trigraph_variance
            random.uniform(0.01, 0.05)   # error_rate
        ]
    return (
        np.array(mouse, dtype=float).reshape(1, -1),
        np.array(keystroke, dtype=float).reshape(1, -1)
    )

# Test mode: bypass scaling if models output constant probabilities
TEST_MODE_BYPASS_SCALING = False  # Set to True for debugging scaling issues

# Expected feature ranges (based on training data)
EXPECTED_RANGES = {
    "mouse": {
        "path_length": (800, 8000),
        "avg_speed": (1.5, 12.0),
        "click_frequency": (0.2, 2.0),
        "hover_time": (0.05, 1.5)
    },
    "keystroke": {
        "typing_speed": (1.8, 8.0),
        "digraph_mean": (100, 600),
        "error_rate": (0.01, 0.25)
    }
}

def get_user_threshold(student_id):
    """Fetch personalized threshold from database or return default"""
    if not supabase or not student_id:
        return DEFAULT_THRESHOLD
    
    try:
        # Query personal_thresholds for this student (most recent)
        result = supabase.table('personal_thresholds')\
            .select('threshold')\
            .eq('student_id', student_id)\
            .order('created_at', desc=True)\
            .limit(1)\
            .execute()
        
        if result.data and len(result.data) > 0:
            threshold = float(result.data[0]['threshold'])
            print(f"[Backend] Using personalized threshold {threshold:.3f} for student {student_id}")
            return threshold
        
        print(f"[Backend] No personalized threshold found for student {student_id}, using default")
        return DEFAULT_THRESHOLD
    except Exception as e:
        print(f"[Backend] Error fetching threshold: {e}")
        return DEFAULT_THRESHOLD

def extract_features_from_metrics(metrics, metric_type):
    """
    Extract ordered feature array from behavioral metrics.
    CRITICAL: Must match MOUSE_FEATURE_ORDER and KEYSTROKE_FEATURE_ORDER exactly.
    """
    if metric_type == 'mouse':
        # Extract features in exact order of MOUSE_FEATURE_ORDER
        cursor_positions = metrics.get('cursor_positions', [])
        click_positions = metrics.get('click_positions', [])
        hover_times = metrics.get('hover_times', [])
        
        # Calculate derived features
        path_length = 0.0
        if isinstance(cursor_positions, list) and len(cursor_positions) > 1:
            for i in range(1, len(cursor_positions)):
                if isinstance(cursor_positions[i], dict) and isinstance(cursor_positions[i-1], dict):
                    dx = cursor_positions[i].get('x', 0) - cursor_positions[i-1].get('x', 0)
                    dy = cursor_positions[i].get('y', 0) - cursor_positions[i-1].get('y', 0)
                    path_length += np.sqrt(dx**2 + dy**2)
        
        avg_speed = float(metrics.get('movement_speed', 0) or 0)
        click_freq = float(metrics.get('click_frequency', 0) or 0)
        trajectory_smooth = float(metrics.get('trajectory_smoothness', 0) or 0)
        acceleration = float(metrics.get('acceleration', 0) or 0)
        
        # Compute hover time stats
        avg_hover = 0.0
        if isinstance(hover_times, list) and len(hover_times) > 0:
            hover_vals = [h.get('duration', 0) if isinstance(h, dict) else 0 for h in hover_times]
            avg_hover = np.mean(hover_vals) if hover_vals else 0.0
        
        # Click interval mean
        click_interval_mean = 0.0
        if isinstance(click_positions, list) and len(click_positions) > 1:
            intervals = []
            for i in range(1, len(click_positions)):
                if isinstance(click_positions[i], dict) and isinstance(click_positions[i-1], dict):
                    t1 = click_positions[i-1].get('timestamp', 0)
                    t2 = click_positions[i].get('timestamp', 0)
                    if t2 > t1:
                        intervals.append(t2 - t1)
            click_interval_mean = np.mean(intervals) if intervals else 0.0
        
        # Build feature array in exact order
        features = [
            path_length,                    # path_length
            avg_speed,                      # avg_speed
            0.0,                            # idle_time (placeholder)
            0.0,                            # dwell_time (placeholder)
            avg_hover,                      # hover_time
            click_freq,                     # click_frequency
            click_interval_mean,            # click_interval_mean
            0.0,                            # click_ratio_per_question (placeholder)
            trajectory_smooth,              # trajectory_smoothness
            0.0,                            # path_curvature (placeholder)
            0.0                             # transition_time (placeholder)
        ]
        
        return np.array(features, dtype=float).reshape(1, -1)
    
    elif metric_type == 'keystroke':
        dwell_times = metrics.get('dwell_times', {})
        flight_times = metrics.get('flight_times', {})
        typing_speed = float(metrics.get('typing_speed', 0) or 0)
        error_rate = float(metrics.get('error_rate', 0) or 0)
        
        # Extract dwell and flight time lists
        dwell_list = list(dwell_times.values()) if isinstance(dwell_times, dict) else []
        flight_list = list(flight_times.values()) if isinstance(flight_times, dict) else []
        
        # Build feature array matching KEYSTROKE_FEATURE_ORDER
        # Most features are digraph/trigraph timings (H, DD, UD patterns)
        # We'll approximate with available data
        features = [0.0] * len(KEYSTROKE_FEATURE_ORDER)
        
        # Fill in known positions
        features[31] = typing_speed              # typing_speed
        features[36] = error_rate                # error_rate
        
        # Fill digraph stats
        if dwell_list:
            features[32] = np.mean(dwell_list)   # digraph_mean
            features[33] = np.var(dwell_list) if len(dwell_list) > 1 else 0.0  # digraph_variance
        
        if flight_list:
            features[34] = np.mean(flight_list)  # trigraph_mean
            features[35] = np.var(flight_list) if len(flight_list) > 1 else 0.0  # trigraph_variance
        
        # For H (hold), DD (down-down), UD (up-down) patterns: use approximations
        # This is simplified - ideally we'd track specific key pairs
        for i in range(31):  # Fill first 31 features with patterns
            if i % 3 == 0 and dwell_list:  # H patterns
                features[i] = dwell_list[i // 3] if i // 3 < len(dwell_list) else 0.0
            elif i % 3 == 1 and flight_list:  # DD patterns
                features[i] = flight_list[i // 3] if i // 3 < len(flight_list) else 0.0
            elif i % 3 == 2 and flight_list:  # UD patterns
                features[i] = flight_list[i // 3] if i // 3 < len(flight_list) else 0.0
        
        return np.array(features, dtype=float).reshape(1, -1)
    
    return None

def log_cheating_incident(session_id, fusion_score, mouse_features, keystroke_features, mouse_prob, keystroke_prob):
    """Log cheating incident to Supabase"""
    if not supabase or not session_id:
        return
    
    try:
        # Determine severity based on fusion score
        if fusion_score >= 0.8:
            severity = "high"
        elif fusion_score >= 0.65:
            severity = "medium"
        else:
            severity = "low"
        
        # Prepare metadata
        metadata = {
            "fusion_score": float(fusion_score),
            "mouse_probability": float(mouse_prob),
            "keystroke_probability": float(keystroke_prob),
            "mouse_features": mouse_features.tolist()[0] if hasattr(mouse_features, 'tolist') else mouse_features,
            "keystroke_features": keystroke_features.tolist()[0] if hasattr(keystroke_features, 'tolist') else keystroke_features,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Insert incident
        supabase.table('cheating_incidents').insert({
            "session_id": session_id,
            "incident_type": "behavioural_anomaly",
            "severity": severity,
            "description": f"ML-detected anomaly with fusion score {fusion_score:.3f}",
            "metadata": metadata
        }).execute()
        
        print(f"[Backend] Logged cheating incident for session {session_id} (severity: {severity})")
    except Exception as e:
        print(f"[Backend] Error logging incident: {e}")

@app.route("/predict", methods=["POST"])
def predict():
    """
    Real-time cheating prediction endpoint with comprehensive debug logging.
    Accepts mouse and keystroke features, returns fusion score and cheating prediction.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Simulation mode: inject cheating or normal patterns
        simulation = data.get("simulation_mode", None)
        if SIMULATION_MODE or simulation in ["cheating", "normal"]:
            sim_type = simulation if simulation in ["cheating", "normal"] else "cheating"
            print(f"[Backend] SIMULATION MODE ACTIVE: {sim_type}")
            mouse_features, keystroke_features = generate_simulated_features(sim_type)
            student_id = data.get("student_id") or "SIM_USER"
            session_id = data.get("session_id") or "SIM_SESSION"
        else:
            # Extract features from request
            mouse_features_dict = data.get("mouse_features", {})
            keystroke_features_dict = data.get("keystroke_features", {})
            student_id = data.get("student_id")
            session_id = data.get("session_id")

            print(f"\n{'='*60}")
            print(f"[Backend] NEW PREDICTION REQUEST")
            print(f"[Backend] Student: {student_id}, Session: {session_id}")
            print(f"[Backend] Received feature keys:")
            print(f"  Mouse keys: {list(mouse_features_dict.keys())}")
            print(f"  Keystroke keys: {list(keystroke_features_dict.keys())}")

            # Convert feature dictionaries to ordered arrays
            mouse_features = np.array([
                float(mouse_features_dict.get(f, 0.0)) for f in MOUSE_FEATURE_ORDER
            ]).reshape(1, -1)

            keystroke_features = np.array([
                float(keystroke_features_dict.get(f, 0.0)) for f in KEYSTROKE_FEATURE_ORDER
            ]).reshape(1, -1)

        print(f"[Backend] Raw feature arrays:")
        print(f"  Mouse shape: {mouse_features.shape}, sum: {np.sum(mouse_features):.4f}")
        print(f"  Mouse values (first 5): {mouse_features[0][:5]}")
        print(f"  Keystroke shape: {keystroke_features.shape}, sum: {np.sum(keystroke_features):.4f}")
        print(f"  Keystroke values (first 5): {keystroke_features[0][:5]}")

        # Validate model/scaler shapes
        expected_mouse_features = mouse_scaler.n_features_in_
        expected_keystroke_features = keystroke_scaler.n_features_in_

=======
=======
        if mouse_features.shape[1] != expected_mouse_features:
            print(f"[Backend] WARNING: Mouse feature count mismatch! Expected {expected_mouse_features}, got {mouse_features.shape[1]}")
        if keystroke_features.shape[1] != expected_keystroke_features:
            print(f"[Backend] WARNING: Keystroke feature count mismatch! Expected {expected_keystroke_features}, got {keystroke_features.shape[1]}")

        # Flexible idle detection and debug logging
        mouse_sum = np.sum(np.abs(mouse_features))
        keystroke_sum = np.sum(np.abs(keystroke_features))
        print(f"[Backend] Feature activity check:")
        print(f"  Mouse sum: {mouse_sum:.6f}")
        print(f"  Keystroke sum: {keystroke_sum:.6f}")
        # More flexible: allow one modality to be active
        if mouse_sum < 0.0001 and keystroke_sum < 0.0001:
            print(f"[Backend] IDLE STATE - Both modalities inactive (sums < 0.0001)")
            print(f"{'='*60}\n")
            return jsonify({
                "fusion_score": 0.0,
                "cheating_prediction": 0,
                "user_threshold": DEFAULT_THRESHOLD,
                "mouse_probability": 0.0,
                "keystroke_probability": 0.0,
                "status": "idle"
            })
        # Warn if only one modality is active
        if mouse_sum < 0.0001:
            print(f"[Backend] WARNING: Mouse features near zero, using keystroke only")
        if keystroke_sum < 0.0001:
            print(f"[Backend] WARNING: Keystroke features near zero, using mouse only")
        # Scale features (or bypass in test mode)
        if TEST_MODE_BYPASS_SCALING:
            print(f"[Backend] TEST MODE: Bypassing scaling for debugging")
            mouse_scaled = mouse_features
            keystroke_scaled = keystroke_features
        else:
            mouse_scaled = mouse_scaler.transform(mouse_features)
            keystroke_scaled = keystroke_scaler.transform(keystroke_features)
        print(f"[Backend] Scaled features:")
        print(f"  Mouse scaled (first 5): {mouse_scaled[0][:5]}")
        print(f"  Mouse scaled min/max: [{np.min(mouse_scaled):.4f}, {np.max(mouse_scaled):.4f}]")
        print(f"  Keystroke scaled (first 5): {keystroke_scaled[0][:5]}")
        print(f"  Keystroke scaled min/max: [{np.min(keystroke_scaled):.4f}, {np.max(keystroke_scaled):.4f}]")
        # Get predictions from both models
        p_mouse = mouse_model.predict_proba(mouse_scaled)[0][1]
        p_keystroke = keystroke_model.predict_proba(keystroke_scaled)[0][1]
        print(f"[Backend] Individual model probabilities:")
        print(f"  Mouse probability: {p_mouse:.4f}")
        print(f"  Keystroke probability: {p_keystroke:.4f}")
        # SAFEGUARD: Detect if models output constant probabilities
        if abs(p_mouse - 0.5) < 0.01 and abs(p_keystroke - 0.5) < 0.01:
            print(f"[Backend] WARNING: Both models near 0.5 - possible scaling/feature issue!")
            print(f"[Backend] TIP: Set TEST_MODE_BYPASS_SCALING=True to debug")
        # Fusion: weighted average optimized to minimize false positives
        fusion_score = (MOUSE_WEIGHT * p_mouse) + (KEYSTROKE_WEIGHT * p_keystroke)

        print(f"[Backend] Fusion calculation:")
        print(f"  ({MOUSE_WEIGHT} * {p_mouse:.4f}) + ({KEYSTROKE_WEIGHT} * {p_keystroke:.4f}) = {fusion_score:.4f}")

        # Get adaptive threshold for this user
        user_threshold = get_user_threshold(student_id)

        # If model outputs are too low overall, lower the threshold
        if fusion_score < 0.45 and user_threshold > 0.45:
            print(f"[Backend] Lowering threshold to 0.45 due to low fusion score")
            user_threshold = 0.45

        # Define gray zone boundaries
        GRAY_ZONE_MARGIN = 0.05
        lower_bound = user_threshold - GRAY_ZONE_MARGIN
        upper_bound = user_threshold + GRAY_ZONE_MARGIN

        # Determine prediction status with gray zone
        if fusion_score > upper_bound:
            cheating_prediction = 1
            status = "flagged"
        elif fusion_score > lower_bound:
            cheating_prediction = 0
            status = "suspicious"
        else:
            cheating_prediction = 0
            status = "normal"

        print(f"[Backend] FINAL RESULT:")
        print(f"  Fusion Score: {fusion_score:.4f}")
        print(f"  User Threshold: {user_threshold:.4f}")
        print(f"  Gray Zone: [{lower_bound:.4f}, {upper_bound:.4f}]")
        print(f"  Status: {status.upper()}")
        print(f"  Cheating Prediction: {cheating_prediction} ({'FLAGGED' if cheating_prediction else 'NOT FLAGGED'})")
        print(f"{'='*60}\n")

        # Log to Supabase if cheating detected
        if cheating_prediction == 1 and session_id:
            log_cheating_incident(
                session_id=session_id,
                fusion_score=fusion_score,
                mouse_features=mouse_features,
                keystroke_features=keystroke_features,
                mouse_prob=p_mouse,
                keystroke_prob=p_keystroke
            )

        return jsonify({
            "fusion_score": float(fusion_score),
            "cheating_prediction": cheating_prediction,
            "user_threshold": float(user_threshold),
            "mouse_probability": float(p_mouse),
            "keystroke_probability": float(p_keystroke),
            "status": status
        })
    except Exception as e:
        print(f"[Backend] PREDICTION ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/calibration/compute-threshold", methods=["POST"])
def compute_threshold():
    """
    Compute personalized threshold from calibration session data.
    NOW PROPERLY COMPUTES FUSED SCORES from both models when available.
    """
    try:
        data = request.get_json()
        student_id = data.get("student_id")
        session_id = data.get("calibration_session_id")
        
        if not student_id or not session_id:
            return jsonify({"error": "Missing student_id or calibration_session_id"}), 400
        
        print(f"\n{'='*60}")
        print(f"[Calibration] Computing threshold for student {student_id}")
        print(f"[Calibration] Session: {session_id}")
        
        # Fetch all behavioral metrics for this calibration session
        result = supabase.table('behavioral_metrics')\
            .select('*')\
            .eq('calibration_session_id', session_id)\
            .eq('student_id', student_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            print(f"[Calibration] ERROR: No metrics found")
            return jsonify({"error": "No calibration metrics found"}), 404
        
        print(f"[Calibration] Found {len(result.data)} calibration metrics")
        
        # Group metrics by question_index to pair mouse + keystroke
        metrics_by_question = {}
        for metric in result.data:
            q_idx = metric.get('question_index')
            if q_idx not in metrics_by_question:
                metrics_by_question[q_idx] = {'mouse': None, 'keystroke': None}
            
            metric_type = metric.get('metric_type')
            if metric_type in ['mouse', 'keystroke']:
                metrics_by_question[q_idx][metric_type] = metric
        
        print(f"[Calibration] Grouped into {len(metrics_by_question)} question samples")
        
        # Compute fusion scores for each paired sample
        fusion_scores = []
        
        for q_idx, pair in metrics_by_question.items():
            mouse_metric = pair['mouse']
            keystroke_metric = pair['keystroke']
            
            p_mouse = None
            p_keystroke = None
            
            # Get mouse prediction
            if mouse_metric:
                try:
                    mouse_features = extract_features_from_metrics(mouse_metric, 'mouse')
                    if mouse_features is not None and np.sum(np.abs(mouse_features)) > 0.001:
                        mouse_scaled = mouse_scaler.transform(mouse_features)
                        p_mouse = mouse_model.predict_proba(mouse_scaled)[0][1]
                except Exception as e:
                    print(f"[Calibration] Warning: Mouse feature extraction failed for Q{q_idx}: {e}")
            
            # Get keystroke prediction
            if keystroke_metric:
                try:
                    keystroke_features = extract_features_from_metrics(keystroke_metric, 'keystroke')
                    if keystroke_features is not None and np.sum(np.abs(keystroke_features)) > 0.001:
                        keystroke_scaled = keystroke_scaler.transform(keystroke_features)
                        p_keystroke = keystroke_model.predict_proba(keystroke_scaled)[0][1]
                except Exception as e:
                    print(f"[Calibration] Warning: Keystroke feature extraction failed for Q{q_idx}: {e}")
            
            # Compute fused score
            if p_mouse is not None and p_keystroke is not None:
                # Best case: both models available, use weighted fusion
                fusion = (MOUSE_WEIGHT * p_mouse) + (KEYSTROKE_WEIGHT * p_keystroke)
                fusion_scores.append(fusion)
                print(f"[Calibration] Q{q_idx}: mouse={p_mouse:.3f}, keystroke={p_keystroke:.3f}, fusion={fusion:.3f}")
            elif p_mouse is not None:
                # Only mouse available
                fusion_scores.append(p_mouse)
                print(f"[Calibration] Q{q_idx}: mouse={p_mouse:.3f} (keystroke N/A)")
            elif p_keystroke is not None:
                # Only keystroke available
                fusion_scores.append(p_keystroke)
                print(f"[Calibration] Q{q_idx}: keystroke={p_keystroke:.3f} (mouse N/A)")
        
        if len(fusion_scores) == 0:
            print(f"[Calibration] ERROR: No valid fusion scores computed")
            return jsonify({"error": "Could not compute any valid predictions"}), 400
        
        # Compute statistics
        fusion_mean = float(np.mean(fusion_scores))
        fusion_std = float(np.std(fusion_scores))
        fusion_min = float(np.min(fusion_scores))
        fusion_max = float(np.max(fusion_scores))
        
        # Compute adaptive threshold: mean + 1.25 * std (more sensitive than 2*std)
        # Cap between 0.35 and 0.85 for wider dynamic range
        adaptive_threshold = fusion_mean + (1.25 * fusion_std)
        adaptive_threshold = min(adaptive_threshold, 0.85)  # Cap at 0.85
        adaptive_threshold = max(adaptive_threshold, 0.35)  # Floor at 0.35 (wider range)
        
        print(f"[Calibration] Statistics:")
        print(f"  Samples: {len(fusion_scores)}")
        print(f"  Mean: {fusion_mean:.4f}")
        print(f"  Std Dev: {fusion_std:.4f}")
        print(f"  Min Score: {fusion_min:.4f}")
        print(f"  Max Score: {fusion_max:.4f}")
        print(f"  Score Range Width: {fusion_max - fusion_min:.4f}")
        print(f"  Adaptive Threshold: {adaptive_threshold:.4f}")
        print(f"  Formula: min(max({fusion_mean:.4f} + 1.25*{fusion_std:.4f}, 0.35), 0.85)")
        
        # Warn if scores are in narrow band (possible scaling issue)
        score_range = fusion_max - fusion_min
        if score_range < 0.1:
            print(f"[Calibration] WARNING: Narrow score range ({score_range:.4f}) - check feature extraction!")
        if fusion_mean > 0.9 or fusion_mean < 0.1:
            print(f"[Calibration] WARNING: Extreme mean ({fusion_mean:.4f}) - possible data issue!")
        
        # Store in database
        supabase.table('personal_thresholds').insert({
            "student_id": student_id,
            "calibration_session_id": session_id,
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": adaptive_threshold
        }).execute()
        
        print(f"[Calibration] SUCCESS: Stored personalized threshold")
        print(f"{'='*60}\n")
        
        return jsonify({
            "status": "success",
            "fusion_mean": fusion_mean,
            "fusion_std": fusion_std,
            "threshold": adaptive_threshold,
            "samples_processed": len(fusion_scores)
        }), 200
        
    except Exception as e:
        print(f"[Calibration] FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)