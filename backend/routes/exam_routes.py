import joblib
from flask import Blueprint, request, jsonify
from utils.db_helpers import get_student_baseline, save_anomaly_record 
from utils.load_models import mouse_model, keystroke_model # Loaded models from app.py
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np

# Initialize the Blueprint
exam_bp = Blueprint('exam', __name__)

# Initialize extractors (must be consistent with calibration_routes)
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

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

    # Accept both 'exam_session_id' and 'calibration_session_id' for consistency
    student_id = data.get('student_id')
    exam_session_id = data.get('exam_session_id') or data.get('calibration_session_id')
    mouse_events = data.get('mouse_events', [])
    key_events = data.get('key_events', [])

    print(f"[ID CONSISTENCY] Received student_id: {student_id}")
    print(f"[ID CONSISTENCY] Received session_id: {exam_session_id}")
    print(f"[ID CONSISTENCY] mouse_events count: {len(mouse_events)}, key_events count: {len(key_events)}")

    # Also log to the response for frontend debugging (optional, remove in production)
    consistency_log = {
        "student_id": student_id,
        "session_id": exam_session_id,
        "mouse_events_count": len(mouse_events),
        "key_events_count": len(key_events)
    }

    if not all([student_id, exam_session_id]):
        print(f"[ERROR] Missing required identifiers. student_id: {student_id}, session_id: {exam_session_id}")
        return jsonify({"error": "Missing required identifiers (student/exam/calibration session ID)."}), 400

    try:
        # 1. Retrieve Personalized Baseline (This contains the Threshold and Stats)
        # This baseline is used for personalized Z-score normalization (Step 2)
        print(f"[DEBUG] Attempting to retrieve baseline for student_id: {student_id}")
        baseline = get_student_baseline(student_id)
        if baseline:
            print(f"[DEBUG] Baseline found for student_id: {student_id}")
        else:
            print(f"[DEBUG] No baseline found for student_id: {student_id}")
            return jsonify({
                "status": "no_baseline",
                "message": "Personalized baseline not found. Student must complete calibration.",
                "analysis": None
            }), 200

        baseline_stats = baseline['stats']
        personalized_threshold = baseline['system_threshold']
        
        # 2. Feature Extraction and Personalized Normalization
        # Normalize new features using the MEAN/STD from the student's baseline
        k_normalized_features = KEYSTROKE_FE.extract_features(key_events, baseline_stats['keystroke'])
        m_normalized_features = MOUSE_FE.extract_features(mouse_events, baseline_stats['mouse'])
        
        # 3. Anomaly Prediction
        k_anomaly_score = 0
        m_anomaly_score = 0
        

        # Predict Key anomaly score using the pre-loaded model
        if k_normalized_features:
            # Predict probability of being the anomaly class (class 1)
            # Input must be reshaped to (1, n_features) for the model
            k_anomaly_score = keystroke_model.predict_proba(np.array(k_normalized_features).reshape(1, -1))[0, 1]
        
        # Predict Mouse anomaly score using the pre-loaded model
        if m_normalized_features:
            # Predict probability of being the anomaly class (class 1)
            m_anomaly_score = mouse_model.predict_proba(np.array(m_normalized_features).reshape(1, -1))[0, 1] 
        
        # 4. Fusion Score Calculation
        final_risk_score = calculate_fusion_score(
            k_anomaly_score, 
            m_anomaly_score, 
            
        )
        
        # 5. Threshold Check and Incident Logging
        incident_logged = False
        if final_risk_score >= personalized_threshold:
            incident_details = {
                "keystroke_score": float(k_anomaly_score),
                "mouse_score": float(m_anomaly_score),
                "threshold_exceeded": float(personalized_threshold),
                "timestamp_end": data.get('end_timestamp')
            }
            # Log the incident to the database
            incident_logged = save_anomaly_record(
                session_id=exam_session_id, # This is the exam_sessions ID
                final_risk_score=final_risk_score,
                incident_details=incident_details
            )
        
        # 6. Respond to Frontend with real-time risk scores
        return jsonify({
            "status": "analyzed",
            "analysis": {
                "keystroke_score": float(k_anomaly_score),
                "mouse_score": float(m_anomaly_score),
                "fusion_risk_score": float(final_risk_score),
                "personalized_threshold": float(personalized_threshold),
                "incident_logged": incident_logged
            }
        }), 200

    except Exception as e:
        print(f"An error occurred during analysis: {e}")
        return jsonify({"error": "Internal server error during analysis."}), 500