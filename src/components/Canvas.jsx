import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import CanvasNode from './CanvasNode';

const Canvas = forwardRef(function Canvas({
  nodes, selectedNodeId, setSelectedNodeId,
  activeTool, onCreateNode, onUpdateNode, onDeleteNode,
  onCursorMove, canEditNode, isNodeLocked,
  contextMenu, setContextMenu,
  onNodeLock, onNodeUnlock, myRole,
  drawingPaths, setDrawingPaths, send, userId,
  navigateToNodeRef, children
}, ref) {
  const containerRef = useRef(null);
  const worldRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [localPaths, setLocalPaths] = useState([]);
  const svgRef = useRef(null);

  // Navigate to node
  useEffect(() => {
    navigateToNodeRef.current = (nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - node.x * zoom - (node.width || 200) * zoom / 2,
        y: rect.height / 2 - node.y * zoom - (node.height || 150) * zoom / 2
      });
    };
  }, [nodes, zoom, navigateToNodeRef]);

  // Mouse handlers for panning
  const handleMouseDown = useCallback((e) => {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    if (e.target === containerRef.current || e.target === worldRef.current) {
      setSelectedNodeId(null);
    }

    // Pan with middle mouse or space or select mode on background
    if (e.button === 1 || (activeTool === 'select' && (e.target === containerRef.current || e.target === worldRef.current || e.target.classList.contains('drawing-layer')))) {
      if (activeTool === 'draw') return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      e.preventDefault();
      return;
    }

    // Create node on click in tool mode
    if ((activeTool === 'sticky' || activeTool === 'shape' || activeTool === 'text') &&
      (e.target === containerRef.current || e.target === worldRef.current || e.target.classList.contains('drawing-layer'))) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      onCreateNode(activeTool, x, y);
    }
  }, [activeTool, pan, zoom, onCreateNode, setSelectedNodeId, contextMenu, setContextMenu]);

  const handleMouseMove = useCallback((e) => {
    // Panning
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }

    // Cursor sharing
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      onCursorMove(x, y);
    }

    // Drawing
    if (isDrawing && activeTool === 'draw') {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setCurrentPath(prev => [...prev, { x, y }]);
    }
  }, [isPanning, pan, zoom, onCursorMove, isDrawing, activeTool]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);

    if (isDrawing && currentPath.length > 1) {
      const newPaths = [...localPaths, { points: currentPath, color: '#6c63ff', width: 2, id: Date.now() }];
      setLocalPaths(newPaths);
      send({
        type: 'drawing-update',
        paths: newPaths,
        pathId: Date.now(),
        userId
      });
    }
    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, currentPath, localPaths, send, userId]);

  // Drawing start
  const handleDrawStart = useCallback((e) => {
    if (activeTool !== 'draw') return;
    if (e.target !== containerRef.current && e.target !== worldRef.current && !e.target.classList.contains('drawing-layer')) return;

    setIsDrawing(true);
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    setCurrentPath([{ x, y }]);
  }, [activeTool, pan, zoom]);

  // Zoom with wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoom * delta));

    // Zoom towards mouse position
    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  // Context menu
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  // Build SVG path from points
  const pointsToPath = (points) => {
    if (points.length < 2) return '';
    return points.reduce((d, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${d} L ${p.x} ${p.y}`;
    }, '');
  };

  const allPaths = [...localPaths, ...(drawingPaths || [])];

  return (
    <div
      ref={containerRef}
      className={`canvas-container ${isPanning ? 'grabbing' : ''} ${activeTool === 'draw' ? 'crosshair' : ''}`}
      onMouseDown={(e) => { handleMouseDown(e); handleDrawStart(e); }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={worldRef}
        className="canvas-world"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {/* Drawing SVG layer */}
        <svg
          ref={svgRef}
          className={`drawing-layer ${activeTool === 'draw' ? 'active' : ''}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            overflow: 'visible'
          }}
        >
          {allPaths.map((path, i) => (
            <path
              key={path.id || i}
              d={pointsToPath(path.points)}
              stroke={path.color || '#6c63ff'}
              strokeWidth={path.width || 2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath.length > 1 && (
            <path
              d={pointsToPath(currentPath)}
              stroke="#6c63ff"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
            />
          )}
        </svg>

        {/* Canvas Nodes */}
        {Array.from(nodes.entries()).map(([id, node]) => (
          <CanvasNode
            key={id}
            node={node}
            isSelected={selectedNodeId === id}
            onSelect={() => setSelectedNodeId(id)}
            onUpdate={(updates) => onUpdateNode(id, updates)}
            onDelete={() => onDeleteNode(id)}
            canEdit={canEditNode(id)}
            isLocked={!!isNodeLocked(id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                nodeId: id,
                node
              });
            }}
            zoom={zoom}
          />
        ))}

        {/* Remote cursors */}
        {children}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y, position: 'fixed' }}
        >
          {canEditNode(contextMenu.nodeId) && (
            <>
              <div className="context-menu-item" onClick={() => {
                onDeleteNode(contextMenu.nodeId);
                setContextMenu(null);
              }}>
                🗑️ Delete
              </div>
              <div className="context-menu-divider" />
            </>
          )}
          {myRole === 'lead' && (
            <>
              {isNodeLocked(contextMenu.nodeId) ? (
                <div className="context-menu-item" onClick={() => {
                  onNodeUnlock(contextMenu.nodeId);
                  setContextMenu(null);
                }}>
                  🔓 Unlock Node
                </div>
              ) : (
                <>
                  <div className="context-menu-item" onClick={() => {
                    onNodeLock(contextMenu.nodeId, 'lead');
                    setContextMenu(null);
                  }}>
                    🔒 Lock to Lead Only
                  </div>
                  <div className="context-menu-item" onClick={() => {
                    onNodeLock(contextMenu.nodeId, 'contributor');
                    setContextMenu(null);
                  }}>
                    🔒 Lock to Contributors+
                  </div>
                </>
              )}
            </>
          )}
          <div className="context-menu-item" onClick={() => {
            setSelectedNodeId(contextMenu.nodeId);
            setContextMenu(null);
          }}>
            ✏️ Select
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => setZoom(z => Math.min(5, z * 1.2))}>+</button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}>−</button>
        <button className="zoom-btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view">⌂</button>
      </div>
    </div>
  );
});

export default Canvas;
