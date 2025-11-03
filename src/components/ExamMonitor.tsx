import { useState, useEffect } from "react";

function ExamMonitor() {
  const [mouseData, setMouseData] = useState([]);
  const [keystrokeData, setKeystrokeData] = useState([]);
  const [cheatingScore, setCheatingScore] = useState(null);
  const [isCheating, setIsCheating] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMouseData(prev => [...prev, { x: e.clientX, y: e.clientY, t: Date.now() }]);
    };

    const handleKeyDown = (e) => {
      setKeystrokeData(prev => [...prev, { key: e.key, t: Date.now() }]);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Simulated feature extraction (replace later with real metrics)
  const extractFeatures = () => {
    const avgMouseSpeed = Math.random(); // placeholder
    const avgLatency = Math.random(); // placeholder
    return {
      mouse_features: [avgMouseSpeed, 0.2, 0.8, 0.3],
      keystroke_features: [avgLatency, 0.4, 0.6, 0.9]
    };
  };

  const sendToBackend = async () => {
    const features = extractFeatures();

    try {
      const response = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features),
      });

      const result = await response.json();
      setCheatingScore(result.fusion_score);
      setIsCheating(result.cheating_prediction === 1);
    } catch (error) {
      console.error("Error sending data:", error);
    }
  };

  // Send to backend every 10 seconds
  useEffect(() => {
    const interval = setInterval(sendToBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Exam Monitor</h2>
      {cheatingScore !== null ? (
        <>
          <p>Fusion Score: {cheatingScore.toFixed(3)}</p>
          <p>Status: {isCheating ? "🚨 Suspicious Behavior Detected" : "✅ Normal"}</p>
        </>
      ) : (
        <p>Collecting behavioral data...</p>
      )}
    </div>
  );
}

export default ExamMonitor;
