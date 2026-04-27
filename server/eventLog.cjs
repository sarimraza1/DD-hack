const { getDb } = require('./db.cjs');

/**
 * Append an immutable event to the log.
 * Events are never updated or deleted — append-only.
 */
function appendEvent(roomId, userId, userName, nodeId, eventType, payload = {}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (room_id, user_id, user_name, node_id, event_type, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(roomId, userId, userName, nodeId, eventType, JSON.stringify(payload));
  return {
    id: result.lastInsertRowid,
    room_id: roomId,
    user_id: userId,
    user_name: userName,
    node_id: nodeId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString()
  };
}

/**
 * Get all events for a room, ordered by ID (chronological).
 */
function getEvents(roomId, sinceId = 0, limit = 500) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE room_id = ? AND id > ?
    ORDER BY id ASC
    LIMIT ?
  `);
  const rows = stmt.all(roomId, sinceId, limit);
  return rows.map(row => ({
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : {}
  }));
}

/**
 * Get the latest event ID for a room (for reconnection replay).
 */
function getLatestEventId(roomId) {
  const db = getDb();
  const stmt = db.prepare(`SELECT MAX(id) as maxId FROM events WHERE room_id = ?`);
  const row = stmt.get(roomId);
  return row?.maxId || 0;
}

module.exports = { appendEvent, getEvents, getLatestEventId };
