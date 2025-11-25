
import { useRef } from "react";

export type CursorPos = { x: number; y: number; timestamp: number; type?: string; click?: boolean };

export function useMouseDynamics() {
  const cursorPositions = useRef<CursorPos[]>([]);

  function handleMouseMove(e: MouseEvent | React.MouseEvent) {
    cursorPositions.current.push({ x: (e as any).clientX, y: (e as any).clientY, t: Date.now() });
    if (cursorPositions.current.length > 1000) cursorPositions.current.shift();
  }
  function handleClick(e?: MouseEvent | React.MouseEvent) {
    cursorPositions.current.push({ x: (e as any)?.clientX || 0, y: (e as any)?.clientY || 0, t: Date.now(), click: true });
  }
  function getCurrentMetrics() {
    return { cursorPositions: cursorPositions.current.slice() };
  }
  function resetMetrics() {
    cursorPositions.current = [];
  }
  return { handleMouseMove, handleClick, getCurrentMetrics, resetMetrics, cursorPositions };
}
