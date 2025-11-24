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
        """
        if not raw_events:
            return {name: 0.0 for name in self.feature_names}

        df = pd.DataFrame(raw_events)
        
        # Calculate Duration per event (Time since previous event)
        df['timestamp'] = df['timestamp'].astype(float)
        df['prev_timestamp'] = df['timestamp'].shift(1)
        df['duration'] = df['timestamp'] - df['prev_timestamp']
        df['duration'] = df['duration'].fillna(0) 

        # 1. Inactive Duration
        inactive_sum = df[df['tab'] != 'active']['duration'].sum()

        # 2. Event Counters
        copy_cut_sum = len(df[df['event_type'].isin(['copy', 'cut'])])
        paste_sum = len(df[df['event_type'] == 'paste'])
        double_click_sum = len(df[df['event_type'] == 'dblclick'])

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
            stats = {}
            for name in self.feature_names:
                # Calculate mean and set std to 1.0 (to avoid division by zero later)
                stats[name] = {'mean': raw_features.get(name, 0.0), 'std': 1.0} 
            
            feature_vector = [raw_features[name] for name in self.feature_names]
            return feature_vector, stats

        # --- EXAM MODE: Normalize using provided baseline_stats ---
        normalized_features = []
        
        for name in self.feature_names:
            value = raw_features.get(name, 0.0)
            stats = baseline_stats.get(name, {'mean': 0.0, 'std': 1.0})
            mean = stats['mean']
            std = stats['std']
            
            # Z-score normalization: (Value - Mean) / Std Dev
            normalized_value = (value - mean) / std if std > 0.0 else 0.0
            normalized_features.append(normalized_value)
            
        return normalized_features, None # Return only normalized features in exam mode