from flask import Blueprint, request, jsonify
import numpy as np
import json
import os

threshold_bp = Blueprint("threshold_bp", __name__)

THRESHOLD_FILE = "models/thresholds.json"

# Ensure file exists
if not os.path.exists(THRESHOLD_FILE):
    with open(THRESHOLD_FILE, "w") as f:
        json.dump({}, f)


def load_thresholds():
    with open(THRESHOLD_FILE, "r") as f:
        return json.load(f)


def save_thresholds(data):
    with open(THRESHOLD_FILE, "w") as f:
        json.dump(data, f, indent=4)


def load_thresholds_for(student_id):
    if not os.path.exists(THRESHOLD_FILE):
        return {}
    with open(THRESHOLD_FILE, "r") as f:
        all_thresholds = json.load(f)
    return all_thresholds.get(student_id, {})


def save_thresholds_for(student_id, thresholds):
    if not os.path.exists(THRESHOLD_FILE):
        all_thresholds = {}
    else:
        with open(THRESHOLD_FILE, "r") as f:
            all_thresholds = json.load(f)
    all_thresholds[student_id] = thresholds
    with open(THRESHOLD_FILE, "w") as f:
        json.dump(all_thresholds, f, indent=4)


@threshold_bp.route("/set-threshold", methods=["POST"])
def set_threshold():
    """
    Called after calibration phase.
    Receives a list of normal fusion scores for a student and computes a personalized threshold.
    """
    try:
        data = request.get_json()
        student_id = data.get("student_id")
        fusion_scores = data.get("fusion_scores")

        if not student_id or not fusion_scores:
            return jsonify({"error": "Missing student_id or fusion_scores"}), 400

        # Calculate threshold (mean + 2×std to reduce false positives)
        mean = np.mean(fusion_scores)
        std = np.std(fusion_scores)
        personalized_threshold = round(float(mean + (2 * std)), 4)

        thresholds = load_thresholds()
        thresholds[student_id] = personalized_threshold
        save_thresholds(thresholds)

        print(f"[Backend] Personalized threshold set for {student_id}: {personalized_threshold}")

        return jsonify({
            "student_id": student_id,
            "personalized_threshold": personalized_threshold,
            "mean": round(float(mean), 4),
            "std": round(float(std), 4),
            "message": "Threshold successfully set"
        })

    except Exception as e:
        print("[Backend] Error setting threshold:", e)
        return jsonify({"error": str(e)}), 500


@threshold_bp.route("/get-threshold", methods=["GET"])
def get_threshold():
    """
    Returns both mouse and keystroke thresholds for a student, fallback to 0.85 if missing.
    """
    try:
        student_id = request.args.get("student_id")
        thresholds = load_thresholds_for(student_id)

        mouse_threshold = thresholds.get("mouse_threshold", 0.85)
        keystroke_threshold = thresholds.get("keystroke_threshold", 0.85)

        print(f"[Backend] Thresholds retrieved for {student_id}: mouse={mouse_threshold}, keystroke={keystroke_threshold}")
        return jsonify({
            "student_id": student_id,
            "mouse_threshold": mouse_threshold,
            "keystroke_threshold": keystroke_threshold
        })

    except Exception as e:
        print("[Backend] Error fetching threshold:", e)
        return jsonify({"error": str(e)}), 500
