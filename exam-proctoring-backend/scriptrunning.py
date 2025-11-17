import joblib

k = joblib.load("models/keystroke_model.joblib")
print(k.feature_names_in_)
