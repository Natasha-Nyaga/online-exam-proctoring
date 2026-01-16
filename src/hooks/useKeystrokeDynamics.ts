import { useRef } from "react";

/**
 * Keystroke event format expected by backend:
 * {
 *   key: string,
 *   type: 'keydown' | 'keyup',
 *   timestamp: number,
 *   down_time?: number,  // For keydown events
 *   up_time?: number     // For keyup events
 * }
 */

export interface KeystrokeEvent {
  key: string;
  type: 'keydown' | 'keyup';
  timestamp: number;
  down_time?: number;
  up_time?: number;
}

export function useKeystrokeDynamics() {
  const keystrokeEvents = useRef<KeystrokeEvent[]>([]);
  const keyDownTimes = useRef<Map<string, number>>(new Map());

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    const now = Date.now();
    const key = e.key;
    
    // Store the down time for this key
    keyDownTimes.current.set(key, now);
    
    // Add keydown event
    keystrokeEvents.current.push({
      key: key,
      type: 'keydown',
      timestamp: now,
      down_time: now,
    });
    
    // Prevent buffer from growing too large
    if (keystrokeEvents.current.length > 2000) {
      keystrokeEvents.current = keystrokeEvents.current.slice(-1000);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent | KeyboardEvent) => {
    const now = Date.now();
    const key = e.key;
    
    // Get the corresponding down time (if it exists)
    const downTime = keyDownTimes.current.get(key) || now;
    
    // Add keyup event
    keystrokeEvents.current.push({
      key: key,
      type: 'keyup',
      timestamp: now,
      up_time: now,
      down_time: downTime, // Include down_time for backend's hold time calculation
    });
    
    // Clean up the stored down time
    keyDownTimes.current.delete(key);
    
    // Prevent buffer overflow
    if (keystrokeEvents.current.length > 2000) {
      keystrokeEvents.current = keystrokeEvents.current.slice(-1000);
    }
  };

  const getCurrentMetrics = () => {
    return {
      keystrokeEvents: keystrokeEvents.current.slice(), // Return a copy
      totalEvents: keystrokeEvents.current.length,
      uniqueKeys: new Set(keystrokeEvents.current.map(e => e.key)).size,
    };
  };

  const resetMetrics = () => {
    keystrokeEvents.current = [];
    keyDownTimes.current.clear();
  };

  return {
    handleKeyDown,
    handleKeyUp,
    getCurrentMetrics,
    resetMetrics,
    keystrokeEvents, // Expose ref for direct access
  };
}