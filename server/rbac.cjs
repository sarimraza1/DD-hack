const { getDb } = require('./db.cjs');

/**
 * Role hierarchy: lead > contributor > viewer
 * Higher roles can do everything lower roles can.
 */
const ROLE_HIERARCHY = {
  'lead': 3,
  'contributor': 2,
  'viewer': 1
};

/**
 * Check if a user's role meets the minimum required role.
 */
function hasMinRole(userRole, minRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
}

/**
 * Get user's role in a room.
 */
function getUserRole(roomId, userId) {
  const db = getDb();
  const stmt = db.prepare(`SELECT role FROM room_members WHERE room_id = ? AND user_id = ?`);
  const row = stmt.get(roomId, userId);
  return row?.role || 'viewer';
}

/**
 * Check if a user can edit a specific node.
 * Returns { allowed: boolean, reason: string }
 */
function canEditNode(roomId, userId, nodeId) {
  const userRole = getUserRole(roomId, userId);

  // Viewers can never edit
  if (userRole === 'viewer') {
    return { allowed: false, reason: 'Viewers cannot edit nodes' };
  }

  // Check node-level lock
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM node_permissions WHERE room_id = ? AND node_id = ?`);
  const perm = stmt.get(roomId, nodeId);

  if (perm && !hasMinRole(userRole, perm.min_role)) {
    return { allowed: false, reason: `Node is locked to role: ${perm.min_role}` };
  }

  return { allowed: true, reason: 'OK' };
}

/**
 * Lock a node to a minimum role (only leads can do this).
 */
function lockNode(roomId, userId, nodeId, minRole) {
  const userRole = getUserRole(roomId, userId);
  if (userRole !== 'lead') {
    return { success: false, reason: 'Only leads can lock nodes' };
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO node_permissions (room_id, node_id, locked_by, min_role)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(roomId, nodeId, userId, minRole);
  return { success: true };
}

/**
 * Unlock a node (only leads can do this).
 */
function unlockNode(roomId, userId, nodeId) {
  const userRole = getUserRole(roomId, userId);
  if (userRole !== 'lead') {
    return { success: false, reason: 'Only leads can unlock nodes' };
  }

  const db = getDb();
  const stmt = db.prepare(`DELETE FROM node_permissions WHERE room_id = ? AND node_id = ?`);
  stmt.run(roomId, nodeId);
  return { success: true };
}

/**
 * Set a user's role in a room.
 */
function setUserRole(roomId, userId, role) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO room_members (room_id, user_id, role)
    VALUES (?, ?, ?)
  `);
  stmt.run(roomId, userId, role);
}

/**
 * Get all node permissions for a room.
 */
function getNodePermissions(roomId) {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM node_permissions WHERE room_id = ?`);
  return stmt.all(roomId);
}

module.exports = {
  getUserRole,
  canEditNode,
  lockNode,
  unlockNode,
  setUserRole,
  getNodePermissions,
  ROLE_HIERARCHY,
  hasMinRole
};
