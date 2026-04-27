import { Elysia } from "elysia";
import * as Y from "yjs";
import { db } from "../db/db";
import { nodePermissions, tasks } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { appendEvent } from "../services/eventStore";
import { classifyWithDebounce } from "../services/classifier";

// In-memory Yjs docs per canvas
const canvasDocs = new Map<string, Y.Doc>();

function getCanvasDoc(canvasId: string): Y.Doc {
  if (!canvasDocs.has(canvasId)) {
    const doc = new Y.Doc();
    canvasDocs.set(canvasId, doc);

    // Observe node changes for AI classification
    const yNodes = doc.getMap("nodes");
    yNodes.observeDeep((events) => {
      for (const event of events) {
        if (event.target instanceof Y.Map && event.target.parent instanceof Y.Map) {
          // A node was modified
          const nodeId = findNodeId(yNodes, event.target as Y.Map<any>);
          if (nodeId) {
            const content = (event.target as Y.Map<any>).get("content");
            const authorId = (event.target as Y.Map<any>).get("authorId");
            if (content && typeof content === "string" && content.trim().length > 3) {
              classifyWithDebounce(nodeId, content, async (result) => {
                if (result.label === "action item" && result.confidence > 0.65) {
                  try {
                    const [task] = await db
                      .insert(tasks)
                      .values({
                        canvasId,
                        nodeId,
                        authorId: authorId || "system",
                        text: content,
                        confidence: result.confidence,
                      })
                      .returning();

                    await appendEvent(
                      canvasId,
                      "IntentClassified",
                      { ...result, taskId: task.id },
                      authorId,
                      nodeId
                    );

                    // Broadcast task to all clients in the room
                    const doc = canvasDocs.get(canvasId);
                    if (doc) {
                      // We'll broadcast via the server reference stored in the module
                      broadcastJSON(canvasId, { type: "taskCreated", task });
                    }
                  } catch (err) {
                    console.error("Failed to create task:", err);
                  }
                }
              });
            }
          }
        }
      }
    });
  }
  return canvasDocs.get(canvasId)!;
}

function findNodeId(yNodes: Y.Map<Y.Map<any>>, target: Y.Map<any>): string | null {
  let found: string | null = null;
  yNodes.forEach((yNode, id) => {
    if (yNode === target) found = id;
  });
  return found;
}

// Server reference for broadcasting JSON outside ws handlers
let serverRef: any = null;

function broadcastJSON(canvasId: string, data: any) {
  serverRef?.publish(canvasId, JSON.stringify(data));
}

interface CursorState {
  userId: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

const canvasCursors = new Map<string, Map<string, CursorState>>();

export function setupWebSocket(app: Elysia) {
  return app.ws("/ws/canvas/:canvasId", {
    open(ws: any) {
      const canvasId = ws.data.params.canvasId;
      const query = ws.data.query as Record<string, string>;
      const userId = query.userId || "anonymous";
      const userName = query.userName || "Anonymous";

      // Store server ref for out-of-handler broadcasts
      serverRef = app.server;

      ws.subscribe(canvasId);
      ws.data.userId = userId;
      ws.data.userName = userName;

      // Get or create Yjs doc for this canvas
      const doc = getCanvasDoc(canvasId);

      // Send full Yjs state to new client
      const stateUpdate = Y.encodeStateAsUpdate(doc);
      if (stateUpdate.length > 2) {
        // Only send if there's actual content
        ws.send(stateUpdate);
      }

      // Also send JSON init for non-Yjs state
      const nodes = doc.getMap("nodes");
      const nodesObj: Record<string, any> = {};
      nodes.forEach((yNode: any, id: string) => {
        nodesObj[id] = yNode.toJSON();
      });
      ws.send(JSON.stringify({
        type: "init",
        nodes: nodesObj,
      }));

      // Send current cursors
      const cursors = canvasCursors.get(canvasId);
      if (cursors && cursors.size > 0) {
        ws.send(JSON.stringify({
          type: "presence",
          cursors: Object.fromEntries(cursors),
        }));
      }

      // Broadcast user joined
      app.server?.publish(
        canvasId,
        JSON.stringify({ type: "userJoined", userId, name: userName })
      );

      appendEvent(canvasId, "UserJoined", { userName }, userId).catch(() => {});
    },

    async message(ws: any, raw: any) {
      const canvasId = ws.data.params.canvasId;
      const userId = ws.data.userId as string;
      const userName = ws.data.userName as string;

      // Binary message = Yjs update
      if (raw instanceof Buffer || raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
        const update = new Uint8Array(raw instanceof ArrayBuffer ? raw : raw.buffer || raw);
        const doc = getCanvasDoc(canvasId);

        try {
          // Apply update to server-side Yjs doc
          Y.applyUpdate(doc, update);

          // Broadcast binary update to all OTHER clients in the room
          // ws.publish sends to all subscribers EXCEPT the sender
          ws.publish(canvasId, update);

          // Log event
          appendEvent(canvasId, "YjsUpdate", { size: update.length }, userId).catch(() => {});
        } catch (err) {
          console.error("Failed to apply Yjs update:", err);
        }
        return;
      }

      // Text message = JSON
      let msg: any;
      try {
        msg = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        ws.send(JSON.stringify({ type: "error", code: "INVALID_MESSAGE" }));
        return;
      }

      switch (msg.type) {
        case "cursor": {
          if (!canvasCursors.has(canvasId)) {
            canvasCursors.set(canvasId, new Map());
          }
          const cursors = canvasCursors.get(canvasId)!;
          cursors.set(userId, {
            userId,
            name: userName,
            x: msg.x,
            y: msg.y,
            color: msg.color || "#3b82f6",
          });

          ws.publish(
            canvasId,
            JSON.stringify({
              type: "cursorUpdate",
              userId,
              name: userName,
              x: msg.x,
              y: msg.y,
              color: msg.color || "#3b82f6",
            })
          );
          break;
        }

        case "taskUpdate": {
          const { taskId, status } = msg;
          await db
            .update(tasks)
            .set({ status })
            .where(eq(tasks.id, taskId));

          app.server?.publish(
            canvasId,
            JSON.stringify({ type: "taskUpdated", taskId, status })
          );
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", code: "UNKNOWN_MESSAGE_TYPE" }));
      }
    },

    close(ws: any) {
      const canvasId = ws.data.params.canvasId;
      const userId = ws.data.userId as string;

      const cursors = canvasCursors.get(canvasId);
      if (cursors) cursors.delete(userId);

      app.server?.publish(
        canvasId,
        JSON.stringify({ type: "userLeft", userId })
      );

      appendEvent(canvasId, "UserLeft", {}, userId).catch(() => {});
    },
  });
}
