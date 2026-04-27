import { useRef, useEffect, useCallback, useState } from 'react';

const WS_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_WS_URL || `wss://${window.location.host}`)
  : 'ws://localhost:3001';

export function useWebSocket(roomId, userId, userName) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [myRole, setMyRole] = useState('contributor');
  const listenersRef = useRef(new Map());
  const reconnectTimerRef = useRef(null);
  const lastEventIdRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}?room=${roomId}&userId=${userId}&userName=${encodeURIComponent(userName)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'sync-init') {
          setMyRole(msg.role);
          lastEventIdRef.current = msg.lastEventId || 0;
        }

        if (msg.type === 'role-changed' && msg.targetUserId === userId) {
          setMyRole(msg.newRole);
        }

        // Track event IDs for reconnection
        if (msg.eventId) {
          lastEventIdRef.current = Math.max(lastEventIdRef.current, msg.eventId);
        }

        // Notify all registered listeners
        const typeListeners = listenersRef.current.get(msg.type) || [];
        typeListeners.forEach(cb => cb(msg));

        // Also notify 'all' listeners
        const allListeners = listenersRef.current.get('*') || [];
        allListeners.forEach(cb => cb(msg));

      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 2 seconds
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, [roomId, userId, userName]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const on = useCallback((type, callback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, []);
    }
    listenersRef.current.get(type).push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = listenersRef.current.get(type) || [];
      listenersRef.current.set(type, listeners.filter(cb => cb !== callback));
    };
  }, []);

  return { send, on, connected, myRole, wsRef };
}
