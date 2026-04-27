# LIGMA Server (Elysia + Bun)

## Setup
1. Copy `.env.example` to `.env` and fill in placeholders. `GROQ_API_KEY` is optional.
2. Install deps: `bun install`
3. Start dev server: `bun run dev`

## API Endpoints
- `GET /api/health`
- `GET /api/canvas/:id`
- `GET /api/canvas/:id/tasks`
- `GET /api/canvas/:id/events?after=0`
- `GET /api/canvas/:id/permissions`
- `POST /api/canvas/:id/nodes/:nodeId/permissions`

## Test API Calls
```bash
# Health
curl http://localhost:3001/api/health

# Canvas snapshot
curl http://localhost:3001/api/canvas/demo

# Tasks
curl http://localhost:3001/api/canvas/demo/tasks

# Events
curl "http://localhost:3001/api/canvas/demo/events?after=0"

# Permissions (set node role)
curl -X POST http://localhost:3001/api/canvas/demo/nodes/node-1/permissions \
	-H "Content-Type: application/json" \
	-d '{"role":"lead","actorId":"user-1"}'
```

## WebSocket
Endpoint: `ws://localhost:3001/ws/canvas/:id`

Hello message:
```json
{ "type": "hello", "userId": "user-1", "role": "contributor", "lastSeq": 0 }
```

Intent check message:
```json
{ "type": "intentCheck", "nodeId": "node-1", "text": "Ship onboarding flow" }
```