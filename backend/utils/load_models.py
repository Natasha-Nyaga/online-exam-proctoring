import joblib
import os

# Global variables to hold models

# Existing models
mouse_model = None
keystroke_model = None

# Only initial models
def init_models():
    global mouse_model, keystroke_model
    base_path = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_path, '../models')
    try:
        print("Loading models...")
        mouse_model = joblib.load(os.path.join(models_dir, 'svm_model.joblib'))
        keystroke_model = joblib.load(os.path.join(models_dir, 'xgboost_pipeline.joblib'))
        print("✅ Models loaded successfully.")
    except Exception as e:
        print(f"❌ Error loading models: {e}")

def get_mouse_model():
    return mouse_model

def get_keystroke_model():
    return keystroke_model