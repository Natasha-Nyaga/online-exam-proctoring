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

# Initialize extractors
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# Statistical Constants
EPSILON = 1e-6
MAX_Z_SCORE_CLIP = 10.0

# Feature Lists - MUST match your trained models
KEYSTROKE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2', 'keystroke_count'
]

MOUSE_FEATURES = [
    'inactive_duration', 'copy_cut', 'paste', 'double_click'
]


@exam_bp.route('/analyze_behavior', methods=['POST'])
def analyze_behavior():
    """
    Real-time behavior analysis during exam.
    Normalizes features using personalized baseline and compares against personalized threshold.
    """
    data = request.get_json()
    
    student_id = data.get('student_id')
    exam_session_id = data.get('exam_session_id') or data.get('calibration_session_id')
    mouse_events = data.get('mouse_events', [])
    key_events = data.get('key_events', [])

    print(f"\n{'='*60}")
    print(f"[EXAM ANALYSIS] Incoming request")
    print(f"[EXAM ANALYSIS] Student ID: {student_id}")
    print(f"[EXAM ANALYSIS] Session ID: {exam_session_id}")
    print(f"[EXAM ANALYSIS] Key events: {len(key_events)}, Mouse events: {len(mouse_events)}")
    print(f"{'='*60}\n")

    if not all([student_id, exam_session_id]):
        return jsonify({"error": "Missing required identifiers"}), 400

    try:
        # === STEP 1: Retrieve Personalized Baseline ===
        baseline = get_student_baseline(student_id)
        if not baseline:
            print(f"[EXAM ANALYSIS] No baseline found for student {student_id}")
            return jsonify({
                "status": "no_baseline",
                "message": "Please complete calibration first",
                "analysis": None
            }), 200

        baseline_stats = baseline['stats']
        personalized_threshold = baseline.get('system_threshold', 0.7)
        
        print(f"[BASELINE] Retrieved personalized threshold: {personalized_threshold}")

        try:
            k_detailed_stats = baseline_stats['keystroke']['detailed_stats']
            m_detailed_stats = baseline_stats['mouse']['detailed_stats']
        except KeyError as e:
            print(f"[ERROR] Baseline data corrupted: {e}")
            return jsonify({"error": "Baseline data incomplete"}), 500

        # === STEP 2: Extract Raw Features ===
        k_features_raw, _ = KEYSTROKE_FE.extract_features(key_events, baseline_stats=None)
        m_features_raw, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        print(f"[FEATURES] Raw keystroke features: {k_features_raw[:5]}...")
        print(f"[FEATURES] Raw mouse features: {m_features_raw}")

        # Initialize session history if needed
        if exam_session_id not in SESSION_FEATURE_HISTORY:
            SESSION_FEATURE_HISTORY[exam_session_id] = {'keystroke': [], 'mouse': []}

        # Convert to dict format for storage
        if isinstance(k_features_raw, list):
            k_features_dict = dict(zip(KEYSTROKE_FEATURES, k_features_raw))
        else:
            k_features_dict = k_features_raw

        if isinstance(m_features_raw, list):
            m_features_dict = dict(zip(MOUSE_FEATURES, m_features_raw))
        else:
            m_features_dict = m_features_raw

        SESSION_FEATURE_HISTORY[exam_session_id]['keystroke'].append(k_features_dict)
        SESSION_FEATURE_HISTORY[exam_session_id]['mouse'].append(m_features_dict)

        # Check if we have enough data
        if len(SESSION_FEATURE_HISTORY[exam_session_id]['keystroke']) < 2:
            return jsonify({
                "status": "gathering_data",
                "risk_score": 0.0,
                "message": "Collecting initial data..."
            }), 200

        # === STEP 3: Normalize Features Using Personalized Baseline ===
        k_normalized = []
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            raw_val = k_features_raw[i] if isinstance(k_features_raw, list) else k_features_dict.get(feat_name, 0.0)
            
            # Get baseline mean/std for this feature
            feat_stats = k_detailed_stats.get(feat_name, {'mean': 0.0, 'std': 1.0})
            mean = feat_stats['mean']
            std = max(feat_stats['std'], EPSILON)  # Ensure non-zero
            
            # Z-score normalization with clipping
            normalized = (raw_val - mean) / std
            normalized = np.clip(normalized, -MAX_Z_SCORE_CLIP, MAX_Z_SCORE_CLIP)
            k_normalized.append(normalized)

        m_normalized = []
        for i, feat_name in enumerate(MOUSE_FEATURES):
            raw_val = m_features_raw[i] if isinstance(m_features_raw, list) else m_features_dict.get(feat_name, 0.0)
            
            feat_stats = m_detailed_stats.get(feat_name, {'mean': 0.0, 'std': 1.0})
            mean = feat_stats['mean']
            std = max(feat_stats['std'], EPSILON)
            
            normalized = (raw_val - mean) / std
            normalized = np.clip(normalized, -MAX_Z_SCORE_CLIP, MAX_Z_SCORE_CLIP)
            m_normalized.append(normalized)

        print(f"[NORMALIZED] Keystroke Z-scores (first 5): {k_normalized[:5]}")
        print(f"[NORMALIZED] Mouse Z-scores: {m_normalized}")

        # === STEP 4: ML Model Predictions ===
        k_input = pd.DataFrame([k_normalized], columns=KEYSTROKE_FEATURES)
        m_input = pd.DataFrame([m_normalized], columns=MOUSE_FEATURES)

        # Keystroke model (XGBoost) - probability of anomaly
        try:
            k_score = float(keystroke_model.predict_proba(k_input)[0, 1])
        except Exception as e:
            print(f"[ERROR] Keystroke model failed: {e}")
            k_score = 0.0

        # Mouse model (SVM) - decision function or probability
        try:
            m_decision = float(mouse_model.decision_function(m_input)[0])
            # Convert decision to anomaly score (more negative = more normal)
            m_score = max(0.0, -m_decision)
        except AttributeError:
            # Fallback to predict_proba
            try:
                m_score = float(mouse_model.predict_proba(m_input)[0, 1])
            except Exception as e:
                print(f"[ERROR] Mouse model failed: {e}")
                m_score = 0.0

        print(f"[MODEL SCORES] Keystroke: {k_score:.4f}, Mouse: {m_score:.4f}")

        # === STEP 5: Fusion Score Calculation ===
        fusion_score = (0.5 * k_score) + (0.5 * m_score)
        
        print(f"[FUSION] Combined risk score: {fusion_score:.4f}")
        print(f"[FUSION] Personalized threshold: {personalized_threshold:.4f}")
        print(f"[FUSION] Threshold exceeded: {fusion_score >= personalized_threshold}")

        # === STEP 6: Incident Logging ===
        incident_logged = False
        if fusion_score >= personalized_threshold:
            incident_details = {
                "keystroke_score": k_score,
                "mouse_score": m_score,
                "fusion_score": fusion_score,
                "threshold": personalized_threshold,
                "timestamp": data.get('end_timestamp'),
                "exceeded_by": fusion_score - personalized_threshold
            }
            
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=fusion_score,
                incident_details=incident_details
            )
            
            if incident_logged:
                print(f"[INCIDENT] ⚠️ Anomaly logged! Score: {fusion_score:.4f}")

        # === STEP 7: Count Total Incidents ===
        from utils.db_helpers import supabase
        incident_count = 0
        try:
            response = supabase.table('cheating_incidents')\
                .select('id')\
                .eq('session_id', exam_session_id)\
                .execute()
            
            if hasattr(response, 'data') and response.data:
                incident_count = len(response.data)
        except Exception as e:
            print(f"[ERROR] Failed to count incidents: {e}")

        print(f"[SUMMARY] Total incidents for session: {incident_count}")
        print(f"{'='*60}\n")

        # === STEP 8: Return Analysis Results ===
        return jsonify({
            "status": "analyzed",
            "analysis": {
                "keystroke_score": float(k_score),
                "mouse_score": float(m_score),
                "fusion_risk_score": float(fusion_score),
                "personalized_threshold": float(personalized_threshold),
                "threshold_exceeded": fusion_score >= personalized_threshold,
                "incident_logged": incident_logged,
                "cheating_incident_count": incident_count,
                "severity": "high" if fusion_score >= 0.8 else "medium" if fusion_score >= 0.6 else "low"
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] Analysis failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500