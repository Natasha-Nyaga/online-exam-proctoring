import { useState, useCallback, useRef, useEffect } from 'react';

interface KeystrokeEvent {
  key: string;
  timestamp: number;
  type: 'keydown' | 'keyup';
}

interface KeystrokeDynamics {
  dwellTimes: number[];
  flightTimes: number[];
  typingSpeed: number;
  errorRate: number;
  keySequence: string[];
}

export const useKeystrokeDynamics = () => {
  const [metrics, setMetrics] = useState<KeystrokeDynamics>({
    dwellTimes: [],
    flightTimes: [],
    typingSpeed: 0,
    errorRate: 0,
    keySequence: [],
  });

  const keystrokeEvents = useRef<KeystrokeEvent[]>([]);
  const startTime = useRef<number>(Date.now());
  const totalChars = useRef<number>(0);
  const deleteCount = useRef<number>(0);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const timestamp = Date.now();
    keystrokeEvents.current.push({
      key: e.key,
      timestamp,
      type: 'keydown',
    });

    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteCount.current += 1;
    } else if (e.key.length === 1) {
      totalChars.current += 1;
    }
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    const timestamp = Date.now();
    keystrokeEvents.current.push({
      key: e.key,
      timestamp,
      type: 'keyup',
    });
  }, []);

  const calculateMetrics = useCallback((): KeystrokeDynamics => {
    const events = keystrokeEvents.current;
    const dwellTimes: number[] = [];
    const flightTimes: number[] = [];
    const keySequence: string[] = [];
    
    const keyDownMap = new Map<string, number>();
    let lastKeyUpTime: number | null = null;

    events.forEach((event) => {
      if (event.type === 'keydown') {
        keyDownMap.set(event.key, event.timestamp);
        keySequence.push(event.key);

        // Calculate flight time (time between previous key up and current key down)
        if (lastKeyUpTime !== null) {
          flightTimes.push(event.timestamp - lastKeyUpTime);
        }
      } else if (event.type === 'keyup') {
        const downTime = keyDownMap.get(event.key);
        if (downTime !== undefined) {
          // Calculate dwell time (key hold duration)
          dwellTimes.push(event.timestamp - downTime);
          keyDownMap.delete(event.key);
        }
        lastKeyUpTime = event.timestamp;
      }
    });

    // Calculate typing speed (characters per minute)
    const elapsedMinutes = (Date.now() - startTime.current) / 60000;
    const typingSpeed = elapsedMinutes > 0 ? totalChars.current / elapsedMinutes : 0;

    // Calculate error rate (backspace/delete ratio)
    const errorRate = totalChars.current > 0 ? deleteCount.current / totalChars.current : 0;

    return {
      dwellTimes,
      flightTimes,
      typingSpeed,
      errorRate,
      keySequence,
    };
  }, []);

  const resetMetrics = useCallback(() => {
    keystrokeEvents.current = [];
    startTime.current = Date.now();
    totalChars.current = 0;
    deleteCount.current = 0;
    setMetrics({
      dwellTimes: [],
      flightTimes: [],
      typingSpeed: 0,
      errorRate: 0,
      keySequence: [],
    });
  }, []);

  const getCurrentMetrics = useCallback(() => {
    const calculated = calculateMetrics();
    setMetrics(calculated);
    return calculated;
  }, [calculateMetrics]);

  return {
    metrics,
    handleKeyDown,
    handleKeyUp,
    getCurrentMetrics,
    resetMetrics,
    keystrokeEvents, // Expose ref for raw event access
  };
};
