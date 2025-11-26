"""
Test script to verify ML models are loaded and working correctly
Run this from the backend directory: python test_models.py
"""

import sys
import os
import numpy as np
import pandas as pd

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

print("="*60)
print("MODEL VERIFICATION TEST")
print("="*60)

# Test 1: Import models
print("\n[TEST 1] Importing load_models module...")
try:
    from utils.load_models import init_models, keystroke_model, mouse_model
    print("✓ Import successful")
except Exception as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)

# Test 2: Initialize models
print("\n[TEST 2] Initializing models...")
try:
    init_models()
    from utils.load_models import keystroke_model, mouse_model
    print("✓ Initialization successful")
except Exception as e:
    print(f"❌ Initialization failed: {e}")
    sys.exit(1)

# Test 3: Check models are not None
print("\n[TEST 3] Verifying models are loaded...")
if keystroke_model is None:
    print("❌ Keystroke model is None!")
    sys.exit(1)
if mouse_model is None:
    print("❌ Mouse model is None!")
    sys.exit(1)
print(f"✓ Keystroke model type: {type(keystroke_model)}")
print(f"✓ Mouse model type: {type(mouse_model)}")

# Test 4: Create sample data
print("\n[TEST 4] Creating sample input data...")
KEYSTROKE_FEATURES = [
    'mean_du_key1_key1', 'mean_dd_key1_key2', 'mean_du_key1_key2', 
    'mean_ud_key1_key2', 'mean_uu_key1_key2', 'std_du_key1_key1', 
    'std_dd_key1_key2', 'std_du_key1_key2', 'std_ud_key1_key2', 
    'std_uu_key1_key2', 'keystroke_count'
]
MOUSE_FEATURES = ['inactive_duration', 'copy_cut', 'paste', 'double_click']

# Sample normal typing behavior
k_sample = [
    50.5,   # mean_du_key1_key1 (hold time ~50ms)
    150.2,  # mean_dd_key1_key2 (key-to-key time)
    175.3,  # mean_du_key1_key2
    125.1,  # mean_ud_key1_key2
    180.4,  # mean_uu_key1_key2
    15.2,   # std_du_key1_key1
    25.3,   # std_dd_key1_key2
    22.1,   # std_du_key1_key2
    20.4,   # std_ud_key1_key2
    28.5,   # std_uu_key1_key2
    45.0    # keystroke_count
]

# Sample normal mouse behavior
m_sample = [
    5.5,   # inactive_duration (seconds)
    0.0,   # copy_cut (count)
    0.0,   # paste (count)
    1.0    # double_click (count)
]

k_input = pd.DataFrame([k_sample], columns=KEYSTROKE_FEATURES)
m_input = pd.DataFrame([m_sample], columns=MOUSE_FEATURES)

print(f"✓ Keystroke input shape: {k_input.shape}")
print(f"✓ Mouse input shape: {m_input.shape}")
print(f"\nKeystroke sample:\n{k_input.head()}")
print(f"\nMouse sample:\n{m_input.head()}")

# Test 5: Keystroke model prediction
print("\n[TEST 5] Testing keystroke model prediction...")
try:
    k_pred = keystroke_model.predict(k_input)
    print(f"✓ Predict output: {k_pred}")
    
    if hasattr(keystroke_model, 'predict_proba'):
        k_proba = keystroke_model.predict_proba(k_input)
        print(f"✓ Predict_proba output shape: {k_proba.shape}")
        print(f"✓ Predict_proba values: {k_proba}")
        print(f"✓ Anomaly probability (class 1): {k_proba[0, 1]:.6f}")
        
        if k_proba[0, 1] == 0.0:
            print("⚠️  WARNING: Anomaly probability is exactly 0.0")
            print("   This might indicate:")
            print("   - Model expects different input format")
            print("   - Features are not scaled correctly")
            print("   - Model was trained on different feature ranges")
    else:
        print("⚠️  Model doesn't have predict_proba method")
        
except Exception as e:
    print(f"❌ Keystroke prediction failed: {e}")
    import traceback
    traceback.print_exc()

# Test 6: Mouse model prediction
print("\n[TEST 6] Testing mouse model prediction...")
try:
    m_pred = mouse_model.predict(m_input)
    print(f"✓ Predict output: {m_pred}")
    
    if hasattr(mouse_model, 'decision_function'):
        m_decision = mouse_model.decision_function(m_input)
        print(f"✓ Decision_function output: {m_decision}")
        print(f"✓ Anomaly score (max(0, -decision)): {max(0.0, -m_decision[0]):.6f}")
        
        if m_decision[0] == 0.0:
            print("⚠️  WARNING: Decision function is exactly 0.0")
    
    if hasattr(mouse_model, 'predict_proba'):
        m_proba = mouse_model.predict_proba(m_input)
        print(f"✓ Predict_proba output: {m_proba}")
        print(f"✓ Anomaly probability (class 1): {m_proba[0, 1]:.6f}")
        
except Exception as e:
    print(f"❌ Mouse prediction failed: {e}")
    import traceback
    traceback.print_exc()

# Test 7: Abnormal behavior
print("\n[TEST 7] Testing with ABNORMAL behavior...")
k_abnormal = [
    10.0,   # Very short hold time
    50.0,   # Very fast typing
    60.0,
    55.0,
    65.0,
    2.0,    # Low variance
    3.0,
    2.5,
    3.5,
    2.8,
    150.0   # High keystroke count
]
m_abnormal = [
    25.0,   # Long inactive time
    10.0,   # Many copy events
    10.0,   # Many paste events
    0.0
]

k_abnormal_input = pd.DataFrame([k_abnormal], columns=KEYSTROKE_FEATURES)
m_abnormal_input = pd.DataFrame([m_abnormal], columns=MOUSE_FEATURES)

try:
    if hasattr(keystroke_model, 'predict_proba'):
        k_abnormal_proba = keystroke_model.predict_proba(k_abnormal_input)
        print(f"✓ Abnormal keystroke anomaly prob: {k_abnormal_proba[0, 1]:.6f}")
    
    if hasattr(mouse_model, 'decision_function'):
        m_abnormal_decision = mouse_model.decision_function(m_abnormal_input)
        print(f"✓ Abnormal mouse decision: {m_abnormal_decision[0]:.6f}")
        print(f"✓ Abnormal mouse anomaly score: {max(0.0, -m_abnormal_decision[0]):.6f}")
    elif hasattr(mouse_model, 'predict_proba'):
        m_abnormal_proba = mouse_model.predict_proba(m_abnormal_input)
        print(f"✓ Abnormal mouse anomaly prob: {m_abnormal_proba[0, 1]:.6f}")
        
except Exception as e:
    print(f"❌ Abnormal behavior test failed: {e}")

# Summary
print("\n" + "="*60)
print("TEST SUMMARY")
print("="*60)
print("If all tests passed, your models are working correctly.")
print("If anomaly probabilities are 0.0, check:")
print("  1. Model training data feature ranges")
print("  2. Feature scaling/normalization")
print("  3. Model expected input format")
print("="*60 + "\n")