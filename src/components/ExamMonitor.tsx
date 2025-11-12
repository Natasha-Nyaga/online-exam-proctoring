// ===========================================================
// ExamMonitor.tsx (Final Version - Personalized Thresholds)
// ===========================================================
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [thresholds, setThresholds] = useState<{ mouse: number; keystroke: number }>({ mouse: 0.85, keystroke: 0.85 });
  const [mouseData, setMouseData] = useState<any[]>([]);
  const [keyData, setKeyData] = useState<any[]>([]);
  const [fusionScore, setFusionScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Collecting...");
  const [buffered, setBuffered] = useState<boolean[]>([]);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isEssay = currentQuestionIndex >= 5;
  const questionType = isEssay ? "essay" : "mcq";

  // ===========================================================
  // STEP 1: Fetch personalized thresholds
  // ===========================================================
  useEffect(() => {
    const fetchThresholds = async () => {
      if (!studentId) return;
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
        const res = await fetch(`${backendUrl}/get-threshold?student_id=${studentId}`);
        const data = await res.json();

        // if personalized thresholds are stored per modality
        if (data.mouse_threshold && data.keystroke_threshold) {
          setThresholds({
            mouse: parseFloat(data.mouse_threshold),
            keystroke: parseFloat(data.keystroke_threshold),
          });
          console.log(`[ExamMonitor] Personalized thresholds loaded: mouse=${data.mouse_threshold}, keystroke=${data.keystroke_threshold}`);
        } else {
          console.warn("[ExamMonitor] No personalized thresholds found, using defaults.");
          setThresholds({ mouse: 0.85, keystroke: 0.85 });
        }
      } catch (err) {
        console.error("[ExamMonitor] Error fetching thresholds:", err);
        setThresholds({ mouse: 0.85, keystroke: 0.85 });
      }
    };

    fetchThresholds();
  }, [studentId]);

  // ===========================================================
  // STEP 2: Attach listeners for mouse and keyboard activity
  // ===========================================================
  useEffect(() => {
    console.log("[ExamMonitor] Mounting event listeners...");

    const handleMouseMove = (e: MouseEvent) => {
      setMouseData(prev => [...prev.slice(-400), { x: e.clientX, y: e.clientY, t: Date.now() }]);
    };

    const handleClick = () => {
      setMouseData(prev => [...prev.slice(-400), { click: true, t: Date.now() }]);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      setKeyData(prev => [...prev.slice(-200), { key: e.key, type: "down", t: Date.now() }]);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeyData(prev => [...prev.slice(-200), { key: e.key, type: "up", t: Date.now() }]);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ===========================================================
  // STEP 3: Extract features
  // ===========================================================
  const extractMouseFeatures = () => {
    if (mouseData.length < 2) return null;
    let path_length = 0, total_time = 0, clicks = 0;
    for (let i = 1; i < mouseData.length; i++) {
      const prev = mouseData[i - 1], curr = mouseData[i];
      if (!prev.x || !curr.x) continue;
      const dx = curr.x - prev.x, dy = curr.y - prev.y;
      const dt = (curr.t - prev.t) / 1000;
      if (dt > 0) {
        path_length += Math.hypot(dx, dy);
        total_time += dt;
      }
      if (curr.click) clicks++;
    }
    const avg_speed = total_time > 0 ? path_length / total_time : 0;
    const click_frequency = total_time > 0 ? clicks / total_time : 0;
    return {
      path_length, avg_speed, idle_time: 0, dwell_time: 0, hover_time: 0,
      click_frequency, click_interval_mean: 0, click_ratio_per_question: 0,
      trajectory_smoothness: 0, path_curvature: 0, transition_time: 0,
    };
  };

  const extractKeystrokeFeatures = () => {
    if (keyData.length < 2) return null;
    const downs = keyData.filter(d => d.type === "down");
    const ups = keyData.filter(d => d.type === "up");
    const dwell_times: number[] = [];
    downs.forEach(d => {
      const u = ups.find(u => u.key === d.key && u.t > d.t);
      if (u) dwell_times.push(u.t - d.t);
    });
    const typing_duration =
      downs.length > 1 ? (downs[downs.length - 1].t - downs[0].t) / 1000 : 1;
    const typing_speed = downs.length / typing_duration;
    const features: Record<string, number> = {};
    KEYSTROKE_FEATURE_ORDER.forEach(k => (features[k] = 0));
    features["typing_speed"] = typing_speed;
    return features;
  };

  // ===========================================================
  // STEP 4: Send predictions to backend
  // ===========================================================
  const sendPredict = async () => {
    console.log("[ExamMonitor] Data buffer sizes:", mouseData.length, keyData.length);
    if (mouseData.length < 10 && keyData.length < 10) {
      console.warn("[ExamMonitor] Not enough data yet, skipping prediction cycle.");
      return;
    }

    const mouse_features = extractMouseFeatures();
    const keystroke_features = extractKeystrokeFeatures();

    if (!mouse_features && !keystroke_features) {
      console.warn("[ExamMonitor] No usable features; skipping this round.");
      return;
    }

    const payload = {
      studentId,
      sessionId,
      questionType,
      mouse_features: isEssay ? null : mouse_features,
      keystroke_features: isEssay ? keystroke_features : null,
    };

    console.log(`[ExamMonitor] Sending ${questionType} features for prediction...`);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
      const res = await fetch(`${backendUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      console.log("[ExamMonitor] /predict response:", result);

      setFusionScore(result.fusion_score ?? 0);
      const usedThreshold = isEssay ? thresholds.keystroke : thresholds.mouse;

      if (result.fusion_score > usedThreshold) {
        setStatus("⚠️ Suspicious Activity");
        toast.warning(`Suspicious behavior detected (score ${result.fusion_score.toFixed(3)} > ${usedThreshold})`);
      } else {
        setStatus("✅ Normal");
      }

      // Reset old data
      const cutoff = Date.now() - 4000;
      setMouseData(prev => prev.filter(d => d.t > cutoff));
      setKeyData(prev => prev.filter(d => d.t > cutoff));

    } catch (err) {
      console.error("[ExamMonitor] Prediction error:", err);
      toast.error("Prediction failed");
    }
  };

  // ===========================================================
  // STEP 5: Run periodic predictions
  // ===========================================================
  useEffect(() => {
    if (studentId && sessionId) {
      const interval = setInterval(sendPredict, 8000);
      return () => clearInterval(interval);
    }
  }, [studentId, sessionId, thresholds]);

  // ===========================================================
  // UI
  // ===========================================================
  return (
    <div className="p-4 bg-card rounded-xl shadow-md mt-4 border border-border relative">
      {simulationMode && (
        <Badge variant="destructive" className="absolute top-2 right-2 animate-pulse">
          Sim Mode
        </Badge>
      )}
      <div className="flex justify-between mb-4">
        <h2 className="font-semibold text-lg">Exam Behavior Monitor</h2>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Session ID:</span>
          <span className="font-mono">{sessionId || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fusion Score:</span>
          <span className="font-mono">{fusionScore?.toFixed(3) ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mouse Threshold:</span>
          <span className="font-mono">{thresholds.mouse.toFixed(3)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Keystroke Threshold:</span>
          <span className="font-mono">{thresholds.keystroke.toFixed(3)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span
            className={`font-medium ${
              status.includes("⚠️")
                ? "text-yellow-600 dark:text-yellow-400"
                : status.includes("🚨")
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ExamMonitor;
