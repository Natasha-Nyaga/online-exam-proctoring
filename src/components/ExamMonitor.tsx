const PREDICT_INTERVAL_MS = 10000; // 10s (you can reduce to 5000 for testing)
const KEEP_MS = 30_000;            // keep last 30s of raw events (sliding window)
const MIN_EVENTS_MOUSE = 2;        // minimum samples to compute mouse-derived features
const MIN_EVENTS_KEYS = 1;         // minimum key downs to compute typing features

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
  // Step 1: Add browser event logging for verification
  useEffect(() => {
    window.addEventListener("mousemove", e => console.log("MOVE", e.clientX, e.clientY));
    window.addEventListener("click", e => console.log("CLICK"));
    window.addEventListener("keydown", e => console.log("DOWN", e.key));
    return () => {
      window.removeEventListener("mousemove", e => console.log("MOVE", e.clientX, e.clientY));
      window.removeEventListener("click", e => console.log("CLICK"));
      window.removeEventListener("keydown", e => console.log("DOWN", e.key));
    };
  }, []);
  const [mouseData, setMouseData] = useState<any[]>([]);
  const [keyData, setKeyData] = useState<any[]>([]);
  const [fusionScore, setFusionScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Collecting");
  const [threshold, setThreshold] = useState<number>(0.85); // default
  const [buffered, setBuffered] = useState<boolean[]>([]);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Fetch Personalized Threshold on Mount ---
  useEffect(() => {
    async function fetchThreshold() {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
        const res = await fetch(`${backendUrl}/get-threshold?student_id=${studentId}`);
        if (!res.ok) throw new Error("No threshold found");
        const data = await res.json();
        if (data?.threshold) {
          setThreshold(data.threshold);
          console.log("[ExamMonitor] Loaded personalized threshold:", data.threshold);
        }
      } catch (err) {
        console.warn("[ExamMonitor] Using default threshold (0.85)");
      }
    }
    fetchThreshold();
  }, [studentId]);

  // --- Capture mouse and keyboard data ---
  // ------------------- REAL-TIME BEHAVIOR CAPTURE -------------------
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseData(prev => [
        ...prev.slice(-500), // keep last 500 points
        { x: e.clientX, y: e.clientY, t: Date.now() }
      ]);
    };

    const handleClick = () => {
      setMouseData(prev => [
        ...prev.slice(-500),
        { type: "click", t: Date.now() }
      ]);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      setKeyData(prev => [
        ...prev.slice(-200),
        { key: e.key, action: "down", t: Date.now() }
      ]);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // --- Extract meaningful mouse features ---
const extractMouseFeatures = () => {
  const now = Date.now();
  // Use only recent events within KEEP_MS sliding window
  const windowStart = now - KEEP_MS;
  const recent = mouseData.filter((m) => (m.t || 0) >= windowStart);

  // small-sample safety:
  if (!recent || recent.length < MIN_EVENTS_MOUSE) {
    // quickly compute something non-zero when we have at least some movement
    const anyMove = mouseData.find((m) => m.type === "move");
    if (!anyMove) {
      return Object.fromEntries(MOUSE_FEATURE_ORDER.map((k) => [k, 0]));
    }
  }

  let path_length = 0;
  let total_time_s = 0;
  let clicks = 0;
  let lastTs = null;

  for (let i = 0; i < recent.length; i++) {
    const cur = recent[i];
    if (cur.type === "move" && i > 0) {
      const prev = recent[i - 1];
      if (typeof prev.x === "number" && typeof prev.y === "number" &&
          typeof cur.x === "number" && typeof cur.y === "number") {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        path_length += Math.hypot(dx, dy);
      }
    }
    if (lastTs != null && cur.t && lastTs < cur.t) {
      total_time_s += (cur.t - lastTs) / 1000;
    }
    if (cur.click) clicks++;
    lastTs = cur.t || lastTs;
  }

  const avg_speed = total_time_s > 0 ? path_length / total_time_s : 0;
  const click_frequency = total_time_s > 0 ? clicks / total_time_s : 0;

  // click_interval_mean: compute from click timestamps if available
  const clickTimes = recent.filter((r) => r.click).map((c) => c.t).sort((a,b)=>a-b);
  let click_interval_mean = 0;
  if (clickTimes.length > 1) {
    const intervals = [];
    for (let i = 1; i < clickTimes.length; i++) intervals.push((clickTimes[i] - clickTimes[i-1]) / 1000);
    click_interval_mean = intervals.length ? (intervals.reduce((a,b)=>a+b,0) / intervals.length) : 0;
  }

  // Build object guaranteeing all keys exist
  const out = {
    path_length,
    avg_speed,
    idle_time: 0,
    dwell_time: 0,
    hover_time: 0,
    click_frequency,
    click_interval_mean,
    click_ratio_per_question: 0,
    trajectory_smoothness: 0,
    path_curvature: 0,
    transition_time: 0,
  };
  console.debug("[ExamMonitor] extractMouseFeatures ->", { recent_count: recent.length, ...out });
  return out;
};

  // --- Extract meaningful keystroke features ---
const extractKeystrokeFeatures = () => {
  const now = Date.now();
  const windowStart = now - KEEP_MS;
  const recentDowns = keyData.filter(k => k.type === "down" && (k.t || 0) >= windowStart);
  const recentUps = keyData.filter(k => k.type === "up" && (k.t || 0) >= windowStart);

  // compute dwell times
  const dwell_times: number[] = [];
  for (let i = 0; i < recentDowns.length; i++) {
    const d = recentDowns[i];
    const up = recentUps.find(u => u.key === d.key && u.t > d.t);
    if (up) dwell_times.push(up.t - d.t);
  }

  const typing_duration_s = recentDowns.length > 1 ? ((recentDowns[recentDowns.length - 1].t - recentDowns[0].t) / 1000) : 1;
  const typing_speed = recentDowns.length / (typing_duration_s || 1);
  const avg_hold = dwell_times.length ? dwell_times.reduce((a,b)=>a+b,0) / dwell_times.length : 0;

  // Fill all keys with defaults then override a few core features
  const features: Record<string, number> = {};
  KEYSTROKE_FEATURE_ORDER.forEach((k) => { features[k] = 0; });

  // set principal / robust features
  features["typing_speed"] = typing_speed;
  features["digraph_mean"] = dwell_times.length ? (dwell_times.reduce((a,b)=>a+b,0) / dwell_times.length) : 0;
  features["digraph_variance"] = dwell_times.length > 1 ? (dwell_times.map(x=>Math.pow(x - features["digraph_mean"], 2)).reduce((a,b)=>a+b,0) / dwell_times.length) : 0;
  features["error_rate"] = (recentDowns.filter(d => ["Backspace","Delete"].includes(d.key)).length) / Math.max(1, recentDowns.length);
  features["H.period"] = avg_hold;
  features["H.t"] = avg_hold;
  features["H.i"] = avg_hold;
  features["H.e"] = avg_hold;
  // keep other keys zero if not available

  console.debug("[ExamMonitor] extractKeystrokeFeatures ->", { downs: recentDowns.length, ups: recentUps.length, typing_speed, avg_hold });
  return features;
};

  // --- Handle suspicious shortcut ---
  const handleSuspiciousShortcut = (shortcut: string) => {
    toast.warning(`⚠️ Suspicious action: ${shortcut}`);
    const now = Date.now();
    for (let i = 0; i < 15; i++) {
      setMouseData((p) => [...p, {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        t: now + i * 50,
      }]);
    }
  };

  // --- Cheating simulation toggle ---
  const toggleSimulation = () => {
    if (simulationMode) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setSimulationMode(false);
      toast.info("✅ Simulation disabled");
    } else {
      setSimulationMode(true);
      toast.warning("⚠️ Cheating simulation enabled");
      simulationIntervalRef.current = setInterval(() => {
        const now = Date.now();
        for (let i = 0; i < 20; i++) {
          setMouseData((p) => [...p, {
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            t: now + i * 30,
            ...(Math.random() > 0.7 ? { click: true } : {}),
          }]);
        }
      }, 2000);
    }
  };

  // --- Send features to backend ---
const sendPredict = async () => {
  // Diagnostic logs for buffer sizes and sample data
  console.log("[ExamMonitor] Data buffer sizes", mouseData.length, keyData.length);
  console.log("[ExamMonitor] Example mouseData:", mouseData.slice(-3));
  console.log("[ExamMonitor] Example keyData:", keyData.slice(-3));
  if (!studentId || !sessionId) return;

  // debug: counts before feature extraction
  console.debug("[ExamMonitor] sendPredict — raw lengths", { mouseDataLen: mouseData.length, keyDataLen: keyData.length });

  const mouse_features_obj = extractMouseFeatures();
  const keystroke_features_obj = extractKeystrokeFeatures();

  // debug: show exactly what will be sent
  console.log("[ExamMonitor] Sending to /predict", {
    studentId, sessionId,
    mouse_features_obj_sample: Object.fromEntries(MOUSE_FEATURE_ORDER.map((f)=>[f, mouse_features_obj[f]])),
    keystroke_features_obj_sample: Object.fromEntries(KEYSTROKE_FEATURE_ORDER.map((f)=>[f, keystroke_features_obj[f]])),
  });

  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
    const r = await fetch(`${backendUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mouse_features: Object.fromEntries(MOUSE_FEATURE_ORDER.map((f) => [f, mouse_features_obj[f] ?? 0])),
        keystroke_features: Object.fromEntries(KEYSTROKE_FEATURE_ORDER.map((f) => [f, keystroke_features_obj[f] ?? 0])),
        student_id: studentId,
        session_id: sessionId,
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Backend error ${r.status}: ${txt}`);
    }
    const res = await r.json();
    console.log("[ExamMonitor] /predict response:", res);

    setFusionScore(res.fusion_score);
    setThreshold(res.user_threshold ?? threshold);
    const flagged = !!res.cheating_prediction;

    setBuffered(prev => {
      const next = [...prev, flagged];
      return next.length > 3 ? next.slice(-3) : next;
    });

    if (flagged) {
      setStatus("🚨 Cheating incident recorded");
      toast.error("🚨 Cheating incident recorded");
    } else if (res.fusion_score > (res.user_threshold ?? threshold)) {
      setStatus("⚠️ Suspicious");
      toast.warning("Suspicious behaviour detected");
    } else {
      setStatus("✅ Normal");
    }

  // Keep rolling window of last 5s of history
  const keepFrom = Date.now() - 5000;
  setMouseData(prev => prev.filter(d => d.t >= keepFrom));
  setKeyData(prev => prev.filter(d => d.t >= keepFrom));
  } catch (err) {
    console.error("[ExamMonitor] Prediction failed", err);
    toast.error("Prediction failed");
  }
};

// Dev helper to manually trigger sendPredict from console
(window as any).sendPredictNow = () => {
  // call sendPredict - helpful for manual testing
  (sendPredict as any)();
};

  // --- Schedule periodic predictions ---
  useEffect(() => {
    if (studentId && sessionId) {
      const interval = setInterval(sendPredict, 10000);
      return () => clearInterval(interval);
    }
  }, [studentId, sessionId]);

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, []);

  return (
    <div className="p-4 bg-card rounded-xl shadow-md mt-4 border border-border relative">
      {simulationMode && (
        <Badge variant="destructive" className="absolute top-2 right-2 animate-pulse">
          Sim Mode Active
        </Badge>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg text-foreground">Exam Behaviour Monitor</h2>
        <Button
          onClick={toggleSimulation}
          variant={simulationMode ? "destructive" : "outline"}
          size="sm"
          className={!simulationMode ? "border-purple-500 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950" : ""}
        >
          {simulationMode ? "Stop Simulation" : "Simulate Cheating"}
        </Button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Session ID:</span>
          <span className="font-mono text-foreground">{sessionId || "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Threshold:</span>
          <span className="font-mono text-foreground">
            {typeof threshold === "number" ? threshold.toFixed(3) : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fusion Score:</span>
          <span className="font-mono text-foreground">
            {typeof fusionScore === "number" ? fusionScore.toFixed(3) : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span
            className={`font-medium ${
              status.includes("🚨")
                ? "text-destructive"
                : status.includes("⚠️")
                ? "text-yellow-600 dark:text-yellow-500"
                : "text-green-600 dark:text-green-500"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">History:</span>
          <span className="font-mono">
            {buffered.map((b, i) => (
              <span key={i} className="ml-1">
                {b ? "🚨" : "✅"}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

export default ExamMonitor;
