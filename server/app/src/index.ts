import { Elysia, t } from "elysia";
import * as Y from "yjs";

type Role = "lead" | "contributor" | "viewer";

type CursorState = {
  x: number;
  y: number;
  name: string;
  color: string;
  updatedAt: number;
};

type Task = {
  id: string;
  nodeId: string;
  text: string;
  status: "todo" | "in-progress" | "done";
  authorId: string;
  createdAt: string;
  confidence: number;
};

type EventEntry = {
  id: string;
  canvasId: string;
  sequence: number;
  type: string;
  nodeId?: string;
  authorId?: string;
  payload?: unknown;
  createdAt: string;
};

type CanvasState = {
  doc: Y.Doc;
  tasks: Task[];
  events: EventEntry[];
  permissions: Map<string, Role>;
  cursors: Map<string, CursorState>;
  nextSequence: number;
  clients: Set<any>;
};

const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  contributor: 2,
  lead: 3,
};

const canvases = new Map<string, CanvasState>();

function getCanvas(canvasId: string): CanvasState {
  const existing = canvases.get(canvasId);
  if (existing) return existing;

  const state: CanvasState = {
    doc: new Y.Doc(),
    tasks: [],
    events: [],
    permissions: new Map(),
    cursors: new Map(),
    nextSequence: 1,
    clients: new Set(),
  };

  canvases.set(canvasId, state);
  return state;
}

function appendEvent(canvasId: string, event: Omit<EventEntry, "id" | "sequence" | "createdAt">) {
  const canvas = getCanvas(canvasId);
  const entry: EventEntry = {
    ...event,
    id: crypto.randomUUID(),
    sequence: canvas.nextSequence++,
    createdAt: new Date().toISOString(),
  };
  canvas.events.push(entry);
  return entry;
}

function canEdit(role: Role, minRole?: Role) {
  if (!minRole) return true;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

function toBase64(buffer: Uint8Array) {
  return Buffer.from(buffer).toString("base64");
}

function fromBase64(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function classifyIntent(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { label: "reference", confidence: 0 } as const;
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const prompt = `Classify the following canvas note into exactly one category.\nCategories: "action item", "decision", "open question", "reference".\nRespond with JSON only: { "label": "<category>", "confidence": <0.0-1.0> }\n\nNote: "${trimmed}"`;
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 60,
          temperature: 0,
        }),
      });
      const json = await response.json();
      const raw = json?.choices?.[0]?.message?.content;
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        if (parsed?.label && typeof parsed?.confidence === "number") {
          return parsed as { label: string; confidence: number };
        }
      }
    } catch {
      // fall through to heuristic
    }
  }

  if (trimmed.endsWith("?")) {
    return { label: "open question", confidence: 0.72 } as const;
  }

  if (/\b(decide|decision|agreed|approved)\b/i.test(trimmed)) {
    return { label: "decision", confidence: 0.68 } as const;
  }

  if (/^(build|create|ship|design|fix|implement|add|review|draft|test|deploy)\b/i.test(trimmed)) {
    return { label: "action item", confidence: 0.7 } as const;
  }

  return { label: "reference", confidence: 0.55 } as const;
}

const app = new Elysia()
  .get("/", () => "Welcome to LIGMA API")
  .group("/api", (app) =>
    app
      .get("/health", () => ({ status: "ok" }))
      .get("/canvas/:id", ({ params }) => {
        const canvas = getCanvas(params.id);
        return {
          id: params.id,
          tasks: canvas.tasks.length,
          events: canvas.events.length,
        };
      })
      .get("/canvas/:id/tasks", ({ params }) => {
        const canvas = getCanvas(params.id);
        return canvas.tasks;
      })
      .get("/canvas/:id/events", ({ params, query }) => {
        const canvas = getCanvas(params.id);
        const after = Number(query.after ?? 0);
        return canvas.events.filter((event) => event.sequence > after);
      })
      .get("/canvas/:id/permissions", ({ params }) => {
        const canvas = getCanvas(params.id);
        return Object.fromEntries(canvas.permissions.entries());
      })
      .post(
        "/canvas/:id/nodes/:nodeId/permissions",
        ({ params, body }) => {
          const canvas = getCanvas(params.id);
          canvas.permissions.set(params.nodeId, body.role);
          const entry = appendEvent(params.id, {
            canvasId: params.id,
            type: "permissionChanged",
            nodeId: params.nodeId,
            authorId: body.actorId,
            payload: { role: body.role },
          });
          for (const client of canvas.clients) {
            client.send(
              JSON.stringify({
                type: "permissionChanged",
                nodeId: params.nodeId,
                role: body.role,
                event: entry,
              })
            );
          }
          return { ok: true };
        },
        {
          body: t.Object({
            role: t.Union([t.Literal("lead"), t.Literal("contributor"), t.Literal("viewer")]),
            actorId: t.String(),
          }),
        }
      )
  )
  .ws("/ws/canvas/:id", {
    open(ws) {
      const canvasId = ws.data.params.id as string;
      const canvas = getCanvas(canvasId);
      canvas.clients.add(ws);
    },
    async message(ws, message) {
      const canvasId = ws.data.params.id as string;
      const canvas = getCanvas(canvasId);
      const data = typeof message === "string" ? JSON.parse(message) : message;

      if (data?.type === "hello") {
        const role: Role = data.role ?? "viewer";
        ws.data.userId = data.userId;
        ws.data.role = role;
        ws.data.lastSeq = Number(data.lastSeq ?? 0);

        const update = Y.encodeStateAsUpdate(canvas.doc);
        ws.send(
          JSON.stringify({
            type: "sync",
            update: toBase64(update),
            tasks: canvas.tasks,
            permissions: Object.fromEntries(canvas.permissions.entries()),
            events: canvas.events,
            cursors: Object.fromEntries(canvas.cursors.entries()),
          })
        );
        return;
      }

      if (data?.type === "cursor") {
        if (!ws.data.userId) return;
        const cursor: CursorState = {
          x: data.x,
          y: data.y,
          name: data.name ?? "",
          color: data.color ?? "",
          updatedAt: Date.now(),
        };
        canvas.cursors.set(ws.data.userId, cursor);
        for (const client of canvas.clients) {
          client.send(
            JSON.stringify({
              type: "cursor",
              userId: ws.data.userId,
              cursor,
            })
          );
        }
        return;
      }

      if (data?.type === "yjsUpdate") {
        if (!ws.data.userId || !ws.data.role) return;
        if (!data.nodeId) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "INVALID_NODE",
              message: "nodeId required",
            })
          );
          return;
        }

        const minRole = canvas.permissions.get(data.nodeId);
        if (!canEdit(ws.data.role, minRole)) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "FORBIDDEN",
              message: "insufficient role",
            })
          );
          return;
        }

        const update = fromBase64(data.update);
        Y.applyUpdate(canvas.doc, update);

        const entry = appendEvent(canvasId, {
          canvasId,
          type: "yjsUpdate",
          nodeId: data.nodeId,
          authorId: ws.data.userId,
          payload: { update: data.update },
        });

        for (const client of canvas.clients) {
          client.send(
            JSON.stringify({
              type: "yjsUpdate",
              update: data.update,
              event: entry,
            })
          );
        }
        return;
      }

      if (data?.type === "intentCheck") {
        if (!ws.data.userId) return;
        const result = await classifyIntent(data.text ?? "");

        const classifiedEvent = appendEvent(canvasId, {
          canvasId,
          type: "intentClassified",
          nodeId: data.nodeId,
          authorId: ws.data.userId,
          payload: result,
        });

        for (const client of canvas.clients) {
          client.send(
            JSON.stringify({
              type: "event",
              event: classifiedEvent,
            })
          );
        }

        if (result.label === "action item" && result.confidence >= 0.65) {
          const existing = canvas.tasks.find((task) => task.nodeId === data.nodeId);
          if (!existing) {
            const task: Task = {
              id: crypto.randomUUID(),
              nodeId: data.nodeId,
              text: data.text,
              status: "todo",
              authorId: ws.data.userId,
              createdAt: new Date().toISOString(),
              confidence: result.confidence,
            };
            canvas.tasks.push(task);
            const entry = appendEvent(canvasId, {
              canvasId,
              type: "taskCreated",
              nodeId: data.nodeId,
              authorId: ws.data.userId,
              payload: task,
            });
            for (const client of canvas.clients) {
              client.send(
                JSON.stringify({
                  type: "taskCreated",
                  task,
                  event: entry,
                })
              );
            }
          }
        }
      }
    },
    close(ws) {
      const canvasId = ws.data.params.id as string;
      const canvas = getCanvas(canvasId);
      canvas.clients.delete(ws);
      if (ws.data.userId) {
        canvas.cursors.delete(ws.data.userId);
        for (const client of canvas.clients) {
          client.send(
            JSON.stringify({
              type: "cursor",
              userId: ws.data.userId,
              cursor: null,
            })
          );
        }
      }
    },
  })
  .listen(3001);

console.log(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
