// ---------- Keystroke extractor ----------
export function extractKeystrokeVector(events: KeystrokeEvent[] = []): number[] {
    // Robust 245-element extractor
    const out = new Array(KEYSTROKE_FEATURE_ORDER.length).fill(0);
    if (!Array.isArray(events) || events.length === 0) return out;
    const ev = [...events].sort((a,b)=> a.timestamp - b.timestamp);
    const downsMap: Record<string, number[]> = {};
    const upsMap: Record<string, number[]> = {};
    const downTimestamps: number[] = [];
    for (let i=0;i<ev.length;i++){
        const e = ev[i];
        const k = e.key;
        if (e.type === "keydown") {
            (downsMap[k] = downsMap[k] || []).push(e.timestamp);
            downTimestamps.push(e.timestamp);
        } else if (e.type === "keyup") {
            (upsMap[k] = upsMap[k] || []).push(e.timestamp);
        }
    }
    const holdsByKey: Record<string, number[]> = {};
    for (const k in downsMap) {
        const downs = downsMap[k];
        const ups = upsMap[k] || [];
        for (let i=0;i<downs.length;i++){
            const dtime = downs[i];
            const up = ups.find(u => u > dtime);
            if (up) { const hold = (up - dtime) / 1000; (holdsByKey[k] = holdsByKey[k] || []).push(hold); }
        }
    }
    const ddiffs: number[] = [];
    for (let i=1;i<downTimestamps.length;i++){
        const dt = (downTimestamps[i] - downTimestamps[i-1]) / 1000;
        ddiffs.push(dt);
    }
    const digraph_mean = ddiffs.length? ddiffs.reduce((a,b)=>a+b,0)/ddiffs.length : 0;
    const digraph_variance = ddiffs.length>1 ? ddiffs.map(v => Math.pow(v-digraph_mean,2)).reduce((a,b)=>a+b,0)/(ddiffs.length-1) : 0;
    const trigraphs: number[] = [];
    for (let i=2;i<downTimestamps.length;i++){
        trigraphs.push((downTimestamps[i] - downTimestamps[i-2]) / 1000);
    }
    const trigraph_mean = trigraphs.length ? trigraphs.reduce((a,b)=>a+b,0)/trigraphs.length : 0;
    const trigraph_variance = trigraphs.length>1 ? trigraphs.map(v=>Math.pow(v-trigraph_mean,2)).reduce((a,b)=>a+b,0)/(trigraphs.length-1) : 0;
    const durationSeconds = (ev[ev.length-1].timestamp - ev[0].timestamp)/1000 || 1;
    const typing_speed = downTimestamps.length / durationSeconds;
    const errorKeysCount = (downsMap["Backspace"]?.length || 0) + (downsMap["Delete"]?.length || 0);
    const error_rate = downTimestamps.length ? (errorKeysCount / downTimestamps.length) : 0;

    // Helper for stats
    function stats(arr: number[]): {mean:number,std:number,var:number,min:number,max:number,median:number,skew:number,kurtosis:number} {
        if (!arr.length) return {mean:0,std:0,var:0,min:0,max:0,median:0,skew:0,kurtosis:0};
        const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
        const var_ = arr.length>1 ? arr.map(v=>Math.pow(v-mean,2)).reduce((a,b)=>a+b,0)/(arr.length-1) : 0;
        const std = Math.sqrt(var_);
        const sorted = [...arr].sort((a,b)=>a-b);
        const min = sorted[0], max = sorted[sorted.length-1];
        const median = sorted.length%2===0 ? (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2 : sorted[Math.floor(sorted.length/2)];
        const skew = arr.length>2 ? arr.reduce((a,b)=>a+Math.pow((b-mean)/std,3),0)/arr.length : 0;
        const kurtosis = arr.length>3 ? arr.reduce((a,b)=>a+Math.pow((b-mean)/std,4),0)/arr.length - 3 : 0;
        return {mean,std,var:var_,min,max,median,skew,kurtosis};
    }

    // Precompute stats for all base features
    const baseFeatures: Record<string, number[]> = {};
    for (const k in holdsByKey) baseFeatures[`H.${k}`] = holdsByKey[k];
    // Digraphs
    baseFeatures['digraph'] = ddiffs;
    baseFeatures['trigraph'] = trigraphs;
    baseFeatures['typing_speed'] = [typing_speed];
    baseFeatures['error_rate'] = [error_rate];

    // For DD/UD pairs
    function getDDs(pairA:string,pairB:string):number[]{
        const times: number[] = [];
        const downsA = downsMap[pairA] || [];
        const downsB = downsMap[pairB] || [];
        if (!downsA.length || !downsB.length) return times;
        for (const ta of downsA) {
            const tb = downsB.find(t => t > ta);
            if (tb) times.push((tb - ta)/1000);
        }
        return times;
    }
    function getUDs(pairA:string,pairB:string):number[]{
        const upsA = upsMap[pairA] || [];
        const downsB = downsMap[pairB] || [];
        if (!upsA.length || !downsB.length) return [];
        const times: number[] = [];
        for (const ta of upsA) {
            const tb = downsB.find(t => t > ta);
            if (tb) times.push((tb - ta)/1000);
        }
        return times;
    }

    // Fill vector
    const order = KEYSTROKE_FEATURE_ORDER;
    for (let i=0;i<order.length;i++){
        const fname = order[i];
        // Statistical features
        if (fname.endsWith('_mean') || fname.endsWith('_std') || fname.endsWith('_var') || fname.endsWith('_min') || fname.endsWith('_max') || fname.endsWith('_median') || fname.endsWith('_skew') || fname.endsWith('_kurtosis')) {
            // e.g. H.a_mean, DD.t.i_std, digraph_mean, etc.
            let base = fname.replace(/_(mean|std|var|min|max|median|skew|kurtosis)$/,'');
            let arr: number[] = [];
            if (base.startsWith('H.')) arr = baseFeatures[base] || [];
            else if (base.startsWith('DD.')) {
                const pair = base.slice(3).split('.');
                arr = getDDs(pair[0], pair[1]);
            } else if (base.startsWith('UD.')) {
                const pair = base.slice(3).split('.');
                arr = getUDs(pair[0], pair[1]);
            } else if (base === 'digraph') arr = baseFeatures['digraph'] || [];
            else if (base === 'trigraph') arr = baseFeatures['trigraph'] || [];
            else if (base === 'typing_speed') arr = [typing_speed];
            else if (base === 'error_rate') arr = [error_rate];
            else arr = [];
            const s = stats(arr);
            if (fname.endsWith('_mean')) out[i] = num(s.mean);
            else if (fname.endsWith('_std')) out[i] = num(s.std);
            else if (fname.endsWith('_var')) out[i] = num(s.var);
            else if (fname.endsWith('_min')) out[i] = num(s.min);
            else if (fname.endsWith('_max')) out[i] = num(s.max);
            else if (fname.endsWith('_median')) out[i] = num(s.median);
            else if (fname.endsWith('_skew')) out[i] = num(s.skew);
            else if (fname.endsWith('_kurtosis')) out[i] = num(s.kurtosis);
        }
        // Base features
        else if (fname.startsWith('H.')) {
            const keyLabel = fname.slice(2);
            out[i] = num((baseFeatures[fname] && baseFeatures[fname].length) ? baseFeatures[fname].reduce((a,b)=>a+b,0)/baseFeatures[fname].length : 0);
        } else if (fname.startsWith('DD.')) {
            const pair = fname.slice(3).split('.');
            const arr = getDDs(pair[0], pair[1]);
            out[i] = num(arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0);
        } else if (fname.startsWith('UD.')) {
            const pair = fname.slice(3).split('.');
            const arr = getUDs(pair[0], pair[1]);
            out[i] = num(arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0);
        } else {
            if (fname === 'typing_speed') out[i] = num(typing_speed);
            else if (fname === 'digraph_mean') out[i] = num(stats(baseFeatures['digraph']||[]).mean);
            else if (fname === 'digraph_variance') out[i] = num(stats(baseFeatures['digraph']||[]).var);
            else if (fname === 'trigraph_mean') out[i] = num(stats(baseFeatures['trigraph']||[]).mean);
            else if (fname === 'trigraph_variance') out[i] = num(stats(baseFeatures['trigraph']||[]).var);
            else if (fname === 'error_rate') out[i] = num(error_rate);
            else out[i] = 0;
        }
    }
    return out;
}
// src/utils/featureExtractors.ts
// Safe feature extractors that ALWAYS return fixed-length numeric arrays.
// Mouse => length 11, Keystroke => length 37
// Missing or sparse data -> zeros. No nulls.

type CursorPos = { x: number; y: number; t: number; click?: boolean };
type KeystrokeEvent = { key: string; type: "keydown" | "keyup"; timestamp: number };

export const MOUSE_FEATURE_ORDER = [
    'path_length', 'avg_speed', 'idle_time', 'dwell_time', 'hover_time', 'click_frequency', 'click_interval_mean', 'click_ratio_per_question', 'trajectory_smoothness', 'path_curvature', 'transition_time'
];

export const KEYSTROKE_FEATURE_ORDER = [
    'sessionIndex',
 'rep',
 'H.period',
 'DD.period.t',
 'UD.period.t',
 'H.t',
 'DD.t.i',
 'UD.t.i',
 'H.i',
 'DD.i.e',
 'UD.i.e',
 'H.e',
 'DD.e.five',
 'UD.e.five',
 'H.five',
 'DD.five.Shift.r',
 'UD.five.Shift.r',
 'H.Shift.r',
 'DD.Shift.r.o',
 'UD.Shift.r.o',
 'H.o',
 'DD.o.a',
 'UD.o.a',
 'H.a',
 'DD.a.n',
 'UD.a.n',
 'H.n',
 'DD.n.l',
 'UD.n.l',
 'H.l',
 'DD.l.Return',
 'UD.l.Return',
 'H.Return',
 'typing_speed',
 'digraph_mean',
 'digraph_variance',
 'trigraph_mean',
 'trigraph_variance',
 'error_rate',
 'sessionIndex_mean',
 'sessionIndex_std',
 'sessionIndex_var',
 'sessionIndex_min',
 'sessionIndex_max',
 'sessionIndex_median',
 'rep_mean',
 'rep_std',
 'rep_var',
 'rep_min',
 'rep_max',
 'rep_median',
 'H.period_mean',
 'H.period_std',
 'H.period_var',
 'H.period_min',
 'H.period_max',
 'H.period_median',
 'DD.period.t_mean',
 'DD.period.t_std',
 'DD.period.t_var',
 'DD.period.t_min',
 'DD.period.t_max',
 'DD.period.t_median',
 'UD.period.t_mean',
 'UD.period.t_std',
 'UD.period.t_var',
 'UD.period.t_min',
 'UD.period.t_max',
 'UD.period.t_median',
 'H.t_mean',
 'H.t_std',
 'H.t_var',
 'H.t_min',
 'H.t_max',
 'H.t_median',
 'DD.t.i_mean',
 'DD.t.i_std',
 'DD.t.i_var',
 'DD.t.i_min',
 'DD.t.i_max',
 'DD.t.i_median',
 'UD.t.i_mean',
 'UD.t.i_std',
 'UD.t.i_var',
 'UD.t.i_min',
 'UD.t.i_max',
 'UD.t.i_median',
 'H.i_mean',
 'H.i_std',
 'H.i_var',
 'H.i_min',
 'H.i_max',
 'H.i_median',
 'DD.i.e_mean',
 'DD.i.e_std',
 'DD.i.e_var',
 'DD.i.e_min',
 'DD.i.e_max',
 'DD.i.e_median',
 'UD.i.e_mean',
 'UD.i.e_std',
 'UD.i.e_var',
 'UD.i.e_min',
 'UD.i.e_max',
 'UD.i.e_median',
 'H.e_mean',
 'H.e_std',
 'H.e_var',
 'H.e_min',
 'H.e_max',
 'H.e_median',
 'DD.e.five_mean',
 'DD.e.five_std',
 'DD.e.five_var',
 'DD.e.five_min',
 'DD.e.five_max',
 'DD.e.five_median',
 'UD.e.five_mean',
 'UD.e.five_std',
 'UD.e.five_var',
 'UD.e.five_min',
 'UD.e.five_max',
 'UD.e.five_median',
 'H.five_mean',
 'H.five_std',
 'H.five_var',
 'H.five_min',
 'H.five_max',
 'H.five_median',
 'DD.five.Shift.r_mean',
 'DD.five.Shift.r_std',
 'DD.five.Shift.r_var',
 'DD.five.Shift.r_min',
 'DD.five.Shift.r_max',
 'DD.five.Shift.r_median',
 'UD.five.Shift.r_mean',
 'UD.five.Shift.r_std',
 'UD.five.Shift.r_var',
 'UD.five.Shift.r_min',
 'UD.five.Shift.r_max',
 'UD.five.Shift.r_median',
 'H.Shift.r_mean',
 'H.Shift.r_std',
 'H.Shift.r_var',
 'H.Shift.r_min',
 'H.Shift.r_max',
 'H.Shift.r_median',
 'DD.Shift.r.o_mean',
 'DD.Shift.r.o_std',
 'DD.Shift.r.o_var',
 'DD.Shift.r.o_min',
 'DD.Shift.r.o_max',
 'DD.Shift.r.o_median',
 'UD.Shift.r.o_mean',
 'UD.Shift.r.o_std',
 'UD.Shift.r.o_var',
 'UD.Shift.r.o_min',
 'UD.Shift.r.o_max',
 'UD.Shift.r.o_median',
 'H.o_mean',
 'H.o_std',
 'H.o_var',
 'H.o_min',
 'H.o_max',
 'H.o_median',
 'DD.o.a_mean',
 'DD.o.a_std',
 'DD.o.a_var',
 'DD.o.a_min',
 'DD.o.a_max',
 'DD.o.a_median',
 'UD.o.a_mean',
 'UD.o.a_std',
 'UD.o.a_var',
 'UD.o.a_min',
 'UD.o.a_max',
 'UD.o.a_median',
 'H.a_mean',
 'H.a_std',
 'H.a_var',
 'H.a_min',
 'H.a_max',
 'H.a_median',
 'DD.a.n_mean',
 'DD.a.n_std',
 'DD.a.n_var',
 'DD.a.n_min',
 'DD.a.n_max',
 'DD.a.n_median',
 'UD.a.n_mean',
 'UD.a.n_std',
 'UD.a.n_var',
 'UD.a.n_min',
 'UD.a.n_max',
 'UD.a.n_median',
 'H.n_mean',
 'H.n_std',
 'H.n_var',
 'H.n_min',
 'H.n_max',
 'H.n_median',
 'DD.n.l_mean',
 'DD.n.l_std',
 'DD.n.l_var',
 'DD.n.l_min',
 'DD.n.l_max',
 'DD.n.l_median',
 'UD.n.l_mean',
 'UD.n.l_std',
 'UD.n.l_var',
 'UD.n.l_min',
 'UD.n.l_max',
 'UD.n.l_median',
 'H.l_mean',
 'H.l_std',
 'H.l_var',
 'H.l_min',
 'H.l_max',
 'H.l_median',
 'DD.l.Return_mean',
 'DD.l.Return_std',
 'DD.l.Return_var',
 'DD.l.Return_min',
 'DD.l.Return_max',
 'DD.l.Return_median',
 'UD.l.Return_mean',
 'UD.l.Return_std',
 'UD.l.Return_var',
 'UD.l.Return_min',
 'UD.l.Return_max',
 'UD.l.Return_median',
 'H.Return_mean',
 'H.Return_std',
 'H.Return_var',
 'H.Return_min',
 'H.Return_max',
 'H.Return_median',
 'typing_speed_mean',
 'typing_speed_std',
 'typing_speed_var',
 'typing_speed_min',
 'typing_speed_max',
 'typing_speed_median',
 'digraph_mean_mean',
 'digraph_mean_std',
 'digraph_mean_var',
 'digraph_mean_min',
 'digraph_mean_max',
 'digraph_mean_median',
 'digraph_variance_mean',
 'digraph_variance_std',
 'digraph_variance_var',
 'digraph_variance_min',
 'digraph_variance_max',
 'digraph_variance_median',
 'trigraph_mean_mean',
 'trigraph_mean_std',
 'trigraph_mean_var',
 'trigraph_mean_min',
 'trigraph_mean_max',
 'trigraph_mean_median',
 'trigraph_variance_mean',
 'trigraph_variance_std',
 'trigraph_variance_var',
 'trigraph_variance_min',
 'trigraph_variance_max',
 'trigraph_variance_median',
 'error_rate_mean',
 'error_rate_std',
 'error_rate_var',
 'error_rate_min',
 'error_rate_max',
 'error_rate_median',
 'sessionIndex_skew',
 'rep_skew',
 'H.period_skew',
 'DD.period.t_skew',
 'UD.period.t_skew',
 'H.t_skew',
 'DD.t.i_skew',
 'UD.t.i_skew',
 'H.i_skew',
 'DD.i.e_skew',
 'UD.i.e_skew',
 'H.e_skew',
 'DD.e.five_skew',
 'UD.e.five_skew',
 'H.five_skew',
 'DD.five.Shift.r_skew',
 'UD.five.Shift.r_skew',
 'H.Shift.r_skew',
 'DD.Shift.r.o_skew',
 'UD.Shift.r.o_skew',
 'H.o_skew',
 'DD.o.a_skew',
 'UD.o.a_skew',
 'H.a_skew',
 'DD.a.n_skew',
 'UD.a.n_skew',
 'H.n_skew',
 'DD.n.l_skew',
 'UD.n.l_skew',
 'H.l_skew',
 'DD.l.Return_skew',
 'UD.l.Return_skew',
 'H.Return_skew',
 'typing_speed_skew',
 'digraph_mean_skew',
 'digraph_variance_skew',
 'trigraph_mean_skew',
 'trigraph_variance_skew',
 'error_rate_skew',
 'sessionIndex_kurtosis',
 'rep_kurtosis',
 'H.period_kurtosis',
 'DD.period.t_kurtosis',
 'UD.period.t_kurtosis',
 'H.t_kurtosis',
 'DD.t.i_kurtosis',
 'UD.t.i_kurtosis',
 'H.i_kurtosis',
 'DD.i.e_kurtosis',
 'UD.i.e_kurtosis',
 'H.e_kurtosis',
 'DD.e.five_kurtosis',
 'UD.e.five_kurtosis',
 'H.five_kurtosis',
 'DD.five.Shift.r_kurtosis',
 'UD.five.Shift.r_kurtosis',
 'H.Shift.r_kurtosis',
 'DD.Shift.r.o_kurtosis',
 'UD.Shift.r.o_kurtosis',
 'H.o_kurtosis',
 'DD.o.a_kurtosis',
 'UD.o.a_kurtosis',
 'H.a_kurtosis',
 'DD.a.n_kurtosis',
 'UD.a.n_kurtosis',
 'H.n_kurtosis',
 'DD.n.l_kurtosis',
 'UD.n.l_kurtosis',
 'H.l_kurtosis',
 'DD.l.Return_kurtosis',
 'UD.l.Return_kurtosis',
 'H.Return_kurtosis',
 'typing_speed_kurtosis',
 'digraph_mean_kurtosis',
 'digraph_variance_kurtosis',
 'trigraph_mean_kurtosis',
 'trigraph_variance_kurtosis',
 'error_rate_kurtosis'
];


const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// ---------- Mouse extractor ----------
export function extractMouseVector(cursorPositions: CursorPos[] = []): number[] {
    const out = new Array(MOUSE_FEATURE_ORDER.length).fill(0);
    if (!Array.isArray(cursorPositions) || cursorPositions.length < 2) return out;
    const pts = [...cursorPositions].sort((a,b) => a.t - b.t);
    let path_length = 0, total_dt = 0, clicks = 0;
    const click_ts: number[] = [];
    for (let i=1; i<pts.length; i++){
        const p = pts[i-1], c = pts[i];
        if (typeof p.x !== "number" || typeof c.x !== "number") continue;
        const dx = c.x - p.x, dy = c.y - p.y;
        const dist = Math.hypot(dx, dy);
        const dt = (c.t - p.t) / 1000;
        if (dt > 0) { path_length += dist; total_dt += dt; }
        if (c.click) { clicks++; click_ts.push(c.t); }
    }
    const avg_speed = total_dt > 0 ? path_length / total_dt : 0;
    const click_frequency = total_dt > 0 ? clicks / total_dt : 0;
    const click_interval_mean = (click_ts.length > 1)
        ? num(click_ts.slice(1).map((t,i)=> (t - click_ts[i]) / 1000).reduce((a,b)=>a+b,0) / (click_ts.length-1))
        : 0;
    const idle_threshold = 2000;
    let idle_time = 0;
    for (let i=1; i<pts.length; i++){
        const dt = pts[i].t - pts[i-1].t;
        if (dt > idle_threshold) idle_time += (dt/1000);
    }
    const dwellWindowMs = 250;
    let dwellSegments = 0, dwellTotal = 0, segStartIdx = 0;
    for (let i=1;i<pts.length;i++){
        const p=pts[i-1], c=pts[i];
        const dist = Math.hypot((c.x - p.x), (c.y - p.y));
        if (dist <= 3) {} else {
            const dt = pts[i-1].t - pts[segStartIdx].t;
            if (dt >= dwellWindowMs) { dwellSegments++; dwellTotal += dt/1000; }
            segStartIdx = i;
        }
    }
    const lastDt = pts[pts.length-1].t - pts[segStartIdx].t;
    if (lastDt >= dwellWindowMs) { dwellSegments++; dwellTotal += lastDt/1000; }
    const dwell_time = dwellSegments ? (dwellTotal / dwellSegments) : 0;
    const hoverTimeThreshold = 200;
    let hoverSegments = 0, hoverTotal = 0;
    segStartIdx = 0;
    for (let i=1;i<pts.length;i++){
        const p=pts[i-1], c=pts[i];
        const dist = Math.hypot(c.x - p.x, c.y - p.y);
        const dt = c.t - p.t;
        if (dist <= 3 && dt >= hoverTimeThreshold) { hoverSegments++; hoverTotal += dt/1000; }
    }
    const hover_time = hoverSegments ? (hoverTotal / hoverSegments) : 0;
    const click_ratio_per_question = pts.length > 0 ? clicks / pts.length : 0;
    const first = pts[0], last = pts[pts.length-1];
    const straight = Math.hypot(last.x - first.x, last.y - first.y);
    const trajectory_smoothness = straight > 0 ? (path_length / straight) : 0;
    let curvature = 0;
    for (let i=2;i<pts.length;i++){
        const p0=pts[i-2], p1=pts[i-1], p2=pts[i];
        const v1 = [p1.x-p0.x, p1.y-p0.y];
        const v2 = [p2.x-p1.x, p2.y-p1.y];
        const mag1 = Math.hypot(v1[0], v1[1]), mag2 = Math.hypot(v2[0], v2[1]);
        if (mag1>0 && mag2>0){
            const dot = (v1[0]*v2[0]+v1[1]*v2[1])/(mag1*mag2);
            const clamped = Math.max(-1, Math.min(1, dot));
            const angle = Math.acos(clamped);
            curvature += angle;
        }
    }
    const path_curvature = curvature;
    let transition_time = 0;
    for (let i=1;i<pts.length;i++){
        const dist = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
        if (dist > 5) { transition_time = (pts[i].t - pts[0].t) / 1000; break; }
    }
    out[0] = num(path_length);
    out[1] = num(avg_speed);
    out[2] = num(idle_time);
    out[3] = num(dwell_time);
    out[4] = num(hover_time);
    out[5] = num(click_frequency);
    out[6] = num(click_interval_mean);
    out[7] = num(click_ratio_per_question);
    out[8] = num(trajectory_smoothness);
    out[9] = num(path_curvature);
    out[10] = num(transition_time);
    return out;
}
