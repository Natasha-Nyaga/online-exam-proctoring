import joblib
from flask import Blueprint, request, jsonify, Flask
from flask_cors import CORS
from utils.db_helpers import save_personalized_thresholds, get_student_baseline
from utils.load_models import mouse_model, keystroke_model
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
import pandas as pd
from utils.session_state import SESSION_FEATURE_HISTORY

# Initialize the Blueprint
calibration_bp = Blueprint('calibrate', __name__)

# Initialize extractors
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# --- Statistical Constants for Stability & Threshold Calculation ---
EPSILON = 1e-6          
MAX_Z_SCORE_CLIP = 10.0 
K_MAGNITUDE_FACTOR = 3.0 # Scaling factor to put Keystroke score into Anomaly Magnitude space
PERCENTILE_TOLERANCE = 98.0 # Use the 98th percentile of normal scores for the threshold

# --- Utility Feature Lists (must match the models) ---
# Note: Keystroke features include the standard deviation features as well (total 20)
KEYSTROKE_BASE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2'
]
KEYSTROKE_ALL_FEATURES = KEYSTROKE_BASE_FEATURES + [f'std_{f}' for f in KEYSTROKE_BASE_FEATURES]

MOUSE_BASE_FEATURES = [
    'inactive_duration', 'copy_cut', 'paste', 'double_click'
]

def normalize_features(feature_vector_raw, baseline_stats, feature_type='keystroke'):
    """Applies Z-score normalization (with stability and clipping) to the feature vector."""
    try:
        baseline_detailed_stats = baseline_stats['stats'][feature_type]['detailed_stats']
        feature_keys = KEYSTROKE_BASE_FEATURES if feature_type == 'keystroke' else MOUSE_BASE_FEATURES
        if feature_type == 'keystroke':
            base_means = np.array([float(baseline_detailed_stats.get(key, {}).get('mean', 0.0)) for key in KEYSTROKE_BASE_FEATURES])
            base_stds = np.array([float(baseline_detailed_stats.get(key, {}).get('std', 1.0)) for key in KEYSTROKE_BASE_FEATURES])
            normalization_means = np.concatenate([base_means, base_means])
            normalization_stds = np.concatenate([base_stds, base_stds])
        else:
            normalization_means = np.array([float(baseline_detailed_stats.get(key, {}).get('mean', 0.0)) for key in MOUSE_BASE_FEATURES])
            normalization_stds = np.array([float(baseline_detailed_stats.get(key, {}).get('std', 1.0)) for key in MOUSE_BASE_FEATURES])
        # Check for shape mismatch
        if feature_vector_raw.shape[0] != normalization_means.shape[0]:
            print(f"[ERROR] Feature vector shape {feature_vector_raw.shape} does not match normalization means shape {normalization_means.shape}")
            return np.zeros_like(normalization_means)
        feature_vector_normalized_stable = (feature_vector_raw - normalization_means) / (normalization_stds + EPSILON)
        feature_vector_normalized_clipped = np.clip(
            feature_vector_normalized_stable, 
            -MAX_Z_SCORE_CLIP, 
            MAX_Z_SCORE_CLIP
        )
        return feature_vector_normalized_clipped
    except Exception as e:
        print(f"[ERROR] Normalization failed: {e}")
        return np.zeros(20 if feature_type == 'keystroke' else 4)

def calculate_anomaly_magnitudes(k_lts_input, m_lts_input):
    """Calculates the anomaly risk magnitudes for Keystroke and Mouse features."""
    
    # Keystroke Score (XGBoost): Probability of Anomaly (0-1)
    try:
        k_prob_score = float(keystroke_model.predict_proba(k_lts_input)[0, 1]) if keystroke_model is not None else 0.0
        k_anomaly_magnitude = k_prob_score * K_MAGNITUDE_FACTOR
    except Exception as e:
        print(f"[ERROR] Keystroke model prediction failed: {e}")
        k_anomaly_magnitude = 0.0
    try:
        m_decision_score_raw = float(mouse_model.decision_function(m_lts_input)[0]) if mouse_model is not None else 0.0
        m_anomaly_magnitude = max(0.0, -m_decision_score_raw)
    except Exception as e:
        print(f"[ERROR] Mouse model prediction failed: {e}")
        try:
            m_prob_score = float(mouse_model.predict_proba(m_lts_input)[0, 1]) if mouse_model is not None else 0.0
            m_anomaly_magnitude = m_prob_score * K_MAGNITUDE_FACTOR
        except Exception as e2:
            print(f"[ERROR] Mouse model fallback prediction failed: {e2}")
            m_anomaly_magnitude = 0.0
    return k_anomaly_magnitude, m_anomaly_magnitude

@calibration_bp.route('/save-baseline', methods=['POST'])
def save_baseline():
    """
    Receives the final, full payload of raw events from the calibration phase, 
    calculates the personalized baseline statistics and threshold, and saves them.
    """
    data = request.get_json()
    student_id = data.get('student_id')
    calibration_session_id = data.get('calibration_session_id')
    course_name = data.get('course_name')
    keystroke_events = data.get('keystroke_events', [])
    mouse_events = data.get('mouse_events', [])

    if not student_id or not calibration_session_id or not course_name:
        return jsonify({"error": "Missing student ID, session ID, or course name."}), 400

    print(f"[BASELINE SAVE] Received data for student: {student_id}")

    # --- 1. Extract ALL Features from ALL Raw Events ---
    # We treat all collected data as one giant normal segment for baseline feature calculation.
    
    # Keystroke Feature Extraction
    try:
        k_features_raw_list, _ = KEYSTROKE_FE.extract_features_all(keystroke_events)
        if not k_features_raw_list or len(k_features_raw_list) == 0:
            return jsonify({"error": "Not enough keystroke data for baseline features."}), 400
        k_df = pd.DataFrame(k_features_raw_list, columns=KEYSTROKE_ALL_FEATURES)
        m_features_raw_list, _ = MOUSE_FE.extract_features_all(mouse_events)
        if not m_features_raw_list or len(m_features_raw_list) == 0:
            return jsonify({"error": "Not enough mouse data for baseline features."}), 400
        m_df = pd.DataFrame(m_features_raw_list, columns=MOUSE_BASE_FEATURES)
        # --- 2. Calculate FINAL Baseline Stats (Mean and Std Dev) ---
        k_final_stats = {}
        for col in k_df.columns:
            count = k_df[col].count()
            mean = float(k_df[col].mean()) if count > 0 else 0.0
            std = float(k_df[col].std(ddof=1)) if count > 1 else (float(mean) if count == 1 else 1.0)
            k_final_stats[col] = {'mean': mean, 'std': std}
        m_final_stats = {}
        for col in m_df.columns:
            count = m_df[col].count()
            mean = float(m_df[col].mean()) if count > 0 else 0.0
            std = float(m_df[col].std(ddof=1)) if count > 1 else (float(mean) if count == 1 else 1.0)
            m_final_stats[col] = {'mean': mean, 'std': std}
    except Exception as e:
        print(f"[ERROR] Baseline feature extraction or stats calculation failed: {e}")
        return jsonify({"error": "Baseline feature extraction or stats calculation failed."}), 500

    # Create a mock baseline dictionary structure for the normalization function
    final_baseline_stats_package = {
        'stats': {
            'keystroke': {'detailed_stats': k_final_stats},
            'mouse': {'detailed_stats': m_final_stats}
        }
    }

    # --- 3. Calculate Personalized Threshold from Anomaly Magnitudes ---
    k_mags = []
    m_mags = []
    
    # Iterate over all collected feature vectors to calculate anomaly scores
    for k_features_raw in k_features_raw_list:
        try:
            k_lts_input_array = normalize_features(np.array(k_features_raw), final_baseline_stats_package, feature_type='keystroke')
            k_lts_input = pd.DataFrame([k_lts_input_array], columns=KEYSTROKE_ALL_FEATURES)
            k_mag, _ = calculate_anomaly_magnitudes(k_lts_input, m_df.iloc[[0]])
            k_mags.append(k_mag)
        except Exception as e:
            print(f"[ERROR] Keystroke anomaly magnitude calculation failed for segment: {e}")
            continue
    for m_features_raw in m_features_raw_list:
        try:
            m_lts_input_array = normalize_features(np.array(m_features_raw), final_baseline_stats_package, feature_type='mouse')
            m_lts_input = pd.DataFrame([m_lts_input_array], columns=MOUSE_BASE_FEATURES)
            _, m_mag = calculate_anomaly_magnitudes(k_df.iloc[[0]], m_lts_input)
            m_mags.append(m_mag)
        except Exception as e:
            print(f"[ERROR] Mouse anomaly magnitude calculation failed for segment: {e}")
            continue

    # If the lists are empty or too small, fall back to a safe threshold
    if len(k_mags) < 5 or len(m_mags) < 5:
        personalized_threshold = 2.5
        print(f"[THRESHOLD] Fallback threshold used: {personalized_threshold}")
    else:
        # Calculate the 98th percentile of the student's NORMAL anomaly scores
        k_threshold_boundary = np.percentile(k_mags, PERCENTILE_TOLERANCE)
        m_threshold_boundary = np.percentile(m_mags, PERCENTILE_TOLERANCE)
        
        # Calculate the personalized fusion threshold (using 0.5 weights)
        personalized_threshold = (0.5 * k_threshold_boundary) + (0.5 * m_threshold_boundary)
        
        # Ensure the threshold is not too low
        personalized_threshold = max(1.5, personalized_threshold)
        
        print(f"[THRESHOLD] K Mag Boundary (98th %): {k_threshold_boundary}")
        print(f"[THRESHOLD] M Mag Boundary (98th %): {m_threshold_boundary}")
        print(f"[THRESHOLD] Calculated Personalized Threshold: {personalized_threshold}")

    # --- 4. Final Baseline Structure and Save to DB ---
    final_baseline = {
        "student_id": student_id,
        "stats": {
            "keystroke": {"detailed_stats": k_final_stats},
            "mouse": {"detailed_stats": m_final_stats},
        },
        "system_threshold": float(personalized_threshold)
    }

    save_personalized_thresholds(
        student_id=student_id,
        course_name=course_name,
        # The baseline stats object contains the mean/std for each feature
        baseline_stats=final_baseline_stats_package,
        # The personalized system threshold
        system_threshold=float(personalized_threshold)
    )

    return jsonify({
        "status": "baseline_saved", 
        "message": "Baseline successfully calculated and saved.",
        "threshold": float(personalized_threshold)
    }), 200

