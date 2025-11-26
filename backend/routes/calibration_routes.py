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
        # === STEP 1: Extract Features from ALL Calibration Data ===
        print("[STEP 1] Extracting features from raw events...")
        k_features_raw, k_stats_temp = KEYSTROKE_FE.extract_features(keystroke_events, baseline_stats=None)
        m_features_raw, m_stats_temp = MOUSE_FE.extract_features(mouse_events, baseline_stats=None)

        if not k_features_raw or not m_features_raw:
            return jsonify({"error": "Insufficient calibration data"}), 400

        print(f"[FEATURES] ✓ Extracted {len(k_features_raw)} keystroke features")
        print(f"[FEATURES] ✓ Extracted {len(m_features_raw)} mouse features")
        print(f"[FEATURES] Keystroke values: {[f'{v:.2f}' for v in k_features_raw[:5]]}...")
        print(f"[FEATURES] Mouse values: {[f'{v:.2f}' for v in m_features_raw]}")

        # === STEP 2: Calculate Baseline Statistics ===
        print("\n[STEP 2] Calculating baseline statistics...")
        k_baseline_stats = {}
        for i, feat_name in enumerate(KEYSTROKE_FEATURES):
            mean_val = float(k_features_raw[i]) if i < len(k_features_raw) else 0.0
            std_val = 1.0  # Will be updated during exam as we collect more data
            k_baseline_stats[feat_name] = {'mean': mean_val, 'std': std_val}

        m_baseline_stats = {}
        for i, feat_name in enumerate(MOUSE_FEATURES):
            mean_val = float(m_features_raw[i]) if i < len(m_features_raw) else 0.0
            std_val = 1.0
            m_baseline_stats[feat_name] = {'mean': mean_val, 'std': std_val}

        print(f"[BASELINE] ✓ Keystroke baseline calculated for {len(k_baseline_stats)} features")
        print(f"[BASELINE] ✓ Mouse baseline calculated for {len(m_baseline_stats)} features")

        # === STEP 3: Calculate Personalized Threshold Using Models ===
        print("\n[STEP 3] Running ML models to calculate personalized threshold...")
        
        k_baseline_score = 0.0
        m_baseline_score = 0.0
        
        try:
            # Verify models are loaded
            if keystroke_model is None:
                print("[ERROR] ❌ Keystroke model is None!")
                raise Exception("Keystroke model not loaded")
            if mouse_model is None:
                print("[ERROR] ❌ Mouse model is None!")
                raise Exception("Mouse model not loaded")
            
            print(f"[MODELS] ✓ Models loaded successfully")
            print(f"[MODELS] Keystroke model type: {type(keystroke_model)}")
            print(f"[MODELS] Mouse model type: {type(mouse_model)}")
            
            # Create input DataFrames
            k_input = pd.DataFrame([k_features_raw], columns=KEYSTROKE_FEATURES)
            m_input = pd.DataFrame([m_features_raw], columns=MOUSE_FEATURES)
            
            print(f"[MODELS] Input shapes - Keystroke: {k_input.shape}, Mouse: {m_input.shape}")
            print(f"[MODELS] Keystroke input sample:\n{k_input.head()}")
            print(f"[MODELS] Mouse input sample:\n{m_input.head()}")
            
            # Keystroke Model Prediction
            print("\n[MODELS] Running keystroke model prediction...")
            k_proba = keystroke_model.predict_proba(k_input)
            print(f"[MODELS] Keystroke predict_proba output shape: {k_proba.shape}")
            print(f"[MODELS] Keystroke predict_proba values: {k_proba}")
            k_baseline_score = float(k_proba[0, 1])
            print(f"[MODELS] ✓ Keystroke baseline score: {k_baseline_score:.6f}")
            
            # Mouse Model Prediction
            print("\n[MODELS] Running mouse model prediction...")
            try:
                # Try decision_function first (for SVM)
                m_decision = mouse_model.decision_function(m_input)
                print(f"[MODELS] Mouse decision_function output: {m_decision}")
                m_baseline_score = max(0.0, -float(m_decision[0]))
                print(f"[MODELS] ✓ Mouse baseline score (from decision): {m_baseline_score:.6f}")
            except AttributeError:
                # Fallback to predict_proba
                print("[MODELS] decision_function not available, using predict_proba...")
                m_proba = mouse_model.predict_proba(m_input)
                print(f"[MODELS] Mouse predict_proba output: {m_proba}")
                m_baseline_score = float(m_proba[0, 1])
                print(f"[MODELS] ✓ Mouse baseline score (from proba): {m_baseline_score:.6f}")

        except Exception as model_error:
            print(f"\n[ERROR] ❌ Model prediction failed: {model_error}")
            import traceback
            traceback.print_exc()
            print("[WARNING] Using fallback baseline scores")
            k_baseline_score = 0.1  # Low baseline for normal behavior
            m_baseline_score = 0.1

        # Calculate threshold
        print("\n[STEP 4] Calculating personalized threshold...")
        print(f"[THRESHOLD] Keystroke baseline score: {k_baseline_score:.6f}")
        print(f"[THRESHOLD] Mouse baseline score: {m_baseline_score:.6f}")
        
        # Set threshold as 2.5x the baseline scores (with safety bounds)
        k_threshold = max(0.3, min(0.9, k_baseline_score * 2.5))
        m_threshold = max(0.3, min(0.9, m_baseline_score * 2.5))
        
        # Fusion threshold (weighted average)
        personalized_threshold = (0.5 * k_threshold) + (0.5 * m_threshold)
        personalized_threshold = max(0.5, min(0.85, personalized_threshold))
        
        print(f"[THRESHOLD] Keystroke threshold (2.5x baseline): {k_threshold:.4f}")
        print(f"[THRESHOLD] Mouse threshold (2.5x baseline): {m_threshold:.4f}")
        print(f"[THRESHOLD] ✓ FINAL Personalized threshold: {personalized_threshold:.4f}")

        # === STEP 5: Save to Database ===
        print("\n[STEP 5] Saving baseline to database...")
        baseline_package = {
            'keystroke': {'detailed_stats': k_baseline_stats},
            'mouse': {'detailed_stats': m_baseline_stats}
        }

        fusion_mean = float(np.mean(k_features_raw + m_features_raw))
        fusion_std = max(float(np.std(k_features_raw + m_features_raw)), EPSILON)

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
                "mouse_features_count": len(m_features_raw)
            }
        }), 200

    except Exception as e:
        print(f"\n[ERROR] ❌❌❌ Calibration failed: {str(e)} ❌❌❌")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Calibration failed: {str(e)}"}), 500