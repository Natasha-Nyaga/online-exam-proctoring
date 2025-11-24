import requests
import requests
import json

payload = {
    "student_id": "e15cb3cc-4788-4a7a-a1d8-2540c17469c4",
    "calibration_session_id": "a2472170-9f9e-4f54-a206-a62828b1b5be",
    "course_name": "Math101",
    "keystroke_events": [
        {"key": "a", "down_time": 1637760000.123, "up_time": 1637760000.223, "timestamp": 1637760000.123, "type": "keydown"},
        {"key": "b", "down_time": 1637760000.300, "up_time": 1637760000.400, "timestamp": 1637760000.300, "type": "keydown"},
        {"key": "c", "down_time": 1637760000.500, "up_time": 1637760000.600, "timestamp": 1637760000.500, "type": "keydown"}
    ],
    "mouse_events": [
        {"type": "move", "timestamp": 1637760000.150, "x": 100, "y": 200},
        {"type": "click", "timestamp": 1637760000.250, "x": 110, "y": 210},
        {"type": "double_click", "timestamp": 1637760000.350, "x": 120, "y": 220}
    ],
    "threshold": 0.8
}

url = "http://127.0.0.1:5000/api/calibration/save-baseline"
headers = {"Content-Type": "application/json"}

response = requests.post(url, headers=headers, data=json.dumps(payload))
print("Status Code:", response.status_code)
print("Response:", response.text)
