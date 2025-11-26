import joblib
import os

# Global variables to hold models
mouse_model = None
keystroke_model = None

def init_models():
    """Initialize and load ML models"""
    global mouse_model, keystroke_model
    
    base_path = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_path, '../models')
    
    print("\n" + "="*60)
    print("LOADING ML MODELS")
    print("="*60)
    print(f"Base path: {base_path}")
    print(f"Models directory: {models_dir}")
    print(f"Models dir exists: {os.path.exists(models_dir)}")
    
    if os.path.exists(models_dir):
        print(f"Files in models dir: {os.listdir(models_dir)}")
    
    try:
        # Load Mouse Model (SVM)
        mouse_model_path = os.path.join(models_dir, 'svm_model.joblib')
        print(f"\n[MOUSE MODEL]")
        print(f"  Path: {mouse_model_path}")
        print(f"  Exists: {os.path.exists(mouse_model_path)}")
        
        if os.path.exists(mouse_model_path):
            mouse_model = joblib.load(mouse_model_path)
            print(f"  ✓ Loaded successfully")
            print(f"  Type: {type(mouse_model)}")
            print(f"  Has predict_proba: {hasattr(mouse_model, 'predict_proba')}")
            print(f"  Has decision_function: {hasattr(mouse_model, 'decision_function')}")
        else:
            print(f"  ❌ File not found!")
        
        # Load Keystroke Model (XGBoost)
        keystroke_model_path = os.path.join(models_dir, 'xgboost_pipeline.joblib')
        print(f"\n[KEYSTROKE MODEL]")
        print(f"  Path: {keystroke_model_path}")
        print(f"  Exists: {os.path.exists(keystroke_model_path)}")
        
        if os.path.exists(keystroke_model_path):
            keystroke_model = joblib.load(keystroke_model_path)
            print(f"  ✓ Loaded successfully")
            print(f"  Type: {type(keystroke_model)}")
            print(f"  Has predict_proba: {hasattr(keystroke_model, 'predict_proba')}")
            print(f"  Has predict: {hasattr(keystroke_model, 'predict')}")
        else:
            print(f"  ❌ File not found!")
        
        # Verify both models loaded
        if mouse_model is None or keystroke_model is None:
            print("\n❌ ERROR: One or both models failed to load!")
            print(f"   Mouse model: {'✓' if mouse_model else '✗'}")
            print(f"   Keystroke model: {'✓' if keystroke_model else '✗'}")
            raise Exception("Model loading failed")
        
        print("\n" + "="*60)
        print("✓✓✓ ALL MODELS LOADED SUCCESSFULLY ✓✓✓")
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"\n❌❌❌ ERROR LOADING MODELS: {e} ❌❌❌")
        import traceback
        traceback.print_exc()
        print("\nPlease ensure:")
        print("  1. Models exist in backend/models/ directory")
        print("  2. Files are named: svm_model.joblib, xgboost_pipeline.joblib")
        print("  3. Models were trained with same scikit-learn/xgboost versions")
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