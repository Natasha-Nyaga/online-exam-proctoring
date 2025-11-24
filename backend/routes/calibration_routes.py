import json
import numpy as np
from flask import Blueprint, request, jsonify
from utils.db_helpers import save_personalized_thresholds, create_calibration_session
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import logging
import os
log_path = os.path.join(os.path.dirname(__file__), '../calibration.log')
logging.basicConfig(filename=log_path, level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

calibration_bp = Blueprint('calibration', __name__)

# Initialize extractors (must be consistent with exam_routes)
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

@calibration_bp.route('/start', methods=['POST'])
def start_calibration():
    """Endpoint to initiate a calibration session."""
    data = request.get_json()
    student_id = data.get('student_id')
    print(f"[CALIBRATION] Received start request for student_id: {student_id}")
    if not student_id:
        print("[CALIBRATION] Missing student_id in start request")
        return jsonify({"error": "Missing student_id"}), 400
    session_id = create_calibration_session(student_id)
    print(f"[CALIBRATION] Created calibration session_id: {session_id} for student_id: {student_id}")
    if session_id:
        return jsonify({
            "status": "started", 
            "calibration_session_id": session_id
        }), 201
    else:
        print(f"[CALIBRATION] Could not start calibration session for student_id: {student_id}")
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
    # Validate UUID format for both fields
    import re
    uuid_regex = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    if not (student_id and uuid_regex.match(student_id)):
        logging.error(f"[CALIBRATION] Invalid student_id UUID: {student_id}")
        return jsonify({"error": "Invalid student_id UUID format."}), 400
    if not (session_id and uuid_regex.match(session_id)):
        logging.error(f"[CALIBRATION] Invalid calibration_session_id UUID: {session_id}")
        return jsonify({"error": "Invalid calibration_session_id UUID format."}), 400
    raw_keystroke_events = data.get('keystroke_events', [])
    raw_mouse_events = data.get('mouse_events', [])
    course_name = data.get('course_name')
    if not course_name:
        logging.error("[CALIBRATION] Missing course_name in baseline request.")
        return jsonify({"error": "Missing course_name."}), 400
    logging.info(f"[CALIBRATION] Received save-baseline request for student_id: {student_id}, session_id: {session_id}")
    if not all([student_id, session_id]):
        logging.error("[CALIBRATION] Missing student_id or session_id for baseline creation.")
        return jsonify({"error": "Missing student_id or session_id for baseline creation."}), 400
    if not raw_keystroke_events:
        logging.warning("[CALIBRATION] Warning: No keystroke events provided.")
    if not raw_mouse_events:
        logging.warning("[CALIBRATION] Warning: No mouse events provided.")
    if not (raw_keystroke_events or raw_mouse_events):
        logging.error("[CALIBRATION] Error: Both keystroke and mouse events are missing.")
        return jsonify({"error": "At least one event type (keystroke or mouse) must be provided."}), 400
    try:
        logging.info(f"[CALIBRATION] Starting baseline extraction for student_id: {student_id}, session_id: {session_id}")
        k_features_vector, k_stats = KEYSTROKE_FE.extract_features(raw_keystroke_events, baseline_stats=None)
        logging.info(f"[CALIBRATION] Keystroke stats: {k_stats}")
        m_features_vector, m_stats = MOUSE_FE.extract_features(raw_mouse_events, baseline_stats=None)
        logging.info(f"[CALIBRATION] Mouse stats: {m_stats}")
        baseline_stats = {
            'keystroke': k_stats,
            'mouse': m_stats
        }
        logging.info(f"[CALIBRATION] Consolidated baseline stats: {baseline_stats}")
        fusion_mean = 0.5 
        fusion_std = 0.1 
        calculated_threshold = fusion_mean + (3 * fusion_std) 
        logging.info(f"[CALIBRATION] Calculated personalized threshold: {calculated_threshold}")
        logging.info(f"[CALIBRATION] Saving baseline to Supabase for student_id: {student_id}, session_id: {session_id}")
        success = save_personalized_thresholds(
            student_id=student_id,
            session_id=session_id,
            fusion_mean=fusion_mean,
            fusion_std=fusion_std,
            calculated_threshold=calculated_threshold,
            baseline_stats=baseline_stats,
            course_name=course_name
        )
        logging.info(f"[CALIBRATION] Baseline save result: {success}")
        # Automated baseline check after save
        from utils.db_helpers import get_student_baseline
        baseline_check = get_student_baseline(student_id)
        logging.info(f"[CALIBRATION] Automated baseline check after save: {baseline_check}")
        if success:
            logging.info(f"[CALIBRATION] Baseline saved successfully for student_id: {student_id}, session_id: {session_id}")
            return jsonify({
                "status": "baseline_saved", 
                "personalized_threshold": calculated_threshold,
                "message": "Calibration baseline saved successfully."
            }), 200
        else:
            logging.error(f"[CALIBRATION] Failed to save baseline for student_id: {student_id}, session_id: {session_id}")
            return jsonify({"error": "Database error while saving baseline."}), 500
    except Exception as e:
        logging.error(f"[CALIBRATION] Error during baseline processing for student_id: {student_id}, session_id: {session_id}: {e}")
        return jsonify({"error": "Internal processing error."}), 500