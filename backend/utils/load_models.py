import joblib
import os

# Global variables to hold models

# Existing models
mouse_model = None
keystroke_model = None

# New real-time models
mouse_rt_model = None
keystroke_rt_model = None

def init_models():
    global mouse_model, keystroke_model, mouse_rt_model, keystroke_rt_model
    base_path = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_path, '../models')

    try:
        print("Loading models...")
        # Load Mouse Model (SVM)
        mouse_model = joblib.load(os.path.join(models_dir, 'svm_model.joblib'))
        # Load Mouse Real-Time Model (SVM)
        mouse_rt_model = joblib.load(os.path.join(models_dir, 'svm_mouse_rt_model.joblib'))

        # Load Keystroke Model (XGBoost)
        keystroke_model = joblib.load(os.path.join(models_dir, 'xgboost_pipeline.joblib'))
        # Load Keystroke Real-Time Model (XGBoost)
        keystroke_rt_model = joblib.load(os.path.join(models_dir, 'keystroke_rt_xgb_model.joblib'))

        print("✅ Models loaded successfully.")
    except Exception as e:
        print(f"❌ Error loading models: {e}")


def get_mouse_model():
    return mouse_model

def get_keystroke_model():
    return keystroke_model

def get_mouse_rt_model():
    return mouse_rt_model

def get_keystroke_rt_model():
    return keystroke_rt_model