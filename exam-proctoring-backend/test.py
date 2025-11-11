import joblib
m_scaler = joblib.load("models/scaler_mouse.joblib")
k_scaler = joblib.load("models/scaler_keystroke.joblib")
print("mouse scaler n_features_in_:", getattr(m_scaler,'n_features_in_', None))
print("keystroke scaler n_features_in_:", getattr(k_scaler,'n_features_in_', None))
