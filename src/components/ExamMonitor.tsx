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
  // Track current question index and type
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [thresholds, setThresholds] = useState<{ mouse: number; keystroke: number }>({ mouse: 0.85, keystroke: 0.85 });
  const isEssay = currentQuestionIndex >= 5;
  const questionType = isEssay ? "essay" : "mcq";

  // Fetch personalized threshold from backend
  useEffect(() => {
    const fetchThreshold = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
        const res = await fetch(`${backendUrl}/threshold?student_id=${studentId}`);
        if (res.ok) {
          const data = await res.json();
          setThresholds({
            mouse: data.mouse_threshold ?? 0.85,
            keystroke: data.keystroke_threshold ?? 0.85
          });
          setThreshold(data.mouse_threshold ?? 0.85);
          console.log("[ExamMonitor] Using personalized thresholds:", data);
        } else {
          setThresholds({ mouse: 0.85, keystroke: 0.85 });
          setThreshold(0.85);
          console.warn("[ExamMonitor] No personalized threshold found, using default (0.85)");
        }
      } catch (error) {
        setThresholds({ mouse: 0.85, keystroke: 0.85 });
        setThreshold(0.85);
        console.error("[ExamMonitor] Failed to fetch threshold:", error);
      }
    };
    if (studentId) fetchThreshold();
  }, [studentId]);
  const [mouseData, setMouseData] = useState<any[]>([]);
  const [keyData, setKeyData] = useState<any[]>([]);
  const [fusionScore, setFusionScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Collecting");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [buffered, setBuffered] = useState<boolean[]>([]);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ---------- STEP 1: STABLE EVENT LISTENERS ----------
  useEffect(() => {
    console.log("[ExamMonitor] Component mounted, attaching listeners...");

    const handleMouseMove = (e: MouseEvent) => {
      setMouseData(prev => {
        const newEntry = { x: e.clientX, y: e.clientY, t: Date.now() };
        const updated = [...prev.slice(-400), newEntry];
        return updated;
      });
    };

    const handleClick = () => {
      setMouseData(prev => [...prev.slice(-400), { click: true, t: Date.now() }]);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      setKeyData(prev => [
        ...prev.slice(-200),
        { key: e.key, type: "down", t: Date.now() }
      ]);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeyData(prev => [
        ...prev.slice(-200),
        { key: e.key, type: "up", t: Date.now() }
      ]);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    console.log("[ExamMonitor] Event listeners attached ✅");

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      console.log("[ExamMonitor] Event listeners detached ❌");
    };
  }, []);

  // ---------- STEP 2: MONITOR IF DATA IS ACTUALLY GROWING ----------
  useEffect(() => {
    if (mouseData.length % 10 === 0 && mouseData.length > 0) {
      console.log("[ExamMonitor] Mouse data growing:", mouseData.length);
    }
    if (keyData.length % 5 === 0 && keyData.length > 0) {
      console.log("[ExamMonitor] Key data growing:", keyData.length);
    }
  }, [mouseData, keyData]);

  // ---------- STEP 3: EXTRACT FEATURES ----------
  const extractMouseFeatures = () => {
    if (mouseData.length < 2) return null;

    let path_length = 0, total_time = 0, clicks = 0;
    for (let i = 1; i < mouseData.length; i++) {
      const prev = mouseData[i - 1];
      const curr = mouseData[i];
      if (!prev.x || !curr.x) continue;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
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
    if (keyData.length < 2) return null;

    const downs = keyData.filter(d => d.type === "down");
    const ups = keyData.filter(d => d.type === "up");
    const dwell_times: number[] = [];

    downs.forEach((d) => {
      const u = ups.find((u) => u.key === d.key && u.t > d.t);
      if (u) dwell_times.push(u.t - d.t);
    });

    const typing_duration =
      downs.length > 1 ? (downs[downs.length - 1].t - downs[0].t) / 1000 : 1;
    const typing_speed = downs.length / typing_duration;

    const features: Record<string, number> = {};
    KEYSTROKE_FEATURE_ORDER.forEach((key) => (features[key] = 0));
    features["typing_speed"] = typing_speed;
    return features;
  };

  // ---------- STEP 4: SEND PREDICTIONS ----------
  const sendPredict = async () => {
    console.log("[ExamMonitor] Data buffer sizes", mouseData.length, keyData.length);
    console.log("[ExamMonitor] Example mouseData:", mouseData.slice(-3));
    console.log("[ExamMonitor] Example keyData:", keyData.slice(-3));

    if (mouseData.length === 0 && keyData.length === 0) {
      console.warn("[ExamMonitor] No behavioral data; skipping this round.");
      return;
    }

    const mouse_features_obj = extractMouseFeatures();
    const keystroke_features_obj = extractKeystrokeFeatures();

    // Only require at least one modality
    if (!mouse_features_obj && !keystroke_features_obj) {
      console.warn("[ExamMonitor] No usable features; skipping this round.");
      return;
    }

    // Build payload
    let payload: any = {
      student_id: studentId,
      session_id: sessionId,
      questionType,
      mouse_features_obj_sample: mouse_features_obj || undefined,
      keystroke_features_obj_sample: keystroke_features_obj || undefined,
    };

    console.log(`[ExamMonitor] Sending ${questionType === 'essay' ? 'essay (keystroke)' : 'MCQ (mouse)'} prediction...`);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";
      const response = await fetch(`${backendUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await response.json();
      console.log("[ExamMonitor] /predict response:", res);

      setFusionScore(res.fusion_score ?? 0);
      setBuffered(prev => {
        const next = [...prev, res.cheating_prediction === 1];
        return next.length > 3 ? next.slice(-3) : next;
      });

      // Use per-modality threshold for flagging
      let usedThreshold = isEssay ? thresholds.keystroke : thresholds.mouse;
      if (res.cheating_prediction === 1) {
        setStatus("🚨 Cheating detected!");
        toast.error(`🚨 Cheating detected! (score: ${res.fusion_score?.toFixed(3)} > threshold: ${usedThreshold})`);
      } else if (res.fusion_score > usedThreshold) {
        setStatus("⚠️ Suspicious");
        toast.warning(`Suspicious behaviour detected (score: ${res.fusion_score?.toFixed(3)} > threshold: ${usedThreshold})`);
      } else {
        setStatus("✅ Normal");
        toast.success(`Normal behaviour (score: ${res.fusion_score?.toFixed(3)} <= threshold: ${usedThreshold})`);
      }

      // keep only last 5 seconds of buffer
      const cutoff = Date.now() - 5000;
      setMouseData(prev => prev.filter(d => d.t > cutoff));
      setKeyData(prev => prev.filter(d => d.t > cutoff));

    } catch (err) {
      console.error("[ExamMonitor] Prediction failed", err);
      toast.error("Prediction failed");
    }
  };

  // ---------- STEP 5: LOOP PREDICTIONS ----------
  useEffect(() => {
    if (studentId && sessionId) {
      const interval = setInterval(() => {
        if (mouseData.length === 0 && keyData.length === 0) {
          console.log("[ExamMonitor] No behavioral data; skipping this round.");
          return;
        }
        sendPredict();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [studentId, sessionId, mouseData, keyData]);

  // ---------- STEP 6: UI ----------
  return (
    <div className="p-4 bg-card rounded-xl shadow-md mt-4 border border-border relative">
      {simulationMode && (
        <Badge variant="destructive" className="absolute top-2 right-2 animate-pulse">
          Sim Mode Active
        </Badge>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg text-foreground">Exam Behaviour Monitor</h2>
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
