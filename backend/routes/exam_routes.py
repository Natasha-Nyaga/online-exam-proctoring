from flask import Blueprint, request, jsonify
from utils.db_helpers import get_student_baseline, save_anomaly_record 
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
import pandas as pd

exam_bp = Blueprint('exam', __name__)

KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

EPSILON = 1e-6
KEYSTROKE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2', 'keystroke_count'
]
MOUSE_FEATURES = ['inactive_duration', 'copy_cut', 'paste', 'double_click']


@exam_bp.route('/analyze_behavior', methods=['POST'])
def analyze_behavior():
    """Real-time behavior analysis during exam."""
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
            print(f"[EXAM] No baseline found")
            return jsonify({
                "status": "no_baseline",
                "message": "Please complete calibration first",
                "analysis": None
            }), 200

        baseline_stats = baseline['stats']
        personalized_threshold = baseline.get('system_threshold', 0.7)
        
        print(f"[BASELINE] Threshold: {personalized_threshold:.4f}")

        try:
            k_detailed_stats = baseline_stats['keystroke']['detailed_stats']
            m_detailed_stats = baseline_stats['mouse']['detailed_stats']
        except KeyError as e:
            print(f"[ERROR] Baseline corrupted: {e}")
            return jsonify({"error": "Baseline data incomplete"}), 500

        # === STEP 2: Extract Current Features ===
        print("\n[STEP 2] Extracting current raw features...")
        
        # Check for minimum data
        if len(key_events) < 5:
            print("[WARNING] Insufficient keystroke data (need at least 5)")
            return jsonify({
                "status": "gathering_data",
                "risk_score": 0.0,
                "message": f"Need more keystroke data ({len(key_events)}/5 minimum)"
            }), 200
        
        if len(mouse_events) < 10:
            print(f"[WARNING] Low mouse events: {len(mouse_events)} (recommended: 10+)")
        
        k_features_current, _ = KEYSTROKE_FE.extract_features(key_events, baseline_stats=None)
        m_features_current, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        print(f"[FEATURES] Current keystroke: {[f'{v:.2f}' for v in k_features_current[:3]]}")
        print(f"[FEATURES] Current mouse: {[f'{v:.2f}' for v in m_features_current]}")

        # === STEP 3: Calculate Deviations from Baseline ===
        print("\n[STEP 3] Calculating deviations from baseline...")
        
        k_deviations = []
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            current = k_features_current[i]
            baseline_mean = k_detailed_stats[feat_name]['mean']
            
            if baseline_mean != 0:
                deviation = abs(current - baseline_mean) / abs(baseline_mean)
            else:
                deviation = 0.0 if current == 0 else 1.0
            
            k_deviations.append(deviation)

        m_deviations = []
        for i, feat_name in enumerate(MOUSE_FEATURES):
            current = m_features_current[i]
            baseline_mean = m_detailed_stats[feat_name]['mean']
            
            if baseline_mean != 0:
                deviation = abs(current - baseline_mean) / abs(baseline_mean)
            else:
                deviation = 0.0 if current == 0 else 1.0
            
            m_deviations.append(deviation)

        avg_k_deviation = np.mean(k_deviations)
        avg_m_deviation = np.mean(m_deviations)
        print(f"[DEVIATION] Keystroke avg: {avg_k_deviation:.2%}")
        print(f"[DEVIATION] Mouse avg: {avg_m_deviation:.2%}")

        # === STEP 4: ML Model Predictions ===
        print("\n[STEP 4] Running ML models...")
        
        # Import models (after initialization)
        from utils.load_models import mouse_model, keystroke_model
        
        if keystroke_model is None or mouse_model is None:
            print("[ERROR] ❌ Models not loaded")
            return jsonify({"error": "Models not initialized"}), 500
        
        # Prepare inputs
        k_input = pd.DataFrame([k_features_current], columns=KEYSTROKE_FEATURES)
        m_input = pd.DataFrame([m_features_current], columns=MOUSE_FEATURES)

        print(f"[MODELS] Keystroke input shape: {k_input.shape}")
        print(f"[MODELS] Mouse input shape: {m_input.shape}")

        # Keystroke prediction
        try:
            k_proba = keystroke_model.predict_proba(k_input)
            k_score = float(k_proba[0, 1])
            print(f"[MODELS] ✓ Keystroke anomaly: {k_score:.6f}")
        except Exception as e:
            print(f"[ERROR] Keystroke model: {e}")
            k_score = 0.0

        # Mouse prediction
        try:
            if hasattr(mouse_model, 'decision_function'):
                m_decision = mouse_model.decision_function(m_input)
                # Positive = anomaly, Negative = normal
                m_score = float(1.0 / (1.0 + np.exp(-m_decision[0])))
                print(f"[MODELS] Mouse decision: {m_decision[0]:.6f}")
                print(f"[MODELS] ✓ Mouse anomaly: {m_score:.6f}")
            else:
                m_proba = mouse_model.predict_proba(m_input)
                m_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse anomaly: {m_score:.6f}")
        except Exception as e:
            print(f"[ERROR] Mouse model: {e}")
            import traceback
            traceback.print_exc()
            m_score = 0.0

        # === STEP 5: Fusion Score ===
        print("\n[STEP 5] Calculating fusion risk score...")
        
        # Weighted average
        fusion_score = (0.5 * k_score) + (0.5 * m_score)
        
        # Apply deviation boost for extreme behavioral changes
        if avg_k_deviation > 1.0 or avg_m_deviation > 1.0:
            boost = 1.4
            print(f"[FUSION] Extreme deviation (>100%) - applying {boost}x boost")
            fusion_score = min(1.0, fusion_score * boost)
        elif avg_k_deviation > 0.7 or avg_m_deviation > 0.7:
            boost = 1.2
            print(f"[FUSION] High deviation (>70%) - applying {boost}x boost")
            fusion_score = min(1.0, fusion_score * boost)
        elif avg_k_deviation > 0.5 or avg_m_deviation > 0.5:
            boost = 1.1
            print(f"[FUSION] Moderate deviation (>50%) - applying {boost}x boost")
            fusion_score = min(1.0, fusion_score * boost)
        
        print(f"[FUSION] Keystroke: {k_score:.4f}")
        print(f"[FUSION] Mouse: {m_score:.4f}")
        print(f"[FUSION] Combined: {fusion_score:.4f}")
        print(f"[FUSION] Threshold: {personalized_threshold:.4f}")
        print(f"[FUSION] Exceeded: {fusion_score >= personalized_threshold}")

        # === STEP 6: Incident Logging ===
        incident_logged = False
        if fusion_score >= personalized_threshold:
            print(f"\n[ALERT] ⚠️⚠️⚠️ ANOMALY DETECTED ⚠️⚠️⚠️")
            print(f"[ALERT] Score: {fusion_score:.4f} > Threshold: {personalized_threshold:.4f}")
            
            incident_details = {
                "keystroke_score": k_score,
                "mouse_score": m_score,
                "fusion_score": fusion_score,
                "threshold": personalized_threshold,
                "timestamp": data.get('end_timestamp'),
                "exceeded_by": fusion_score - personalized_threshold,
                "avg_keystroke_deviation": avg_k_deviation,
                "avg_mouse_deviation": avg_m_deviation,
                "keystroke_event_count": len(key_events),
                "mouse_event_count": len(mouse_events)
            }
            
            incident_logged = save_anomaly_record(
                session_id=exam_session_id,
                final_risk_score=fusion_score,
                incident_details=incident_details
            )
            
            if incident_logged:
                print(f"[INCIDENT] ✓ Logged to database")
        else:
            print(f"\n[STATUS] ✓ Normal behavior")

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
            print(f"[ERROR] Count incidents: {e}")

        print(f"[SUMMARY] Total incidents this session: {incident_count}")
        print(f"{'='*60}\n")

        # === STEP 8: Return Analysis ===
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
                "avg_mouse_deviation": float(avg_m_deviation),
                "data_quality": {
                    "keystroke_events": len(key_events),
                    "mouse_events": len(mouse_events),
                    "sufficient_data": len(key_events) >= 5 and len(mouse_events) >= 10
                }
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] Analysis failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500