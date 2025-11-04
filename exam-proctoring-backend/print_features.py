import joblib

mouse_scaler = joblib.load("models/scaler_mouse.joblib")
key_scaler = joblib.load("models/scaler_keystroke.joblib")

print("Mouse features:", getattr(mouse_scaler, 'feature_names_in_', None))
print("Keystroke features:", getattr(key_scaler, 'feature_names_in_', None))