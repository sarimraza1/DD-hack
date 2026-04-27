# LIGMA API Test Commands

Base URL: `http://localhost:3000`

## Health Check

```bash
curl http://localhost:3000/health
```

## Auth

### Register
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","name":"Alice","password":"password123"}'
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@test.com","password":"password123"}'
```

Save the token from the response:
```bash
TOKEN="<paste-token-here>"
```

## Canvas

### Create Canvas
```bash
curl -X POST http://localhost:3000/canvas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Sprint Planning"}'
```

### List My Canvases
```bash
curl http://localhost:3000/canvas \
  -H "Authorization: Bearer $TOKEN"
```

### Get Canvas Details
```bash
curl http://localhost:3000/canvas/<canvas-id> \
  -H "Authorization: Bearer $TOKEN"
```

### Get Canvas Events
```bash
curl "http://localhost:3000/canvas/<canvas-id>/events?after=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Canvas Tasks
```bash
curl http://localhost:3000/canvas/<canvas-id>/tasks \
  -H "Authorization: Bearer $TOKEN"
```

### Set Node Permission
```bash
curl -X POST http://localhost:3000/canvas/<canvas-id>/permissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"nodeId":"<node-id>","userId":"<user-id>","role":"viewer"}'
```

## WebSocket

### Connect
```
wscat -c "ws://localhost:3000/ws/canvas/<canvas-id>?userId=<user-id>&userName=Alice"
```

### Message Types (Client → Server)

**Create Node:**
```json
{"type":"nodeCreate","nodeType":"sticky","x":100,"y":200,"content":"Review Q3 budget by Friday","color":"#fef08a"}
```

**Update Node:**
```json
{"type":"nodeUpdate","nodeId":"<node-id>","updates":{"content":"Updated text","x":150}}
```

**Delete Node:**
```json
{"type":"nodeDelete","nodeId":"<node-id>"}
```

**Send Cursor:**
```json
{"type":"cursor","x":500,"y":300,"color":"#3b82f6"}
```

**Update Task Status:**
```json
{"type":"taskUpdate","taskId":"<task-id>","status":"done"}
```

### Message Types (Server → Client)

- `init` — full canvas state on connect
- `presence` — all active cursors
- `nodeCreated` — new node broadcast
- `nodeUpdated` — node update broadcast
- `nodeDeleted` — node deletion broadcast
- `cursorUpdate` — remote cursor position
- `userJoined` / `userLeft` — presence events
- `taskCreated` / `taskUpdated` — task board events
- `error` — `FORBIDDEN`, `INVALID_NODE`, `UNKNOWN_MESSAGE_TYPE`
