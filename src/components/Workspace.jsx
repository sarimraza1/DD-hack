import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useWebSocket } from '../hooks/useWebSocket';
import Canvas from './Canvas';
import Toolbar from './Toolbar';
import TaskBoard from './TaskBoard';
import EventLogPanel from './EventLogPanel';
import CursorOverlay from './CursorOverlay';
import ToastContainer from './ToastContainer';

const API_URL = import.meta.env.PROD ? (import.meta.env.VITE_BACKEND_URL || '') : 'http://localhost:3001';

export default function Workspace() {
  const {
    roomId, userId, userName,
    nodes, setNodes, updateNode, deleteNode,
    selectedNodeId, setSelectedNodeId,
    permissions, setPermissions,
    addToast
  } = useApp();

  const { send, on, connected, myRole } = useWebSocket(roomId, userId, userName);
  const [activePanel, setActivePanel] = useState(null);
  const [activeTool, setActiveTool] = useState('select'); // select, sticky, shape, text, draw
  const [events, setEvents] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [drawingPaths, setDrawingPaths] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const canvasRef = useRef(null);
  const navigateToNodeRef = useRef(null);

  // Event handlers
  useEffect(() => {
    const unsubs = [];

    unsubs.push(on('sync-init', (msg) => {
      if (msg.permissions) setPermissions(msg.permissions);
    }));

    unsubs.push(on('node-created', (msg) => {
      updateNode(msg.node.id, msg.node);
    }));

    unsubs.push(on('node-updated', (msg) => {
      const updates = { ...msg.updates };
      if (msg.intent) {
        updates.intent = msg.intent.intent;
        updates.intentConfidence = msg.intent.confidence;
      }
      updateNode(msg.nodeId, updates);
    }));

    unsubs.push(on('node-deleted', (msg) => {
      deleteNode(msg.nodeId);
    }));

    unsubs.push(on('node-locked', (msg) => {
      setPermissions(prev => {
        const filtered = prev.filter(p => p.node_id !== msg.nodeId);
        return [...filtered, { room_id: roomId, node_id: msg.nodeId, min_role: msg.minRole, locked_by: msg.lockedBy }];
      });
      addToast(`Node locked (requires ${msg.minRole} role)`, 'info');
    }));

    unsubs.push(on('node-unlocked', (msg) => {
      setPermissions(prev => prev.filter(p => p.node_id !== msg.nodeId));
      addToast('Node unlocked', 'success');
    }));

    unsubs.push(on('rbac-error', (msg) => {
      addToast(msg.reason, 'error');
    }));

    unsubs.push(on('awareness', (msg) => {
      if (msg.userId !== userId) {
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.set(msg.userId, {
            ...msg.state,
            userName: msg.userName,
            userId: msg.userId
          });
          return next;
        });
      }
    }));

    unsubs.push(on('awareness-remove', (msg) => {
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.delete(msg.userId);
        return next;
      });
    }));

    unsubs.push(on('user-joined', (msg) => {
      if (msg.userId !== userId) {
        addToast(`${msg.userName} joined`, 'info');
      }
      setConnectedUsers(prev => {
        if (prev.find(u => u.userId === msg.userId)) return prev;
        return [...prev, { userId: msg.userId, userName: msg.userName }];
      });
    }));

    unsubs.push(on('user-left', (msg) => {
      addToast(`${msg.userName} left`, 'info');
      setConnectedUsers(prev => prev.filter(u => u.userId !== msg.userId));
    }));

    unsubs.push(on('role-changed', (msg) => {
      addToast(`Role updated to ${msg.newRole}`, 'info');
    }));

    unsubs.push(on('drawing-update', (msg) => {
      if (msg.userId !== userId) {
        setDrawingPaths(msg.paths);
      }
    }));

    return () => unsubs.forEach(unsub => unsub());
  }, [on, userId, roomId, updateNode, deleteNode, setPermissions, addToast, setNodes]);

  // Fetch events periodically
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rooms/${roomId}/events?limit=200`);
        const data = await res.json();
        setEvents(data.events || []);
      } catch (e) {
        // silently fail
      }
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 3000);
    return () => clearInterval(interval);
  }, [roomId]);

  // Send cursor position
  const handleCursorMove = useCallback((x, y) => {
    send({
      type: 'awareness',
      state: { x, y, tool: activeTool }
    });
  }, [send, activeTool]);

  // Node operations
  const createNode = useCallback((type, x, y) => {
    const nodeId = 'node-' + Math.random().toString(36).slice(2, 10);
    const colors = ['#FFEAA7', '#FD79A8', '#74B9FF', '#55EFC4', '#A29BFE', '#FAB1A0'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const nodeData = {
      nodeId,
      nodeType: type,
      x, y,
      width: type === 'text' ? 300 : 200,
      height: type === 'text' ? 50 : 150,
      content: '',
      color: type === 'sticky' ? color : undefined
    };

    send({ type: 'node-create', ...nodeData });

    // Optimistic update
    updateNode(nodeId, {
      id: nodeId,
      type,
      x, y,
      width: nodeData.width,
      height: nodeData.height,
      content: '',
      color: nodeData.color || '#FFEAA7',
      author: userId,
      authorName: userName,
      createdAt: new Date().toISOString(),
      intent: null
    });

    setSelectedNodeId(nodeId);
    setActiveTool('select');
  }, [send, updateNode, userId, userName, setSelectedNodeId]);

  const handleNodeUpdate = useCallback((nodeId, updates) => {
    send({
      type: 'node-update',
      nodeId,
      updates
    });
    updateNode(nodeId, updates);
  }, [send, updateNode]);

  const handleNodeDelete = useCallback((nodeId) => {
    send({ type: 'node-delete', nodeId });
    deleteNode(nodeId);
  }, [send, deleteNode]);

  const handleNodeLock = useCallback((nodeId, minRole = 'lead') => {
    send({ type: 'node-lock', nodeId, minRole });
  }, [send]);

  const handleNodeUnlock = useCallback((nodeId) => {
    send({ type: 'node-unlock', nodeId });
  }, [send]);

  const handleRoleChange = useCallback((targetUserId, newRole) => {
    send({ type: 'role-change', targetUserId, newRole });
  }, [send]);

  const isNodeLocked = useCallback((nodeId) => {
    return permissions.find(p => p.node_id === nodeId);
  }, [permissions]);

  const canEditNodeCheck = useCallback((nodeId) => {
    if (myRole === 'viewer') return false;
    const perm = permissions.find(p => p.node_id === nodeId);
    if (!perm) return true;
    const roleLevel = { lead: 3, contributor: 2, viewer: 1 };
    return (roleLevel[myRole] || 0) >= (roleLevel[perm.min_role] || 0);
  }, [myRole, permissions]);

  const navigateToNode = useCallback((nodeId) => {
    if (navigateToNodeRef.current) {
      navigateToNodeRef.current(nodeId);
    }
    setSelectedNodeId(nodeId);
    setActivePanel(null);
  }, [setSelectedNodeId]);

  // Task list from nodes
  const tasks = Array.from(nodes.entries())
    .filter(([, n]) => n.intent === 'action_item')
    .map(([id, n]) => ({
      nodeId: id,
      content: n.content,
      author: n.authorName,
      createdAt: n.createdAt,
      x: n.x,
      y: n.y
    }));

  // AI Summary Export
  const handleExportSummary = useCallback(() => {
    let summary = `# LIGMA Workspace Summary - Room: ${roomId}\n`;
    summary += `Generated: ${new Date().toLocaleString()}\n\n`;

    const nodesArr = Array.from(nodes.values());

    const tasksList = nodesArr.filter(n => n.intent === 'action_item');
    const decisions = nodesArr.filter(n => n.intent === 'decision');
    const questions = nodesArr.filter(n => n.intent === 'question');
    const others = nodesArr.filter(n => n.intent !== 'action_item' && n.intent !== 'decision' && n.intent !== 'question' && n.content?.trim());

    if (tasksList.length > 0) {
      summary += `## ⚡ Action Items (Tasks)\n`;
      tasksList.forEach(t => summary += `- [ ] ${t.content} (Assigned/Created by: ${t.authorName})\n`);
      summary += `\n`;
    }

    if (decisions.length > 0) {
      summary += `## ✓ Decisions Made\n`;
      decisions.forEach(d => summary += `- ${d.content}\n`);
      summary += `\n`;
    }

    if (questions.length > 0) {
      summary += `## ? Open Questions\n`;
      questions.forEach(q => summary += `- ${q.content}\n`);
      summary += `\n`;
    }

    if (others.length > 0) {
      summary += `## 📌 General Notes & Ideas\n`;
      others.forEach(o => summary += `- ${o.content}\n`);
      summary += `\n`;
    }

    const blob = new Blob([summary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LIGMA_Summary_${roomId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addToast('Summary exported successfully!', 'success');
  }, [nodes, roomId, addToast]);

  return (
    <div className="workspace">
      {/* Header */}
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="workspace-logo">LIGMA</span>
          <span className="room-name">Room: {roomId}</span>
          <span className={`user-role-badge role-${myRole}`}>{myRole}</span>
          {!connected && <span style={{ color: 'var(--accent-warning)', fontSize: '0.75rem' }}>⟳ Reconnecting...</span>}
        </div>
        <div className="workspace-header-right">
          <div className="user-avatars">
            {connectedUsers.map(u => (
              <div
                key={u.userId}
                className="user-avatar"
                style={{ backgroundColor: getColorForUser(u.userId) }}
                title={u.userName}
              >
                {u.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
            ))}
            <div
              className="user-avatar"
              style={{ backgroundColor: getColorForUser(userId) }}
              title={`${userName} (you)`}
            >
              {userName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          </div>
          <button 
            className="btn btn-primary btn-sm" 
            style={{ marginLeft: '12px' }}
            onClick={handleExportSummary}
            title="Download structured brief"
          >
            ⬇️ AI Export
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="workspace-body">
        {/* Panel toggles */}
        <div className="panel-toggle-group">
          <button
            id="btn-tasks"
            className={`panel-toggle ${activePanel === 'tasks' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'tasks' ? null : 'tasks')}
          >
            📋 Tasks {tasks.length > 0 && <span className="badge">{tasks.length}</span>}
          </button>
          <button
            id="btn-events"
            className={`panel-toggle ${activePanel === 'events' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'events' ? null : 'events')}
          >
            📜 Event Log
          </button>
          <button
            id="btn-members"
            className={`panel-toggle ${activePanel === 'members' ? 'active' : ''}`}
            onClick={() => setActivePanel(activePanel === 'members' ? null : 'members')}
          >
            👥 Members
          </button>
        </div>

        {/* Canvas */}
        <Canvas
          ref={canvasRef}
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          activeTool={activeTool}
          onCreateNode={createNode}
          onUpdateNode={handleNodeUpdate}
          onDeleteNode={handleNodeDelete}
          onCursorMove={handleCursorMove}
          canEditNode={canEditNodeCheck}
          isNodeLocked={isNodeLocked}
          contextMenu={contextMenu}
          setContextMenu={setContextMenu}
          onNodeLock={handleNodeLock}
          onNodeUnlock={handleNodeUnlock}
          myRole={myRole}
          drawingPaths={drawingPaths}
          setDrawingPaths={setDrawingPaths}
          send={send}
          userId={userId}
          navigateToNodeRef={navigateToNodeRef}
        >
          <CursorOverlay cursors={remoteCursors} />
        </Canvas>

        {/* Side Panels */}
        {activePanel === 'tasks' && (
          <TaskBoard
            tasks={tasks}
            onClose={() => setActivePanel(null)}
            onNavigate={navigateToNode}
          />
        )}
        {activePanel === 'events' && (
          <EventLogPanel
            events={events}
            onClose={() => setActivePanel(null)}
          />
        )}
        {activePanel === 'members' && (
          <MembersPanel
            connectedUsers={[...connectedUsers, { userId, userName }]}
            myRole={myRole}
            onRoleChange={handleRoleChange}
            onClose={() => setActivePanel(null)}
            currentUserId={userId}
            roomId={roomId}
          />
        )}

        {/* Toolbar */}
        <Toolbar activeTool={activeTool} setActiveTool={setActiveTool} myRole={myRole} />
      </div>

      <ToastContainer />
    </div>
  );
}

function MembersPanel({ connectedUsers, myRole, onRoleChange, onClose, currentUserId, roomId }) {
  return (
    <div className="side-panel">
      <div className="panel-header">
        <span className="panel-title">👥 Members</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        <div className="rbac-section">
          <div className="rbac-section-title">Room Code</div>
          <div style={{
            padding: '10px',
            background: 'var(--surface-1)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'monospace',
            fontSize: '1rem',
            textAlign: 'center',
            color: 'var(--accent-secondary)',
            marginBottom: '16px',
            userSelect: 'all',
            cursor: 'pointer'
          }}>{roomId}</div>
        </div>
        <div className="rbac-section">
          <div className="rbac-section-title">Connected Users</div>
          {connectedUsers.map(u => (
            <div key={u.userId} className="member-item">
              <div className="member-info">
                <div className="member-avatar" style={{ backgroundColor: getColorForUser(u.userId) }}>
                  {u.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <span className="member-name">
                  {u.userName} {u.userId === currentUserId ? '(you)' : ''}
                </span>
              </div>
              {myRole === 'lead' && u.userId !== currentUserId && (
                <select
                  className="role-select"
                  defaultValue="contributor"
                  onChange={(e) => onRoleChange(u.userId, e.target.value)}
                >
                  <option value="lead">Lead</option>
                  <option value="contributor">Contributor</option>
                  <option value="viewer">Viewer</option>
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getColorForUser(userId) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
