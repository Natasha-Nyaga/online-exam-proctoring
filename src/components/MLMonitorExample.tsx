import { useState, useEffect } from "react";

// Feature names from your scaler printout
const mouseFeatureNames = [
  "path_length", "avg_speed", "idle_time", "dwell_time", "hover_time",
  "click_frequency", "click_interval_mean", "click_ratio_per_question",
  "trajectory_smoothness", "path_curvature", "transition_time"
];

const keystrokeFeatureNames = [
  "H.period", "DD.period.t", "UD.period.t", "H.t", "DD.t.i", "UD.t.i", "H.i",
  "DD.i.e", "UD.i.e", "H.e", "DD.e.five", "UD.e.five", "H.five",
  "DD.five.Shift.r", "UD.five.Shift.r", "H.Shift.r", "DD.Shift.r.o",
  "UD.Shift.r.o", "H.o", "DD.o.a", "UD.o.a", "H.a", "DD.a.n", "UD.a.n", "H.n",
  "DD.n.l", "UD.n.l", "H.l", "DD.l.Return", "UD.l.Return", "H.Return",
  "typing_speed", "digraph_mean", "digraph_variance", "trigraph_mean",
  "trigraph_variance", "error_rate"
];

export default function MLMonitorExample() {
  return null;
}
