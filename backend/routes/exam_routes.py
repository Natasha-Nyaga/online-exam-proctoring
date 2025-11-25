import joblib
from flask import Blueprint, request, jsonify
from utils.db_helpers import get_student_baseline, save_anomaly_record 
from utils.load_models import mouse_model, keystroke_model
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
import pandas as pd
from utils.session_state import SESSION_FEATURE_HISTORY

# Initialize the Blueprint
exam_bp = Blueprint('exam', __name__)

# Initialize extractors (must be consistent with calibration_routes)
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# --- Statistical Constants for Stability ---
EPSILON = 1e-6          # Laplace smoothing constant for stability
MAX_Z_SCORE_CLIP = 10.0 # Maximum Z-score magnitude allowed into the ML model

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
    """Applies Z-score normalization (with stability and clipping) to the feature vector."""
    baseline_detailed_stats = baseline_stats['stats'][feature_type]['detailed_stats']
    feature_keys = KEYSTROKE_BASE_FEATURES if feature_type == 'keystroke' else MOUSE_BASE_FEATURES

    if feature_type == 'keystroke':
        base_means = np.array([baseline_detailed_stats.get(key, {}).get('mean', 0.0) for key in feature_keys])
        base_stds = np.array([baseline_detailed_stats.get(key, {}).get('std', 1.0) for key in feature_keys])
        
        # Keystroke features include both mean and std metrics, hence the concatenation
        normalization_means = np.concatenate([base_means, base_means])
        normalization_stds = np.concatenate([base_stds, base_stds])
    else:
        normalization_means = np.array([baseline_detailed_stats.get(key, {}).get('mean', 0.0) for key in feature_keys])
        normalization_stds = np.array([baseline_detailed_stats.get(key, {}).get('std', 1.0) for key in feature_keys])
        
    # --- Fix 1: Laplace Smoothing (Already present, kept for stability) ---
    feature_vector_normalized_stable = (feature_vector_raw - normalization_means) / (normalization_stds + EPSILON)
    
    # --- Fix 2: Z-Score Clipping (CRITICAL FIX) ---
    # Prevents extreme outliers (e.g., 10000) from breaking the ML model.
    feature_vector_normalized_clipped = np.clip(
        feature_vector_normalized_stable, 
        -MAX_Z_SCORE_CLIP, 
        MAX_Z_SCORE_CLIP
    )
    
    return feature_vector_normalized_clipped

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

        print(f"[BASELINE CHECK] Baseline found for student_id: {student_id}: {baseline}") # Log full baseline for debug
        
        baseline_stats = baseline['stats']
        personalized_threshold = baseline.get('system_threshold', 2.0) # Default to 2.0 if not found
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
        # Convert to dict if returned as list
        if isinstance(k_features_raw_current, list):
            k_features_raw_current = dict(zip(KEYSTROKE_BASE_FEATURES + [f'std_{f}' for f in KEYSTROKE_BASE_FEATURES], k_features_raw_current))
        if isinstance(m_features_raw_current, list):
            m_features_raw_current = dict(zip(MOUSE_BASE_FEATURES, m_features_raw_current))
        SESSION_FEATURE_HISTORY[exam_session_id]['keystroke'].append(k_features_raw_current)
        SESSION_FEATURE_HISTORY[exam_session_id]['mouse'].append(m_features_raw_current)

        # Convert history to pandas DataFrames
        k_history_df = pd.DataFrame(SESSION_FEATURE_HISTORY[exam_session_id]['keystroke'])
        m_history_df = pd.DataFrame(SESSION_FEATURE_HISTORY[exam_session_id]['mouse'])

        # Safeguard: Only run prediction if enough history is present
        if len(k_history_df) < 2 or len(m_history_df) < 2:
            return jsonify({
                "risk_score": 0.0,
                "message": "Gathering initial data points."
            }), 200

        # --- Step 2: Prepare LTS Model Inputs ---
        # Normalize current features using personalized baseline
        k_feature_names = KEYSTROKE_BASE_FEATURES + [f'std_{f}' for f in KEYSTROKE_BASE_FEATURES]
        k_features_raw_array = np.array([k_features_raw_current.get(f, 0.0) for f in k_feature_names])
        m_features_raw_array = np.array([m_features_raw_current.get(f, 0.0) for f in MOUSE_BASE_FEATURES])
        
        # Pass baseline_stats['keystroke']['detailed_stats'] and baseline_stats['mouse']['detailed_stats'] to normalization
        k_lts_input_array = normalize_features(k_features_raw_array, {'stats': {'keystroke': {'detailed_stats': k_detailed_stats}}}, feature_type='keystroke')
        k_lts_input = pd.DataFrame([k_lts_input_array], columns=k_feature_names)
        
        m_lts_input_array = normalize_features(m_features_raw_array, {'stats': {'mouse': {'detailed_stats': m_detailed_stats}}}, feature_type='mouse')
        m_lts_input = pd.DataFrame([m_lts_input_array], columns=MOUSE_BASE_FEATURES)

        # Print the final, stabilized, and clipped Z-scores being fed into the model
        print(f"[MODEL INPUT] Stabilized and Clipped Keystroke Z-Scores (First 5): {k_lts_input_array[:5]}")
        print(f"[MODEL INPUT] Stabilized and Clipped Mouse Z-Scores: {m_lts_input_array}")

        # Get anomaly scores using pipeline directly
        k_lts_score = float(keystroke_model.predict_proba(k_lts_input)[0, 1]) if keystroke_model is not None else 0.0
        
        # For SVM, use decision_function (or predict_proba if available)
        try:
            m_lts_score = float(mouse_model.decision_function(m_lts_input)[0]) if mouse_model is not None else 0.0
        except AttributeError:
            m_lts_score = float(mouse_model.predict_proba(m_lts_input)[0, 1]) if mouse_model is not None else 0.0

        # Fusion score (simple average)
        # Note: Fusion score calculation should typically include a proper sigmoid/scaling of the SVM decision function output (m_lts_score)
        fusion_score = (0.5 * k_lts_score) + (0.5 * m_lts_score)

        # Threshold check and incident logging
        incident_logged = False
        if fusion_score >= personalized_threshold:
            incident_details = {
                "keystroke_lts_score": k_lts_score,
                "mouse_lts_score": m_lts_score,
                "threshold_exceeded": float(personalized_threshold),
                "timestamp_end": data.get('end_timestamp')
            }
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=fusion_score,
                incident_details=incident_details
            )

        # Count cheating incidents for this session
        from utils.db_helpers import supabase
        incident_count = 0
        try:
            response = supabase.table('cheating_incidents').select('id').eq('session_id', exam_session_id).execute()
            if hasattr(response, 'data') and response.data:
                incident_count = len(response.data)
        except Exception as e:
            print(f"[ERROR] Could not count cheating incidents: {e}")

        # Respond to frontend
        return jsonify({
            "status": "analyzed",
            "analysis": {
                "keystroke_lts_score": k_lts_score,
                "mouse_lts_score": m_lts_score,
                "fusion_risk_score": float(fusion_score),
                "personalized_threshold": float(personalized_threshold),
                "incident_logged": incident_logged,
                "cheating_incident_count": incident_count
            }
        }), 200

    except Exception as e:
        print(f"An error occurred during analysis: {e}")
        return jsonify({"error": "Internal server error during analysis."}), 500