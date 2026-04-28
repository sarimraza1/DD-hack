# LIGMA — Technical PRD & Implementation Plan

**Event:** DevDay'26 Web Development Hackathon  
**Project:** LIGMA (Let’s Integrate Groups, Manage Anything) — Virtual Collaboration Workspace  
**Classification:** Real-Time Collaborative Canvas + Event-Sourced Task Board  
**Primary Language:** TypeScript (end-to-end)  
**Target Platform:** Render (Web Service) + Neon PostgreSQL + Upstash Redis  
**Version:** 1.0 — Hackathon Edition  
**Date:** 2026-04-27

---

## 1. Executive Summary

LIGMA bridges ideation and execution in a single real-time workspace. Teams brainstorm on an infinite canvas; the platform extracts intent from canvas content via an embedded AI classifier and populates a live task board automatically. Every mutation is captured in an immutable append-only event log, enabling state reconstruction, time-travel replay, and robust conflict-free concurrent editing via CRDTs.

This PRD serves as the single source of truth for architecture, implementation, and judging criteria alignment.

---

## 2. Requirements Decomposition & Scoring Alignment

| Evaluation Category         | Max Pts | Key Deliveryables                                                                  |
| --------------------------- | ------- | ---------------------------------------------------------------------------------- |
| **Real-Time Collaboration** | 25      | Multi-user sync (10), CRDT conflict resolution (10), cursor presence (5)           |
| **Core Features**           | 25      | AI intent extraction (10), live Task Board with backlinks (8), node-level RBAC (7) |
| **Architecture**            | 20      | Append-only event sourcing (8), clean API separation (7), README + arch docs (5)   |
| **UI / UX**                 | 15      | Intuitive canvas (8), responsive layout (4), visual consistency (3)                |
| **Innovation**              | 15      | One fully functional bonus feature (8), unique articulated decisions (7)           |
| **TOTAL**                   | **100** |                                                                                    |

### Critical Constraints

- **NO paid 3rd-party integrations** — disqualification risk. Free-tier AI APIs (Groq, Gemini Flash) are acceptable as they incur zero cost.
- **Render deployment required** for judging eligibility.
- **Server-side enforcement mandatory** for RBAC — client-only guards score zero.
- **Stage 1 architecture presentation** feeds Category 5 (Innovation) scoring.

---

## 3. Tech Stack Selection & Justification

### 3.1 Runtime & Backend

| Technology          | Role                       | Justification                                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun**             | Runtime & package manager  | Native TypeScript execution (no `tsc` compilation step in dev), 4x+ faster startup than Node, built-in high-performance WebSocket server, compatible with most npm packages. Ideal for real-time hackathon projects.                                                                |
| **Elysia**          | HTTP & WebSocket framework | Bun-native, end-to-end type-safe via Eden Treaty (like tRPC but lighter), declarative routing, built-in WebSocket plugin with pub/sub semantics, excellent middleware chain for RBAC validation. Demonstrates modern architectural awareness.                                       |
| **Neon PostgreSQL** | Primary database           | Serverless Postgres with a generous free tier and instant branching — no local Docker required during dev. Standard `pg`-compatible wire protocol means Drizzle ORM works unchanged. JSONB columns for flexible event payloads; ACID compliance for event store integrity.          |
| **Upstash Redis**   | Ephemeral / presence store | Serverless Redis accessed over HTTP/REST via `@upstash/redis`. Free tier (10k commands/day) is sufficient for cursor positions, active session TTLs, WebSocket connection mapping, and RBAC caching. No persistent connection management — fits Bun's single-process model cleanly. |
| **Drizzle ORM**     | Type-safe SQL              | Thin, SQL-like syntax, excellent TypeScript inference, no heavy abstraction penalty, schema-as-code aligns with architectural clarity judging criteria.                                                                                                                             |

| **Groq API** | Server-side AI inference | Free tier (dev key), sub-100ms responses on `llama3-8b-8192` or `gemma2-9b-it`. Used exclusively for intent classification on the server — the client sends Yjs text deltas, the server calls Groq, appends the `IntentClassified` event. Gemini Flash (`gemini-2.0-flash`) is the fallback if Groq rate-limits during demo. |

| Technology                   | Role                    | Justification                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 19**                 | UI framework            | Concurrent features, optimal for high-frequency state updates (cursors, canvas deltas). Largest ecosystem for rapid hackathon UI construction.                                                                                                                                                     |
| **Vite**                     | Build tool              | Instant HMR, fast production builds, Bun-compatible.                                                                                                                                                                                                                                               |
| **TypeScript**               | End-to-end types        | Single language across stack; Elysia + Eden enables sharing TS interfaces between backend and frontend automatically.                                                                                                                                                                              |
| **Tailwind CSS + shadcn/ui** | Styling & components    | Rapidly build consistent, accessible UI primitives (dialogs, panels, dropdowns) without design overhead.                                                                                                                                                                                           |
| **Zustand**                  | Client state management | Minimal boilerplate for UI state (tool selection, sidebar visibility, auth). Complements (not replaces) Yjs for canvas state.                                                                                                                                                                      |
| **Yjs**                      | CRDT & real-time sync   | Industry-standard CRDT implementation (YATA algorithm). Provides `Y.Map` for nodes, `Y.Text` for collaborative text, `Y.Array` for strokes, and Awareness API for cursor presence. Using Yjs is architecturally sound; the README will explain its CRDT mechanics to satisfy judging requirements. |

### 3.3 Why Not Node/Express/Next.js?

- **Node + Express**: Slower WebSocket throughput, callback-based middleware is harder to reason about under time pressure.
- **Next.js**: App Router serverless functions are not designed for persistent WebSocket connections. Workarounds (Vercel AI SDK, PartyKit) are paid or complex.
- **Elysia on Bun** is the sweet spot: modern, type-safe, WebSocket-native, and demonstrates non-obvious architectural decision-making (Category 5 points).

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │  React + Zustand  │  │  Yjs CRDT Doc   │                             │
│  │  (UI State)       │  │  (Canvas State) │                             │
│  └──────────────┘  └──────────────┘                             │
│                         │                                        │
│  ┌──────────────────────┴──────────────────────────────────┐   │
│  │              Custom Infinite Canvas Engine                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ Pan/Zoom │ │  DOM     │ │  HTML5   │ │   SVG    │   │   │
│  │  │ Layer    │ │  Nodes   │ │  Draw    │ │  Edges   │   │   │
│  │  │          │ │(sticky,  │ │ Layer    │ │(connect) │   │   │
│  │  │          │ │ shapes)  │ │          │ │          │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                   ┌────────────┴────────────┐
                   │   WebSocket (Bun.ws)   │  +  HTTP REST API
                   │   Binary Yjs updates   │     (Elysia/Eden)
                   │   + JSON delta events  │
                   └────────────┬────────────┘
                                 │
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER (Bun + Elysia)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth Guard   │  │  RBAC Validator│  │  Event Publisher     │  │
│  │  (JWT Verify) │  │  (Per-node ACL) │  │  (Broadcast deltas)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                         │                                       │
│  ┌──────────────────────┴──────────────────────────────────┐    │
│  │              Canonical Yjs Document (Server-held)        │    │
│  │    Resolves conflicts, maintains ground truth state    │    │
│  └────────────────────────────────────────────────────────┘    │
│                         │                                       │
│  ┌──────────────────────┴──────────────────────────────────┐   │
│  │    Intent Classifier (Groq API — free tier)              │   │
│  │    Text delta in → label + confidence out (< 300ms)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┴──────────────────────────────────┐   │
│  │              Command / Event Sourcing Layer              │   │
│  │   All mutations → immutable events → Neon PG events tbl  │   │
│  │   Read models (tasks, snapshots) derived async           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              │                                   │
      ┌───────▼────────┐                 ┌─────────▼────────┐
      │  Neon Postgres  │                 │  Upstash Redis  │
      │  (Event Store  │                 │   (Presence,   │
      │   + Read Model)│                 │    Sessions)   │
      └────────────────┘                 └────────────────┘
```

---

## 5. Feature Implementation Plan

### 5.1 The Infinite Canvas (Score Alignment: UI/UX 8 pts + Real-Time 10 pts)

**Capabilities:** Sticky notes (colored), freehand drawing, geometric shapes, text blocks, node connections.

**Implementation Approach:**

| Sub-Feature                      | Approach                                                                                                                                                                                                                                               | Library / Tool     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| **Pan & Zoom**                   | CSS `transform: translate(x,y) scale(s)` on a container div. Wheel to zoom, drag to pan. Store camera state in URL hash for shareable links.                                                                                                           | Custom (300 lines) |
| **Sticky Notes / Shapes / Text** | Absolutely positioned `div` elements inside the transformed container. Each is a Yjs `Y.Map` with `{id, type, x, y, width, height, content, color, style}`. Content editable via `contentEditable` bound to `Y.Text` for real-time collaborative text. | Yjs + React refs   |
| **Freehand Drawing**             | Dedicated HTML5 `<canvas>` element behind the DOM nodes. On pointer down/move/up, record points arrays. Each stroke is a Yjs `Y.Array` of `{x, y, pressure?}` pushed to a `Y.Array` of strokes. Render via `ctx.lineTo`.                               | HTML5 Canvas API   |
| **Node Connections**             | SVG `<line>` or `<path>` layer between DOM nodes. Calculate anchor points dynamically. Store edges as `Y.Array<{from, to}>` in Yjs doc.                                                                                                                | SVG                |
| **Selection & Drag**             | Custom drag logic: on pointer down, detect target node (hit testing via DOM), offset drag delta, update `x,y` in Yjs `Y.Map`.                                                                                                                          | Custom             |

**Why Custom over TLDraw/Excalidraw:**

- We need **per-node RBAC** (lock individual nodes). External whiteboard libraries enforce their own data model; grafting RBAC onto them requires fighting the framework.
- We need **intent-aware task extraction** triggered by node text changes. Custom nodes expose text content trivially.
- We need **event sourcing** at the mutation level. External libraries batch/hide operations.
- Custom canvas demonstrates deeper architectural understanding (Category 5 points).

---

### 5.2 Real-Time Collaboration & CRDT Conflict Resolution (Score Alignment: 25 pts)

**Architecture:**

1. **Yjs Document Structure:**

```typescript
// Shared Yjs document schema
ydoc.getMap("meta"); // { canvasId, createdAt, ownerId }
ydoc.getMap("nodes"); // Map<nodeId, Y.Map<NodeData>>
ydoc.getArray("edges"); // Y.Array<{from: string, to: string}>
ydoc.getArray("strokes"); // Y.Array<Y.Array<{x,y}>>
```

2. **Synchronization Protocol:**

- Client opens WebSocket with `lastEventId` and `canvasId`.
- Server maintains a canonical `Y.Doc` per canvas in memory (LRU eviction to Redis snapshot if idle).
- Clients sync via Yjs `update` (binary V2 protocol) over WebSocket.
- Server persists every Yjs `update` as a binary blob in PostgreSQL event table (`type: 'YjsUpdate'`) — this is the raw event log.
- On client reconnect with `lastEventId`: server queries `events` table for that canvas with `id > lastEventId`, re-applies them to a fresh Y.Doc, and sends the computed diff as a single `syncStep2` update.

3. **Conflict Resolution — CRDT Strategy:**

- **Technology:** Yjs implements the **YATA (Yet Another Transformation Approach)** algorithm, a delta-based CRDT for shared editing.
- **What YATA guarantees:** If two users simultaneously edit the same sticky note text, both characters survive in a deterministic order (based on origin/clientID/clock), without requiring a central server to decide. The server merely validates permissions and forwards updates.
- **For judges:** We will articulate that YATA uses a doubly-linked list structure with unique IDs (`(clientID, clock)` tuples), ensuring convergence without locks. Our README will contain a diagram of this.
- **Why not custom CRDT:** Building a provably correct CRDT in 24–48 hours is risky. Using Yjs (standard) and deeply explaining its mechanics scores full conflict-resolution points while remaining robust.

4. **Cursor Presence:**

- Yjs `Awareness` API (from `y-protocols`) tracks ephemeral state.
- Every 150ms, client broadcasts `{cursor: {x, y}, name, color, userId}` via `awareness.setLocalState()`.
- Remote cursors rendered as small floating `div`s with user name labels, CSS transition for smooth interpolation.
- Stored in **Redis** (TTL 30s) as fallback if WebSocket drops; repopulated on reconnect.

---

### 5.3 Intent-Aware Task Extraction (Score Alignment: 10 pts)

**Constraint Check:** No paid APIs allowed. Groq and Gemini both offer free tiers with zero billing for the usage levels this hackathon will generate.

**Solution: Server-Side Groq API**

| Component    | Selection                         | Rationale                                                                                                       |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Primary**  | Groq API — `llama3-8b-8192`       | Free dev tier, ~200ms median latency for short prompts, simple REST call from server.                           |
| **Fallback** | Gemini Flash — `gemini-2.0-flash` | Google free tier (generous RPM), slightly slower but equally capable for classification tasks.                  |
| **Client**   | No AI code on client              | Removes WASM/ONNX bundle overhead (~15MB), simplifies frontend build, no cold-start model download during demo. |

**Pipeline:**

1. User types in a sticky note (Yjs `Y.Text` emits `observe` on the server's canonical doc).
2. Server **debounces** the text delta by 1.5 seconds per node.
3. Server calls Groq with a structured prompt:

```typescript
const prompt = `Classify the following canvas note into exactly one category.
Categories: "action item", "decision", "open question", "reference".
Respond with JSON only: { "label": "<category>", "confidence": <0.0-1.0> }

Note: "${nodeText}"`;

const res = await groq.chat.completions.create({
  model: "llama3-8b-8192",
  messages: [{ role: "user", content: prompt }],
  response_format: { type: "json_object" },
  max_tokens: 60,
});
const { label, confidence } = JSON.parse(res.choices[0].message.content);
```

4. If `label === 'action item'` and `confidence > 0.65`:
   - Server appends `IntentClassified` event to event store.
   - Server derives a Task row in the `tasks` read model.
   - Server broadcasts `TaskCreated` delta to all connected clients.
5. Task Board panel auto-updates via WebSocket.

**Fallback (if API is unreachable during demo):**

- Server falls back to an imperative-verb regex heuristic. A `USE_FALLBACK_CLASSIFIER=true` env flag toggles it. Architecture supports both paths — judges see the swap point clearly in code.

**Why server-side beats client-side here:**

- No 15MB WASM bundle download on first canvas load.
- Classification runs in ~200ms vs. the ~400–800ms cold-start of ONNX in-browser.
- The server can batch multiple node classifications under rate-limit budget.
- The `intentDetected` WebSocket message type from client is removed — server owns the full classification lifecycle.

---

### 5.4 Task Board Integration (Score Alignment: 8 pts)

**Derived Read Model:**

- PostgreSQL `tasks` table: `id, canvasId, nodeId, authorId, text, status, createdAt, confidenceScore`.
- Populated **asynchronously** by the server when `IntentClassified` events are appended.
- This is classic **CQRS**: write side (event log) separate from read side (task query).

**Live Updates:**

- Task Board subscribes to WebSocket `TaskCreated`, `TaskUpdated`, `TaskDeleted` events.
- **Backlink feature:** Clicking a task dispatches `camera.panTo(node.x, node.y)` and highlights the node with a 2s pulse animation.

---

### 5.5 Node-Level RBAC (Score Alignment: 7 pts)

**Schema:**

```typescript
// PostgreSQL table: node_permissions
{
  nodeId: string,
  userId: string,
  role: 'lead' | 'contributor' | 'viewer',
  grantedBy: string,  // lead who assigned
  grantedAt: timestamp
}
```

**Enforcement Layers:**

1. **Client-Side (UX Guard):**
   - On canvas join, fetch `node_permissions` for the canvas.
   - `Viewer`: node receives `pointer-events: none`, input `disabled`, context menu hidden.
   - `Contributor`: can edit content but cannot delete node or change ACL.
   - `Lead`: full control + ACL management.
   - Role changes reflected immediately via Zustand (no reload needed).

2. **Server-Side (Security Guard — MANDATORY):**
   - **Every WebSocket mutation passes through `RBACMiddleware` before Yjs document application.**
   - If a viewer sends a `YjsUpdate` mutating a locked node, server rejects with `{type: 'error', code: 'FORBIDDEN'}`.
   - **Judges will test via raw WebSocket/curl** — this layer must be bulletproof.
   - RBAC middleware queries PostgreSQL `node_permissions` synchronously (cached in Redis for 60s) and validates against the operation's target `nodeId`.

**Dynamic Role Changes:**

- Lead updates role via REST API → server emits `PermissionChanged` event → all clients update local permission cache → UI immediately locks/unlocks nodes.

---

### 5.6 Append-Only Event Log (Score Alignment: 8 pts Architecture)

**Schema (PostgreSQL):**

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- or ULID
  canvas_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'YjsUpdate', 'NodeCreated', 'NodeDeleted', 'IntentClassified',
    'PermissionChanged', 'CursorMoved', 'UserJoined', 'UserLeft'
  )),
  payload JSONB NOT NULL,
  user_id TEXT,
  node_id TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sequence_number BIGSERIAL  -- strict monotonic ordering for replay
);

CREATE INDEX idx_events_canvas_sequence ON events(canvas_id, sequence_number);
```

**Principles:**

- **No UPDATE/DELETE on events table.** Ever.
- Deleting a node creates a `NodeDeleted` event. The node remains in `nodes` read model with `deletedAt` flag.
- State reconstruction: `fold(applyEvent, initialState, eventsOrderedBySequence)`.
- **For demo:** Side panel queries `SELECT * FROM events WHERE canvas_id = $1 ORDER BY sequence_number DESC LIMIT 100` and renders a live-updating audit trail (auto-scroll, colored by event type).

---

### 5.7 WebSocket Management & Delta Broadcast (Score Alignment: 25 pts)

**Server Implementation (Bun + Elysia WebSocket):**

```typescript
// Conceptual Elysia WebSocket route
app.ws("/ws/canvas/:id", {
  open(ws) {
    const { token, lastEventId } = ws.data.query;
    const user = verifyJWT(token);
    ws.data.user = user;
    ws.subscribe(ws.data.params.id); // Elysia pub/sub per canvas room

    // Replay missed events
    if (lastEventId) {
      const missed = await db.query.events.findMany({
        where: (e, { gt, eq }) =>
          eq(e.canvasId, ws.data.params.id) &&
          gt(e.sequenceNumber, lastEventId),
        orderBy: (e, { asc }) => asc(e.sequenceNumber),
      });
      ws.send({ type: "replay", events: missed });
    }

    // Announce presence
    ws.publish(ws.data.params.id, {
      type: "userJoined",
      userId: user.id,
      name: user.name,
    });
  },
  message(ws, raw) {
    const msg = JSON.parse(raw);
    // RBAC check BEFORE application
    if (!rbac.validate(ws.data.user.id, msg.nodeId, msg.operation)) {
      return ws.send({ type: "error", code: "FORBIDDEN" });
    }
    // Append to event store, update canonical Yjs doc, broadcast delta
    const event = await eventStore.append(ws.data.params.id, msg);
    ws.publish(ws.data.params.id, { type: "delta", event }); // NOT full state
  },
  close(ws) {
    ws.publish(ws.data.params.id, {
      type: "userLeft",
      userId: ws.data.user.id,
    });
  },
});
```

**Key Design Decisions:**

- **Deltas, not full state:** Broadcasting only the mutated event keeps bandwidth O(1) per edit rather than O(N) where N = canvas size.
- **Replay on reconnect:** Client tracks `lastSequenceNumber`. On reconnect, missed events are replayed in order, then normal delta stream resumes.
- **Binary Yjs vs JSON:** Yjs state updates are sent as binary `ArrayBuffer` for efficiency. Metadata events (task creation, RBAC changes) sent as JSON.

---

## 6. Bonus Feature Recommendation: Time-Travel Replay

**Why this one:** It directly leverages our event-sourced architecture. It is harder to fake and easier to implement well than presence heatmaps or AI summary exports given our foundation.

**Implementation:**

- Add a timeline slider component (shadcn/ui Slider) docked at the bottom of the canvas.
- Slider range: `0` to `max(events.sequence_number)`.
- On slider change: client clears current Yjs document, replays events `0..N` into a fresh `Y.Doc`, and renders the resulting state.
- Playback mode: auto-increment slider every 100ms with a `requestAnimationFrame` loop.
- Visual flair: ghosted past cursors (faded colors) during replay; current replay position highlighted in event log sidebar.

**Scoring:** Directly impresses judges with architectural depth (Category 5 — 8 pts) and demonstrates understanding of event sourcing immutability.

---

## 7. Data Model & Schema

### 7.1 PostgreSQL Tables

```typescript
// Drizzle ORM Schema (schema.ts)

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const canvases = pgTable("canvases", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  sequenceNumber: bigserial("sequence_number", { mode: "number" }).notNull(),
  type: text("type", {
    enum: [
      "YjsUpdate",
      "NodeCreated",
      "NodeDeleted",
      "IntentClassified",
      "PermissionChanged",
      "CursorMoved",
      "UserJoined",
      "UserLeft",
    ],
  }).notNull(),
  payload: jsonb("payload").notNull(),
  userId: uuid("user_id").references(() => users.id),
  nodeId: text("node_id"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const nodePermissions = pgTable("node_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: text("node_id").notNull(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  role: text("role", { enum: ["lead", "contributor", "viewer"] }).notNull(),
  grantedAt: timestamp("granted_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  canvasId: uuid("canvas_id")
    .references(() => canvases.id)
    .notNull(),
  nodeId: text("node_id").notNull(),
  authorId: uuid("author_id")
    .references(() => users.id)
    .notNull(),
  text: text("text").notNull(),
  status: text("status", { enum: ["open", "in_progress", "done"] }).default(
    "open",
  ),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### 7.2 Redis Keyspace

```
presence:<canvasId>           → Hash { userId → JSON({x, y, name, color, lastSeen}) }
session:<canvasId>:<userId>   → String socketId (TTL 1h)
canvas_doc:<canvasId>         → Binary Yjs state snapshot (TTL 24h, fallback if server restarts)
permissions:<nodeId>          → Hash { userId → role } (TTL 60s, cache for RBAC speed)
```

---

## 8. API Design (REST + WebSocket Hybrid)

### 8.1 REST Endpoints (Elysia + Eden)

| Method | Route                          | Purpose                           | Auth            |
| ------ | ------------------------------ | --------------------------------- | --------------- |
| POST   | `/auth/register`               | Create user, return JWT           | Public          |
| POST   | `/auth/login`                  | Verify password, return JWT       | Public          |
| POST   | `/canvas`                      | Create new canvas                 | JWT             |
| GET    | `/canvas/:id`                  | Get canvas metadata + permissions | JWT             |
| GET    | `/canvas/:id/events?after=seq` | Fetch event log slice             | JWT             |
| GET    | `/canvas/:id/tasks`            | Fetch current task board          | JWT             |
| POST   | `/canvas/:id/permissions`      | Set node-level RBAC               | JWT + Lead only |
| GET    | `/canvas/:id/export`           | AI summary export (bonus)         | JWT             |

### 8.2 WebSocket Message Protocol

```typescript
// Client → Server
type ClientMsg =
  | { type: "yjsUpdate"; update: Uint8Array } // Binary Yjs diff
  | { type: "cursor"; x: number; y: number }
  | { type: "requestReplay"; fromSequence: number };
// Note: intent classification is now server-initiated — client no longer sends intentDetected

// Server → Client
type ServerMsg =
  | { type: "delta"; event: EventRow } // New event to apply
  | { type: "replay"; events: EventRow[] } // Missed events on reconnect
  | { type: "presence"; users: PresenceState[] } // Cursor positions
  | { type: "taskCreated"; task: TaskRow }
  | { type: "error"; code: "FORBIDDEN" | "INVALID_NODE" | "RATE_LIMITED" };
```

---

## 9. Development Roadmap & Execution Plan

Assuming a **48-hour hackathon** (common format), this roadmap prioritizes scoring criteria.

### Phase 1: Foundation (Hours 0–8)

- [ ] Initialize monorepo: Bun workspaces (`apps/web`, `apps/server`).
- [ ] Configure Elysia server with Bun WebSocket plugin.
- [ ] Provision Neon Postgres project (free tier) + copy `DATABASE_URL` to `.env`.
- [ ] Provision Upstash Redis database (free tier) + copy `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` to `.env`.
- [ ] Set up Drizzle ORM schema and run `drizzle-kit push` against Neon.
- [ ] Scaffold React + Vite + Tailwind + shadcn/ui frontend.
- [ ] Implement JWT auth (register/login) on both sides.
- [ ] **Deliverable:** Health check endpoint, auth flow, empty canvas page.

### Phase 2: Canvas Core (Hours 8–18)

- [ ] Build infinite pan/zoom container (custom wheel + drag handlers).
- [ ] Implement DOM-based nodes: sticky notes, text blocks, rectangles.
- [ ] Add HTML5 Canvas freehand drawing layer.
- [ ] Add SVG edge/connection layer between nodes.
- [ ] Integrate Yjs `Y.Map` for nodes and `Y.Array` for strokes.
- [ ] **Deliverable:** Single-user infinite canvas with all element types.

### Phase 3: Real-Time Collab (Hours 18–26)

- [ ] Wire Yjs awareness + cursor rendering.
- [ ] Implement Bun WebSocket sync for Yjs `update` messages.
- [ ] Add multi-user canvas rooms (`/canvas/:id`).
- [ ] Test conflict resolution: two tabs, same text node, verify merged text.
- [ ] **Deliverable:** Multi-user real-time canvas with cursors + CRDT merge.

### Phase 4: Event Sourcing & RBAC (Hours 26–34)

- [ ] Implement `events` append-only table + event store service.
- [ ] Wire every mutation to append events before broadcasting.
- [ ] Build event log sidebar UI.
- [ ] Implement `node_permissions` schema.
- [ ] Build RBAC middleware (server-side enforcement).
- [ ] Build client-side UI guards (disabled states).
- [ ] **Deliverable:** Immutable event log visible in UI + node-level lock/unlock.

### Phase 5: AI & Task Board (Hours 34–42)

- [ ] Integrate Groq SDK (`groq-sdk`) on server; add `GROQ_API_KEY` to env.
- [ ] Wire server-side debounced classifier: Yjs text observe → Groq call → `IntentClassified` event.
- [ ] Add `USE_FALLBACK_CLASSIFIER` env flag + regex fallback path.
- [ ] `IntentClassified` event type + `tasks` read model.
- [ ] Task Board React component with live WebSocket updates.
- [ ] Click-task-to-canvas navigation (backlink).
- [ ] **Deliverable:** Typing "Review Q3 budget by Friday" auto-appears in Task Board within 3s.

### Phase 6: Bonus + Polish + Deploy (Hours 42–48)

- [ ] Implement Time-Travel Replay slider (leverages existing events).
- [ ] Add playback animation (auto-scrub).
- [ ] Responsive CSS pass (ensure no horizontal scrollbars on standard widths).
- [ ] Write comprehensive README with architecture diagram, CRDT explanation, tech choices.
- [ ] Deploy to Render (Web Service only — DB and Redis are external Neon/Upstash).
- [ ] End-to-end demo rehearsal.
- [ ] **Deliverable:** Live URL on Render, working demo script.

---

## 10. Deployment Architecture

```
Render Services:
└── ligma-web (Web Service — single deploy unit)
    ├── Build Command: cd apps/server && bun install && bun run build
    ├── Start Command: cd apps/server && bun run start
    ├── Environment: DATABASE_URL (Neon), UPSTASH_REDIS_REST_URL,
    │               UPSTASH_REDIS_REST_TOKEN, GROQ_API_KEY,
    │               JWT_SECRET, BUN_ENV=production
    └── Serves: Elysia API + WebSocket + static Vite build from apps/web/dist

External Services (free tier, zero Render cost):
├── Neon Postgres — Event store, tasks, users, permissions, canvases
│   └── Connection via standard DATABASE_URL (pooled mode for serverless compat)
└── Upstash Redis — Presence, session mapping, RBAC cache, Yjs snapshots
    └── HTTP REST client (@upstash/redis) — no persistent TCP connection needed
```

**Why external DB/Redis instead of Render-managed:**

- **Dev speed:** Neon and Upstash have zero-config web consoles — no `docker-compose`, no local daemon. The team can start writing schema on Day 1 with a real DB.
- **Free tier quality:** Neon's free tier includes branching (safe schema migrations) and 0.5GB storage. Upstash free tier covers 10k commands/day — more than sufficient for a hackathon demo.
- **No cold-start coupling:** Render's managed Postgres/Redis are tied to the same service lifecycle. External services remain up even during a Render redeploy.
- **Judging eligibility:** The Render web service URL is what judges access. Where the data lives is an implementation detail; the constraint is the deployed URL, not the DB provider.

---

## 11. Risk Mitigation & Fallbacks

| Risk                                           | Probability | Mitigation                                                                                                                                                        |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groq API rate-limited during demo              | Low         | Switch `GROQ_MODEL` env var to `gemini-2.0-flash` (Gemini fallback). If both fail, `USE_FALLBACK_CLASSIFIER=true` activates regex heuristic — judges see same UX. |
| Yjs sync performance degrades with 1000+ nodes | Low         | Implement canvas viewport culling (only render nodes in camera view).                                                                                             |
| WebSocket drops during judging                 | Low         | Aggressive reconnect with exponential backoff + replay sequence guaranteed by event store.                                                                        |
| Render free tier cold start                    | Medium      | Keep server alive with a ping cron (Render can sleep; add UptimeRobot or keep a tab open).                                                                        |
| CRDT explanation insufficient for judges       | Medium      | README contains dedicated "Conflict Resolution" section with YATA algorithm pseudocode and convergence proof sketch.                                              |

---

## 12. README & Documentation Strategy (Category 3: 5 pts)

The README is a judging artifact. It must contain:

1. **Architecture Overview Diagram** (Mermaid or ASCII) — showing event flow from client mutation → RBAC → event store → broadcast.
2. **CRDT Explanation** — 2–3 paragraphs on YATA: "Yjs uses content-based CRDTs where every insert/delete carries a unique `(clientID, clock)` pair. When two users insert at the same position, YATA deterministically orders them by `clientID` without losing either."
3. **Event Sourcing Explanation** — "No mutation overwrites. Deleting a node emits a `NodeDeleted` event. The current state is always a left-fold over `events`."
4. **WebSocket Protocol** — Document delta vs. full-state, replay mechanism, presence heartbeat.
5. **RBAC Enforcement** — Diagram showing client guard + server gate.
6. **Local Setup** — `bun install`, copy `.env.example` (Neon `DATABASE_URL`, Upstash credentials, `GROQ_API_KEY`), `bun dev`. No Docker required.
7. **Render Deploy** — One-click instructions or script.

---

## 13. Innovation & Uniqueness Points Strategy (Category 5: 7 pts)

During Stage 1 architecture presentation, articulate these **non-obvious** decisions:

1. **"Why Elysia on Bun instead of Node/Express"** — Bun's native WebSocket eliminates `ws` library overhead; Elysia's Eden Treaty gives us compile-time API contracts between frontend and backend.
2. **"Why server-side AI via Groq instead of Transformers.js in-browser"** — Eliminates a 15MB WASM bundle from the client bundle, removes the model cold-start latency on first canvas load, and keeps the client purely concerned with rendering. The server owns the full classification lifecycle and can batch calls under rate-limit budget. Groq's free tier is zero-cost for this usage pattern.
3. **"Why DOM nodes instead of Canvas API for sticky notes"** — Canvas would require us to rebuild text editing, accessibility, and selection from scratch. DOM gives us `contentEditable` and ARIA for free, while SVG/Canvas handle what they do best (edges and freehand).
4. **"Why we chose Time-Travel as our bonus"** — Because event sourcing makes it trivial to implement _correctly_, while presence heatmaps would require additional derived data structures that don't reinforce our core architecture.
5. **"Why Yjs + Event Sourcing together"** — Yjs provides operational CRDT convergence; event sourcing provides auditability and replay. They are complementary, not alternatives.

---

## 14. Final Checklist for Judging Day

- [ ] Two browser tabs test: draw shape in Tab A → appears in Tab B < 1s.
- [ ] Conflict test: both tabs type in same text node simultaneously → merged text identical.
- [ ] Cursor test: cursors visible, labeled, < 2s latency.
- [ ] AI test: type action item → Task Board updates within 3s with author + backlink.
- [ ] RBAC test: viewer tab cannot edit locked node (UI disabled + WebSocket returns error).
- [ ] Event log test: delete node → event appears in sidebar, state reconstructable.
- [ ] Reconnect test: disconnect WiFi 10s, reconnect → missed events replay, canvas converges.
- [ ] Bonus test: Time-travel slider scrubs canvas through history smoothly.
- [ ] Deployment test: Render URL loads without `localhost` references; Neon + Upstash env vars set.
- [ ] README test: contains architecture diagram + CRDT explanation + setup instructions.

---

**End of Document**
