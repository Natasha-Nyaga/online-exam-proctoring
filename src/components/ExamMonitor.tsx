import { useState, useEffect } from "react";
import { toast } from "sonner";

function ExamMonitor() {
  const [mouseData, setMouseData] = useState([]);
  const [keyData, setKeyData]     = useState([]);
  const [fusionScore, setFusionScore] = useState(null);
  const [isCheating, setIsCheating]   = useState(false);

  /* ---------------- MOUSE ---------------- */
  useEffect(() => {
    const handleMove = (e) => setMouseData(p => [...p, {x:e.clientX, y:e.clientY, t:Date.now()}]);
    const handleClick = (e) => setMouseData(p => [...p, {click:true, t:Date.now()}]);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("click", handleClick);
    return () => { window.removeEventListener("mousemove", handleMove);
                   window.removeEventListener("click", handleClick); };
  }, []);

  /* ---------------- KEYSTROKES ---------------- */
  useEffect(() => {
    const down = (e) => setKeyData(p => [...p, {key:e.key, t:Date.now(), type:"down"}]);
    const up   = (e) => setKeyData(p => [...p, {key:e.key, t:Date.now(), type:"up"}]);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down);
                   window.removeEventListener("keyup", up); };
  }, []);

  /* ---------------- FEATURE EXTRACTION ---------------- */
  const extractFeatures = () => {
    // --- Mouse ---
    let totalDist=0,totalTime=0,clicks=0;
    for(let i=1;i<mouseData.length;i++){
      const a=mouseData[i-1], b=mouseData[i];
      if(a.x&&b.x){ const dx=b.x-a.x, dy=b.y-a.y; totalDist+=Math.sqrt(dx*dx+dy*dy); totalTime+=(b.t-a.t)/1000; }
      if(b.click) clicks++;
    }
    const avgSpeed = totalTime>0? totalDist/totalTime : 0;
    const clickRate = totalTime>0? clicks/totalTime : 0;

    // --- Keyboard ---
    const downs = keyData.filter(d=>d.type==="down");
    const ups   = keyData.filter(d=>d.type==="up");
    const dwell=[];
    downs.forEach(d=>{
      const u=ups.find(u=>u.key===d.key && u.t>d.t);
      if(u) dwell.push(u.t-d.t);
    });
    const avgDwell = dwell.length? dwell.reduce((a,b)=>a+b)/dwell.length:0;

    const flights=[];
    for(let i=1;i<downs.length;i++) flights.push(downs[i].t-downs[i-1].t);
    const avgFlight = flights.length? flights.reduce((a,b)=>a+b)/flights.length:0;

    const typingDur = downs.length>1? (downs.at(-1).t-downs[0].t)/1000 : 1;
    const typingSpeed = downs.length/typingDur;

    const mouse_features = [avgSpeed, totalDist, clickRate];
    const keystroke_features = [avgDwell, avgFlight, typingSpeed];
    return { mouse_features, keystroke_features };
  };

  /* ---------------- SEND TO BACKEND ---------------- */
  const sendToBackend = async () => {
    const payload = extractFeatures();
    try {
      const r = await fetch("http://127.0.0.1:5000/predict",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify(payload)
      });
      if(!r.ok) throw new Error("Server error");
      const res = await r.json();
      setFusionScore(res.fusion_score);
      setIsCheating(res.cheating_prediction===1);
      if(res.cheating_prediction===1) toast.error("🚨 Suspicious behaviour detected!");
      setMouseData([]); setKeyData([]); // clear batch
    }catch(e){
      console.error(e); toast.error("Backend unreachable");
    }
  };

  useEffect(()=>{
    const i=setInterval(sendToBackend,10000);
    return ()=>clearInterval(i);
  },[]);

  return (
    <div className="p-4 bg-white rounded-xl shadow-md mt-4">
      <h2 className="font-semibold text-lg">Exam Behaviour Monitor</h2>
      {fusionScore!==null
        ? (<p>Fusion Score: {fusionScore.toFixed(3)} – Status: {isCheating? "🚨 Suspicious":"✅ Normal"}</p>)
        : (<p>Collecting behavioural data…</p>)
      }
    </div>
  );
}

export default ExamMonitor;
