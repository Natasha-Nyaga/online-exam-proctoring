import { useState, useEffect } from "react";
import { toast } from "sonner";

const MOUSE_FEATURE_ORDER = [
  "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
  "click_frequency", "click_interval_mean", "click_ratio_per_question",
  "trajectory_smoothness", "path_curvature", "transition_time"
];

const KEYSTROKE_FEATURE_ORDER = [
  "H.period", "DD.period.t", "UD.period.t", "H.t", "DD.t.i", "UD.t.i", "H.i",
  "DD.i.e", "UD.i.e", "H.e", "DD.e.five", "UD.e.five", "H.five",
  "DD.five.Shift.r", "UD.five.Shift.r", "H.Shift.r", "DD.Shift.r.o",
  "UD.Shift.r.o", "H.o", "DD.o.a", "UD.o.a", "H.a", "DD.a.n", "UD.a.n",
  "H.n", "DD.n.l", "UD.n.l", "H.l", "DD.l.Return", "UD.l.Return",
  "H.Return", "typing_speed", "digraph_mean", "digraph_variance",
  "trigraph_mean", "trigraph_variance", "error_rate"
];

function ExamMonitor({ studentId, sessionId }: { studentId: string; sessionId: string }) {
  const [mouseData, setMouseData] = useState<any[]>([]);
  const [keyData, setKeyData] = useState<any[]>([]);
  const [fusionScore, setFusionScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Collecting");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [buffered, setBuffered] = useState<boolean[]>([]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) =>
      setMouseData((p) => [...p, { x: e.clientX, y: e.clientY, t: Date.now() }]);
    const handleClick = (e: MouseEvent) =>
      setMouseData((p) => [...p, { click: true, t: Date.now() }]);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) =>
      setKeyData((p) => [...p, { key: e.key, t: Date.now(), type: "down" }]);
    const up = (e: KeyboardEvent) =>
      setKeyData((p) => [...p, { key: e.key, t: Date.now(), type: "up" }]);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const extractMouseFeatures = () => {
    let path_length = 0, total_time = 0, clicks = 0;
    for (let i = 1; i < mouseData.length; i++) {
      const dx = mouseData[i].x - mouseData[i - 1].x;
      const dy = mouseData[i].y - mouseData[i - 1].y;
      const dt = (mouseData[i].t - mouseData[i - 1].t) / 1000;
      if (dt > 0) {
        path_length += Math.hypot(dx, dy);
        total_time += dt;
      }
      if (mouseData[i].click) clicks++;
    }
    const avg_speed = total_time > 0 ? path_length / total_time : 0;
    const click_frequency = total_time > 0 ? clicks / total_time : 0;
    console.log("[ExamMonitor] Mouse features:", { path_length, avg_speed, click_frequency });
    return {
      path_length,
      avg_speed,
      idle_time: 0,
      dwell_time: 0,
      hover_time: 0,
      click_frequency,
      click_interval_mean: 0,
      click_ratio_per_question: 0,
      trajectory_smoothness: 0,
      path_curvature: 0,
      transition_time: 0,
    };
  };

  const extractKeystrokeFeatures = () => {
    const downs = keyData.filter((d) => d.type === "down");
    const ups = keyData.filter((d) => d.type === "up");
    const dwell_times: number[] = [];
    downs.forEach((d) => {
      const u = ups.find((u) => u.key === d.key && u.t > d.t);
      if (u) dwell_times.push(u.t - d.t);
    });
    const typing_duration =
      downs.length > 1 ? (downs[downs.length - 1].t - downs[0].t) / 1000 : 1;
    const typing_speed = downs.length / typing_duration;
    const features: Record<string, number> = {};
    KEYSTROKE_FEATURE_ORDER.forEach((key) => {
      features[key] = 0;
    });
    features["typing_speed"] = typing_speed;
    console.log("[ExamMonitor] Keystroke features:", features);
    return features;
  };

  const sendPredict = async () => {
    if (!studentId || !sessionId) return;
    const mouse_features_obj = extractMouseFeatures();
    const keystroke_features_obj = extractKeystrokeFeatures();
    console.log("[ExamMonitor] Sending to /predict", { studentId, sessionId, mouse_features_obj, keystroke_features_obj });
    try {
      const r = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mouse_features: Object.fromEntries(
            MOUSE_FEATURE_ORDER.map((f) => [f, mouse_features_obj[f]])
          ),
          keystroke_features: Object.fromEntries(
            KEYSTROKE_FEATURE_ORDER.map((f) => [f, keystroke_features_obj[f]])
          ),
          student_id: studentId,
          session_id: sessionId,
        }),
      });
      const res = await r.json();
      console.log("[ExamMonitor] /predict response:", res);
      setFusionScore(res.fusion_score);
      setThreshold(res.user_threshold);
      setBuffered((prev) => {
        const next = [...prev, res.fusion_score > res.user_threshold];
        return next.length > 3 ? next.slice(-3) : next;
      });
      if (res.cheating_prediction) {
        setStatus("🚨 Cheating incident recorded");
        toast.error("🚨 Cheating incident recorded");
      } else if (res.fusion_score > res.user_threshold) {
        setStatus("⚠️ Suspicious");
        toast.warning("Suspicious behaviour detected");
      } else {
        setStatus("✅ Normal");
      }
      setMouseData([]);
      setKeyData([]);
    } catch (err) {
      console.error("[ExamMonitor] Prediction failed", err);
      toast.error("Prediction failed");
    }
  };

  useEffect(() => {
    if (studentId && sessionId) {
      const interval = setInterval(sendPredict, 10000);
      return () => clearInterval(interval);
    }
  }, [studentId, sessionId]);

  return (
    <div className="p-4 bg-white rounded-xl shadow-md mt-4">
      <h2 className="font-semibold text-lg mb-2">Exam Behaviour Monitor</h2>
      <div className="mb-2">Session ID: {sessionId || "-"}</div>
      <div className="mb-2">
        Threshold: {threshold !== null ? threshold.toFixed(3) : "-"}
      </div>
      <div className="mb-2">
        Fusion Score: {fusionScore !== null ? fusionScore.toFixed(3) : "-"}
      </div>
      <div className="mb-2">Status: {status}</div>
      <div className="mb-2">
        Buffered: {buffered.map((b) => (b ? "🚨" : "✅")).join(" ")}
      </div>
    </div>
  );
}

export default ExamMonitor;
