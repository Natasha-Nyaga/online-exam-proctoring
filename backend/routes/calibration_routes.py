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

def check_model_expects_normalization(model, sample_raw, sample_norm, feature_names):
    """
    Determines if a model was trained on normalized or raw features
    by testing both and seeing which gives more reasonable predictions.
    """
    try:
        input_raw = pd.DataFrame([sample_raw], columns=feature_names)
        input_norm = pd.DataFrame([sample_norm], columns=feature_names)
        
        # Test raw features
        if hasattr(model, 'predict_proba'):
            proba_raw = model.predict_proba(input_raw)[0, 1]
            proba_norm = model.predict_proba(input_norm)[0, 1]
        else:
            # SVM with decision_function
            dec_raw = model.decision_function(input_raw)[0]
            dec_norm = model.decision_function(input_norm)[0]
            proba_raw = 1.0 / (1.0 + np.exp(-dec_raw))
            proba_norm = 1.0 / (1.0 + np.exp(-dec_norm))
        
        # If normalized features give reasonable results and raw doesn't
        if 0.01 < proba_norm < 0.99 and (proba_raw == 0.0 or proba_raw == 1.0):
            return True, "normalized"
        # If raw features work
        elif 0.01 < proba_raw < 0.99:
            return False, "raw"
        else:
            # Default to raw if uncertain
            return False, "uncertain"
            
    except Exception as e:
        print(f"[WARNING] Model type detection failed: {e}")
        return False, "error"


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
        # === STEP 1: Extract RAW Features ===
        print("[STEP 1] Extracting RAW features from calibration events...")
        
        k_features_raw, _ = KEYSTROKE_FE.extract_features(keystroke_events, baseline_stats=None)
        m_features_raw, _ = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        if not k_features_raw or not m_features_raw:
            return jsonify({"error": "Insufficient calibration data"}), 400

        print(f"[FEATURES] ✓ Extracted {len(k_features_raw)} keystroke features")
        print(f"[FEATURES] ✓ Extracted {len(m_features_raw)} mouse features")
        print(f"[FEATURES] Keystroke raw: {[f'{v:.2f}' for v in k_features_raw[:5]]}")
        print(f"[FEATURES] Mouse raw: {[f'{v:.2f}' for v in m_features_raw]}")

        # === STEP 2: Detect Model Input Format ===
        print("\n[STEP 2] Detecting model input format...")
        
        # Create normalized versions for testing
        k_mean = np.mean(k_features_raw)
        k_std = max(np.std(k_features_raw), EPSILON)
        k_features_norm = [(x - k_mean) / k_std for x in k_features_raw]
        
        m_mean = np.mean(m_features_raw)
        m_std = max(np.std(m_features_raw), EPSILON)
        m_features_norm = [(x - m_mean) / m_std for x in m_features_raw]
        
        k_needs_norm, k_format = check_model_expects_normalization(
            keystroke_model, k_features_raw, k_features_norm, KEYSTROKE_FEATURES
        )
        m_needs_norm, m_format = check_model_expects_normalization(
            mouse_model, m_features_raw, m_features_norm, MOUSE_FEATURES
        )
        
        print(f"[DETECTION] Keystroke model expects: {k_format} features")
        print(f"[DETECTION] Mouse model expects: {m_format} features")

        # === STEP 3: Prepare Features for Models ===
        print("\n[STEP 3] Preparing features for model prediction...")
        
        # Use the appropriate format based on detection
        k_features_for_model = k_features_norm if k_needs_norm else k_features_raw
        m_features_for_model = m_features_norm if m_needs_norm else m_features_raw
        
        print(f"[PREP] Using {'normalized' if k_needs_norm else 'raw'} keystroke features")
        print(f"[PREP] Using {'normalized' if m_needs_norm else 'raw'} mouse features")

        # === STEP 4: Store Baseline Statistics ===
        print("\n[STEP 4] Storing baseline statistics...")
        
        # Always store RAW feature values as baseline
        k_baseline_stats = {}
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            k_baseline_stats[feat_name] = {
                'mean': float(k_features_raw[i]),
                'std': 1.0
            }

        m_baseline_stats = {}
        for i, feat_name in enumerate(MOUSE_FEATURES):
            m_baseline_stats[feat_name] = {
                'mean': float(m_features_raw[i]),
                'std': 1.0
            }

        print(f"[BASELINE] ✓ Stored baseline for {len(k_baseline_stats)} keystroke features")
        print(f"[BASELINE] ✓ Stored baseline for {len(m_baseline_stats)} mouse features")

        # === STEP 5: Calculate Baseline Anomaly Scores ===
        print("\n[STEP 5] Calculating baseline anomaly scores...")
        
        k_baseline_score = 0.0
        m_baseline_score = 0.0
        
        try:
            if keystroke_model is None or mouse_model is None:
                raise Exception("Models not loaded")
            
            k_input = pd.DataFrame([k_features_for_model], columns=KEYSTROKE_FEATURES)
            m_input = pd.DataFrame([m_features_for_model], columns=MOUSE_FEATURES)
            
            print(f"[MODELS] Keystroke input (first 5): {k_input.iloc[0, :5].tolist()}")
            print(f"[MODELS] Mouse input: {m_input.iloc[0].tolist()}")
            
            # Keystroke model
            k_proba = keystroke_model.predict_proba(k_input)
            k_baseline_score = float(k_proba[0, 1])
            print(f"[MODELS] ✓ Keystroke baseline score: {k_baseline_score:.6f}")
            
            # Mouse model
            try:
                m_decision = mouse_model.decision_function(m_input)
                m_baseline_score = float(1.0 / (1.0 + np.exp(-m_decision[0])))
                print(f"[MODELS] ✓ Mouse baseline score (sigmoid): {m_baseline_score:.6f}")
            except AttributeError:
                m_proba = mouse_model.predict_proba(m_input)
                m_baseline_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse baseline score (proba): {m_baseline_score:.6f}")

            # Validation
            if k_baseline_score == 0.0 or k_baseline_score == 1.0:
                print(f"[WARNING] ⚠️ Keystroke score is extreme: {k_baseline_score}")
                print("[WARNING] This suggests model/feature mismatch!")
                k_baseline_score = 0.05  # Fallback
            
            if m_baseline_score == 0.0 or m_baseline_score == 1.0:
                print(f"[WARNING] ⚠️ Mouse score is extreme: {m_baseline_score}")
                print("[WARNING] This suggests model/feature mismatch!")
                m_baseline_score = 0.05  # Fallback

        except Exception as model_error:
            print(f"\n[ERROR] ❌ Model prediction failed: {model_error}")
            import traceback
            traceback.print_exc()
            k_baseline_score = 0.05
            m_baseline_score = 0.05

        # === STEP 6: Calculate Personalized Threshold ===
        print("\n[STEP 6] Calculating personalized threshold...")
        print(f"[THRESHOLD] Keystroke baseline: {k_baseline_score:.6f}")
        print(f"[THRESHOLD] Mouse baseline: {m_baseline_score:.6f}")
        
        # Threshold = baseline + significant buffer
        k_threshold = max(0.4, min(0.85, k_baseline_score + 0.35))
        m_threshold = max(0.4, min(0.85, m_baseline_score + 0.35))
        personalized_threshold = (0.5 * k_threshold) + (0.5 * m_threshold)
        personalized_threshold = max(0.55, min(0.85, personalized_threshold))
        
        print(f"[THRESHOLD] Keystroke threshold: {k_threshold:.4f}")
        print(f"[THRESHOLD] Mouse threshold: {m_threshold:.4f}")
        print(f"[THRESHOLD] ✓ FINAL threshold: {personalized_threshold:.4f}")

        # === STEP 7: Save to Database ===
        print("\n[STEP 7] Saving baseline to database...")
        
        # Store whether models need normalization
        baseline_package = {
            'keystroke': {
                'detailed_stats': k_baseline_stats,
                'needs_normalization': k_needs_norm
            },
            'mouse': {
                'detailed_stats': m_baseline_stats,
                'needs_normalization': m_needs_norm
            }
        }

        all_features = k_features_raw + m_features_raw
        fusion_mean = float(np.mean(all_features))
        fusion_std = max(float(np.std(all_features)), EPSILON)

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
            return jsonify({"error": "Failed to save baseline"}), 500

        print(f"\n{'='*80}")
        print(f"[SUCCESS] ✓✓✓ Baseline saved successfully! ✓✓✓")
        print(f"{'='*80}\n")

        return jsonify({
            "status": "baseline_saved",
            "message": "Personalized baseline calculated and saved",
            "threshold": float(personalized_threshold),
            "stats": {
                "keystroke_baseline_score": float(k_baseline_score),
                "mouse_baseline_score": float(m_baseline_score),
                "keystroke_threshold": float(k_threshold),
                "mouse_threshold": float(m_threshold),
                "fusion_mean": float(fusion_mean),
                "fusion_std": float(fusion_std),
                "keystroke_needs_normalization": k_needs_norm,
                "mouse_needs_normalization": m_needs_norm,
                "baseline_quality": "good" if k_baseline_score < 0.3 and m_baseline_score < 0.3 else "warning"
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] ❌❌❌ Calibration failed: {str(e)} ❌❌❌")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Calibration failed: {str(e)}"}), 500