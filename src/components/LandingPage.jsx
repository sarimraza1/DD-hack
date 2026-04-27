import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function LandingPage() {
  const { saveUserName, setRoomId } = useApp();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');

  const handleCreateRoom = () => {
    if (!name.trim()) return;
    saveUserName(name.trim());
    const newRoomId = Math.random().toString(36).slice(2, 10);
    setRoomId(newRoomId);
  };

  const handleJoinRoom = () => {
    if (!name.trim() || !room.trim()) return;
    saveUserName(name.trim());
    setRoomId(room.trim());
  };

  return (
    <div className="landing-page">
      <div className="landing-content">
        <h1 className="landing-logo">LIGMA</h1>
        <p className="landing-subtitle">Let's Integrate Groups, Manage Anything</p>
        <div className="landing-form">
          <input
            id="input-name"
            className="landing-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
            autoFocus
          />
          <input
            id="input-room"
            className="landing-input"
            placeholder="Room code (leave empty to create new)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
          />
          <div className="landing-actions">
            <button id="btn-create" className="btn btn-primary" onClick={handleCreateRoom}>
              ✦ Create Workspace
            </button>
            <button id="btn-join" className="btn btn-secondary" onClick={handleJoinRoom} disabled={!room.trim()}>
              → Join Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
