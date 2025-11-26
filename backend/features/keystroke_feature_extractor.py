import numpy as np
import pandas as pd
from typing import List, Dict, Union, Tuple

def stable_z_score(measurement, mean, std, epsilon=1e-6):
    """
    Returns a stable Z-score for a measurement given mean and std,
    using Laplace smoothing to prevent division by zero or near-zero std.
    """
    return (measurement - mean) / (std + epsilon)

class KeystrokeFeatureExtractor:
    """
    Extracts dwell times and flight times for keystroke dynamics based on the provided logic.
    The feature names match the public.behavioral_metrics table schema.
    """
    def __init__(self):
        # Feature names must be snake_case to match the database columns
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
            hold_times = (releases['timestamp'][:min_len] - presses['timestamp'][:min_len])

        # --- 2. Digraph Latencies (key1.key2) ---
        dd_list = []
        ud_list = []
        uu_list = []
        du_list = []

        for i in range(len(presses) - 1):
            p1 = presses.iloc[i]['timestamp']
            p2 = presses.iloc[i+1]['timestamp']
            
            if i < len(releases) - 1:
                r1 = releases.iloc[i]['timestamp']
                r2 = releases.iloc[i+1]['timestamp']
                
                dd_list.append(p2 - p1)
                ud_list.append(p2 - r1)
                uu_list.append(r2 - r1)
                du_list.append(r2 - p1)

        # --- 3. CONSTRUCT FEATURES ---
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
        if not events or len(events) < 2:
            feature_vector = [0.0] * len(self.feature_names)
            simplified_stats = {
                'mean': 0.0,
                'std': 1.0,
                'detailed_stats': {name: {'mean': 0.0, 'std': 1.0} for name in self.feature_names}
            }
            return feature_vector, simplified_stats

        raw_features = self._calculate_features(events)
        
        # If no baseline_stats are provided (Calibration Phase)
        if baseline_stats is None:
            feature_values = [raw_features[name] for name in self.feature_names]
            k_mean = float(np.mean(feature_values))
            k_std = float(np.std(feature_values))
            simplified_stats = {
                'mean': k_mean,
                'std': k_std,
                'detailed_stats': {name: {'mean': raw_features.get(name, 0.0), 'std': 1.0} for name in self.feature_names}
            }
            feature_vector = [raw_features[name] for name in self.feature_names]
            return feature_vector, simplified_stats

        # If baseline_stats are provided (Exam Monitoring Phase)
        normalized_features = []
        for name in self.feature_names:
            value = raw_features.get(name, 0.0)
            stats = baseline_stats.get(name, {'mean': 0.0, 'std': 1.0})
            mean = stats['mean']
            std = stats['std']
            normalized_value = stable_z_score(value, mean, std)
            normalized_features.append(normalized_value)
        return normalized_features, None

    def extract_features_all(self, all_events: List[Dict]) -> Tuple[List[List[float]], Dict]:
        """
        NEW METHOD: Processes all calibration events and returns multiple feature vectors.
        Used during calibration to create baseline statistics.
        
        Returns:
            - List of feature vectors (one per segment/question)
            - Aggregated statistics across all segments
        """
        if not all_events or len(all_events) < 2:
            return [], {
                'mean': 0.0,
                'std': 1.0,
                'detailed_stats': {name: {'mean': 0.0, 'std': 1.0} for name in self.feature_names}
            }
        
        # Extract raw features from all events as one segment
        raw_features = self._calculate_features(all_events)
        feature_vector = [raw_features[name] for name in self.feature_names]
        
        # Calculate overall statistics
        k_mean = float(np.mean(feature_vector))
        k_std = float(np.std(feature_vector)) if len(feature_vector) > 1 else 1.0
        
        simplified_stats = {
            'mean': k_mean,
            'std': k_std,
            'detailed_stats': {name: {'mean': raw_features[name], 'std': 1.0} for name in self.feature_names}
        }
        
        return [feature_vector], simplified_stats