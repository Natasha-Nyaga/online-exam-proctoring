# Real-time Cheating Detection Backend
# Flask + CORS + Supabase + ML models
# Implements calibration, prediction, buffered alerts, and personalized thresholds

import os
from dotenv import load_dotenv
from pathlib import Path
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# Load environment variables from .env in project root
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

app = Flask(__name__)
CORS(app)

# Load models and scalers from .env or default paths
mouse_model = joblib.load(os.getenv("MOUSE_MODEL_PATH", "models/mouse_model.joblib"))
keystroke_model = joblib.load(os.getenv("KEYSTROKE_MODEL_PATH", "models/keystroke_model.joblib"))
mouse_scaler = joblib.load(os.getenv("MOUSE_SCALER_PATH", "models/scaler_mouse.joblib"))
keystroke_scaler = joblib.load(os.getenv("KEYSTROKE_SCALER_PATH", "models/scaler_keystroke.joblib"))

MOUSE_WEIGHT = 0.10
THRESHOLD = 0.55

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
        mouse_features = np.array(data.get("mouse_features", [0]*11)).reshape(1, -1)
        keystroke_features = np.array(data.get("keystroke_features", [0]*37)).reshape(1, -1)

        mouse_scaled = mouse_scaler.transform(mouse_features)
        keystroke_scaled = keystroke_scaler.transform(keystroke_features)

        p_mouse = mouse_model.predict_proba(mouse_scaled)[0][1]
        p_keystroke = keystroke_model.predict_proba(keystroke_scaled)[0][1]
        fusion_score = (MOUSE_WEIGHT * p_mouse) + ((1 - MOUSE_WEIGHT) * p_keystroke)
        prediction = int(fusion_score > THRESHOLD)

        return jsonify({
            "fusion_score": float(fusion_score),
            "cheating_prediction": prediction
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/calibration/start", methods=["POST"])
def calibration_start():
    data = request.get_json()
    student_id = data.get("student_id")
    # For demo, just return success and echo student_id
    return jsonify({"status": "calibration started", "student_id": student_id}), 200

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)