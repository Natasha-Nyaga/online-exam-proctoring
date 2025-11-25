import numpy as np
import pandas as pd
from typing import List, Dict, Union, Tuple

class MouseFeatureExtractor:
    """
    Extracts features related to mouse activity.
    The main method handles calculation (for calibration) and normalization (for exam).
    """
    def __init__(self):
        # Feature names must be consistent with the database and ML model
        self.feature_names = [
            'inactive_duration', 
            'copy_cut', 
            'paste', 
            'double_click'
        ]

    def _calculate_features(self, raw_events: List[Dict]) -> Dict[str, float]:
        """
        Calculates raw features from a list of mouse events (Your provided logic).
        Accepts both 'timestamp' and 't' as valid time fields.
        """
        import logging
        if not raw_events:
            return {name: 0.0 for name in self.feature_names}

        # Normalize time field
        for event in raw_events:
            if 'timestamp' not in event and 't' in event:
                event['timestamp'] = event['t']
            if 'timestamp' not in event:
                logging.warning(f"Mouse event missing timestamp: {event}")

        df = pd.DataFrame(raw_events)

        # Calculate Duration per event (Time since previous event)
        df['timestamp'] = df['timestamp'].astype(float)
        df['prev_timestamp'] = df['timestamp'].shift(1)
        df['duration'] = df['timestamp'] - df['prev_timestamp']
        df['duration'] = df['duration'].fillna(0)

        # 1. Inactive Duration
        inactive_sum = df[df.get('tab', 'active') != 'active']['duration'].sum() if 'tab' in df else 0.0

        # 2. Event Counters
        copy_cut_sum = len(df[df.get('event_type', '') .isin(['copy', 'cut'])]) if 'event_type' in df else 0
        paste_sum = len(df[df.get('event_type', '') == 'paste']) if 'event_type' in df else 0
        double_click_sum = len(df[df.get('event_type', '') == 'dblclick']) if 'event_type' in df else 0

        raw_features = {
            "inactive_duration": float(inactive_sum),
            "copy_cut": float(copy_cut_sum),
            "paste": float(paste_sum),
            "double_click": float(double_click_sum)
        }

        return raw_features

    def extract_features(self, events: List[Dict], baseline_stats: Union[Dict, None] = None) -> Tuple[List[float], Union[Dict, None]]:
        """
        Extracts features and performs normalization using baseline_stats if provided.
        Returns the feature vector ready for the ML model.
        """
        raw_features = self._calculate_features(events)
        if baseline_stats is None:
            # --- CALIBRATION MODE: Calculate and return stats ---
            feature_values = [raw_features[name] for name in self.feature_names]
            m_mean = float(np.mean(feature_values))
            m_std = float(np.std(feature_values))
            simplified_stats = {
                'mean': m_mean,
                'std': m_std,
                'detailed_stats': {name: {'mean': raw_features.get(name, 0.0), 'std': 1.0} for name in self.feature_names}
            }
            feature_vector = [raw_features[name] for name in self.feature_names]
            return feature_vector, simplified_stats

        # --- EXAM MODE: Normalize using provided baseline_stats ---
        normalized_features = []
        for name in self.feature_names:
            value = raw_features.get(name, 0.0)
            stats = baseline_stats.get(name, {'mean': 0.0, 'std': 1.0})
            mean = stats['mean']
            std = stats['std']
            normalized_value = (value - mean) / std if std > 0.0 else 0.0
            normalized_features.append(normalized_value)
        return normalized_features, None