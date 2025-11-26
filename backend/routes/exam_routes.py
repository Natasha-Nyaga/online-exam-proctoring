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
    Compares current raw features against baseline using ML models.
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

        # === STEP 2: Extract CURRENT Raw Features ===
        print("\n[STEP 2] Extracting current raw features...")
        k_features_current, _ = KEYSTROKE_FE.extract_features(key_events, baseline_stats=None)
        m_features_current, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        print(f"[FEATURES] Current keystroke features: {[f'{v:.2f}' for v in k_features_current[:5]]}")
        print(f"[FEATURES] Current mouse features: {[f'{v:.2f}' for v in m_features_current]}")

        # Check for sufficient data
        if len(key_events) < 5:
            print("[WARNING] Insufficient keystroke data")
            return jsonify({
                "status": "gathering_data",
                "risk_score": 0.0,
                "message": "Collecting more keystroke data..."
            }), 200

        # === STEP 3: Calculate Deviation from Baseline ===
        print("\n[STEP 3] Calculating deviations from baseline...")
        
        # For each feature, calculate how much current differs from baseline
        k_deviations = []
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            current_val = k_features_current[i]
            baseline_mean = k_detailed_stats[feat_name]['mean']
            
            # Calculate percentage deviation
            if baseline_mean != 0:
                deviation_pct = abs(current_val - baseline_mean) / abs(baseline_mean)
            else:
                deviation_pct = 0.0 if current_val == 0 else 1.0
            
            k_deviations.append(deviation_pct)
            
            if i < 3:  # Log first 3 features
                print(f"[DEVIATION] {feat_name}: baseline={baseline_mean:.2f}, current={current_val:.2f}, deviation={deviation_pct:.2%}")

        m_deviations = []
        for i, feat_name in enumerate(MOUSE_FEATURES):
            current_val = m_features_current[i]
            baseline_mean = m_detailed_stats[feat_name]['mean']
            
            if baseline_mean != 0:
                deviation_pct = abs(current_val - baseline_mean) / abs(baseline_mean)
            else:
                deviation_pct = 0.0 if current_val == 0 else 1.0
            
            m_deviations.append(deviation_pct)
            print(f"[DEVIATION] {feat_name}: baseline={baseline_mean:.2f}, current={current_val:.2f}, deviation={deviation_pct:.2%}")

        avg_k_deviation = np.mean(k_deviations)
        avg_m_deviation = np.mean(m_deviations)
        print(f"[DEVIATION] Avg keystroke deviation: {avg_k_deviation:.2%}")
        print(f"[DEVIATION] Avg mouse deviation: {avg_m_deviation:.2%}")

        # === STEP 4: ML Model Predictions on RAW Features ===
        print("\n[STEP 4] Running ML models on current features...")
        
        # Create input DataFrames with RAW features
        k_input = pd.DataFrame([k_features_current], columns=KEYSTROKE_FEATURES)
        m_input = pd.DataFrame([m_features_current], columns=MOUSE_FEATURES)

        print(f"[MODELS] Keystroke input shape: {k_input.shape}")
        print(f"[MODELS] Mouse input shape: {m_input.shape}")

        # Keystroke model prediction
        try:
            k_proba = keystroke_model.predict_proba(k_input)
            k_score = float(k_proba[0, 1])  # Probability of anomaly
            print(f"[MODELS] ✓ Keystroke anomaly score: {k_score:.6f}")
        except Exception as e:
            print(f"[ERROR] Keystroke model failed: {e}")
            k_score = 0.0

        # Mouse model prediction
        try:
            # Try decision_function first
            m_decision = mouse_model.decision_function(m_input)
            # Convert to probability-like score using sigmoid
            m_score = float(1.0 / (1.0 + np.exp(-m_decision[0])))
            print(f"[MODELS] Mouse decision: {m_decision[0]:.6f}")
            print(f"[MODELS] ✓ Mouse anomaly score: {m_score:.6f}")
        except AttributeError:
            # Fallback to predict_proba
            try:
                m_proba = mouse_model.predict_proba(m_input)
                m_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse anomaly score: {m_score:.6f}")
            except Exception as e:
                print(f"[ERROR] Mouse model failed: {e}")
                m_score = 0.0

        # === STEP 5: Fusion Score Calculation ===
        print("\n[STEP 5] Calculating fusion risk score...")
        
        # Weighted average (can adjust weights based on feature reliability)
        fusion_score = (0.5 * k_score) + (0.5 * m_score)
        
        # Apply deviation boost if deviations are very high
        if avg_k_deviation > 0.5 or avg_m_deviation > 0.5:
            print(f"[FUSION] High deviation detected, applying boost")
            fusion_score = min(1.0, fusion_score * 1.2)
        
        print(f"[FUSION] Keystroke score: {k_score:.4f}")
        print(f"[FUSION] Mouse score: {m_score:.4f}")
        print(f"[FUSION] Combined risk score: {fusion_score:.4f}")
        print(f"[FUSION] Personalized threshold: {personalized_threshold:.4f}")
        print(f"[FUSION] Threshold exceeded: {fusion_score >= personalized_threshold}")

        # === STEP 6: Incident Logging ===
        incident_logged = False
        if fusion_score >= personalized_threshold:
            print(f"\n[ALERT] ⚠️⚠️⚠️ ANOMALY DETECTED ⚠️⚠️⚠️")
            print(f"[ALERT] Risk score ({fusion_score:.4f}) exceeds threshold ({personalized_threshold:.4f})")
            
            incident_details = {
                "keystroke_score": k_score,
                "mouse_score": m_score,
                "fusion_score": fusion_score,
                "threshold": personalized_threshold,
                "timestamp": data.get('end_timestamp'),
                "exceeded_by": fusion_score - personalized_threshold,
                "avg_keystroke_deviation": avg_k_deviation,
                "avg_mouse_deviation": avg_m_deviation
            }
            
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=fusion_score,
                incident_details=incident_details
            )
            
            if incident_logged:
                print(f"[INCIDENT] ✓ Anomaly logged to database")
        else:
            print(f"\n[STATUS] ✓ Behavior normal (score below threshold)")

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

        print(f"[SUMMARY] Total incidents for this session: {incident_count}")
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
                "severity": "high" if fusion_score >= 0.8 else "medium" if fusion_score >= 0.6 else "low",
                "avg_keystroke_deviation": float(avg_k_deviation),
                "avg_mouse_deviation": float(avg_m_deviation)
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] Analysis failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500