export default function EventLogPanel({ events, onClose }) {
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatEventType = (type) => {
    return type.replace(/_/g, ' ');
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'node_created': return '➕';
      case 'node_updated': return '✏️';
      case 'node_deleted': return '🗑️';
      case 'user_joined': return '👋';
      case 'user_left': return '👤';
      case 'node_locked': return '🔒';
      case 'node_unlocked': return '🔓';
      case 'role_changed': return '🔄';
      case 'drawing_updated': return '🎨';
      default: return '📌';
    }
  };

  return (
    <div className="side-panel">
      <div className="panel-header">
        <span className="panel-title">📜 Event Log</span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-text">
              No events yet. Start collaborating<br />and all mutations will be logged here.
            </div>
          </div>
        ) : (
          [...events].reverse().map(event => (
            <div
              key={event.id}
              className={`event-item event-${event.event_type.replace(/_/g, '-')}`}
              id={`event-${event.id}`}
            >
              <span className="event-time">{formatTime(event.created_at)}</span>
              <span className="event-type">
                {getEventIcon(event.event_type)} {formatEventType(event.event_type)}
              </span>
              <br />
              <span style={{ fontSize: '0.7rem' }}>
                by {event.user_name || 'System'}
                {event.node_id && <span style={{ color: 'var(--accent-secondary)' }}> • {event.node_id.slice(0, 12)}</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
