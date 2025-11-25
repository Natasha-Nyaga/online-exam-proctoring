import joblib
from flask import Blueprint, request, jsonify
from utils.db_helpers import get_student_baseline, save_anomaly_record 
from utils.load_models import mouse_model, keystroke_model, mouse_rt_model, keystroke_rt_model
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
from utils.session_state import SESSION_FEATURE_HISTORY, ROLLING_WINDOW_SIZE

# Initialize the Blueprint
exam_bp = Blueprint('exam', __name__)

# Initialize extractors (must be consistent with calibration_routes)
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# --- Utility Feature Lists ---
KEYSTROKE_BASE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2'
]
MOUSE_BASE_FEATURES = [
    'inactive_duration', 'copy_cut', 'paste', 'double_click'
]

def normalize_features(feature_vector_raw, baseline_stats, feature_type='keystroke'):
    """Applies Z-score normalization to the feature vector using baseline stats."""
    baseline_detailed_stats = baseline_stats['stats'][feature_type]['detailed_stats']
    feature_keys = KEYSTROKE_BASE_FEATURES if feature_type == 'keystroke' else MOUSE_BASE_FEATURES

    if feature_type == 'keystroke':
        base_means = np.array([baseline_detailed_stats[key]['mean'] for key in feature_keys])
        base_stds = np.array([baseline_detailed_stats[key]['std'] for key in feature_keys])
        normalization_means = np.concatenate([base_means, base_means])
        normalization_stds = np.concatenate([base_stds, base_stds])
    else:
        normalization_means = np.array([baseline_detailed_stats[key]['mean'] for key in feature_keys])
        normalization_stds = np.array([baseline_detailed_stats[key]['std'] for key in feature_keys])
    epsilon = 1e-6
    feature_vector_normalized = (feature_vector_raw - normalization_means) / (normalization_stds + epsilon)
    return feature_vector_normalized

def calculate_fusion_score(k_score, m_score, v_score):
    """
    Placeholder for the Fusion Model.
    Combines the individual anomaly scores into a single risk probability.
    """
    # Simple weighted average example:
    fusion_score = (0.45 * k_score) + (0.45 * m_score) + (0.10 * v_score)
    return fusion_score

@exam_bp.route('/analyze_behavior', methods=['POST'])
def analyze_behavior():
    """
    Processes real-time keystroke and mouse data, applies personalized normalization, 
    predicts anomaly scores, and logs incidents if the personalized threshold is exceeded.
    """

    data = request.get_json()
    print("[DEBUG] Incoming /analyze_behavior request data:", data)

    student_id = data.get('student_id')
    exam_session_id = data.get('exam_session_id') or data.get('calibration_session_id')
    mouse_events = data.get('mouse_events', [])
    key_events = data.get('key_events', [])

    print(f"[ID CONSISTENCY] Received student_id: {student_id}")
    print(f"[ID CONSISTENCY] Received session_id: {exam_session_id}")
    print(f"[ID CONSISTENCY] mouse_events count: {len(mouse_events)}, key_events count: {len(key_events)}")

    if not all([student_id, exam_session_id]):
        print(f"[ERROR] Missing required identifiers. student_id: {student_id}, session_id: {exam_session_id}")
        return jsonify({"error": "Missing required identifiers (student/exam/calibration session ID)."}), 400

    try:
        # 1. Retrieve Personalized Baseline
        print(f"[DEBUG] Attempting to retrieve baseline for student_id: {student_id}")
        baseline = get_student_baseline(student_id)
        if not baseline:
            print(f"[DEBUG] No baseline found for student_id: {student_id}")
            return jsonify({
                "status": "no_baseline",
                "message": "Personalized baseline not found. Student must complete calibration.",
                "analysis": None
            }), 200

        baseline_stats = baseline['stats']
        personalized_threshold = baseline['system_threshold']
        try:
            k_detailed_stats = baseline_stats['keystroke']['detailed_stats']
            m_detailed_stats = baseline_stats['mouse']['detailed_stats']
        except KeyError as e:
            print(f"[FATAL ERROR] Could not access detailed_stats in baseline: {e}")
            return jsonify({"error": f"Baseline data is corrupted or incomplete: {e}"}), 500

        # --- Step 1: Raw Feature Extraction and History Update ---
        # Initialize session history if not present
        if exam_session_id not in SESSION_FEATURE_HISTORY:
            SESSION_FEATURE_HISTORY[exam_session_id] = {'keystroke': [], 'mouse': []}

        # Extract raw features (no normalization)
        k_features_raw_current, _ = KEYSTROKE_FE.extract_features(key_events, baseline_stats=None)
        m_features_raw_current, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)
        SESSION_FEATURE_HISTORY[exam_session_id]['keystroke'].append(k_features_raw_current)
        SESSION_FEATURE_HISTORY[exam_session_id]['mouse'].append(m_features_raw_current)


        # Convert history to numpy arrays
        k_history = np.array(SESSION_FEATURE_HISTORY[exam_session_id]['keystroke'])
        m_history = np.array(SESSION_FEATURE_HISTORY[exam_session_id]['mouse'])

        # Safeguard: Only run prediction if enough history is present
        if len(k_history) < 2 or len(m_history) < 2:
            return jsonify({
                "risk_score": 0.0,
                "message": "Gathering initial data points."
            }), 200

        # --- Keystroke Feature Aggregation (Exclude keystroke_count) ---
        # Separate latency features (columns 0-9) and keystroke_count (column 10)
        k_history_latency = k_history[:, :10]  # shape (N, 10)
        k_history_count = k_history[:, 10]    # shape (N,)

        # LTS Feature Vector (mean & std of all latency features)
        V_k_lts_raw_latency = np.concatenate([
            np.mean(k_history_latency, axis=0),
            np.std(k_history_latency, axis=0)
        ])  # shape (20,)
        V_k_lts = normalize_features(V_k_lts_raw_latency, baseline, feature_type='keystroke')
        print(f"DEBUG: V_k_lts shape (1D): {V_k_lts.shape}")
        V_k_lts_input = V_k_lts.reshape(1, -1)
        print(f"DEBUG: V_k_lts_input shape (2D): {V_k_lts_input.shape}")

        # RT Feature Vector (mean & std of last N latency windows)
        k_history_rt_latency = k_history_latency[-ROLLING_WINDOW_SIZE:]
        V_k_rt_raw_latency = np.concatenate([
            np.mean(k_history_rt_latency, axis=0),
            np.std(k_history_rt_latency, axis=0)
        ])  # shape (20,)
        V_k_rt = normalize_features(V_k_rt_raw_latency, baseline, feature_type='keystroke')
        V_k_rt_input = V_k_rt.reshape(1, -1)

        # Mouse LTS: sum of all history
        V_m_lts_raw = np.sum(m_history, axis=0)
        V_m_lts = normalize_features(V_m_lts_raw, baseline, feature_type='mouse')

        # Mouse RT: mean of last N windows
        m_history_rt = m_history[-ROLLING_WINDOW_SIZE:]
        V_m_rt_raw = np.mean(m_history_rt, axis=0)
        V_m_rt = normalize_features(V_m_rt_raw, baseline, feature_type='mouse')

        # --- Step 3: Dual Prediction and Hybrid Fusion ---
        # Reshape for model input
        V_k_rt_input = V_k_rt.reshape(1, -1)
        V_k_lts_input = V_k_lts.reshape(1, -1)
        V_m_rt_input = V_m_rt.reshape(1, -1)
        V_m_lts_input = V_m_lts.reshape(1, -1)

        # Get anomaly scores
        k_rt_score = float(keystroke_rt_model.predict_proba(V_k_rt_input)[0, 1]) if keystroke_rt_model is not None else 0.0
        k_lts_score = float(keystroke_model.predict_proba(V_k_lts_input)[0, 1]) if keystroke_model is not None else 0.0
        m_rt_score = float(mouse_rt_model.predict_proba(V_m_rt_input)[0, 1]) if mouse_rt_model is not None else 0.0
        m_lts_score = float(mouse_model.predict_proba(V_m_lts_input)[0, 1]) if mouse_model is not None else 0.0

        # Hybrid fusion
        def calculate_fusion_score_hybrid(k_rt, k_lts, m_rt, m_lts, v_score=0):
            return (0.30 * k_lts) + (0.15 * k_rt) + (0.30 * m_lts) + (0.15 * m_rt) + (0.10 * v_score)

        final_risk_score = calculate_fusion_score_hybrid(k_rt_score, k_lts_score, m_rt_score, m_lts_score, v_score=0)

        # Threshold check and incident logging
        incident_logged = False
        if final_risk_score >= personalized_threshold:
            incident_details = {
                "keystroke_rt_score": k_rt_score,
                "keystroke_lts_score": k_lts_score,
                "mouse_rt_score": m_rt_score,
                "mouse_lts_score": m_lts_score,
                "threshold_exceeded": float(personalized_threshold),
                "timestamp_end": data.get('end_timestamp')
            }
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=final_risk_score,
                incident_details=incident_details
            )

        # Respond to frontend
        return jsonify({
            "status": "analyzed",
            "analysis": {
                "keystroke_rt_score": k_rt_score,
                "keystroke_lts_score": k_lts_score,
                "mouse_rt_score": m_rt_score,
                "mouse_lts_score": m_lts_score,
                "fusion_risk_score": float(final_risk_score),
                "personalized_threshold": float(personalized_threshold),
                "incident_logged": incident_logged
            }
        }), 200

    except Exception as e:
        print(f"An error occurred during analysis: {e}")
        return jsonify({"error": "Internal server error during analysis."}), 500