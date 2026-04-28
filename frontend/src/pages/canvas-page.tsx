import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useCanvasStore } from "@/stores/canvas-store";
import { api } from "@/lib/api";
import CanvasEngine from "@/components/canvas/canvas-engine";
import CursorOverlay from "@/components/canvas/cursor-overlay";
import TaskBoard from "@/components/task-board";
import EventLog from "@/components/event-log";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { initCanvas, disconnect, connected, tasks } = useCanvasStore();
  const [canvasName, setCanvasName] = useState("");
  const [sidebarTab, setSidebarTab] = useState("tasks");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!id || !user) return;

    // Load canvas info
    api.canvas.get(id).then((data) => {
      setCanvasName(data.canvas?.name || "Untitled");
    });

    // Load existing tasks
    api.canvas.tasks(id).then((t) => {
      useCanvasStore.setState({ tasks: t });
    });

    // Connect WebSocket
    initCanvas(id, user.id, user.name);

    return () => disconnect();
  }, [id, user]);

  return (
    <div className="flex h-svh flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <span className="text-sm font-medium">{canvasName}</span>
          {connected && (
            <span className="inline-block size-2 rounded-full bg-emerald-500" title="Connected" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? "Hide panel" : "Show panel"}
          </Button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="relative flex-1">
          <CanvasEngine />
          <CursorOverlay />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-72 shrink-0 border-l border-border bg-card">
            <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex h-full flex-col">
              <TabsList className="mx-2 mt-2 grid w-auto grid-cols-2">
                <TabsTrigger value="tasks" className="text-xs">
                  Tasks {tasks.length > 0 && `(${tasks.length})`}
                </TabsTrigger>
                <TabsTrigger value="events" className="text-xs">
                  Events
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tasks" className="flex-1 overflow-hidden mt-0">
                <TaskBoard />
              </TabsContent>
              <TabsContent value="events" className="flex-1 overflow-hidden mt-0">
                <EventLog />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
