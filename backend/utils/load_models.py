import joblib
import os

# Global variables to hold models AND scalers
mouse_model = None
keystroke_model = None
mouse_scaler = None
keystroke_scaler = None

def init_models():
    """Initialize and load ML models and their scalers"""
    global mouse_model, keystroke_model, mouse_scaler, keystroke_scaler
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_path, '../models')
    
    print("\n" + "="*60)
    print("LOADING ML MODELS AND SCALERS")
    print("="*60)
    print(f"Base path: {base_path}")
    print(f"Models directory: {models_dir}")
    print(f"Models dir exists: {os.path.exists(models_dir)}")
    
    if os.path.exists(models_dir):
        print(f"Files in models dir: {os.listdir(models_dir)}")
    
    try:
        # =====================================================================
        # MOUSE MODEL + SCALER
        # =====================================================================
        mouse_model_path = os.path.join(models_dir, 'svm_model.joblib')
        mouse_scaler_path = os.path.join(models_dir, 'mouse_scaler.joblib')
        
        print(f"\n[MOUSE MODEL]")
        print(f"  Path: {mouse_model_path}")
        print(f"  Exists: {os.path.exists(mouse_model_path)}")
        
        if os.path.exists(mouse_model_path):
            mouse_model = joblib.load(mouse_model_path)
            print(f"  ✓ Model loaded")
            print(f"  Type: {type(mouse_model)}")
            print(f"  Has predict_proba: {hasattr(mouse_model, 'predict_proba')}")
            print(f"  Has decision_function: {hasattr(mouse_model, 'decision_function')}")
            
            # Check if model is a Pipeline with embedded scaler
            if hasattr(mouse_model, 'named_steps'):
                print(f"  ✓ Model is a Pipeline")
                print(f"  Pipeline steps: {list(mouse_model.named_steps.keys())}")
                
                # Try to extract scaler from pipeline
                for step_name in ['scaler', 'standardscaler', 'preprocessing']:
                    if step_name in mouse_model.named_steps:
                        extracted_scaler = mouse_model.named_steps[step_name]
                        if hasattr(extracted_scaler, 'mean_') and hasattr(extracted_scaler, 'scale_'):
                            mouse_scaler = extracted_scaler
                            print(f"  ✓ Extracted scaler from pipeline step '{step_name}'")
                            print(f"  Scaler mean: {mouse_scaler.mean_}")
                            print(f"  Scaler scale: {mouse_scaler.scale_}")
                            break
        else:
            print(f"  ❌ Model file not found!")
        
        # Try to load separate scaler file if not found in pipeline
        if mouse_scaler is None and os.path.exists(mouse_scaler_path):
            mouse_scaler = joblib.load(mouse_scaler_path)
            print(f"  ✓ Loaded separate scaler file")
            print(f"  Scaler mean: {mouse_scaler.mean_}")
            print(f"  Scaler scale: {mouse_scaler.scale_}")
        elif mouse_scaler is None:
            print(f"  ⚠️  No scaler found (will use raw features)")
        
        # =====================================================================
        # KEYSTROKE MODEL + SCALER
        # =====================================================================
        keystroke_model_path = os.path.join(models_dir, 'xgboost_pipeline.joblib')
        keystroke_scaler_path = os.path.join(models_dir, 'keystroke_scaler.joblib')
        
        print(f"\n[KEYSTROKE MODEL]")
        print(f"  Path: {keystroke_model_path}")
        print(f"  Exists: {os.path.exists(keystroke_model_path)}")
        
        if os.path.exists(keystroke_model_path):
            keystroke_model = joblib.load(keystroke_model_path)
            print(f"  ✓ Model loaded")
            print(f"  Type: {type(keystroke_model)}")
            print(f"  Has predict_proba: {hasattr(keystroke_model, 'predict_proba')}")
            print(f"  Has predict: {hasattr(keystroke_model, 'predict')}")
            
            # Check if model is a Pipeline with embedded scaler
            if hasattr(keystroke_model, 'named_steps'):
                print(f"  ✓ Model is a Pipeline")
                print(f"  Pipeline steps: {list(keystroke_model.named_steps.keys())}")
                
                # Try to extract scaler from pipeline
                for step_name in ['scaler', 'standardscaler', 'preprocessing']:
                    if step_name in keystroke_model.named_steps:
                        extracted_scaler = keystroke_model.named_steps[step_name]
                        if hasattr(extracted_scaler, 'mean_') and hasattr(extracted_scaler, 'scale_'):
                            keystroke_scaler = extracted_scaler
                            print(f"  ✓ Extracted scaler from pipeline step '{step_name}'")
                            print(f"  Scaler mean (first 3): {keystroke_scaler.mean_[:3]}")
                            print(f"  Scaler scale (first 3): {keystroke_scaler.scale_[:3]}")
                            break
        else:
            print(f"  ❌ Model file not found!")
        
        # Try to load separate scaler file if not found in pipeline
        if keystroke_scaler is None and os.path.exists(keystroke_scaler_path):
            keystroke_scaler = joblib.load(keystroke_scaler_path)
            print(f"  ✓ Loaded separate scaler file")
            print(f"  Scaler mean (first 3): {keystroke_scaler.mean_[:3]}")
            print(f"  Scaler scale (first 3): {keystroke_scaler.scale_[:3]}")
        elif keystroke_scaler is None:
            print(f"  ⚠️  No scaler found (will use raw features)")
        
        # =====================================================================
        # VERIFICATION
        # =====================================================================
        if mouse_model is None or keystroke_model is None:
            print("\n❌ ERROR: One or both models failed to load!")
            print(f"   Mouse model: {'✓' if mouse_model else '✗'}")
            print(f"   Keystroke model: {'✓' if keystroke_model else '✗'}")
            raise Exception("Model loading failed")
        
        print("\n" + "="*60)
        print("✓✓✓ ALL MODELS LOADED SUCCESSFULLY ✓✓✓")
        if keystroke_scaler or mouse_scaler:
            print("✓✓✓ SCALERS LOADED ✓✓✓")
            print(f"    Keystroke scaler: {'✓' if keystroke_scaler else '✗ (will use raw features)'}")
            print(f"    Mouse scaler: {'✓' if mouse_scaler else '✗ (will use raw features)'}")
        else:
            print("⚠️  NO SCALERS FOUND - USING RAW FEATURES")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n❌❌❌ ERROR LOADING MODELS: {e} ❌❌❌")
        import traceback
        traceback.print_exc()
        raise

def get_mouse_model():
    """Get the loaded mouse model"""
    if mouse_model is None:
        raise Exception("Mouse model not initialized. Call init_models() first.")
    return mouse_model

def get_keystroke_model():
    """Get the loaded keystroke model"""
    if keystroke_model is None:
        raise Exception("Keystroke model not initialized. Call init_models() first.")
    return keystroke_model

def get_mouse_scaler():
    """Get the loaded mouse scaler (may be None if not found)"""
    return mouse_scaler

def get_keystroke_scaler():
    """Get the loaded keystroke scaler (may be None if not found)"""
    return keystroke_scaler