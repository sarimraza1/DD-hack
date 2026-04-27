import { createFileRoute } from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  createColumnHelper,
} from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"
import * as Y from "yjs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: App })

type Role = "lead" | "contributor" | "viewer"
type NodeKind = "note" | "text" | "shape"

type CanvasNode = {
  id: string
  type: NodeKind
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
}

type Stroke = {
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  width: number
}

type Task = {
  id: string
  nodeId: string
  text: string
  status: "todo" | "in-progress" | "done"
  authorId: string
  createdAt: string
  confidence: number
}

type EventEntry = {
  id: string
  canvasId: string
  sequence: number
  type: string
  nodeId?: string
  authorId?: string
  payload?: unknown
  createdAt: string
}

type CursorState = {
  x: number
  y: number
  name: string
  color: string
  updatedAt: number
}

const API_URL =
  import.meta.env.VITE_APP_API_URL?.replace(/\/$/, "") ??
  "http://localhost:3001"
const CANVAS_ID = "demo"
const ROLE_ORDER: Record<Role, number> = {
  viewer: 1,
  contributor: 2,
  lead: 3,
}

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = ""
  bytes.forEach((value) => {
    binary += String.fromCharCode(value)
  })
  return btoa(binary)
}

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

function mapNodes(nodesMap: Y.Map<Y.Map<unknown>>) {
  return Array.from(nodesMap.entries()).map(([id, node]) => {
    const textValue = node.get("text")
    const text = textValue instanceof Y.Text ? textValue.toString() : ""
    return {
      id,
      type: (node.get("type") as NodeKind) ?? "note",
      x: Number(node.get("x") ?? 0),
      y: Number(node.get("y") ?? 0),
      width: Number(node.get("width") ?? 240),
      height: Number(node.get("height") ?? 160),
      text,
      color: (node.get("color") as string) ?? "bg-card",
    } satisfies CanvasNode
  })
}

function mapStrokes(strokesArray: Y.Array<Y.Map<unknown>>): Stroke[] {
  return strokesArray.toArray().map((stroke) => {
    const points = (stroke.get("points") as Y.Array<{ x: number; y: number }>)
      .toArray()
      .map((point) => ({ x: point.x, y: point.y }))
    return {
      id: (stroke.get("id") as string) ?? "",
      points,
      color: (stroke.get("color") as string) ?? "#646e78",
      width: Number(stroke.get("width") ?? 2),
    }
  })
}

const taskColumnHelper = createColumnHelper<Task>()

function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventEntry[]>([])
  const [permissions, setPermissions] = useState<Record<string, Role>>({})
  const [cursors, setCursors] = useState<Record<string, CursorState>>({})
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "offline"
  >("connecting")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [role, setRole] = useState<Role>("contributor")
  const [displayName, setDisplayName] = useState("")
  const [userId, setUserId] = useState("")
  const [mode, setMode] = useState("select")
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })

  const ydoc = useMemo(() => new Y.Doc(), [])
  const nodesMap = useMemo(() => ydoc.getMap<Y.Map<unknown>>("nodes"), [ydoc])
  const strokesArray = useMemo(
    () => ydoc.getArray<Y.Map<unknown>>("strokes"),
    [ydoc]
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const updateMetaRef = useRef<{ nodeId?: string }>({})
  const lastSeqRef = useRef(0)
  const intentTimers = useRef(new Map<string, number>())
  const lastCursorSent = useRef(0)
  const activeStrokeRef = useRef<Y.Array<{ x: number; y: number }> | null>(null)
  const activeStrokeId = useRef<string | null>(null)

  useEffect(() => {
    const storedUserId =
      typeof window !== "undefined"
        ? window.localStorage.getItem("ligma-user-id")
        : null
    const storedRole =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("ligma-role") as Role | null)
        : null
    const storedName =
      typeof window !== "undefined"
        ? window.localStorage.getItem("ligma-name")
        : null

    const nextId = storedUserId ?? crypto.randomUUID()
    setUserId(nextId)
    if (!storedUserId && typeof window !== "undefined") {
      window.localStorage.setItem("ligma-user-id", nextId)
    }

    if (storedRole) {
      setRole(storedRole)
    }

    if (storedName) {
      setDisplayName(storedName)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ligma-role", role)
    }
  }, [role, userId])

  useEffect(() => {
    if (!userId) return
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ligma-name", displayName)
    }
  }, [displayName, userId])

  useEffect(() => {
    const updateState = () => {
      setNodes(mapNodes(nodesMap))
      setStrokes(mapStrokes(strokesArray))
    }

    updateState()
    const nodeObserver = () => updateState()
    nodesMap.observeDeep(nodeObserver)
    strokesArray.observeDeep(nodeObserver)

    return () => {
      nodesMap.unobserveDeep(nodeObserver)
      strokesArray.unobserveDeep(nodeObserver)
    }
  }, [nodesMap, strokesArray])

  useEffect(() => {
    if (!userId) return
    const wsUrl = `${API_URL.replace(/^http/, "ws")}/ws/canvas/${CANVAS_ID}`
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket
    setConnection("connecting")

    socket.addEventListener("open", () => {
      setConnection("connected")
      socket.send(
        JSON.stringify({
          type: "hello",
          userId,
          role,
          lastSeq: lastSeqRef.current,
        })
      )
    })

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data)
      if (payload.type === "sync") {
        const update = decodeBase64(payload.update)
        Y.applyUpdate(ydoc, update, "remote")
        setTasks(payload.tasks ?? [])
        setPermissions(payload.permissions ?? {})
        setEvents(payload.events ?? [])
        setCursors(payload.cursors ?? {})
        if (Array.isArray(payload.events) && payload.events.length > 0) {
          lastSeqRef.current = payload.events[payload.events.length - 1].sequence
        }
        return
      }

      if (payload.type === "yjsUpdate") {
        const update = decodeBase64(payload.update)
        Y.applyUpdate(ydoc, update, "remote")
      }

      if (payload.type === "taskCreated") {
        setTasks((prev) => {
          if (prev.some((task) => task.id === payload.task.id)) {
            return prev
          }
          return [...prev, payload.task]
        })
      }

      if (payload.type === "permissionChanged") {
        setPermissions((prev) => ({
          ...prev,
          [payload.nodeId]: payload.role,
        }))
      }

      if (payload.type === "cursor") {
        setCursors((prev) => {
          if (!payload.cursor) {
            const next = { ...prev }
            delete next[payload.userId]
            return next
          }
          return { ...prev, [payload.userId]: payload.cursor }
        })
      }

      if (payload.type === "event" || payload.event) {
        const entry = payload.event ?? payload
        setEvents((prev) => {
          if (prev.some((event) => event.id === entry.id)) {
            return prev
          }
          lastSeqRef.current = entry.sequence
          return [...prev, entry]
        })
      }
    })

    socket.addEventListener("close", () => {
      setConnection("offline")
    })

    return () => {
      socket.close()
    }
  }, [role, userId, ydoc])

  useEffect(() => {
    const handler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return
      }

      const nodeId = updateMetaRef.current.nodeId
      if (!nodeId) return

      socketRef.current.send(
        JSON.stringify({
          type: "yjsUpdate",
          nodeId,
          update: encodeBase64(update),
        })
      )
    }

    ydoc.on("update", handler)
    return () => {
      ydoc.off("update", handler)
    }
  }, [ydoc])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(camera.scale, 0, 0, camera.scale, camera.x, camera.y)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.beginPath()
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (const point of stroke.points.slice(1)) {
        ctx.lineTo(point.x, point.y)
      }
      ctx.stroke()
    })
  }, [strokes, camera])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let isPanning = false
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest("[data-node-id]")) return
      if (mode === "draw") {
        const rect = container.getBoundingClientRect()
        const strokeId = crypto.randomUUID()
        const points = new Y.Array<{ x: number; y: number }>()
        const stroke = new Y.Map()
        stroke.set("id", strokeId)
        stroke.set("points", points)
        stroke.set("color", "#64748b")
        stroke.set("width", 2)

        const x = (event.clientX - rect.left - camera.x) / camera.scale
        const y = (event.clientY - rect.top - camera.y) / camera.scale

        applyNodeUpdate(strokeId, () => {
          strokesArray.push([stroke])
          points.push([{ x, y }])
        })

        activeStrokeRef.current = points
        activeStrokeId.current = strokeId
        container.setPointerCapture(event.pointerId)
        return
      }

      if (mode !== "select") return
      isPanning = true
      startX = event.clientX
      startY = event.clientY
      originX = camera.x
      originY = camera.y
      container.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (activeStrokeRef.current && activeStrokeId.current) {
        const rect = container.getBoundingClientRect()
        const x = (event.clientX - rect.left - camera.x) / camera.scale
        const y = (event.clientY - rect.top - camera.y) / camera.scale
        const points = activeStrokeRef.current
        const strokeId = activeStrokeId.current
        applyNodeUpdate(strokeId, () => {
          points.push([{ x, y }])
        })
        return
      }

      if (!isPanning) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      setCamera((prev) => ({ ...prev, x: originX + dx, y: originY + dy }))
    }

    const onPointerUp = (event: PointerEvent) => {
      if (activeStrokeRef.current) {
        activeStrokeRef.current = null
        activeStrokeId.current = null
        container.releasePointerCapture(event.pointerId)
        return
      }

      if (!isPanning) return
      isPanning = false
      container.releasePointerCapture(event.pointerId)
    }

    container.addEventListener("pointerdown", onPointerDown)
    container.addEventListener("pointermove", onPointerMove)
    container.addEventListener("pointerup", onPointerUp)
    container.addEventListener("pointerleave", onPointerUp)

    return () => {
      container.removeEventListener("pointerdown", onPointerDown)
      container.removeEventListener("pointermove", onPointerMove)
      container.removeEventListener("pointerup", onPointerUp)
      container.removeEventListener("pointerleave", onPointerUp)
    }
  }, [camera, mode, strokesArray])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const nextScale = Math.min(2, Math.max(0.4, camera.scale - event.deltaY * 0.001))
      const rect = container.getBoundingClientRect()
      const offsetX = event.clientX - rect.left
      const offsetY = event.clientY - rect.top
      const worldX = (offsetX - camera.x) / camera.scale
      const worldY = (offsetY - camera.y) / camera.scale
      const nextX = offsetX - worldX * nextScale
      const nextY = offsetY - worldY * nextScale
      setCamera({ x: nextX, y: nextY, scale: nextScale })
    }

    container.addEventListener("wheel", onWheel, { passive: false })
    return () => container.removeEventListener("wheel", onWheel)
  }, [camera])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onPointerMove = (event: PointerEvent) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return
      }
      const now = Date.now()
      if (now - lastCursorSent.current < 60) return
      lastCursorSent.current = now

      const rect = container.getBoundingClientRect()
      const x = (event.clientX - rect.left - camera.x) / camera.scale
      const y = (event.clientY - rect.top - camera.y) / camera.scale
      socketRef.current.send(
        JSON.stringify({
          type: "cursor",
          x,
          y,
          name: displayName || "Guest",
          color: "#64748b",
        })
      )
    }

    container.addEventListener("pointermove", onPointerMove)
    return () => container.removeEventListener("pointermove", onPointerMove)
  }, [camera, displayName])

  const canEditNode = (nodeId: string) => {
    const minRole = permissions[nodeId]
    if (!minRole) return true
    return ROLE_ORDER[role] >= ROLE_ORDER[minRole]
  }

  const applyNodeUpdate = (nodeId: string, update: () => void) => {
    updateMetaRef.current.nodeId = nodeId
    ydoc.transact(update)
    updateMetaRef.current.nodeId = undefined
  }

  const createNode = (type: NodeKind, text = "") => {
    const id = crypto.randomUUID()
    const node = new Y.Map()
    const content = new Y.Text()
    if (text) content.insert(0, text)
    const center = containerRef.current
    const rect = center?.getBoundingClientRect()
    const x = rect
      ? (rect.width / 2 - camera.x) / camera.scale
      : 0
    const y = rect
      ? (rect.height / 2 - camera.y) / camera.scale
      : 0

    node.set("type", type)
    node.set("x", x)
    node.set("y", y)
    node.set("width", type === "shape" ? 280 : 240)
    node.set("height", type === "shape" ? 180 : 160)
    node.set("color", type === "note" ? "bg-muted" : "bg-card")
    node.set("text", content)

    applyNodeUpdate(id, () => {
      nodesMap.set(id, node)
    })
    setSelectedNodeId(id)
    return id
  }

  const sendIntentCheck = (nodeId: string, text: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    const existing = intentTimers.current.get(nodeId)
    if (existing) window.clearTimeout(existing)
    const timer = window.setTimeout(() => {
      socket.send(
        JSON.stringify({
          type: "intentCheck",
          nodeId,
          text,
        })
      )
    }, 1500)
    intentTimers.current.set(nodeId, timer)
  }

  const handleNodeTextChange = (nodeId: string, text: string) => {
    const node = nodesMap.get(nodeId)
    const ytext = node?.get("text")
    if (!(ytext instanceof Y.Text)) return
    applyNodeUpdate(nodeId, () => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, text)
    })
    sendIntentCheck(nodeId, text)
  }

  const handlePermissionChange = async (nodeId: string, nextRole: Role) => {
    if (!nodeId) return
    await fetch(`${API_URL}/api/canvas/${CANVAS_ID}/nodes/${nodeId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole, actorId: userId }),
    })
  }

  const handleTaskFocus = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const nextX = rect.width / 2 - (node.x + node.width / 2) * camera.scale
    const nextY = rect.height / 2 - (node.y + node.height / 2) * camera.scale
    setCamera((prev) => ({ ...prev, x: nextX, y: nextY }))
    setSelectedNodeId(nodeId)
  }

  const drawForm = useForm({
    defaultValues: {
      noteText: "",
      minRole: "viewer" as Role,
    },
    onSubmit: async ({ value }) => {
      const nodeId = createNode("note", value.noteText)
      if (nodeId) {
        sendIntentCheck(nodeId, value.noteText)
        await handlePermissionChange(nodeId, value.minRole)
      }
      drawForm.reset()
    },
  })

  const taskColumns = useMemo(
    () => [
      taskColumnHelper.accessor("text", {
        header: "Task",
        cell: (info) => (
          <button
            type="button"
            className="text-left text-sm font-medium text-foreground"
            onClick={() => handleTaskFocus(info.row.original.nodeId)}
          >
            {info.getValue()}
          </button>
        ),
      }),
      taskColumnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge variant="secondary">{info.getValue()}</Badge>
        ),
      }),
      taskColumnHelper.accessor("confidence", {
        header: "Confidence",
        cell: (info) => `${Math.round(info.getValue() * 100)}%`,
      }),
    ],
    []
  )

  const taskTable = useReactTable({
    data: useMemo(() => tasks, [tasks]),
    columns: taskColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)
  const selectedNodeRole = selectedNodeId
    ? permissions[selectedNodeId]
    : undefined

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                LIGMA Workspace
              </span>
              <span className="font-heading text-xl">Live Canvas</span>
            </div>
            <Badge variant="outline">
              {connection === "connected" ? "Live" : "Offline"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <FieldGroup className="max-w-xs">
              <Field orientation="horizontal">
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <FieldContent>
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Guest"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="flex min-h-[70svh] flex-col border-border/80">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Canvas</CardTitle>
                <CardDescription>
                  Real-time notes, shapes, and freehand strokes.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(value) => value && setMode(value)}
                  variant="outline"
                  size="sm"
                  spacing="sm"
                >
                  <ToggleGroupItem value="select">Select</ToggleGroupItem>
                  <ToggleGroupItem value="draw">Draw</ToggleGroupItem>
                </ToggleGroup>
                <Button variant="outline" size="sm" onClick={() => createNode("note")}>
                  New Note
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createNode("text")}
                >
                  New Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createNode("shape")}
                >
                  New Shape
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div
                ref={containerRef}
                className="canvas-surface relative h-full w-full overflow-hidden rounded-lg border border-border/60"
              >
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0"
                />
                <div
                  ref={stageRef}
                  className="absolute inset-0"
                  style={{
                    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                    transformOrigin: "0 0",
                  }}
                >
                  {nodes.map((node) => {
                    const locked = !canEditNode(node.id)
                    const isSelected = node.id === selectedNodeId
                    return (
                      <div
                        key={node.id}
                        data-node-id={node.id}
                        className={cn(
                          "canvas-node absolute flex flex-col gap-2 rounded-xl border border-border/70 p-3 text-sm",
                          node.color,
                          locked && "opacity-60",
                          isSelected && "ring-2 ring-ring"
                        )}
                        style={{
                          left: node.x,
                          top: node.y,
                          width: node.width,
                          height: node.height,
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          if ((event.target as HTMLElement).isContentEditable) {
                            return
                          }
                          setSelectedNodeId(node.id)
                          if (!locked) {
                            const startX = event.clientX
                            const startY = event.clientY
                            const originX = node.x
                            const originY = node.y

                            const onMove = (moveEvent: PointerEvent) => {
                              const dx = (moveEvent.clientX - startX) / camera.scale
                              const dy = (moveEvent.clientY - startY) / camera.scale
                              applyNodeUpdate(node.id, () => {
                                const yNode = nodesMap.get(node.id)
                                if (!yNode) return
                                yNode.set("x", originX + dx)
                                yNode.set("y", originY + dy)
                              })
                            }

                            const onUp = () => {
                              window.removeEventListener("pointermove", onMove)
                              window.removeEventListener("pointerup", onUp)
                            }

                            window.addEventListener("pointermove", onMove)
                            window.addEventListener("pointerup", onUp)
                          }
                        }}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{node.type}</span>
                          {locked && <span>Locked</span>}
                        </div>
                        <div
                          contentEditable={!locked}
                          suppressContentEditableWarning
                          className="flex-1 rounded-md bg-transparent text-sm outline-none"
                          onInput={(event) => {
                            if (locked) return
                            const value = event.currentTarget.textContent ?? ""
                            handleNodeTextChange(node.id, value)
                          }}
                        >
                          {node.text}
                        </div>
                      </div>
                    )
                  })}
                  {Object.entries(cursors).map(([id, cursor]) => (
                    <div
                      key={id}
                      className="absolute flex items-center gap-2 text-xs"
                      style={{ left: cursor.x, top: cursor.y }}
                    >
                      <span className="size-2 rounded-full bg-muted-foreground" />
                      <span className="rounded-full bg-background/80 px-2 py-0.5 text-muted-foreground">
                        {cursor.name || "Guest"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{nodes.length} nodes</span>
              <span>Zoom {Math.round(camera.scale * 100)}%</span>
            </CardFooter>
          </Card>

          <Card className="flex flex-col border-border/80">
            <CardHeader>
              <CardTitle>Session Control</CardTitle>
              <CardDescription>
                Task board, event log, and permissions.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-6">
              <Tabs defaultValue="tasks" className="flex flex-1 flex-col gap-4">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="events">Events</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                </TabsList>

                <TabsContent value="tasks" className="flex flex-col gap-4">
                  <div className="rounded-lg border border-border/70">
                    <Table>
                      <TableHeader>
                        {taskTable.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead key={header.id}>
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {taskTable.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        {taskTable.getRowModel().rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={taskColumns.length}>
                              <span className="text-muted-foreground">
                                No action items yet.
                              </span>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="events" className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
                    {events
                      .slice(-12)
                      .reverse()
                      .map((event) => (
                        <div key={event.id} className="text-xs text-muted-foreground">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              {event.type}
                            </span>
                            <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {event.nodeId && <span>Node {event.nodeId.slice(0, 6)}</span>}
                            {event.authorId && (
                              <span>by {event.authorId.slice(0, 6)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </TabsContent>

                <TabsContent value="access" className="flex flex-col gap-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Role</FieldLabel>
                      <FieldContent>
                        <ToggleGroup
                          type="single"
                          value={role}
                          onValueChange={(value) =>
                            value && setRole(value as Role)
                          }
                          variant="outline"
                          spacing="sm"
                        >
                          <ToggleGroupItem value="viewer">Viewer</ToggleGroupItem>
                          <ToggleGroupItem value="contributor">
                            Contributor
                          </ToggleGroupItem>
                          <ToggleGroupItem value="lead">Lead</ToggleGroupItem>
                        </ToggleGroup>
                      </FieldContent>
                      <FieldDescription>
                        Controls the minimum access you have on this session.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>

                  <Separator />

                  <FieldGroup>
                    <Field>
                      <FieldLabel>Selected Node</FieldLabel>
                      <FieldContent>
                        <div className="rounded-md border border-border/70 p-3 text-xs text-muted-foreground">
                          {selectedNode ? (
                            <div className="flex flex-col gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {selectedNode.text || "Untitled"}
                              </span>
                              <span>Type: {selectedNode.type}</span>
                              <span>
                                Locked to: {selectedNodeRole ?? "viewer"}
                              </span>
                              <ToggleGroup
                                type="single"
                                value={selectedNodeRole ?? "viewer"}
                                onValueChange={(value) =>
                                  value &&
                                  handlePermissionChange(
                                    selectedNode.id,
                                    value as Role
                                  )
                                }
                                variant="outline"
                                spacing="sm"
                                size="sm"
                              >
                                <ToggleGroupItem value="viewer">
                                  Viewer
                                </ToggleGroupItem>
                                <ToggleGroupItem value="contributor">
                                  Contributor
                                </ToggleGroupItem>
                                <ToggleGroupItem value="lead">Lead</ToggleGroupItem>
                              </ToggleGroup>
                            </div>
                          ) : (
                            <span>Select a node to manage access.</span>
                          )}
                        </div>
                      </FieldContent>
                    </Field>
                  </FieldGroup>
                </TabsContent>
              </Tabs>

              <Separator />

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  drawForm.handleSubmit()
                }}
                className="flex flex-col gap-4"
              >
                <FieldGroup>
                  <drawForm.Field
                    name="noteText"
                    validators={{
                      onChange: ({ value }) =>
                        value.trim().length === 0
                          ? "Note text is required"
                          : undefined,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor="noteText">Quick Note</FieldLabel>
                        <FieldContent>
                          <Textarea
                            id="noteText"
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            placeholder="Capture a thought and drop it on canvas."
                            aria-invalid={field.state.meta.errors.length > 0}
                          />
                        </FieldContent>
                        <FieldError
                          errors={field.state.meta.errors.map((error) => ({
                            message:
                              typeof error === "string"
                                ? error
                                : error?.message,
                          }))}
                        />
                      </Field>
                    )}
                  </drawForm.Field>

                  <drawForm.Field name="minRole">
                    {(field) => (
                      <Field>
                        <FieldLabel>Minimum Role</FieldLabel>
                        <FieldContent>
                          <ToggleGroup
                            type="single"
                            value={field.state.value}
                            onValueChange={(value) =>
                              value && field.handleChange(value as Role)
                            }
                            variant="outline"
                            size="sm"
                            spacing="sm"
                          >
                            <ToggleGroupItem value="viewer">Viewer</ToggleGroupItem>
                            <ToggleGroupItem value="contributor">
                              Contributor
                            </ToggleGroupItem>
                            <ToggleGroupItem value="lead">Lead</ToggleGroupItem>
                          </ToggleGroup>
                        </FieldContent>
                        <FieldDescription>
                          Locks the note to users at or above this role.
                        </FieldDescription>
                      </Field>
                    )}
                  </drawForm.Field>
                </FieldGroup>

                <drawForm.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                >
                  {([canSubmit, isSubmitting]) => (
                    <Button type="submit" disabled={!canSubmit}>
                      {isSubmitting ? "Creating..." : "Drop Note"}
                    </Button>
                  )}
                </drawForm.Subscribe>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
