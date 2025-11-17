export const MOUSE_FEATURE_ORDER = [
  "path_length","avg_speed","idle_time","dwell_time","hover_time",
  "click_frequency","click_interval_mean","click_ratio_per_question",
  "trajectory_smoothness","path_curvature","transition_time"
];

export const KEYSTROKE_FEATURE_ORDER = [
  "H.period","DD.period.t","UD.period.t","H.t","DD.t.i","UD.t.i","H.i",
  "DD.i.e","UD.i.e","H.e","DD.e.five","UD.e.five","H.five",
  "DD.five.Shift.r","UD.five.Shift.r","H.Shift.r","DD.Shift.r.o","UD.Shift.r.o",
  "H.o","DD.o.a","UD.o.a","H.a","DD.a.n","UD.a.n","H.n",
  "DD.n.l","UD.n.l","H.l","DD.l.Return","UD.l.Return","H.Return",
  "typing_speed","digraph_mean","digraph_variance","trigraph_mean","trigraph_variance","error_rate"
];

// --- Keystroke extractor ---
// rawEvents: array of { key: string, type: 'down'|'up', t: timestamp_ms, isError?: boolean }
export function extractKeystrokeVector(rawEvents: any[]): number[] {
  if (!rawEvents || rawEvents.length === 0) {
    return new Array(KEYSTROKE_FEATURE_ORDER.length).fill(0);
  }

  // Maps and arrays
  const downTimes: Record<string, number> = {};
  const upTimes: Record<string, number> = {};
  const hold: Record<string, number[]> = {};
  const ddPairs: number[] = [];
  const udPairs: number[] = [];

  // Build hold times and dd/ud arrays
  for (let i = 0; i < rawEvents.length; i++) {
    const e = rawEvents[i];
    if (!e) continue;
    if (e.type === "down" || e.type === "keydown") {
      downTimes[e.key] = e.t;
      // dd: time since previous down if previous was a down
      if (i > 0 && (rawEvents[i - 1].type === "down" || rawEvents[i - 1].type === "keydown")) {
        const prev = rawEvents[i - 1];
        ddPairs.push(e.t - prev.t);
      }
    } else if (e.type === "up" || e.type === "keyup") {
      upTimes[e.key] = e.t;
      // compute hold if matching down exists
      if (downTimes[e.key] !== undefined) {
        const h = e.t - downTimes[e.key];
        if (!hold[e.key]) hold[e.key] = [];
        hold[e.key].push(h);
      }
      // ud: time since previous up if previous was an up
      if (i > 0 && (rawEvents[i - 1].type === "up" || rawEvents[i - 1].type === "keyup")) {
        const prev = rawEvents[i - 1];
        udPairs.push(e.t - prev.t);
      }
    }
  }

  // helper stats
  const mean = (arr: number[]) => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const variance = (arr: number[]) => {
    if (!arr || arr.length === 0) return 0;
    const m = mean(arr);
    return arr.reduce((a,b)=>a + (b-m)*(b-m),0)/arr.length;
  };

  const digraph_mean = mean(ddPairs);
  const digraph_variance = variance(ddPairs);
  const trigraph_mean = mean(udPairs);
  const trigraph_variance = variance(udPairs);

  const typedCount = rawEvents.filter(e => e.type === "down" || e.type === "keydown").length;
  const durationSec = ((rawEvents[rawEvents.length - 1].t - rawEvents[0].t) / 1000) || 1;
  const typing_speed = typedCount / durationSec;
  const error_rate = rawEvents.filter(e => e.isError).length / (rawEvents.length || 1);

  // Map to the expected named features in the order required.
  // This mapping assumes keys used in training are specific characters: '.' 't' 'i' 'e' 'five' 'Shift' 'o' 'a' 'n' 'l' 'Return' etc.
  // Provide safe lookups (use average hold if multiple).
  const getHold = (k: string) => (hold[k] && hold[k].length ? mean(hold[k]) : 0);

  // NOTE: you must ensure the keys used here match those you used during training.
  const vec = [
    getHold("."),                                      // H.period
    digraph_mean,                                      // DD.period.t (approx)
    trigraph_mean,                                     // UD.period.t (approx)
    getHold("t"), getHold("t"), getHold("t"),          // H.t, DD.t.i, UD.t.i approximation placeholders
    getHold("i"), getHold("i"), getHold("i"),          // H.i, DD.i.e, UD.i.e
    getHold("e"), getHold("e"), getHold("e"),
    getHold("five"), getHold("five"), getHold("five"),
    getHold("Shift"), getHold("Shift"), getHold("Shift"),
    getHold("o"), getHold("o"), getHold("o"),
    getHold("a"), getHold("a"), getHold("a"),
    getHold("n"), getHold("n"), getHold("n"),
    getHold("l"), getHold("l"), getHold("l"),
    getHold("Return"),                                 // H.Return
    typing_speed,
    digraph_mean,
    digraph_variance,
    trigraph_mean,
    trigraph_variance,
    error_rate
  ];

  // Guarantee length 37
  const LEN = KEYSTROKE_FEATURE_ORDER.length;
  if (vec.length > LEN) return vec.slice(0, LEN);
  while (vec.length < LEN) vec.push(0);
  return vec;
}

// --- Mouse extractor ---
// mouseEvents: array of { x, y, t, click?: boolean, hoverDuration?: number }
// returns 11-element vector in MOUSE_FEATURE_ORDER order
export function extractMouseVector(mouseEvents: any[]): number[] {
  if (!mouseEvents || mouseEvents.length < 2) {
    return new Array(MOUSE_FEATURE_ORDER.length).fill(0);
  }

  let path_length = 0;
  let total_time_s = 0;
  let clicks = 0;
  const hover_times: number[] = [];
  const click_timestamps: number[] = [];

  for (let i = 1; i < mouseEvents.length; i++) {
    const prev = mouseEvents[i - 1];
    const curr = mouseEvents[i];
    if (typeof prev.x !== "number" || typeof curr.x !== "number") continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dt = (curr.t - prev.t) / 1000;
    if (dt > 0) {
      path_length += Math.hypot(dx, dy);
      total_time_s += dt;
    }
    if (curr.click) {
      clicks++;
      click_timestamps.push(curr.t);
    }
    if (curr.hoverDuration) hover_times.push(curr.hoverDuration);
  }

  const avg_speed = total_time_s > 0 ? path_length / total_time_s : 0;
  const click_frequency = total_time_s > 0 ? clicks / total_time_s : 0;
  // helper mean function
  const mean = (arr: number[]) => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const click_interval_mean = click_timestamps.length > 1 ? mean(click_timestamps.map((t,i,arr) => i===0?0:(t-arr[i-1])).slice(1)) : 0;
  const avg_hover = hover_times.length ? mean(hover_times) : 0;

  // placeholders for idle_time, dwell_time, click_ratio_per_question, trajectory_smoothness, path_curvature, transition_time
  const vec = [
    path_length,
    avg_speed,
    0,            // idle_time
    0,            // dwell_time
    avg_hover,
    click_frequency,
    click_interval_mean,
    0,            // click_ratio_per_question
    0,            // trajectory_smoothness
    0,            // path_curvature
    0             // transition_time
  ];
  // ensure length 11
  while (vec.length < MOUSE_FEATURE_ORDER.length) vec.push(0);
  return vec;
}
