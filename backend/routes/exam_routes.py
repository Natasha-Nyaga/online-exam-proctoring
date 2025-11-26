import joblib
from flask import Blueprint, request, jsonify
from utils.db_helpers import get_student_baseline, save_anomaly_record 
from utils.load_models import mouse_model, keystroke_model
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
import pandas as pd

# Initialize the Blueprint
exam_bp = Blueprint('exam', __name__)

# Initialize extractors
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# Statistical Constants
EPSILON = 1e-6

# Feature Lists
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
    Handles both normalized and raw feature inputs based on model requirements.
    """
    data = request.get_json()
    
    student_id = data.get('student_id')
    exam_session_id = data.get('exam_session_id') or data.get('calibration_session_id')
    mouse_events = data.get('mouse_events', [])
    key_events = data.get('key_events', [])

    print(f"\n{'='*60}")
    print(f"[EXAM ANALYSIS] Student: {student_id}, Session: {exam_session_id}")
    print(f"[EXAM ANALYSIS] Events - Keys: {len(key_events)}, Mouse: {len(mouse_events)}")
    print(f"{'='*60}\n")

    if not all([student_id, exam_session_id]):
        return jsonify({"error": "Missing required identifiers"}), 400

    try:
        # === STEP 1: Retrieve Baseline ===
        baseline = get_student_baseline(student_id)
        if not baseline:
            return jsonify({
                "status": "no_baseline",
                "message": "Please complete calibration first"
            }), 200

        baseline_stats = baseline['stats']
        personalized_threshold = baseline.get('system_threshold', 0.7)
        
        print(f"[BASELINE] Threshold: {personalized_threshold:.4f}")

        try:
            k_detailed_stats = baseline_stats['keystroke']['detailed_stats']
            m_detailed_stats = baseline_stats['mouse']['detailed_stats']
            k_needs_norm = baseline_stats['keystroke'].get('needs_normalization', False)
            m_needs_norm = baseline_stats['mouse'].get('needs_normalization', False)
        except KeyError as e:
            print(f"[ERROR] Baseline corrupted: {e}")
            return jsonify({"error": "Baseline incomplete"}), 500

        print(f"[CONFIG] Keystroke needs normalization: {k_needs_norm}")
        print(f"[CONFIG] Mouse needs normalization: {m_needs_norm}")

        # === STEP 2: Extract Current RAW Features ===
        print("\n[STEP 2] Extracting current raw features...")
        k_features_current, _ = KEYSTROKE_FE.extract_features(key_events, baseline_stats=None)
        m_features_current, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        if len(key_events) < 5:
            return jsonify({
                "status": "gathering_data",
                "risk_score": 0.0,
                "message": "Collecting keystroke data..."
            }), 200

        print(f"[RAW FEATURES] Keystroke: {[f'{v:.2f}' for v in k_features_current[:5]]}")
        print(f"[RAW FEATURES] Mouse: {[f'{v:.2f}' for v in m_features_current]}")

        # === STEP 3: Calculate Deviations ===
        print("\n[STEP 3] Calculating deviations from baseline...")
        
        k_deviations = []
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            current_val = k_features_current[i]
            baseline_val = k_detailed_stats[feat_name]['mean']
            
            if baseline_val != 0:
                dev = abs(current_val - baseline_val) / abs(baseline_val)
            else:
                dev = 0.0 if current_val == 0 else 1.0
            
            k_deviations.append(dev)
            if i < 3:
                print(f"[DEV] {feat_name}: {baseline_val:.1f}→{current_val:.1f} ({dev:.1%})")

        m_deviations = []
        for i, feat_name in enumerate(MOUSE_FEATURES):
            current_val = m_features_current[i]
            baseline_val = m_detailed_stats[feat_name]['mean']
            
            if baseline_val != 0:
                dev = abs(current_val - baseline_val) / abs(baseline_val)
            else:
                dev = 0.0 if current_val == 0 else 1.0
            
            m_deviations.append(dev)

        avg_k_dev = np.mean(k_deviations)
        avg_m_dev = np.mean(m_deviations)
        print(f"[DEV] Avg keystroke: {avg_k_dev:.1%}, mouse: {avg_m_dev:.1%}")

        # === STEP 4: Prepare Features for Models ===
        print("\n[STEP 4] Preparing features for models...")
        
        # Normalize if models require it
        if k_needs_norm:
            k_mean = np.mean(k_features_current)
            k_std = max(np.std(k_features_current), EPSILON)
            k_features_for_model = [(x - k_mean) / k_std for x in k_features_current]
            print(f"[PREP] Normalized keystroke features (first 3): {k_features_for_model[:3]}")
        else:
            k_features_for_model = k_features_current
            print(f"[PREP] Using raw keystroke features")

        if m_needs_norm:
            m_mean = np.mean(m_features_current)
            m_std = max(np.std(m_features_current), EPSILON)
            m_features_for_model = [(x - m_mean) / m_std for x in m_features_current]
            print(f"[PREP] Normalized mouse features: {m_features_for_model}")
        else:
            m_features_for_model = m_features_current
            print(f"[PREP] Using raw mouse features")

        # === STEP 5: ML Model Predictions ===
        print("\n[STEP 5] Running ML models...")
        
        k_input = pd.DataFrame([k_features_for_model], columns=KEYSTROKE_FEATURES)
        m_input = pd.DataFrame([m_features_for_model], columns=MOUSE_FEATURES)

        # Keystroke model
        try:
            k_proba = keystroke_model.predict_proba(k_input)
            k_score = float(k_proba[0, 1])
            print(f"[MODELS] ✓ Keystroke score: {k_score:.6f}")
            
            if k_score == 0.0 or k_score == 1.0:
                print(f"[WARNING] ⚠️ Extreme keystroke score!")
        except Exception as e:
            print(f"[ERROR] Keystroke model failed: {e}")
            k_score = 0.0

        # Mouse model
        try:
            m_decision = mouse_model.decision_function(m_input)
            m_score = float(1.0 / (1.0 + np.exp(-m_decision[0])))
            print(f"[MODELS] ✓ Mouse score: {m_score:.6f}")
            
            if m_score == 0.0 or m_score == 1.0:
                print(f"[WARNING] ⚠️ Extreme mouse score!")
        except AttributeError:
            try:
                m_proba = mouse_model.predict_proba(m_input)
                m_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse score: {m_score:.6f}")
            except Exception as e:
                print(f"[ERROR] Mouse model failed: {e}")
                m_score = 0.0

        # === STEP 6: Fusion Score ===
        print("\n[STEP 6] Calculating fusion score...")
        
        fusion_score = (0.5 * k_score) + (0.5 * m_score)
        
        # Boost if deviations are extreme
        if avg_k_dev > 0.5 or avg_m_dev > 0.5:
            print(f"[FUSION] High deviation detected - applying boost")
            fusion_score = min(1.0, fusion_score * 1.2)
        
        print(f"[FUSION] Keystroke: {k_score:.4f}, Mouse: {m_score:.4f}")
        print(f"[FUSION] Combined: {fusion_score:.4f}, Threshold: {personalized_threshold:.4f}")
        print(f"[FUSION] Exceeds threshold: {fusion_score >= personalized_threshold}")

        # === STEP 7: Incident Logging ===
        incident_logged = False
        if fusion_score >= personalized_threshold:
            print(f"\n[ALERT] ⚠️⚠️⚠️ ANOMALY DETECTED ⚠️⚠️⚠️")
            
            incident_details = {
                "keystroke_score": k_score,
                "mouse_score": m_score,
                "fusion_score": fusion_score,
                "threshold": personalized_threshold,
                "exceeded_by": fusion_score - personalized_threshold,
                "avg_keystroke_deviation": avg_k_dev,
                "avg_mouse_deviation": avg_m_dev,
                "timestamp": data.get('end_timestamp')
            }
            
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=fusion_score,
                incident_details=incident_details
            )
            
            if incident_logged:
                print(f"[INCIDENT] ✓ Logged to database")
        else:
            print(f"\n[STATUS] ✓ Behavior normal")

        # === STEP 8: Count Incidents ===
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
            print(f"[ERROR] Count failed: {e}")

        print(f"[SUMMARY] Total incidents: {incident_count}")
        print(f"{'='*60}\n")

        # === STEP 9: Return Results ===
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
                "avg_keystroke_deviation": float(avg_k_dev),
                "avg_mouse_deviation": float(avg_m_dev)
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] Analysis failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500