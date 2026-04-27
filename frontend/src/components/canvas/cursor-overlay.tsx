import { useCanvasStore, type CursorInfo } from "@/stores/canvas-store";

export default function CursorOverlay() {
  const cursors = useCanvasStore((s) => s.cursors);

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {Array.from(cursors.values()).map((cursor: CursorInfo) => (
        <div
          key={cursor.userId}
          className="absolute transition-all duration-150 ease-out"
          style={{
            left: cursor.x,
            top: cursor.y,
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill={cursor.color}
            className="drop-shadow-sm"
          >
            <path d="M0 0 L16 6 L6 6 L6 16 Z" />
          </svg>
          {/* Name label */}
          <span
            className="ml-4 -mt-1 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.name}
          </span>
        </div>
      ))}
    </div>
  );
}
