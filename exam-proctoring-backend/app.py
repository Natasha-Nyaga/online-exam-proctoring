from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib, numpy as np

app = Flask(__name__)
CORS(app)

# Load models + scalers
mouse_model = joblib.load("models/mouse_model.joblib")
key_model   = joblib.load("models/keystroke_model.joblib")
mouse_scaler = joblib.load("models/scaler_mouse.joblib")
key_scaler   = joblib.load("models/scaler_keystroke.joblib")

# Fusion settings (from optimization)
MOUSE_WEIGHT = 0.10
THRESHOLD    = 0.55

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        print("Received data:", data)
        # Validate input
        if not data or "mouse_features" not in data or "keystroke_features" not in data:
            return jsonify({"error": "Missing mouse_features or keystroke_features in request."}), 400

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

        print(f"Fusion={p_fusion[0]:.3f}  Pred={prediction}")
        return jsonify({
            "fusion_score": float(p_fusion[0]),
            "cheating_prediction": prediction
        })
    except Exception as e:
        print("❌ Error in /predict:", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

# Test the scalers
#mouse_scaler = joblib.load("models/scaler_mouse.joblib")
#key_scaler = joblib.load("models/scaler_keystroke.joblib")

#print("Mouse features:", getattr(mouse_scaler, 'feature_names_in_', None))
#print("Keystroke features:", getattr(key_scaler, 'feature_names_in_', None))