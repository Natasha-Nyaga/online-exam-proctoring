import numpy as np

def stable_z_score(measurement, mean, std, epsilon=1e-6):
    """
    Returns a stable Z-score for a measurement given mean and std,
    using Laplace smoothing to prevent division by zero or near-zero std.
    """
    return (measurement - mean) / (std + epsilon)

# Example usage:
if __name__ == "__main__":
    # Simulate baseline mean and std
    mean = 2490.75
    std = 1.0  # Problematic, but will be stabilized
    measurement = 3000.0
    z = stable_z_score(measurement, mean, std)
    print(f"Stable Z-score: {z}")
