import json
import numpy as np
from flask import Blueprint, request, jsonify
from utils.db_helpers import save_personalized_thresholds, create_calibration_session
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
# NOTE: MOUSE_MODEL and KEYSTROKE_MODEL are not needed here, only extractors

calibration_bp = Blueprint('calibration', __name__)

# Initialize extractors (must be consistent with exam_routes)
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

@calibration_bp.route('/start', methods=['POST'])
def start_calibration():
    """Endpoint to initiate a calibration session."""
    data = request.get_json()
    student_id = data.get('student_id')
    
    if not student_id:
        return jsonify({"error": "Missing student_id"}), 400
        
    session_id = create_calibration_session(student_id)
    
    if session_id:
        return jsonify({
            "status": "started", 
            "calibration_session_id": session_id
        }), 201
    else:
        return jsonify({"error": "Could not start calibration session"}), 500

@calibration_bp.route('/save-baseline', methods=['POST'])
def save_baseline():
    """
    Receives all raw calibration data, calculates the personalized feature baseline 
    (mean/std/threshold), and saves it to the personal_thresholds table.
    """
    data = request.get_json()
    
    student_id = data.get('student_id')
    session_id = data.get('calibration_session_id')
    raw_keystroke_events = data.get('keystroke_events', [])
    raw_mouse_events = data.get('mouse_events', [])
    
    if not all([student_id, session_id, raw_keystroke_events, raw_mouse_events]):
        return jsonify({"error": "Missing required data for baseline creation."}), 400

    try:
        # 1. Extract Features and Calculate Stats
        # The FE's return (features, stats) when baseline_stats=None
        k_features_vector, k_stats = KEYSTROKE_FE.extract_features(raw_keystroke_events, baseline_stats=None)
        m_features_vector, m_stats = MOUSE_FE.extract_features(raw_mouse_events, baseline_stats=None)
        
        # --- 2. Calculate Consolidated Baseline Statistics (Mean/STD of ALL features) ---
        
        # Combine all features into a single, consolidated dict
        baseline_stats = {
            'keystroke': k_stats,
            'mouse': m_stats
        }
        
        # --- 3. Compute Personalized Threshold (Crucial Step) ---
        
        # Placeholder for the actual threshold calculation logic.
        # This should ideally be based on anomaly scores from the calibration data.
        fusion_mean = 0.5 
        fusion_std = 0.1 
        
        # Set the personalized system threshold (e.g., Mean + 3 * Std Deviation)
        calculated_threshold = fusion_mean + (3 * fusion_std) 
        
        # --- 4. Save to Supabase ---
        success = save_personalized_thresholds(
            student_id=student_id,
            session_id=session_id,
            fusion_mean=fusion_mean,
            fusion_std=fusion_std,
            calculated_threshold=calculated_threshold,
            baseline_stats=baseline_stats
        )

        if success:
            return jsonify({
                "status": "baseline_saved", 
                "personalized_threshold": calculated_threshold,
                "message": "Calibration baseline saved successfully."
            }), 200
        else:
            return jsonify({"error": "Database error while saving baseline."}), 500

    except Exception as e:
        print(f"Error during baseline processing: {e}")
        return jsonify({"error": "Internal processing error."}), 500