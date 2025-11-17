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

import { extractMouseVector, extractKeystrokeVector } from "@/utils/featureExtractors";

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
  // ===========================================================
  // STEP 2: Attach reliable global listeners for mouse & keyboard
  // ===========================================================
  useEffect(() => {
    console.log("[ExamMonitor] Mounting GLOBAL event listeners...");

    const handleMouseMove = (e: MouseEvent) => {
      setMouseData(prev => {
        const updated = [...prev, { x: e.clientX, y: e.clientY, t: Date.now() }];
        return updated.slice(-800);   // keep last 800 points
      });
    };

    const handleClick = () => {
      setMouseData(prev => {
        const updated = [...prev, { click: true, t: Date.now() }];
        return updated.slice(-800);
      });
      if (!isEssay) {
        // treat clicks as keystroke-like activity
        const fakeKey = {
          key: "CLICK",
          type: "down",
          t: Date.now()
        };
        setKeyData(prev => [...prev.slice(-400), fakeKey]);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      setKeyData(prev => {
        const updated = [...prev, { key: e.key, type: "down", t: Date.now() }];
        return updated.slice(-400);
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeyData(prev => {
        const updated = [...prev, { key: e.key, type: "up", t: Date.now() }];
        return updated.slice(-400);
      });
    };

    // Attach to BOTH window + document to prevent event shadowing
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    console.log("[ExamMonitor] Event listeners READY.");

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // --- Robust prediction logic ---
  const MIN_MOUSE_POINTS = 8;
  const MIN_KEY_EVENTS = 6;

  const buildMouseFeaturesOrdered = (mData: any[]) => {
    if (!mData || mData.length < 2) return null;
    const feat = extractMouseVector(mData); // must match backend order
    if (!feat) return null;
    return feat;
  };

  const buildKeyFeaturesOrdered = (kData: any[]) => {
    if (!kData || kData.length < 2) return null;
    const feat = extractKeystrokeVector(kData); // must match backend order
    if (!feat) return null;
    return feat;
  };

  const sendPredict = async () => {
    console.log("[ExamMonitor] Data buffer sizes:", mouseData.length, keyData.length);
    const mouseEnough = mouseData.length >= MIN_MOUSE_POINTS;
    const keyEnough = keyData.length >= MIN_KEY_EVENTS;
    const mouse_features = !isEssay && mouseEnough ? buildMouseFeaturesOrdered(mouseData) : null;
    const keystroke_features = isEssay && keyEnough ? buildKeyFeaturesOrdered(keyData) : null;
    if (!mouse_features && !keystroke_features) {
      console.log("[ExamMonitor] Not enough data yet, skipping prediction.");
      return;
    }
    const payload = {
      studentId,
      sessionId,
      questionType,
      mouse_features_obj_sample: mouse_features,
      keystroke_features_obj_sample: keystroke_features,
    };
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
      if (result.cheating_prediction === 1) {
        setStatus("🚨 Cheating detected");
        toast.error(`Cheating detected! score=${result.fusion_score?.toFixed(3)} > ${result.threshold?.toFixed(3)}`);
      } else if (result.fusion_score > result.threshold) {
        setStatus("⚠️ Suspicious");
        toast.warning(`Suspicious behaviour (score ${result.fusion_score?.toFixed(3)} > ${result.threshold?.toFixed(3)})`);
      } else {
        setStatus("✅ Normal");
      }
      // trim buffers to last few seconds
      const cutoff = Date.now() - 4000;
      setMouseData(prev => prev.filter(d => d.t > cutoff));
      setKeyData(prev => prev.filter(d => d.t > cutoff));
    } catch (err) {
      console.error("[ExamMonitor] Prediction failed", err);
    }
  };

  useEffect(() => {
    if (!studentId || !sessionId) return;
    const interval = setInterval(sendPredict, 8000);
    return () => clearInterval(interval);
  }, [studentId, sessionId, mouseData, keyData, questionType]);

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
