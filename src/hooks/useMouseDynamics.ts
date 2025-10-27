import { useState, useCallback, useRef } from 'react';

interface Position {
  x: number;
  y: number;
  timestamp: number;
}

interface HoverData {
  optionIndex: number;
  duration: number;
}

interface MouseDynamics {
  cursorPositions: Position[];
  movementSpeed: number;
  acceleration: number;
  clickFrequency: number;
  hoverTimes: HoverData[];
  trajectorySmoothness: number;
  clickPositions: Position[];
}

export const useMouseDynamics = () => {
  const [metrics, setMetrics] = useState<MouseDynamics>({
    cursorPositions: [],
    movementSpeed: 0,
    acceleration: 0,
    clickFrequency: 0,
    hoverTimes: [],
    trajectorySmoothness: 0,
    clickPositions: [],
  });

  const positions = useRef<Position[]>([]);
  const clicks = useRef<Position[]>([]);
  const hoverStart = useRef<{ index: number; time: number } | null>(null);
  const hoverData = useRef<HoverData[]>([]);
  const startTime = useRef<number>(Date.now());

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const position: Position = {
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now(),
    };
    positions.current.push(position);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const position: Position = {
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now(),
    };
    clicks.current.push(position);
  }, []);

  const handleMouseEnter = useCallback((optionIndex: number) => {
    hoverStart.current = {
      index: optionIndex,
      time: Date.now(),
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverStart.current) {
      const duration = Date.now() - hoverStart.current.time;
      hoverData.current.push({
        optionIndex: hoverStart.current.index,
        duration,
      });
      hoverStart.current = null;
    }
  }, []);

  const calculateDistance = (p1: Position, p2: Position): number => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const calculateSpeed = (positions: Position[]): number => {
    if (positions.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < positions.length; i++) {
      totalDistance += calculateDistance(positions[i - 1], positions[i]);
    }
    
    const totalTime = (positions[positions.length - 1].timestamp - positions[0].timestamp) / 1000;
    return totalTime > 0 ? totalDistance / totalTime : 0;
  };

  const calculateAcceleration = (positions: Position[]): number => {
    if (positions.length < 3) return 0;
    
    const accelerations: number[] = [];
    for (let i = 2; i < positions.length; i++) {
      const speed1 = calculateDistance(positions[i - 2], positions[i - 1]) / 
                    ((positions[i - 1].timestamp - positions[i - 2].timestamp) / 1000);
      const speed2 = calculateDistance(positions[i - 1], positions[i]) / 
                    ((positions[i].timestamp - positions[i - 1].timestamp) / 1000);
      const dt = (positions[i].timestamp - positions[i - 1].timestamp) / 1000;
      if (dt > 0) {
        accelerations.push(Math.abs(speed2 - speed1) / dt);
      }
    }
    
    return accelerations.length > 0
      ? accelerations.reduce((a, b) => a + b, 0) / accelerations.length
      : 0;
  };

  const calculateSmoothness = (positions: Position[]): number => {
    if (positions.length < 3) return 1;
    
    let totalAngleChange = 0;
    for (let i = 2; i < positions.length; i++) {
      const v1x = positions[i - 1].x - positions[i - 2].x;
      const v1y = positions[i - 1].y - positions[i - 2].y;
      const v2x = positions[i].x - positions[i - 1].x;
      const v2y = positions[i].y - positions[i - 1].y;
      
      const dotProduct = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
      
      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dotProduct / (mag1 * mag2);
        const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
        totalAngleChange += angle;
      }
    }
    
    const maxAngleChange = (positions.length - 2) * Math.PI;
    return maxAngleChange > 0 ? 1 - (totalAngleChange / maxAngleChange) : 1;
  };

  const calculateMetrics = useCallback((): MouseDynamics => {
    const elapsedSeconds = (Date.now() - startTime.current) / 1000;
    const clickFrequency = elapsedSeconds > 0 ? clicks.current.length / elapsedSeconds : 0;

    return {
      cursorPositions: positions.current,
      movementSpeed: calculateSpeed(positions.current),
      acceleration: calculateAcceleration(positions.current),
      clickFrequency,
      hoverTimes: hoverData.current,
      trajectorySmoothness: calculateSmoothness(positions.current),
      clickPositions: clicks.current,
    };
  }, []);

  const resetMetrics = useCallback(() => {
    positions.current = [];
    clicks.current = [];
    hoverData.current = [];
    hoverStart.current = null;
    startTime.current = Date.now();
    setMetrics({
      cursorPositions: [],
      movementSpeed: 0,
      acceleration: 0,
      clickFrequency: 0,
      hoverTimes: [],
      trajectorySmoothness: 0,
      clickPositions: [],
    });
  }, []);

  const getCurrentMetrics = useCallback(() => {
    const calculated = calculateMetrics();
    setMetrics(calculated);
    return calculated;
  }, [calculateMetrics]);

  return {
    metrics,
    handleMouseMove,
    handleClick,
    handleMouseEnter,
    handleMouseLeave,
    getCurrentMetrics,
    resetMetrics,
  };
};
