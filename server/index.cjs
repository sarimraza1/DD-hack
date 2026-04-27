const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const Y = require('yjs');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('./db.cjs');
const { appendEvent, getEvents, getLatestEventId } = require('./eventLog.cjs');
const { canEditNode, lockNode, unlockNode, setUserRole, getUserRole, getNodePermissions } = require('./rbac.cjs');
const { classifyIntent } = require('./intentClassifier.cjs');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// ========================================
// In-memory Yjs document store per room
// ========================================
const rooms = new Map(); // roomId -> { doc: Y.Doc, conns: Map<ws, {userId, userName}> }

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const doc = new Y.Doc();

    // Ensure room exists in DB
    const db = getDb();
    const existing = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
    if (!existing) {
      db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)').run(roomId, `Room ${roomId.slice(0, 6)}`);
    }

    rooms.set(roomId, {
      doc,
      conns: new Map(),
      awareness: new Map() // userId -> awareness state
    });

    // Listen for doc updates to log events
    const nodesMap = doc.getMap('nodes');
    nodesMap.observeDeep((events, transaction) => {
      if (transaction.local) return; // Don't log server-initiated changes
      // Events are logged in the WebSocket handler where we have user context
    });
  }
  return rooms.get(roomId);
}

// ========================================
// WebSocket handling
// ========================================
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const roomId = url.searchParams.get('room');
  const userId = url.searchParams.get('userId');
  const userName = url.searchParams.get('userName');

  if (!roomId || !userId) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, { roomId, userId, userName });
  });
});

wss.on('connection', (ws, request, { roomId, userId, userName }) => {
  const room = getOrCreateRoom(roomId);
  room.conns.set(ws, { userId, userName });

  // Ensure user exists in DB
  const db = getDb();
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!existingUser) {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    db.prepare('INSERT INTO users (id, name, color) VALUES (?, ?, ?)').run(userId, userName, color);
  }

  // Ensure membership
  const existingMember = db.prepare('SELECT user_id FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  if (!existingMember) {
    // First user in room becomes lead
    const memberCount = db.prepare('SELECT COUNT(*) as cnt FROM room_members WHERE room_id = ?').get(roomId).cnt;
    const role = memberCount === 0 ? 'lead' : 'contributor';
    setUserRole(roomId, userId, role);
  }

  // Send current state
  const stateVector = Y.encodeStateAsUpdate(room.doc);
  ws.send(JSON.stringify({
    type: 'sync-init',
    state: Array.from(stateVector),
    permissions: getNodePermissions(roomId),
    role: getUserRole(roomId, userId),
    lastEventId: getLatestEventId(roomId)
  }));

  // Send current awareness (cursors)
  room.conns.forEach((info, otherWs) => {
    if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
      const awarenessState = room.awareness.get(info.userId);
      if (awarenessState) {
        ws.send(JSON.stringify({
          type: 'awareness',
          userId: info.userId,
          userName: info.userName,
          state: awarenessState
        }));
      }
    }
  });

  // Log join event
  appendEvent(roomId, userId, userName, null, 'user_joined', { userName });

  // Broadcast user joined
  broadcastToRoom(room, ws, {
    type: 'user-joined',
    userId,
    userName
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(ws, room, roomId, userId, userName, msg);
    } catch (e) {
      console.error('Invalid message:', e.message);
    }
  });

  ws.on('close', () => {
    room.conns.delete(ws);
    room.awareness.delete(userId);

    appendEvent(roomId, userId, userName, null, 'user_left', { userName });

    broadcastToRoom(room, null, {
      type: 'awareness-remove',
      userId
    });

    broadcastToRoom(room, null, {
      type: 'user-left',
      userId,
      userName
    });
  });
});

function handleMessage(ws, room, roomId, userId, userName, msg) {
  switch (msg.type) {
    case 'yjs-update': {
      // Apply Yjs update with RBAC check
      const update = new Uint8Array(msg.update);

      // If we have node context, check permissions
      if (msg.nodeId) {
        const check = canEditNode(roomId, userId, msg.nodeId);
        if (!check.allowed) {
          ws.send(JSON.stringify({
            type: 'rbac-error',
            nodeId: msg.nodeId,
            reason: check.reason
          }));
          return;
        }
      }

      Y.applyUpdate(room.doc, update);

      // Log the event
      appendEvent(roomId, userId, userName, msg.nodeId || null, msg.eventType || 'node_updated', msg.payload || {});

      // Broadcast to all other clients
      broadcastToRoom(room, ws, {
        type: 'yjs-update',
        update: Array.from(update),
        userId,
        nodeId: msg.nodeId
      });
      break;
    }

    case 'node-create': {
      const check = canEditNode(roomId, userId, msg.nodeId);
      if (!check.allowed) {
        ws.send(JSON.stringify({ type: 'rbac-error', nodeId: msg.nodeId, reason: check.reason }));
        return;
      }

      const nodesMap = room.doc.getMap('nodes');
      const nodeData = {
        id: msg.nodeId,
        type: msg.nodeType,
        x: msg.x || 0,
        y: msg.y || 0,
        width: msg.width || 200,
        height: msg.height || 150,
        content: msg.content || '',
        color: msg.color || '#FFEAA7',
        author: userId,
        authorName: userName,
        createdAt: new Date().toISOString(),
        intent: null
      };

      room.doc.transact(() => {
        const yNode = new Y.Map();
        Object.entries(nodeData).forEach(([key, value]) => {
          yNode.set(key, value);
        });
        nodesMap.set(msg.nodeId, yNode);
      });

      const event = appendEvent(roomId, userId, userName, msg.nodeId, 'node_created', nodeData);

      broadcastToRoom(room, null, {
        type: 'node-created',
        node: nodeData,
        eventId: event.id
      });
      break;
    }

    case 'node-update': {
      const check = canEditNode(roomId, userId, msg.nodeId);
      if (!check.allowed) {
        ws.send(JSON.stringify({ type: 'rbac-error', nodeId: msg.nodeId, reason: check.reason }));
        return;
      }

      const nodesMap = room.doc.getMap('nodes');
      const yNode = nodesMap.get(msg.nodeId);
      if (!yNode) return;

      room.doc.transact(() => {
        Object.entries(msg.updates).forEach(([key, value]) => {
          yNode.set(key, value);
        });
      });

      // Run intent classification on content updates
      let intentResult = null;
      if (msg.updates.content !== undefined) {
        intentResult = classifyIntent(msg.updates.content);
        room.doc.transact(() => {
          yNode.set('intent', intentResult.intent);
          yNode.set('intentConfidence', intentResult.confidence);
        });
      }

      const event = appendEvent(roomId, userId, userName, msg.nodeId, 'node_updated', {
        updates: msg.updates,
        intent: intentResult
      });

      broadcastToRoom(room, null, {
        type: 'node-updated',
        nodeId: msg.nodeId,
        updates: msg.updates,
        intent: intentResult,
        userId,
        eventId: event.id
      });
      break;
    }

    case 'node-delete': {
      const check = canEditNode(roomId, userId, msg.nodeId);
      if (!check.allowed) {
        ws.send(JSON.stringify({ type: 'rbac-error', nodeId: msg.nodeId, reason: check.reason }));
        return;
      }

      const nodesMap = room.doc.getMap('nodes');
      room.doc.transact(() => {
        nodesMap.delete(msg.nodeId);
      });

      const event = appendEvent(roomId, userId, userName, msg.nodeId, 'node_deleted', {});

      broadcastToRoom(room, null, {
        type: 'node-deleted',
        nodeId: msg.nodeId,
        userId,
        eventId: event.id
      });
      break;
    }

    case 'node-lock': {
      const result = lockNode(roomId, userId, msg.nodeId, msg.minRole || 'lead');
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'rbac-error', nodeId: msg.nodeId, reason: result.reason }));
        return;
      }

      appendEvent(roomId, userId, userName, msg.nodeId, 'node_locked', { minRole: msg.minRole });

      broadcastToRoom(room, null, {
        type: 'node-locked',
        nodeId: msg.nodeId,
        minRole: msg.minRole || 'lead',
        lockedBy: userId
      });
      break;
    }

    case 'node-unlock': {
      const result = unlockNode(roomId, userId, msg.nodeId);
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'rbac-error', nodeId: msg.nodeId, reason: result.reason }));
        return;
      }

      appendEvent(roomId, userId, userName, msg.nodeId, 'node_unlocked', {});

      broadcastToRoom(room, null, {
        type: 'node-unlocked',
        nodeId: msg.nodeId
      });
      break;
    }

    case 'role-change': {
      const requesterRole = getUserRole(roomId, userId);
      if (requesterRole !== 'lead') {
        ws.send(JSON.stringify({ type: 'rbac-error', reason: 'Only leads can change roles' }));
        return;
      }

      setUserRole(roomId, msg.targetUserId, msg.newRole);
      appendEvent(roomId, userId, userName, null, 'role_changed', {
        targetUserId: msg.targetUserId,
        newRole: msg.newRole
      });

      broadcastToRoom(room, null, {
        type: 'role-changed',
        targetUserId: msg.targetUserId,
        newRole: msg.newRole
      });
      break;
    }

    case 'awareness': {
      room.awareness.set(userId, msg.state);

      broadcastToRoom(room, ws, {
        type: 'awareness',
        userId,
        userName,
        state: msg.state
      });
      break;
    }

    case 'drawing-update': {
      appendEvent(roomId, userId, userName, null, 'drawing_updated', { pathId: msg.pathId });

      broadcastToRoom(room, ws, {
        type: 'drawing-update',
        paths: msg.paths,
        userId
      });
      break;
    }
  }
}

function broadcastToRoom(room, excludeWs, message) {
  const data = JSON.stringify(message);
  room.conns.forEach((info, ws) => {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// ========================================
// REST API Routes
// ========================================

// Get events for a room (for event log panel + reconnection replay)
app.get('/api/rooms/:roomId/events', (req, res) => {
  const { roomId } = req.params;
  const sinceId = parseInt(req.query.sinceId) || 0;
  const limit = parseInt(req.query.limit) || 500;
  const events = getEvents(roomId, sinceId, limit);
  res.json({ events, latestId: getLatestEventId(roomId) });
});

// Get room info
app.get('/api/rooms/:roomId', (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  const members = db.prepare(`
    SELECT rm.*, u.name, u.color FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ?
  `).all(req.params.roomId);
  res.json({ room, members });
});

// Create a room
app.post('/api/rooms', (req, res) => {
  const db = getDb();
  const id = uuidv4().slice(0, 8);
  const name = req.body.name || `Workspace ${id}`;
  db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)').run(id, name);
  res.json({ id, name });
});

// Get tasks (action items) for a room
app.get('/api/rooms/:roomId/tasks', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.json({ tasks: [] });
  }

  const nodesMap = room.doc.getMap('nodes');
  const tasks = [];
  nodesMap.forEach((yNode, nodeId) => {
    const intent = yNode.get('intent');
    if (intent === 'action_item') {
      tasks.push({
        nodeId,
        content: yNode.get('content'),
        author: yNode.get('authorName'),
        createdAt: yNode.get('createdAt'),
        x: yNode.get('x'),
        y: yNode.get('y')
      });
    }
  });

  res.json({ tasks });
});

// Classify intent (REST endpoint for testing)
app.post('/api/classify', (req, res) => {
  const result = classifyIntent(req.body.text || '');
  res.json(result);
});

// Get node permissions
app.get('/api/rooms/:roomId/permissions', (req, res) => {
  const permissions = getNodePermissions(req.params.roomId);
  res.json({ permissions });
});

// SPA fallback
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ========================================
// Start server
// ========================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 LIGMA server running on port ${PORT}`);
  // Initialize DB on startup
  getDb();
  console.log('📦 Database initialized');
});
