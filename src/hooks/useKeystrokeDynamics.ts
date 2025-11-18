
import { useRef } from "react";

export type KeystrokeEvent = { key: string; type: "keydown" | "keyup"; timestamp: number };

export function useKeystrokeDynamics() {
    const keystrokeEvents = useRef<KeystrokeEvent[]>([]);

    function handleKeyDown(e: KeyboardEvent | React.KeyboardEvent) {
        keystrokeEvents.current.push({ key: (e as any).key, type: "keydown", timestamp: Date.now() });
    }
    function handleKeyUp(e: KeyboardEvent | React.KeyboardEvent) {
        keystrokeEvents.current.push({ key: (e as any).key, type: "keyup", timestamp: Date.now() });
    }
    function getCurrentMetrics() {
        return { events: keystrokeEvents.current.slice() };
    }
    function resetMetrics() {
        keystrokeEvents.current = [];
    }
    return { handleKeyDown, handleKeyUp, getCurrentMetrics, resetMetrics, keystrokeEvents };
}
