import { useState, useRef, useCallback, useEffect } from 'react';

export default function CanvasNode({
  node, isSelected, onSelect, onUpdate, onDelete,
  canEdit, isLocked, onContextMenu, zoom
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const textRef = useRef(null);
  const debounceRef = useRef(null);

  // Drag handling
  const handleDragStart = useCallback((e) => {
    if (isEditing || !canEdit || isResizing) return;
    if (e.target.tagName === 'TEXTAREA') return;

    setIsDragging(true);
    onSelect();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
    e.stopPropagation();
  }, [isEditing, canEdit, isResizing, node.x, node.y, onSelect]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e) => {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      onUpdate({
        x: dragStart.current.nodeX + dx,
        y: dragStart.current.nodeY + dy
      });
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, zoom, onUpdate]);

  // Resize handling
  const handleResizeStart = useCallback((e) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: node.width || 200,
      h: node.height || 150
    };
  }, [canEdit, node.width, node.height]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e) => {
      const dx = (e.clientX - resizeStart.current.x) / zoom;
      const dy = (e.clientY - resizeStart.current.y) / zoom;
      onUpdate({
        width: Math.max(100, resizeStart.current.w + dx),
        height: Math.max(60, resizeStart.current.h + dy)
      });
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing, zoom, onUpdate]);

  // Content editing with debounced sync
  const handleContentChange = useCallback((e) => {
    const content = e.target.value;
    // Immediate local update
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate({ content });
    }, 300);
  }, [onUpdate]);

  const handleDoubleClick = useCallback((e) => {
    if (!canEdit) return;
    setIsEditing(true);
    onSelect();
    e.stopPropagation();
    setTimeout(() => textRef.current?.focus(), 50);
  }, [canEdit, onSelect]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (textRef.current) {
      onUpdate({ content: textRef.current.value });
    }
  }, [onUpdate]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' && isSelected && !isEditing && canEdit) {
      onDelete();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [isSelected, isEditing, canEdit, onDelete]);

  useEffect(() => {
    if (isSelected) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSelected, handleKeyDown]);

  const intentClass = node.intent ? `intent-${node.intent}` : '';
  const lockedClass = isLocked ? 'locked' : '';
  const selectedClass = isSelected ? 'selected' : '';

  if (node.type === 'sticky') {
    return (
      <div
        className={`canvas-node node-sticky ${selectedClass} ${lockedClass}`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width || 200,
          height: node.height || 150,
          backgroundColor: node.color || '#FFEAA7',
          zIndex: isDragging ? 100 : (isSelected ? 20 : 1)
        }}
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu}
      >
        {isSelected && canEdit && (
          <div className="color-picker" onMouseDown={(e) => e.stopPropagation()}>
            {['#FFEAA7', '#FD79A8', '#74B9FF', '#55EFC4', '#A29BFE', '#FAB1A0', '#81ECEC', '#FF7675'].map(c => (
              <div
                key={c}
                className={`color-swatch ${node.color === c || (!node.color && c === '#FFEAA7') ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ color: c });
                }}
              />
            ))}
          </div>
        )}
        {isEditing && canEdit ? (
          <textarea
            ref={textRef}
            className="node-content"
            defaultValue={node.content || ''}
            onChange={handleContentChange}
            onBlur={handleBlur}
            placeholder="Write something..."
            autoFocus
          />
        ) : (
          <div className="node-content" style={{ cursor: canEdit ? 'text' : 'default', whiteSpace: 'pre-wrap' }}>
            {node.content || (canEdit ? 'Double-click to edit' : '')}
          </div>
        )}
        <div className="node-meta">
          <span>{node.authorName || 'Anonymous'}</span>
          {node.intent && node.intent !== 'reference' && (
            <span className={`node-intent-badge ${intentClass}`}>
              {node.intent === 'action_item' ? '⚡ Task' :
               node.intent === 'decision' ? '✓ Decision' :
               node.intent === 'question' ? '? Question' : node.intent}
            </span>
          )}
        </div>
        <div className="node-resize-handle" onMouseDown={handleResizeStart} />
      </div>
    );
  }

  if (node.type === 'shape') {
    return (
      <div
        className={`canvas-node node-shape ${selectedClass} ${lockedClass}`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width || 150,
          height: node.height || 150,
          zIndex: isDragging ? 100 : (isSelected ? 20 : 1)
        }}
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu}
      >
        {isEditing && canEdit ? (
          <textarea
            ref={textRef}
            className="node-content"
            defaultValue={node.content || ''}
            onChange={handleContentChange}
            onBlur={handleBlur}
            placeholder="Label..."
            autoFocus
            style={{ textAlign: 'center', color: 'var(--text-primary)' }}
          />
        ) : (
          <span>{node.content || ''}</span>
        )}
        <div className="node-resize-handle" onMouseDown={handleResizeStart} />
      </div>
    );
  }

  if (node.type === 'text') {
    return (
      <div
        className={`canvas-node node-text ${selectedClass} ${lockedClass}`}
        style={{
          left: node.x,
          top: node.y,
          width: node.width || 300,
          minHeight: node.height || 50,
          zIndex: isDragging ? 100 : (isSelected ? 20 : 1)
        }}
        onMouseDown={handleDragStart}
        onDoubleClick={handleDoubleClick}
        onContextMenu={onContextMenu}
      >
        {isEditing && canEdit ? (
          <textarea
            ref={textRef}
            className="node-content"
            defaultValue={node.content || ''}
            onChange={handleContentChange}
            onBlur={handleBlur}
            placeholder="Type text..."
            autoFocus
          />
        ) : (
          <div className="node-content" style={{ cursor: canEdit ? 'text' : 'default', whiteSpace: 'pre-wrap' }}>
            {node.content || (canEdit ? 'Double-click to edit' : '')}
          </div>
        )}
        <div className="node-resize-handle" onMouseDown={handleResizeStart} />
      </div>
    );
  }

  return null;
}
