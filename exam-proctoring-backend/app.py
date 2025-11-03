from flask import Flask, request, jsonify
import joblib
import numpy as np
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Load models and scalers
mouse_model = joblib.load("models/mouse_model.joblib")
key_model = joblib.load("models/keystroke_model.joblib")
mouse_scaler = joblib.load("models/scaler_mouse.joblib")
key_scaler = joblib.load("models/scaler_keystroke.joblib")

# Fusion settings from optimization
MOUSE_WEIGHT = 0.1
THRESHOLD = 0.55

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    # Extract features (from React payload)
    mouse_features = np.array(data["mouse_features"]).reshape(1, -1)
    key_features = np.array(data["keystroke_features"]).reshape(1, -1)

    # Scale features
    mouse_scaled = mouse_scaler.transform(mouse_features)
    key_scaled = key_scaler.transform(key_features)

    # Predict probabilities
    p_mouse = mouse_model.predict_proba(mouse_scaled)[:, 1]
    p_key = key_model.predict_proba(key_scaled)[:, 1]

    # Fusion
    p_fusion = (MOUSE_WEIGHT * p_mouse) + ((1 - MOUSE_WEIGHT) * p_key)
    prediction = int(p_fusion > THRESHOLD)

    return jsonify({
        "fusion_score": float(p_fusion[0]),
        "cheating_prediction": prediction
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
