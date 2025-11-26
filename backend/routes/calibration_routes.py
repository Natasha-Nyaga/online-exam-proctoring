import joblib
from flask import Blueprint, request, jsonify
from utils.db_helpers import save_personalized_thresholds, get_student_baseline
from utils.load_models import mouse_model, keystroke_model
from features.keystroke_feature_extractor import KeystrokeFeatureExtractor
from features.mouse_feature_extractor import MouseFeatureExtractor
import numpy as np
import pandas as pd

# Initialize the Blueprint
calibration_bp = Blueprint('calibrate', __name__)

# Initialize extractors
KEYSTROKE_FE = KeystrokeFeatureExtractor()
MOUSE_FE = MouseFeatureExtractor()

# Statistical Constants
EPSILON = 1e-6
MAX_Z_SCORE_CLIP = 10.0
PERCENTILE_TOLERANCE = 98.0

# Feature Lists - CRITICAL: These must match your trained models exactly
KEYSTROKE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2', 'keystroke_count'
]

MOUSE_FEATURES = [
    'inactive_duration', 'copy_cut', 'paste', 'double_click'
]

@calibration_bp.route('/save-baseline', methods=['POST'])
def save_baseline():
    """
    Receives calibration data, calculates baseline statistics and personalized threshold.
    """
    data = request.get_json()
    student_id = data.get('student_id')
    calibration_session_id = data.get('calibration_session_id')
    course_name = data.get('course_name', 'General')
    keystroke_events = data.get('keystroke_events', [])
    mouse_events = data.get('mouse_events', [])

    if not student_id or not calibration_session_id:
        return jsonify({"error": "Missing required fields"}), 400

    print(f"\n{'='*80}")
    print(f"[CALIBRATION] Starting baseline calculation for student: {student_id}")
    print(f"[CALIBRATION] Session ID: {calibration_session_id}")
    print(f"[CALIBRATION] Keystroke events: {len(keystroke_events)}, Mouse events: {len(mouse_events)}")
    print(f"{'='*80}\n")

    try:
        # === STEP 1: Extract RAW (unnormalized) Features ===
        print("[STEP 1] Extracting RAW features from calibration events...")
        
        # Extract without baseline (returns raw values and stats)
        k_features_raw, k_stats = KEYSTROKE_FE.extract_features(keystroke_events, baseline_stats=None)
        m_features_raw, m_stats = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        if not k_features_raw or not m_features_raw:
            return jsonify({"error": "Insufficient calibration data"}), 400

        print(f"[FEATURES] ✓ Extracted {len(k_features_raw)} keystroke features")
        print(f"[FEATURES] ✓ Extracted {len(m_features_raw)} mouse features")
        print(f"[FEATURES] Keystroke sample: {[f'{v:.2f}' for v in k_features_raw[:5]]}")
        print(f"[FEATURES] Mouse values: {[f'{v:.2f}' for v in m_features_raw]}")

        # === STEP 2: Store Baseline Statistics for Future Normalization ===
        print("\n[STEP 2] Preparing baseline statistics for storage...")
        
        # Build detailed stats dictionary
        k_baseline_stats = {}
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            raw_val = k_features_raw[i]
            k_baseline_stats[feat_name] = {
                'mean': float(raw_val),
                'std': 1.0  # Initial std - will be updated during exam as more data arrives
            }

        m_baseline_stats = {}
        for i, feat_name in enumerate(MOUSE_FEATURES):
            raw_val = m_features_raw[i]
            m_baseline_stats[feat_name] = {
                'mean': float(raw_val),
                'std': 1.0
            }

        print(f"[BASELINE] ✓ Created baseline stats for {len(k_baseline_stats)} keystroke features")
        print(f"[BASELINE] ✓ Created baseline stats for {len(m_baseline_stats)} mouse features")
        
        # Log sample baseline values
        print(f"[BASELINE] Sample keystroke baseline means: {[k_baseline_stats[f]['mean'] for f in list(KEYSTROKE_FEATURES)[:3]]}")
        print(f"[BASELINE] Sample mouse baseline means: {[m_baseline_stats[f]['mean'] for f in MOUSE_FEATURES]}")

        # === STEP 3: Calculate Baseline Anomaly Scores Using Models ===
        print("\n[STEP 3] Calculating baseline anomaly scores with ML models...")
        
        k_baseline_score = 0.0
        m_baseline_score = 0.0
        
        try:
            # Verify models are loaded
            if keystroke_model is None:
                raise Exception("Keystroke model not loaded")
            if mouse_model is None:
                raise Exception("Mouse model not loaded")
            
            print(f"[MODELS] ✓ Models verified")
            
            # CRITICAL: Models expect RAW (unnormalized) features during calibration
            # because they will learn what "normal" looks like from this data
            k_input = pd.DataFrame([k_features_raw], columns=KEYSTROKE_FEATURES)
            m_input = pd.DataFrame([m_features_raw], columns=MOUSE_FEATURES)
            
            print(f"[MODELS] Keystroke input shape: {k_input.shape}")
            print(f"[MODELS] Mouse input shape: {m_input.shape}")
            print(f"[MODELS] Keystroke input:\n{k_input.to_dict('records')[0]}")
            print(f"[MODELS] Mouse input:\n{m_input.to_dict('records')[0]}")
            
            # Keystroke Model Prediction
            print("\n[MODELS] Running keystroke model...")
            k_proba = keystroke_model.predict_proba(k_input)
            k_baseline_score = float(k_proba[0, 1])  # Probability of class 1 (anomaly)
            print(f"[MODELS] ✓ Keystroke anomaly probability: {k_baseline_score:.6f}")
            
            # Mouse Model Prediction
            print("\n[MODELS] Running mouse model...")
            try:
                # Try decision_function first (for SVM)
                m_decision = mouse_model.decision_function(m_input)
                # Convert decision to probability-like score
                # Negative decision = normal, positive = anomaly
                m_baseline_score = float(1.0 / (1.0 + np.exp(-m_decision[0])))  # Sigmoid transformation
                print(f"[MODELS] Mouse decision value: {m_decision[0]:.6f}")
                print(f"[MODELS] ✓ Mouse anomaly score (sigmoid): {m_baseline_score:.6f}")
            except AttributeError:
                # Fallback to predict_proba if available
                m_proba = mouse_model.predict_proba(m_input)
                m_baseline_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse anomaly probability: {m_baseline_score:.6f}")

            # Sanity check - baseline scores should be LOW for calibration (normal behavior)
            if k_baseline_score > 0.5:
                print(f"[WARNING] ⚠️ High keystroke baseline score: {k_baseline_score:.4f}")
                print("[WARNING] This suggests calibration data may be abnormal or model mismatch")
            
            if m_baseline_score > 0.5:
                print(f"[WARNING] ⚠️ High mouse baseline score: {m_baseline_score:.4f}")
                print("[WARNING] This suggests calibration data may be abnormal or model mismatch")

        except Exception as model_error:
            print(f"\n[ERROR] ❌ Model prediction failed: {model_error}")
            import traceback
            traceback.print_exc()
            print("[WARNING] Using conservative fallback baseline scores")
            k_baseline_score = 0.05  # Very low = very normal
            m_baseline_score = 0.05

        # === STEP 4: Calculate Personalized Threshold ===
        print("\n[STEP 4] Calculating personalized threshold...")
        print(f"[THRESHOLD] Keystroke baseline score: {k_baseline_score:.6f}")
        print(f"[THRESHOLD] Mouse baseline score: {m_baseline_score:.6f}")
        
        # Strategy: Threshold should be significantly ABOVE baseline
        # If baseline is normal (low score ~0.05), threshold should be much higher
        # Formula: baseline + buffer, with safety bounds
        
        # Add buffer (3-5x baseline) to ensure we only alert on significant deviations
        k_threshold = max(0.4, min(0.85, k_baseline_score + 0.3))  # At least 0.4, at most 0.85
        m_threshold = max(0.4, min(0.85, m_baseline_score + 0.3))
        
        # Weighted fusion (equal weight for now)
        personalized_threshold = (0.5 * k_threshold) + (0.5 * m_threshold)
        personalized_threshold = max(0.5, min(0.85, personalized_threshold))  # Clamp to reasonable range
        
        print(f"[THRESHOLD] Keystroke threshold: {k_threshold:.4f}")
        print(f"[THRESHOLD] Mouse threshold: {m_threshold:.4f}")
        print(f"[THRESHOLD] ✓ FINAL Personalized threshold: {personalized_threshold:.4f}")
        
        # Validation
        if personalized_threshold <= k_baseline_score or personalized_threshold <= m_baseline_score:
            print("[WARNING] ⚠️ Threshold is not sufficiently above baseline!")
            print(f"[WARNING] Adjusting threshold to ensure proper separation...")
            personalized_threshold = max(k_baseline_score + 0.2, m_baseline_score + 0.2, 0.6)
            print(f"[THRESHOLD] Adjusted threshold: {personalized_threshold:.4f}")

        # === STEP 5: Save to Database ===
        print("\n[STEP 5] Saving baseline to database...")
        baseline_package = {
            'keystroke': {'detailed_stats': k_baseline_stats},
            'mouse': {'detailed_stats': m_baseline_stats}
        }

        # Calculate fusion statistics
        all_features = k_features_raw + m_features_raw
        fusion_mean = float(np.mean(all_features))
        fusion_std = max(float(np.std(all_features)), EPSILON)

        print(f"[FUSION] Mean: {fusion_mean:.2f}, Std: {fusion_std:.2f}")

        success = save_personalized_thresholds(
            student_id=student_id,
            session_id=calibration_session_id,
            fusion_mean=fusion_mean,
            fusion_std=fusion_std,
            calculated_threshold=personalized_threshold,
            baseline_stats=baseline_package,
            course_name=course_name
        )

        if not success:
            return jsonify({"error": "Failed to save baseline to database"}), 500

        print(f"\n{'='*80}")
        print(f"[SUCCESS] ✓✓✓ Baseline saved successfully! ✓✓✓")
        print(f"{'='*80}\n")

        return jsonify({
            "status": "baseline_saved",
            "message": "Personalized baseline calculated and saved successfully",
            "threshold": float(personalized_threshold),
            "stats": {
                "keystroke_baseline_score": float(k_baseline_score),
                "mouse_baseline_score": float(m_baseline_score),
                "keystroke_threshold": float(k_threshold),
                "mouse_threshold": float(m_threshold),
                "fusion_mean": float(fusion_mean),
                "fusion_std": float(fusion_std),
                "keystroke_features_count": len(k_features_raw),
                "mouse_features_count": len(m_features_raw),
                "baseline_quality": "good" if k_baseline_score < 0.3 and m_baseline_score < 0.3 else "warning"
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] ❌❌❌ Calibration failed: {str(e)} ❌❌❌")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Calibration failed: {str(e)}"}), 500