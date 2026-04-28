import { create } from "zustand";
import * as Y from "yjs";
import { wsClient } from "@/lib/ws-client";

export interface CanvasNode {
  id: string;
  type: "sticky" | "text" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  authorId: string;
}

export interface Task {
  id: string;
  canvasId: string;
  nodeId: string;
  authorId: string;
  text: string;
  status: "open" | "in_progress" | "done";
  confidence: number;
  createdAt: string;
}

export interface CursorInfo {
  userId: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

// Yjs document — local-first CRDT
let ydoc: Y.Doc | null = null;
let yNodes: Y.Map<Y.Map<any>> | null = null;
let isRemoteUpdate = false;

function getYDoc(): Y.Doc {
  if (!ydoc) {
    ydoc = new Y.Doc();
    yNodes = ydoc.getMap("nodes");
  }
  return ydoc;
}

function getYNodes(): Y.Map<Y.Map<any>> {
  getYDoc();
  return yNodes!;
}

// Convert Y.Map nodes to plain object Map
function syncNodesFromYjs(): Map<string, CanvasNode> {
  const nodes = new Map<string, CanvasNode>();
  const yn = getYNodes();
  yn.forEach((yNode, id) => {
    nodes.set(id, yNode.toJSON() as CanvasNode);
  });
  return nodes;
}

interface CanvasState {
  nodes: Map<string, CanvasNode>;
  tasks: Task[];
  cursors: Map<string, CursorInfo>;
  events: any[];
  connected: boolean;
  userId: string;

  initCanvas: (canvasId: string, userId: string, userName: string) => void;
  disconnect: () => void;
  createNode: (node: Partial<CanvasNode>) => void;
  updateNode: (nodeId: string, updates: Partial<CanvasNode>) => void;
  deleteNode: (nodeId: string) => void;
  sendCursor: (x: number, y: number, color: string) => void;
  updateTaskStatus: (taskId: string, status: string) => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: new Map(),
  tasks: [],
  cursors: new Map(),
  events: [],
  connected: false,
  userId: "",

  initCanvas: (canvasId, userId, userName) => {
    set({ userId });

    // Reset Yjs doc for this canvas
    if (ydoc) ydoc.destroy();
    ydoc = new Y.Doc();
    yNodes = ydoc.getMap("nodes");

    // Observe Yjs changes → update React state
    yNodes.observeDeep(() => {
      set({ nodes: syncNodesFromYjs() });
    });

    // Send local Yjs updates to server as binary
    ydoc.on("update", (update: Uint8Array, origin: any) => {
      // Don't re-send updates that came from the server
      if (origin === "remote") return;
      wsClient.sendBinary(update);
    });

    // Connect WebSocket
    wsClient.connect(canvasId, userId, userName);

    // Receive remote Yjs updates (binary)
    wsClient.onBinary((data: Uint8Array) => {
      isRemoteUpdate = true;
      Y.applyUpdate(getYDoc(), data, "remote");
      isRemoteUpdate = false;
    });

    // Handle JSON messages (tasks, cursors, events, etc.)
    wsClient.on("init", (data) => {
      set({ connected: true });
      // If server sends existing nodes as JSON, seed the Yjs doc
      if (data.nodes && Object.keys(data.nodes).length > 0) {
        const doc = getYDoc();
        doc.transact(() => {
          const yn = getYNodes();
          Object.entries(data.nodes).forEach(([id, nodeData]: [string, any]) => {
            if (!yn.has(id)) {
              const yNode = new Y.Map<any>();
              Object.entries(nodeData).forEach(([k, v]) => yNode.set(k, v));
              yn.set(id, yNode);
            }
          });
        }, "remote");
      }
    });

    wsClient.on("presence", (data) => {
      const cursors = new Map<string, CursorInfo>();
      if (data.cursors) {
        Object.entries(data.cursors).forEach(([id, cursor]) => {
          cursors.set(id, cursor as CursorInfo);
        });
      }
      set({ cursors });
    });

    wsClient.on("cursorUpdate", (data) => {
      if (data.userId === userId) return;
      set((state) => {
        const cursors = new Map(state.cursors);
        cursors.set(data.userId, data);
        return { cursors };
      });
    });

    wsClient.on("taskCreated", (data) => {
      set((state) => ({ tasks: [data.task, ...state.tasks] }));
    });

    wsClient.on("taskUpdated", (data) => {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === data.taskId ? { ...t, status: data.status } : t
        ),
      }));
    });

    wsClient.on("userLeft", (data) => {
      set((state) => {
        const cursors = new Map(state.cursors);
        cursors.delete(data.userId);
        return { cursors };
      });
    });

    // Track events from server
    wsClient.on("nodeEvent", (data) => {
      if (data.event) {
        set((state) => ({
          events: [data.event, ...state.events].slice(0, 100),
        }));
      }
    });
  },

  disconnect: () => {
    wsClient.disconnect();
    if (ydoc) {
      ydoc.destroy();
      ydoc = null;
      yNodes = null;
    }
    set({
      nodes: new Map(),
      tasks: [],
      cursors: new Map(),
      events: [],
      connected: false,
    });
  },

  createNode: (node) => {
    const doc = getYDoc();
    const yn = getYNodes();
    const nodeId = crypto.randomUUID();
    const userId = get().userId;

    const fullNode: CanvasNode = {
      id: nodeId,
      type: node.type || "sticky",
      x: node.x ?? 100,
      y: node.y ?? 100,
      width: node.width ?? 200,
      height: node.height ?? 150,
      content: node.content ?? "",
      color: node.color ?? "#fef9c3",
      authorId: userId,
    };

    // Modify Yjs doc — instantly updates local state via observer
    doc.transact(() => {
      const yNode = new Y.Map<any>();
      Object.entries(fullNode).forEach(([k, v]) => yNode.set(k, v));
      yn.set(nodeId, yNode);
    });
  },

  updateNode: (nodeId, updates) => {
    const yn = getYNodes();
    const yNode = yn.get(nodeId);
    if (!yNode) return;

    const doc = getYDoc();
    doc.transact(() => {
      Object.entries(updates).forEach(([k, v]) => {
        if (v !== undefined) yNode.set(k, v);
      });
    });
  },

  deleteNode: (nodeId) => {
    const yn = getYNodes();
    yn.delete(nodeId);
  },

  sendCursor: (x, y, color) => {
    wsClient.send({ type: "cursor", x, y, color });
  },

  updateTaskStatus: (taskId, status) => {
    wsClient.send({ type: "taskUpdate", taskId, status });
  },
}));
