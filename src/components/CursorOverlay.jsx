export default function CursorOverlay({ cursors }) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

  function getColor(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  return (
    <>
      {Array.from(cursors.entries()).map(([userId, cursor]) => {
        const color = getColor(userId);
        return (
          <div
            key={userId}
            className="remote-cursor"
            style={{
              left: cursor.x,
              top: cursor.y,
            }}
          >
            <svg className="remote-cursor-pointer" viewBox="0 0 16 20" fill="none">
              <path d="M0 0L16 12L8 12L4 20L0 0Z" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
            </svg>
            <span
              className="remote-cursor-label"
              style={{ backgroundColor: color }}
            >
              {cursor.userName || 'User'}
            </span>
          </div>
        );
      })}
    </>
  );
}
