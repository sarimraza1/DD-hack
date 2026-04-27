import { useCallback, useRef, useState, useEffect } from "react";
import { useCanvasStore, type CanvasNode } from "@/stores/canvas-store";

interface StickyNoteProps {
  node: CanvasNode;
  scale: number;
}

export default function StickyNote({ node, scale }: StickyNoteProps) {
  const { updateNode, deleteNode } = useCanvasStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const textRef = useRef<HTMLDivElement>(null);
  const isFocusedRef = useRef(false);

  // Sync remote content changes only when NOT focused
  useEffect(() => {
    if (!isFocusedRef.current && textRef.current) {
      if (textRef.current.textContent !== node.content) {
        textRef.current.textContent = node.content;
      }
    }
  }, [node.content]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).getAttribute("contenteditable") === "true") return;
      e.stopPropagation();
      setIsDragging(true);
      setDragOffset({
        x: e.clientX / scale - node.x,
        y: e.clientY / scale - node.y,
      });
    },
    [node.x, node.y, scale]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      const newX = e.clientX / scale - dragOffset.x;
      const newY = e.clientY / scale - dragOffset.y;
      updateNode(node.id, { x: newX, y: newY });
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, dragOffset, node.id, scale, updateNode]);

  const handleContentChange = useCallback(() => {
    if (textRef.current) {
      updateNode(node.id, { content: textRef.current.textContent || "" });
    }
  }, [node.id, updateNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      className="sticky-note group absolute flex flex-col rounded-md shadow-md transition-shadow hover:shadow-lg"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        minHeight: node.height,
        backgroundColor: node.color,
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: isDragging ? 50 : 1,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Drag handle & delete */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider opacity-40">
          {node.type}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteNode(node.id);
          }}
          className="opacity-0 group-hover:opacity-60 hover:opacity-100! text-xs transition-opacity"
          title="Delete"
        >
          ✕
        </button>
      </div>

      {/* Editable content — uncontrolled while focused */}
      <div
        ref={textRef}
        contentEditable
        suppressContentEditableWarning
        className="flex-1 px-3 pb-3 text-sm leading-relaxed text-zinc-800 outline-none"
        style={{ cursor: "text", minHeight: 60 }}
        onInput={handleContentChange}
        onKeyDown={handleKeyDown}
        onFocus={() => { isFocusedRef.current = true; }}
        onBlur={() => { isFocusedRef.current = false; }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
