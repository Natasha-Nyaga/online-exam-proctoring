import { useState, useEffect } from "react";

// Feature names from your scaler printout
const mouseFeatureNames = [
  "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
  "click_frequency", "click_interval_mean", "click_ratio_per_question",
  "trajectory_smoothness", "path_curvature", "transition_time"
];

const keystrokeFeatureNames = [
  "H.period", "DD.period.t", "UD.period.t", "H.t", "DD.t.i", "UD.t.i", "H.i",
  "DD.i.e", "UD.i.e", "H.e", "DD.e.five", "UD.e.five", "H.five",
  "DD.five.Shift.r", "UD.five.Shift.r", "H.Shift.r", "DD.Shift.r.o",
  "UD.Shift.r.o", "H.o", "DD.o.a", "UD.o.a", "H.a", "DD.a.n", "UD.a.n", "H.n",
  "DD.n.l", "UD.n.l", "H.l", "DD.l.Return", "UD.l.Return", "H.Return",
  "typing_speed", "digraph_mean", "digraph_variance", "trigraph_mean",
  "trigraph_variance", "error_rate"
];

export default function MLMonitorExample() {
  const [backendResult, setBackendResult] = useState(null);
  const [error, setError] = useState(null);

  // Dummy feature arrays for testing
  const mouse_features = Array(mouseFeatureNames.length).fill(0.5);
  const keystroke_features = Array(keystrokeFeatureNames.length).fill(0.5);

  // Send to backend on mount (for demo)
  useEffect(() => {
    fetch("http://127.0.0.1:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mouse_features, keystroke_features })
    })
      .then(res => res.json())
      .then(data => setBackendResult(data))
      .catch(err => setError(err.message));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>ML Cheating Detection Test</h2>
      <p>Mouse features: {JSON.stringify(mouse_features)}</p>
      <p>Keystroke features: {JSON.stringify(keystroke_features)}</p>
      {backendResult && (
        <div>
          <h3>Backend Response:</h3>
          <pre>{JSON.stringify(backendResult, null, 2)}</pre>
        </div>
      )}
      {error && (
        <div style={{ color: "red" }}>
          <h3>Error:</h3>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}
