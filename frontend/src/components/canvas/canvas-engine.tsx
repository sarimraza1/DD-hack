import { useCallback, useRef, useState, useEffect } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import StickyNote from "./sticky-note";

const NOTE_COLORS = [
  "#fef9c3", // yellow
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#f3e8ff", // purple
  "#fed7aa", // orange
];

export default function CanvasEngine() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const { nodes, createNode, sendCursor } = useCanvasStore();

  // Check if click is on canvas background (not on a sticky note)
  const isCanvasBackground = useCallback((target: EventTarget) => {
    const el = target as HTMLElement;
    // Allow clicks on: the container itself, the SVG grid, the canvas-world div, or any SVG child
    if (el === containerRef.current) return true;
    if (el.closest(".canvas-world") && !el.closest(".sticky-note")) return true;
    if (el.tagName === "svg" || el.tagName === "rect" || el.tagName === "circle") return true;
    if (el.closest("svg")) return true;
    return false;
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle click always pans, left click pans on background only
      if (e.button === 1 || (e.button === 0 && isCanvasBackground(e.target))) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
        e.preventDefault();
      }
    },
    [camera, isCanvasBackground]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setCamera((c) => ({
          ...c,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        }));
      }
      // Send cursor position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const worldX = (e.clientX - rect.left - camera.x) / camera.scale;
        const worldY = (e.clientY - rect.top - camera.y) / camera.scale;
        sendCursor(worldX, worldY, "#3b82f6");
      }
    },
    [isPanning, panStart, camera, sendCursor]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, camera.scale * zoomFactor));

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setCamera((c) => ({
        x: mouseX - (mouseX - c.x) * (newScale / c.scale),
        y: mouseY - (mouseY - c.y) * (newScale / c.scale),
        scale: newScale,
      }));
    },
    [camera.scale]
  );

  // Double-click to create note
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only create on background clicks, not on existing notes
      if (!isCanvasBackground(e.target)) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const worldX = (e.clientX - rect.left - camera.x) / camera.scale;
      const worldY = (e.clientY - rect.top - camera.y) / camera.scale;

      createNode({
        type: "sticky",
        x: worldX - 100,
        y: worldY - 75,
        width: 200,
        height: 150,
        content: "",
        color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
      });
    },
    [camera, createNode, isCanvasBackground]
  );

  // Prevent default wheel to avoid page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const nodesArray = Array.from(nodes.values());

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-background"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isPanning ? "grabbing" : "crosshair" }}
    >
      {/* Dotted background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
          backgroundSize: `${24 * camera.scale}px ${24 * camera.scale}px`,
          backgroundPosition: `${camera.x % (24 * camera.scale)}px ${camera.y % (24 * camera.scale)}px`,
          opacity: 0.5,
        }}
      />

      {/* Canvas world */}
      <div
        className="canvas-world absolute inset-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {nodesArray.map((node) => (
          <StickyNote key={node.id} node={node} scale={camera.scale} />
        ))}
      </div>

      {/* HUD */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm border border-border/50">
        <span>{Math.round(camera.scale * 100)}%</span>
        <span className="text-border">·</span>
        <span>Double-click to add note</span>
      </div>
    </div>
  );
}
