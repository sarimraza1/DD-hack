export default function TaskBoard({ tasks, onClose, onNavigate }) {
  return (
    <div className="side-panel">
      <div className="panel-header">
        <span className="panel-title">📋 Task Board <span className="badge" style={{ background: 'var(--accent-primary)', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', marginLeft: '6px' }}>{tasks.length}</span></span>
        <button className="panel-close" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-text">
              No tasks yet. Write action items on sticky notes<br />
              (e.g., "TODO: fix the login bug") and they'll appear here automatically.
            </div>
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.nodeId}
              className="task-item"
              onClick={() => onNavigate(task.nodeId)}
              id={`task-${task.nodeId}`}
            >
              <div className="task-content">{task.content}</div>
              <div className="task-meta">
                <span className="task-author">
                  👤 {task.author || 'Anonymous'}
                </span>
                <span className="task-link-icon" title="Click to navigate to node">
                  🔗 Go to node
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
