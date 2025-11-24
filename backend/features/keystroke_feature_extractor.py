import numpy as np
import pandas as pd
from typing import List, Dict, Union, Tuple

class KeystrokeFeatureExtractor:
    """
    Extracts dwell times and flight times for keystroke dynamics based on the provided logic.
    The feature names match the public.behavioral_metrics table schema.
    """
    def __init__(self):
        # Feature names must be snake_case to match the database columns (e.g., mean_du_key1_key1)
        self.feature_names = [
            'mean_du_key1_key1', 
            'mean_dd_key1_key2', 
            'mean_du_key1_key2', 
            'mean_ud_key1_key2', 
            'mean_uu_key1_key2', 
            'std_du_key1_key1', 
            'std_dd_key1_key2', 
            'std_du_key1_key2', 
            'std_ud_key1_key2', 
            'std_uu_key1_key2', 
            'keystroke_count'
        ]
        
        # Mapping from the calculation keys to the standardized feature names
        self._name_map = {
            'mean_DU.key1.key1': 'mean_du_key1_key1',
            'std_DU.key1.key1': 'std_du_key1_key1',
            'mean_DD.key1.key2': 'mean_dd_key1_key2',
            'mean_DU.key1.key2': 'mean_du_key1_key2',
            'mean_UD.key1.key2': 'mean_ud_key1_key2',
            'mean_UU.key1.key2': 'mean_uu_key1_key2',
            'std_DD.key1.key2': 'std_dd_key1_key2',
            'std_DU.key1.key2': 'std_du_key1_key2',
            'std_UD.key1.key2': 'std_ud_key1_key2',
            'std_UU.key1.key2': 'std_uu_key1_key2',
            'keystroke_count': 'keystroke_count'
        }


    def _calculate_features(self, raw_events: List[Dict]) -> Dict[str, float]:
        """
        Calculates raw features from a list of key events using the user's pandas logic.
        """
        if not raw_events or len(raw_events) < 2:
            # Return zero-filled features if not enough data
            return {name: 0.0 for name in self.feature_names}

        df = pd.DataFrame(raw_events)
        df = df.sort_values('timestamp')
        
        # Separate presses and releases
        presses = df[df['type'] == 'keydown'].reset_index(drop=True)
        releases = df[df['type'] == 'keyup'].reset_index(drop=True)
        
        # --- 1. Hold Time (DU.key1.key1) ---
        hold_times = []
        min_len = min(len(presses), len(releases))
        if min_len > 0:
            # Approximate hold times by subtracting corresponding release from press
            hold_times = (releases['timestamp'][:min_len] - presses['timestamp'][:min_len])

        # --- 2. Digraph Latencies (key1.key2) ---
        dd_list = [] # Down-Down: Press(i+1) - Press(i)
        ud_list = [] # Up-Down: Press(i+1) - Release(i)
        uu_list = [] # Up-Up: Release(i+1) - Release(i)
        du_list = [] # Down-Up (Transition): Release(i+1) - Press(i)

        for i in range(len(presses) - 1):
            p1 = presses.iloc[i]['timestamp']
            p2 = presses.iloc[i+1]['timestamp']
            
            # We need corresponding releases for UD/UU
            if i < len(releases) - 1:
                r1 = releases.iloc[i]['timestamp']
                r2 = releases.iloc[i+1]['timestamp']
                
                dd_list.append(p2 - p1)
                ud_list.append(p2 - r1)
                uu_list.append(r2 - r1)
                du_list.append(r2 - p1)

        # --- 3. CONSTRUCT FEATURES ---
        # Initialize dictionary to hold raw calculated features
        raw_calculated_features = {
            'mean_DU.key1.key1': np.mean(hold_times) if len(hold_times) > 0 else 0.0,
            'std_DU.key1.key1': np.std(hold_times) if len(hold_times) > 0 else 0.0,
            'mean_DD.key1.key2': np.mean(dd_list) if len(dd_list) > 0 else 0.0,
            'mean_DU.key1.key2': np.mean(du_list) if len(du_list) > 0 else 0.0,
            'mean_UD.key1.key2': np.mean(ud_list) if len(ud_list) > 0 else 0.0,
            'mean_UU.key1.key2': np.mean(uu_list) if len(uu_list) > 0 else 0.0,
            'std_DD.key1.key2': np.std(dd_list) if len(dd_list) > 0 else 0.0,
            'std_DU.key1.key2': np.std(du_list) if len(du_list) > 0 else 0.0,
            'std_UD.key1.key2': np.std(ud_list) if len(ud_list) > 0 else 0.0,
            'std_UU.key1.key2': np.std(uu_list) if len(uu_list) > 0 else 0.0,
            'keystroke_count': len(presses)
        }

        # Map to final standardized names
        standardized_features = {}
        for old_name, new_name in self._name_map.items():
            standardized_features[new_name] = raw_calculated_features.get(old_name, 0.0)
            
        return standardized_features


    def extract_features(self, events: List[Dict], baseline_stats: Union[Dict, None] = None) -> Tuple[List[float], Union[Dict, None]]:
        """
        Main function to extract features. Normalizes them if baseline_stats are provided.
        Returns a list of features (ready for ML model) and, if in calibration, the calculated statistics.
        """
        raw_features = self._calculate_features(events)
        
        # If no baseline_stats are provided (Calibration Phase)
        if baseline_stats is None:
            # Calculate mean and standard deviation for the calibration block
            stats = {}
            for name in self.feature_names:
                # Assuming the single block's value is the mean, and using a default std (1.0)
                stats[name] = {'mean': raw_features.get(name, 0.0), 'std': 1.0} 
            
            # Return feature values in order and the calculated stats
            feature_vector = [raw_features[name] for name in self.feature_names]
            return feature_vector, stats

        # If baseline_stats are provided (Exam Monitoring Phase)
        normalized_features = []
        
        for name in self.feature_names:
            value = raw_features.get(name, 0.0)
            # Retrieve the student's personalized mean/std for this feature
            stats = baseline_stats.get(name, {'mean': 0.0, 'std': 1.0})
            mean = stats['mean']
            std = stats['std']
            
            # Apply Z-score normalization using the student's personalized baseline stats
            normalized_value = (value - mean) / std if std > 0.0 else 0.0
            normalized_features.append(normalized_value)
            
        return normalized_features, None