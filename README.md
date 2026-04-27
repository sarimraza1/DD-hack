# LIGMA — Let's Integrate Groups, Manage Anything

LIGMA is a real-time collaborative workspace designed to bridge the gap between ideation and execution. Teams brainstorm on a shared infinite canvas, while an AI layer automatically extracts intent from canvas content to populate a live task board.

## Architecture & Technical Choices

### Event-Sourced Architecture & CRDT
At the core of LIGMA is a hybrid event-sourced and CRDT (Conflict-Free Replicated Data Type) architecture. 

1. **Conflict Resolution (CRDT)**: We use **Yjs** to manage real-time document synchronization. When two users edit the same text node simultaneously, Yjs's CRDT algorithm automatically handles text merging correctly across all clients, avoiding the "last write wins" problem that causes data loss.
2. **Real-time Cursors**: User presence and cursors are handled via the Yjs Awareness protocol.
3. **Event-Sourcing**: Every mutation to the canvas (creating, updating, deleting nodes, or locking permissions) is intercepted on the Node.js backend and appended to an immutable SQLite event log. This ensures high traceability, an uncorrupted history, and the foundation for time-travel replay.

### Node-Level RBAC (Server Enforced)
Most collaborative tools enforce permissions at the document level. LIGMA introduces individual canvas element ACLs.
We intercept all incoming WebSocket messages at the custom `y-websocket` server. Before any CRDT update is applied or broadcast, the server verifies the user's role against the node's permissions in our SQLite database. Unauthorized mutations are rejected server-side to guarantee security.

### AI Intent Extraction
We implemented a computationally lightweight, pattern-based Intent Extraction engine. Every time a node's content changes, the backend classifies the intent into: `action_item`, `decision`, `question`, or `reference`.
Nodes tagged as `action_item` are automatically displayed in the live Task Board with their metadata, bridging the gap between free-form canvas and structured task management.

## Tech Stack
- **Frontend**: React 18, Vite, Custom DOM-based Canvas
- **Backend**: Node.js, Express, Custom WebSocket Server
- **Database**: SQLite (via `better-sqlite3`)
- **CRDT Sync**: Yjs & y-websocket

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server (runs both backend API and Vite dev server concurrently):
   ```bash
   npm run dev
   npm run start
   ```
   *(Note: Run in separate terminals, or use your preferred task runner).*

3. Visit your frontend at `http://localhost:5173`. Create a room, then open the same room in an incognito window to verify real-time cursor sync and intent extraction.
