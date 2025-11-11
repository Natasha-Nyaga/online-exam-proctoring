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
  const [mouseData, setMouseData] = useState<any[]>([]);
  const [keyData, setKeyData] = useState<any[]>([]);
  const [fusionScore, setFusionScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Collecting");
  const [threshold, setThreshold] = useState<number | null>(null);
  const [buffered, setBuffered] = useState<boolean[]>([]);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    const down = (e: KeyboardEvent) => {
      setKeyData((p) => [...p, { key: e.key, t: Date.now(), type: "down" }]);
      
      // Detect suspicious shortcuts
      const isSuspicious = 
        (e.ctrlKey && e.key === 'c') || // Ctrl+C
        (e.ctrlKey && e.key === 'v') || // Ctrl+V
        (e.ctrlKey && e.shiftKey && e.key === 'C') || // Ctrl+Shift+C
        (e.altKey && e.key === 'Tab') || // Alt+Tab
        (e.metaKey && e.key === 'Tab') || // Command+Tab
        e.key === 'PrintScreen';
      
      if (isSuspicious) {
        const shortcut = e.ctrlKey ? `Ctrl+${e.key}` : 
                        e.altKey ? `Alt+${e.key}` :
                        e.metaKey ? `Cmd+${e.key}` :
                        e.key;
        console.log(`[ExamMonitor] Suspicious shortcut detected: ${shortcut}`);
        handleSuspiciousShortcut(shortcut);
      }
    };
    
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

  const handleSuspiciousShortcut = (shortcut: string) => {
    toast.warning(`⚠️ Suspicious action: ${shortcut}`);
    
    // Inject erratic typing pattern to spike the score
    const now = Date.now();
    const burstKeys = ['a', 's', 'd', 'f', 'Backspace', 'Backspace', 'g', 'h'];
    burstKeys.forEach((key, idx) => {
      const delay = Math.random() * 50 + 20; // 20-70ms random delays
      setKeyData((p) => [...p, 
        { key, t: now + idx * delay, type: "down" },
        { key, t: now + idx * delay + 30, type: "up" }
      ]);
    });
    
    // Inject jittery mouse movements
    for (let i = 0; i < 15; i++) {
      setMouseData((p) => [...p, {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        t: now + i * 50
      }]);
    }
  };

  const generateSimulatedData = () => {
    const now = Date.now();
    
    // Generate rapid, jittery mouse movements
    for (let i = 0; i < 20; i++) {
      setMouseData((p) => [...p, {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        t: now + i * 30,
        ...(Math.random() > 0.7 ? { click: true } : {})
      }]);
    }
    
    // Generate bursts of erratic typing
    const randomKeys = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('');
    const burstLength = Math.floor(Math.random() * 15) + 10;
    for (let i = 0; i < burstLength; i++) {
      const key = Math.random() > 0.85 ? 'Backspace' : randomKeys[Math.floor(Math.random() * randomKeys.length)];
      const irregularDelay = Math.random() * 150 + 30; // 30-180ms
      setKeyData((p) => [...p,
        { key, t: now + i * irregularDelay, type: "down" },
        { key, t: now + i * irregularDelay + Math.random() * 100, type: "up" }
      ]);
    }
  };

  const toggleSimulation = () => {
    if (simulationMode) {
      // Stop simulation
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setSimulationMode(false);
      toast.info("✅ Simulation disabled");
    } else {
      // Start simulation
      setSimulationMode(true);
      toast.warning("⚠️ Cheating simulation enabled");
      
      // Inject simulated data every 2 seconds
      simulationIntervalRef.current = setInterval(() => {
        generateSimulatedData();
      }, 2000);
    }
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

  useEffect(() => {
    // Cleanup simulation on unmount
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
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
            {threshold !== null ? threshold.toFixed(3) : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fusion Score:</span>
          <span className="font-mono text-foreground">
            {fusionScore !== null ? fusionScore.toFixed(3) : "-"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span className={`font-medium ${
            status.includes("🚨") ? "text-destructive" : 
            status.includes("⚠️") ? "text-yellow-600 dark:text-yellow-500" : 
            "text-green-600 dark:text-green-500"
          }`}>
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
