import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [roomId, setRoomId] = useState(null);
  const [userId] = useState(() => {
    let stored = localStorage.getItem('ligma-userId');
    if (!stored) {
      stored = 'user-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ligma-userId', stored);
    }
    return stored;
  });
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('ligma-userName') || '';
  });

  const [nodes, setNodes] = useState(new Map());
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const updateNode = useCallback((nodeId, updates) => {
    setNodes(prev => {
      const next = new Map(prev);
      const existing = next.get(nodeId) || {};
      next.set(nodeId, { ...existing, ...updates });
      return next;
    });
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes(prev => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
    setSelectedNodeId(prev => prev === nodeId ? null : prev);
  }, []);

  const saveUserName = useCallback((name) => {
    setUserName(name);
    localStorage.setItem('ligma-userName', name);
  }, []);

  return (
    <AppContext.Provider value={{
      roomId, setRoomId,
      userId, userName, saveUserName,
      nodes, setNodes, updateNode, deleteNode,
      selectedNodeId, setSelectedNodeId,
      permissions, setPermissions,
      toasts, addToast
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
