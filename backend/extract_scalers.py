"""
Extract scalers from your trained model pipelines.
Run this in backend directory: python extract_scalers.py
"""

import joblib
import os
import sys

def extract_scalers():
    """Extract scalers from model files"""
    
    models_dir = 'models'
    
    if not os.path.exists(models_dir):
        print("❌ 'models' directory not found!")
        print("   Run this from your backend directory")
        sys.exit(1)
    
    print("\n" + "="*70)
    print("SCALER EXTRACTION FROM TRAINED MODELS")
    print("="*70 + "\n")
    
    # Check what files exist
    model_files = os.listdir(models_dir)
    print(f"Files in models/ directory:")
    for f in model_files:
        print(f"  - {f}")
    print()
    
    # -------------------------------------------------------------------------
    # KEYSTROKE MODEL (XGBoost Pipeline)
    # -------------------------------------------------------------------------
    keystroke_model_path = os.path.join(models_dir, 'xgboost_pipeline.joblib')
    
    if not os.path.exists(keystroke_model_path):
        print("❌ xgboost_pipeline.joblib not found!")
        sys.exit(1)
    
    print("[1] Loading keystroke model...")
    keystroke_model = joblib.load(keystroke_model_path)
    print(f"    Type: {type(keystroke_model)}")
    
    # Check if it's a Pipeline
    if hasattr(keystroke_model, 'named_steps'):
        print(f"    ✓ It's a Pipeline!")
        print(f"    Steps: {list(keystroke_model.named_steps.keys())}")
        
        # Try to find scaler in pipeline
        scaler_found = False
        for step_name in keystroke_model.named_steps.keys():
            step = keystroke_model.named_steps[step_name]
            
            # Check if this step is a scaler
            if hasattr(step, 'mean_') and hasattr(step, 'scale_'):
                print(f"\n    ✓ Found scaler in step: '{step_name}'")
                print(f"    Scaler type: {type(step).__name__}")
                print(f"    Number of features: {len(step.mean_)}")
                print(f"    Mean (first 3): {step.mean_[:3]}")
                print(f"    Scale (first 3): {step.scale_[:3]}")
                
                # Save the scaler
                scaler_path = os.path.join(models_dir, 'keystroke_scaler.joblib')
                joblib.dump(step, scaler_path)
                print(f"\n    ✓ Saved to: {scaler_path}")
                scaler_found = True
                break
        
        if not scaler_found:
            print("\n    ⚠️  No scaler found in pipeline")
            print("    The model might expect raw (unscaled) features")
            print("    OR scaling is built into the model itself")
    
    elif hasattr(keystroke_model, 'mean_') and hasattr(keystroke_model, 'scale_'):
        # The model itself is a scaler (unlikely but possible)
        print("    ⚠️  Model is a scaler, not a classifier!")
        
    else:
        print("    ⚠️  Model is NOT a Pipeline")
        print(f"    Model type: {type(keystroke_model)}")
        print("    Checking if model has internal scaling...")
        
        # Some models might have preprocessing built-in
        if hasattr(keystroke_model, 'get_params'):
            params = keystroke_model.get_params()
            print(f"    Model params: {list(params.keys())[:5]}...")
    
    print("\n" + "-"*70 + "\n")
    
    # -------------------------------------------------------------------------
    # MOUSE MODEL (SVM)
    # -------------------------------------------------------------------------
    mouse_model_path = os.path.join(models_dir, 'svm_model.joblib')
    
    if not os.path.exists(mouse_model_path):
        print("❌ svm_model.joblib not found!")
        sys.exit(1)
    
    print("[2] Loading mouse model...")
    mouse_model = joblib.load(mouse_model_path)
    print(f"    Type: {type(mouse_model)}")
    
    # Check if it's a Pipeline
    if hasattr(mouse_model, 'named_steps'):
        print(f"    ✓ It's a Pipeline!")
        print(f"    Steps: {list(mouse_model.named_steps.keys())}")
        
        # Try to find scaler
        scaler_found = False
        for step_name in mouse_model.named_steps.keys():
            step = mouse_model.named_steps[step_name]
            
            if hasattr(step, 'mean_') and hasattr(step, 'scale_'):
                print(f"\n    ✓ Found scaler in step: '{step_name}'")
                print(f"    Scaler type: {type(step).__name__}")
                print(f"    Number of features: {len(step.mean_)}")
                print(f"    Mean: {step.mean_}")
                print(f"    Scale: {step.scale_}")
                
                # Save the scaler
                scaler_path = os.path.join(models_dir, 'mouse_scaler.joblib')
                joblib.dump(step, scaler_path)
                print(f"\n    ✓ Saved to: {scaler_path}")
                scaler_found = True
                break
        
        if not scaler_found:
            print("\n    ⚠️  No scaler found in pipeline")
    
    else:
        print("    ⚠️  Model is NOT a Pipeline")
        print(f"    Model type: {type(mouse_model)}")
    
    print("\n" + "="*70)
    print("EXTRACTION COMPLETE")
    print("="*70)
    
    # Final check
    k_scaler_exists = os.path.exists(os.path.join(models_dir, 'keystroke_scaler.joblib'))
    m_scaler_exists = os.path.exists(os.path.join(models_dir, 'mouse_scaler.joblib'))
    
    print("\nScaler files status:")
    print(f"  keystroke_scaler.joblib: {'✓ EXISTS' if k_scaler_exists else '✗ NOT FOUND'}")
    print(f"  mouse_scaler.joblib:     {'✓ EXISTS' if m_scaler_exists else '✗ NOT FOUND'}")
    
    if k_scaler_exists and m_scaler_exists:
        print("\n✅ SUCCESS! Both scalers extracted.")
        print("\nNext steps:")
        print("  1. Restart your Flask backend")
        print("  2. Check for 'Scaler loaded' in startup logs")
        print("  3. Run a test calibration")
    elif not k_scaler_exists and not m_scaler_exists:
        print("\n⚠️  NO SCALERS FOUND IN EITHER MODEL")
        print("\nThis means one of two things:")
        print("  A) Your models expect RAW (unscaled) features")
        print("  B) Models have built-in scaling (less common)")
        print("\nTo test if models expect raw features:")
        print("  1. Run: python test_models.py")
        print("  2. Check if predictions look reasonable")
        print("  3. If yes, your models work with raw features (no scalers needed)")
    else:
        print("\n⚠️  PARTIAL SUCCESS - only one scaler found")
        print("    Both models might not use the same approach")
    
    print("="*70 + "\n")


if __name__ == "__main__":
    try:
        extract_scalers()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)