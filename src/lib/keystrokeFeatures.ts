// ==== KEYS FOR YOUR 37 FEATURES ====
export const KEYSTROKE_FEATURES = [
  "H.period", "DD.period.t", "UD.period.t",
  "H.t", "DD.t.i", "UD.t.i",
  "H.i", "DD.i.e", "UD.i.e",
  "H.e", "DD.e.five", "UD.e.five",
  "H.five", "DD.five.Shift.r", "UD.five.Shift.r",
  "H.Shift.r", "DD.Shift.r.o", "UD.Shift.r.o",
  "H.o", "DD.o.a", "UD.o.a",
  "H.a", "DD.a.n", "UD.a.n",
  "H.n", "DD.n.l", "UD.n.l",
  "H.l", "DD.l.Return", "UD.l.Return",
  "H.Return",
  "typing_speed",
  "digraph_mean", "digraph_variance",
  "trigraph_mean", "trigraph_variance",
  "error_rate"
];

// ==== RAW → 37-FEATURE VECTOR ====
export function extractKeystrokeFeatures(rawEvents) {
  const hold = {}; // H.key
  const dd = {};   // Down–Down digraph
  const ud = {};   // Up–Down digraph

  const downTimes = {};  // key → timestamp
  const upTimes = {};    // key → timestamp

  const ddPairs = [];
  const udPairs = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const e = rawEvents[i];

    if (e.type === "keydown") {
      downTimes[e.key] = e.t;
      if (i > 0 && rawEvents[i - 1].type === "keydown") {
        ddPairs.push(rawEvents[i].t - rawEvents[i - 1].t);
      }
    }

    if (e.type === "keyup") {
      upTimes[e.key] = e.t;
      if (downTimes[e.key]) {
        hold[e.key] = upTimes[e.key] - downTimes[e.key];
      }
      if (i > 0 && rawEvents[i - 1].type === "keyup") {
        udPairs.push(rawEvents[i].t - rawEvents[i - 1].t);
      }
    }
  }

  const stats = (arr) => {
    if (!arr || arr.length === 0) return [0, 0];
    let m = arr.reduce((a,b)=>a+b,0)/arr.length;
    let v = arr.reduce((a,b)=>a+(b-m)**2,0)/arr.length;
    return [m, v];
  };

  const [dig_m, dig_v] = stats(ddPairs);
  const [tri_m, tri_v] = stats(udPairs);

  const typingSpeed = rawEvents.length / ((rawEvents.at(-1)?.t - rawEvents[0]?.t)/1000 || 1);
  const errorRate = rawEvents.filter(e => e.isError).length / rawEvents.length || 0;

  // BUILD THE 37-LENGTH VECTOR (ORDER IS CRITICAL)
  const vec = [
    hold["."], dd[".t"], ud[".t"],
    hold["t"], dd["t.i"], ud["t.i"],
    hold["i"], dd["i.e"], ud["i.e"],
    hold["e"], dd["e.5"], ud["e.5"],
    hold["5"], dd["5.Shift"], ud["5.Shift"],
    hold["Shift"], dd["Shift.o"], ud["Shift.o"],
    hold["o"], dd["o.a"], ud["o.a"],
    hold["a"], dd["a.n"], ud["a.n"],
    hold["n"], dd["n.l"], ud["n.l"],
    hold["l"], dd["l.Enter"], ud["l.Enter"],
    hold["Enter"],
    typingSpeed,
    dig_m, dig_v,
    tri_m, tri_v,
    errorRate
  ].map(v => v || 0);

  return vec;
}
